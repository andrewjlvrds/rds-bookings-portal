import { list } from '@vercel/blob';

/*
 * Diagnostic: lists all booking IDs that have emails stored in blob.
 * Optional ?lodge=NAME filter matches any blob whose contents mention
 * that lodge (slower — fetches each blob).
 *
 * Useful for confirming whether a "0 emails" result on a booking is
 * because no emails exist for it, or because they're keyed under a
 * different bookingId (legacy pathway).
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  var lodgeFilter = (req.query.lodge || '').toLowerCase();

  try {
    // Paginate through all blobs under emails/booking/
    var allBlobs = [];
    var cursor = undefined;
    var pageCount = 0;
    while (pageCount < 20) {
      var page = await list({
        prefix: 'emails/booking/',
        limit: 1000,
        cursor: cursor,
      });
      allBlobs = allBlobs.concat(page.blobs || []);
      if (!page.hasMore || !page.cursor) break;
      cursor = page.cursor;
      pageCount++;
    }

    // Group by bookingId extracted from pathname
    var byBooking = {};
    allBlobs.forEach(function(b) {
      var match = b.pathname.match(/^emails\/booking\/([^/]+)\//);
      if (!match) return;
      var bookingId = match[1];
      if (!byBooking[bookingId]) byBooking[bookingId] = { booking_id: bookingId, count: 0, latest: null };
      byBooking[bookingId].count++;
      if (!byBooking[bookingId].latest || b.uploadedAt > byBooking[bookingId].latest) {
        byBooking[bookingId].latest = b.uploadedAt;
      }
    });

    var summary = Object.values(byBooking);

    // If lodge filter given, fetch contents of first blob per booking and check
    if (lodgeFilter) {
      var filtered = [];
      for (var i = 0; i < summary.length; i++) {
        var b = summary[i];
        var firstBlob = allBlobs.find(function(x) {
          return x.pathname.indexOf('emails/booking/' + b.booking_id + '/') === 0;
        });
        if (!firstBlob) continue;
        try {
          var r = await fetch(firstBlob.url);
          var txt = (await r.text()).toLowerCase();
          if (txt.indexOf(lodgeFilter) > -1) {
            filtered.push(b);
          }
        } catch (e) { /* skip */ }
      }
      summary = filtered;
    }

    // Sort by count desc
    summary.sort(function(a, b) { return b.count - a.count; });

    res.status(200).json({
      success: true,
      total_blobs: allBlobs.length,
      total_bookings_with_emails: summary.length,
      bookings: summary.slice(0, 100),
      filtered_by_lodge: lodgeFilter || null,
    });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
}
