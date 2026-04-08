import { put, list } from '@vercel/blob';

export default async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    var data = req.body;
    if (!data || !data.message_id) {
      return res.status(400).json({ error: 'message_id required' });
    }

    var bookingId = data.booking_id || '';
    var lodgeId = data.lodge_id || '';
    var messageId = data.message_id;
    var safeId = messageId.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);

    // Check if already stored (dedup)
    if (bookingId) {
      try {
        var existing = await list({ prefix: 'emails/booking/' + bookingId + '/' + safeId });
        if (existing.blobs && existing.blobs.length > 0) {
          return res.status(200).json({ status: 'duplicate', message_id: messageId });
        }
      } catch(e) {
        // Not found = good, continue
      }
    }

    // Build email record
    var record = {
      id: safeId,
      message_id: messageId,
      gmail_message_id: messageId,
      type: data.type || 'lodge_inbound',
      direction: data.direction || 'inbound',
      lodge_id: lodgeId,
      booking_id: bookingId,
      lodge_name: data.lodge_name || '',
      tour_name: data.tour_name || '',
      from: data.email_from || '',
      to: data.email_to || '',
      subject: data.email_subject || '',
      body: data.email_content || '',
      date: data.email_date || new Date().toISOString(),
      attachments: data.attachments || [],
      ai_summary: data.ai_summary || null,
      ai_extractions: data.ai_extractions || null,
      ai_flags: data.ai_flags || [],
      import_source: data.import_source || 'webhook',
      processed_at: new Date().toISOString(),
    };

    var stored = 0;

    // Store by booking ID (primary index)
    if (bookingId) {
      await put('emails/booking/' + bookingId + '/' + safeId + '.json',
        JSON.stringify(record),
        { access: 'public', contentType: 'application/json', addRandomSuffix: false });
      stored++;
    }

    // Store by lodge ID (secondary index)
    if (lodgeId) {
      await put('emails/lodge/' + lodgeId + '/' + safeId + '.json',
        JSON.stringify(record),
        { access: 'public', contentType: 'application/json', addRandomSuffix: false });
      stored++;
    }

    // Unmatched
    if (!bookingId && !lodgeId) {
      await put('emails/unmatched/' + safeId + '.json',
        JSON.stringify(record),
        { access: 'public', contentType: 'application/json', addRandomSuffix: false });
      stored++;
    }

    res.status(200).json({
      status: 'stored',
      message_id: messageId,
      booking_id: bookingId,
      lodge_id: lodgeId,
      paths_written: stored
    });

  } catch(err) {
    console.error('import-email error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
