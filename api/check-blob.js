import { list } from '@vercel/blob';

export default async function handler(req, res) {
  const bookingId = req.query.booking_id;
  if (!bookingId) return res.status(400).json({ error: 'booking_id required' });
  const result = await list({ prefix: 'emails/booking/' + bookingId + '/' });
  res.json({
    count: result.blobs.length,
    paths: result.blobs.map(b => b.pathname),
  });
}
