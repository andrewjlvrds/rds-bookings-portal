// GET  /api/bp-meta?booking_id=xxx        — fetch meta for one booking
// POST /api/bp-meta { booking_id, handledBy?, notes? } — save meta
// Stores portal-only metadata (Handled By, Internal Notes) in Vercel Blob.
// Path: booking-meta/{bookingId}.json

import { put, head } from '@vercel/blob';

function blobPath(bookingId) {
  return 'booking-meta/' + bookingId + '.json';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const bookingId = (req.query && req.query.booking_id) || (req.body && req.body.booking_id);
  if (!bookingId) return res.status(400).json({ error: 'booking_id required' });

  if (req.method === 'GET') {
    try {
      const info = await head(blobPath(bookingId));
      const r = await fetch(info.url);
      if (!r.ok) return res.status(200).json({ handledBy: '', notes: '' });
      const data = await r.json();
      return res.status(200).json(data);
    } catch (e) {
      // Blob doesn't exist yet
      return res.status(200).json({ handledBy: '', notes: '' });
    }
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    // Fetch existing first so we merge, not overwrite
    let existing = { handledBy: '', notes: '' };
    try {
      const info = await head(blobPath(bookingId));
      const r = await fetch(info.url);
      if (r.ok) existing = await r.json();
    } catch (e) { /* doesn't exist yet */ }

    const merged = {
      ...existing,
      ...(body.handledBy !== undefined ? { handledBy: body.handledBy } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      updated_at: new Date().toISOString(),
    };

    await put(blobPath(bookingId), JSON.stringify(merged), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
    });

    return res.status(200).json({ success: true, ...merged });
  }

  return res.status(405).json({ error: 'GET or POST only' });
}
