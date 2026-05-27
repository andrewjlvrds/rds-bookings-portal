// ONE-SHOT: Delete Pioneer blob incorrectly sitting in Drostdy path
// DELETE AFTER USE
import { list, del } from '@vercel/blob';
const DROSTDY_ID = '6543704000010888021';
const PIONEER_BLOB = '19e68002e8a85265.json';

export default async function handler(req, res) {
  const blobs = await list({ prefix: 'emails/booking/' + DROSTDY_ID + '/' + PIONEER_BLOB });
  if (!blobs.blobs.length) return res.status(200).json({ result: 'not found' });
  await del(blobs.blobs[0].url);
  res.status(200).json({ result: 'deleted', path: blobs.blobs[0].pathname });
}
