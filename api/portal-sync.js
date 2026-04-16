import { zohoApi } from './_zoho.js';

var SUPABASE_URL = process.env.SUPABASE_URL;
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function supabaseGet(path) {
  var r = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
    }
  });
  if (!r.ok) throw new Error('Supabase error: ' + r.status);
  return r.json();
}

async function supabasePatch(path, body) {
  var r = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    var t = await r.text();
    throw new Error('Supabase patch error: ' + r.status + ' ' + t);
  }
  return true;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var tourName = (req.query && req.query.tour) || (req.body && req.body.tour);
  if (!tourName) return res.status(400).json({ error: 'tour name required' });

  // ── GET: compare Zoho vs Supabase ──────────────────────────────────────
  if (req.method === 'GET') {
    try {
      // 1. Fetch Zoho lodge bookings for this tour — Guest type only, no Z-day prefixes
      var fields = 'Name,Lodge_Name,Check_in_Date,Day_Description,Booking_Type,Meals,Route_Narrative,id';
      var criteria = '(Tour.name:equals:' + tourName + ')';
      var zohoResult = await zohoApi('GET',
        'Lodge_Bookings/search?criteria=' + encodeURIComponent(criteria) +
        '&fields=' + fields + '&per_page=200'
      );
      var allZoho = (zohoResult && zohoResult.data) || [];




      // Filter: Guest type only (default), no Z-day prefixes, no blank day descriptions
      // Include Guest + Excursion (not Guide/Pre-tour/Z-day) then sort Excursion first
      // so Guest records always overwrite Excursion for the same day number
      var relevantBookings = allZoho.filter(function(b) {
        var type = b.Booking_Type; // no fallback — blank means unclassified, skip
        var desc = b.Day_Description || '';
        return type && type !== 'Guide' && type !== 'Pre-tour' &&
               !desc.startsWith('Z ') && !desc.startsWith('z ');
      });
      var statusPriority = function(b) {
        var s = b.Status || b.Booking_Status || '';
        if (s === 'Balance Paid' || s === 'Confirmed') return 3;
        if (s === 'Deposit Paid') return 2;
        if (s === 'Waitlisted' || s === 'Not Available' || s === 'Cancelled') return 0;
        return 1;
      };

      relevantBookings.sort(function(a, b) {
        var ta = a.Booking_Type || 'Guest';
        var tb = b.Booking_Type || 'Guest';
        // Excursion sorts first (lowest priority — will be overwritten by Guest)
        if (ta === 'Excursion' && tb !== 'Excursion') return -1;
        if (ta !== 'Excursion' && tb === 'Excursion') return 1;
        // Among Guest bookings, lower status priority sorts first (so higher priority overwrites)
        return statusPriority(a) - statusPriority(b);
      });
      var guestBookings = relevantBookings;

      var zohoByDay = {};
      guestBookings.forEach(function(b) {
        var desc = b.Day_Description || '';
        var match = desc.match(/Day\s+(\d+):/i);
        var dayNum = match ? parseInt(match[1], 10) : null;
        if (dayNum === null || dayNum < 1) return;
        // If multiple guest bookings on same day, keep the one with highest status priority
        // (shouldn't happen once Booking_Type is correctly set, but just in case)
        var bookingType = b.Booking_Type || 'Guest';
        // Guest always overwrites Excursion for the same day; pure Excursion days show no lodge
        var existing = zohoByDay[dayNum];
        var existingType = existing ? (existing.booking_type || 'Guest') : null;
        if (!existing || (existingType !== 'Guest' && bookingType === 'Guest')) {
          zohoByDay[dayNum] = {
            day: dayNum,
            lodge: (b.Lodge_Name || (b.Name || '').split(' - ')[0] || '').trim(),
            check_in: b.Check_in_Date || '',
            zoho_id: b.id,
            meals: b.Meals || '',
            day_description: b.Day_Description || '',
            narrative: (b.Route_Narrative || '').trim(),
            booking_type: bookingType,
          };
        }
      });



      // 2. Fetch Supabase itinerary for this tour
      var supaRows = await supabaseGet(
        'itinerary?tour_name=eq.' + encodeURIComponent(tourName) +
        '&order=day.asc&select=id,day,lodge,title,type,description'
      );

      var supaByDay = {};
      (supaRows || []).forEach(function(r) {
        if (r.type && r.type.toLowerCase().startsWith('welcome')) return;
        supaByDay[r.day] = { id: r.id, day: r.day, lodge: (r.lodge || '').trim(), title: r.title, description: r.description || '' };
      });

      // Remove any days where only an Excursion record was found (no Guest overwrite)
      Object.keys(zohoByDay).forEach(function(day) {
        if (zohoByDay[day].booking_type === 'Excursion') {
          delete zohoByDay[day];
        }
      });

      // 3. Build comparison
      var allDays = new Set([
        ...Object.keys(zohoByDay).map(Number),
        ...Object.keys(supaByDay).map(Number),
      ]);

      var rows = [];
      Array.from(allDays).sort(function(a, b) { return a - b; }).forEach(function(day) {
        var zoho = zohoByDay[day];
        var supa = supaByDay[day];
        var zLodge = zoho ? zoho.lodge : null;
        var sLodge = supa ? supa.lodge : null;
        var match = zLodge && sLodge && zLodge === sLodge;
        // Extract route segment from Zoho Day_Description e.g. "Day 01: Arrive Cape Town" -> "Arrive Cape Town"
        var zohoDesc = zoho ? (zoho.day_description || '') : '';
        var routeMatch = zohoDesc.match(/Day\s*\d+[:\-]?\s*(.+)/i);
        var routeLabel = routeMatch ? routeMatch[1].trim() : (supa ? supa.title : ('Day ' + day));
        rows.push({
          day: day,
          title: routeLabel,
          zoho_lodge: zLodge,
          supabase_lodge: sLodge,
          match: match,
          supabase_id: supa ? supa.id : null,
          zoho_id: zoho ? zoho.zoho_id : null,
          check_in: zoho ? zoho.check_in : null,
          zoho_narrative: zoho ? zoho.narrative : '',
          supabase_narrative: supa ? (supa.description || '') : '',
          tour_prefix: tourName.split(' ')[0],
          day_description: zoho ? zoho.day_description : '',
        });
      });

      var mismatches = rows.filter(function(r) { return !r.match; }).length;

      return res.status(200).json({
        tour: tourName,
        total: rows.length,
        mismatches: mismatches,
        rows: rows,
      });

    } catch (err) {
      console.error('portal-sync GET error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── POST: write Zoho lodge data to Supabase ─────────────────────────────
  if (req.method === 'POST') {
    var body = req.body || {};

    // Manual override — write a specific lodge name directly to Supabase
    if (body.override) {
      var ov = body.override;
      if (!ov.supabase_id || !ov.lodge) return res.status(400).json({ error: 'supabase_id and lodge required' });
      try {
        var patch = { updated_at: new Date().toISOString() };
        if (ov.lodge !== undefined) patch.lodge = ov.lodge;
        if (ov.narrative !== undefined) patch.description = ov.narrative;
        await supabasePatch('itinerary?id=eq.' + ov.supabase_id, patch);
        return res.status(200).json({ done: true, day: ov.day });
      } catch(err) {
        return res.status(500).json({ error: err.message });
      }
    }

    // Optionally sync only specific days, or all mismatches
    var daysToSync = body.days || null; // array of day numbers, or null = all

    try {
      // Re-fetch comparison
      var fields = 'Name,Lodge_Name,Check_in_Date,Day_Description,Booking_Type,Meals,Route_Narrative,id';
      var criteria = '(Tour.name:equals:' + tourName + ')';
      var zohoResult = await zohoApi('GET',
        'Lodge_Bookings/search?criteria=' + encodeURIComponent(criteria) +
        '&fields=' + fields + '&per_page=200'
      );
      var allZoho = (zohoResult && zohoResult.data) || [];

      var relevantBookings = allZoho.filter(function(b) {
        var type = b.Booking_Type; // no fallback — blank means unclassified, skip
        var desc = b.Day_Description || '';
        return type && type !== 'Guide' && type !== 'Pre-tour' &&
               !desc.startsWith('Z ') && !desc.startsWith('z ');
      });
      relevantBookings.sort(function(a, b) {
        var ta = a.Booking_Type || 'Guest';
        var tb = b.Booking_Type || 'Guest';
        if (ta === 'Excursion' && tb !== 'Excursion') return -1;
        if (ta !== 'Excursion' && tb === 'Excursion') return 1;
        return 0;
      });
      var guestBookings = relevantBookings;

      var zohoByDay = {};
      guestBookings.forEach(function(b) {
        var desc = b.Day_Description || '';
        var match = desc.match(/Day\s+(\d+):/i);
        var dayNum = match ? parseInt(match[1], 10) : null;
        if (dayNum === null || dayNum < 1) return;
        if (!zohoByDay[dayNum]) {
          zohoByDay[dayNum] = { day: dayNum, lodge: (b.Lodge_Name || (b.Name || '').split(' - ')[0] || '').trim(), narrative: (b.Route_Narrative || '').trim() };
        }
      });

      var supaRows = await supabaseGet(
        'itinerary?tour_name=eq.' + encodeURIComponent(tourName) +
        '&order=day.asc&select=id,day,lodge,type'
      );

      var results = [];
      for (var i = 0; i < supaRows.length; i++) {
        var row = supaRows[i];
        if (row.type && row.type.toLowerCase().startsWith('welcome')) continue;
        if (daysToSync && daysToSync.indexOf(row.day) === -1) continue;
        var zohoData = zohoByDay[row.day];
        if (!zohoData) {
          results.push({ day: row.day, status: 'no_zoho_data' });
          continue;
        }
        if (zohoData.lodge === (row.lodge || '').trim()) {
          results.push({ day: row.day, status: 'already_correct', lodge: zohoData.lodge });
          continue;
        }
        var patchBody = { lodge: zohoData.lodge, updated_at: new Date().toISOString() };
        if (zohoData.narrative) patchBody.description = zohoData.narrative;
        await supabasePatch('itinerary?id=eq.' + row.id, patchBody);
        results.push({ day: row.day, status: 'updated', old: row.lodge, new: zohoData.lodge });
      }

      var updated = results.filter(function(r) { return r.status === 'updated'; }).length;
      return res.status(200).json({ tour: tourName, updated: updated, results: results });

    } catch (err) {
      console.error('portal-sync POST error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
