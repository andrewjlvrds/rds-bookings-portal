// Diagnostic: test attachment extraction on a single booking
// Returns detailed logs of every step

import { list, put } from '@vercel/blob';
import { getGmailToken, gmailApi } from './_gmail.js';
import { zohoApi } from './_zoho.js';
import { parseEmail, extractionToZohoFields } from './_ai-parse.js';

function base64urlToBase64(str) {
  if (!str) return '';
  return str.replace(/-/g, '+').replace(/_/g, '/');
}

export default async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var bookingId = req.query.bookingId || (req.body || {}).booking_id;
  if (!bookingId) return res.status(400).json({ error: 'bookingId required' });

  var log = [];
  function L(msg) { log.push(msg); console.log('[diag]', msg); }

  try {
    // 1. Load stored emails from blob
    L('Step 1: Loading stored emails for booking ' + bookingId);
    var blobResult = await list({ prefix: 'emails/booking/' + bookingId + '/' });
    var blobs = (blobResult.blobs || []);
    L('Found ' + blobs.length + ' blob(s)');

    if (blobs.length === 0) {
      return res.status(200).json({ log: log, error: 'No stored emails' });
    }

    // 2. Load each email
    var emails = [];
    for (var i = 0; i < blobs.length; i++) {
      var blobRes = await fetch(blobs[i].url);
      var email = await blobRes.json();
      emails.push(email);
      L('Email ' + i + ': direction=' + email.direction + ' subject="' + (email.subject || '') + '" body_length=' + (email.body || '').length + ' attachments=' + (email.attachments || []).length);
      if (email.attachments && email.attachments.length > 0) {
        email.attachments.forEach(function(a, ai) {
          L('  Attachment ' + ai + ': filename="' + (a.filename || a) + '" mimeType="' + (a.mimeType || '?') + '" size=' + (a.size || '?') + ' attachmentId=' + (a.attachmentId ? 'YES' : 'NO') + ' extractedText=' + (a.extractedText ? a.extractedText.length + ' chars' : 'NO'));
        });
      }
      L('  message_id=' + (email.message_id || '?'));
      L('  gmail_message_id=' + (email.gmail_message_id || '?'));
    }

    // 3. Find inbound email
    var inbound = emails.filter(function(e) { return e.direction === 'inbound'; });
    L('Step 2: Found ' + inbound.length + ' inbound email(s)');

    if (inbound.length === 0) {
      return res.status(200).json({ log: log, error: 'No inbound emails found' });
    }

    var email = inbound[0];
    var gmailMsgId = email.gmail_message_id || email.message_id || '';
    L('Step 3: Using gmail message ID: ' + gmailMsgId);

    if (!gmailMsgId) {
      return res.status(200).json({ log: log, error: 'No Gmail message ID on stored email' });
    }

    // 4. Re-fetch full message from Gmail
    L('Step 4: Fetching full message from Gmail API...');
    var token = await getGmailToken();
    L('Got Gmail token');

    var fullMsg;
    try {
      fullMsg = await gmailApi(token, 'messages/' + gmailMsgId + '?format=full');
      L('Got full message. Has payload: ' + !!fullMsg.payload);
    } catch (fetchErr) {
      L('ERROR fetching from Gmail: ' + fetchErr.message);
      return res.status(200).json({ log: log, error: 'Gmail fetch failed: ' + fetchErr.message });
    }

    // 5. Extract attachments from Gmail message
    L('Step 5: Extracting attachments from Gmail payload...');
    var attachments = [];
    function walkParts(parts) {
      if (!parts) return;
      for (var pi = 0; pi < parts.length; pi++) {
        var part = parts[pi];
        if (part.filename && part.filename.length > 0) {
          attachments.push({
            filename: part.filename,
            mimeType: part.mimeType || '',
            size: part.body ? part.body.size || 0 : 0,
            attachmentId: part.body ? part.body.attachmentId || null : null,
          });
        }
        if (part.parts) walkParts(part.parts);
      }
    }
    if (fullMsg.payload && fullMsg.payload.parts) {
      walkParts(fullMsg.payload.parts);
    }
    L('Found ' + attachments.length + ' attachment(s) from Gmail');
    attachments.forEach(function(a, i) {
      L('  [' + i + '] filename="' + a.filename + '" mime="' + a.mimeType + '" size=' + a.size + ' attachmentId=' + (a.attachmentId ? a.attachmentId.substring(0, 20) + '...' : 'NULL'));
    });

    if (attachments.length === 0) {
      L('No attachments found in Gmail message');
      return res.status(200).json({ log: log, error: 'No attachments in Gmail message' });
    }

    // 6. Download attachment
    var att = attachments[0]; // take first
    L('Step 6: Downloading attachment "' + att.filename + '" (' + att.mimeType + ')...');

    if (!att.attachmentId) {
      L('ERROR: No attachmentId on attachment');
      return res.status(200).json({ log: log, error: 'No attachmentId' });
    }

    var attResult = await gmailApi(token, 'messages/' + gmailMsgId + '/attachments/' + att.attachmentId);
    if (!attResult || !attResult.data) {
      L('ERROR: Attachment download returned no data');
      return res.status(200).json({ log: log, error: 'Attachment download empty' });
    }
    L('Downloaded attachment: ' + attResult.data.length + ' chars of base64url data');

    // 7. Extract text from attachment
    L('Step 7: Extracting text from attachment...');
    var b64 = base64urlToBase64(attResult.data);
    var buffer = Buffer.from(b64, 'base64');
    L('File size: ' + buffer.length + ' bytes');

    var extractedText = '';
    var mt = att.mimeType || '';

    if (mt === 'application/pdf') {
      // PDF: send to Claude document API
      L('Type: PDF — sending to Claude document API');
      var apiKey = process.env.ANTHROPIC_API_KEY;
      var claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          messages: [{
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
              { type: 'text', text: 'Extract ALL text from this document verbatim. Include every number, date, amount, reference, line item. Preserve table structure with | separators.' },
            ],
          }],
        }),
      });
      if (claudeRes.ok) {
        var claudeData = await claudeRes.json();
        for (var ci = 0; ci < claudeData.content.length; ci++) {
          if (claudeData.content[ci].type === 'text') extractedText += claudeData.content[ci].text;
        }
        L('Claude extracted ' + extractedText.length + ' chars');
      } else {
        var errText = await claudeRes.text();
        L('Claude API error: ' + errText.substring(0, 300));
      }
    } else if (mt === 'application/msword' || att.filename.endsWith('.doc')) {
      // .doc: use word-extractor
      L('Type: DOC — using word-extractor');
      try {
        var WordExtractor = (await import('word-extractor')).default;
        var extractor = new WordExtractor();
        var doc = await extractor.extract(buffer);
        extractedText = doc.getBody() || '';
        L('word-extractor got ' + extractedText.length + ' chars');
      } catch (docErr) {
        L('word-extractor error: ' + docErr.message);
      }
    } else if (mt.indexOf('wordprocessingml') > -1 || att.filename.endsWith('.docx')) {
      // .docx: these are zip-based, Claude API doesn't support them either
      // Try basic extraction from the XML inside the zip
      L('Type: DOCX — attempting basic XML extraction');
      try {
        var { Readable } = await import('stream');
        // docx is a zip containing word/document.xml
        // For now, try sending raw text extraction
        var rawText = buffer.toString('utf-8');
        // Extract text between XML tags
        var matches = rawText.match(/<w:t[^>]*>([^<]+)<\/w:t>/g) || [];
        extractedText = matches.map(function(m) { return m.replace(/<[^>]+>/g, ''); }).join(' ');
        L('Basic XML extraction got ' + extractedText.length + ' chars');
      } catch (docxErr) {
        L('DOCX extraction error: ' + docxErr.message);
      }
    } else if (mt === 'text/csv' || mt === 'application/csv' || mt === 'text/plain') {
      extractedText = buffer.toString('utf-8');
      L('Plain text: ' + extractedText.length + ' chars');
    } else if (mt.indexOf('spreadsheet') > -1 || mt.indexOf('excel') > -1) {
      // Excel: Claude can't read these via document API either
      // Extract raw strings from binary
      L('Type: Excel — attempting raw string extraction');
      try {
        var rawText = buffer.toString('utf-8');
        // Filter for printable strings
        extractedText = rawText.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s{3,}/g, '\n').trim();
        L('Raw string extraction got ' + extractedText.length + ' chars');
      } catch (xlErr) {
        L('Excel extraction error: ' + xlErr.message);
      }
    } else {
      L('Unsupported type: ' + mt);
    }

    if (!extractedText) {
      L('No text extracted');
      return res.status(200).json({ log: log, error: 'No text could be extracted from attachment' });
    }

    L('Step 8: Extracted ' + extractedText.length + ' chars');
    L('First 500 chars: ' + extractedText.substring(0, 500));

    // 8. Now run AI parser on body + extracted text
    var body = email.body || '';
    var fullContent = body + '\n\n--- ATTACHMENT: ' + att.filename + ' ---\n' + extractedText + '\n--- END ATTACHMENT ---';

    L('Step 9: Running AI parser on ' + fullContent.length + ' chars...');

    // Get booking context from Zoho
    var bookingFields = 'Name,Lodge_Name,Status,Check_in_Date,Check_out_Date,Nights,id,' +
      'Deposit_Amount,Second_Payment_Amount,Third_Payment_Amount,Fourth_Payment_Amount,' +
      'Deposit_Paid_Date,nd_Payment_Paid_Date,rd_Payment_Paid_Date,th_Payment_Paid_Date';
    var bkResult = await zohoApi('GET', 'Lodge_Bookings/' + bookingId + '?fields=' + bookingFields);
    var booking = (bkResult && bkResult.data) ? bkResult.data[0] || bkResult.data : {};

    var lodgeName = booking.Lodge_Name || booking.Name || '';
    if (typeof lodgeName === 'object') lodgeName = lodgeName.name || '';

    var bookingContext = {
      lodge_name: lodgeName,
      check_in: booking.Check_in_Date || '',
      check_out: booking.Check_out_Date || '',
      status: booking.Status || '',
      has_attachments: true,
      attachment_filenames: [att.filename],
    };

    var aiResult = await parseEmail(fullContent, bookingContext);
    L('AI parse complete');
    L('Summary: ' + (aiResult.summary || ''));
    L('Extracted fields: ' + JSON.stringify(aiResult.extracted || {}).substring(0, 800));

    // 9. Convert to Zoho fields
    var fieldResult = extractionToZohoFields(aiResult);
    L('Step 10: Zoho field updates: ' + JSON.stringify(fieldResult.updates));
    L('Flagged: ' + JSON.stringify(fieldResult.flagged));

    // 10. Write to Zoho
    if (Object.keys(fieldResult.updates).length > 0) {
      fieldResult.updates.id = bookingId;
      L('Step 11: Writing to Zoho...');
      var zohoResult = await zohoApi('PUT', 'Lodge_Bookings', { data: [fieldResult.updates] });
      L('Zoho result: ' + JSON.stringify(zohoResult).substring(0, 300));
    } else {
      L('No fields to update');
    }

    // 11. Update blob with extracted text
    var updatedAttachments = (email.attachments || []).map(function(a) {
      if ((a.filename || '') === att.filename) {
        return Object.assign({}, a, { attachmentId: att.attachmentId, extractedText: extractedText });
      }
      return a;
    });
    email.attachments = updatedAttachments;
    email.gmail_message_id = gmailMsgId;
    var safeId = (email.message_id || email.id || '').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
    await put('emails/booking/' + bookingId + '/' + safeId + '.json',
      JSON.stringify(email), { access: 'public', contentType: 'application/json', addRandomSuffix: false });
    L('Step 12: Updated blob with extracted text and attachmentId');

    return res.status(200).json({
      success: true,
      log: log,
      extracted_text_preview: extractedText.substring(0, 1000),
      ai_result: aiResult,
      zoho_updates: fieldResult.updates,
    });

  } catch (err) {
    L('FATAL ERROR: ' + err.message + '\n' + err.stack);
    return res.status(200).json({ log: log, error: err.message });
  }
}
