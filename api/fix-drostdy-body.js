// ONE-SHOT: Search Gmail for Drostdy reply and write body to blob
// DELETE AFTER USE
import { list, put } from '@vercel/blob';
import { getGmailToken, gmailApi } from './_gmail.js';

const DROSTDY_ID = '6543704000010888021';

function decodeBase64Url(data) {
  if (!data) return '';
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
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

  // Find the Drostdy reply blob
  const blobs = await list({ prefix: 'emails/booking/' + DROSTDY_ID + '/' });
  const drostdyBlob = blobs.blobs.find(b => b.pathname.includes('19e68cee95d1f3c3'));
  if (!drostdyBlob) return res.status(200).json({ error: 'Drostdy blob not found', blobs: blobs.blobs.map(b=>b.pathname) });

  const r = await fetch(drostdyBlob.url);
  const data = await r.json();
  log.push('rfc_message_id: ' + data.rfc_message_id);

  // Search Gmail for the Drostdy reply by label
  const token = await getGmailToken();
  const query = 'label:eoa-jan-27-drostdy-hotel -from:bookings@ridedownsouth.com';
  const search = await gmailApi(token, 'messages?q=' + encodeURIComponent(query) + '&maxResults=5');
  log.push('Gmail search found: ' + (search.messages || []).length + ' messages');

  for (const msg of (search.messages || [])) {
    const full = await gmailApi(token, 'messages/' + msg.id + '?format=full');
    const body = extractBody(full.payload);
    log.push('Message ' + msg.id + ' body length: ' + body.length);
    if (body && body.length > 50) {
      // This is the reply — update the blob
      data.body = body;
      data.email_content = body;
      data.gmail_message_id = msg.id;
      data.gmail_thread_id = full.threadId;
      await put(drostdyBlob.pathname, JSON.stringify(data), { access: 'public', addRandomSuffix: false });
      log.push('Updated blob with body and gmail_message_id: ' + msg.id);
      break;
    }
  }

  res.status(200).json({ log, errors });
}
