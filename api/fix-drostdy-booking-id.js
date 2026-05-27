// ONE-SHOT: Fix Drostdy Hotel sent-index entry — wrong booking ID stored from send-enquiry bug
// Wrong ID: 6543704000008114026  Correct ID (from Zoho): 6543704000010888021
// DELETE THIS ENDPOINT AFTER USE

import { list, put } from '@vercel/blob';

const WRONG_ID = '6543704000008114026';
const CORRECT_ID = '6543704000010888021';

export default async function handler(req, res) {
  const fixed = [];
  const errors = [];

  // Fix sent-index entries
  try {
    const all = await list({ prefix: 'emails/sent-index/', limit: 500 });
    for (const blob of all.blobs) {
      try {
        const r = await fetch(blob.url);
        const data = await r.json();
        if (data.booking_ids && data.booking_ids.includes(WRONG_ID)) {
          data.booking_ids = data.booking_ids.map(id => id === WRONG_ID ? CORRECT_ID : id);
          await put(blob.pathname, JSON.stringify(data), { access: 'public', addRandomSuffix: false });
          fixed.push('sent-index: ' + blob.pathname);
        }
      } catch(e) { errors.push(blob.pathname + ': ' + e.message); }
    }
  } catch(e) { errors.push('list sent-index: ' + e.message); }

  // Move outbound blobs from wrong to correct booking ID path
  try {
    const outbound = await list({ prefix: 'emails/booking/' + WRONG_ID + '/' });
    for (const blob of outbound.blobs) {
      try {
        const r = await fetch(blob.url);
        const data = await r.json();
        const newPath = blob.pathname.replace(WRONG_ID, CORRECT_ID);
        await put(newPath, JSON.stringify(data), { access: 'public', addRandomSuffix: false });
        fixed.push('blob moved: ' + newPath);
      } catch(e) { errors.push(blob.pathname + ': ' + e.message); }
    }
  } catch(e) { errors.push('list outbound: ' + e.message); }

  res.status(200).json({ fixed, errors });
}
