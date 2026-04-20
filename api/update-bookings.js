import { zohoApi } from './_zoho.js';

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
    var bookingIds = body.booking_ids || [];
    var updates = body.updates || {};
    var inputRecords = body.records || null; // alternative: array of {id, ...fields}

    // Two supported shapes:
    //   1. { booking_ids: [...], updates: {...} } — uniform update across all IDs
    //   2. { records: [{id, Field: value, ...}, ...] } — per-row updates
    var records;
    if (Array.isArray(inputRecords) && inputRecords.length) {
      records = inputRecords.filter(function(r) { return r && r.id; });
      if (!records.length) {
        return res.status(400).json({ error: 'No valid records provided' });
      }
    } else {
      if (!bookingIds.length) {
        return res.status(400).json({ error: 'No booking IDs provided' });
      }
      if (!Object.keys(updates).length) {
        return res.status(400).json({ error: 'No updates provided' });
      }
      records = bookingIds.map(function(id) {
        return Object.assign({ id: id }, updates);
      });
    }

    // Zoho allows max 100 records per update
    var results = [];
    var errors = [];

    for (var i = 0; i < records.length; i += 100) {
      var batch = records.slice(i, i + 100);
      var result = await zohoApi('PUT', 'Lodge_Bookings', { data: batch });

      if (result && result.data) {
        result.data.forEach(function(r) {
          if (r.status === 'success') {
            results.push(r.details.id);
          } else {
            errors.push({ id: r.details ? r.details.id : 'unknown', error: r.message });
          }
        });
      }
    }

    res.status(200).json({
      success: true,
      updated: results.length,
      errors: errors.length,
      details: { updated: results, errors: errors },
    });

  } catch(err) {
    console.error('update-bookings error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
