import { put, list } from '@vercel/blob';

export async function storeEmail(emailData) {
  var bookingId = emailData.booking_id;
  var lodgeId = emailData.lodge_id;
  var messageId = emailData.message_id || ('msg_' + Date.now());
  var safeId = messageId.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);

  var record = {
    id: safeId,
    message_id: messageId,
    gmail_message_id: emailData.gmail_message_id || messageId,
    gmail_thread_id: emailData.gmail_thread_id || null,
    rfc_message_id: emailData.rfc_message_id || null,
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
    ai_parsed_flags: emailData.ai_parsed_flags || null,
    parsed_at: emailData.parsed_at || null,
    match_method: emailData.match_method || null,
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

// Strip RFC Message-ID angle brackets and whitespace for blob-safe filename.
//   "<20260422.x@ridedownsouth.com>"  →  "20260422.x@ridedownsouth.com"
//   "  <foo@bar>  "                   →  "foo@bar"
// Then alphanumeric-only for the filesystem path.
export function normalizeMessageId(raw) {
  if (!raw) return '';
  // Strip all whitespace, then strip angle brackets from both ends (handles
  // cases like "  <foo@bar>  " or "<foo@bar> " where trailing space prevents
  // a naive /> $/ replace from working)
  var trimmed = String(raw).trim();
  // Remove all angle brackets — some mail clients include extra ones
  trimmed = trimmed.replace(/^[<\s]+/, '').replace(/[>\s]+$/, '').trim();
  return trimmed;
}
export function safeMessageIdKey(raw) {
  var norm = normalizeMessageId(raw);
  return norm.replace(/[^a-zA-Z0-9_.\-@]/g, '_').substring(0, 120);
}

// Write a sent-index entry so we can match future inbound replies by the
// In-Reply-To / References header that contains this Message-ID.
//
//   emails/sent-index/{safeKey}.json
//   {
//     rfc_message_id, gmail_message_id, booking_ids[], tour_name,
//     lodge_name, to, subject, sent_at
//   }
//
// Called from send-enquiry.js after a successful Gmail send.
export async function storeSentIndex(entry) {
  var rfc = entry.rfc_message_id;
  if (!rfc) throw new Error('storeSentIndex: rfc_message_id required');
  var key = safeMessageIdKey(rfc);
  if (!key) throw new Error('storeSentIndex: message id produced empty key');
  var record = {
    rfc_message_id: normalizeMessageId(rfc),
    gmail_message_id: entry.gmail_message_id || null,
    gmail_thread_id: entry.gmail_thread_id || null,
    booking_ids: Array.isArray(entry.booking_ids) ? entry.booking_ids : [],
    tour_name: entry.tour_name || null,
    lodge_name: entry.lodge_name || null,
    to: entry.to || null,
    subject: entry.subject || null,
    sent_at: entry.sent_at || new Date().toISOString(),
  };
  await put('emails/sent-index/' + key + '.json',
    JSON.stringify(record),
    { access: 'public', contentType: 'application/json', addRandomSuffix: false });
  // Also index by Gmail thread ID so replies without In-Reply-To headers can be matched
  if (entry.gmail_thread_id) {
    var threadKey = 'thread-' + entry.gmail_thread_id;
    await put('emails/sent-index/' + threadKey + '.json',
      JSON.stringify(record),
      { access: 'public', contentType: 'application/json', addRandomSuffix: false });
  }
  return record;
}

// Look up a sent-index entry by any Message-ID (from In-Reply-To or References).
// Returns null if not found.
export async function lookupSentIndexByThreadId(gmailThreadId) {
  if (!gmailThreadId) return null;
  var threadKey = 'thread-' + gmailThreadId;
  try {
    var result = await list({ prefix: 'emails/sent-index/' + threadKey + '.json', limit: 1 });
    if (!result.blobs || result.blobs.length === 0) return null;
    var blob = result.blobs[0];
    var rr = await fetch(blob.url);
    if (!rr.ok) return null;
    return await rr.json();
  } catch(e) {
    return null;
  }
}

export async function lookupSentIndex(rfcMessageId) {
  var key = safeMessageIdKey(rfcMessageId);
  if (!key) return null;
  try {
    var result = await list({ prefix: 'emails/sent-index/' + key + '.json', limit: 1 });
    if (!result.blobs || result.blobs.length === 0) return null;
    var blob = result.blobs[0];
    var rr = await fetch(blob.url);
    if (!rr.ok) return null;
    return await rr.json();
  } catch(e) {
    return null;
  }
}
