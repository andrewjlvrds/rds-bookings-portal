// ONE-SHOT: Inspect what's in the Drostdy booking blobs — read only, no writes
// DELETE AFTER USE
import { list } from '@vercel/blob';

const DROSTDY_ID = '6543704000010888021';

export default async function handler(req, res) {
  const blobs = await list({ prefix: 'emails/booking/' + DROSTDY_ID + '/' });
  const contents = [];
  for (const blob of blobs.blobs) {
    const r = await fetch(blob.url);
    const data = await r.json();
    contents.push({
      file: blob.pathname.split('/').pop(),
      direction: data.direction,
      from: data.email_from,
      subject: data.email_subject,
      date: data.email_date,
    });
  }
  res.status(200).json({ count: blobs.blobs.length, contents });
}
