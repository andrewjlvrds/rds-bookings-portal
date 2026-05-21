// POST /api/upload-guest-docs
// Receives base64-encoded PDFs, uploads to Vercel Blob,
// and writes the public URLs to File_Upload_Notes on Zoho Bookings records.
//
// Body: { guests: [{ zoho_id, first, last, pdf_b64 }] }

import { put } from '@vercel/blob';
import { zohoApi } from './_zoho.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { guests } = req.body || {};
  if (!guests || !guests.length) return res.status(400).json({ error: 'guests required' });

  const results = [];

  for (const g of guests) {
    try {
      const { zoho_id, first, last, pdf_b64 } = g;
      const fname = `GL26_Visa_${last}_${first}.pdf`.replace(/\s/g, '_');

      // Upload to blob
      const buf = Buffer.from(pdf_b64, 'base64');
      const blob = await put(`guest-docs/gl-jul-26/${fname}`, buf, {
        access: 'public',
        contentType: 'application/pdf',
      });

      // Write URL to Zoho Bookings File_Upload_Notes
      await zohoApi('PUT', 'Bookings', {
        data: [{ id: zoho_id, File_Upload_Notes: blob.url }]
      });

      results.push({ zoho_id, first, last, url: blob.url, ok: true });
    } catch (e) {
      results.push({ zoho_id: g.zoho_id, first: g.first, last: g.last, ok: false, error: e.message });
    }
  }

  return res.status(200).json({ results });
}
