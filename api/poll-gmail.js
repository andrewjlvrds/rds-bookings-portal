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

  // Simple single-part message
  if (payload.mimeType === 'text/plain' && payload.body && payload.body.data) {
    return decodeBase64Url(payload.body.data);
  }

  // Multipart — search parts for text/plain
  if (payload.parts) {
    for (var i = 0; i < payload.parts.length; i++) {
      var part = payload.parts[i];
      if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        return decodeBase64Url(part.body.data);
      }
      // Nested multipart (e.g. multipart/alternative inside multipart/mixed)
      if (part.parts) {
        for (var j = 0; j < part.parts.length; j++) {
          if (part.parts[j].mimeType === 'text/plain' && part.parts[j].body && part.parts[j].body.data) {
            return decodeBase64Url(part.parts[j].body.data);
          }
        }
      }
    }
    // Fallback to text/html if no plain text
    for (var k = 0; k < payload.parts.length; k++) {
      if (payload.parts[k].mimeType === 'text/html' && payload.parts[k].body && payload.parts[k].body.data) {
        var html = decodeBase64Url(payload.parts[k].body.data);
        // Strip HTML tags for a rough plain text version
        return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }
    }
  }

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

// Extract attachment info (names only, not content)
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
        });
      }
      if (part.parts) walkParts(part.parts);
    }
  }
  if (payload.parts) walkParts(payload.parts);
  return attachments;
}

export default async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    var token = await getGmailToken();

    // Fetch recent inbox messages (last 3 days, max 20)
    // Filter: in inbox, not from us, is a reply (has Re:) or mentions RDS/booking
    var query = 'in:inbox newer_than:3d -from:bookings@ridedownsouth.com';
    var listResult = await gmailApi(token, 'messages?q=' + encodeURIComponent(query) + '&maxResults=20');

    var messages = listResult.messages || [];
    if (messages.length === 0) {
      return res.status(200).json({ success: true, checked: 0, stored: 0, message: 'No new messages' });
    }

    // Fetch all bookings with Enquiry Sent or later status to match against
    var bookingFields = 'Name,Lodge_Name,RDS_Reference,Status,Check_in_Date,Lodge,Tour,id';
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

        // Check if already stored (dedup by message ID)
        var alreadyStored = await isEmailStored(bookingId, msgId);
        if (alreadyStored) {
          skipped++;
          continue;
        }

        // Extract body and attachments
        var body = extractBody(msg.payload);
        var attachments = extractAttachments(msg.payload);

        // Store to blob
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
          attachments: attachments,
        });

        // AI parse the email to extract booking data
        var aiResult = null;
        var zohoUpdates = { Last_Response_Date: new Date().toISOString().split('T')[0] };

        if (body && body.trim().length > 10) {
          try {
            var bookingContext = {
              lodge_name: matchedBooking.Lodge_Name || matchedBooking.Name || '',
              check_in: matchedBooking.Check_in_Date || '',
              status: matchedBooking.Status || '',
            };

            aiResult = await parseEmail(body, bookingContext);
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

        // Update Zoho with extracted fields + Last_Response_Date
        try {
          zohoUpdates.id = bookingId;
          await zohoApi('PUT', 'Lodge_Bookings', { data: [zohoUpdates] });
          console.log('Updated booking', bookingId, 'with', Object.keys(zohoUpdates).length - 1, 'fields');
        } catch (zohoErr) {
          console.error('Failed to update booking', bookingId, zohoErr.message);
        }

        // Apply Gmail label based on tour name
        try {
          var tourName = '';
          if (matchedBooking.Tour) {
            tourName = typeof matchedBooking.Tour === 'object' ? matchedBooking.Tour.name : matchedBooking.Tour;
          }
          if (tourName) {
            var labelName = tourLabelName(tourName);
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
        details.push({
          message_id: msgId,
          subject: subject,
          from: from,
          matched_booking: matchedBooking.Name || matchedBooking.Lodge_Name,
          match_method: matchMethod,
          attachments: attachments.length,
          ai_summary: aiResult ? aiResult.summary : null,
          ai_status: aiResult && aiResult.extracted && aiResult.extracted.suggested_status ? aiResult.extracted.suggested_status.value : null,
          fields_updated: Object.keys(zohoUpdates).length - 1,
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
