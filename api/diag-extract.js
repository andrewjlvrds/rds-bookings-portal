// Diagnostic: test extraction on a single booking - processes ALL attachments
import { list, put } from '@vercel/blob';
import { getGmailToken, gmailApi } from './_gmail.js';
import { zohoApi } from './_zoho.js';
import { parseEmail, extractionToZohoFields } from './_ai-parse.js';

function base64urlToBase64(str) {
  if (!str) return '';
  return str.replace(/-/g, '+').replace(/_/g, '/');
}

async function extractText(buffer, filename, mimeType, apiKey, L) {
  var mt = mimeType || '';

  if (mt === 'text/csv' || mt === 'application/csv' || mt === 'text/plain') {
    var text = buffer.toString('utf-8');
    L('  Plain text: ' + text.length + ' chars');
    return text;
  }

  if (mt === 'application/msword' || (filename && filename.toLowerCase().endsWith('.doc') && !filename.toLowerCase().endsWith('.docx'))) {
    try {
      var WordExtractor = (await import('word-extractor')).default;
      var extractor = new WordExtractor();
      var doc = await extractor.extract(buffer);
      var text = doc.getBody() || '';
      L('  word-extractor: ' + text.length + ' chars');
      return text;
    } catch (e) { L('  DOC error: ' + e.message); return null; }
  }

  // .docx → unzip and extract from word/document.xml
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
      L('  DOCX extracted: ' + text.length + ' chars');
      return text;
    } catch (e) { L('  DOCX error: ' + e.message); return null; }
  }

  // PDF, Excel - Claude document API
  if (mt === 'application/pdf' || mt.indexOf('spreadsheet') > -1 || mt.indexOf('excel') > -1) {
    try {
      var b64 = buffer.toString('base64');
      L('  Sending to Claude (' + mt + ')...');
      var res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514', max_tokens: 4000,
          messages: [{ role: 'user', content: [
            { type: 'document', source: { type: 'base64', media_type: mt, data: b64 } },
            { type: 'text', text: 'Extract ALL text from this document verbatim. Include every number, date, amount, reference, line item. Preserve table structure with | separators.' },
          ]}],
        }),
      });
      if (!res.ok) { L('  Claude error: ' + res.status); return null; }
      var data = await res.json();
      var text = data.content.filter(function(c) { return c.type === 'text'; }).map(function(c) { return c.text; }).join('');
      L('  Claude extracted: ' + text.length + ' chars');
      return text;
    } catch (e) { L('  Claude error: ' + e.message); return null; }
  }

  L('  Unsupported type: ' + mt);
  return null;
}

export default async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var bookingId = req.query.bookingId || (req.body || {}).booking_id;
  if (!bookingId) return res.status(400).json({ error: 'bookingId required' });

  var log = [];
  function L(msg) { log.push(msg); console.log('[diag]', msg); }

  try {
    // 1. Load stored emails
    L('Loading stored emails for ' + bookingId);
    var blobResult = await list({ prefix: 'emails/booking/' + bookingId + '/' });
    var blobs = blobResult.blobs || [];
    L('Found ' + blobs.length + ' blob(s)');
    if (blobs.length === 0) return res.status(200).json({ log: log, error: 'No stored emails' });

    var emails = [];
    for (var i = 0; i < blobs.length; i++) {
      var blobRes = await fetch(blobs[i].url);
      var email = await blobRes.json();
      emails.push(email);
      L('Email ' + i + ': dir=' + email.direction + ' subj="' + (email.subject || '').substring(0, 60) + '" att=' + (email.attachments || []).length);
    }

    var inbound = emails.filter(function(e) { return e.direction === 'inbound'; });
    if (inbound.length === 0) return res.status(200).json({ log: log, error: 'No inbound emails' });

    var email = inbound[0];
    var gmailMsgId = email.gmail_message_id || email.message_id || '';
    if (!gmailMsgId) return res.status(200).json({ log: log, error: 'No Gmail message ID' });

    // 2. Fetch full message from Gmail for attachment IDs
    L('Fetching Gmail message ' + gmailMsgId);
    var token = await getGmailToken();
    var fullMsg = await gmailApi(token, 'messages/' + gmailMsgId + '?format=full');

    var attachments = [];
    function walkParts(parts) {
      if (!parts) return;
      for (var pi = 0; pi < parts.length; pi++) {
        var p = parts[pi];
        if (p.filename && p.filename.length > 0) {
          attachments.push({ filename: p.filename, mimeType: p.mimeType || '', size: p.body ? p.body.size || 0 : 0, attachmentId: p.body ? p.body.attachmentId || null : null });
        }
        if (p.parts) walkParts(p.parts);
      }
    }
    if (fullMsg.payload && fullMsg.payload.parts) walkParts(fullMsg.payload.parts);
    L('Found ' + attachments.length + ' attachment(s)');

    // 3. Download and extract ALL attachments
    var apiKey = process.env.ANTHROPIC_API_KEY;
    var allTexts = [];
    var updatedAtts = [];

    // Match stored attachment text by filename
    var storedAtts = email.attachments || [];
    var storedTextMap = {};
    storedAtts.forEach(function(sa) {
      if (sa.filename && sa.extractedText) storedTextMap[sa.filename] = sa.extractedText;
    });

    for (var ai = 0; ai < attachments.length; ai++) {
      var att = attachments[ai];
      L('Att ' + ai + ': "' + att.filename + '" (' + att.mimeType + ', ' + att.size + 'B)');

      // Reuse stored extraction if available
      if (storedTextMap[att.filename]) {
        L('  Reusing stored text: ' + storedTextMap[att.filename].length + ' chars');
        allTexts.push('--- ATTACHMENT: ' + att.filename + ' ---\n' + storedTextMap[att.filename] + '\n--- END ATTACHMENT ---');
        updatedAtts.push(Object.assign({}, att, { extractedText: storedTextMap[att.filename] }));
        continue;
      }

      if (!att.attachmentId || att.size > 5 * 1024 * 1024) {
        L('  Skipped');
        updatedAtts.push(att);
        continue;
      }

      var attResult = await gmailApi(token, 'messages/' + gmailMsgId + '/attachments/' + att.attachmentId);
      if (!attResult || !attResult.data) { L('  Empty'); updatedAtts.push(att); continue; }

      var b64std = base64urlToBase64(attResult.data);
      var buffer = Buffer.from(b64std, 'base64');

      var extracted = await extractText(buffer, att.filename, att.mimeType, apiKey, L);
      if (extracted) {
        allTexts.push('--- ATTACHMENT: ' + att.filename + ' ---\n' + extracted + '\n--- END ATTACHMENT ---');
      }
      updatedAtts.push(Object.assign({}, att, { extractedText: extracted || null }));
      await new Promise(function(r) { setTimeout(r, 300); });
    }

    L('Extracted from ' + allTexts.length + '/' + attachments.length + ' attachments');

    // 4. Run AI parser
    var body = email.body || '';
    var fullContent = body + (allTexts.length > 0 ? '\n\n' + allTexts.join('\n\n') : '');
    L('AI input: ' + fullContent.length + ' chars');

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
      nights: booking.Nights || '',
      status: booking.Status || '',
      has_attachments: allTexts.length > 0,
      attachment_filenames: updatedAtts.filter(function(a) { return a.extractedText; }).map(function(a) { return a.filename; }),
    };

    var aiResult = await parseEmail(fullContent, bookingContext);
    L('AI: ' + (aiResult.summary || ''));

    var fieldResult = extractionToZohoFields(aiResult);
    L('Zoho updates: ' + JSON.stringify(fieldResult.updates));

    // 5. Write to Zoho
    if (Object.keys(fieldResult.updates).length > 0) {
      fieldResult.updates.id = bookingId;
      var zohoResult = await zohoApi('PUT', 'Lodge_Bookings', { data: [fieldResult.updates] });
      L('Zoho: ' + JSON.stringify(zohoResult).substring(0, 300));
    }

    // 6. Update blob
    email.attachments = updatedAtts;
    email.gmail_message_id = gmailMsgId;
    var safeId = (email.message_id || email.id || '').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
    await put('emails/booking/' + bookingId + '/' + safeId + '.json',
      JSON.stringify(email), { access: 'public', contentType: 'application/json', addRandomSuffix: false });
    L('Blob updated');

    return res.status(200).json({ success: true, log: log, ai_result: aiResult, zoho_updates: fieldResult.updates });
  } catch (err) {
    L('ERROR: ' + err.message);
    return res.status(200).json({ log: log, error: err.message });
  }
}
