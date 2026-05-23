// One-shot bulk reparse: fix empty-body emails across all bookings for a tour.
// Calls reparse logic directly — not via HTTP — to avoid per-request timeout stacking.
// Usage: POST /api/bulk-reparse { tour_name: "FoSA Apr 27", dry_run: true }
// Delete after use.

import { list, put } from '@vercel/blob';
import { getGmailToken, gmailApi } from './_gmail.js';
import { zohoApi } from './_zoho.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { tour_name, dry_run } = req.body || {};
  if (!tour_name) return res.status(400).json({ error: 'tour_name required' });

  const t0 = Date.now();
  const DEADLINE = 50000; // 50s hard stop

  // 1. Fetch bookings for this tour
  const tourQuery = encodeURIComponent('(Tour.Name:equals:' + tour_name + ')');
  const bkResult = await zohoApi('GET', 'Lodge_Bookings/search?criteria=' + tourQuery + '&fields=id,Name&per_page=200');
  const bookings = (bkResult && bkResult.data) || [];

  const results = [];
  let fixed = 0, skipped = 0, errors = 0;

  const token = await getGmailToken();

  for (const bk of bookings) {
    if (Date.now() - t0 > DEADLINE) { results.push({ status: 'timeout' }); break; }

    const bookingId = bk.id;
    try {
      // List blobs for this booking
      const blobs = await list({ prefix: 'emails/booking/' + bookingId + '/' });
      for (const blob of blobs.blobs) {
        if (Date.now() - t0 > DEADLINE) break;

        const r = await fetch(blob.url);
        const email = await r.json();

        const hasBody = !!(email.body && email.body.trim()) || !!(email.email_content && email.email_content.trim());
        if (hasBody) { skipped++; continue; }

        // Empty body — re-fetch from Gmail
        const gmailMsgId = email.gmail_message_id || email.message_id;
        if (!gmailMsgId) { skipped++; continue; }

        try {
          const fullMsg = await gmailApi(token, 'messages/' + gmailMsgId + '?format=full');
          if (!fullMsg || !fullMsg.payload) { errors++; continue; }

          // Extract body
          let textPlain = '', textHtml = '';
          function walkBody(part) {
            if (!part) return;
            if (part.mimeType === 'text/plain' && part.body && part.body.data && !textPlain) {
              const p = part.body.data.replace(/-/g, '+').replace(/_/g, '/');
              textPlain = Buffer.from(p, 'base64').toString('utf-8');
            }
            if (part.mimeType === 'text/html' && part.body && part.body.data && !textHtml) {
              const p2 = part.body.data.replace(/-/g, '+').replace(/_/g, '/');
              textHtml = Buffer.from(p2, 'base64').toString('utf-8');
            }
            if (part.parts) part.parts.forEach(walkBody);
          }
          walkBody(fullMsg.payload);
          const body = textPlain || textHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

          // Extract attachments
          const freshAttachments = [];
          function walkAtts(parts) {
            if (!parts) return;
            for (const part of parts) {
              if (part.filename && part.filename.length > 0) {
                freshAttachments.push({
                  filename: part.filename,
                  mimeType: part.mimeType || '',
                  size: part.body ? part.body.size || 0 : 0,
                  attachmentId: part.body ? part.body.attachmentId || null : null,
                });
              }
              if (part.parts) walkAtts(part.parts);
            }
          }
          walkAtts(fullMsg.payload.parts || []);

          results.push({
            booking: bk.Name,
            blob: blob.pathname,
            body_len: body.length,
            attachments: freshAttachments.map(a => a.filename),
            dry_run: !!dry_run,
          });

          if (!dry_run && body) {
            email.body = body;
            email.email_content = body;
            if (freshAttachments.length > 0) email.attachments = freshAttachments;
            const safeId = (email.message_id || email.id || '').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
            await put('emails/booking/' + bookingId + '/' + safeId + '.json',
              JSON.stringify(email), { access: 'public', contentType: 'application/json', addRandomSuffix: false });
            fixed++;
          }
        } catch (e) {
          results.push({ booking: bk.Name, error: e.message });
          errors++;
        }
      }
    } catch (e) {
      results.push({ booking: bk.Name, error: e.message });
      errors++;
    }
  }

  res.json({
    tour: tour_name,
    bookings_checked: bookings.length,
    fixed,
    skipped,
    errors,
    elapsed_ms: Date.now() - t0,
    results,
  });
}
