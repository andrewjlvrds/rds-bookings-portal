// ONE-SHOT: Find Drostdy reply by sender and write body to blob
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

  const blobs = await list({ prefix: 'emails/booking/' + DROSTDY_ID + '/' });
  const drostdyBlob = blobs.blobs.find(b => b.pathname.includes('19e68cee95d1f3c3'));
  if (!drostdyBlob) return res.status(200).json({ error: 'blob not found' });

  const token = await getGmailToken();

  // Search by sender — reservations@drostdy.co.za
  const query = 'from:reservations@drostdy.co.za newer_than:3d';
  const search = await gmailApi(token, 'messages?q=' + encodeURIComponent(query) + '&maxResults=5');
  log.push('Found: ' + (search.messages || []).length + ' messages from drostdy');

  for (const msg of (search.messages || [])) {
    const full = await gmailApi(token, 'messages/' + msg.id + '?format=full');
    const body = extractBody(full.payload);
    log.push('Message ' + msg.id + ' body length: ' + body.length + ' preview: ' + body.substring(0, 80));

    if (body && body.length > 50) {
      const r = await fetch(drostdyBlob.url);
      const data = await r.json();
      data.body = body;
      data.email_content = body;
      data.gmail_message_id = msg.id;
      data.gmail_thread_id = full.threadId;
      await put(drostdyBlob.pathname, JSON.stringify(data), { access: 'public', addRandomSuffix: false });
      log.push('Updated Drostdy blob with body from message ' + msg.id);
      break;
    }
  }

  res.status(200).json({ log, errors });
}
