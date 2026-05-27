// Scheduled sweep: parse any inbound emails that poll-gmail skipped due to time pressure.
// Runs as a GET cron — calls bulk-reparse internally with parse_unparsed mode.
// vercel.json: { "path": "/api/cron-reparse", "schedule": "*/10 * * * *" }

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    // VERCEL_URL is the deployment URL (may be a preview) — always use production
    var base = 'https://rds-bookings-portal.vercel.app';

    var r = await fetch(base + '/api/bulk-reparse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'parse_unparsed' }),
    });

    if (!r.ok) {
      var text = await r.text();
      console.error('cron-reparse: bulk-reparse failed', r.status, text);
      return res.status(500).json({ error: 'bulk-reparse failed', status: r.status });
    }

    var result = await r.json();
    console.log('cron-reparse: actioned=' + result.actioned + ' skipped=' + result.skipped + ' errors=' + (result.errors || 0));
    return res.status(200).json(result);

  } catch (err) {
    console.error('cron-reparse error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
