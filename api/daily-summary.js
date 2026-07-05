import { list } from '@vercel/blob';
import { loadReadState } from './_read-state.js';

/*
 * /api/daily-summary?days=7
 *
 * Feeds the Lodge Bookings landing page flow summary: what came in,
 * where it was auto-filed, and what needs Helen's routing — the same
 * shape as the correspondence pipeline (proof tiers → judgment →
 * queues → triage).
 *
 * Buckets inbound emails from the last N days (default 7) by how they
 * were matched:
 *   auto     — proof tiers + label import (message_id_header,
 *              gmail_thread_id, rds_ref*, zoho_rds_ref, lodge_name*,
 *              sender_email*, group_ab*, label_import*)
 *   manual   — Helen routed or reassigned it (manual_route/reassign)
 *   queued   — sitting in unmatched or tour-bucket right now
 *
 * Fast path: list() gives pathname + uploadedAt; only blobs inside the
 * window are fetched for direction/match_method. Queue sizes are
 * path counts, no fetches.
 */

const AUTO_PREFIXES = [
  'message_id_header', 'gmail_thread_id', 'rds_ref', 'zoho_rds_ref',
  'lodge_name', 'sender_email', 'group_ab', 'label_import', 'ai_judgment',
];

function classify(method) {
  const m = (method || '').toLowerCase();
  if (m.includes('manual_route') || m.includes('manual_reassign')) return 'manual';
  for (const p of AUTO_PREFIXES) if (m.startsWith(p) || m.includes('+' + p)) return 'auto';
  return 'auto'; // stored on a booking by any other route still counts as filed
}

async function listAll(prefix) {
  const all = [];
  let cursor;
  for (let i = 0; i < 20; i++) {
    const opts = { prefix, limit: 1000 };
    if (cursor) opts.cursor = cursor;
    const r = await list(opts);
    if (r.blobs) all.push(...r.blobs);
    if (!r.hasMore) break;
    cursor = r.cursor;
  }
  return all;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    const days = Math.min(parseInt(req.query.days, 10) || 7, 30);
    const includeEmails = req.query.include === 'emails';
    const emailLists = { came_in: [], auto_filed: [], manual: [], needs_routing: [] };
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const [bookingBlobs, unmatchedBlobs, tourBucketBlobs] = await Promise.all([
      listAll('emails/booking/'),
      listAll('emails/unmatched/'),
      listAll('emails/tour-bucket/'),
    ]);

    const recent = bookingBlobs.filter(b =>
      b.uploadedAt && new Date(b.uploadedAt).getTime() >= cutoff);

    // Per-day skeleton, oldest → newest
    const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
    const daysArr = [];
    for (let i = days - 1; i >= 0; i--) {
      daysArr.push(dayKey(Date.now() - i * 24 * 60 * 60 * 1000));
    }
    const perDay = {};
    daysArr.forEach(k => { perDay[k] = { inbound: 0, auto: 0, manual: 0 }; });

    // Fetch only the in-window booking blobs (batched, time-capped)
    const t0 = Date.now();
    let fetched = 0;
    for (let i = 0; i < recent.length; i += 25) {
      if (Date.now() - t0 > 30000) break;
      const batch = recent.slice(i, i + 25);
      const rows = await Promise.all(batch.map(async (b) => {
        try {
          const r = await fetch(b.url, { cache: 'no-store' });
          if (!r.ok) return null;
          return { blob: b, rec: await r.json() };
        } catch (e) { return null; }
      }));
      for (const row of rows) {
        if (!row) continue;
        fetched++;
        const { blob, rec } = row;
        const inbound = rec.direction === 'inbound' ||
          rec.type === 'lodge_inbound' || rec.type === 'lodge_reply';
        if (!inbound) continue;
        const k = dayKey(blob.uploadedAt);
        if (!perDay[k]) continue;
        perDay[k].inbound++;
        const cls = classify(rec.match_method);
        perDay[k][cls]++;
        if (includeEmails) {
          const light = {
            id: rec.id,
            subject: rec.subject || '',
            from: rec.from || '',
            date: rec.date || blob.uploadedAt,
            booking_id: rec.booking_id || null,
            match_method: rec.match_method || null,
          };
          emailLists.came_in.push(light);
          emailLists[cls === 'manual' ? 'manual' : 'auto_filed'].push(light);
        }
      }
    }

    // Queue counts use the inbox's definition — inbound and not dismissed —
    // so the landing card and the inbox badge always agree.
    const readState = await loadReadState();
    async function countActionable(blobs) {
      let n = 0, recent = 0;
      for (let i = 0; i < blobs.length; i += 25) {
        const batch = blobs.slice(i, i + 25);
        const rows = await Promise.all(batch.map(async (b) => {
          try {
            const r = await fetch(b.url, { cache: 'no-store' });
            if (!r.ok) return null;
            return { blob: b, rec: await r.json() };
          } catch (e) { return null; }
        }));
        for (const row of rows) {
          if (!row) continue;
          const { blob, rec } = row;
          const inbound = rec.direction === 'inbound' ||
            rec.type === 'lodge_inbound' || rec.type === 'lodge_reply';
          if (!inbound || readState[rec.id]) continue;
          n++;
          if (blob.uploadedAt && new Date(blob.uploadedAt).getTime() >= cutoff) recent++;
          if (includeEmails) {
            emailLists.needs_routing.push({
              id: rec.id,
              subject: rec.subject || '',
              from: rec.from || '',
              date: rec.date || blob.uploadedAt,
              match_hints: rec.match_hints || null,
              blob_path: blob.pathname,
            });
          }
        }
      }
      return { n, recent };
    }
    const [umC, tbC] = await Promise.all([
      countActionable(unmatchedBlobs),
      countActionable(tourBucketBlobs),
    ]);
    const recentUnmatched = umC.recent;
    const recentTourBucket = tbC.recent;

    const totals = { inbound: 0, auto: 0, manual: 0 };
    daysArr.forEach(k => {
      totals.inbound += perDay[k].inbound;
      totals.auto += perDay[k].auto;
      totals.manual += perDay[k].manual;
    });
    totals.inbound += recentUnmatched + recentTourBucket;

    return res.status(200).json({
      success: true,
      window_days: days,
      totals: {
        came_in: totals.inbound,
        auto_filed: totals.auto,
        manually_routed: totals.manual,
        new_needs_routing: recentUnmatched + recentTourBucket,
      },
      queues: {
        unmatched: umC.n,
        tour_bucket: tbC.n,
      },
      per_day: daysArr.map(k => ({ day: k, ...perDay[k] })),
      emails: includeEmails ? Object.fromEntries(Object.entries(emailLists).map(([k, arr]) => [k,
        arr.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 200)])) : undefined,
      scanned: { in_window: recent.length, fetched },
    });
  } catch (err) {
    console.error('daily-summary error:', err);
    return res.status(500).json({ error: err.message });
  }
}
