// ONE-SHOT: Pioneer Lodge blobs incorrectly moved to Drostdy path — move back.
// Drostdy ID: 6543704000010888021  Pioneer Camp Lusaka (Jul 26) ID: 6543704000003400210
// DELETE AFTER USE

import { list, put, del } from '@vercel/blob';

const DROSTDY_ID = '6543704000010888021';
const PIONEER_ID = '6543704000003400210';

const PIONEER_FILENAMES = [
  '19c56a2058587a40.json','19c74dff980e3652.json','19cffc3275ea09ff.json',
  '19cffd15d0048235.json','19d06510c2bd7d2b.json','19d09fc76406a929.json',
  '19d244bf7692de74.json','19d2faf0c675f1ee.json','19e0725ffe8a4afe.json',
  '19e68002e8a85265.json',
];

export default async function handler(req, res) {
  const fixed = [], errors = [];

  // List blobs under Drostdy path to get their full URLs
  const drostdyBlobs = await list({ prefix: 'emails/booking/' + DROSTDY_ID + '/' });

  for (const blob of drostdyBlobs.blobs) {
    const filename = blob.pathname.split('/').pop();
    if (!PIONEER_FILENAMES.includes(filename)) continue;
    try {
      const r = await fetch(blob.url);
      const data = await r.json();
      const pioneerPath = 'emails/booking/' + PIONEER_ID + '/' + filename;
      await put(pioneerPath, JSON.stringify(data), { access: 'public', addRandomSuffix: false });
      await del(blob.url);
      fixed.push(filename + ' → ' + pioneerPath);
    } catch(e) { errors.push(filename + ': ' + e.message); }
  }

  res.status(200).json({ fixed, errors });
}
