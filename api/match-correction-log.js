import { loadCorrections, appendCorrection } from './_match-correction-log.js';

/*
 * /api/match-correction-log
 *
 *   GET                          → { entries: [...] }     (all corrections, newest first)
 *   GET ?summarise=1             → { entries, summary }   (with aggregation)
 *   POST { ...correctionFields } → append one record
 *
 * Read endpoint also returns a summary when ?summarise=1, grouped by
 * original match_method and by lodge name, so we can spot patterns
 * like "lodge_name_unique gets corrected 80% of the time" or
 * "every Helicopter Horizons reply gets reassigned".
 *
 * Append is fire-and-forget from the front end — failure to log a
 * correction is not allowed to block the actual reassignment.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const entries = await loadCorrections();
      entries.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

      const out = { success: true, count: entries.length, entries };

      if (req.query.summarise) {
        const byMethod = {};
        const byLodge = {};
        const bySurface = {};
        for (const e of entries) {
          const m = e.original_match_method || 'unknown';
          byMethod[m] = (byMethod[m] || 0) + 1;
          const l = e.new_booking_lodge || 'unknown';
          byLodge[l] = (byLodge[l] || 0) + 1;
          const s = e.surface || 'unknown';
          bySurface[s] = (bySurface[s] || 0) + 1;
        }
        const sortDesc = (obj) => Object.entries(obj)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => ({ key: k, count: v }));
        out.summary = {
          total: entries.length,
          by_match_method: sortDesc(byMethod),
          by_corrected_lodge: sortDesc(byLodge),
          by_surface: sortDesc(bySurface),
        };
      }

      return res.status(200).json(out);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      if (!body.email_id) return res.status(400).json({ error: 'email_id required' });
      if (!body.new_booking_id) return res.status(400).json({ error: 'new_booking_id required' });
      const record = await appendCorrection(body);
      return res.status(200).json({ success: true, entry: record });
    }

    return res.status(405).json({ error: 'GET or POST only' });
  } catch (err) {
    console.error('match-correction-log error:', err);
    return res.status(500).json({ error: err.message });
  }
}
