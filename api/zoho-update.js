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
    var module = body.module;
    var data = body.data;

    if (!module) {
      return res.status(400).json({ error: 'No module specified' });
    }

    // Whitelist allowed modules
    var allowed = ['Lodge_Bookings', 'Tours', 'Lodges'];
    if (allowed.indexOf(module) === -1) {
      return res.status(400).json({ error: 'Module not allowed: ' + module });
    }

    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: 'No data provided' });
    }

    // Validate each record has an id
    for (var i = 0; i < data.length; i++) {
      if (!data[i].id) {
        return res.status(400).json({ error: 'Record at index ' + i + ' missing id' });
      }
    }

    var result = await zohoApi('PUT', module, { data: data });

    // Check per-record results
    var results = (result && result.data) || [];
    var successes = 0;
    var failures = [];

    for (var j = 0; j < results.length; j++) {
      if (results[j].status === 'success') {
        successes++;
      } else {
        failures.push({
          index: j,
          id: data[j].id,
          code: results[j].code,
          message: results[j].message,
        });
      }
    }

    res.status(200).json({
      success: failures.length === 0,
      updated: successes,
      failures: failures.length > 0 ? failures : undefined,
    });

  } catch (err) {
    console.error('zoho-update error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
