// ONE-SHOT: Fix reply blobs with no gmail_message_id by searching Gmail
// Searches by sender email extracted from blob's email_from field
// DELETE AFTER USE
import { list, put } from '@vercel/blob';
import { getGmailToken, gmailApi } from './_gmail.js';

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
  const bookingId = req.query.booking_id;
  if (!bookingId) return res.status(400).json({ error: 'booking_id required' });

  const token = await getGmailToken();
  const blobs = await list({ prefix: 'emails/booking/' + bookingId + '/' });
  const log = [], errors = [];

  for (const blob of blobs.blobs) {
    const r = await fetch(blob.url);
    const data = await r.json();

    // Only fix inbound blobs with no gmail_message_id and no body
    if (data.direction !== 'inbound') continue;
    if (data.gmail_message_id) continue;
    if (data.body && data.body.trim() && data.body !== '(no content)') continue;

    // Extract sender email from email_from field
    const fromMatch = (data.email_from || data.from || '').match(/<(.+?)>/) || [];
    const senderEmail = fromMatch[1] || data.email_from || data.from || '';
    if (!senderEmail) { errors.push('no sender for ' + blob.pathname); continue; }

    log.push('Searching Gmail for reply from: ' + senderEmail);
    const query = 'from:' + senderEmail + ' newer_than:7d';
    const search = await gmailApi(token, 'messages?q=' + encodeURIComponent(query) + '&maxResults=10');
    const messages = search.messages || [];
    log.push('Found ' + messages.length + ' messages');

    let fixed = false;
    for (const msg of messages) {
      const full = await gmailApi(token, 'messages/' + msg.id + '?format=full');
      const body = extractBody(full.payload);
      if (body && body.length > 30) {
        data.body = body;
        data.email_content = body;
        data.gmail_message_id = msg.id;
        data.gmail_thread_id = full.threadId;
        await put(blob.pathname, JSON.stringify(data), { access: 'public', addRandomSuffix: false });
        log.push('Fixed: ' + blob.pathname.split('/').pop() + ' with gmail id ' + msg.id + ' body length ' + body.length);
        fixed = true;
        break;
      }
    }
    if (!fixed) errors.push('Could not find body for ' + blob.pathname.split('/').pop());
  }

  res.status(200).json({ log, errors });
}
