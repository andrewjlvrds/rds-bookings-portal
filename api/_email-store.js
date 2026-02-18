import { put, list } from '@vercel/blob';

export async function storeEmail(emailData) {
  var bookingId = emailData.booking_id;
  var lodgeId = emailData.lodge_id;
  var messageId = emailData.message_id || ('msg_' + Date.now());
  var safeId = messageId.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);

  var record = {
    id: safeId,
    message_id: messageId,
    type: emailData.type || 'lodge_inbound',
    direction: emailData.direction || 'inbound',
    lodge_id: lodgeId || null,
    booking_id: bookingId || null,
    from: emailData.email_from || '',
    to: emailData.email_to || '',
    subject: emailData.email_subject || '',
    body: emailData.email_content || '',
    date: emailData.email_date || new Date().toISOString(),
    attachments: emailData.attachments || [],
    ai_summary: emailData.ai_summary || null,
    ai_extractions: emailData.ai_extractions || null,
    ai_flags: emailData.ai_flags || [],
    processed_at: new Date().toISOString(),
  };

  if (bookingId) {
    await put('emails/booking/' + bookingId + '/' + safeId + '.json',
      JSON.stringify(record), { access: 'public', contentType: 'application/json', addRandomSuffix: false });
  }
  if (lodgeId) {
    await put('emails/lodge/' + lodgeId + '/' + safeId + '.json',
      JSON.stringify(record), { access: 'public', contentType: 'application/json', addRandomSuffix: false });
  }
  if (!bookingId && !lodgeId) {
    await put('emails/unmatched/' + safeId + '.json',
      JSON.stringify(record), { access: 'public', contentType: 'application/json', addRandomSuffix: false });
  }

  return record;
}

export async function isEmailStored(bookingId, messageId) {
  if (!bookingId || !messageId) return false;
  var safeId = messageId.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
  try {
    var result = await list({ prefix: 'emails/booking/' + bookingId + '/' + safeId });
    return result.blobs && result.blobs.length > 0;
  } catch(e) {
    return false;
  }
}
