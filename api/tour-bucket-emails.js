import { list } from '@vercel/blob';

/*
 * tour-bucket-emails — tour-level correspondence that couldn't be matched
 * to a specific lodge booking.
 *
 * These are emails the reindex scripts routed to emails/tour-bucket/{safeKey}/
 * because a Gmail label told us the tour, but no booking matched the lodge or
 * dates. Helen sees these in the Correspondence tab to manually review.
 *
 * Query params:
 *   ?tour_key=FoSA_Apr_26   — return emails for one tour (the safe key)
 *   (no param)              — return a summary of all tour buckets with counts
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  var t0 = Date.now();
  var tourKey = (req.query && req.query.tour_key) || null;

  try {
    if (tourKey) {
      // ── Single tour: fetch all emails in that bucket ──
      var prefix = 'emails/tour-bucket/' + tourKey + '/';
      var blobs = [];
      var cursor = null;
      var pages = 0;
      while (pages < 5) {
        var r = await list({ prefix: prefix, limit: 500, cursor: cursor });
        blobs = blobs.concat(r.blobs || []);
        cursor = r.cursor;
        pages++;
        if (!cursor) break;
      }

      // Fetch each blob's content
      var emails = [];
      var fetchErrors = 0;
      // Parallel in batches of 20
      for (var bi = 0; bi < blobs.length; bi += 20) {
        var batch = blobs.slice(bi, bi + 20);
        var results = await Promise.all(batch.map(function(b) {
          return fetch(b.url)
            .then(function(rr) { return rr.ok ? rr.json() : null; })
            .catch(function() { return null; });
        }));
        for (var ri = 0; ri < results.length; ri++) {
          if (results[ri]) emails.push(results[ri]);
          else fetchErrors++;
        }
      }

      // Newest first
      emails.sort(function(a, b) {
        return new Date(b.date || 0) - new Date(a.date || 0);
      });

      return res.status(200).json({
        success: true,
        tour_key: tourKey,
        emails: emails,
        count: emails.length,
        fetch_errors: fetchErrors,
        elapsed_ms: Date.now() - t0,
      });
    }

    // ── No tour_key: list all tour buckets with counts ──
    var allBlobs = [];
    var cursor2 = null;
    var pages2 = 0;
    while (pages2 < 10) {
      var r2 = await list({ prefix: 'emails/tour-bucket/', limit: 1000, cursor: cursor2 });
      allBlobs = allBlobs.concat(r2.blobs || []);
      cursor2 = r2.cursor;
      pages2++;
      if (!cursor2) break;
    }

    // Group by tour key (first path segment after tour-bucket/)
    var buckets = {};
    for (var i = 0; i < allBlobs.length; i++) {
      var path = allBlobs[i].pathname || '';
      // path looks like: emails/tour-bucket/FoSA_Apr_26/msgid.json
      var match = path.match(/emails\/tour-bucket\/([^/]+)\//);
      if (match) {
        var key = match[1];
        if (!buckets[key]) buckets[key] = 0;
        buckets[key]++;
      }
    }

    // Convert to sorted array
    var bucketList = Object.keys(buckets).map(function(k) {
      return { tour_key: k, count: buckets[k] };
    }).sort(function(a, b) { return a.tour_key.localeCompare(b.tour_key); });

    return res.status(200).json({
      success: true,
      buckets: bucketList,
      total_emails: allBlobs.length,
      elapsed_ms: Date.now() - t0,
    });
  } catch (e) {
    res.status(500).json({ error: e.message, elapsed_ms: Date.now() - t0 });
  }
}
