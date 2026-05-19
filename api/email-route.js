import { put, del, list } from '@vercel/blob';
import { reassignEmailLinks } from './_activity-log.js';
import { zohoApi } from './_zoho.js';

/*
 * /api/email-route
 *
 *   POST { source_path, booking_id }
 *
 *     source_path: blob path under emails/unmatched/, emails/tour-bucket/,
 *                  or emails/booking/{id}/ (for reassignments)
 *     booking_id:  Zoho Lodge_Booking record ID to route the email to
 *
 * Reads the blob, rewrites with booking_id set, writes to
 * 'emails/booking/{booking_id}/{safeId}.json', deletes the original.
 *
 * Three modes:
 *   1. Unmatched   → booking   (initial routing)
 *   2. Tour-bucket → booking   (initial routing)
 *   3. Booking A   → Booking B (reassignment / fixing a misroute)
 *
 * For mode 3, also walks the activity log and updates any entries
 * that reference this email's id, swapping booking_ids[A] for
 * booking_ids[B], so the log doesn't lie about which booking
 * received the outbound or reply.
 *
 * Move semantics: dest write happens before source delete. If the
 * delete fails the email exists in two places — visible duplicate,
 * easy to spot, no data loss.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const body = req.body || {};
    const sourcePath = body.source_path;
    const bookingId = body.booking_id;

    if (!sourcePath) return res.status(400).json({ error: 'source_path required' });
    if (!bookingId) return res.status(400).json({ error: 'booking_id required' });

    // Validate source path — three valid prefixes.
    const validPrefixes = ['emails/unmatched/', 'emails/tour-bucket/', 'emails/booking/'];
    if (!validPrefixes.some(p => sourcePath.startsWith(p))) {
      return res.status(400).json({
        error: 'source_path must start with emails/unmatched/, emails/tour-bucket/, or emails/booking/',
      });
    }

    // Detect reassignment (booking → booking) vs initial routing.
    const isReassignment = sourcePath.startsWith('emails/booking/');
    let oldBookingId = null;
    if (isReassignment) {
      // emails/booking/{old_id}/{safeId}.json
      const parts = sourcePath.split('/');
      if (parts.length >= 3) oldBookingId = parts[2];
      if (oldBookingId === bookingId) {
        return res.status(400).json({ error: 'source and destination booking are the same' });
      }
    }

    // 1. Find the source blob.
    const result = await list({ prefix: sourcePath, limit: 1 });
    if (!result.blobs || result.blobs.length === 0) {
      return res.status(404).json({ error: 'source blob not found' });
    }
    const sourceBlob = result.blobs[0];

    // 2. Read its content.
    const r = await fetch(sourceBlob.url, { cache: 'no-store' });
    if (!r.ok) return res.status(500).json({ error: 'failed to read source blob' });
    const record = await r.json();

    // 3. Update the record's booking_id and write to the new path.
    record.booking_id = bookingId;
    const reroutedTag = isReassignment ? 'manual_reassign' : 'manual_route';
    record.match_method = (record.match_method || '') + (record.match_method ? '+' + reroutedTag : reroutedTag);
    record.routed_at = new Date().toISOString();
    record.routed_from = sourcePath;
    if (oldBookingId) record.previous_booking_id = oldBookingId;

    const safeId = record.id || sourceBlob.pathname.split('/').pop().replace(/\.json$/, '');
    const destPath = 'emails/booking/' + bookingId + '/' + safeId + '.json';

    await put(destPath, JSON.stringify(record), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
    });

    // 4. Delete the original. Non-fatal if it fails — dest write
    //    succeeded so we don't lose the email.
    let deleteError = null;
    try {
      await del(sourceBlob.url);
    } catch (e) {
      deleteError = e.message;
      console.error('email-route: delete failed for', sourceBlob.url, e.message);
    }

    // 5. For reassignments, update the activity log so it doesn't
    //    point to the wrong booking.
    let logEntriesUpdated = 0;
    if (isReassignment && record.id) {
      try {
        const updated = await reassignEmailLinks(record.id, oldBookingId, bookingId);
        logEntriesUpdated = updated.length;
      } catch (logErr) {
        console.error('email-route: activity log update failed:', logErr.message);
      }
    }

    // 6. Auto-add sender email to lodge record if not already registered.
    // When Helen manually routes an email, we learn which lodge it came from.
    // Add the sender address to Email_Reservations_2 so future emails auto-match.
    let emailAdded = false;
    try {
      const senderEmail = (record.from || record.email_from || '').match(/<([^>]+)>/);
      const senderAddr = senderEmail ? senderEmail[1].toLowerCase().trim() : 
        ((record.from || record.email_from || '').indexOf('@') > -1 ? (record.from || record.email_from || '').toLowerCase().trim() : '');

      if (senderAddr && !senderAddr.includes('ridedownsouth.com')) {
        // Find the booking to get the lodge ID
        const bkResult = await zohoApi('GET', 'Lodge_Bookings/' + bookingId + '?fields=id,Lodge,Lodge_Name');
        const lodgeId = bkResult?.data?.Lodge?.id;

        if (lodgeId) {
          // Fetch lodge record to check existing emails
          const lodgeResult = await zohoApi('GET', 'CustomModule5/' + lodgeId + '?fields=id,Name,Email,Preferred_Email,Email_Reservations_2');
          const lodge = lodgeResult?.data;
          if (lodge) {
            const existingEmails = [lodge.Email, lodge.Preferred_Email, lodge.Email_Reservations_2]
              .filter(Boolean).map(e => e.toLowerCase().trim());
            
            if (!existingEmails.includes(senderAddr)) {
              // Add to Email_Reservations_2 if empty, otherwise log for manual review
              if (!lodge.Email_Reservations_2) {
                await zohoApi('PUT', 'CustomModule5', { data: [{ id: lodgeId, Email_Reservations_2: senderAddr }] });
                emailAdded = true;
                console.log('Auto-added email', senderAddr, 'to lodge', lodge.Name);
              } else {
                console.log('Lodge', lodge.Name, 'already has Email_Reservations_2 set — new sender', senderAddr, 'needs manual review');
              }
            }
          }
        }
      }
    } catch (emailErr) {
      console.error('email-route: auto-add sender email failed:', emailErr.message);
    }

    return res.status(200).json({
      success: true,
      mode: isReassignment ? 'reassign' : 'initial_route',
      from: sourcePath,
      to: destPath,
      previous_booking_id: oldBookingId,
      delete_error: deleteError,
      log_entries_updated: logEntriesUpdated,
      sender_email_added: emailAdded,
    });
  } catch (err) {
    console.error('email-route error:', err);
    return res.status(500).json({ error: err.message });
  }
}
