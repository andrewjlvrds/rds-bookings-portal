// Delete empty-body inbound email blobs so cron can reprocess them properly.
// POST { tour_name: "FoSA Apr 27", dry_run: true }
// Delete after use.

import { list, del } from '@vercel/blob';
import { zohoApi } from './_zoho.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    const { tour_name, dry_run } = req.body || {};
    if (!tour_name) return res.status(400).json({ error: 'tour_name required' });

    const t0 = Date.now();

    // Fetch all bookings, filter by tour
    let allBookings = [], page = 1, more = true;
    while (more && page <= 5) {
      const r = await zohoApi('GET', 'Lodge_Bookings?fields=id,Name,Tour&per_page=200&page=' + page);
      allBookings = allBookings.concat((r && r.data) || []);
      more = r && r.info && r.info.more_records;
      page++;
    }
    const bookings = allBookings.filter(bk => {
      const t = bk.Tour && typeof bk.Tour === 'object' ? bk.Tour.name : bk.Tour || '';
      return t === tour_name;
    });

    const deleted = [], skipped = [];

    for (const bk of bookings) {
      const blobs = await list({ prefix: 'emails/booking/' + bk.id + '/' });
      for (const blob of blobs.blobs) {
        const r = await fetch(blob.url);
        const email = await r.json();
        const body = email.body || email.email_content || '';
        const isInbound = email.direction === 'inbound';
        if (!isInbound || body.trim()) { skipped.push(blob.pathname); continue; }
        // Empty body inbound — delete so cron can reprocess
        if (!dry_run) await del(blob.url);
        deleted.push({ path: blob.pathname, booking: bk.Name });
      }
    }

    res.json({ tour: tour_name, dry_run: !!dry_run, deleted: deleted.length, skipped: skipped.length, items: deleted, elapsed_ms: Date.now() - t0 });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
