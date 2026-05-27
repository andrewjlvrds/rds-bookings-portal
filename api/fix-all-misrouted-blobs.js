// ONE-SHOT: Clean up all blob misrouting
// Pioneer blobs are duplicated under both phantom ID and correct Drostdy ID
// Need to: delete them from Drostdy path, ensure they exist under Pioneer path
// Phantom ID: 6543704000008114026
// Drostdy correct ID: 6543704000010888021  
// Pioneer correct ID: 6543704000003400210
// DELETE AFTER USE

import { list, put, del } from '@vercel/blob';

const PHANTOM_ID = '6543704000008114026';
const DROSTDY_ID = '6543704000010888021';
const PIONEER_ID = '6543704000003400210';

const PIONEER_FILENAMES = new Set([
  '19c56a2058587a40.json','19c74dff980e3652.json','19cffc3275ea09ff.json',
  '19cffd15d0048235.json','19d06510c2bd7d2b.json','19d09fc76406a929.json',
  '19d244bf7692de74.json','19d2faf0c675f1ee.json','19e0725ffe8a4afe.json',
  '19e68002e8a85265.json',
]);

export default async function handler(req, res) {
  const log = [], errors = [];

  // 1. List everything under phantom ID — should be nothing or Drostdy outbound
  const phantomBlobs = await list({ prefix: 'emails/booking/' + PHANTOM_ID + '/' });
  log.push('Phantom ID blobs: ' + phantomBlobs.blobs.length);
  for (const blob of phantomBlobs.blobs) {
    const filename = blob.pathname.split('/').pop();
    try {
      await del(blob.url);
      log.push('Deleted from phantom: ' + filename);
    } catch(e) { errors.push('del phantom ' + filename + ': ' + e.message); }
  }

  // 2. List everything under Drostdy ID — delete Pioneer blobs, keep Drostdy ones
  const drostdyBlobs = await list({ prefix: 'emails/booking/' + DROSTDY_ID + '/' });
  log.push('Drostdy ID blobs: ' + drostdyBlobs.blobs.length);
  for (const blob of drostdyBlobs.blobs) {
    const filename = blob.pathname.split('/').pop();
    if (PIONEER_FILENAMES.has(filename)) {
      try {
        // Ensure it exists under Pioneer path first
        const r = await fetch(blob.url);
        const data = await r.json();
        await put('emails/booking/' + PIONEER_ID + '/' + filename, JSON.stringify(data), { access: 'public', addRandomSuffix: false });
        await del(blob.url);
        log.push('Moved Pioneer blob to correct path: ' + filename);
      } catch(e) { errors.push('move pioneer ' + filename + ': ' + e.message); }
    } else {
      log.push('Keeping in Drostdy: ' + filename);
    }
  }

  // 3. Report what's now under each path
  const drostdyFinal = await list({ prefix: 'emails/booking/' + DROSTDY_ID + '/' });
  const pioneerFinal = await list({ prefix: 'emails/booking/' + PIONEER_ID + '/' });
  
  res.status(200).json({ 
    log, errors,
    drostdy_blobs: drostdyFinal.blobs.map(b => b.pathname.split('/').pop()),
    pioneer_blobs: pioneerFinal.blobs.length,
  });
}
