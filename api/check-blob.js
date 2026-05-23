import { list, head } from '@vercel/blob';

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
      date: data.email_date || data.date,
      subject: data.email_subject || data.subject,
      from: data.email_from || data.from,
      has_attachments: (data.attachments || []).length > 0,
      ai_parsed: !!data.ai_parsed_flags,
    };
  }));
  res.json(details);
}
