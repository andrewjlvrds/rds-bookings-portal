import { list } from '@vercel/blob';

export default async function(req, res) {
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
    var prefix = bookingId
      ? 'emails/booking/' + bookingId + '/'
      : 'emails/lodge/' + lodgeId + '/';

    var result = await list({ prefix: prefix });
    var emails = [];

    for (var i = 0; i < result.blobs.length; i++) {
      var blob = result.blobs[i];
      try {
        var response = await fetch(blob.url);
        var emailData = await response.json();
        emails.push(emailData);
      } catch(e) {
        console.error('Failed to read email blob:', blob.pathname, e.message);
      }
    }

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
    if (err.message && err.message.indexOf('not found') > -1) {
      return res.status(200).json({ emails: [], count: 0 });
    }
    res.status(500).json({ error: err.message });
  }
}
