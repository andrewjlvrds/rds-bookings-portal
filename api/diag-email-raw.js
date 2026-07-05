import { list } from '@vercel/blob';
import { getGmailToken, gmailApi } from './_gmail.js';
import { normalizeMessageId, safeMessageIdKey } from './_email-store.js';

/*
 * /api/diag-email-raw?gmail_message_id=XXX  → dumps the stored blob
 *                                              plus the live Gmail message
 * /api/diag-email-raw?subject_contains=XXX  → search blobs by subject
 * /api/diag-email-raw?booking_id=XXX        → list emails stored for that booking
 *
 * Diagnostic only — read-only, no writes. Used to check why a stored
 * email's body field is empty when the lodge clearly sent content.
 *
 * Compares: what we stored (the blob) vs what Gmail actually has (the
 * live message payload). If body in the blob is '' but the live Gmail
 * message has body.data on a text/plain or text/html part, the
 * extractor missed it. If the live message has body.attachmentId
 * instead of body.data, it's an attachmentId-route case.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    const { gmail_message_id, subject_contains, booking_id } = req.query;

    // List mode — find candidate blobs
    if (booking_id || subject_contains) {
      const prefix = booking_id ? 'emails/booking/' + booking_id + '/' : 'emails/';
      const allBlobs = [];
      let cursor;
      for (let i = 0; i < 5; i++) {
        const opts = { prefix };
        if (cursor) opts.cursor = cursor;
        const r = await list(opts);
        if (r.blobs) allBlobs.push(...r.blobs);
        if (!r.hasMore) break;
        cursor = r.cursor;
      }

      const fetched = [];
      for (let i = 0; i < Math.min(allBlobs.length, 50); i++) {
        try {
          const r = await fetch(allBlobs[i].url, { cache: 'no-store' });
          if (!r.ok) continue;
          const d = await r.json();
          if (subject_contains) {
            const s = (d.subject || d.email_subject || '').toLowerCase();
            if (!s.includes(subject_contains.toLowerCase())) continue;
          }
          fetched.push({
            blob_path: allBlobs[i].pathname,
            id: d.id,
            gmail_message_id: d.gmail_message_id,
            subject: d.subject || d.email_subject,
            from: d.from || d.email_from,
            direction: d.direction,
            date: d.date || d.email_date,
            body_length: (d.body || d.email_content || '').length,
            body_preview: (d.body || d.email_content || '').substring(0, 200),
            match_method: d.match_method,
            attachment_count: (d.attachments || []).length,
          });
        } catch (e) {
          /* skip */
        }
      }
      return res.status(200).json({
        success: true,
        mode: 'list',
        searched_blobs: allBlobs.length,
        results: fetched,
      });
    }

    if (!gmail_message_id) {
      return res.status(400).json({
        error: 'Provide gmail_message_id, or booking_id, or subject_contains',
        usage: {
          single: '/api/diag-email-raw?gmail_message_id=18b2c4...',
          search_by_subject: '/api/diag-email-raw?subject_contains=Papkuilsfontein',
          list_for_booking: '/api/diag-email-raw?booking_id=6543704000003400000',
        },
      });
    }

    // Single-message mode — find the stored blob for this Gmail message ID
    let blobMatch = null;
    let cursor;
    for (let i = 0; i < 8; i++) {
      const opts = { prefix: 'emails/' };
      if (cursor) opts.cursor = cursor;
      const r = await list(opts);
      for (const b of r.blobs || []) {
        try {
          const rr = await fetch(b.url, { cache: 'no-store' });
          if (!rr.ok) continue;
          const d = await rr.json();
          if (d.gmail_message_id === gmail_message_id || d.message_id === gmail_message_id) {
            blobMatch = { blob_path: b.pathname, blob: d };
            break;
          }
        } catch (e) {
          /* skip */
        }
      }
      if (blobMatch || !r.hasMore) break;
      cursor = r.cursor;
    }

    // Fetch the live Gmail message for comparison
    let liveGmail = null;
    let gmailError = null;
    try {
      const token = await getGmailToken();
      liveGmail = await gmailApi(token, 'messages/' + gmail_message_id + '?format=full');
    } catch (e) {
      gmailError = e.message;
    }

    // Summarise the live payload structure so we can see what the
    // extractor was working with
    const summarisePart = (part, depth = 0) => {
      if (!part || depth > 5) return null;
      return {
        mimeType: part.mimeType,
        filename: part.filename || null,
        body_size: part.body ? part.body.size : null,
        has_body_data: !!(part.body && part.body.data),
        has_attachment_id: !!(part.body && part.body.attachmentId),
        body_data_length: part.body && part.body.data ? part.body.data.length : 0,
        sub_parts: (part.parts || []).map(p => summarisePart(p, depth + 1)),
      };
    };

    const headers = {};
    if (liveGmail && liveGmail.payload && liveGmail.payload.headers) {
      for (const h of liveGmail.payload.headers) {
        const n = h.name.toLowerCase();
        if (['from', 'to', 'subject', 'date', 'message-id', 'content-type', 'in-reply-to', 'references'].includes(n)) {
          headers[n] = h.value;
        }
      }
    }


    // Sent-index probe — for each Message-ID this message could cite
    // (In-Reply-To + References, newest first, matching poll-gmail Tier 0),
    // report whether a sent-index entry exists and where it points.
    const sentIndexLookup = [];
    try {
      const candidates = [];
      if (headers['in-reply-to']) candidates.push(normalizeMessageId(headers['in-reply-to']));
      if (headers['references']) {
        for (const rf of headers['references'].split(/\s+/).reverse()) {
          const nn = normalizeMessageId(rf);
          if (nn && !candidates.includes(nn)) candidates.push(nn);
        }
      }
      for (const cid of candidates.slice(0, 15)) {
        const key = safeMessageIdKey(cid);
        if (!key) continue;
        const entry = { candidate: cid.substring(0, 60), key: key.substring(0, 60), exists: false };
        try {
          const ex = await list({ prefix: 'emails/sent-index/' + key + '.json', limit: 1 });
          if (ex.blobs && ex.blobs.length > 0) {
            entry.exists = true;
            const rr = await fetch(ex.blobs[0].url, { cache: 'no-store' });
            if (rr.ok) {
              const rec = await rr.json();
              entry.booking_ids = rec.booking_ids;
              entry.lodge_name = rec.lodge_name || null;
              entry.corrected = rec.corrected || false;
            }
          }
        } catch (e) { entry.error = e.message; }
        sentIndexLookup.push(entry);
      }
      // Thread-key entry too
      if (liveGmail && liveGmail.threadId) {
        const tk = { candidate: 'thread-' + liveGmail.threadId, exists: false };
        try {
          const ex2 = await list({ prefix: 'emails/sent-index/thread-' + liveGmail.threadId + '.json', limit: 1 });
          if (ex2.blobs && ex2.blobs.length > 0) {
            tk.exists = true;
            const rr2 = await fetch(ex2.blobs[0].url, { cache: 'no-store' });
            if (rr2.ok) {
              const rec2 = await rr2.json();
              tk.booking_ids = rec2.booking_ids;
              tk.corrected = rec2.corrected || false;
            }
          }
        } catch (e) { tk.error = e.message; }
        sentIndexLookup.push(tk);
      }
    } catch (probeErr) { /* diagnostic only */ }

    return res.status(200).json({
      success: true,
      mode: 'single',
      gmail_message_id,
      blob_found: !!blobMatch,
      sent_index_lookup: sentIndexLookup,
      blob_path: blobMatch ? blobMatch.blob_path : null,
      stored: blobMatch ? {
        id: blobMatch.blob.id,
        subject: blobMatch.blob.subject,
        from: blobMatch.blob.from,
        booking_id: blobMatch.blob.booking_id,
        match_method: blobMatch.blob.match_method,
        body_length: (blobMatch.blob.body || '').length,
        body_first_200: (blobMatch.blob.body || '').substring(0, 200),
        body_last_200: (blobMatch.blob.body || '').slice(-200),
        attachment_count: (blobMatch.blob.attachments || []).length,
      } : null,
      live_gmail: liveGmail ? {
        thread_id: liveGmail.threadId,
        label_ids: liveGmail.labelIds || [],
        snippet: liveGmail.snippet,
        headers,
        payload_structure: summarisePart(liveGmail.payload),
      } : null,
      gmail_error: gmailError,
    });
  } catch (err) {
    console.error('diag-email-raw error:', err);
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
}
