import { list } from '@vercel/blob';
import { loadReadState, markManyRead } from './_read-state.js';

/*
 * /api/mark-all-booking-emails-read
 *
 * Nuclear-option backlog drain. Marks every email under emails/booking/
 * as read in the portal — no fetching, just path-based writes.
 *
 * Use case: Helen at cutover has hundreds of historical inbound emails
 * piled up in the portal that she's already dealt with in Gmail. The
 * Sync from Gmail endpoint covers the recent + Gmail-checkable subset
 * but anything older or with no gmail_message_id stays unread. This
 * endpoint nukes the rest in one shot.
 *
 * How it works:
 *   1. List every blob under emails/booking/{bookingId}/{safeId}.json
 *   2. Derive the safeId (== email.id) from the basename
 *   3. Bulk-write all those IDs into the read-state blob
 *
 * Crucially we DON'T fetch the blob contents — that would be thousands
 * of fetches. Path-based works because the email's id field IS the
 * filename's safeId. This is fast (a few seconds) regardless of volume.
 *
 * Side effect: outbound emails also get their IDs added to the read
 * state. Harmless — outbound is filtered out by direction earlier
 * in the inbox endpoint, so the read flag on outbound is never read.
 *
 * POST-only. ?dry_run=1 reports what would be written without writing.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const dryRun = req.query.dry_run === '1' || req.query.dry_run === 'true';

    // 1. List all booking emails (paths only, fast)
    const all = [];
    let cursor;
    for (let i = 0; i < 50; i++) { // generous page cap
      const opts = { prefix: 'emails/booking/' };
      if (cursor) opts.cursor = cursor;
      const r = await list(opts);
      if (r.blobs) all.push(...r.blobs);
      if (!r.hasMore) break;
      cursor = r.cursor;
    }

    // 2. Derive email IDs from filenames
    const ids = [];
    for (const b of all) {
      // pathname: emails/booking/{bookingId}/{safeId}.json
      const match = b.pathname.match(/emails\/booking\/[^/]+\/([^/]+)\.json$/);
      if (match) ids.push(match[1]);
    }

    // 3. Skip already-read for cleaner stats
    const existing = await loadReadState();
    const newIds = ids.filter(id => !existing[id]);

    if (!dryRun && newIds.length > 0) {
      await markManyRead(newIds);
    }

    return res.status(200).json({
      success: true,
      dry_run: dryRun,
      stats: {
        blobs_listed: all.length,
        ids_extracted: ids.length,
        already_read_skipped: ids.length - newIds.length,
        newly_marked_read: newIds.length,
      },
    });
  } catch (err) {
    console.error('mark-all-booking-emails-read error:', err);
    return res.status(500).json({ error: err.message });
  }
}
