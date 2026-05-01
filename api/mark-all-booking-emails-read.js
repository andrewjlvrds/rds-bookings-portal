import { list } from '@vercel/blob';
import { loadReadState, markManyRead } from './_read-state.js';

/*
 * /api/mark-all-booking-emails-read
 *
 * Bulk mark-as-read for backlog drainage.
 *
 * Modes:
 *   POST                          → marks everything under emails/booking/
 *   POST ?older_than_days=3       → marks only blobs uploadedAt > N days ago
 *   POST ?include_unmatched=1     → also clear unmatched + tour-bucket
 *   POST ?dry_run=1               → reports counts, writes nothing
 *
 * Use case: Helen at cutover wants new mail from the past few days to
 * surface and everything older nuked. Pass older_than_days=3 +
 * include_unmatched=1 to clear the historical backlog across all
 * three buckets (booking, unmatched, tour-bucket).
 *
 * How it works:
 *   1. List relevant blobs (paths only, fast)
 *   2. Filter by uploadedAt if older_than_days is set
 *   3. Derive email IDs from filenames (== safeId == record.id)
 *   4. Bulk-write to read-state in one operation
 *
 * No blob fetching — path + uploadedAt is enough. Fast (a few seconds)
 * regardless of volume.
 *
 * uploadedAt vs email-received-date: uploadedAt is when the matcher
 * stored the email, not when the lodge sent it. For backfilled
 * historical emails these can differ. Acceptable tradeoff — anything
 * a lodge cares about will follow up and re-surface as a new email.
 */
async function listPrefix(prefix) {
  const all = [];
  let cursor;
  for (let i = 0; i < 50; i++) {
    const opts = { prefix };
    if (cursor) opts.cursor = cursor;
    const r = await list(opts);
    if (r.blobs) all.push(...r.blobs);
    if (!r.hasMore) break;
    cursor = r.cursor;
  }
  return all;
}

function extractId(pathname) {
  // emails/booking/{bookingId}/{safeId}.json
  // emails/unmatched/{safeId}.json
  // emails/tour-bucket/{tourKey}/{safeId}.json
  const m = pathname.match(/\/([^/]+)\.json$/);
  return m ? m[1] : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const dryRun = req.query.dry_run === '1' || req.query.dry_run === 'true';
    const includeUnmatched = req.query.include_unmatched === '1' || req.query.include_unmatched === 'true';
    const olderThanDays = req.query.older_than_days ? parseFloat(req.query.older_than_days) : null;
    const cutoffMs = (olderThanDays && !isNaN(olderThanDays))
      ? Date.now() - (olderThanDays * 86400_000)
      : null;

    const prefixes = ['emails/booking/'];
    if (includeUnmatched) {
      prefixes.push('emails/unmatched/');
      prefixes.push('emails/tour-bucket/');
    }
    const blobLists = await Promise.all(prefixes.map(p => listPrefix(p)));
    const all = blobLists.flat();

    const eligible = cutoffMs !== null
      ? all.filter(b => {
          if (!b.uploadedAt) return true;
          return new Date(b.uploadedAt).getTime() < cutoffMs;
        })
      : all;

    const ids = [];
    for (const b of eligible) {
      const id = extractId(b.pathname);
      if (id) ids.push(id);
    }

    const existing = await loadReadState();
    const newIds = ids.filter(id => !existing[id]);

    if (!dryRun && newIds.length > 0) {
      await markManyRead(newIds);
    }

    return res.status(200).json({
      success: true,
      dry_run: dryRun,
      cutoff_days: olderThanDays,
      cutoff_iso: cutoffMs !== null ? new Date(cutoffMs).toISOString() : null,
      include_unmatched: includeUnmatched,
      prefixes_scanned: prefixes,
      stats: {
        blobs_listed: all.length,
        eligible_after_cutoff: eligible.length,
        kept_recent: all.length - eligible.length,
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
