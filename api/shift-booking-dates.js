import { zohoApi } from './_zoho.js';

/**
 * Shift per-booking check-in and check-out dates.
 *
 * Body: { shifts: [{ id, check_in, check_out }] }
 *
 * Each booking gets its own dates (unlike update-bookings which applies
 * a uniform update across all IDs). Used when a tour's departure date
 * changes and every lodge booking needs to move by the same day offset.
 */
export default async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  try {
    var body = req.body || {};
    var shifts = Array.isArray(body.shifts) ? body.shifts : [];

    if (!shifts.length) {
      return res.status(400).json({ error: 'No shifts provided' });
    }

    // Build per-record updates. Zoho accepts up to 100 records per PUT.
    var records = shifts.map(function(s) {
      var rec = { id: s.id };
      if (s.check_in)  rec.Check_in_Date  = s.check_in;
      if (s.check_out) rec.Check_out_Date = s.check_out;
      return rec;
    });

    var updated = [];
    var errors = [];

    for (var i = 0; i < records.length; i += 100) {
      var batch = records.slice(i, i + 100);
      var result = await zohoApi('PUT', 'Lodge_Bookings', { data: batch });

      if (result && result.data) {
        result.data.forEach(function(r) {
          if (r.status === 'success') {
            updated.push(r.details.id);
          } else {
            errors.push({
              id: r.details ? r.details.id : 'unknown',
              error: r.message || 'Update failed',
            });
          }
        });
      }
    }

    return res.status(200).json({
      success: errors.length === 0,
      updated: updated.length,
      errors: errors.length,
      details: { updated: updated, errors: errors },
    });

  } catch (err) {
    console.error('shift-booking-dates error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
