var { list, get } = require('@vercel/blob');

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  var bookingId = req.query.booking_id;
  if (!bookingId) return res.status(400).json({ error: 'booking_id required' });

  try {
    var result = await list({ prefix: 'emails/booking/' + bookingId + '/' });
    var blobs = result.blobs || [];

    var emails = [];
    for (var i = 0; i < blobs.length; i++) {
      try {
        var response = await fetch(blobs[i].url);
        var data = await response.json();
        emails.push(data);
      } catch(e) {
        console.error('Failed to fetch blob:', blobs[i].url, e.message);
      }
    }

    // Sort by email date, newest first
    emails.sort(function(a, b) {
      return new Date(b.email_date) - new Date(a.email_date);
    });

    res.status(200).json({ success: true, emails: emails, count: emails.length });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
};
