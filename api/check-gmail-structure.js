// ONE-SHOT: Check Gmail message payload structure for a booking's reply
// DELETE AFTER USE
import { list } from '@vercel/blob';
import { getGmailToken, gmailApi } from './_gmail.js';

export default async function handler(req, res) {
  const bookingId = req.query.booking_id;
  if (!bookingId) return res.status(400).json({ error: 'booking_id required' });

  const blobs = await list({ prefix: 'emails/booking/' + bookingId + '/' });
  const token = await getGmailToken();
  const results = [];

  for (const blob of blobs.blobs) {
    const r = await fetch(blob.url);
    const data = await r.json();
    if (data.direction !== 'inbound') continue;

    const gmailId = data.gmail_message_id || data.message_id;
    if (!gmailId) { results.push({ file: blob.pathname.split('/').pop(), error: 'no gmail id' }); continue; }

    const msg = await gmailApi(token, 'messages/' + gmailId + '?format=full');
    
    function describePayload(part, depth) {
      if (!part) return null;
      const desc = {
        mimeType: part.mimeType,
        hasData: !!(part.body && part.body.data),
        dataLength: part.body && part.body.data ? part.body.data.length : 0,
        hasAttachmentId: !!(part.body && part.body.attachmentId),
        bodySize: part.body ? part.body.size : 0,
      };
      if (part.parts && depth < 3) desc.parts = part.parts.map(p => describePayload(p, depth+1));
      return desc;
    }

    results.push({
      file: blob.pathname.split('/').pop(),
      gmail_id: gmailId,
      payload_structure: describePayload(msg.payload, 0),
    });
  }

  res.status(200).json({ results });
}
