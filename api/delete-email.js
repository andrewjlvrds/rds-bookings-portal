import { del, list } from '@vercel/blob';

export default async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var bookingId = (req.body || {}).booking_id;
  var messageId = (req.body || {}).message_id;

  if (!bookingId || !messageId) {
    return res.status(400).json({ error: 'booking_id and message_id required' });
  }

  try {
    var safeId = messageId.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
    var prefix = 'emails/booking/' + bookingId + '/' + safeId;

    var result = await list({ prefix: prefix });
    var deleted = 0;

    for (var i = 0; i < (result.blobs || []).length; i++) {
      await del(result.blobs[i].url);
      deleted++;
    }

    res.status(200).json({ success: true, deleted: deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
