import { list } from '@vercel/blob';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    var allBlobs = [];
    var cursor = undefined;
    var pages = 0;

    // Vercel Blob list returns { blobs, hasMore, cursor }
    while (pages < 10) {
      var opts = { prefix: 'emails/booking/' };
      if (cursor) opts.cursor = cursor;
      var result = await list(opts);
      var blobs = result.blobs || [];
      allBlobs = allBlobs.concat(blobs);
      if (!result.hasMore) break;
      cursor = result.cursor;
      pages++;
    }

    if (allBlobs.length === 0) {
      return res.status(200).json({
        success: true,
        emails: [],
        count: 0,
        total_blobs: 0,
        message: 'No emails stored yet. Emails are stored when you send enquiries or poll Gmail for replies.',
      });
    }

    // Sort by upload date descending (most recent first)
    allBlobs.sort(function(a, b) {
      var da = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
      var db = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
      return db - da;
    });

    // Fetch up to N email blobs
    var maxEmails = parseInt(req.query.limit) || 200;
    var toFetch = allBlobs.slice(0, maxEmails);

    var emails = [];
    for (var i = 0; i < toFetch.length; i += 20) {
      var batch = toFetch.slice(i, i + 20);
      var fetched = await Promise.all(batch.map(async function(blob) {
        try {
          var response = await fetch(blob.url);
          if (!response.ok) return null;
          return await response.json();
        } catch(e) {
          return null;
        }
      }));
      fetched.forEach(function(e) { if (e) emails.push(e); });
    }

    // Sort by date descending
    emails.sort(function(a, b) {
      return new Date(b.date || b.email_date || 0) - new Date(a.date || a.email_date || 0);
    });

    res.status(200).json({
      success: true,
      emails: emails,
      count: emails.length,
      total_blobs: allBlobs.length,
    });
  } catch(err) {
    console.error('all-emails error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
// force redeploy 1774528653
