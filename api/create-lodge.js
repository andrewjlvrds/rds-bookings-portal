// POST /api/create-lodge
// Creates a new lodge record in Zoho Lodges (CustomModule5).
// Required: name
// Optional: email, contact_first_name, country, lodge_currency, phone

import { zohoApi } from './_zoho.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const body = req.body || {};
  const { name, email, contact_first_name, country, lodge_currency, phone } = body;

  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });

  const record = {
    Name: name.trim(),
    Status: 'Active',
  };
  if (email)              record.Email = email.trim();
  if (contact_first_name) record.Contact_First_Name = contact_first_name.trim();
  if (country)            record.Country = country.trim();
  if (lodge_currency)     record.Lodge_Currency = lodge_currency.trim().toUpperCase();
  if (phone)              record.Phone = phone.trim();

  try {
    const result = await zohoApi('POST', 'Lodges', { data: [record] });
    const item = (result.data || [])[0];
    if (!item || item.status !== 'success') {
      const msg = item ? (item.message || item.status) : 'Unknown error';
      return res.status(500).json({ error: msg });
    }
    return res.status(200).json({ success: true, id: item.details.id, name: name.trim() });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
