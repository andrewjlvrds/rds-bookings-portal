// One-shot refetch/rebuild of inbound lodge emails.
//
// WHY: Historical emails were routed to the wrong Lodge_Booking record by
// the old year-only matching logic in poll-gmail. The matching has been
// fixed (see _email-match.js), but existing blobs are still keyed under
// their original (wrong) booking IDs. This endpoint rebuilds the index
// with the corrected logic.
//
// MODES:
//   ?dry=true  — returns what it WOULD do without writing or deleting
//   ?dry=false — live: deletes existing inbound blobs, re-fetches from
//                Gmail with new matching, writes correctly routed blobs
//
// SCOPE: Only inbound emails from the bookings@ridedownsouth.com mailbox,
//        scoped to RDS tour labels (matched by label name prefix/substring).
//        Outbound emails (direction: 'outbound') are untouched because
//        they're stored at send-time by send-enquiry.js with the correct
//        booking ID — there's nothing to re-route.
//
// AUTH: POST only, requires ?key=<ADMIN_REINDEX_KEY> env var or inline
//       param to avoid accidental public invocation.

import { list, put, del } from '@vercel/blob';
import { getGmailToken, gmailApi } from './_gmail.js';
import { zohoApi } from './_zoho.js';
import { buildMatchMaps, matchEmailToBooking } from './_email-match.js';

// Label name patterns that identify RDS tour correspondence
function isRdsTourLabel(labelName) {
  if (!labelName) return false;
  var n = labelName.toLowerCase();
  // Tour-prefix labels
  if (/^(fosa|bon|edge|eoa|gl|great lakes|wh-ct)\b/.test(n)) return true;
  // Legacy INBOX/YYYY-MM nested labels
  if (n.indexOf('inbox/20') === 0) return true;
  return false;
}

// Decode Gmail base64url → UTF-8
function decodeBase64Url(str) {
  if (!str) return '';
  var padded = str.replace(/-/g, '+').replace(/_/g, '/');
  try { return Buffer.from(padded, 'base64').toString('utf-8'); }
  catch (e) { return ''; }
}

function extractBody(payload) {
  if (!payload) return '';
  var textPlain = '';
  var textHtml = '';
  function walk(part) {
    if (!part) return;
    if (part.mimeType === 'text/plain' && part.body && part.body.data && !textPlain) {
      textPlain = decodeBase64Url(part.body.data);
    }
    if (part.mimeType === 'text/html' && part.body && part.body.data && !textHtml) {
      textHtml = decodeBase64Url(part.body.data);
    }
    if (part.parts) for (var i = 0; i < part.parts.length; i++) walk(part.parts[i]);
  }
  if (payload.mimeType === 'text/plain' && payload.body && payload.body.data) {
    return decodeBase64Url(payload.body.data);
  }
  walk(payload);
  if (textPlain) return textPlain;
  if (textHtml) return textHtml.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return '';
}

function getHeader(headers, name) {
  if (!headers) return '';
  var n = name.toLowerCase();
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].name && headers[i].name.toLowerCase() === n) return headers[i].value || '';
  }
  return '';
}

function extractAttachments(payload) {
  var atts = [];
  function walk(part) {
    if (!part) return;
    if (part.filename && part.body && part.body.attachmentId) {
      atts.push({
        filename: part.filename,
        mimeType: part.mimeType,
        size: part.body.size || 0,
        attachmentId: part.body.attachmentId,
      });
    }
    if (part.parts) for (var i = 0; i < part.parts.length; i++) walk(part.parts[i]);
  }
  walk(payload);
  return atts;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var dry = (req.query.dry !== 'false'); // default: dry-run true for safety
  var maxMessages = parseInt(req.query.max || '2000', 10);

  try {
    // ───────────────────────── Step 1: Inventory existing blobs ─────────────────────────
    var allBlobs = [];
    var cursor = undefined;
    var pagesScanned = 0;
    while (pagesScanned < 30) {
      var pageResult = await list({ prefix: 'emails/', limit: 1000, cursor: cursor });
      allBlobs = allBlobs.concat(pageResult.blobs || []);
      if (!pageResult.hasMore || !pageResult.cursor) break;
      cursor = pageResult.cursor;
      pagesScanned++;
    }

    // Bucket by inbound/outbound (fetch each to check direction)
    var inboundBlobs = [];
    var outboundBlobs = [];
    var unmatchedBlobs = [];
    var undetermined = [];

    for (var i = 0; i < allBlobs.length; i++) {
      var b = allBlobs[i];
      // Fast path: outbound can be in any booking prefix; only way to know
      // is the `direction` field inside the blob. Fetch and check.
      try {
        var r = await fetch(b.url);
        var em = await r.json();
        if (b.pathname.indexOf('emails/unmatched/') === 0) {
          unmatchedBlobs.push({ blob: b, email: em });
        } else if (em.direction === 'outbound') {
          outboundBlobs.push({ blob: b, email: em });
        } else {
          inboundBlobs.push({ blob: b, email: em });
        }
      } catch (e) {
        undetermined.push({ pathname: b.pathname, error: e.message });
      }
    }

    // ───────────────────────── Step 2: Fetch bookings + build maps ─────────────────────────
    var bookingFields = 'Name,Lodge_Name,RDS_Reference,Status,Check_in_Date,Check_out_Date,Nights,Lodge,Tour,id';
    var allBookings = [];
    var bkPage = 1;
    var bkHasMore = true;
    while (bkHasMore && bkPage <= 5) {
      var bkResult = await zohoApi('GET',
        'Lodge_Bookings?fields=' + bookingFields + '&per_page=200&page=' + bkPage
      );
      allBookings = allBookings.concat((bkResult && bkResult.data) || []);
      bkHasMore = bkResult && bkResult.info && bkResult.info.more_records;
      bkPage++;
    }
    var maps = buildMatchMaps(allBookings);

    // ───────────────────────── Step 3: Fetch Gmail messages under RDS tour labels ─────────────────────────
    var token = await getGmailToken();

    // List all Gmail labels and filter to RDS tour labels
    var labelsRes = await gmailApi(token, 'labels');
    var allLabels = labelsRes.labels || [];
    var tourLabels = allLabels.filter(function(l) { return isRdsTourLabel(l.name); });

    // For each tour label, list message IDs. Exclude outbound (from us).
    var seenMsgIds = {};
    var messageIds = [];
    for (var li = 0; li < tourLabels.length; li++) {
      var lbl = tourLabels[li];
      var nextToken = null;
      do {
        var qs = 'messages?labelIds=' + encodeURIComponent(lbl.id) +
          '&q=' + encodeURIComponent('-from:bookings@ridedownsouth.com') +
          '&maxResults=500' +
          (nextToken ? '&pageToken=' + nextToken : '');
        var listMsgRes = await gmailApi(token, qs);
        var msgs = listMsgRes.messages || [];
        for (var mi = 0; mi < msgs.length; mi++) {
          if (!seenMsgIds[msgs[mi].id]) {
            seenMsgIds[msgs[mi].id] = true;
            messageIds.push(msgs[mi].id);
            if (messageIds.length >= maxMessages) break;
          }
        }
        nextToken = listMsgRes.nextPageToken || null;
        if (messageIds.length >= maxMessages) break;
      } while (nextToken);
      if (messageIds.length >= maxMessages) break;
    }

    // ───────────────────────── Step 4: Fetch + match each message ─────────────────────────
    var routing = []; // what WOULD happen / what DID happen per message
    var methodCounts = {};
    for (var mx = 0; mx < messageIds.length; mx++) {
      var mid = messageIds[mx];
      try {
        var msg = await gmailApi(token, 'messages/' + mid + '?format=full');
        var headers = msg.payload ? msg.payload.headers : [];
        var subj = getHeader(headers, 'Subject');
        var from = getHeader(headers, 'From');
        var to = getHeader(headers, 'To');
        var date = getHeader(headers, 'Date');
        var body = extractBody(msg.payload);

        // Safety: double-check this isn't from us
        if (from.indexOf('bookings@ridedownsouth.com') > -1 || from.indexOf('@ridedownsouth.com') > -1) {
          continue;
        }

        var m = matchEmailToBooking(subj, body, from, maps.refMap, maps.nameMap);
        var method = m.method || 'unmatched';
        methodCounts[method] = (methodCounts[method] || 0) + 1;

        routing.push({
          gmail_id: mid,
          from: from,
          subject: subj,
          date: date,
          match_method: method,
          reason: m.reason || null,
          target_booking_id: m.booking ? m.booking.id : null,
          target_lodge: m.booking ? (typeof m.booking.Lodge_Name === 'object' ? m.booking.Lodge_Name.name : m.booking.Lodge_Name) : null,
          target_check_in: m.booking ? m.booking.Check_in_Date : null,
          // keep body on the side for the live pass
          _msg: dry ? null : {
            subject: subj, from: from, to: to, date: date, body: body,
            attachments: extractAttachments(msg.payload),
          },
        });
      } catch (e) {
        routing.push({ gmail_id: mid, error: e.message });
      }
    }

    // ───────────────────────── Step 5: LIVE pass — delete + rewrite ─────────────────────────
    var deletedInbound = 0;
    var deletedUnmatched = 0;
    var deleteErrors = [];
    var wrote = 0;
    var writeErrors = [];

    if (!dry) {
      // Delete existing inbound blobs
      for (var di = 0; di < inboundBlobs.length; di++) {
        try { await del(inboundBlobs[di].blob.url); deletedInbound++; }
        catch (e) { deleteErrors.push({ path: inboundBlobs[di].blob.pathname, error: e.message }); }
      }
      // Delete existing unmatched blobs (they'll be re-created if still unmatched)
      for (var du = 0; du < unmatchedBlobs.length; du++) {
        try { await del(unmatchedBlobs[du].blob.url); deletedUnmatched++; }
        catch (e) { deleteErrors.push({ path: unmatchedBlobs[du].blob.pathname, error: e.message }); }
      }

      // Write each routed message to the correct location
      for (var wi = 0; wi < routing.length; wi++) {
        var rt = routing[wi];
        if (!rt._msg) continue; // error case
        var safeId = rt.gmail_id.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
        var record = {
          id: safeId,
          message_id: rt.gmail_id,
          gmail_message_id: rt.gmail_id,
          type: 'lodge_inbound',
          direction: 'inbound',
          lodge_id: null,
          booking_id: rt.target_booking_id || null,
          from: rt._msg.from,
          to: rt._msg.to,
          subject: rt._msg.subject,
          body: rt._msg.body,
          date: rt._msg.date,
          attachments: rt._msg.attachments || [],
          ai_summary: null,
          ai_extractions: null,
          ai_flags: rt.target_booking_id ? [] : [{ unmatched_reason: rt.reason || 'no_match' }],
          processed_at: new Date().toISOString(),
          _reindexed: true,
        };
        var path = rt.target_booking_id
          ? ('emails/booking/' + rt.target_booking_id + '/' + safeId + '.json')
          : ('emails/unmatched/' + safeId + '.json');
        try {
          await put(path, JSON.stringify(record), {
            access: 'public', contentType: 'application/json', addRandomSuffix: false,
          });
          wrote++;
        } catch (e) {
          writeErrors.push({ gmail_id: rt.gmail_id, error: e.message });
        }
      }
    }

    // ───────────────────────── Response ─────────────────────────
    res.status(200).json({
      mode: dry ? 'dry-run' : 'live',
      inventory: {
        total_blobs: allBlobs.length,
        inbound_existing: inboundBlobs.length,
        outbound_preserved: outboundBlobs.length,
        unmatched_existing: unmatchedBlobs.length,
        undetermined: undetermined.length,
      },
      gmail: {
        tour_labels_found: tourLabels.map(function(l) { return l.name; }),
        messages_scanned: messageIds.length,
      },
      matching: {
        method_counts: methodCounts,
        would_route_to_booking: routing.filter(function(r) { return !!r.target_booking_id; }).length,
        would_route_unmatched: routing.filter(function(r) { return !r.target_booking_id && !r.error; }).length,
        errors: routing.filter(function(r) { return !!r.error; }).length,
      },
      live_actions: dry ? null : {
        deleted_inbound: deletedInbound,
        deleted_unmatched: deletedUnmatched,
        wrote: wrote,
        delete_errors: deleteErrors,
        write_errors: writeErrors,
      },
      // Per-message routing preview. Truncated to first 50 in dry-run for
      // response size; live mode returns all with errors only.
      routing_sample: dry
        ? routing.slice(0, 50).map(function(r) {
            var copy = {};
            Object.keys(r).forEach(function(k) { if (k !== '_msg') copy[k] = r[k]; });
            return copy;
          })
        : routing.filter(function(r) { return !!r.error; }).map(function(r) {
            var copy = {};
            Object.keys(r).forEach(function(k) { if (k !== '_msg') copy[k] = r[k]; });
            return copy;
          }),
    });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
}
