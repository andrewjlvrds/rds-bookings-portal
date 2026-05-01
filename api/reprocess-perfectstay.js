import { list, put, del } from '@vercel/blob';
import { zohoApi } from './_zoho.js';
import { routePerfectstayEmail } from './_perfectstay-router.js';

/*
 * /api/reprocess-perfectstay (POST)
 *
 * One-shot retrofit. Walks every email currently sitting in
 * emails/unmatched/ (and the most recent emails/booking/ window),
 * finds Perfectstay senders, and re-routes them to the correct
 * Lodge_Booking using the body parser.
 *
 * Use case: cleanup at cutover. After we ship the going-forward
 * Perfectstay routing, the existing 30+ in the Inbox don't move.
 * Run this once to back-fill them.
 *
 * For each Perfectstay email:
 *   1. Run routePerfectstayEmail() against body + lodges directory
 *   2. If it finds a unique Lodge_Booking → move blob to emails/booking/{id}/
 *      and tag with match_method='perfectstay_router_retrofit'
 *   3. If not → leave in place
 *
 * Modes:
 *   POST                          → process unmatched bucket only
 *   POST ?include_booking=1       → also re-process Perfectstay emails
 *                                    already in emails/booking/ (in case
 *                                    earlier matching put them on the
 *                                    wrong booking)
 *   POST ?dry_run=1               → report what would happen, write nothing
 *
 * Idempotent. Re-running after success is a no-op.
 */

async function listAll(prefix) {
  var out = [];
  var cursor;
  for (var i = 0; i < 50; i++) {
    var opts = { prefix: prefix };
    if (cursor) opts.cursor = cursor;
    var r = await list(opts);
    if (r.blobs) out.push.apply(out, r.blobs);
    if (!r.hasMore) break;
    cursor = r.cursor;
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    var dryRun = req.query.dry_run === '1' || req.query.dry_run === 'true';
    var includeBooking = req.query.include_booking === '1' || req.query.include_booking === 'true';

    // Load the lodges directory for body→lodge name matching
    var lodgeResult = await zohoApi('GET', 'Lodges?fields=Name,Email,Preferred_Email&per_page=200');
    var allLodges = (lodgeResult && lodgeResult.data) || [];

    // List candidate blobs
    var prefixes = ['emails/unmatched/'];
    if (includeBooking) prefixes.push('emails/booking/');
    var blobs = [];
    for (var p = 0; p < prefixes.length; p++) {
      var bs = await listAll(prefixes[p]);
      blobs.push.apply(blobs, bs);
    }

    var stats = {
      blobs_listed: blobs.length,
      perfectstay_found: 0,
      routed_unique: 0,
      no_match: 0,
      already_routed_correctly: 0,
      errors: 0,
    };
    var detail = [];

    for (var i = 0; i < blobs.length; i++) {
      var b = blobs[i];
      try {
        var r = await fetch(b.url, { cache: 'no-store' });
        if (!r.ok) continue;
        var record = await r.json();
        var from = record.from || record.email_from || '';
        if (from.toLowerCase().indexOf('bookings@perfectstay.org') === -1) continue;

        stats.perfectstay_found++;
        var body = record.body || record.email_content || '';
        var routeResult = await routePerfectstayEmail(from, body, allLodges);

        if (!routeResult.booking) {
          stats.no_match++;
          detail.push({
            blob: b.pathname,
            outcome: 'no_match',
            reason: routeResult.reason,
            lodge: routeResult.lodge || null,
            date: routeResult.date || null,
          });
          continue;
        }

        var newBookingId = routeResult.booking.id;

        // If already correctly routed, skip
        if (record.booking_id === newBookingId) {
          stats.already_routed_correctly++;
          continue;
        }

        if (dryRun) {
          stats.routed_unique++;
          detail.push({
            blob: b.pathname,
            outcome: 'would_route',
            booking_id: newBookingId,
            lodge: routeResult.lodge,
            date: routeResult.date,
          });
          continue;
        }

        // Real move: rewrite record + write to new path + delete original
        var newRecord = Object.assign({}, record, {
          booking_id: newBookingId,
          match_method: (record.match_method ? record.match_method + '+' : '') + 'perfectstay_router_retrofit',
          routed_at: new Date().toISOString(),
          routed_from: b.pathname,
          previous_booking_id: record.booking_id || null,
        });

        var safeId = record.id || b.pathname.split('/').pop().replace(/\.json$/, '');
        var destPath = 'emails/booking/' + newBookingId + '/' + safeId + '.json';

        await put(destPath, JSON.stringify(newRecord), {
          access: 'public',
          contentType: 'application/json',
          addRandomSuffix: false,
        });

        try { await del(b.url); }
        catch (delErr) { console.error('reprocess-perfectstay: delete failed for', b.url, delErr.message); }

        stats.routed_unique++;
        detail.push({
          blob: b.pathname,
          outcome: 'routed',
          booking_id: newBookingId,
          lodge: routeResult.lodge,
          date: routeResult.date,
        });
      } catch (err) {
        stats.errors++;
        console.error('reprocess-perfectstay error on', b.pathname, err.message);
      }
    }

    return res.status(200).json({
      success: true,
      dry_run: dryRun,
      include_booking: includeBooking,
      stats: stats,
      detail: detail,
    });
  } catch (err) {
    console.error('reprocess-perfectstay error:', err);
    return res.status(500).json({ error: err.message });
  }
}
