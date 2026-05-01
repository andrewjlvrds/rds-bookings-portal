import { put, del, list } from '@vercel/blob';

/*
 * /api/email-route
 *
 *   POST { source_path, booking_id }
 *
 *     source_path: 'emails/unmatched/abc.json' or 'emails/tour-bucket/foo/abc.json'
 *     booking_id:  Zoho Lodge_Booking record ID to route the email to
 *
 * Reads the blob, rewrites with booking_id set, writes to
 * 'emails/booking/{booking_id}/{safeId}.json', deletes the original.
 *
 * Move is the right choice (per Andrew): one source of truth per email.
 * If something fails between write and delete, worst case is the email
 * exists in two places — visible duplicate, easy to spot, no data loss.
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

    // Validate source path — only allow routing from these two prefixes.
    const validPrefixes = ['emails/unmatched/', 'emails/tour-bucket/'];
    if (!validPrefixes.some(p => sourcePath.startsWith(p))) {
      return res.status(400).json({ error: 'source_path must start with emails/unmatched/ or emails/tour-bucket/' });
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
    record.match_method = (record.match_method || '') + (record.match_method ? '+manual_route' : 'manual_route');
    record.routed_at = new Date().toISOString();
    record.routed_from = sourcePath;

    const safeId = record.id || sourceBlob.pathname.split('/').pop().replace(/\.json$/, '');
    const destPath = 'emails/booking/' + bookingId + '/' + safeId + '.json';

    await put(destPath, JSON.stringify(record), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
    });

    // 4. Delete the original. If this fails, dest write succeeded so
    //    we don't lose the email — there'll be a duplicate visible
    //    in both places, easy to clean up manually.
    let deleteError = null;
    try {
      await del(sourceBlob.url);
    } catch (e) {
      deleteError = e.message;
      console.error('email-route: delete failed for', sourceBlob.url, e.message);
    }

    return res.status(200).json({
      success: true,
      from: sourcePath,
      to: destPath,
      delete_error: deleteError,
    });
  } catch (err) {
    console.error('email-route error:', err);
    return res.status(500).json({ error: err.message });
  }
}
