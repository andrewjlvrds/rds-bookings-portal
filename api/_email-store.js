var { put, list } = require('@vercel/blob');

// Store an email in Vercel Blob storage with indexes for lookup
async function storeEmail(emailData) {
  var bookingId = emailData.booking_id;
  var lodgeId = emailData.lodge_id;
  var messageId = emailData.message_id || ('msg_' + Date.now());

  // Clean message ID for use as filename
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

  // Store the full email blob
  // Primary index: by booking ID (most common lookup)
  if (bookingId) {
    await put(
      'emails/booking/' + bookingId + '/' + safeId + '.json',
      JSON.stringify(record),
      { access: 'public', contentType: 'application/json', addRandomSuffix: false }
    );
  }

  // Secondary index: by lodge ID (for lodge-level view)
  if (lodgeId) {
    await put(
      'emails/lodge/' + lodgeId + '/' + safeId + '.json',
      JSON.stringify(record),
      { access: 'public', contentType: 'application/json', addRandomSuffix: false }
    );
  }

  // If no booking or lodge match, store as unmatched
  if (!bookingId && !lodgeId) {
    await put(
      'emails/unmatched/' + safeId + '.json',
      JSON.stringify(record),
      { access: 'public', contentType: 'application/json', addRandomSuffix: false }
    );
  }

  return record;
}

// Check if an email has already been stored (dedup by message_id)
async function isEmailStored(bookingId, messageId) {
  if (!bookingId || !messageId) return false;
  var safeId = messageId.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
  try {
    var result = await list({ prefix: 'emails/booking/' + bookingId + '/' + safeId });
    return result.blobs && result.blobs.length > 0;
  } catch(e) {
    return false;
  }
}

module.exports = { storeEmail: storeEmail, isEmailStored: isEmailStored };
