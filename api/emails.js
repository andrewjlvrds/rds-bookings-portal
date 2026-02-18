var { list, put, head } = require('@vercel/blob');

module.exports = async function(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var bookingId = req.query.booking_id;
  var lodgeId = req.query.lodge_id;

  if (!bookingId && !lodgeId) {
    return res.status(400).json({ error: 'booking_id or lodge_id required' });
  }

  try {
    // List emails from blob storage
    var prefix = bookingId
      ? 'emails/booking/' + bookingId + '/'
      : 'emails/lodge/' + lodgeId + '/';

    var result = await list({ prefix: prefix });
    var emails = [];

    // Fetch each email's index entry
    for (var i = 0; i < result.blobs.length; i++) {
      var blob = result.blobs[i];
      try {
        var response = await fetch(blob.url);
        var emailData = await response.json();
        emails.push(emailData);
      } catch(e) {
        // Skip corrupted entries
        console.error('Failed to read email blob:', blob.pathname, e.message);
      }
    }

    // Sort by date descending (newest first)
    emails.sort(function(a, b) {
      return (b.date || '').localeCompare(a.date || '');
    });

    res.status(200).json({
      emails: emails,
      count: emails.length,
      booking_id: bookingId,
      lodge_id: lodgeId,
    });

  } catch(err) {
    // If no blobs found, return empty (not an error)
    if (err.message && err.message.indexOf('not found') > -1) {
      return res.status(200).json({ emails: [], count: 0 });
    }
    res.status(500).json({ error: err.message });
  }
};
