import { list, put } from '@vercel/blob';
import { zohoApi } from './_zoho.js';
import { buildMatchMaps, buildEmailMap, matchEmailToBooking } from './_email-match.js';

/*
 * /api/backfill-hints
 *
 * One-off (re-runnable) sweep: re-run the matcher over everything in
 * emails/unmatched/ and write match_hints onto each blob so the inbox
 * triage chips cover the existing queue, not just new arrivals.
 *
 * Does NOT auto-route, even when the matcher now finds a confident
 * match — automatic re-routing of the queue is the Phase 2 re-match
 * cron. This endpoint only annotates. A blob whose matcher run now
 * returns a solid booking gets that booking as the top hint instead.
 *
 * POST only. ?dry_run=1 reports without writing.
 */
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const dryRun = req.query.dry_run === '1';

  try {
    // Bookings + lodges snapshot (same fields the poll uses for matching)
    const bookingFields = 'Name,Lodge_Name,RDS_Reference,Status,Check_in_Date,Check_out_Date,Lodge,Tour,id';
    let allBookings = [];
    for (let page = 1; page <= 5; page++) {
      const r = await zohoApi('GET', 'Lodge_Bookings?fields=' + bookingFields + '&per_page=200&page=' + page);
      const data = (r && r.data) || [];
      allBookings = allBookings.concat(data);
      if (!(r && r.info && r.info.more_records)) break;
    }
    const lodgeResult = await zohoApi('GET',
      'Lodges?fields=Name,Email,Preferred_Email,Email_Reservations_2,Secondary_Email,Email_4,Email_Accounts&per_page=200');
    const allLodges = (lodgeResult && lodgeResult.data) || [];

    const maps = buildMatchMaps(allBookings);
    const emailMap = buildEmailMap(allLodges);

    // Queue blobs
    const blobs = [];
    let cursor;
    for (let i = 0; i < 5; i++) {
      const opts = { prefix: 'emails/unmatched/', limit: 1000 };
      if (cursor) opts.cursor = cursor;
      const r = await list(opts);
      if (r.blobs) blobs.push(...r.blobs);
      if (!r.hasMore) break;
      cursor = r.cursor;
    }

    const t0 = Date.now();
    let scanned = 0, hinted = 0, solidMatches = 0, skipped = 0;
    for (let i = 0; i < blobs.length; i += 15) {
      if (Date.now() - t0 > 45000) break;
      const batch = blobs.slice(i, i + 15);
      await Promise.all(batch.map(async (b) => {
        try {
          const r = await fetch(b.url, { cache: 'no-store' });
          if (!r.ok) return;
          const rec = await r.json();
          scanned++;
          const inbound = rec.direction === 'inbound' ||
            rec.type === 'lodge_inbound' || rec.type === 'lodge_reply';
          if (!inbound) { skipped++; return; }

          const m = matchEmailToBooking(
            rec.subject || '', rec.body || '', rec.from || '',
            maps.refMap, maps.nameMap, emailMap);

          let hints = m.hints || null;
          if (m.booking) {
            // Matcher now resolves it — surface as the confident top hint
            let lodge = m.booking.Lodge_Name || m.booking.Name || '';
            if (typeof lodge === 'object' && lodge !== null) lodge = lodge.name || '';
            let tour = m.booking.Tour;
            if (typeof tour === 'object' && tour !== null) tour = tour.name || '';
            hints = [{
              id: m.booking.id,
              lodge: String(lodge).split(' - ')[0].trim(),
              tour: tour || '',
              check_in: m.booking.Check_in_Date || '',
              score: 99,
              confident: true,
            }].concat((m.hints || []).filter(h => h.id !== m.booking.id)).slice(0, 3);
            solidMatches++;
          }
          if (!hints || hints.length === 0) return;
          hinted++;
          if (dryRun) return;
          rec.match_hints = hints;
          rec.hints_backfilled_at = new Date().toISOString();
          await put(b.pathname, JSON.stringify(rec), {
            access: 'public',
            contentType: 'application/json',
            addRandomSuffix: false,
            allowOverwrite: true,
          });
        } catch (e) { /* skip blob */ }
      }));
    }

    return res.status(200).json({
      success: true,
      dry_run: dryRun,
      queue_blobs: blobs.length,
      scanned,
      skipped_non_inbound: skipped,
      hinted,
      matcher_now_confident: solidMatches,
      bookings_in_snapshot: allBookings.length,
    });
  } catch (err) {
    console.error('backfill-hints error:', err);
    return res.status(500).json({ error: err.message });
  }
}
