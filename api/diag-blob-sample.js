import { list } from '@vercel/blob';

// Diagnostic: sample 20 existing inbound blobs and show subject/from
// so we can see what the portal has actually been storing vs what we
// think it should be storing.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    var result = await list({ prefix: 'emails/booking/', limit: 100 });
    var blobs = result.blobs || [];
    var samples = [];
    for (var i = 0; i < Math.min(blobs.length, 30); i++) {
      try {
        var r = await fetch(blobs[i].url);
        var em = await r.json();
        samples.push({
          pathname: blobs[i].pathname,
          direction: em.direction,
          from: em.from,
          subject: em.subject,
          date: em.date,
          body_preview: (em.body || '').substring(0, 200),
        });
      } catch (e) {
        samples.push({ pathname: blobs[i].pathname, error: e.message });
      }
    }
    res.status(200).json({ total_scanned: blobs.length, samples: samples });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
}
