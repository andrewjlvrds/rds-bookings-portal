import { zohoApi } from './_zoho.js';

export default async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'DELETE only' });
  }

  try {
    var tourId = req.query.id;

    if (!tourId) {
      return res.status(400).json({ error: 'Missing tour id' });
    }

    var result = await zohoApi('DELETE', 'Tours?ids=' + tourId);

    if (result && result.data && result.data[0]) {
      var deleted = result.data[0];
      if (deleted.status === 'success') {
        return res.status(200).json({ success: true, id: tourId });
      } else {
        return res.status(400).json({ error: deleted.message || 'Failed to delete tour' });
      }
    }

    res.status(500).json({ error: 'Unexpected response from Zoho' });

  } catch(err) {
    console.error('delete-tour error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
