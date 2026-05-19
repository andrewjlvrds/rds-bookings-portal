// GET /api/email-search?q=query
// Searches all stored email blobs for matching subject, sender, or date.
// Returns lightweight results (no body) for display in the inbox search tab.
//
// Strategy: list all blobs under emails/booking/, fetch each one, 
// match against query. Cached for 5 minutes to avoid hammering blob storage.

import { list } from '@vercel/blob';

export const config = { maxDuration: 45 };

let cache = null;
let cacheAt = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getAllEmailMeta() {
  if (cache && Date.now() - cacheAt < CACHE_TTL) return cache;

  // List all booking email blobs
  const allBlobs = [];
  let cursor = null;
  let pages = 0;
  do {
    const opts = { prefix: 'emails/booking/', limit: 1000 };
    if (cursor) opts.cursor = cursor;
    const result = await list(opts);
    allBlobs.push(...(result.blobs || []));
    cursor = result.cursor;
    pages++;
  } while (cursor && pages < 20);

  // Fetch metadata from each blob in batches
  const BATCH = 20;
  const t0 = Date.now();
  const emails = [];

  for (let i = 0; i < allBlobs.length; i += BATCH) {
    if (Date.now() - t0 > 35000) break; // hard limit
    const batch = allBlobs.slice(i, i + BATCH);
    const fetched = await Promise.all(batch.map(async (b) => {
      try {
        const r = await fetch(b.url);
        if (!r.ok) return null;
        const d = await r.json();
        if (!d.subject && !d.email_subject && !d.from && !d.email_from) return null;
        return {
          id: d.id || d.gmail_message_id || '',
          booking_id: d.booking_id || b.pathname.split('/')[2] || '',
          direction: d.direction || 'inbound',
          from: d.from || d.email_from || '',
          subject: d.subject || d.email_subject || '',
          date: d.date || d.email_date || b.uploadedAt || '',
          _blob_path: b.pathname,
        };
      } catch { return null; }
    }));
    fetched.forEach(e => { if (e) emails.push(e); });
  }

  cache = emails;
  cacheAt = Date.now();
  return emails;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const q = (req.query.q || '').toLowerCase().trim();
  if (!q) return res.status(400).json({ error: 'q required' });

  try {
    const emails = await getAllEmailMeta();

    const results = emails.filter(em => {
      const subject = (em.subject || '').toLowerCase();
      const from = (em.from || '').toLowerCase();
      const date = (em.date || '').toLowerCase();
      const bookingId = (em.booking_id || '').toLowerCase();
      return subject.includes(q) || from.includes(q) || date.includes(q) || bookingId.includes(q);
    });

    // Sort newest first
    results.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    return res.status(200).json({ results: results.slice(0, 100), total: results.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
