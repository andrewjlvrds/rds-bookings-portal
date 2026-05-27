// ONE-SHOT: Move last Pioneer blob out of Drostdy path
// DELETE AFTER USE
import { list, put, del } from '@vercel/blob';
const DROSTDY_ID = '6543704000010888021';
const PIONEER_ID = '6543704000003400210';
const FILENAME = '19e632fdb84e736b.json';

export default async function handler(req, res) {
  const blobs = await list({ prefix: 'emails/booking/' + DROSTDY_ID + '/' + FILENAME });
  if (!blobs.blobs.length) return res.status(200).json({ error: 'blob not found' });
  const blob = blobs.blobs[0];
  const r = await fetch(blob.url);
  const data = await r.json();
  await put('emails/booking/' + PIONEER_ID + '/' + FILENAME, JSON.stringify(data), { access: 'public', addRandomSuffix: false });
  await del(blob.url);
  res.status(200).json({ moved: FILENAME, to: 'emails/booking/' + PIONEER_ID + '/' + FILENAME });
}
