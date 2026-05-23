import { list, put } from '@vercel/blob';
import { getGmailToken, gmailApi } from './_gmail.js';
import { zohoApi } from './_zoho.js';

function decodeB64(str) {
  if (!str) return '';
  try {
    const padded = str.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(padded, 'base64').toString('utf-8');
  } catch(e) { return ''; }
}

function extractBody(payload) {
  if (!payload) return '';
  let plain = '', html = '';
  const walk = (part) => {
    if (!part) return;
    if (part.mimeType === 'text/plain' && part.body && part.body.data && !plain) plain = decodeB64(part.body.data);
    if (part.mimeType === 'text/html' && part.body && part.body.data && !html) html = decodeB64(part.body.data);
    if (part.parts) part.parts.forEach(walk);
  };
  walk(payload);
  return plain || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractAttachments(payload) {
  const atts = [];
  const walk = (parts) => {
    if (!parts) return;
    for (const part of parts) {
      if (part.filename && part.filename.length > 0) {
        atts.push({ filename: part.filename, mimeType: part.mimeType || '', size: part.body ? part.body.size || 0 : 0, attachmentId: part.body ? part.body.attachmentId || null : null });
      }
      if (part.parts) walk(part.parts);
    }
  };
  walk(payload.parts || []);
  return atts;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    const body = req.body || {};
    const tour_name = body.tour_name;
    const dry_run = !!body.dry_run;
    if (!tour_name) return res.status(400).json({ error: 'tour_name required' });

    const t0 = Date.now();
    const DEADLINE = 50000;

    // Fetch all bookings and filter by tour name client-side (Zoho search doesn't support Tour.Name criteria)
    let allBookings = [], bkPage = 1, bkMore = true;
    while (bkMore && bkPage <= 5) {
      const bkResult = await zohoApi('GET', 'Lodge_Bookings?fields=id,Name,Tour&per_page=200&page=' + bkPage);
      const bkData = (bkResult && bkResult.data) || [];
      allBookings = allBookings.concat(bkData);
      bkMore = bkResult && bkResult.info && bkResult.info.more_records;
      bkPage++;
    }
    const bookings = allBookings.filter(bk => {
      const t = bk.Tour && typeof bk.Tour === 'object' ? bk.Tour.name : bk.Tour || '';
      return t === tour_name;
    });

    const token = await getGmailToken();
    const results = [];
    let fixed = 0, skipped = 0, errors = 0;

    for (const bk of bookings) {
      if (Date.now() - t0 > DEADLINE) { results.push('timeout'); break; }
      try {
        const blobs = await list({ prefix: 'emails/booking/' + bk.id + '/' });
        for (const blob of blobs.blobs) {
          if (Date.now() - t0 > DEADLINE) break;
          const r = await fetch(blob.url);
          const email = await r.json();
          const hasBody = !!(email.body && email.body.trim()) || !!(email.email_content && email.email_content.trim());
          if (hasBody) { skipped++; continue; }

          const gmailMsgId = email.gmail_message_id || email.message_id;
          if (!gmailMsgId) { skipped++; continue; }

          try {
            const fullMsg = await gmailApi(token, 'messages/' + gmailMsgId + '?format=full');
            if (!fullMsg || !fullMsg.payload) { errors++; continue; }
            const newBody = extractBody(fullMsg.payload);
            const newAtts = extractAttachments(fullMsg.payload);
            results.push({ booking: bk.Name, blob: blob.pathname, body_len: newBody.length, attachments: newAtts.map(a => a.filename), dry_run });
            if (!dry_run && newBody) {
              email.body = newBody;
              email.email_content = newBody;
              if (newAtts.length > 0) email.attachments = newAtts;
              const safeId = (email.message_id || email.id || '').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
              await put('emails/booking/' + bk.id + '/' + safeId + '.json', JSON.stringify(email), { access: 'public', contentType: 'application/json', addRandomSuffix: false });
              fixed++;
            }
          } catch(e) { results.push({ booking: bk.Name, error: e.message }); errors++; }
        }
      } catch(e) { results.push({ booking: bk.Name, error: e.message }); errors++; }
    }

    return res.json({ tour: tour_name, bookings_checked: bookings.length, fixed, skipped, errors, elapsed_ms: Date.now() - t0, dry_run, results });
  } catch(e) {
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
}
