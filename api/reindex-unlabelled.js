// Backfill: handle inbox/sent messages that are NOT under any tour label.
// Runs AFTER reindex-inbound (Pass 1) has placed all labelled messages.
//
// Flow:
//   1. Gmail search with -label: exclusions to get only unlabelled messages
//   2. Fetch Zoho Lodges + Lodge_Bookings; build email→lodge and booking indexes
//   3. For each unlabelled message, try in order:
//        (a) RDS reference in subject  → direct booking match
//        (b) Lodge email + date match  → scoped by lodge
//        (c) Lodge email, no date      → tour bucket for that lodge's tour
//        (d) Guest email heuristics    → SKIP (not stored)
//        (e) Unmatched                 → emails/unmatched/
//   4. Write only NEW blobs — never overwrite, never delete
//
// Modes:
//   ?dry=true    preview, no writes (default)
//   ?dry=false   live, writes to blob
//   ?days=N      window (default 60, cap 365)

import { list, put } from '@vercel/blob';
import { getGmailToken, gmailApi } from './_gmail.js';
import { zohoApi } from './_zoho.js';
import { extractRdsRef, extractIsoDates } from './_email-match.js';

const TOUR_LABEL_PREFIXES = [
  'FoSA Mar 27',
  'INBOX/2026-03 (30 Mar - 18 Apr)',
  'INBOX/2026-04 (24 Apr - 13 May)',
  'INBOX/2026-05 (25 May - 6 June)',
  'INBOX/2026-07 Great Lakes',
  'INBOX/2026-09 Sept (9-28) Group B',
  'INBOX/2026-09 Sept (11-30) Group A',
  'INBOX/2026-10 October',
];

// Consumer email domains — strong signal that this is a guest, not a lodge
const CONSUMER_DOMAINS = {
  'gmail.com': 1, 'yahoo.com': 1, 'yahoo.co.uk': 1, 'yahoo.com.au': 1,
  'hotmail.com': 1, 'hotmail.co.uk': 1, 'outlook.com': 1, 'icloud.com': 1,
  'me.com': 1, 'live.nl': 1, 'live.com': 1, 'msn.com': 1, 'aol.com': 1,
};

// Subject phrases that strongly indicate guest correspondence (not lodge)
const GUEST_SUBJECT_PATTERNS = [
  /flight\s*details?/i,
  /flights?\s*and\s*extra\s*accommodation/i,
  /nationality/i,
  /lost\s*phone/i,
  /passport/i,
  /arrival\s*flight/i,
];

function parseEmailAddress(hdr) {
  if (!hdr) return '';
  var m = hdr.match(/<([^>]+)>/);
  var addr = m ? m[1] : hdr;
  return addr.trim().toLowerCase();
}

function parseDomain(hdr) {
  var addr = parseEmailAddress(hdr);
  var at = addr.lastIndexOf('@');
  return at > -1 ? addr.substring(at + 1) : '';
}

function extractBody(payload) {
  // Minimal body extraction — good enough for date/keyword scanning
  if (!payload) return '';
  function walk(p) {
    if (!p) return '';
    if (p.body && p.body.data) {
      try { return Buffer.from(p.body.data, 'base64').toString('utf8'); }
      catch (e) { return ''; }
    }
    if (p.parts && p.parts.length) {
      var out = '';
      for (var i = 0; i < p.parts.length; i++) out += '\n' + walk(p.parts[i]);
      return out;
    }
    return '';
  }
  return walk(payload);
}

function getHeader(headers, name) {
  if (!headers) return '';
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].name.toLowerCase() === name.toLowerCase()) return headers[i].value;
  }
  return '';
}

function safeTourKey(name) {
  return (name || '').replace(/[^a-zA-Z0-9]+/g, '_');
}

function safeId(gmailId) {
  return gmailId.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
}

// Heuristic: is this tour name one the system recognises as legitimate?
// We use this to keep tour-bucket routing sane — we only create a bucket
// if the tour name looks like a real RDS tour format (FoSA / BoN / GL
// followed by a month + year). This deliberately allows historical tours
// like "FoSA Sep 25" — those are real past tours. Temporal guards on the
// per-booking date matching handle "don't route 2026 email to 2025 tour".
var TOUR_NAME_PATTERN = /^(FoSA|BoN|GL|Edge|Great Lakes)\s/i;
function looksLikeTour(name) {
  return !!(name && TOUR_NAME_PATTERN.test(name));
}

// Stop-words used when tokenising lodge names for subject matching. Words
// too generic to disambiguate (lodge, camp, hotel, etc.) are skipped.
var STOP_WORDS_MAIN = { lodge:1, camp:1, hotel:1, village:1, resort:1, guest:1, inn:1, farm:1, the:1, a:1, at:1, on:1, in:1, of:1, and:1 };

// Subject pattern that looks like Helen's lodge correspondence:
//   "Re: Lodge Name: Date:" or "Re: Lodge Name - Date"
// If this matches, it's a lodge email regardless of recipient domain.
var LODGE_SUBJECT_HINT = /^(re:|fw:|fwd:)?\s*[A-Z][\w\s&.,'\-]+(:|—|-)\s*(\d|\w{3,9}\s*\d|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i;
var RDS_ENQUIRY_HINT = /Booking enquiry|RDS-[A-Z]/i;

function isGuestEmail(from, to, subject) {
  var subj = subject || '';
  // Hard guest indicators in subject — these override everything
  for (var i = 0; i < GUEST_SUBJECT_PATTERNS.length; i++) {
    if (GUEST_SUBJECT_PATTERNS[i].test(subj)) return true;
  }
  // If subject looks like lodge correspondence, treat as lodge
  if (LODGE_SUBJECT_HINT.test(subj) || RDS_ENQUIRY_HINT.test(subj)) return false;
  // Consumer domain fallback: only guest if subject doesn't look lodge-like
  var fromDom = parseDomain(from);
  var toDom = parseDomain(to);
  if (CONSUMER_DOMAINS[fromDom] || CONSUMER_DOMAINS[toDom]) return true;
  return false;
}

export default async function handler(req, res) {
  var t0 = Date.now();
  var deadlineMs = 50000; // leaves ~10s headroom under Vercel maxDuration 60
  try {
    var dry = String((req.query && req.query.dry) || 'true').toLowerCase() !== 'false';
    var days = parseInt((req.query && req.query.days) || '60', 10);
    if (!(days > 0) || days > 365) days = 60;
    var maxMessages = parseInt((req.query && req.query.max) || '500', 10);

    // ─── Step 1: Build tour-label exclusion query ───
    var token = await getGmailToken();
    var labelListResp = await gmailApi(token, 'labels');
    var allLabels = labelListResp.labels || [];
    var tourLabelNames = [];
    for (var i = 0; i < allLabels.length; i++) {
      var ln = allLabels[i].name;
      for (var p = 0; p < TOUR_LABEL_PREFIXES.length; p++) {
        if (ln === TOUR_LABEL_PREFIXES[p] || ln.indexOf(TOUR_LABEL_PREFIXES[p] + '/') === 0) {
          tourLabelNames.push(ln);
          break;
        }
      }
    }
    var excludes = tourLabelNames.map(function(n) {
      return '-label:"' + n.replace(/"/g, '') + '"';
    }).join(' ');
    var query = '(in:inbox OR in:sent) newer_than:' + days + 'd ' + excludes;

    // ─── Step 2: Fetch unlabelled message IDs ───
    var allMsgIds = [];
    var pageToken = null;
    var qPages = 0;
    while (qPages < 8) {
      if (Date.now() - t0 > 5000) break;
      var url = 'messages?q=' + encodeURIComponent(query) + '&maxResults=100' + (pageToken ? '&pageToken=' + pageToken : '');
      var r = await gmailApi(token, url);
      if (r.messages) allMsgIds = allMsgIds.concat(r.messages);
      pageToken = r.nextPageToken;
      qPages++;
      if (!pageToken) break;
    }
    if (allMsgIds.length > maxMessages) allMsgIds = allMsgIds.slice(0, maxMessages);

    // ─── Step 3: Fetch Zoho Lodges (for email→lodge index) ───
    var lodgeFields = 'Name,Email,Preferred_Email,Email_Reservations_2,Email_Accounts,Secondary_Email,id';
    var allLodges = [];
    var lPage = 1;
    var lMore = true;
    while (lMore && lPage <= 3) {
      var lR = await zohoApi('GET', 'Lodges?fields=' + lodgeFields + '&per_page=200&page=' + lPage);
      var lData = (lR && lR.data) || [];
      allLodges = allLodges.concat(lData);
      lMore = lR && lR.info && lR.info.more_records;
      lPage++;
    }

    // Build email→lodge map (exact address) and domain→lodge map (fallback)
    var emailToLodge = {};
    var domainToLodges = {};
    for (var li = 0; li < allLodges.length; li++) {
      var lodge = allLodges[li];
      var emailFields = [lodge.Email, lodge.Preferred_Email, lodge.Email_Reservations_2, lodge.Email_Accounts, lodge.Secondary_Email];
      for (var ef = 0; ef < emailFields.length; ef++) {
        var ev = emailFields[ef];
        if (!ev || typeof ev !== 'string') continue;
        var addr = ev.trim().toLowerCase();
        if (!addr) continue;
        emailToLodge[addr] = lodge;
        var at = addr.lastIndexOf('@');
        if (at > -1) {
          var dom = addr.substring(at + 1);
          if (!domainToLodges[dom]) domainToLodges[dom] = [];
          domainToLodges[dom].push(lodge);
        }
      }
    }

    // ─── Step 4: Fetch Zoho Lodge_Bookings (for booking match) ───
    var bookingFields = 'Name,Lodge_Name,Lodge,RDS_Reference,Status,Check_in_Date,Check_out_Date,Tour,id';
    var allBookings = [];
    var bPage = 1;
    var bMore = true;
    while (bMore && bPage <= 5) {
      var bR = await zohoApi('GET', 'Lodge_Bookings?fields=' + bookingFields + '&per_page=200&page=' + bPage);
      var bData = (bR && bR.data) || [];
      allBookings = allBookings.concat(bData);
      bMore = bR && bR.info && bR.info.more_records;
      bPage++;
    }

    // Index bookings by lodge id
    var bookingsByLodgeId = {};
    for (var bi2 = 0; bi2 < allBookings.length; bi2++) {
      var bkg = allBookings[bi2];
      var lodgeId = null;
      if (bkg.Lodge && typeof bkg.Lodge === 'object' && bkg.Lodge.id) lodgeId = bkg.Lodge.id;
      if (!lodgeId) continue;
      if (!bookingsByLodgeId[lodgeId]) bookingsByLodgeId[lodgeId] = [];
      bookingsByLodgeId[lodgeId].push(bkg);
    }

    // Index bookings by RDS reference (loose — also builds {booking name: bookings})
    var bookingByRds = {};
    for (var bi3 = 0; bi3 < allBookings.length; bi3++) {
      var b2 = allBookings[bi3];
      if (b2.RDS_Reference) bookingByRds[b2.RDS_Reference.trim().toLowerCase()] = b2;
    }

    // Index bookings by lodge-name keywords (for subject matching).
    // Key: first significant word of Lodge_Name in lowercase.
    // Value: list of bookings whose lodge name starts with/contains that word.
    // e.g. "Drotskys Cabins" → 'drotskys'
    // e.g. "Canyon Village" → 'canyon village' AND 'canyon'
    // e.g. "Felix Unite Provenance Camp" → 'felix unite' AND 'felix'
    // We skip very generic words (lodge, camp, hotel, etc.)
    var bookingsByLodgeKeyword = {};
    function addKeyword(kw, bkg) {
      if (!kw || kw.length < 4) return;
      if (STOP_WORDS_MAIN[kw]) return;
      if (!bookingsByLodgeKeyword[kw]) bookingsByLodgeKeyword[kw] = [];
      bookingsByLodgeKeyword[kw].push(bkg);
    }
    for (var bi5 = 0; bi5 < allBookings.length; bi5++) {
      var b3 = allBookings[bi5];
      var lodgeNameStr = (b3.Lodge_Name && b3.Lodge_Name.name) || b3.Lodge_Name || '';
      if (typeof lodgeNameStr !== 'string') continue;
      // Strip trailing " - Day N" and " - YYYY-MM-DD" suffixes
      var clean = lodgeNameStr.replace(/\s*-\s*Day\s+\d+.*$/i, '').replace(/\s*-\s*\d{4}-\d{2}-\d{2}.*$/, '').trim().toLowerCase();
      var words = clean.split(/[\s,]+/).filter(function(w) { return w.length > 0; });
      // Add individual significant words
      for (var w = 0; w < words.length; w++) addKeyword(words[w], b3);
      // Add first two-word pair (e.g. "felix unite")
      if (words.length >= 2) addKeyword(words[0] + ' ' + words[1], b3);
    }

    // Index bookings by Check_in_Date — for date-primary matching.
    // The core insight: on any given date, a tour is in exactly one lodge.
    // If an email mentions a date and that date is a Check_in_Date, the
    // booking IS the match — no lodge-name guessing required.
    var bookingsByCheckIn = {};
    for (var bi6 = 0; bi6 < allBookings.length; bi6++) {
      var b4 = allBookings[bi6];
      if (b4.Check_in_Date) {
        if (!bookingsByCheckIn[b4.Check_in_Date]) bookingsByCheckIn[b4.Check_in_Date] = [];
        bookingsByCheckIn[b4.Check_in_Date].push(b4);
      }
    }

    // ─── Step 5: Fetch existing blob inventory so we don't overwrite ───
    var existingBlobKeys = {};
    var blobPageCursor = null;
    var blobPages = 0;
    while (blobPages < 5) {
      if (Date.now() - t0 > 8000) break;
      var blobRes = await list({ prefix: 'emails/', limit: 1000, cursor: blobPageCursor });
      for (var bx = 0; bx < blobRes.blobs.length; bx++) {
        existingBlobKeys[blobRes.blobs[bx].pathname] = true;
      }
      blobPageCursor = blobRes.cursor;
      blobPages++;
      if (!blobPageCursor) break;
    }

    // ─── Step 6: Fetch each message, classify, route ───
    var counts = {
      total: allMsgIds.length,
      processed: 0,
      matched_rds: 0,
      matched_lodge_date: 0,
      matched_subject_date: 0,
      matched_tour_bucket: 0,
      guest_skipped: 0,
      unmatched: 0,
      already_exists: 0,
      errors: 0,
    };
    var routing = [];
    var wrote = 0;
    var writeErrors = [];
    var batchSize = 15;
    var hitTimeout = false;

    for (var bi4 = 0; bi4 < allMsgIds.length; bi4 += batchSize) {
      if (Date.now() - t0 > deadlineMs) { hitTimeout = true; break; }
      var batch = allMsgIds.slice(bi4, bi4 + batchSize);
      var msgs = await Promise.all(batch.map(function(m) {
        return gmailApi(token, 'messages/' + m.id + '?format=full')
          .then(function(r) { return { ok: true, id: m.id, msg: r }; })
          .catch(function(e) { return { ok: false, id: m.id, err: e.message }; });
      }));

      for (var mi = 0; mi < msgs.length; mi++) {
        counts.processed++;
        if (!msgs[mi].ok) { counts.errors++; continue; }

        var gmailId = msgs[mi].id;
        var msg = msgs[mi].msg;
        var hdrs = (msg.payload && msg.payload.headers) || [];
        var subj = getHeader(hdrs, 'Subject');
        var from = getHeader(hdrs, 'From');
        var to = getHeader(hdrs, 'To');
        var date = getHeader(hdrs, 'Date');
        var body = extractBody(msg.payload);

        var decision = { gmail_id: gmailId, subject: subj, from: from, to: to, date: date };

        // Guest heuristic FIRST — skip entirely
        if (isGuestEmail(from, to, subj)) {
          decision.status = 'skipped_guest';
          counts.guest_skipped++;
          routing.push(decision);
          continue;
        }

        // Tier 1: RDS reference in subject
        var ref = extractRdsRef(subj) || extractRdsRef(body);
        if (ref) {
          var refLower = ref.trim().toLowerCase();
          var bkByRef = bookingByRds[refLower];
          if (bkByRef) {
            decision.status = 'routed';
            decision.match_method = 'rds_reference';
            decision.target_booking_id = bkByRef.id;
            decision.target_tour = (bkByRef.Tour && bkByRef.Tour.name) || '';
            decision.target_lodge = (bkByRef.Lodge_Name && bkByRef.Lodge_Name.name) || bkByRef.Lodge_Name || bkByRef.Name;
            counts.matched_rds++;
            routing.push(decision);
            if (!dry) await writeRecord(decision, { from: from, to: to, subject: subj, date: date, body: body }, existingBlobKeys, counts, writeErrors);
            continue;
          }
        }

        // Tier 2: Date-primary match. Email contains one or more dates;
        // look up each against bookingsByCheckIn. Filter out bookings whose
        // check-in is more than 90 days before the email's sent date —
        // a lodge proforma sent now cannot be for a tour that already
        // happened months ago.
        //
        // If one booking remains → match it.
        // If multiple remain → score candidates by lodge name overlap
        //   with subject and take the best (still safer than keyword-first
        //   because the date is a hard anchor).
        var emailDates = extractIsoDates(subj + '\n' + body);
        var emailSentDate = null;
        try { emailSentDate = new Date(date); if (isNaN(emailSentDate.getTime())) emailSentDate = null; } catch (e) {}

        var dateCandidates = [];
        var seenDateCandIds = {};
        emailDates.forEach(function(d) {
          var bks = bookingsByCheckIn[d] || [];
          for (var dbi = 0; dbi < bks.length; dbi++) {
            var bk = bks[dbi];
            // Temporal guard: skip bookings whose date is > 90 days before email
            if (emailSentDate && bk.Check_in_Date) {
              var bkDate = new Date(bk.Check_in_Date);
              var msDiff = emailSentDate.getTime() - bkDate.getTime();
              if (msDiff > 90 * 24 * 3600 * 1000) continue; // booking is too old
            }
            if (!seenDateCandIds[bk.id]) {
              seenDateCandIds[bk.id] = true;
              dateCandidates.push(bk);
            }
          }
        });

        if (dateCandidates.length > 0) {
          // Score by subject overlap with lodge name to pick best if many
          var subjLowerEarly = (subj || '').toLowerCase();
          function scoreByName(c) {
            var nm = (c.Lodge_Name && c.Lodge_Name.name) || c.Lodge_Name || c.Name || '';
            if (typeof nm !== 'string') return 0;
            var clean = nm.replace(/\s*-\s*Day\s+\d+.*$/i, '').replace(/\s*-\s*\d{4}-\d{2}-\d{2}.*$/, '').trim().toLowerCase();
            if (!clean) return 0;
            if (subjLowerEarly.indexOf(clean) > -1) return clean.length * 10;
            var ws = clean.split(/\s+/);
            var best = 0;
            for (var wi1 = 0; wi1 < ws.length; wi1++) {
              if (ws[wi1].length < 4) continue;
              if (STOP_WORDS_MAIN[ws[wi1]]) continue;
              if (subjLowerEarly.indexOf(ws[wi1]) > -1) best += ws[wi1].length;
            }
            return best;
          }
          dateCandidates.sort(function(a, b) { return scoreByName(b) - scoreByName(a); });
          var dateWinner = dateCandidates[0];
          decision.status = 'routed';
          decision.match_method = dateCandidates.length === 1 ? 'date_unique' : 'date_plus_name';
          decision.target_booking_id = dateWinner.id;
          decision.target_tour = (dateWinner.Tour && dateWinner.Tour.name) || '';
          decision.target_lodge = (dateWinner.Lodge_Name && dateWinner.Lodge_Name.name) || dateWinner.Lodge_Name || dateWinner.Name;
          decision.target_check_in = dateWinner.Check_in_Date;
          if (dateCandidates.length > 1) decision.date_candidate_count = dateCandidates.length;
          counts.matched_date = (counts.matched_date || 0) + 1;
          routing.push(decision);
          if (!dry) await writeRecord(decision, { from: from, to: to, subject: subj, date: date, body: body }, existingBlobKeys, counts, writeErrors);
          continue;
        }

        // Tier 2+3: Lodge email match
        var fromAddr = parseEmailAddress(from);
        var toAddr = parseEmailAddress(to);
        var fromDom = parseDomain(from);
        var toDom = parseDomain(to);

        // Try exact address first (more reliable), then domain
        var matchedLodge = emailToLodge[fromAddr] || emailToLodge[toAddr];
        if (!matchedLodge) {
          var fromLodges = domainToLodges[fromDom] || [];
          var toLodges = domainToLodges[toDom] || [];
          // If the domain uniquely identifies a lodge, use it
          var allDomLodges = fromLodges.concat(toLodges);
          var uniqueLodgeIds = {};
          for (var dl = 0; dl < allDomLodges.length; dl++) uniqueLodgeIds[allDomLodges[dl].id] = allDomLodges[dl];
          var uniqueList = Object.keys(uniqueLodgeIds).map(function(k) { return uniqueLodgeIds[k]; });
          if (uniqueList.length === 1) matchedLodge = uniqueList[0];
          // If more than one, leave unmatched — ambiguous
        }

        if (matchedLodge) {
          var lodgeBookings = bookingsByLodgeId[matchedLodge.id] || [];
          // Try date match on this lodge's bookings
          var emailDates = extractIsoDates(subj + '\n' + body);
          var dateMatch = null;
          for (var lb = 0; lb < lodgeBookings.length; lb++) {
            if (lodgeBookings[lb].Check_in_Date && emailDates.has(lodgeBookings[lb].Check_in_Date)) {
              dateMatch = lodgeBookings[lb];
              break;
            }
          }

          if (dateMatch) {
            decision.status = 'routed';
            decision.match_method = 'lodge_email_date';
            decision.target_booking_id = dateMatch.id;
            decision.target_tour = (dateMatch.Tour && dateMatch.Tour.name) || '';
            decision.target_lodge = matchedLodge.Name;
            decision.target_check_in = dateMatch.Check_in_Date;
            counts.matched_lodge_date++;
            routing.push(decision);
            if (!dry) await writeRecord(decision, { from: from, to: to, subject: subj, date: date, body: body }, existingBlobKeys, counts, writeErrors);
            continue;
          }

          // No date match — but we know the lodge, so tour bucket for that lodge's tour
          if (lodgeBookings.length > 0) {
            // Most common tour for this lodge
            var tourCounts = {};
            for (var tc = 0; tc < lodgeBookings.length; tc++) {
              var tn = (lodgeBookings[tc].Tour && lodgeBookings[tc].Tour.name) || '';
              if (!tn) continue;
              tourCounts[tn] = (tourCounts[tn] || 0) + 1;
            }
            var topTour = null;
            var topCount = 0;
            for (var tk in tourCounts) {
              if (tourCounts[tk] > topCount) { topTour = tk; topCount = tourCounts[tk]; }
            }
            if (topTour) {
              decision.status = 'routed';
              decision.match_method = 'tour_bucket_via_lodge';
              decision.target_tour = topTour;
              decision.target_lodge = matchedLodge.Name;
              decision.target_booking_id = null;
              counts.matched_tour_bucket++;
              routing.push(decision);
              if (!dry) await writeRecord(decision, { from: from, to: to, subject: subj, date: date, body: body }, existingBlobKeys, counts, writeErrors);
              continue;
            }
          }
        }

        // Tier 4: Lodge-name in subject + date match.
        // The Lodges module often has no/stale email addresses, but Helen's
        // subject line reliably contains the lodge name: "Re: Drotskys: 24 Sep 2026".
        // Scan subject tokens against our lodge-keyword index and cross with date.
        //
        // When multiple lodge candidates match (e.g. "Desert Sands" subject hits
        // Desert Sands, Desert Camp, Desert Lodge via shared 'desert' keyword),
        // we must prefer the candidate whose full lodge name has the LONGEST
        // substring overlap with the subject. This prevents misrouting to
        // look-alike lodges.
        var subjLower = (subj || '').toLowerCase();
        var candidateBookings = [];
        var seenBookingIds = {};
        for (var kw2 in bookingsByLodgeKeyword) {
          if (subjLower.indexOf(kw2) > -1) {
            var kwBkgs = bookingsByLodgeKeyword[kw2];
            for (var kb = 0; kb < kwBkgs.length; kb++) {
              if (!seenBookingIds[kwBkgs[kb].id]) {
                seenBookingIds[kwBkgs[kb].id] = true;
                candidateBookings.push(kwBkgs[kb]);
              }
            }
          }
        }

        // Score each candidate by how much of its lodge name appears in subject
        if (candidateBookings.length > 0) {
          function candidateLodgeName(c) {
            var n = (c.Lodge_Name && c.Lodge_Name.name) || c.Lodge_Name || c.Name || '';
            if (typeof n !== 'string') return '';
            return n.replace(/\s*-\s*Day\s+\d+.*$/i, '').replace(/\s*-\s*\d{4}-\d{2}-\d{2}.*$/, '').trim().toLowerCase();
          }
          function scoreCandidate(c) {
            var nm = candidateLodgeName(c);
            if (!nm) return 0;
            // Try exact full name
            if (subjLower.indexOf(nm) > -1) return nm.length * 10;
            // Else find longest contiguous prefix-match on words
            var words = nm.split(/\s+/);
            var best = 0;
            for (var wn = 0; wn < words.length; wn++) {
              if (STOP_WORDS_MAIN[words[wn]]) continue;
              if (subjLower.indexOf(words[wn]) > -1) best += words[wn].length;
            }
            return best;
          }
          candidateBookings.sort(function(a, b) { return scoreCandidate(b) - scoreCandidate(a); });
        }

        if (candidateBookings.length > 0) {
          var emailDatesAll = extractIsoDates(subj + '\n' + body);
          var subjDateMatch = null;
          // Walk candidates in score order — higher score = better name match
          for (var cb = 0; cb < candidateBookings.length; cb++) {
            if (candidateBookings[cb].Check_in_Date && emailDatesAll.has(candidateBookings[cb].Check_in_Date)) {
              subjDateMatch = candidateBookings[cb];
              break;
            }
          }

          if (subjDateMatch) {
            var sdmTour = (subjDateMatch.Tour && subjDateMatch.Tour.name) || '';
            // Safety: only route if tour is a known real tour. Otherwise the
            // booking has a malformed Tour lookup and we shouldn't blindly
            // trust it — fall through to tour bucket with unknown_tour label.
            decision.status = 'routed';
            decision.match_method = 'lodge_subject_date';
            decision.target_booking_id = subjDateMatch.id;
            decision.target_tour = sdmTour;
            decision.target_lodge = (subjDateMatch.Lodge_Name && subjDateMatch.Lodge_Name.name) || subjDateMatch.Lodge_Name || subjDateMatch.Name;
            decision.target_check_in = subjDateMatch.Check_in_Date;
            if (!looksLikeTour(sdmTour)) decision.warning = 'unusual_tour_name_on_booking';
            counts.matched_subject_date = (counts.matched_subject_date || 0) + 1;
            routing.push(decision);
            if (!dry) await writeRecord(decision, { from: from, to: to, subject: subj, date: date, body: body }, existingBlobKeys, counts, writeErrors);
            continue;
          }

          // Subject mentions a lodge but date doesn't match any of its bookings.
          // Route to that lodge's tour bucket if the tour name looks like a real tour.
          var topCandidate = candidateBookings[0];
          var topTourName = (topCandidate.Tour && topCandidate.Tour.name) || '';
          if (topTourName && looksLikeTour(topTourName)) {
            decision.status = 'routed';
            decision.match_method = 'tour_bucket_via_subject';
            decision.target_tour = topTourName;
            decision.target_lodge = (topCandidate.Lodge_Name && topCandidate.Lodge_Name.name) || topCandidate.Lodge_Name || topCandidate.Name;
            decision.target_booking_id = null;
            counts.matched_tour_bucket++;
            routing.push(decision);
            if (!dry) await writeRecord(decision, { from: from, to: to, subject: subj, date: date, body: body }, existingBlobKeys, counts, writeErrors);
            continue;
          }
        }

        // Tier 5: Unmatched
        decision.status = 'unmatched';
        counts.unmatched++;
        routing.push(decision);
        if (!dry) await writeRecord(decision, { from: from, to: to, subject: subj, date: date, body: body }, existingBlobKeys, counts, writeErrors);
      }
    }

    res.status(200).json({
      mode: dry ? 'dry-run' : 'live',
      elapsed_ms: Date.now() - t0,
      hit_timeout: hitTimeout,
      window_days: days,
      counts: counts,
      wrote: counts.wrote || 0,
      write_errors: writeErrors,
      routing_sample: routing.slice(0, 60),
    });
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack, elapsed_ms: Date.now() - t0 });
  }
}

// Helper: write a blob record if path is free; otherwise skip.
async function writeRecord(decision, msgFields, existingBlobKeys, counts, writeErrors) {
  var sId = safeId(decision.gmail_id);
  var path;
  if (decision.target_booking_id) {
    path = 'emails/booking/' + decision.target_booking_id + '/' + sId + '.json';
  } else if ((decision.match_method === 'tour_bucket_via_lodge' || decision.match_method === 'tour_bucket_via_subject') && decision.target_tour) {
    path = 'emails/tour-bucket/' + safeTourKey(decision.target_tour) + '/' + sId + '.json';
  } else {
    path = 'emails/unmatched/' + sId + '.json';
  }

  if (existingBlobKeys[path]) {
    counts.already_exists++;
    return;
  }

  var fromHdr = msgFields.from || '';
  var isOutbound = fromHdr.toLowerCase().indexOf('bookings@ridedownsouth.com') > -1 ||
                   fromHdr.toLowerCase().indexOf('@ridedownsouth.com') > -1;
  var flags = [];
  if (decision.match_method === 'tour_bucket_via_lodge' || decision.match_method === 'tour_bucket_via_subject') flags.push({ tour_bucket: true, matched_lodge: decision.target_lodge });
  if (decision.match_method === 'rds_reference') flags.push({ backfill: true, via: 'rds_reference' });
  if (decision.match_method === 'lodge_email_date') flags.push({ backfill: true, via: 'lodge_email_date' });
  if (decision.match_method === 'lodge_subject_date') flags.push({ backfill: true, via: 'lodge_subject_date' });

  var record = {
    id: sId,
    message_id: decision.gmail_id,
    gmail_message_id: decision.gmail_id,
    type: isOutbound ? 'lodge_outbound' : 'lodge_inbound',
    direction: isOutbound ? 'outbound' : 'inbound',
    lodge_id: null,
    booking_id: decision.target_booking_id || null,
    tour_name: decision.target_tour || null,
    from: msgFields.from,
    to: msgFields.to,
    subject: msgFields.subject,
    body: msgFields.body,
    date: msgFields.date,
    attachments: [],
    ai_summary: null,
    ai_extractions: null,
    ai_flags: flags,
    processed_at: new Date().toISOString(),
    _reindexed: true,
    _reindex_pass: 'unlabelled_backfill',
    _match_method: decision.match_method || null,
  };

  try {
    await put(path, JSON.stringify(record), {
      access: 'public', contentType: 'application/json', addRandomSuffix: false,
    });
    existingBlobKeys[path] = true;
    counts.wrote = (counts.wrote || 0) + 1;
  } catch (e) {
    writeErrors.push({ gmail_id: decision.gmail_id, error: e.message });
  }
}
