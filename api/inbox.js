import { list } from '@vercel/blob';
import { loadReadState } from './_read-state.js';

/*
 * /api/inbox — single endpoint for the Inbox view.
 *
 * Returns three categorised buckets in one round-trip (matters on
 * mobile / LTE):
 *
 *   {
 *     unread:    [...],   // matched inbound emails Helen hasn't opened
 *     unmatched: [...],   // emails/unmatched/ — never routed to a booking
 *     tour_bucket: [...], // emails/tour-bucket/ — tour known, booking ambiguous
 *     stats: { ... }
 *   }
 *
 * Outbound and read inbound emails are excluded — Helen only wants to
 * see what needs her attention. She can still drill into a LodgeDetail
 * to see the full thread.
 *
 * Hard cap on payload size: each bucket truncated to 200 entries,
 * sorted newest-first. If she's drowning in unread, that's a pipeline
 * problem to fix at the source, not by paging this endpoint.
 */

const MAX_PER_BUCKET = 500;
const MAX_PAGES_PER_PREFIX = 10;

async function listAll(prefix) {
  const all = [];
  let cursor;
  for (let i = 0; i < MAX_PAGES_PER_PREFIX; i++) {
    const opts = { prefix };
    if (cursor) opts.cursor = cursor;
    const result = await list(opts);
    if (result.blobs) all.push(...result.blobs);
    if (!result.hasMore) break;
    cursor = result.cursor;
  }
  return all;
}

async function fetchBlobs(blobs) {
  const out = [];
  for (let i = 0; i < blobs.length; i += 20) {
    const batch = blobs.slice(i, i + 20);
    const fetched = await Promise.all(batch.map(async (b) => {
      try {
        const r = await fetch(b.url, { cache: 'no-store' });
        if (!r.ok) return null;
        const d = await r.json();
        d._blob_url = b.url;
        d._blob_path = b.pathname;
        d._uploaded_at = b.uploadedAt;
        return d;
      } catch (e) {
        return null;
      }
    }));
    fetched.forEach(d => { if (d) out.push(d); });
  }
  return out;
}

function emailDate(e) {
  return e.date || e.email_date || e._uploaded_at || 0;
}

function inboundOnly(emails) {
  return emails.filter(e => e.direction === 'inbound' || e.type === 'lodge_inbound' || e.type === 'lodge_reply');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    // 1. Read state — single blob fetch.
    const readState = await loadReadState();

    // 2. List the three prefixes in parallel.
    const [bookingBlobs, unmatchedBlobs, tourBucketBlobs] = await Promise.all([
      listAll('emails/booking/'),
      listAll('emails/unmatched/'),
      listAll('emails/tour-bucket/'),
    ]);

    // 3. Sort by uploaded_at DESC and cap before fetching JSON
    //    (avoids reading a year of old emails for the unread query).
    const byUploadedDesc = (a, b) => {
      const da = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
      const db = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
      return db - da;
    };

    bookingBlobs.sort(byUploadedDesc);
    unmatchedBlobs.sort(byUploadedDesc);
    tourBucketBlobs.sort(byUploadedDesc);

    // For the booking bucket we need to fetch a wider window than the
    // bucket cap so the unread total reflects reality even when there's
    // a backlog. 1000 newest covers a comfortable working window without
    // risking timeouts. If Helen has more than 1000 unread, the
    // 'Mark all read everywhere' button is the answer (no fetching, just
    // path-based bulk write).
    const BOOKING_SCAN_LIMIT = 1000;
    const bookingsToFetch = bookingBlobs.slice(0, BOOKING_SCAN_LIMIT);
    const unmatchedToFetch = unmatchedBlobs.slice(0, MAX_PER_BUCKET);
    const tourBucketToFetch = tourBucketBlobs.slice(0, MAX_PER_BUCKET);

    const [bookingEmails, unmatchedEmails, tourBucketEmails] = await Promise.all([
      fetchBlobs(bookingsToFetch),
      fetchBlobs(unmatchedToFetch),
      fetchBlobs(tourBucketToFetch),
    ]);

    // 4. Filter to inbound, exclude already-read
    const unreadInbound = inboundOnly(bookingEmails).filter(e => !readState[e.id]);
    unreadInbound.sort((a, b) => new Date(emailDate(b)) - new Date(emailDate(a)));

    // 5. Unmatched and tour-bucket: surface everything inbound regardless
    //    of read state — Helen needs to see them until she routes them.
    //    But still respect read-state so she can dismiss noise.
    const unmatchedFiltered = inboundOnly(unmatchedEmails).filter(e => !readState[e.id]);
    unmatchedFiltered.sort((a, b) => new Date(emailDate(b)) - new Date(emailDate(a)));

    const tourBucketFiltered = inboundOnly(tourBucketEmails).filter(e => !readState[e.id]);
    tourBucketFiltered.sort((a, b) => new Date(emailDate(b)) - new Date(emailDate(a)));

    return res.status(200).json({
      success: true,
      unread: unreadInbound.slice(0, MAX_PER_BUCKET),
      unmatched: unmatchedFiltered.slice(0, MAX_PER_BUCKET),
      tour_bucket: tourBucketFiltered.slice(0, MAX_PER_BUCKET),
      stats: {
        // Real totals (uncapped) — Helen needs to see real backlog.
        unread: unreadInbound.length,
        unmatched: unmatchedFiltered.length,
        tour_bucket: tourBucketFiltered.length,
        // Diagnostic — was the booking scan window itself the limit?
        booking_blobs_total: bookingBlobs.length,
        booking_blobs_scanned: bookingsToFetch.length,
        unmatched_blobs_total: unmatchedBlobs.length,
        tour_bucket_blobs_total: tourBucketBlobs.length,
        // Whether the bucket arrays were truncated for display.
        truncated: {
          unread: unreadInbound.length > MAX_PER_BUCKET,
          unmatched: unmatchedFiltered.length > MAX_PER_BUCKET,
          tour_bucket: tourBucketFiltered.length > MAX_PER_BUCKET,
          booking_scan: bookingBlobs.length > BOOKING_SCAN_LIMIT,
        },
      },
    });
  } catch (err) {
    console.error('inbox error:', err);
    return res.status(500).json({ error: err.message });
  }
}
