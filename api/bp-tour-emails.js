// GET /api/bp-tour-emails?tour_id=xxx&booking_ids=id1,id2,...
// Returns all emails across all bookings for a tour, newest first.
// booking_ids is passed from the frontend (already loaded in bp-data)
// so we don't need a Zoho fetch here.
//
// Only returns: id, booking_id, direction, from, subject, date, match_method
// Does NOT return body — this is a list view only.

import { list } from '@vercel/blob';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  var bookingIdsParam = req.query.booking_ids;
  if (!bookingIdsParam) return res.status(400).json({ error: 'booking_ids required' });

  var bookingIds = bookingIdsParam.split(',').filter(Boolean);
  if (!bookingIds.length) return res.status(400).json({ error: 'No booking IDs' });

  // Fetch blobs for all bookings in parallel, batched to avoid timeout
  var BATCH = 8;
  var allEmails = [];

  for (var i = 0; i < bookingIds.length; i += BATCH) {
    var batch = bookingIds.slice(i, i + BATCH);
    var results = await Promise.all(batch.map(async (bookingId) => {
      try {
        var result = await list({ prefix: 'emails/booking/' + bookingId + '/' });
        var blobs = result.blobs || [];
        var emails = [];
        for (var j = 0; j < blobs.length; j++) {
          try {
            var r = await fetch(blobs[j].url);
            var data = await r.json();
            // Skip no-content blobs
            if (!data.body && !data.email_content) continue;
            // Return summary only — not full body
            emails.push({
              id: data.id,
              booking_id: bookingId,
              direction: data.direction || 'inbound',
              from: data.from || data.email_from || '',
              subject: data.subject || data.email_subject || '',
              date: data.date || data.email_date || '',
              match_method: data.match_method || '',
              ai_summary: data.ai_summary || '',
            });
          } catch (e) { /* skip bad blob */ }
        }
        return emails;
      } catch (e) {
        return [];
      }
    }));
    results.forEach(r => allEmails = allEmails.concat(r));
  }

  // Newest first
  allEmails.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  res.status(200).json({ emails: allEmails, count: allEmails.length });
}
