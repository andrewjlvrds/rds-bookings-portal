import { put, del, list } from '@vercel/blob';
import { reassignEmailLinks } from './_activity-log.js';
import { zohoApi } from './_zoho.js';
import { getGmailToken, gmailApi } from './_gmail.js';
import { safeMessageIdKey, normalizeMessageId } from './_email-store.js';

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

    // 1. Find the source blob — try exact path first, then prefix search.
    let sourceBlob = null;
    const exactResult = await list({ prefix: sourcePath, limit: 1 });
    if (exactResult.blobs && exactResult.blobs.length > 0) {
      sourceBlob = exactResult.blobs[0];
    } else {
      // Fallback: strip .json and search by prefix (handles safeId vs raw id mismatch)
      const pathWithoutExt = sourcePath.replace(/\.json$/, '');
      const prefixResult = await list({ prefix: pathWithoutExt, limit: 1 });
      if (prefixResult.blobs && prefixResult.blobs.length > 0) {
        sourceBlob = prefixResult.blobs[0];
      }
    }
    if (!sourceBlob) {
      return res.status(404).json({ error: 'source blob not found' });
    }

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
      allowOverwrite: true,
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


    // 5b. Anchor repair — the fix for thread poisoning (Jul 2026).
    //
    // Tier 0 / 0.5 matching trusts the sent-index: one wrong entry and every
    // future reply in the thread chains onto the wrong booking via
    // message_id_header / thread_backfill (Chipata->Thornicroft, Pioneer->
    // Drostdy Jan27). A manual reroute is ground truth, so use it to rewrite
    // the index for this thread:
    //   - overwrite (or create) the thread-key entry -> Tier 0.5 now correct
    //   - walk the Gmail thread, and for every message whose Message-ID has
    //     an existing sent-index entry, point it at the corrected booking ->
    //     Tier 0 now correct (References chains never leave the thread, so
    //     this covers every id a future reply can cite)
    // Only pre-existing Message-ID entries are rewritten; we never invent new
    // ones. Failures are non-fatal — the reroute itself already succeeded.
    const anchorRepair = { thread_index: false, message_ids_repaired: 0 };
    const threadId = record.gmail_thread_id || null;
    if (threadId) {
      const stampISO = new Date().toISOString();
      const indexOpts = {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
      };
      // Thread-key entry — write unconditionally: even a thread with no prior
      // portal-sent mail now Tier-0.5 matches to the corrected booking.
      try {
        const threadKeyPath = 'emails/sent-index/thread-' + threadId + '.json';
        let threadRec = {
          gmail_thread_id: threadId,
          rfc_message_id: record.rfc_message_id || null,
          to: record.to || record.email_to || null,
          subject: record.subject || record.email_subject || null,
        };
        try {
          const existing = await list({ prefix: threadKeyPath, limit: 1 });
          if (existing.blobs && existing.blobs.length > 0) {
            const rr = await fetch(existing.blobs[0].url, { cache: 'no-store' });
            if (rr.ok) threadRec = await rr.json();
          }
        } catch (e) { /* start fresh */ }
        threadRec.booking_ids = [bookingId];
        threadRec.corrected = true;
        threadRec.corrected_at = stampISO;
        threadRec.corrected_from = oldBookingId || null;
        await put(threadKeyPath, JSON.stringify(threadRec), indexOpts);
        anchorRepair.thread_index = true;
      } catch (tErr) {
        anchorRepair.thread_index_error = tErr.message;
        console.error('email-route: thread-index repair failed:', tErr.message);
      }
      // Message-ID entries — walk the live Gmail thread.
      try {
        const token = await getGmailToken();
        const thread = await gmailApi(token,
          'threads/' + threadId + '?format=metadata&metadataHeaders=Message-ID');
        for (const m of (thread.messages || [])) {
          const hdrs = (m.payload && m.payload.headers) || [];
          const h = hdrs.find(x => (x.name || '').toLowerCase() === 'message-id');
          if (!h || !h.value) continue;
          const key = safeMessageIdKey(h.value);
          if (!key) continue;
          const idxPath = 'emails/sent-index/' + key + '.json';
          try {
            const ex = await list({ prefix: idxPath, limit: 1 });
            if (!ex.blobs || ex.blobs.length === 0) continue;
            let idxRec = {};
            try {
              const rr2 = await fetch(ex.blobs[0].url, { cache: 'no-store' });
              if (rr2.ok) idxRec = await rr2.json();
            } catch (e) { /* rewrite minimal */ }
            if (Array.isArray(idxRec.booking_ids) &&
                idxRec.booking_ids.length === 1 &&
                idxRec.booking_ids[0] === bookingId) continue; // already correct
            idxRec.booking_ids = [bookingId];
            idxRec.corrected = true;
            idxRec.corrected_at = stampISO;
            idxRec.corrected_from = oldBookingId || null;
            await put(idxPath, JSON.stringify(idxRec), indexOpts);
            anchorRepair.message_ids_repaired++;
          } catch (oneErr) {
            console.error('email-route: message-id repair failed for', key, oneErr.message);
          }
        }
  
      // Candidate-based repair — the precise kill. The thread walk above
      // assumes the poisoned entries are keyed by Message-IDs inside this
      // Gmail thread; in practice References can cite ids the walk misses.
      // Fetch the routed message's own In-Reply-To + References and repair
      // every existing sent-index entry those candidates point at — the
      // exact set Tier 0 would consult for a reply to this message's thread.
      try {
        if (record.gmail_message_id) {
          const token2 = await getGmailToken();
          const liveMsg = await gmailApi(token2,
            'messages/' + record.gmail_message_id +
            '?format=metadata&metadataHeaders=In-Reply-To&metadataHeaders=References&metadataHeaders=Message-ID');
          const lh = {};
          for (const h of ((liveMsg.payload && liveMsg.payload.headers) || [])) {
            lh[(h.name || '').toLowerCase()] = h.value;
          }
          const cands = [];
          if (lh['in-reply-to']) cands.push(normalizeMessageId(lh['in-reply-to']));
          if (lh['references']) {
            for (const rf of lh['references'].split(/\s+/)) {
              const nn = normalizeMessageId(rf);
              if (nn && !cands.includes(nn)) cands.push(nn);
            }
          }
          if (lh['message-id']) {
            const own = normalizeMessageId(lh['message-id']);
            if (own && !cands.includes(own)) cands.push(own);
          }
          for (const cid of cands) {
            const key2 = safeMessageIdKey(cid);
            if (!key2) continue;
            const idxPath2 = 'emails/sent-index/' + key2 + '.json';
            try {
              const ex3 = await list({ prefix: idxPath2, limit: 1 });
              if (!ex3.blobs || ex3.blobs.length === 0) continue;
              let idxRec2 = {};
              try {
                const rr3 = await fetch(ex3.blobs[0].url, { cache: 'no-store' });
                if (rr3.ok) idxRec2 = await rr3.json();
              } catch (e) { /* rewrite minimal */ }
              if (Array.isArray(idxRec2.booking_ids) &&
                  idxRec2.booking_ids.length === 1 &&
                  idxRec2.booking_ids[0] === bookingId) continue;
              idxRec2.booking_ids = [bookingId];
              idxRec2.corrected = true;
              idxRec2.corrected_at = stampISO;
              idxRec2.corrected_from = oldBookingId || null;
              await put(idxPath2, JSON.stringify(idxRec2), indexOpts);
              anchorRepair.message_ids_repaired++;
            } catch (candErr) {
              console.error('email-route: candidate repair failed for', key2, candErr.message);
            }
          }
        }
      } catch (cErr) {
        anchorRepair.candidate_error = cErr.message;
        console.error('email-route: candidate-based repair failed:', cErr.message);
      }
    } catch (gErr) {
        anchorRepair.gmail_error = gErr.message;
        console.error('email-route: gmail thread walk failed:', gErr.message);
  
      // Candidate-based repair — the precise kill. The thread walk above
      // assumes the poisoned entries are keyed by Message-IDs inside this
      // Gmail thread; in practice References can cite ids the walk misses.
      // Fetch the routed message's own In-Reply-To + References and repair
      // every existing sent-index entry those candidates point at — the
      // exact set Tier 0 would consult for a reply to this message's thread.
      try {
        if (record.gmail_message_id) {
          const token2 = await getGmailToken();
          const liveMsg = await gmailApi(token2,
            'messages/' + record.gmail_message_id +
            '?format=metadata&metadataHeaders=In-Reply-To&metadataHeaders=References&metadataHeaders=Message-ID');
          const lh = {};
          for (const h of ((liveMsg.payload && liveMsg.payload.headers) || [])) {
            lh[(h.name || '').toLowerCase()] = h.value;
          }
          const cands = [];
          if (lh['in-reply-to']) cands.push(normalizeMessageId(lh['in-reply-to']));
          if (lh['references']) {
            for (const rf of lh['references'].split(/\s+/)) {
              const nn = normalizeMessageId(rf);
              if (nn && !cands.includes(nn)) cands.push(nn);
            }
          }
          if (lh['message-id']) {
            const own = normalizeMessageId(lh['message-id']);
            if (own && !cands.includes(own)) cands.push(own);
          }
          for (const cid of cands) {
            const key2 = safeMessageIdKey(cid);
            if (!key2) continue;
            const idxPath2 = 'emails/sent-index/' + key2 + '.json';
            try {
              const ex3 = await list({ prefix: idxPath2, limit: 1 });
              if (!ex3.blobs || ex3.blobs.length === 0) continue;
              let idxRec2 = {};
              try {
                const rr3 = await fetch(ex3.blobs[0].url, { cache: 'no-store' });
                if (rr3.ok) idxRec2 = await rr3.json();
              } catch (e) { /* rewrite minimal */ }
              if (Array.isArray(idxRec2.booking_ids) &&
                  idxRec2.booking_ids.length === 1 &&
                  idxRec2.booking_ids[0] === bookingId) continue;
              idxRec2.booking_ids = [bookingId];
              idxRec2.corrected = true;
              idxRec2.corrected_at = stampISO;
              idxRec2.corrected_from = oldBookingId || null;
              await put(idxPath2, JSON.stringify(idxRec2), indexOpts);
              anchorRepair.message_ids_repaired++;
            } catch (candErr) {
              console.error('email-route: candidate repair failed for', key2, candErr.message);
            }
          }
        }
      } catch (cErr) {
        anchorRepair.candidate_error = cErr.message;
        console.error('email-route: candidate-based repair failed:', cErr.message);
      }
    }

      // Candidate-based repair — the precise kill. The thread walk above
      // assumes the poisoned entries are keyed by Message-IDs inside this
      // Gmail thread; in practice References can cite ids the walk misses.
      // Fetch the routed message's own In-Reply-To + References and repair
      // every existing sent-index entry those candidates point at — the
      // exact set Tier 0 would consult for a reply to this message's thread.
      try {
        if (record.gmail_message_id) {
          const token2 = await getGmailToken();
          const liveMsg = await gmailApi(token2,
            'messages/' + record.gmail_message_id +
            '?format=metadata&metadataHeaders=In-Reply-To&metadataHeaders=References&metadataHeaders=Message-ID');
          const lh = {};
          for (const h of ((liveMsg.payload && liveMsg.payload.headers) || [])) {
            lh[(h.name || '').toLowerCase()] = h.value;
          }
          const cands = [];
          if (lh['in-reply-to']) cands.push(normalizeMessageId(lh['in-reply-to']));
          if (lh['references']) {
            for (const rf of lh['references'].split(/\s+/)) {
              const nn = normalizeMessageId(rf);
              if (nn && !cands.includes(nn)) cands.push(nn);
            }
          }
          if (lh['message-id']) {
            const own = normalizeMessageId(lh['message-id']);
            if (own && !cands.includes(own)) cands.push(own);
          }
          for (const cid of cands) {
            const key2 = safeMessageIdKey(cid);
            if (!key2) continue;
            const idxPath2 = 'emails/sent-index/' + key2 + '.json';
            try {
              const ex3 = await list({ prefix: idxPath2, limit: 1 });
              if (!ex3.blobs || ex3.blobs.length === 0) continue;
              let idxRec2 = {};
              try {
                const rr3 = await fetch(ex3.blobs[0].url, { cache: 'no-store' });
                if (rr3.ok) idxRec2 = await rr3.json();
              } catch (e) { /* rewrite minimal */ }
              if (Array.isArray(idxRec2.booking_ids) &&
                  idxRec2.booking_ids.length === 1 &&
                  idxRec2.booking_ids[0] === bookingId) continue;
              idxRec2.booking_ids = [bookingId];
              idxRec2.corrected = true;
              idxRec2.corrected_at = stampISO;
              idxRec2.corrected_from = oldBookingId || null;
              await put(idxPath2, JSON.stringify(idxRec2), indexOpts);
              anchorRepair.message_ids_repaired++;
            } catch (candErr) {
              console.error('email-route: candidate repair failed for', key2, candErr.message);
            }
          }
        }
      } catch (cErr) {
        anchorRepair.candidate_error = cErr.message;
        console.error('email-route: candidate-based repair failed:', cErr.message);
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
          const lodgeResult = await zohoApi('GET', 'CustomModule5/' + lodgeId + '?fields=id,Name,Email,Preferred_Email,Email_Reservations_2,Secondary_Email,Email_4,Email_Accounts');
          const lodge = lodgeResult?.data;
          if (lodge) {
            const allEmailFields = [
              { field: 'Preferred_Email', value: lodge.Preferred_Email },
              { field: 'Email_Reservations_2', value: lodge.Email_Reservations_2 },
              { field: 'Secondary_Email', value: lodge.Secondary_Email },
              { field: 'Email_4', value: lodge.Email_4 },
              { field: 'Email_Accounts', value: lodge.Email_Accounts },
            ];
            const existingEmails = [lodge.Email, ...allEmailFields.map(f => f.value)]
              .filter(Boolean).map(e => e.toLowerCase().trim());

            if (!existingEmails.includes(senderAddr)) {
              // Find first empty slot
              const emptySlot = allEmailFields.find(f => !f.value);
              if (emptySlot) {
                const update = { id: lodgeId };
                update[emptySlot.field] = senderAddr;
                await zohoApi('PUT', 'CustomModule5', { data: [update] });
                emailAdded = true;
                console.log('Auto-added email', senderAddr, 'to lodge', lodge.Name, 'field', emptySlot.field);
              } else {
                console.log('Lodge', lodge.Name, 'has no empty email slots — new sender', senderAddr, 'needs manual review');
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
      anchor_repair: anchorRepair,
    });
  } catch (err) {
    console.error('email-route error:', err);
    return res.status(500).json({ error: err.message });
  }
}
