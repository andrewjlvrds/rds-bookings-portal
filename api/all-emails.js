import { list } from '@vercel/blob';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    // List all email blobs across all bookings
    var allBlobs = [];
    var cursor = undefined;
    var pages = 0;

    // Paginate through blob listing (max 5 pages to avoid timeout)
    while (pages < 5) {
      var opts = { prefix: 'emails/booking/', limit: 500 };
      if (cursor) opts.cursor = cursor;
      var result = await list(opts);
      var blobs = result.blobs || [];
      allBlobs = allBlobs.concat(blobs);
      if (!result.hasMore) break;
      cursor = result.cursor;
      pages++;
    }

    // Fetch email data from each blob (limit to most recent 200 by URL sort)
    // Sort blobs by name descending to get most recent first
    allBlobs.sort(function(a, b) {
      return (b.uploadedAt || '').localeCompare(a.uploadedAt || '');
    });

    var maxEmails = parseInt(req.query.limit) || 200;
    var toFetch = allBlobs.slice(0, maxEmails);

    var emails = [];
    // Fetch in batches of 20 to avoid overwhelming
    for (var i = 0; i < toFetch.length; i += 20) {
      var batch = toFetch.slice(i, i + 20);
      var fetched = await Promise.all(batch.map(async function(blob) {
        try {
          var response = await fetch(blob.url);
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
