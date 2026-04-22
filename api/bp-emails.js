import { list } from '@vercel/blob';

/*
 * bp-emails — lodge email thread for a booking.
 *
 * Primary lookup: list blobs under emails/booking/{bookingId}/
 *
 * Fallback (if primary returns 0 AND ?lodge=NAME is provided):
 * scan all emails/booking/ blobs, fetch each, and match by lodge name
 * appearing in subject/body/from/to. Handles the case where emails
 * exist in blob under an older/different bookingId for the same lodge
 * (stale from booking recreation or legacy lodge_correspondence routing).
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  var bookingId = req.query.booking_id;
  if (!bookingId) return res.status(400).json({ error: 'booking_id required' });

  var lodgeName = (req.query.lodge || '').trim();
  var prefix = 'emails/booking/' + bookingId + '/';

  try {
    // ─── Primary lookup ───
    var result = await list({ prefix: prefix });
    var blobs = result.blobs || [];

    var emails = [];
    var fetchErrors = 0;
    for (var i = 0; i < blobs.length; i++) {
      try {
        var response = await fetch(blobs[i].url);
        var data = await response.json();
        emails.push(data);
      } catch(e) {
        fetchErrors++;
        console.error('Failed to fetch blob:', blobs[i].url, e.message);
      }
    }

    var fallbackUsed = false;
    var fallbackScanned = 0;

    // ─── Fallback: search by lodge name when primary is empty ───
    if (emails.length === 0 && lodgeName) {
      fallbackUsed = true;
      var needle = lodgeName.toLowerCase();

      var allBlobs = [];
      var cursor = undefined;
      var page = 0;
      while (page < 20) {
        var pageResult = await list({
          prefix: 'emails/booking/',
          limit: 1000,
          cursor: cursor,
        });
        allBlobs = allBlobs.concat(pageResult.blobs || []);
        if (!pageResult.hasMore || !pageResult.cursor) break;
        cursor = pageResult.cursor;
        page++;
      }

      for (var j = 0; j < allBlobs.length; j++) {
        var b = allBlobs[j];
        // Skip blobs under the original (empty) prefix we already scanned
        if (b.pathname.indexOf(prefix) === 0) continue;
        fallbackScanned++;
        try {
          var r = await fetch(b.url);
          var em = await r.json();
          var haystack = [
            em.subject || em.email_subject || '',
            em.body || em.email_content || '',
            em.from || em.email_from || '',
            em.to || '',
          ].join(' ').toLowerCase();
          if (haystack.indexOf(needle) > -1) {
            emails.push(em);
          }
        } catch (e) {
          fetchErrors++;
        }
      }
    }

    emails.sort(function(a, b) {
      return new Date(b.date || b.email_date || 0) - new Date(a.date || a.email_date || 0);
    });

    res.status(200).json({
      success: true,
      emails: emails,
      count: emails.length,
      _diag: {
        prefix_searched: prefix,
        blobs_found: blobs.length,
        fetch_errors: fetchErrors,
        fallback_used: fallbackUsed,
        fallback_lodge: fallbackUsed ? lodgeName : null,
        fallback_scanned: fallbackScanned,
      }
    });
  } catch(err) {
    res.status(500).json({ error: err.message, prefix_searched: prefix });
  }
}
