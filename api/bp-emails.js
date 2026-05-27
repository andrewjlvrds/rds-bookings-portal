import { list } from '@vercel/blob';

/*
 * bp-emails — lodge email thread for a specific booking.
 *
 * Strictly scoped to the booking ID. Each booking (a specific lodge stay
 * on a specific tour) has its own email thread stored under
 * emails/booking/{bookingId}/. We do NOT aggregate across bookings for
 * the same lodge — different stays at the same lodge on different tours
 * are deliberately separate threads.
 *
 * If this endpoint returns 0 emails, that's the accurate answer — either
 * no emails have been sent via the portal for this booking yet, or
 * inbound replies weren't matched to this booking by poll-gmail. Fix at
 * the source (import from Gmail, or improve matching), not here.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  var bookingId = req.query.booking_id;
  if (!bookingId) return res.status(400).json({ error: 'booking_id required' });

  var prefix = 'emails/booking/' + bookingId + '/';

  try {
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

    // Silently drop stale inbound blobs with no body — keep outbound regardless.
    var staleCount = 0;
    emails = emails.filter(function(e) {
      if (e.direction === 'outbound') return true;
      var hasBody = (e.body && e.body.trim()) || (e.email_content && e.email_content.trim());
      if (!hasBody) { staleCount++; return false; }
      return true;
    });

    // Reverse chronological (newest first). Inbound and outbound interleaved.
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
        stale_filtered: staleCount,
        fetch_errors: fetchErrors,
      }
    });
  } catch(err) {
    res.status(500).json({ error: err.message, prefix_searched: prefix });
  }
}
