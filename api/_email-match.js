// Shared matching logic for inbound Gmail messages → Zoho Lodge_Booking.
//
// Used by api/poll-gmail.js (live polling) and api/reindex-inbound.js
// (one-shot refetch/rebuild). Keeping a single source of truth prevents
// the two paths drifting apart.
//
// Matching strategy (in order):
//   1. RDS reference in subject  — exact, high confidence
//   2. RDS reference in body     — high confidence
//   3. Lodge name + check-in     — multiple bookings at same lodge
//                                  disambiguated by date overlap.
//                                  Refuses to match when no date lines up.
//
// Returns { booking, method } on success, { booking: null, method, reason } on miss.

// Extract RDS reference from text, e.g. RDS-FoSA-Mar26-CanyonVillage-26/04/03
export function extractRdsRef(text) {
  if (!text) return null;
  var match = text.match(/\[?(RDS-[A-Za-z0-9\-\/]+)\]?/);
  return match ? match[1] : null;
}

// Extract all dates from text and normalise each to YYYY-MM-DD.
// Handles: "26 April 2026", "April 26, 2026", "26/04/2026" (DD/MM/YYYY —
// SA/UK convention, what lodges use), and ISO.
export function extractIsoDates(text) {
  if (!text) return new Set();
  var out = new Set();
  var MONTH = {
    jan:1,january:1, feb:2,february:2, mar:3,march:3, apr:4,april:4,
    may:5, jun:6,june:6, jul:7,july:7, aug:8,august:8,
    sep:9,sept:9,september:9, oct:10,october:10, nov:11,november:11, dec:12,december:12
  };
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function push(y, m, d) {
    if (y && m && d && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      out.add(y + '-' + pad(m) + '-' + pad(d));
    }
  }

  // "26 April 2026" / "26 Apr 2026"
  var re1 = /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(20\d{2})\b/gi;
  var m;
  while ((m = re1.exec(text)) !== null) {
    push(parseInt(m[3], 10), MONTH[m[2].toLowerCase()], parseInt(m[1], 10));
  }

  // "April 26, 2026" / "Apr 26 2026"
  var re2 = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(20\d{2})\b/gi;
  while ((m = re2.exec(text)) !== null) {
    push(parseInt(m[3], 10), MONTH[m[1].toLowerCase()], parseInt(m[2], 10));
  }

  // "26/04/2026" or "26-04-2026" (DD/MM/YYYY — SA/UK convention)
  var re3 = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})\b/g;
  while ((m = re3.exec(text)) !== null) {
    push(parseInt(m[3], 10), parseInt(m[2], 10), parseInt(m[1], 10));
  }

  // "2026-04-26" (ISO)
  var re4 = /\b(20\d{2})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/g;
  while ((m = re4.exec(text)) !== null) {
    push(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
  }

  return out;
}

// Score how well a set of email-extracted dates line up with a booking.
// Check-in match = 2 points (strong). Check-out match = 1 point (weaker,
// can be off-by-one in quoted emails). ±1 day tolerance.
export function dateMatchScore(emailDates, checkIn, checkOut) {
  if (!emailDates || emailDates.size === 0) return 0;
  var score = 0;
  function matchType(iso, target) {
    if (!target) return 0;
    if (iso === target) return 2; // exact
    var d = new Date(iso); var t = new Date(target);
    if (isNaN(d) || isNaN(t)) return 0;
    var diff = Math.abs(d - t) / 86400000;
    if (diff <= 1) return 1; // nearby
    return 0;
  }
  emailDates.forEach(function(iso) {
    var ciMatch = matchType(iso, checkIn);
    var coMatch = matchType(iso, checkOut);
    // Exact check-in = 4, nearby check-in = 2, exact check-out = 2, nearby check-out = 1
    if (ciMatch === 2) score += 4;
    else if (ciMatch === 1) score += 2;
    else if (coMatch === 2) score += 2;
    else if (coMatch === 1) score += 1;
  });
  return score;
}

// Build the refMap + nameMap used for matching. Caller passes in the
// full bookings array (paginated fetch done elsewhere).
export function buildMatchMaps(allBookings) {
  var refMap = {};
  var nameMap = {};
  (allBookings || []).forEach(function(bk) {
    var ref = bk.RDS_Reference || '';
    if (ref) refMap[ref.toLowerCase()] = bk;

    var lodge = bk.Lodge_Name || bk.Name || '';
    if (typeof lodge === 'object' && lodge !== null) lodge = lodge.name || '';
    var lodgeClean = String(lodge).split(' - ')[0].toLowerCase().trim();
    if (lodgeClean) {
      if (!nameMap[lodgeClean]) nameMap[lodgeClean] = [];
      nameMap[lodgeClean].push(bk);
    }
  });
  return { refMap: refMap, nameMap: nameMap };
}

// Build an email→lodge lookup map from Zoho lodge records.
// Each lodge can have up to 3 email addresses. The map keys are
// lowercase email addresses, values are the lodge Name string.
export function buildEmailMap(lodgeRecords) {
  var map = {};
  (lodgeRecords || []).forEach(function(lodge) {
    var name = lodge.Name || '';
    var emails = [lodge.Email, lodge.Preferred_Email, lodge.Email_Reservations_2];
    emails.forEach(function(e) {
      if (e && typeof e === 'string') {
        map[e.toLowerCase().trim()] = name;
      }
    });
  });
  return map;
}

// Extract just the email address from a From header like "Jane <jane@lodge.com>"
function extractEmailAddress(from) {
  if (!from) return '';
  var m = from.match(/<([^>]+)>/);
  if (m) return m[1].toLowerCase().trim();
  // No angle brackets — assume the whole thing is an address
  if (from.indexOf('@') !== -1) return from.toLowerCase().trim();
  return '';
}

// Match a single email (subject + body + from) against the build maps.
// Returns { booking, method, reason }. booking is null on no match.
// emailMap is optional — if provided, enables Tier 4 sender-email matching.
export function matchEmailToBooking(subject, body, from, refMap, nameMap, emailMap) {
  var subj = subject || '';
  var bod = body || '';
  var frm = from || '';

  // 1. RDS ref in subject
  var rdsRef = extractRdsRef(subj);
  if (rdsRef && refMap[rdsRef.toLowerCase()]) {
    return { booking: refMap[rdsRef.toLowerCase()], method: 'rds_reference_subject' };
  }

  // 2. RDS ref in body
  if (bod) {
    var bodyRefs = bod.match(/RDS-[A-Za-z0-9\-\/]+/g) || [];
    for (var br = 0; br < bodyRefs.length; br++) {
      var bodyRef = bodyRefs[br].toLowerCase();
      if (refMap[bodyRef]) {
        return { booking: refMap[bodyRef], method: 'rds_reference_body' };
      }
    }
  }

  // 3. Lodge name + date score
  var subjectLower = subj.toLowerCase();
  var fromLower = frm.toLowerCase();
  var lodgeNames = Object.keys(nameMap);
  var emailText = subj + '\n' + bod.substring(0, 8000);
  var emailDates = extractIsoDates(emailText);
  var ambiguousLodge = null;

  for (var ln = 0; ln < lodgeNames.length; ln++) {
    var name = lodgeNames[ln];
    if (name.length <= 3) continue;
    if (subjectLower.indexOf(name) === -1 && fromLower.indexOf(name) === -1) continue;

    var candidates = nameMap[name];
    if (!candidates || candidates.length === 0) continue;

    if (candidates.length === 1) {
      // Safety check: even with a unique lodge candidate, if the email
      // mentions dates and those dates are far from the booking's
      // check-in/check-out, this is likely the WRONG booking — most
      // likely the correct booking doesn't exist in Zoho yet. Better to
      // route to the Inbox unmatched queue than to misfile silently.
      //
      // Tolerance: if any extracted email date is within 60 days of
      // either check-in or check-out, accept the unique match. If
      // every extracted date is further away than that, flag as
      // ambiguous so Helen can route it manually.
      var unique = candidates[0];
      if (emailDates && emailDates.size > 0) {
        var withinTolerance = false;
        var checkIn = unique.Check_in_Date ? new Date(unique.Check_in_Date) : null;
        var checkOut = unique.Check_out_Date ? new Date(unique.Check_out_Date) : null;
        emailDates.forEach(function(iso) {
          var d = new Date(iso);
          if (isNaN(d)) return;
          if (checkIn && Math.abs(d - checkIn) / 86400000 <= 60) withinTolerance = true;
          if (checkOut && Math.abs(d - checkOut) / 86400000 <= 60) withinTolerance = true;
        });
        if (!withinTolerance) {
          // Don't return — record this lodge as ambiguous and let the
          // outer logic fall through to unmatched (or Tier 4 sender).
          ambiguousLodge = name;
          continue;
        }
      }
      return { booking: unique, method: 'lodge_name_unique' };
    }

    // Multiple candidates — Sep 26 Group A/B disambiguation
    // Pre-new-protocol emails use "Group A" (FoSA 11 Sep 26) and "Group B" (FoSA 9 Sep 26)
    var groupFiltered = candidates;
    var groupAMatch = /group\s*a\b/i.test(subj);
    var groupBMatch = /group\s*b\b/i.test(subj);
    if (groupAMatch || groupBMatch) {
      var targetTour = groupAMatch ? 'FoSA 11 Sep' : 'FoSA 9 Sep';
      var filtered = candidates.filter(function(c) {
        var tourName = (c.Tour && c.Tour.name) || c.Tour || '';
        return tourName.indexOf(targetTour) !== -1;
      });
      if (filtered.length === 1) {
        return { booking: filtered[0], method: 'group_ab_' + (groupAMatch ? 'a' : 'b') };
      }
      if (filtered.length > 0) groupFiltered = filtered;
    }

    // Score remaining candidates by date overlap
    var best = null;
    var bestScore = 0;
    for (var ci = 0; ci < groupFiltered.length; ci++) {
      var c = groupFiltered[ci];
      var score = dateMatchScore(emailDates, c.Check_in_Date, c.Check_out_Date);
      if (score > bestScore) { bestScore = score; best = c; }
    }

    if (best && bestScore > 0) {
      return { booking: best, method: 'lodge_name_date_score_' + bestScore };
    }

    ambiguousLodge = name;
  }

  // 4. Sender email → lodge lookup + date scoring
  // This catches emails where the lodge name doesn't appear in the subject
  // (e.g. generic subjects like "Re: Booking") but the sender email is known.
  if (emailMap) {
    var senderAddr = extractEmailAddress(frm);
    if (senderAddr && emailMap[senderAddr]) {
      var lodgeName = emailMap[senderAddr];
      var lodgeKey = lodgeName.split(' - ')[0].toLowerCase().trim();
      var senderCandidates = nameMap[lodgeKey];

      if (senderCandidates && senderCandidates.length > 0) {
        if (senderCandidates.length === 1) {
          // Same safety check as lodge_name_unique — don't blindly
          // route to the only known booking when the email mentions
          // dates that are far from that booking's stay window.
          var senderUnique = senderCandidates[0];
          if (emailDates && emailDates.size > 0) {
            var senderInTolerance = false;
            var sCheckIn = senderUnique.Check_in_Date ? new Date(senderUnique.Check_in_Date) : null;
            var sCheckOut = senderUnique.Check_out_Date ? new Date(senderUnique.Check_out_Date) : null;
            emailDates.forEach(function(iso) {
              var d = new Date(iso);
              if (isNaN(d)) return;
              if (sCheckIn && Math.abs(d - sCheckIn) / 86400000 <= 60) senderInTolerance = true;
              if (sCheckOut && Math.abs(d - sCheckOut) / 86400000 <= 60) senderInTolerance = true;
            });
            if (!senderInTolerance) {
              return {
                booking: null,
                method: 'unmatched',
                reason: 'sender_email_unique_but_dates_conflict',
                lodge: lodgeName,
              };
            }
          }
          return { booking: senderUnique, method: 'sender_email_unique' };
        }

        // Multiple bookings at this lodge — use date scoring
        var senderBest = null;
        var senderBestScore = 0;
        for (var si = 0; si < senderCandidates.length; si++) {
          var sc = senderCandidates[si];
          var sScore = dateMatchScore(emailDates, sc.Check_in_Date, sc.Check_out_Date);
          if (sScore > senderBestScore) { senderBestScore = sScore; senderBest = sc; }
        }
        if (senderBest && senderBestScore > 0) {
          return { booking: senderBest, method: 'sender_email_date_score_' + senderBestScore };
        }

        // Date scoring failed — if there's only one future booking, use that
        var now = new Date().toISOString().split('T')[0];
        var futureCandidates = senderCandidates.filter(function(c) {
          return (c.Check_in_Date || '') >= now;
        });
        if (futureCandidates.length === 1) {
          return { booking: futureCandidates[0], method: 'sender_email_single_future' };
        }

        return {
          booking: null,
          method: 'unmatched',
          reason: 'sender_email_matched_lodge_but_ambiguous_date',
          lodge: lodgeName,
        };
      }
    }
  }

  if (ambiguousLodge) {
    return {
      booking: null,
      method: 'unmatched',
      reason: 'lodge_name_ambiguous_no_date_match',
      lodge: ambiguousLodge,
    };
  }

  return { booking: null, method: 'unmatched', reason: 'no_lodge_name_match' };
}
