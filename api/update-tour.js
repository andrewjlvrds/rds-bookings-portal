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
    var tourId = body.tour_id;
    var updates = body.updates || {};

    if (!tourId) {
      return res.status(400).json({ error: 'Missing tour_id' });
    }

    var record = Object.assign({ id: tourId }, updates);
    var result = await zohoApi('PUT', 'Tours', { data: [record] });

    if (result && result.data && result.data[0]) {
      if (result.data[0].status === 'success') {
        return res.status(200).json({ success: true });
      } else {
        return res.status(400).json({ error: result.data[0].message || 'Update failed' });
      }
    }

    res.status(500).json({ error: 'Unexpected response' });
  } catch(err) {
    console.error('update-tour error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
