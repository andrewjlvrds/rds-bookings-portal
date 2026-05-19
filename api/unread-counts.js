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
  const BATCH = 20;

  for (let i = 0; i < bookingIds.length; i += BATCH) {
    if (Date.now() - t0 > 25000) break; // hard limit

    const batch = bookingIds.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(async (bookingId) => {
      try {
        const since = lastReadAt[bookingId] ? new Date(lastReadAt[bookingId]) : null;
        const result = await list({ prefix: 'emails/booking/' + bookingId + '/' });
        const blobs = result.blobs || [];

        // Count blobs — we use blob uploadedAt as proxy for email date
        // since we don't need to fetch full content just to count.
        // Blobs uploaded after last_read_at are "unread".
        let unread = 0;
        for (const blob of blobs) {
          // Only count inbound emails — use filename heuristics or uploadedAt
          // We can't know direction without fetching, so count all blobs
          // newer than last_read_at as potentially unread.
          // This is conservative (may over-count) but fast.
          if (!since) {
            unread++;
          } else {
            const blobDate = new Date(blob.uploadedAt);
            if (blobDate > since) unread++;
          }
        }
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
