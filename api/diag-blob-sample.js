import { list } from '@vercel/blob';

// Diagnostic: sample 5 existing inbound blobs and return their FULL content
// so we can see what fields are actually stored.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    var result = await list({ prefix: 'emails/booking/', limit: 10 });
    var blobs = result.blobs || [];
    var samples = [];
    for (var i = 0; i < Math.min(blobs.length, 5); i++) {
      try {
        var r = await fetch(blobs[i].url);
        var em = await r.json();
        samples.push({
          pathname: blobs[i].pathname,
          fields: Object.keys(em),
          full_record: em,
        });
      } catch (e) {
        samples.push({ pathname: blobs[i].pathname, error: e.message });
      }
    }
    res.status(200).json({ samples: samples });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
}
