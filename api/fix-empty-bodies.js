// ONE-SHOT: Find all inbound email blobs with empty bodies and fix them via Gmail
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
  const t0 = Date.now();
  const token = await getGmailToken();
  const fixed = [], errors = [], skipped = [];

  // List all booking blobs
  let cursor = null;
  let allBlobs = [];
  do {
    const result = await list({ prefix: 'emails/booking/', limit: 1000, cursor });
    allBlobs = allBlobs.concat(result.blobs);
    cursor = result.cursor;
  } while (cursor && Date.now() - t0 < 40000);

  for (const blob of allBlobs) {
    if (Date.now() - t0 > 50000) break;

    const r = await fetch(blob.url);
    const data = await r.json();

    if (data.direction !== 'inbound') continue;
    const hasBody = data.body && data.body.trim() && data.body !== '(no content)';
    if (hasBody) continue;

    // Get gmail_message_id — use blob filename as fallback
    const gmailId = data.gmail_message_id || data.message_id || blob.pathname.split('/').pop().replace('.json', '');
    if (!gmailId) { errors.push('no id: ' + blob.pathname); continue; }

    try {
      const full = await gmailApi(token, 'messages/' + gmailId + '?format=full');
      if (!full || !full.payload) { errors.push('no payload: ' + gmailId); continue; }
      const body = extractBody(full.payload);
      if (!body || body.length < 10) { skipped.push(gmailId + ' (empty after extract)'); continue; }

      data.body = body;
      data.email_content = body;
      data.gmail_message_id = gmailId;
      await put(blob.pathname, JSON.stringify(data), { access: 'public', addRandomSuffix: false });
      fixed.push(blob.pathname.split('/').pop() + ' (' + body.length + ' chars)');
    } catch(e) { errors.push(gmailId + ': ' + e.message); }
  }

  res.status(200).json({ fixed: fixed.length, skipped: skipped.length, errors: errors.length, fixed_list: fixed, errors_list: errors, skipped_list: skipped, elapsed_ms: Date.now() - t0 });
}
