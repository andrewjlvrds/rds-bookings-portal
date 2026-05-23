import { list } from '@vercel/blob';
export default async function handler(req, res) {
  const bookingId = req.query.booking_id;
  if (!bookingId) return res.status(400).json({ error: 'booking_id required' });
  const result = await list({ prefix: 'emails/booking/' + bookingId + '/' });
  const details = await Promise.all(result.blobs.map(async b => {
    const r = await fetch(b.url);
    const data = await r.json();
    return { path: b.pathname, direction: data.direction, body_len: (data.body||'').length, email_content_len: (data.email_content||'').length };
  }));
  res.json(details);
}
