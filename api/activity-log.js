import { loadLog, appendEntry, updateEntryStatus, deleteEntry } from './_activity-log.js';

/*
 * /api/activity-log
 *
 *   GET                                       → { entries: [...] }
 *   GET ?booking_id=X                         → entries linked to booking X
 *   GET ?status=waiting                       → entries with that status
 *   POST  { action, category, ... }           → append new entry
 *   PATCH { id, status, follow_up_date? }     → update status
 *   DELETE { id }                             → remove entry
 *
 * Append-only by intent. DELETE exists for genuine accidental entries.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      let entries = await loadLog();

      const bookingId = req.query.booking_id;
      if (bookingId) {
        entries = entries.filter(e =>
          Array.isArray(e.booking_ids) && e.booking_ids.includes(bookingId)
        );
      }

      const status = req.query.status;
      if (status) entries = entries.filter(e => e.status === status);

      // Newest first
      entries.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

      return res.status(200).json({ success: true, entries, count: entries.length });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      if (!body.action || !String(body.action).trim()) {
        return res.status(400).json({ error: 'action required' });
      }
      const record = await appendEntry(body);
      return res.status(200).json({ success: true, entry: record });
    }

    if (req.method === 'PATCH') {
      const body = req.body || {};
      if (!body.id) return res.status(400).json({ error: 'id required' });
      if (!body.status) return res.status(400).json({ error: 'status required' });
      const valid = ['done', 'waiting', 'follow_up'];
      if (!valid.includes(body.status)) {
        return res.status(400).json({ error: 'status must be one of ' + valid.join(', ') });
      }
      const opts = {};
      if ('follow_up_date' in body) opts.follow_up_date = body.follow_up_date;
      const updated = await updateEntryStatus(body.id, body.status, opts);
      if (!updated) return res.status(404).json({ error: 'entry not found' });
      return res.status(200).json({ success: true, entry: updated });
    }

    if (req.method === 'DELETE') {
      const body = req.body || {};
      const id = body.id || req.query.id;
      if (!id) return res.status(400).json({ error: 'id required' });
      const result = await deleteEntry(id);
      if (!result) return res.status(404).json({ error: 'entry not found' });
      return res.status(200).json({ success: true, ...result });
    }

    return res.status(405).json({ error: 'GET, POST, PATCH, DELETE only' });
  } catch (err) {
    console.error('activity-log error:', err);
    return res.status(500).json({ error: err.message });
  }
}
