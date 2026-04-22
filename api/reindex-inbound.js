// Reindex inbound lodge emails — label-based routing.
//
// Every lodge email lives under a Gmail label like:
//   FoSA Mar 27/Papkuilsfontein
//   INBOX/2026-04 (24 Apr - 13 May)/Desert Sands
//
// The label path IS the ground truth for tour + lodge. We don't need to
// parse subject lines or extract dates — just:
//
//   label prefix → Zoho tour name (explicit mapping below)
//   label lodge segment → Zoho Lodge_Name (case-insensitive substring match)
//
// For each message under a lodge label, find the matching Lodge_Booking
// record in Zoho and store the email under emails/booking/{bookingId}/.
//
// MODES:
//   ?dry=true    — preview only, no writes or deletes (default)
//   ?dry=false   — live: deletes existing inbound blobs, re-fetches from
//                   Gmail, writes correctly routed blobs
//
// PRESERVES: Outbound blobs (direction: 'outbound'). Sent emails are stored
// at send-time by send-enquiry.js with the right booking ID — no need to
// re-route them.

import { list, put, del } from '@vercel/blob';
import { getGmailToken, gmailApi } from './_gmail.js';
import { zohoApi } from './_zoho.js';
import { extractIsoDates } from './_email-match.js';

// ────────────────────────────── Label → Tour mapping ──────────────────────────────
// Gmail label prefix (everything before the final /LodgeName segment) → Zoho
// Tour.name value (or array for labels that apply to multiple tours like
// Great Lakes, which runs as both a 24-day and 14-day variant).
var TOUR_MAPPING = {
  'FoSA Mar 27': ['FoSA Mar 27'],
  'INBOX/2026-03 (30 Mar - 18 Apr)': ['FoSA Mar 26'],
  'INBOX/2026-04 (24 Apr - 13 May)': ['FoSA Apr 26'],
  'INBOX/2026-05 (25 May - 6 June)': ['BoN May 26'],
  'INBOX/2026-07 Great Lakes': ['GL Jul 26'],
  'INBOX/2026-09 Sept (9-28) Group B': ['FoSA 9 Sep 26'],
  'INBOX/2026-09 Sept (11-30) Group A': ['FoSA 11 Sep 26'],
  'INBOX/2026-10 October': ['FoSA Oct 26'],
};

// Labels to always exclude (guest emails, finance, archive, etc)
var EXCLUDED_SEGMENTS = ['Guests', 'Payment Confirmations', 'Zoho'];
var EXCLUDED_PREFIXES = [
  'INBOX/Finances',
  'INBOX/Programmes',
  'INBOX/General',
  'INBOX/Lodges and Companies General info',
  'INBOX/Previous 2025 Emails',
  'INBOX/Complete 2026 Tours',
  'INBOX/2026-06 June',
  'INBOX/2026-08 August',
  '2025 Archive',
  '[Gmail]/Trash',
  'Google Admin',
];

// Given a full label path, parse into { tourPrefix, lodgeSegment }
// Returns null if the label isn't a lodge correspondence label.
function parseLabelPath(labelName) {
  if (!labelName) return null;

  // Check excluded prefixes
  for (var i = 0; i < EXCLUDED_PREFIXES.length; i++) {
    if (labelName === EXCLUDED_PREFIXES[i] || labelName.indexOf(EXCLUDED_PREFIXES[i] + '/') === 0) {
      return null;
    }
  }

  // Find which mapping matches (longest prefix wins)
  var matched = null;
  var matchedLen = 0;
  Object.keys(TOUR_MAPPING).forEach(function(prefix) {
    if ((labelName === prefix || labelName.indexOf(prefix + '/') === 0) && prefix.length > matchedLen) {
      matched = prefix;
      matchedLen = prefix.length;
    }
  });
  if (!matched) return null;

  // Label must have a lodge segment AFTER the tour prefix (not just the prefix itself)
  if (labelName === matched) return null; // top-level label, no lodge segment
  var lodgeSegment = labelName.substring(matched.length + 1); // skip the /
  if (!lodgeSegment) return null; // defensive: empty lodge segment

  // Excluded lodge segments (Guests sub-labels live under tour labels)
  for (var j = 0; j < EXCLUDED_SEGMENTS.length; j++) {
    if (lodgeSegment === EXCLUDED_SEGMENTS[j]) return null;
  }

  return {
    tourPrefix: matched,
    tourNames: TOUR_MAPPING[matched],
    lodgeSegment: lodgeSegment,
  };
}

// Case-insensitive, whitespace-tolerant substring match. True if either
// string contains the other (after normalising).
function lodgeNameMatches(label, zoho) {
  if (!label || !zoho) return false;
  var a = String(label).toLowerCase().replace(/\s+/g, ' ').trim();
  var b = String(zoho).toLowerCase().replace(/\s+/g, ' ').trim();
  // Strip " - Day N" suffix that appears on some Zoho Lodge_Name values
  b = b.replace(/\s*-\s*day\s+\d+.*$/i, '').trim();
  if (!a || !b) return false;
  return a.indexOf(b) > -1 || b.indexOf(a) > -1;
}

// ────────────────────────────── Gmail helpers ──────────────────────────────

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

// ────────────────────────────── Handler ──────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var dry = (req.query.dry !== 'false'); // default: dry-run
  var maxMessages = parseInt(req.query.max || '5000', 10);

  try {
    // ────────── Step 1: Inventory existing blobs ──────────
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

    var inboundBlobs = [];
    var outboundBlobs = [];
    var unmatchedBlobs = [];
    for (var i = 0; i < allBlobs.length; i++) {
      var b = allBlobs[i];
      try {
        var rr = await fetch(b.url);
        var em = await rr.json();
        if (b.pathname.indexOf('emails/unmatched/') === 0) unmatchedBlobs.push({ blob: b });
        else if (em.direction === 'outbound') outboundBlobs.push({ blob: b });
        else inboundBlobs.push({ blob: b });
      } catch (e) {
        // couldn't read — treat as inbound for safety (will be deleted in live mode)
        inboundBlobs.push({ blob: b, readError: e.message });
      }
    }

    // ────────── Step 2: Fetch Zoho bookings ──────────
    var bookingFields = 'Name,Lodge_Name,RDS_Reference,Status,Check_in_Date,Check_out_Date,Tour,id';
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

    // Index bookings by tour name → array of bookings
    var bookingsByTour = {};
    allBookings.forEach(function(bk) {
      var tourName = '';
      if (bk.Tour && typeof bk.Tour === 'object') tourName = bk.Tour.name || '';
      else if (typeof bk.Tour === 'string') tourName = bk.Tour;
      if (!tourName) return;
      if (!bookingsByTour[tourName]) bookingsByTour[tourName] = [];
      bookingsByTour[tourName].push(bk);
    });

    // ────────── Step 3: Fetch Gmail labels & filter to mapped ones ──────────
    var token = await getGmailToken();
    var labelsRes = await gmailApi(token, 'labels');
    var allLabels = labelsRes.labels || [];

    var mappedLabels = [];
    allLabels.forEach(function(l) {
      var parsed = parseLabelPath(l.name);
      if (!parsed) return;
      mappedLabels.push({
        id: l.id,
        name: l.name,
        tourPrefix: parsed.tourPrefix,
        tourNames: parsed.tourNames,
        lodgeSegment: parsed.lodgeSegment,
      });
    });

    // ────────── Step 4: Fetch messages under each mapped label ──────────
    var routing = [];
    var methodCounts = { routed: 0, routed_swap: 0, unmatched_no_booking: 0, unmatched_ambiguous: 0, error: 0 };

    for (var li = 0; li < mappedLabels.length; li++) {
      var lbl = mappedLabels[li];

      // Find matching Zoho bookings for this label
      var matchedBookings = [];
      for (var tn = 0; tn < lbl.tourNames.length; tn++) {
        var tourName = lbl.tourNames[tn];
        var candidates = bookingsByTour[tourName] || [];
        for (var ci = 0; ci < candidates.length; ci++) {
          var c = candidates[ci];
          var zohoLodge = '';
          if (c.Lodge_Name && typeof c.Lodge_Name === 'object') zohoLodge = c.Lodge_Name.name || '';
          else zohoLodge = c.Lodge_Name || c.Name || '';
          if (lodgeNameMatches(lbl.lodgeSegment, zohoLodge)) {
            matchedBookings.push(c);
          }
        }
      }

      // Paginate messages under this label
      var nextToken = null;
      var labelMessageIds = [];
      do {
        var qs = 'messages?labelIds=' + encodeURIComponent(lbl.id) +
          '&maxResults=500' +
          (nextToken ? '&pageToken=' + nextToken : '');
        var listMsgRes = await gmailApi(token, qs);
        var msgs = listMsgRes.messages || [];
        for (var mi = 0; mi < msgs.length; mi++) {
          labelMessageIds.push(msgs[mi].id);
          if (routing.length + labelMessageIds.length >= maxMessages) break;
        }
        nextToken = listMsgRes.nextPageToken || null;
        if (routing.length + labelMessageIds.length >= maxMessages) break;
      } while (nextToken);

      // Fetch + route each message
      for (var mx = 0; mx < labelMessageIds.length; mx++) {
        var mid = labelMessageIds[mx];
        try {
          var msg = await gmailApi(token, 'messages/' + mid + '?format=full');
          var headers = msg.payload ? msg.payload.headers : [];
          var subj = getHeader(headers, 'Subject');
          var from = getHeader(headers, 'From');
          var to = getHeader(headers, 'To');
          var date = getHeader(headers, 'Date');
          // We need body regardless now — swap-fallback needs to extract dates.
          // In dry mode, extract body but don't attach it to the routing record
          // (keeps response size manageable).
          var body = extractBody(msg.payload);
          var atts = dry ? [] : extractAttachments(msg.payload);

          // Skip outbound (from us)
          if (from.indexOf('bookings@ridedownsouth.com') > -1 || from.indexOf('@ridedownsouth.com') > -1) {
            continue;
          }

          // ─── PRIMARY: direct lodge-name match ───
          if (matchedBookings.length > 0) {
            methodCounts.routed++;
            for (var mb = 0; mb < matchedBookings.length; mb++) {
              var bk = matchedBookings[mb];
              routing.push({
                gmail_id: mid,
                label: lbl.name,
                from: from,
                subject: subj,
                date: date,
                status: 'routed',
                match_method: 'direct_lodge_match',
                target_booking_id: bk.id,
                target_tour: (bk.Tour && bk.Tour.name) || bk.Tour || '',
                target_lodge: (bk.Lodge_Name && bk.Lodge_Name.name) || bk.Lodge_Name || bk.Name,
                target_check_in: bk.Check_in_Date,
                _msg: dry ? null : { subject: subj, from: from, to: to, date: date, body: body, attachments: atts },
              });
            }
            continue;
          }

          // ─── SWAP FALLBACK ───
          // No booking for this label's lodge on this tour. The lodge may have
          // been swapped out (availability issue). Try to find the booking on
          // this tour whose Check_in_Date matches a date mentioned in the email.
          // Attach to that booking with a flag noting the original lodge.
          var emailText = (subj || '') + '\n' + (body || '').substring(0, 8000);
          var emailDates = extractIsoDates(emailText);
          var swapTarget = null;

          if (emailDates.size > 0) {
            // Gather all bookings on this label's tour(s)
            var tourBookings = [];
            for (var tn2 = 0; tn2 < lbl.tourNames.length; tn2++) {
              tourBookings = tourBookings.concat(bookingsByTour[lbl.tourNames[tn2]] || []);
            }
            // Pick the booking whose Check_in_Date is in the email's date set
            for (var tb = 0; tb < tourBookings.length; tb++) {
              var tbk = tourBookings[tb];
              if (tbk.Check_in_Date && emailDates.has(tbk.Check_in_Date)) {
                swapTarget = tbk;
                break;
              }
            }
          }

          if (swapTarget) {
            methodCounts.routed_swap++;
            routing.push({
              gmail_id: mid,
              label: lbl.name,
              from: from,
              subject: subj,
              date: date,
              status: 'routed',
              match_method: 'lodge_swap',
              original_lodge: lbl.lodgeSegment,
              target_booking_id: swapTarget.id,
              target_tour: (swapTarget.Tour && swapTarget.Tour.name) || swapTarget.Tour || '',
              target_lodge: (swapTarget.Lodge_Name && swapTarget.Lodge_Name.name) || swapTarget.Lodge_Name || swapTarget.Name,
              target_check_in: swapTarget.Check_in_Date,
              _msg: dry ? null : { subject: subj, from: from, to: to, date: date, body: body, attachments: atts },
            });
            continue;
          }

          // ─── TRUE ORPHAN ───
          // No lodge match, no date match. Genuine unmatched — goes to bucket.
          methodCounts.unmatched_no_booking++;
          routing.push({
            gmail_id: mid,
            label: lbl.name,
            from: from,
            subject: subj,
            date: date,
            status: 'unmatched_no_booking',
            expected_tour: lbl.tourNames,
            expected_lodge: lbl.lodgeSegment,
            email_dates_found: emailDates.size > 0 ? Array.from(emailDates) : [],
            _msg: dry ? null : { subject: subj, from: from, to: to, date: date, body: body, attachments: atts },
          });
        } catch (e) {
          methodCounts.error++;
          routing.push({ gmail_id: mid, label: lbl.name, error: e.message });
        }
      }

      if (routing.length >= maxMessages) break;
    }

    // ────────── Step 5: Live pass (delete + write) ──────────
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
      // Delete existing unmatched blobs (will be recreated if still unmatched)
      for (var du = 0; du < unmatchedBlobs.length; du++) {
        try { await del(unmatchedBlobs[du].blob.url); deletedUnmatched++; }
        catch (e) { deleteErrors.push({ path: unmatchedBlobs[du].blob.pathname, error: e.message }); }
      }

      // Write each routed message
      for (var wi = 0; wi < routing.length; wi++) {
        var rt = routing[wi];
        if (!rt._msg || rt.error) continue;
        var safeId = rt.gmail_id.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
        var isSwap = rt.match_method === 'lodge_swap';
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
          ai_flags: rt.target_booking_id
            ? (isSwap ? [{ lodge_swap: true, original_lodge: rt.original_lodge }] : [])
            : [{ unmatched_reason: 'no_zoho_booking_for_label', label: rt.label }],
          processed_at: new Date().toISOString(),
          _reindexed: true,
          _source_label: rt.label,
          _match_method: rt.match_method || null,
          _original_lodge: rt.original_lodge || null,
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

    // ────────── Response ──────────
    var matchedLabelSummary = mappedLabels.map(function(l) {
      // How many Zoho bookings matched this label
      var bookingCount = 0;
      for (var tn = 0; tn < l.tourNames.length; tn++) {
        var candidates = bookingsByTour[l.tourNames[tn]] || [];
        for (var ci = 0; ci < candidates.length; ci++) {
          var zl = (candidates[ci].Lodge_Name && candidates[ci].Lodge_Name.name) || candidates[ci].Lodge_Name || candidates[ci].Name;
          if (lodgeNameMatches(l.lodgeSegment, zl)) bookingCount++;
        }
      }
      return { label: l.name, tour_names: l.tourNames, lodge: l.lodgeSegment, matched_bookings: bookingCount };
    });

    // Labels that didn't find a Zoho booking — flag for manual review
    var labelsWithNoBooking = matchedLabelSummary.filter(function(l) { return l.matched_bookings === 0; });

    res.status(200).json({
      mode: dry ? 'dry-run' : 'live',
      inventory: {
        total_blobs: allBlobs.length,
        inbound_existing: inboundBlobs.length,
        outbound_preserved: outboundBlobs.length,
        unmatched_existing: unmatchedBlobs.length,
      },
      gmail: {
        mapped_labels_count: mappedLabels.length,
      },
      zoho: {
        total_bookings_fetched: allBookings.length,
      },
      matching: {
        messages_processed: routing.length,
        routed: methodCounts.routed,
        routed_swap: methodCounts.routed_swap,
        unmatched_no_booking: methodCounts.unmatched_no_booking,
        errors: methodCounts.error,
      },
      label_booking_map: matchedLabelSummary,
      labels_with_no_zoho_booking: labelsWithNoBooking,
      live_actions: dry ? null : {
        deleted_inbound: deletedInbound,
        deleted_unmatched: deletedUnmatched,
        wrote: wrote,
        delete_errors: deleteErrors,
        write_errors: writeErrors,
      },
      routing_sample: dry
        ? routing.slice(0, 30).map(function(r) {
            var copy = {};
            Object.keys(r).forEach(function(k) { if (k !== '_msg') copy[k] = r[k]; });
            return copy;
          })
        : routing.filter(function(r) { return r.error; }),
    });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
}
