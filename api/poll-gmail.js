import { getGmailToken, gmailApi, getOrCreateLabel, labelMessage, tourLabelName } from './_gmail.js';
import { storeEmail, isEmailStored, lookupSentIndex, lookupSentIndexByThreadId, normalizeMessageId } from './_email-store.js';
import { zohoApi } from './_zoho.js';
import { parseEmail, extractionToZohoFields } from './_ai-parse.js';
import { tagReplyReceived } from './_activity-log.js';
import { list } from '@vercel/blob';
import { isPerfectstayEmail, routePerfectstayEmail } from './_perfectstay-router.js';
import {
  extractRdsRef,
  extractIsoDates,
  dateMatchScore,
  buildMatchMaps,
  buildEmailMap,
  matchEmailToBooking,
} from './_email-match.js';

// (extractRdsRef, extractIsoDates, dateMatchScore imported from _email-match.js)

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

// Extract text from a document attachment
// PDF: Claude document API. DOC: word-extractor. CSV/text: direct decode.
async function extractTextFromAttachment(base64urlData, filename, mimeType) {
  var b64 = base64urlToBase64(base64urlData);
  var buffer = Buffer.from(b64, 'base64');
  var mt = mimeType || '';

  // PDF → Claude document API
  if (mt === 'application/pdf') {
    var apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;
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
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
              { type: 'text', text: 'Extract ALL text content from this PDF. Include every number, date, amount, reference, line item, and note. Preserve table structure with | separators. Do not summarise.' },
            ],
          }],
        }),
      });
      if (!response.ok) { console.error('PDF extraction error:', response.status); return null; }
      var data = await response.json();
      var text = '';
      for (var i = 0; i < data.content.length; i++) {
        if (data.content[i].type === 'text') text += data.content[i].text;
      }
      return text || null;
    } catch (e) { console.error('PDF extraction failed:', e.message); return null; }
  }

  // .doc → word-extractor
  if (mt === 'application/msword' || (filename && filename.toLowerCase().endsWith('.doc') && !filename.toLowerCase().endsWith('.docx'))) {
    try {
      var WordExtractor = (await import('word-extractor')).default;
      var extractor = new WordExtractor();
      var doc = await extractor.extract(buffer);
      return doc.getBody() || null;
    } catch (e) { console.error('DOC extraction failed:', e.message); return null; }
  }

  // .docx → unzip and extract text from word/document.xml
  if (mt.indexOf('wordprocessingml') > -1 || (filename && filename.toLowerCase().endsWith('.docx'))) {
    try {
      var JSZip = (await import('jszip')).default;
      var zip = await JSZip.loadAsync(buffer);
      var docXml = await zip.file('word/document.xml').async('string');
      // Extract text from <w:t> tags, add newlines for paragraph breaks
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

  // Excel → raw printable string extraction
  if (mt.indexOf('spreadsheet') > -1 || mt.indexOf('excel') > -1 || mt === 'application/vnd.ms-excel') {
    try {
      var raw = buffer.toString('utf-8');
      return raw.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s{3,}/g, '\n').trim() || null;
    } catch (e) { return null; }
  }

  return null;
}

export default async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    var t0 = Date.now();
    var refetch = req.query && req.query.refetch === 'true';
    var labelFilter = (req.body && req.body.label) || (req.query && req.query.label) || null;
    var source = (req.query && req.query.source) || (req.body && req.body.source) || 'manual';
    var isCron = source === 'cron';

    // Cron runs every 10 min — 20m window keeps volume tiny.
    // Manual "Check replies" uses 3d. Refetch (lodge Refresh) uses 14d + bypass dedup.
    var searchWindow = refetch ? '14d' : isCron ? '20m' : '3d';
    var query = labelFilter
      ? 'label:' + labelFilter.replace(/[/\s]/g, '-').toLowerCase() + ' -from:bookings@ridedownsouth.com'
      : 'newer_than:' + searchWindow + ' -from:bookings@ridedownsouth.com';

    // Run Gmail token fetch, Zoho bookings, and Zoho lodges in parallel to
    // minimise setup time — previously these were sequential and consumed
    // 20-30s before the first message was processed.
    var bookingFields = 'Name,Lodge_Name,RDS_Reference,Status,Check_in_Date,Check_out_Date,Nights,Lodge,Tour,id,Deposit_Amount,Second_Payment_Amount,Third_Payment_Amount,Fourth_Payment_Amount,Deposit_Paid_Date,nd_Payment_Paid_Date,rd_Payment_Paid_Date,th_Payment_Paid_Date,Sgl_Twin_Dbl_Guides,Guide_Rooms,Meals';

    var [token, zohoInit] = await Promise.all([
      getGmailToken(),
      (async () => {
        var allBk = [];
        var pg = 1, hasMore = true;
        while (hasMore && pg <= 5) {
          var r = await zohoApi('GET', 'Lodge_Bookings?fields=' + bookingFields + '&per_page=200&page=' + pg);
          var d = (r && r.data) || [];
          allBk = allBk.concat(d);
          hasMore = r && r.info && r.info.more_records;
          pg++;
        }
        var lodgeRes = await zohoApi('GET', 'Lodges?fields=Name,Email,Preferred_Email,Email_Reservations_2,Secondary_Email,Email_4,Email_Accounts&per_page=200');
        var lodges = (lodgeRes && lodgeRes.data) || [];
        return { allBookings: allBk, allLodges: lodges };
      })(),
    ]);

    var allBookings = zohoInit.allBookings;
    var allLodges = zohoInit.allLodges;
    console.log('Setup: token + Zoho fetched in', Date.now() - t0, 'ms —', allBookings.length, 'bookings,', allLodges.length, 'lodges');

    // Build lookup maps
    var maps = buildMatchMaps(allBookings);
    var refMap = maps.refMap;
    var nameMap = maps.nameMap;
    var emailMap = buildEmailMap(allLodges);
    console.log('Built emailMap with', Object.keys(emailMap).length, 'email addresses (' + allLodges.length + ' lodges)');

    // Now fetch Gmail message list
    var messages = [];
    var pageToken = null;
    var pageLimit = 10;
    for (var pg = 0; pg < pageLimit; pg++) {
      if (Date.now() - t0 > 40000) break;
      var pageUrl = 'messages?q=' + encodeURIComponent(query) + '&maxResults=100';
      if (pageToken) pageUrl += '&pageToken=' + pageToken;
      var listResult = await gmailApi(token, pageUrl);
      var pageMsgs = listResult.messages || [];
      messages = messages.concat(pageMsgs);
      pageToken = listResult.nextPageToken || null;
      if (!pageToken || pageMsgs.length === 0) break;
    }
    console.log('Gmail list: found', messages.length, 'messages in', Date.now() - t0, 'ms');

    if (messages.length === 0) {
      return res.status(200).json({ success: true, checked: 0, stored: 0, message: 'No new messages' });
    }

    // Booking-by-id map, for Tier 0 (Message-ID header → booking)
    var bookingsById = {};
    for (var bid = 0; bid < allBookings.length; bid++) {
      bookingsById[allBookings[bid].id] = allBookings[bid];
    }

    var stored = 0;
    var skipped = 0;
    var noMatch = 0;
    var tier0Hits = 0;
    var errors = [];
    var details = [];

    // Process each message
    for (var i = 0; i < messages.length; i++) {
      // Per-message deadline guard — stop gracefully before Vercel kills the function.
      // 50s gives headroom for the current message to finish and the response to be sent.
      if (Date.now() - t0 > 50000) {
        console.log('poll-gmail: deadline reached after', i, 'messages — stopping gracefully');
        break;
      }

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
        var rfcMessageId = getHeader(headers, 'Message-ID') || getHeader(headers, 'Message-Id') || null;

        // Skip if from us
        if (from.indexOf('bookings@ridedownsouth.com') > -1 || from.indexOf('ridedownsouth.com') > -1) {
          skipped++;
          continue;
        }

        // Try to match to a booking
        var body = extractBody(msg.payload);

        // ─── Tier 0: RFC Message-ID header → sent-index ───
        // If this inbound is a reply to an email we sent from the portal,
        // its In-Reply-To (and/or References) header contains the Message-ID
        // we generated. Look it up in emails/sent-index/ — if hit, we know
        // exactly which booking(s) this belongs to with 100% certainty.
        //
        // No ambiguity, no lodge-name parsing, no date guessing. This is the
        // reliable path for correspondence that originated in the portal.
        var match = null;
        var inReplyToHdr = getHeader(headers, 'In-Reply-To');
        var referencesHdr = getHeader(headers, 'References');
        var candidateIds = [];
        if (inReplyToHdr) candidateIds.push(normalizeMessageId(inReplyToHdr));
        if (referencesHdr) {
          // References is a whitespace-separated list of Message-IDs
          var refs = referencesHdr.split(/\s+/);
          for (var rf = 0; rf < refs.length; rf++) {
            var nn = normalizeMessageId(refs[rf]);
            if (nn) candidateIds.push(nn);
          }
        }
        for (var ci = 0; ci < candidateIds.length && !match; ci++) {
          try {
            var idx = await lookupSentIndex(candidateIds[ci]);
            if (idx && idx.booking_ids && idx.booking_ids.length > 0) {
              var bk0 = bookingsById[idx.booking_ids[0]];
              if (bk0) {
                match = { booking: bk0, method: 'message_id_header', all_booking_ids: idx.booking_ids };
                tier0Hits++;
                break;
              } else {
                // Sent-index found but booking not in allBookings snapshot —
                // create a minimal stub so routing still works
                console.log('Tier 0: sent-index hit for booking', idx.booking_ids[0], 'but not in allBookings — using stub');
                match = { booking: { id: idx.booking_ids[0] }, method: 'message_id_header_stub', all_booking_ids: idx.booking_ids };
                tier0Hits++;
                break;
              }
            } else if (idx === null) {
              console.log('Tier 0: no sent-index entry for candidate', candidateIds[ci].substring(0, 40));
            }
          } catch (e) {
            console.log('Tier 0: lookup error for', candidateIds[ci].substring(0, 40), e.message);
          }
        }

        // ─── Tier 0.5: Gmail thread ID → sent-index ───
        // Catches replies where the lodge didn't use Reply (no In-Reply-To header)
        // but Gmail still threaded the reply correctly by subject/conversation.
        if (!match && threadId) {
          try {
            var threadIdx = await lookupSentIndexByThreadId(threadId);
            if (threadIdx && threadIdx.booking_ids && threadIdx.booking_ids.length > 0) {
              var bkT = bookingsById[threadIdx.booking_ids[0]];
              if (bkT) {
                match = { booking: bkT, method: 'gmail_thread_id', all_booking_ids: threadIdx.booking_ids };
                tier0Hits++;
              }
            }
          } catch(e) { /* non-fatal */ }
        }

        // Fall back to the existing matcher (subject RDS ref, label, date...)
        if (!match) {
          match = matchEmailToBooking(subject, body, from, refMap, nameMap, emailMap);
        }

        // Zoho fallback — when the in-memory matcher returns ambiguous
        // because of a lodge-name match with conflicting dates, the
        // most likely cause is that the right booking exists in Zoho
        // but wasn't in our paginated allBookings snapshot (or had a
        // slightly different Lodge_Name).
        //
        // Hit Zoho directly: search Lodge_Bookings at this lodge name
        // and filter by date proximity. If exactly one booking falls
        // within 60 days of an email-extracted date, route to it.
        // Zoho RDS-ref fallback — subject contains an RDS ref that wasn't in our
        // in-memory refMap (e.g. booking created after the snapshot was taken, or
        // ref not yet written to the booking). Look it up directly in Zoho.
        if (!match.booking) {
          var subjectRdsRef = extractRdsRef(subject);
          if (!subjectRdsRef) {
            // Also check body for ref
            var bodyRefMatches = (body || '').match(/RDS-[A-Za-z0-9\-\/]+/g) || [];
            if (bodyRefMatches.length > 0) subjectRdsRef = bodyRefMatches[0];
          }
          if (subjectRdsRef) {
            try {
              var refQuery = encodeURIComponent('(RDS_Reference:equals:' + subjectRdsRef + ')');
              var refLookup = await zohoApi('GET',
                'Lodge_Bookings/search?criteria=' + refQuery +
                '&fields=id,Lodge_Name,Check_in_Date,Check_out_Date,RDS_Reference,Tour,Status' +
                '&per_page=5'
              );
              var refFound = (refLookup && refLookup.data) || [];
              if (refFound.length === 1) {
                console.log('Zoho RDS-ref fallback resolved', subjectRdsRef, '→', refFound[0].id);
                match = { booking: refFound[0], method: 'zoho_rds_ref_lookup' };
              }
            } catch (refErr) {
              console.error('Zoho RDS-ref fallback failed:', refErr.message);
            }
          }
        }

        var ambiguousReasons = ['lodge_name_ambiguous_no_date_match', 'sender_email_unique_but_dates_conflict', 'sender_email_matched_lodge_but_ambiguous_date'];
        if (!match.booking && match.lodge && ambiguousReasons.indexOf(match.reason) !== -1) {
          try {
            var emailDatesForLookup = extractIsoDates(subject + '\n' + (body || '').substring(0, 8000));
            if (emailDatesForLookup && emailDatesForLookup.size > 0) {
              // Search Zoho for bookings at this lodge name. The matcher
              // already normalised the name (lowercased, split on " - ").
              // Use Zoho's "starts_with" criteria to be tolerant of
              // suffix variations like "Bahnhof Hotel - Aus" vs "Bahnhof Hotel".
              var lodgeQuery = encodeURIComponent('(Lodge_Name:starts_with:' + match.lodge + ')');
              var lookupRes = await zohoApi('GET',
                'Lodge_Bookings/search?criteria=' + lodgeQuery +
                '&fields=id,Lodge_Name,Check_in_Date,Check_out_Date,RDS_Reference,Status' +
                '&per_page=50'
              );
              var found = (lookupRes && lookupRes.data) || [];
              console.log('Zoho fallback for', match.lodge, '— found', found.length, 'bookings');

              if (found.length > 0) {
                // Score each by date proximity to extracted email dates.
                var bestZ = null;
                var bestZScore = 0;
                for (var fi = 0; fi < found.length; fi++) {
                  var fb = found[fi];
                  var fScore = dateMatchScore(emailDatesForLookup, fb.Check_in_Date, fb.Check_out_Date);
                  if (fScore > bestZScore) { bestZScore = fScore; bestZ = fb; }
                }
                if (bestZ && bestZScore > 0) {
                  console.log('Zoho fallback resolved to', bestZ.id, 'score', bestZScore);
                  match = { booking: bestZ, method: 'zoho_lookup_score_' + bestZScore };
                }
              }
            }
          } catch (lookupErr) {
            console.error('Zoho fallback lookup failed:', lookupErr.message);
            // Non-fatal — fall through to unmatched
          }
        }

        var matchedBooking = match.booking;
        var matchMethod = match.method;

        if (!matchedBooking) {
          // Before giving up to unmatched, try the Perfectstay router.
          // Perfectstay is a property-management service that sends
          // automated check-in templates from bookings@perfectstay.org.
          // The lodge name and check-in date are inside the body text;
          // we parse them and look up the matching Zoho Lodge_Booking.
          if (isPerfectstayEmail(from)) {
            try {
              var psResult = await routePerfectstayEmail(from, body, allLodges);
              if (psResult && psResult.booking) {
                matchedBooking = psResult.booking;
                matchMethod = psResult.method; // 'perfectstay_router'
                console.log('perfectstay_router matched:', psResult.lodge, psResult.date, '→', psResult.booking.id);
              } else {
                console.log('perfectstay_router skipped:', psResult.reason);
              }
            } catch (psErr) {
              console.error('perfectstay_router failed:', psErr.message);
            }
          }
        }

        if (!matchedBooking) {
          // Dedup: skip if already in unmatched (avoids re-processing every cron run)
          if (!refetch) {
            var safeUnmatchedId = msgId.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
            try {
              var unmatchedCheck = await list({ prefix: 'emails/unmatched/' + safeUnmatchedId });
              if (unmatchedCheck.blobs && unmatchedCheck.blobs.length > 0) {
                skipped++;
                continue;
              }
            } catch(e) { /* non-fatal */ }
          }
          // Store in unmatched bucket so Helen/Andrew can route it manually.
          // storeEmail() routes to emails/unmatched/ automatically when no
          // booking_id or lodge_id is provided.
          try {
            await storeEmail({
              gmail_message_id: msgId,
              message_id: msgId,
              rfc_message_id: rfcMessageId,
              type: 'lodge_inbound',
              direction: 'inbound',
              email_from: from,
              email_to: to,
              email_subject: subject,
              email_content: body,
              email_date: date,
              attachments: extractAttachments(msg.payload),
              ai_flags: [{ unmatched_reason: match.reason || 'no_match', ambiguous_lodge: match.lodge || null }],
            });
          } catch (e) {
            console.error('Failed to store unmatched email:', msgId, e.message);
          }
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

        // Skip attachment downloads in cron runs — a single large PDF can consume
        // the entire 60s budget. Store metadata only; cron-reparse handles extraction.
        var attachmentTexts = [];
        var attachmentsWithText = attachments.map(function(att) {
          return {
            filename: att.filename,
            mimeType: att.mimeType,
            size: att.size,
            attachmentId: att.attachmentId,
            extractedText: null,
          };
        });

        // Build full content: email body + attachment texts
        var fullContent = body || '';
        if (attachmentTexts.length > 0) {
          fullContent += '\n\n' + attachmentTexts.join('\n\n');
        }

        // Store to blob (with attachment extracted text)
        var stored = await storeEmail({
          booking_id: bookingId,
          message_id: msgId,
          type: 'lodge_reply',
          direction: 'inbound',
          email_from: from,
          email_to: to,
          email_subject: subject,
          email_content: body || '(no content)',
          email_date: date ? new Date(date).toISOString() : new Date().toISOString(),
          gmail_thread_id: threadId,
          gmail_message_id: msgId,
          rfc_message_id: rfcMessageId,
          attachments: attachmentsWithText,
          match_method: matchMethod,
        });

        // Tag any 'waiting' activity-log entries on this booking with
        // reply_received_at — the Inbox prompts Helen to mark them done.
        try {
          await tagReplyReceived(bookingId, stored && stored.id);
        } catch (tagErr) {
          console.error('tagReplyReceived failed for', bookingId, tagErr.message);
        }

        // Multi-booking fan-out: when Tier 0 matched a sent-index entry that
        // covered multiple bookings (one portal send → several bookings at the
        // same lodge on consecutive nights), store the reply under each one
        // so Helen sees the thread on every relevant booking.
        if (match.all_booking_ids && match.all_booking_ids.length > 1) {
          for (var abi = 0; abi < match.all_booking_ids.length; abi++) {
            var otherId = match.all_booking_ids[abi];
            if (otherId === bookingId) continue;
            // Dedup guard — skip if we already stored this message under this booking
            if (!refetch) {
              var otherStored = await isEmailStored(otherId, msgId);
              if (otherStored) continue;
            }
            try {
              await storeEmail({
                booking_id: otherId,
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
                rfc_message_id: rfcMessageId,
                attachments: attachmentsWithText,
                match_method: matchMethod,
                ai_flags: [{ fanned_out_from: bookingId, via: 'message_id_header' }],
              });
            } catch (fanErr) {
              console.error('Fan-out store failed for booking', otherId, fanErr.message);
            }
          }
        }

        // Thread backfill — pull earlier messages in this Gmail thread that
        // aren't yet stored. Catches emails Helen sent directly from Gmail
        // (not via the portal) so outbound context isn't missing.
        if (threadId) {
          try {
            var threadData = await gmailApi(token, 'threads/' + threadId + '?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Message-ID');
            var threadMessages = (threadData && threadData.messages) || [];
            for (var ti = 0; ti < threadMessages.length; ti++) {
              var tm = threadMessages[ti];
              if (!tm.id || tm.id === msgId) continue; // skip current message
              var alreadyStored = await isEmailStored(bookingId, tm.id);
              if (alreadyStored) continue;
              // Fetch full message to get body
              try {
                var tmFull = await gmailApi(token, 'messages/' + tm.id + '?format=full');
                if (!tmFull || !tmFull.payload) continue;
                var tmHeaders = tmFull.payload.headers || [];
                function getTmHeader(name) {
                  var h = tmHeaders.find(function(hh) { return hh.name.toLowerCase() === name.toLowerCase(); });
                  return h ? h.value : '';
                }
                var tmFrom = getTmHeader('From');
                var tmTo = getTmHeader('To');
                var tmSubject = getTmHeader('Subject');
                var tmDate = getTmHeader('Date');
                var tmRfc = getTmHeader('Message-ID');
                // Extract body
                var tmText = '', tmHtml = '';
                function walkTm(part) {
                  if (!part) return;
                  if (part.mimeType === 'text/plain' && part.body && part.body.data && !tmText) {
                    var p = part.body.data.replace(/-/g, '+').replace(/_/g, '/');
                    tmText = Buffer.from(p, 'base64').toString('utf-8');
                  }
                  if (part.mimeType === 'text/html' && part.body && part.body.data && !tmHtml) {
                    var p2 = part.body.data.replace(/-/g, '+').replace(/_/g, '/');
                    tmHtml = Buffer.from(p2, 'base64').toString('utf-8');
                  }
                  if (part.parts) part.parts.forEach(walkTm);
                }
                walkTm(tmFull.payload);
                var tmBody = tmText || tmHtml || '';
                if (!tmBody.trim()) continue; // skip empty messages
                var tmIsFromUs = tmFrom.indexOf('ridedownsouth.com') > -1;
                // Only backfill outbound messages (Helen's direct-Gmail sends).
                // Inbound replies must go through the main processing path for
                // proper attachment extraction and AI parsing. Storing them here
                // without attachments would block the main path via isEmailStored.
                if (!tmIsFromUs) continue;
                await storeEmail({
                  booking_id: bookingId,
                  message_id: tm.id,
                  type: 'enquiry',
                  direction: 'outbound',
                  email_from: tmFrom,
                  email_to: tmTo,
                  email_subject: tmSubject,
                  email_content: tmBody,
                  email_date: tmDate ? new Date(tmDate).toISOString() : new Date().toISOString(),
                  gmail_thread_id: threadId,
                  gmail_message_id: tm.id,
                  rfc_message_id: tmRfc,
                  match_method: 'thread_backfill',
                });
                console.log('Thread backfill: stored', tm.id, 'for booking', bookingId);
              } catch (tmFetchErr) {
                console.error('Thread backfill fetch failed for', tm.id, tmFetchErr.message);
              }
            }
          } catch (threadErr) {
            console.error('Thread backfill failed for thread', threadId, threadErr.message);
          }
        }

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
        // Also skip if we're past 30s — store the email and let reparse-email handle it later
        var aiResult = null;
        var zohoUpdates = {
          Last_Response_Date: new Date().toISOString().split('T')[0],
          New_Reply: true,
        };

        // Self-heal: if this booking matched via RDS ref camelCase parse but has
        // no RDS_Reference in Zoho, write it back now so future emails hit Tier 1.
        if ((match.method === 'rds_ref_camel_parse' || match.method === 'rds_ref_camel_parse_unique')
            && !matchedBooking.RDS_Reference) {
          var subjectRefForBackfill = extractRdsRef(subject);
          if (subjectRefForBackfill) {
            zohoUpdates.RDS_Reference = subjectRefForBackfill;
            console.log('Backfilling RDS_Reference', subjectRefForBackfill, 'on booking', bookingId);
          }
        }

        var timeLeft = Date.now() - t0;
        var skipAiDueToTime = timeLeft > 30000;
        if (skipAiDueToTime) {
          console.log('Skipping AI parse for', matchedBooking.Name || bookingId, '— time limit approaching (' + timeLeft + 'ms)');
        }

        // Use fullContent (body + attachment text) for AI parsing — much richer data source
        var contentForParsing = fullContent || '';
        if (!isAutoReply && !skipAiDueToTime && contentForParsing && contentForParsing.trim().length > 10) {
          try {
            var tourName = '';
            if (matchedBooking.Tour) {
              tourName = typeof matchedBooking.Tour === 'object' ? matchedBooking.Tour.name : matchedBooking.Tour;
            }
            var roomConfig = matchedBooking.Sgl_Twin_Dbl_Guides || '';
            var bookingContext = {
              lodge_name: matchedBooking.Lodge_Name || matchedBooking.Name || '',
              tour_name: tourName,
              check_in: matchedBooking.Check_in_Date || '',
              check_out: matchedBooking.Check_out_Date || '',
              nights: matchedBooking.Nights || '',
              rooms_requested: roomConfig,
              guide_rooms: matchedBooking.Guide_Rooms || '',
              meals_requested: matchedBooking.Meals || '',
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

            var existingAmounts = {
              Status: matchedBooking.Status,
              Total_Amount: matchedBooking.Total_Amount,
              Deposit_Amount: matchedBooking.Deposit_Amount,
              Second_Payment_Amount: matchedBooking.Second_Payment_Amount,
              Third_Payment_Amount: matchedBooking.Third_Payment_Amount,
              Fourth_Payment_Amount: matchedBooking.Fourth_Payment_Amount,
              Deposit_Due_Date: matchedBooking.Deposit_Due_Date,
              Second_Payment_Due_Date: matchedBooking.Second_Payment_Due_Date,
              Third_Payment_Due_Date: matchedBooking.Third_Payment_Due_Date,
              Fourth_Payment_Due_Date: matchedBooking.Fourth_Payment_Due_Date,
            };
            var fieldResult = extractionToZohoFields(aiResult, existingAmounts);
            // Merge AI-extracted fields into Zoho updates
            var fieldKeys = Object.keys(fieldResult.updates);
            for (var fk = 0; fk < fieldKeys.length; fk++) {
              zohoUpdates[fieldKeys[fk]] = fieldResult.updates[fieldKeys[fk]];
            }

            // Mark as parsed so cron-reparse skips it
            try {
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
                rfc_message_id: rfcMessageId,
                attachments: attachmentsWithText,
                match_method: matchMethod,
                parsed_at: new Date().toISOString(),
                ai_parsed_flags: fieldResult.has_flags ? fieldResult.flagged : null,
              });
            } catch (parsedStoreErr) {
              console.error('Failed to store parsed_at on blob:', parsedStoreErr.message);
            }
            if (fieldResult.discrepancies && fieldResult.discrepancies.length > 0) {
              console.log('⚠ DISCREPANCIES detected for', matchedBooking.Name || bookingId, ':', JSON.stringify(fieldResult.discrepancies));
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
          var rawLodge = matchedBooking.Lodge_Name;
          var lodgeNameForLabel = (
            (rawLodge && typeof rawLodge === 'object' ? rawLodge.name : rawLodge) ||
            matchedBooking.Name || ''
          ).split(' - ')[0].trim();
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
          discrepancies: (!isAutoReply && aiResult && aiResult.discrepancies && aiResult.discrepancies.length > 0) ? aiResult.discrepancies : null,
          fields_updated: isAutoReply ? 0 : Object.keys(zohoUpdates).length - 1,
        });

      } catch (msgErr) {
        console.error('Error processing message', msgId, msgErr.message);
        errors.push({ message_id: msgId, error: msgErr.message });
      }

      // Rate limit: small delay between Gmail API calls
      await new Promise(function(r) { setTimeout(r, 200); });
    }

    console.log('poll-gmail: checked', messages.length, 'stored', stored, 'skipped', skipped, 'no-match', noMatch, 'tier0-hits', tier0Hits);

    var elapsed = Date.now() - t0;
    var timedOut = elapsed >= 40000;

    // Write poll log to blob for portal visibility
    try {
      var { put: blobPut } = await import('@vercel/blob');
      var logEntry = {
        run_at: new Date().toISOString(),
        elapsed_ms: elapsed,
        timed_out: timedOut,
        checked: messages.length,
        stored: stored,
        skipped: skipped,
        no_match: noMatch,
        errors: errors.slice(0, 10),
      };
      await blobPut('poll-log/latest.json', JSON.stringify(logEntry),
        { access: 'public', contentType: 'application/json', addRandomSuffix: false });
    } catch (logErr) {
      console.error('Failed to write poll log:', logErr.message);
    }

    res.status(200).json({
      success: true,
      checked: messages.length,
      stored: stored,
      skipped: skipped,
      no_match: noMatch,
      timed_out: timedOut,
      elapsed_ms: elapsed,
      tier0_message_id_hits: tier0Hits,
      errors: errors.length > 0 ? errors : undefined,
      details: details.length > 0 ? details : undefined,
    });

  } catch (err) {
    console.error('poll-gmail error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
