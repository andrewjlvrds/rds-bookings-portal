import { list } from '@vercel/blob';

export default async function handler(req, res) {
  const bookingId = req.query.booking_id;
  if (!bookingId) return res.status(400).json({ error: 'booking_id required' });
  const result = await list({ prefix: 'emails/booking/' + bookingId + '/' });
  const details = await Promise.all(result.blobs.map(async b => {
    const r = await fetch(b.url);
    const data = await r.json();
    const body = data.body || data.email_content || '';
    return {
      path: b.pathname,
      direction: data.direction,
      has_body: !!(body && body.trim()),
      body_preview: body.substring(0, 100),
      attachments_count: (data.attachments || []).length,
    };
  }));
  res.json(details);
}
