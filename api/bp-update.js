// POST /api/bp-update
// Generic endpoint to update one or more fields on a Lodge Booking record.
// Body: { id: string, ...fields }
// Only whitelisted fields are accepted.

import { zohoApi } from './_zoho.js';

const ALLOWED_FIELDS = new Set([
  'Payment_Stage', 'Status', 'Lodge_Availability', 'New_Reply',
  'Last_Response_Date', 'Follow_up_Date', 'Reservation_Comments',
  'Lodge_Reference', 'Contact_Name', 'Booking_Type', 'Lodge_Priority',
  'Payment_Note', 'Deposit_Amount', 'Deposit_Due_Date',
  'Second_Payment_Amount', 'Second_Payment_Due_Date',
  'Third_Payment_Amount', 'Third_Payment_Due_Date',
  'Fourth_Payment_Amount', 'Fourth_Payment_Due_Date',
  'Total_Amount', 'Lodge_Currency',
]);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const body = req.body || {};
  const { id, ...fields } = body;

  if (!id) return res.status(400).json({ error: 'id required' });

  // Filter to allowed fields only
  const updates = { id };
  for (const [k, v] of Object.entries(fields)) {
    if (ALLOWED_FIELDS.has(k)) updates[k] = v;
  }

  if (Object.keys(updates).length === 1) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  try {
    const result = await zohoApi('PUT', 'Lodge_Bookings', { data: [updates] });
    const item = result?.data?.[0];
    if (item?.status === 'success') {
      return res.status(200).json({ success: true });
    } else {
      return res.status(200).json({ success: false, error: item?.message || 'Unknown error' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
