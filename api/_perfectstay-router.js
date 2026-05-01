import { zohoApi } from './_zoho.js';

/*
 * Perfectstay router.
 *
 * Perfectstay (bookings@perfectstay.org) is a property-management service
 * that sends "Your Check in details" templates to bookings@ridedownsouth.com
 * because that's the email address used to make guest reservations under
 * managed properties (currently Desert Sands BnB in Swakopmund, possibly
 * others in future). These templates contain the lodge name and check-in
 * date in the body text. With those two values we can route them to the
 * correct Lodge_Booking record automatically instead of leaving Helen to
 * triage 30+ HTML-soup emails.
 *
 * Strategy:
 *   1. extractCheckInDate(body)  — pull the "Check in <weekday>, <DD month YYYY>" line
 *   2. extractLodgeName(body, lodges)  — find the lodge name by cross-
 *      referencing the email body against the known lodges directory
 *   3. findBookingForLodgeAndDate(lodgeId, isoDate)  — Zoho lookup,
 *      single-match routes, anything ambiguous goes to unmatched
 *
 * If date or lodge can't be parsed → return null and let normal matching run.
 * Conservative — better to leave one in unmatched than misroute it.
 */

const PERFECTSTAY_SENDER = 'bookings@perfectstay.org';

export function isPerfectstayEmail(from) {
  if (!from) return false;
  return from.toLowerCase().indexOf(PERFECTSTAY_SENDER) > -1;
}

const MONTHS = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

/**
 * Extract the check-in date from a Perfectstay body. Looks for the
 * pattern "Check in <weekday>, <day> <month> <year>".
 *
 * Returns 'YYYY-MM-DD' or null.
 */
export function extractCheckInDate(body) {
  if (!body || typeof body !== 'string') return null;

  // Pattern: "Check in Saturday, 2 May 2026"
  // Tolerate odd whitespace, optional comma, day before/after month.
  // Day numeric 1-31, month name, year 4 digits.
  var patterns = [
    // "Check in <day-name>, <day> <month> <year>"
    /check\s*in[\s\S]{0,40}?(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i,
    // "Check-in: <day> <month> <year>"
    /check[-\s]*in[:\s]+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i,
  ];

  for (var p = 0; p < patterns.length; p++) {
    var m = body.match(patterns[p]);
    if (m) {
      var day = parseInt(m[1], 10);
      var monthName = m[2].toLowerCase();
      var year = parseInt(m[3], 10);
      var month = MONTHS[monthName];
      if (month && day >= 1 && day <= 31 && year >= 2020 && year <= 2099) {
        var iso = year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
        return iso;
      }
    }
  }

  return null;
}

/**
 * Find the lodge name in an email body by cross-referencing against
 * the known lodges directory. Returns the matched lodge record or null.
 *
 * Strategy:
 *   1. Authoritative signal first: "welcome to <lodge>" / "details on <lodge>"
 *      — Perfectstay's own templates name the booking's property in these
 *      lines. Other mentions in the body (Reception, Wifi, parking) refer
 *      to the shared physical operation, not the booked property.
 *   2. If no authoritative signal matches a known lodge, fall back to
 *      occurrence-count across the whole body.
 *
 * This matters for Perfectstay's Swakopmund operation, where 'Desert Sands'
 * and 'Studio Apartment Self Catering' are both bookable properties run
 * by the same outfit and both names appear in every email body.
 */
export function extractLodgeFromBody(body, lodges) {
  if (!body || !Array.isArray(lodges) || lodges.length === 0) return null;

  var bodyLower = body.toLowerCase();

  // Pass 1 — authoritative signals. Look for the welcome line and the
  // "details on <lodge>" line that Perfectstay's templates use to name
  // the actual property the guest is booked into.
  var authoritativePatterns = [
    /welcome\s+to\s+([^!.\n]{3,80})/i,
    /details\s+on\s+([^!.\n]{3,80})\s*click\s*here/i,
    /your\s+stay\s+at\s+([^!.\n]{3,80})/i,
  ];

  for (var ap = 0; ap < authoritativePatterns.length; ap++) {
    var m = body.match(authoritativePatterns[ap]);
    if (!m) continue;
    var phrase = m[1].toLowerCase().trim();
    // Find the longest known lodge name that appears within the matched phrase
    var bestAuth = null;
    for (var li = 0; li < lodges.length; li++) {
      var lodge = lodges[li];
      if (!lodge || !lodge.Name) continue;
      var nameLower = lodge.Name.toLowerCase().trim();
      if (nameLower.length < 4) continue;
      if (phrase.indexOf(nameLower) > -1) {
        if (!bestAuth || nameLower.length > bestAuth.nameLen) {
          bestAuth = { lodge: lodge, nameLen: nameLower.length };
        }
      }
    }
    if (bestAuth) return bestAuth.lodge;
  }

  // Pass 2 — fall back to occurrence count across the whole body
  var candidates = [];
  for (var i = 0; i < lodges.length; i++) {
    var lodge2 = lodges[i];
    if (!lodge2 || !lodge2.Name) continue;
    var n = lodge2.Name.toLowerCase().trim();
    if (n.length < 4) continue;

    var occurrences = 0;
    var idx = 0;
    while ((idx = bodyLower.indexOf(n, idx)) !== -1) {
      occurrences++;
      idx += n.length;
    }
    if (occurrences > 0) {
      candidates.push({ lodge: lodge2, occurrences: occurrences, nameLength: n.length });
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort(function(a, b) {
    if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
    return b.nameLength - a.nameLength;
  });

  return candidates[0].lodge;
}

/**
 * Given a lodge record and an ISO check-in date, find the matching
 * Lodge_Booking in Zoho. Returns the booking record or null.
 *
 * Returns null if zero or multiple matches found — caller falls back
 * to unmatched bucket so Helen can route manually.
 */
export async function findBookingForLodgeAndDate(lodge, isoDate) {
  if (!lodge || !lodge.id || !isoDate) return null;

  try {
    // Search by Lodge lookup ID + check-in date. Zoho COQL would be cleaner
    // but the search API supports composite criteria.
    var criteria = '((Lodge:equals:' + lodge.id + ')and(Check_in_Date:equals:' + isoDate + '))';
    var resp = await zohoApi('GET',
      'CustomModule6/search?criteria=' + encodeURIComponent(criteria) +
      '&fields=Name,Lodge_Name,Check_in_Date,Check_out_Date,Status'
    );

    if (!resp || !Array.isArray(resp.data) || resp.data.length === 0) return null;
    if (resp.data.length > 1) {
      console.log('perfectstay-router: ambiguous match — multiple bookings for lodge', lodge.Name, 'on', isoDate, '(' + resp.data.length + ' matches)');
      return null;
    }
    return resp.data[0];
  } catch (err) {
    console.error('perfectstay-router: Zoho lookup failed:', err.message);
    return null;
  }
}

/**
 * Top-level convenience: given a Perfectstay email + the lodges directory,
 * return { booking, reason } if we found a unique routing target,
 * otherwise { booking: null, reason: '...' } describing why we gave up.
 */
export async function routePerfectstayEmail(from, body, lodges) {
  if (!isPerfectstayEmail(from)) {
    return { booking: null, reason: 'not_perfectstay_sender' };
  }

  var isoDate = extractCheckInDate(body);
  if (!isoDate) {
    return { booking: null, reason: 'no_check_in_date_parsed' };
  }

  var lodge = extractLodgeFromBody(body, lodges);
  if (!lodge) {
    return { booking: null, reason: 'no_lodge_name_in_body' };
  }

  var booking = await findBookingForLodgeAndDate(lodge, isoDate);
  if (!booking) {
    return { booking: null, reason: 'no_unique_booking_for_lodge_and_date', lodge: lodge.Name, date: isoDate };
  }

  return {
    booking: booking,
    reason: 'matched',
    lodge: lodge.Name,
    date: isoDate,
    method: 'perfectstay_router',
  };
}
