// ONE-SHOT: Move Pioneer blob to correct path, fetch Drostdy reply body from Gmail
// DELETE AFTER USE
import { list, put, del } from '@vercel/blob';
import { getGmailToken, gmailApi } from './_gmail.js';

const DROSTDY_ID = '6543704000010888021';
const PIONEER_ID = '6543704000003400210';

function decodeBase64Url(data) {
  if (!data) return '';
  const padded = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64').toString('utf-8');
}

function extractBody(payload) {
  if (!payload) return '';
  let textPlain = '', textHtml = '';
  function walk(part) {
    if (!part) return;
    if (part.mimeType === 'text/plain' && part.body && part.body.data && !textPlain)
      textPlain = decodeBase64Url(part.body.data);
    if (part.mimeType === 'text/html' && part.body && part.body.data && !textHtml)
      textHtml = decodeBase64Url(part.body.data);
    if (part.parts) part.parts.forEach(walk);
  }
  if (payload.mimeType === 'text/plain' && payload.body && payload.body.data)
    return decodeBase64Url(payload.body.data);
  walk(payload);
  if (textPlain) return textPlain;
  if (textHtml) return textHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return '';
}

export default async function handler(req, res) {
  const log = [], errors = [];
  const blobs = await list({ prefix: 'emails/booking/' + DROSTDY_ID + '/' });

  for (const blob of blobs.blobs) {
    const filename = blob.pathname.split('/').pop();
    const r = await fetch(blob.url);
    const data = await r.json();

    if (data.gmail_message_id === '19e68002e8a85265') {
      // Pioneer blob — move to correct path and delete from Drostdy
      await put('emails/booking/' + PIONEER_ID + '/' + filename, JSON.stringify(data), { access: 'public', addRandomSuffix: false });
      await del(blob.url);
      log.push('Moved Pioneer blob to correct path');
      continue;
    }

    // Drostdy reply — fetch body from Gmail
    if (!data.body || !data.body.trim() || data.body === '(no content)') {
      try {
        const token = await getGmailToken();
        const gmailId = data.gmail_message_id || data.message_id;
        log.push('Drostdy gmail_message_id: ' + gmailId);
        if (gmailId) {
          const msg = await gmailApi(token, 'messages/' + gmailId + '?format=full');
          if (msg && msg.payload) {
            const body = extractBody(msg.payload);
            log.push('Extracted body length: ' + body.length);
            if (body) {
              data.body = body;
              data.email_content = body;
              await put(blob.pathname, JSON.stringify(data), { access: 'public', addRandomSuffix: false });
              log.push('Updated Drostdy reply with body');
            } else {
              log.push('Body extraction returned empty — checking payload structure');
              log.push(JSON.stringify(Object.keys(msg.payload)));
            }
          }
        }
      } catch(e) { errors.push('Gmail fetch: ' + e.message); }
    }
  }

  res.status(200).json({ log, errors });
}
