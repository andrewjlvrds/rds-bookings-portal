import { list } from '@vercel/blob';

export default async function handler(req, res) {
  const bookingId = req.query.booking_id;
  if (!bookingId) return res.status(400).json({ error: 'booking_id required' });
  const result = await list({ prefix: 'emails/booking/' + bookingId + '/' });
  const details = await Promise.all(result.blobs.map(async b => {
    const r = await fetch(b.url);
    const data = await r.json();
    return {
      path: b.pathname,
      direction: data.direction,
      body: (data.body || data.email_content || '').substring(0, 200),
      has_body: !!(data.body && data.body.trim()) || !!(data.email_content && data.email_content.trim()),
      attachments: data.attachments || [],
    };
  }));
  res.json(details);
}
