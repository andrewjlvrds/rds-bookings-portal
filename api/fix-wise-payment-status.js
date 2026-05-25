// ONE-SHOT FIX — delete after use.
// Resets all Lodge_Booking records with Status = "Wise Payment" back to "Not Started".
// "Wise Payment" was incorrectly written by the AI parser (payment method mistaken for status).
// GET ?dry_run=1 to preview, POST to execute.

import { zohoApi } from './_zoho.js';

const AFFECTED_IDS = [
  "6543704000008163001","6543704000008234190","6543704000008710006","6543704000009352027",
  "6543704000009359059","6543704000009359064","6543704000009360014","6543704000009361023",
  "6543704000009362058","6543704000009367028","6543704000009367033","6543704000009367038",
  "6543704000009368018","6543704000009369041","6543704000009369046","6543704000009376029",
  "6543704000009377019","6543704000009381016","6543704000009384021","6543704000009399049",
  "6543704000009401023","6543704000009403025","6543704000009410025","6543704000010668002",
  "6543704000010679002","6543704000010679004","6543704000010680004","6543704000010681001",
  "6543704000010681003","6543704000010682001","6543704000010683001","6543704000010684001",
  "6543704000010685001","6543704000010685003","6543704000010686001","6543704000010686005",
  "6543704000010687001","6543704000010688001","6543704000010689001","6543704000010690001",
  "6543704000010691001","6543704000010692001","6543704000010692003","6543704000010693001",
  "6543704000010694001"
];

export default async function handler(req, res) {
  const dryRun = req.query.dry_run === '1' || req.query.dry_run === 'true';

  if (dryRun) {
    return res.json({
      dry_run: true,
      count: AFFECTED_IDS.length,
      action: 'Would reset Status from "Wise Payment" → "Not Started"',
      ids: AFFECTED_IDS,
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST to execute, GET?dry_run=1 to preview' });
  }

  // Zoho bulk PUT accepts up to 100 records per request
  const BATCH = 100;
  const results = [];
  let updated = 0, errors = 0;

  for (let i = 0; i < AFFECTED_IDS.length; i += BATCH) {
    const batch = AFFECTED_IDS.slice(i, i + BATCH).map(id => ({ id, Status: 'Not Started' }));
    try {
      const r = await zohoApi('PUT', 'Lodge_Bookings', { data: batch });
      const data = (r && r.data) || [];
      data.forEach(item => {
        if (item.status === 'success') { updated++; results.push({ id: item.details?.id, ok: true }); }
        else { errors++; results.push({ id: item.details?.id, ok: false, message: item.message }); }
      });
    } catch (e) {
      errors += batch.length;
      results.push({ batch_start: i, error: e.message });
    }
  }

  res.json({ updated, errors, total: AFFECTED_IDS.length, results });
}
