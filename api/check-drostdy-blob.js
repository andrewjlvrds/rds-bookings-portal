// ONE-SHOT: Check what's in Drostdy blob path and show body status
// DELETE AFTER USE
import { list } from '@vercel/blob';
const DROSTDY_ID = '6543704000010888021';

export default async function handler(req, res) {
  const blobs = await list({ prefix: 'emails/booking/' + DROSTDY_ID + '/' });
  const results = [];
  for (const blob of blobs.blobs) {
    const r = await fetch(blob.url);
    const data = await r.json();
    results.push({
      file: blob.pathname.split('/').pop(),
      direction: data.direction,
      from: data.email_from || data.from,
      subject: data.email_subject || data.subject,
      has_body: !!(data.body && data.body.trim() && data.body !== '(no content)'),
      body_preview: (data.body || data.email_content || '').substring(0, 100),
      gmail_message_id: data.gmail_message_id,
    });
  }
  res.status(200).json({ count: blobs.blobs.length, results });
}
