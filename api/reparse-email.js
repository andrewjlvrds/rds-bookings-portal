// Re-parse stored emails for a booking
// Downloads attachments from Gmail, extracts text, re-runs AI parser, updates Zoho
// Used when attachment extraction wasn't available when the email was first processed

import { list, put } from '@vercel/blob';
import { getGmailToken, gmailApi } from './_gmail.js';
import { zohoApi } from './_zoho.js';
import { parseEmail, extractionToZohoFields } from './_ai-parse.js';

// Convert base64url to standard base64
function base64urlToBase64(str) {
  if (!str) return '';
  return str.replace(/-/g, '+').replace(/_/g, '/');
}

// Download attachment from Gmail
async function downloadAttachment(token, messageId, attachmentId) {
  var result = await gmailApi(token, 'messages/' + messageId + '/attachments/' + attachmentId);
  if (!result || !result.data) return null;
  return result.data;
}

// Extract text from plain text / CSV
function extractTextFromPlain(base64urlData) {
  try {
    var b64 = base64urlToBase64(base64urlData);
    return Buffer.from(b64, 'base64').toString('utf-8');
  } catch (e) {
    return null;
  }
}

// Extract text from a document attachment
async function extractTextFromAttachment(base64urlData, filename, mimeType) {
  var b64 = base64urlToBase64(base64urlData);
  var buffer = Buffer.from(b64, 'base64');
  var mt = mimeType || '';

  if (mt === 'application/pdf') {
    var apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;
    try {
      var response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514', max_tokens: 4000,
          messages: [{ role: 'user', content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
            { type: 'text', text: 'Extract ALL text from this PDF. Include every number, date, amount, reference, line item. Preserve table structure with | separators. Do not summarise.' },
          ]}],
        }),
      });
      if (!response.ok) return null;
      var data = await response.json();
      var text = '';
      for (var i = 0; i < data.content.length; i++) { if (data.content[i].type === 'text') text += data.content[i].text; }
      return text || null;
    } catch (e) { return null; }
  }

  if (mt === 'application/msword' || (filename && filename.toLowerCase().endsWith('.doc') && !filename.toLowerCase().endsWith('.docx'))) {
    try {
      var WordExtractor = (await import('word-extractor')).default;
      var extractor = new WordExtractor();
      var doc = await extractor.extract(buffer);
      return doc.getBody() || null;
    } catch (e) { console.error('DOC extraction failed:', e.message); return null; }
  }

  if (mt.indexOf('wordprocessingml') > -1 || (filename && filename.toLowerCase().endsWith('.docx'))) {
    try {
      var JSZip = (await import('jszip')).default;
      var zip = await JSZip.loadAsync(buffer);
      var docXml = await zip.file('word/document.xml').async('string');
      var text = docXml
        .replace(/<\/w:p>/g, '\n')
        .replace(/<w:tab\/>/g, ' | ')
        .replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, '$1')
        .replace(/<[^>]+>/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      return text || null;
    } catch (e) { console.error('DOCX extraction failed:', e.message); return null; }
  }

  if (mt.indexOf('spreadsheet') > -1 || mt.indexOf('excel') > -1 || mt === 'application/vnd.ms-excel') {
    try {
      var raw = buffer.toString('utf-8');
      return raw.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s{3,}/g, '\n').trim() || null;
    } catch (e) { return null; }
  }

  return null;
}

var EXTRACTABLE_TYPES = [
  'application/pdf',
  'text/csv', 'application/csv', 'text/plain',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
];

function isExtractable(mimeType) {
  if (!mimeType) return false;
  return EXTRACTABLE_TYPES.indexOf(mimeType) > -1 ||
    mimeType.indexOf('spreadsheet') > -1 ||
    mimeType.indexOf('csv') > -1 ||
    mimeType.indexOf('word') > -1 ||
    mimeType.indexOf('msword') > -1;
}

export default async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var bookingId = (req.body || {}).booking_id;
  if (!bookingId) return res.status(400).json({ error: 'booking_id required' });

  try {
    // Load stored emails for this booking from blob
    var blobResult = await list({ prefix: 'emails/booking/' + bookingId + '/' });
    var blobs = (blobResult.blobs || []);

    if (blobs.length === 0) {
      return res.status(200).json({ success: true, message: 'No stored emails found', reparsed: 0 });
    }

    // Fetch the booking record for context
    var bookingFields = 'Name,Lodge_Name,RDS_Reference,Status,Check_in_Date,Check_out_Date,Nights,Lodge,Tour,id,' +
      'Deposit_Amount,Second_Payment_Amount,Third_Payment_Amount,Fourth_Payment_Amount,' +
      'Deposit_Paid_Date,nd_Payment_Paid_Date,rd_Payment_Paid_Date,th_Payment_Paid_Date';
    var bookingResult = await zohoApi('GET', 'Lodge_Bookings/' + bookingId + '?fields=' + bookingFields);
    var booking = (bookingResult && bookingResult.data) ? bookingResult.data[0] || bookingResult.data : {};

    var token = await getGmailToken();
    var reparsed = 0;
    var errors = [];
    var results = [];

    for (var bi = 0; bi < blobs.length; bi++) {
      try {
        var blobRes = await fetch(blobs[bi].url);
        var email = await blobRes.json();

        // Only reparse inbound emails
        if (email.direction !== 'inbound') continue;

        var gmailMsgId = email.gmail_message_id || email.message_id || '';
        var body = email.body || '';
        var attachments = email.attachments || [];

        // Re-fetch from Gmail if body is empty OR attachments lack attachmentId (old format)
        var hasAttWithoutId = attachments.some(function(a) { return a.filename && !a.attachmentId; });
        var bodyIsEmpty = !body || body.trim() === '';
        if (gmailMsgId && (hasAttWithoutId || attachments.length === 0 || bodyIsEmpty)) {
          try {
            var fullMsg = await gmailApi(token, 'messages/' + gmailMsgId + '?format=full');
            if (fullMsg && fullMsg.payload) {
              // Re-extract attachments with IDs
              var freshAttachments = [];
              const walkParts = (parts) => {
                if (!parts) return;
                for (var pi = 0; pi < parts.length; pi++) {
                  var part = parts[pi];
                  if (part.filename && part.filename.length > 0) {
                    freshAttachments.push({
                      filename: part.filename,
                      mimeType: part.mimeType || '',
                      size: part.body ? part.body.size || 0 : 0,
                      attachmentId: part.body ? part.body.attachmentId || null : null,
                    });
                  }
                  if (part.parts) walkParts(part.parts);
                }
              }
              walkParts(fullMsg.payload.parts || []);
              if (freshAttachments.length > 0) {
                attachments = freshAttachments;
                console.log('Re-fetched', freshAttachments.length, 'attachments with IDs from Gmail');
              }

              // Also re-extract body if it was empty
              if (!body || body === '(no content)') {
                var textPlain = '', textHtml = '';
                const walkBody = (part) => {
                  if (!part) return;
                  if (part.mimeType === 'text/plain' && part.body && part.body.data && !textPlain) {
                    var padded = part.body.data.replace(/-/g, '+').replace(/_/g, '/');
                    textPlain = Buffer.from(padded, 'base64').toString('utf-8');
                  }
                  if (part.mimeType === 'text/html' && part.body && part.body.data && !textHtml) {
                    var padded2 = part.body.data.replace(/-/g, '+').replace(/_/g, '/');
                    textHtml = Buffer.from(padded2, 'base64').toString('utf-8');
                  }
                  if (part.parts) part.parts.forEach(walkBody);
                }
                walkBody(fullMsg.payload);
                if (textPlain) body = textPlain;
                else if (textHtml) body = textHtml.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
              }
            }
          } catch (fetchErr) {
            console.error('Failed to re-fetch message from Gmail:', gmailMsgId, fetchErr.message);
          }
        }

        // Re-download and extract attachment text
        var attachmentTexts = [];
        var updatedAttachments = [];

        for (var ai = 0; ai < attachments.length; ai++) {
          var att = attachments[ai];
          var attCopy = {
            filename: att.filename || '',
            mimeType: att.mimeType || '',
            size: att.size || 0,
            attachmentId: att.attachmentId || null,
            extractedText: att.extractedText || null,
          };

          // If already extracted, reuse
          if (att.extractedText) {
            attachmentTexts.push('--- ATTACHMENT: ' + att.filename + ' ---\n' + att.extractedText + '\n--- END ATTACHMENT ---');
            updatedAttachments.push(attCopy);
            continue;
          }

          // Try to download and extract
          if (att.attachmentId && gmailMsgId && isExtractable(att.mimeType) && (att.size || 0) < 5 * 1024 * 1024) {
            try {
              console.log('Downloading attachment:', att.filename, 'from message', gmailMsgId);
              var attData = await downloadAttachment(token, gmailMsgId, att.attachmentId);

              if (attData) {
                var extractedText = null;
                var mt = att.mimeType || '';

                if (mt === 'text/csv' || mt === 'application/csv' || mt === 'text/plain') {
                  extractedText = extractTextFromPlain(attData);
                } else if (isExtractable(mt)) {
                  extractedText = await extractTextFromAttachment(attData, att.filename, mt);
                }

                if (extractedText) {
                  attCopy.extractedText = extractedText;
                  attachmentTexts.push('--- ATTACHMENT: ' + att.filename + ' ---\n' + extractedText + '\n--- END ATTACHMENT ---');
                  console.log('Extracted', extractedText.length, 'chars from', att.filename);
                }
              }

              await new Promise(function(r) { setTimeout(r, 300); });
            } catch (attErr) {
              console.error('Attachment extraction failed:', att.filename, attErr.message);
            }
          }

          updatedAttachments.push(attCopy);
        }

        // Build full content for AI parsing
        var fullContent = body || '';
        if (attachmentTexts.length > 0) {
          fullContent += '\n\n' + attachmentTexts.join('\n\n');
        }

        // Re-run AI parser
        var aiResult = null;
        var zohoUpdates = {};

        if (fullContent && fullContent.trim().length > 10) {
          var lodgeName = booking.Lodge_Name || booking.Name || '';
          if (typeof lodgeName === 'object') lodgeName = lodgeName.name || '';

          var bookingContext = {
            lodge_name: lodgeName,
            check_in: booking.Check_in_Date || '',
            check_out: booking.Check_out_Date || '',
            nights: booking.Nights || '',
            status: booking.Status || '',
            deposit_amount: booking.Deposit_Amount || '',
            deposit_paid: booking.Deposit_Paid_Date ? 'yes' : 'no',
            payment_2_amount: booking.Second_Payment_Amount || '',
            payment_2_paid: booking.nd_Payment_Paid_Date ? 'yes' : 'no',
            payment_3_amount: booking.Third_Payment_Amount || '',
            payment_3_paid: booking.rd_Payment_Paid_Date ? 'yes' : 'no',
            payment_4_amount: booking.Fourth_Payment_Amount || '',
            payment_4_paid: booking.th_Payment_Paid_Date ? 'yes' : 'no',
            has_attachments: attachmentTexts.length > 0,
            attachment_filenames: updatedAttachments.filter(function(a) { return a.extractedText; }).map(function(a) { return a.filename; }),
          };

          aiResult = await parseEmail(fullContent, bookingContext);
          console.log('Reparse result for', bookingId, ':', JSON.stringify(aiResult).substring(0, 500));

          var existingAmounts = {
            Total_Amount: booking.Total_Amount,
            Deposit_Amount: booking.Deposit_Amount,
            Second_Payment_Amount: booking.Second_Payment_Amount,
            Third_Payment_Amount: booking.Third_Payment_Amount,
            Fourth_Payment_Amount: booking.Fourth_Payment_Amount,
            Deposit_Due_Date: booking.Deposit_Due_Date,
            Second_Payment_Due_Date: booking.Second_Payment_Due_Date,
            Third_Payment_Due_Date: booking.Third_Payment_Due_Date,
            Fourth_Payment_Due_Date: booking.Fourth_Payment_Due_Date,
          };
          var fieldResult = extractionToZohoFields(aiResult, existingAmounts);
          zohoUpdates = fieldResult.updates;
        }

        // Update Zoho if we extracted new fields
        if (Object.keys(zohoUpdates).length > 0) {
          zohoUpdates.id = bookingId;
          await zohoApi('PUT', 'Lodge_Bookings', { data: [zohoUpdates] });
          console.log('Updated booking', bookingId, 'with', Object.keys(zohoUpdates).length, 'fields from reparse');
        }

        // Update the stored email blob when body or attachments changed
        var hasNewText = updatedAttachments.some(function(a) { return a.extractedText && !((attachments.find(function(o) { return o.filename === a.filename; }) || {}).extractedText); });
        var bodyChanged = !!(body && body.trim() && !(email.body || email.email_content || '').trim());
        var attachmentsChanged = updatedAttachments.length > attachments.length;
        if (hasNewText || bodyChanged || attachmentsChanged) {
          if (body && body.trim()) { email.body = body; email.email_content = body; }
          email.attachments = updatedAttachments;
          var safeId = (email.message_id || email.id || '').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
          if (safeId) {
            await put('emails/booking/' + bookingId + '/' + safeId + '.json',
              JSON.stringify(email), { access: 'public', contentType: 'application/json', addRandomSuffix: false });
            console.log('Updated blob for', safeId, '- bodyChanged:', bodyChanged, 'attachmentsChanged:', attachmentsChanged, 'hasNewText:', hasNewText);
          }
        }

        reparsed++;
        results.push({
          message_id: gmailMsgId,
          subject: email.subject || '',
          attachments_extracted: updatedAttachments.filter(function(a) { return a.extractedText; }).length,
          fields_updated: Object.keys(zohoUpdates).length - (zohoUpdates.id ? 1 : 0),
          ai_summary: aiResult ? aiResult.summary : null,
        });

      } catch (emailErr) {
        console.error('Reparse error for blob', bi, emailErr.message);
        errors.push({ blob: bi, error: emailErr.message });
      }
    }

    res.status(200).json({
      success: true,
      reparsed: reparsed,
      results: results,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (err) {
    console.error('reparse-email error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
