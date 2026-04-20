// One-off migration: adds "Z " prefix to Day_Description on every existing
// Cancelled lodge booking that doesn't already have it. Matches the
// isActiveBooking convention used across the portal.
//
// Hit GET /api/backfill-z-prefix once, then this file can be deleted.

import { zohoApi } from './_zoho.js';

export default async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Zoho doesn't let us filter on Status server-side from a simple GET, so
    // fetch the module in pages and filter client-side.
    const records = [];
    let page = 1;
    const perPage = 200;
    const fields = ['id', 'Name', 'Status', 'Day_Description'];

    // Cap at 20 pages = 4000 records — enough for this module
    for (let i = 0; i < 20; i++) {
      const result = await zohoApi(
        'GET',
        'Lodge_Bookings?fields=' + fields.join(',') + '&per_page=' + perPage + '&page=' + page
      );
      const batch = (result && result.data) || [];
      if (!batch.length) break;
      records.push(...batch);
      if (batch.length < perPage) break;
      page += 1;
    }

    // Find cancelled without Z prefix
    const toFix = records
      .filter(r => {
        const status = (r.Status || '').toString().trim();
        if (status !== 'Cancelled') return false;
        const desc = r.Day_Description || '';
        return desc && !/^z\s/i.test(desc);
      })
      .map(r => ({ id: r.id, Day_Description: 'Z ' + r.Day_Description }));

    if (!toFix.length) {
      return res.status(200).json({
        success: true,
        scanned: records.length,
        updated: 0,
        message: 'Nothing to backfill.',
      });
    }

    // PUT in batches of 100
    let updatedCount = 0;
    const errors = [];
    for (let i = 0; i < toFix.length; i += 100) {
      const batch = toFix.slice(i, i + 100);
      const result = await zohoApi('PUT', 'Lodge_Bookings', { data: batch });
      if (result && result.data) {
        result.data.forEach(r => {
          if (r.status === 'success') updatedCount += 1;
          else errors.push({ id: r.details ? r.details.id : 'unknown', error: r.message });
        });
      }
    }

    return res.status(200).json({
      success: true,
      scanned: records.length,
      cancelled: records.filter(r => (r.Status || '') === 'Cancelled').length,
      updated: updatedCount,
      errors: errors.length,
      error_details: errors.slice(0, 10),
      updated_samples: toFix.slice(0, 5).map(r => ({ id: r.id, Day_Description: r.Day_Description })),
    });
  } catch (err) {
    console.error('backfill-z-prefix error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
