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
    var name = body.name;
    var departureDate = body.departure_date;
    var endDate = body.end_date || null;
    var tourType = body.tour_type || '';

    if (!name) {
      return res.status(400).json({ error: 'Missing tour name' });
    }
    if (!departureDate) {
      return res.status(400).json({ error: 'Missing departure date' });
    }

    var record = {
      Name: name,
      Departure_Date: departureDate,
      Status: 'Provisional',
    };

    if (endDate) {
      record.End_Date = endDate;
    }

    if (tourType) {
      record.Tour_Type = tourType;
    }

    var result = await zohoApi('POST', 'Tours', { data: [record] });

    if (result && result.data && result.data[0]) {
      var created = result.data[0];
      if (created.status === 'success') {
        return res.status(200).json({
          success: true,
          id: created.details.id,
          name: name,
          departure_date: departureDate,
        });
      } else {
        return res.status(400).json({ error: created.message || 'Failed to create tour' });
      }
    }

    res.status(500).json({ error: 'Unexpected response from Zoho' });

  } catch(err) {
    console.error('create-tour error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
