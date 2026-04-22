import { list } from '@vercel/blob';

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

    emails.sort(function(a, b) {
      return new Date(b.date || b.email_date || 0) - new Date(a.date || a.email_date || 0);
    });

    res.status(200).json({
      success: true,
      emails: emails,
      count: emails.length,
      // Diagnostics — help diagnose "0 emails" bugs:
      _diag: {
        prefix_searched: prefix,
        blobs_found: blobs.length,
        fetch_errors: fetchErrors,
      }
    });
  } catch(err) {
    res.status(500).json({ error: err.message, prefix_searched: prefix });
  }
}
