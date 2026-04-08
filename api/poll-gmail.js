import { getGmailToken, gmailApi, getOrCreateLabel, labelMessage, tourLabelName } from './_gmail.js';
import { storeEmail, isEmailStored } from './_email-store.js';
import { zohoApi } from './_zoho.js';
import { parseEmail, extractionToZohoFields } from './_ai-parse.js';

// Extract RDS reference from text, e.g. RDS-FoSA-Mar26-CanyonVillage-26/04/03
function extractRdsRef(text) {
  if (!text) return null;
  var match = text.match(/\[?(RDS-[A-Za-z0-9\-\/]+)\]?/);
  return match ? match[1] : null;
}

// Decode base64url string
function decodeBase64Url(str) {
  if (!str) return '';
  var padded = str.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return Buffer.from(padded, 'base64').toString('utf-8');
  } catch (e) {
    return '';
  }
}

// Extract plain text body from Gmail message payload
function extractBody(payload) {
  if (!payload) return '';

  var textPlain = '';
  var textHtml = '';

  function walkParts(part) {
    if (!part) return;
    // Check this part directly
    if (part.mimeType === 'text/plain' && part.body && part.body.data && !textPlain) {
      textPlain = decodeBase64Url(part.body.data);
    }
    if (part.mimeType === 'text/html' && part.body && part.body.data && !textHtml) {
      textHtml = decodeBase64Url(part.body.data);
    }
    // Recurse into sub-parts
    if (part.parts) {
      for (var i = 0; i < part.parts.length; i++) {
        walkParts(part.parts[i]);
      }
    }
  }

  // Start: check top-level body
  if (payload.mimeType === 'text/plain' && payload.body && payload.body.data) {
    return decodeBase64Url(payload.body.data);
  }

  // Walk all parts recursively
  walkParts(payload);

  // Prefer plain text, fall back to stripped HTML
  if (textPlain) return textPlain;
  if (textHtml) return textHtml.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

  return '';
}

// Get header value from Gmail message
function getHeader(headers, name) {
  if (!headers) return '';
  var lower = name.toLowerCase();
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].name.toLowerCase() === lower) return headers[i].value;
  }
  return '';
}

// Extract attachment info including attachmentId for downloading
function extractAttachments(payload) {
  var attachments = [];
  function walkParts(parts) {
    if (!parts) return;
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (part.filename && part.filename.length > 0) {
        attachments.push({
          filename: part.filename,
          mimeType: part.mimeType || '',
          size: part.body ? part.body.size || 0 : 0,
          attachmentId: part.body ? part.body.attachmentId || null : null,
          partId: part.partId || null,
        });
      }
      if (part.parts) walkParts(part.parts);
    }
  }
  if (payload.parts) walkParts(payload.parts);
  return attachments;
}

// MIME types we can extract text from
var EXTRACTABLE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.ms-excel', // xls
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/msword', // doc
  'text/csv',
  'text/plain',
  'application/csv',
];

function isExtractable(mimeType) {
  if (!mimeType) return false;
  return EXTRACTABLE_TYPES.indexOf(mimeType) > -1 ||
    mimeType.indexOf('spreadsheet') > -1 ||
    mimeType.indexOf('csv') > -1 ||
    mimeType.indexOf('word') > -1 ||
    mimeType.indexOf('msword') > -1;
}

// Download attachment content from Gmail API
async function downloadAttachment(token, messageId, attachmentId) {
  var result = await gmailApi(token, 'messages/' + messageId + '/attachments/' + attachmentId);
  if (!result || !result.data) return null;
  // Gmail returns base64url-encoded data
  return result.data;
}

// Convert base64url to standard base64
function base64urlToBase64(str) {
  if (!str) return '';
  return str.replace(/-/g, '+').replace(/_/g, '/');
}

// Extract text from CSV/plain text attachment (base64url-encoded)
function extractTextFromPlain(base64urlData) {
  try {
    var b64 = base64urlToBase64(base64urlData);
    return Buffer.from(b64, 'base64').toString('utf-8');
  } catch (e) {
    return null;
  }
}

// Send document (PDF or Word) to Claude API for text extraction
async function extractTextFromDocument(base64urlData, filename, mimeType) {
  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  var b64 = base64urlToBase64(base64urlData);

  // Map MIME types for Claude API document support
  var claudeMediaType = mimeType;
  if (mimeType === 'application/msword') {
    // Old .doc format — Claude may not support directly, try as generic
    claudeMediaType = 'application/msword';
  }

  try {
    var response = await fetch('https://api.anthropic.com/v1/messages', {
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
            {
              type: 'document',
              source: { type: 'base64', media_type: claudeMediaType, data: b64 },
            },
            {
              type: 'text',
              text: 'Extract ALL text content from this document. Include every number, date, amount, reference, line item, and note. Output the text exactly as it appears, preserving table structure where possible (use | separators for columns). Do not summarise — extract everything verbatim. If it is a rate card, quote, or proforma invoice, capture every line item with amounts.',
            },
          ],
        }],
      }),
    });

    if (!response.ok) {
      var errBody = await response.text();
      console.error('Document extraction API error:', response.status, errBody.substring(0, 200));
      return null;
    }

    var data = await response.json();
    var text = '';
    for (var i = 0; i < data.content.length; i++) {
      if (data.content[i].type === 'text') text += data.content[i].text;
    }
    return text || null;
  } catch (e) {
    console.error('Document extraction failed for', filename, e.message);
    return null;
  }
}

export default async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    var refetch = req.query && req.query.refetch === 'true';
    var token = await getGmailToken();

    // Fetch recent messages — wider window for refetch
    // Search everywhere — not just inbox — so labelled replies are found
    var searchWindow = refetch ? '14d' : '3d';
    var query = 'newer_than:' + searchWindow + ' -from:bookings@ridedownsouth.com';
    var listResult = await gmailApi(token, 'messages?q=' + encodeURIComponent(query) + '&maxResults=' + (refetch ? '50' : '20'));

    var messages = listResult.messages || [];
    if (messages.length === 0) {
      return res.status(200).json({ success: true, checked: 0, stored: 0, message: 'No new messages' });
    }

    // Fetch all bookings with Enquiry Sent or later status to match against
    var bookingFields = 'Name,Lodge_Name,RDS_Reference,Status,Check_in_Date,Lodge,Tour,id,Deposit_Amount,Second_Payment_Amount,Third_Payment_Amount,Fourth_Payment_Amount,Deposit_Paid_Date,nd_Payment_Paid_Date,rd_Payment_Paid_Date,th_Payment_Paid_Date';
    var bookingsResult = await zohoApi('GET', 'Lodge_Bookings?fields=' + bookingFields + '&per_page=200');
    var allBookings = (bookingsResult && bookingsResult.data) || [];

    // Build lookup maps
    var refMap = {};  // RDS reference → booking
    var nameMap = {}; // lodge name (lowercase) → bookings array
    allBookings.forEach(function(bk) {
      var ref = bk.RDS_Reference || '';
      if (ref) refMap[ref.toLowerCase()] = bk;

      var lodge = bk.Lodge_Name || bk.Name || '';
      var lodgeClean = lodge.split(' - ')[0].toLowerCase().trim();
      if (lodgeClean) {
        if (!nameMap[lodgeClean]) nameMap[lodgeClean] = [];
        nameMap[lodgeClean].push(bk);
      }
    });

    var stored = 0;
    var skipped = 0;
    var noMatch = 0;
    var errors = [];
    var details = [];

    // Process each message
    for (var i = 0; i < messages.length; i++) {
      var msgId = messages[i].id;

      try {
        // Fetch full message
        var msg = await gmailApi(token, 'messages/' + msgId + '?format=full');
        var headers = msg.payload ? msg.payload.headers : [];
        var subject = getHeader(headers, 'Subject');
        var from = getHeader(headers, 'From');
        var to = getHeader(headers, 'To');
        var date = getHeader(headers, 'Date');
        var threadId = msg.threadId || '';

        // Skip if from us
        if (from.indexOf('bookings@ridedownsouth.com') > -1 || from.indexOf('ridedownsouth.com') > -1) {
          skipped++;
          continue;
        }

        // Try to match to a booking
        var matchedBooking = null;
        var matchMethod = '';

        // Extract body for matching
        var body = extractBody(msg.payload);

        // 1. Match by RDS reference in subject
        var rdsRef = extractRdsRef(subject);
        if (rdsRef && refMap[rdsRef.toLowerCase()]) {
          matchedBooking = refMap[rdsRef.toLowerCase()];
          matchMethod = 'rds_reference_subject';
        }

        // 2. Match by RDS reference in body (quoted reply text)
        if (!matchedBooking && body) {
          var bodyRefs = body.match(/RDS-[A-Za-z0-9\-\/]+/g) || [];
          for (var br = 0; br < bodyRefs.length; br++) {
            var bodyRef = bodyRefs[br].toLowerCase();
            if (refMap[bodyRef]) {
              matchedBooking = refMap[bodyRef];
              matchMethod = 'rds_reference_body';
              break;
            }
          }
        }

        // 3. Match by lodge name in subject or from address
        if (!matchedBooking) {
          var subjectLower = (subject || '').toLowerCase();
          var fromLower = (from || '').toLowerCase();
          var lodgeNames = Object.keys(nameMap);
          for (var ln = 0; ln < lodgeNames.length; ln++) {
            var name = lodgeNames[ln];
            if (name.length > 3 && (subjectLower.indexOf(name) > -1 || fromLower.indexOf(name) > -1)) {
              // Pick the most recent active booking for this lodge
              var candidates = nameMap[name].filter(function(b) {
                return b.Status === 'Enquiry Sent' || b.Status === 'Ready to Send' ||
                       b.Status === 'Availability Confirmed' || b.Status === 'Proforma Received';
              });
              if (candidates.length > 0) {
                matchedBooking = candidates[0];
                matchMethod = 'lodge_name';
              }
            }
          }
        }

        if (!matchedBooking) {
          noMatch++;
          continue;
        }

        var bookingId = matchedBooking.id;

        // Check if already stored (dedup by message ID) — skip if refetching
        if (!refetch) {
          var alreadyStored = await isEmailStored(bookingId, msgId);
          if (alreadyStored) {
            skipped++;
            continue;
          }
        }

        // Attachments from message payload
        var attachments = extractAttachments(msg.payload);

        // Download and extract text from attachments (PDF, CSV, Excel, plain text)
        // Size guard: skip attachments > 5MB (Claude API limit), limit 3 extractions per poll run
        var MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024; // 5MB
        var attachmentTexts = [];
        var attachmentsWithText = [];
        for (var ai = 0; ai < attachments.length; ai++) {
          var att = attachments[ai];
          var attCopy = {
            filename: att.filename,
            mimeType: att.mimeType,
            size: att.size,
            attachmentId: att.attachmentId,
            extractedText: null,
          };

          if (att.attachmentId && isExtractable(att.mimeType) && att.size < MAX_ATTACHMENT_SIZE) {
            try {
              console.log('Downloading attachment:', att.filename, '(' + att.mimeType + ', ' + att.size + ' bytes)');
              var attData = await downloadAttachment(token, msgId, att.attachmentId);

              if (attData) {
                var extractedText = null;
                var mt = att.mimeType || '';

                if (mt === 'text/csv' || mt === 'application/csv' || mt === 'text/plain') {
                  extractedText = extractTextFromPlain(attData);
                } else if (isExtractable(mt)) {
                  // PDF, Word, Excel — all go through Claude document API
                  extractedText = await extractTextFromDocument(attData, att.filename, mt);
                }

                if (extractedText) {
                  attCopy.extractedText = extractedText;
                  attachmentTexts.push('--- ATTACHMENT: ' + att.filename + ' ---\n' + extractedText + '\n--- END ATTACHMENT ---');
                  console.log('Extracted', extractedText.length, 'chars from', att.filename);
                }
              }

              // Small delay between attachment downloads
              await new Promise(function(r) { setTimeout(r, 300); });
            } catch (attErr) {
              console.error('Attachment extraction failed for', att.filename, attErr.message);
            }
          }

          attachmentsWithText.push(attCopy);
        }

        // Build full content: email body + attachment texts
        var fullContent = body || '';
        if (attachmentTexts.length > 0) {
          fullContent += '\n\n' + attachmentTexts.join('\n\n');
        }

        // Store to blob (with attachment extracted text)
        await storeEmail({
          booking_id: bookingId,
          message_id: msgId,
          type: 'lodge_reply',
          direction: 'inbound',
          email_from: from,
          email_to: to,
          email_subject: subject,
          email_content: body,
          email_date: date ? new Date(date).toISOString() : new Date().toISOString(),
          gmail_thread_id: threadId,
          gmail_message_id: msgId,
          attachments: attachmentsWithText,
        });

        // Detect auto-replies — store but don't update booking status
        var isAutoReply = false;
        var autoReplyHeader = getHeader(headers, 'Auto-Submitted');
        var precedenceHeader = getHeader(headers, 'Precedence');
        var xAutoResponse = getHeader(headers, 'X-Autoreply');
        if (autoReplyHeader && autoReplyHeader !== 'no') isAutoReply = true;
        if (precedenceHeader === 'auto_reply' || precedenceHeader === 'bulk') isAutoReply = true;
        if (xAutoResponse) isAutoReply = true;
        // Also check body patterns for common auto-reply phrases
        var bodyLower = (body || '').toLowerCase();
        if (!isAutoReply && (
          bodyLower.includes('this is an automated response') ||
          bodyLower.includes('this is an auto-generated') ||
          bodyLower.includes('automatic reply') ||
          bodyLower.includes('out of office') ||
          bodyLower.includes('auto-reply') ||
          bodyLower.includes('autoreply') ||
          bodyLower.includes('we have received your email') ||
          bodyLower.includes('thank you for contacting') ||
          bodyLower.includes('we will get back to you')
        )) isAutoReply = true;

        // AI parse the email + attachment text to extract booking data (skip for auto-replies)
        var aiResult = null;
        var zohoUpdates = { Last_Response_Date: new Date().toISOString().split('T')[0] };

        // Use fullContent (body + attachment text) for AI parsing — much richer data source
        var contentForParsing = fullContent || '';
        if (!isAutoReply && contentForParsing && contentForParsing.trim().length > 10) {
          try {
            var bookingContext = {
              lodge_name: matchedBooking.Lodge_Name || matchedBooking.Name || '',
              check_in: matchedBooking.Check_in_Date || '',
              status: matchedBooking.Status || '',
              deposit_amount: matchedBooking.Deposit_Amount || '',
              deposit_paid: matchedBooking.Deposit_Paid_Date ? 'yes' : 'no',
              payment_2_amount: matchedBooking.Second_Payment_Amount || '',
              payment_2_paid: matchedBooking.nd_Payment_Paid_Date ? 'yes' : 'no',
              payment_3_amount: matchedBooking.Third_Payment_Amount || '',
              payment_3_paid: matchedBooking.rd_Payment_Paid_Date ? 'yes' : 'no',
              payment_4_amount: matchedBooking.Fourth_Payment_Amount || '',
              payment_4_paid: matchedBooking.th_Payment_Paid_Date ? 'yes' : 'no',
              has_attachments: attachmentTexts.length > 0,
              attachment_filenames: attachmentsWithText.filter(function(a) { return a.extractedText; }).map(function(a) { return a.filename; }),
            };

            aiResult = await parseEmail(contentForParsing, bookingContext);
            console.log('AI parse result for', matchedBooking.Name || bookingId, ':', JSON.stringify(aiResult).substring(0, 500));

            var fieldResult = extractionToZohoFields(aiResult);
            // Merge AI-extracted fields into Zoho updates
            var fieldKeys = Object.keys(fieldResult.updates);
            for (var fk = 0; fk < fieldKeys.length; fk++) {
              zohoUpdates[fieldKeys[fk]] = fieldResult.updates[fieldKeys[fk]];
            }

            if (fieldResult.has_flags) {
              console.log('AI flagged fields for review:', JSON.stringify(fieldResult.flagged));
            }
          } catch (aiErr) {
            console.error('AI parse failed for', bookingId, aiErr.message);
          }
        }

        // Update Zoho with extracted fields + Last_Response_Date (skip for auto-replies)
        if (!isAutoReply) {
          try {
            zohoUpdates.id = bookingId;
            await zohoApi('PUT', 'Lodge_Bookings', { data: [zohoUpdates] });
            console.log('Updated booking', bookingId, 'with', Object.keys(zohoUpdates).length - 1, 'fields');
          } catch (zohoErr) {
            console.error('Failed to update booking', bookingId, zohoErr.message);
          }
        } else {
          console.log('Auto-reply detected for', matchedBooking.Name || bookingId, '— stored but no status change');
        }

        // Apply Gmail label based on tour/lodge name
        try {
          var tourName = '';
          if (matchedBooking.Tour) {
            tourName = typeof matchedBooking.Tour === 'object' ? matchedBooking.Tour.name : matchedBooking.Tour;
          }
          var lodgeNameForLabel = (matchedBooking.Lodge_Name || matchedBooking.Name || '').split(' - ')[0].trim();
          if (tourName) {
            var labelName = tourLabelName(tourName, lodgeNameForLabel);
            var labelId = await getOrCreateLabel(token, labelName);
            if (labelId) {
              await labelMessage(token, msgId, labelId);
              console.log('Labelled message', msgId, 'as', labelName);
            }
          }
        } catch (labelErr) {
          console.error('Failed to label message', msgId, labelErr.message);
        }

        stored++;
        var extractedAttCount = attachmentsWithText.filter(function(a) { return a.extractedText; }).length;
        details.push({
          message_id: msgId,
          subject: subject,
          from: from,
          matched_booking: matchedBooking.Name || matchedBooking.Lodge_Name,
          match_method: matchMethod,
          attachments: attachments.length,
          attachments_extracted: extractedAttCount,
          auto_reply: isAutoReply,
          ai_summary: isAutoReply ? 'Auto-reply — no status change' : (aiResult ? aiResult.summary : null),
          ai_status: isAutoReply ? null : (aiResult && aiResult.extracted && aiResult.extracted.suggested_status ? aiResult.extracted.suggested_status.value : null),
          fields_updated: isAutoReply ? 0 : Object.keys(zohoUpdates).length - 1,
        });

      } catch (msgErr) {
        console.error('Error processing message', msgId, msgErr.message);
        errors.push({ message_id: msgId, error: msgErr.message });
      }

      // Rate limit: small delay between Gmail API calls
      await new Promise(function(r) { setTimeout(r, 200); });
    }

    console.log('poll-gmail: checked', messages.length, 'stored', stored, 'skipped', skipped, 'no-match', noMatch);

    res.status(200).json({
      success: true,
      checked: messages.length,
      stored: stored,
      skipped: skipped,
      no_match: noMatch,
      errors: errors.length > 0 ? errors : undefined,
      details: details.length > 0 ? details : undefined,
    });

  } catch (err) {
    console.error('poll-gmail error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
