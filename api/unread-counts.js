// POST /api/unread-counts
// Returns per-booking unread inbound email counts based on blob storage.
// Client passes last_read_at timestamps from localStorage so we can
// count only emails newer than when Helen last viewed each booking.
//
// Body: {
//   booking_ids: string[],          // all booking IDs to check
//   last_read_at: { [id]: isoString } // when each booking was last read
// }
// Response: { counts: { [bookingId]: number } }

import { list } from '@vercel/blob';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const body = req.body || {};
  const bookingIds = body.booking_ids || [];
  const lastReadAt = body.last_read_at || {}; // { bookingId: isoString }

  if (!bookingIds.length) return res.status(200).json({ counts: {} });

  const counts = {};
  const t0 = Date.now();
  const BATCH = 10; // smaller batch — each booking now fetches multiple blobs

  for (let i = 0; i < bookingIds.length; i += BATCH) {
    if (Date.now() - t0 > 25000) break; // hard limit

    const batch = bookingIds.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(async (bookingId) => {
      try {
        const since = lastReadAt[bookingId] ? new Date(lastReadAt[bookingId]) : null;
        const result = await list({ prefix: 'emails/booking/' + bookingId + '/' });
        const blobs = result.blobs || [];

        // Only count inbound emails newer than last_read_at.
        // Must fetch content to check direction field — blobs are small JSON.
        let unread = 0;
        await Promise.all(blobs.map(async (blob) => {
          try {
            // Skip blobs that predate last_read_at without fetching
            if (since && new Date(blob.uploadedAt) <= since) return;
            const r = await fetch(blob.url);
            if (!r.ok) return;
            const data = await r.json();
            if (data.direction === 'inbound') unread++;
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
