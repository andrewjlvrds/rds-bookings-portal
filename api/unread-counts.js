// POST /api/unread-counts
// Returns per-booking unread inbound email counts.
// An email is "unread" if it is inbound and NOT in the read-state blob
// (i.e. not explicitly marked done via Mark done / Mark handled).
// Badge clears only when the team explicitly marks emails as done.
//
// Body: { booking_ids: string[] }
// Response: { counts: { [bookingId]: number } }

import { list } from '@vercel/blob';
import { loadReadState } from './_read-state.js';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const body = req.body || {};
  const bookingIds = body.booking_ids || [];

  if (!bookingIds.length) return res.status(200).json({ counts: {} });

  // Load read-state once — single blob fetch shared across all bookings
  const readState = await loadReadState();

  const counts = {};
  const t0 = Date.now();
  const BATCH = 10;

  for (let i = 0; i < bookingIds.length; i += BATCH) {
    if (Date.now() - t0 > 25000) break;

    const batch = bookingIds.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(async (bookingId) => {
      try {
        const result = await list({ prefix: 'emails/booking/' + bookingId + '/' });
        const blobs = result.blobs || [];

        let unread = 0;
        await Promise.all(blobs.map(async (blob) => {
          try {
            const r = await fetch(blob.url);
            if (!r.ok) return;
            const data = await r.json();
            if (data.direction !== 'inbound') return;
            // Check if this email has been explicitly marked done
            const emailId = data.id || data.message_id || data.gmail_message_id;
            if (emailId && readState[emailId]) return; // marked done — not unread
            // Also check stale filter — no body = not a real email
            const hasBody = data.body && data.body.trim() && data.body !== '(no content)';
            if (!hasBody) return;
            unread++;
          } catch (e) { /* skip */ }
        }));
        return { bookingId, unread };
      } catch (e) {
        return { bookingId, unread: 0 };
      }
    }));

    results.forEach(({ bookingId, unread }) => {
      counts[bookingId] = unread;
    });
  }

  return res.status(200).json({ counts });
}
