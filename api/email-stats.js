import { list } from '@vercel/blob';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const t0 = Date.now();
  const DEADLINE = 9000; // 9s hard limit

  try {
    // Step 1: collect all blob URLs (just metadata, fast)
    const allBlobs = [];
    let cursor;
    let pages = 0;
    do {
      const opts = { prefix: 'emails/booking/', limit: 1000 };
      if (cursor) opts.cursor = cursor;
      const result = await list(opts);
      for (const b of (result.blobs || [])) {
        if (b.pathname.endsWith('.json')) allBlobs.push(b);
      }
      cursor = result.cursor;
      pages++;
    } while (cursor && pages < 20);

    const totalBlobs = allBlobs.length;

    // Step 2: fetch all blobs in parallel batches of 30, stop if near deadline
    const janCutoff = new Date('2026-01-01T00:00:00Z');
    let fetched = 0;
    let sent = 0;
    let received = 0;
    let sentSinceJan = 0;
    let receivedSinceJan = 0;
    const byMonth = {};

    const BATCH = 30;
    for (let i = 0; i < allBlobs.length; i += BATCH) {
      if (Date.now() - t0 > DEADLINE) break;
      const batch = allBlobs.slice(i, i + BATCH);
      const results = await Promise.all(batch.map(async b => {
        try {
          const r = await fetch(b.url);
          if (!r.ok) return null;
          return await r.json();
        } catch { return null; }
      }));
      for (const data of results) {
        if (!data) continue;
        fetched++;
        const dir = data.direction || '';
        const dateStr = data.date || data.processed_at || '';
        const date = dateStr ? new Date(dateStr) : null;
        const monthKey = date ? date.toISOString().slice(0, 7) : 'unknown';
        if (!byMonth[monthKey]) byMonth[monthKey] = { sent: 0, received: 0 };

        const isSent = dir === 'outbound' || dir === 'sent';
        const isReceived = dir === 'inbound';

        if (isSent) {
          sent++;
          byMonth[monthKey].sent++;
          if (date && date >= janCutoff) sentSinceJan++;
        } else if (isReceived) {
          received++;
          byMonth[monthKey].received++;
          if (date && date >= janCutoff) receivedSinceJan++;
        }
      }
    }

    const partial = fetched < totalBlobs;
    const sinceJan = sentSinceJan + receivedSinceJan;

    // Sort months
    const sortedMonths = {};
    Object.keys(byMonth).sort().forEach(k => { sortedMonths[k] = byMonth[k]; });

    res.json({
      since_jan_2026: {
        total: sinceJan,
        sent: sentSinceJan,
        received: receivedSinceJan,
      },
      all_time: {
        total_blobs: totalBlobs,
        fetched,
        sent,
        received,
      },
      by_month: sortedMonths,
      partial_results: partial,
      elapsed_ms: Date.now() - t0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message, elapsed_ms: Date.now() - t0 });
  }
}
