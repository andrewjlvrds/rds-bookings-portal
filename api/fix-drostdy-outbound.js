// ONE-SHOT: Move remaining Drostdy outbound blob from phantom ID to correct ID
// Phantom ID: 6543704000008114026  Correct ID: 6543704000010888021
// DELETE AFTER USE

import { list, put, del } from '@vercel/blob';

const PHANTOM_ID = '6543704000008114026';
const CORRECT_ID = '6543704000010888021';

export default async function handler(req, res) {
  const fixed = [], errors = [];

  const blobs = await list({ prefix: 'emails/booking/' + PHANTOM_ID + '/' });
  console.log('Found', blobs.blobs.length, 'blobs under phantom ID');

  for (const blob of blobs.blobs) {
    const filename = blob.pathname.split('/').pop();
    try {
      const r = await fetch(blob.url);
      const data = await r.json();
      const newPath = 'emails/booking/' + CORRECT_ID + '/' + filename;
      await put(newPath, JSON.stringify(data), { access: 'public', addRandomSuffix: false });
      await del(blob.url);
      fixed.push(filename + ' → ' + newPath);
    } catch(e) { errors.push(filename + ': ' + e.message); }
  }

  res.status(200).json({ fixed, errors, total: blobs.blobs.length });
}
