// Diagnostic: reply match-rate monitoring.
//
// Samples recent inbound blobs and tallies the match method that was used
// to route each one. This is the metric that tells us whether the 100%
// ambition on portal-sent correspondence is holding.
//
// Query params:
//   ?days=N           window (default 30, cap 365)
//   ?sample_limit=N   max blobs to read (default 500, cap 2000)
//
// Response:
//   {
//     window_days, total_sampled, inbound_sampled,
//     by_method: { message_id_header: N, rds_reference: N, ... },
//     message_id_header_rate: "73%",
//     tier_0_recent_hits: [...first 20 samples...]
//   }

import { list } from '@vercel/blob';

export default async function handler(req, res) {
  var t0 = Date.now();
  var deadlineMs = 50000;
  try {
    var days = parseInt((req.query && req.query.days) || '30', 10);
    if (!(days > 0) || days > 365) days = 30;
    var sampleLimit = parseInt((req.query && req.query.sample_limit) || '500', 10);
    if (!(sampleLimit > 0) || sampleLimit > 2000) sampleLimit = 500;

    var cutoffMs = Date.now() - (days * 24 * 60 * 60 * 1000);

    // Enumerate booking blobs (sent-index, tour-bucket and unmatched excluded)
    var allBlobs = [];
    var cursor = null;
    var pages = 0;
    while (pages < 10) {
      if (Date.now() - t0 > 15000) break;
      var r = await list({ prefix: 'emails/booking/', limit: 1000, cursor: cursor });
      allBlobs = allBlobs.concat(r.blobs || []);
      cursor = r.cursor;
      pages++;
      if (!cursor) break;
      if (allBlobs.length >= sampleLimit * 3) break; // leave headroom for filtering
    }

    // Sort newest-first by uploadedAt (Vercel provides this)
    allBlobs.sort(function(a, b) {
      var da = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
      var db = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
      return db - da;
    });

    var byMethod = {};
    var inboundSampled = 0;
    var outboundSkipped = 0;
    var readErrors = 0;
    var tier0Samples = [];

    // Fetch records in parallel batches
    var toFetch = allBlobs.slice(0, sampleLimit);
    var batchSize = 30;

    for (var bi = 0; bi < toFetch.length; bi += batchSize) {
      if (Date.now() - t0 > deadlineMs) break;
      var batch = toFetch.slice(bi, bi + batchSize);
      var records = await Promise.all(batch.map(function(b) {
        return fetch(b.url)
          .then(function(rr) { return rr.ok ? rr.json() : null; })
          .catch(function() { return null; });
      }));
      for (var ri = 0; ri < records.length; ri++) {
        var rec = records[ri];
        if (!rec) { readErrors++; continue; }
        // Filter by date
        var recDate = rec.date ? new Date(rec.date).getTime() : 0;
        if (recDate < cutoffMs) continue;
        // Only count inbound (outbound matches are trivially correct — they're our sends)
        if (rec.direction === 'outbound') { outboundSkipped++; continue; }
        inboundSampled++;
        var method = rec.match_method || 'unknown_pre_tracking';
        byMethod[method] = (byMethod[method] || 0) + 1;
        if (method === 'message_id_header' && tier0Samples.length < 20) {
          tier0Samples.push({
            subject: rec.subject,
            from: rec.from,
            date: rec.date,
            booking_id: rec.booking_id,
          });
        }
      }
    }

    var tier0Count = byMethod.message_id_header || 0;
    var rate = inboundSampled > 0 ? Math.round(100 * tier0Count / inboundSampled) : 0;

    res.status(200).json({
      window_days: days,
      elapsed_ms: Date.now() - t0,
      total_blobs_listed: allBlobs.length,
      blobs_read: toFetch.length,
      inbound_sampled: inboundSampled,
      outbound_skipped: outboundSkipped,
      read_errors: readErrors,
      by_method: byMethod,
      message_id_header_count: tier0Count,
      message_id_header_rate_pct: rate,
      note: 'message_id_header_rate reflects replies to portal-sent emails that matched by Message-ID header (Tier 0). Higher is better. Other tiers (rds_reference, label-based, date-based) are fallbacks — their counts reveal gaps where Tier 0 missed.',
      tier0_recent_samples: tier0Samples,
    });
  } catch (e) {
    res.status(500).json({ error: e.message, elapsed_ms: Date.now() - t0 });
  }
}
