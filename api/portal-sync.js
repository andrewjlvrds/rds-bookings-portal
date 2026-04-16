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
      var guestBookings = allZoho.filter(function(b) {
        var type = b.Booking_Type || 'Guest';
        var desc = b.Day_Description || '';
        return type === 'Guest' && !desc.startsWith('Z ') && !desc.startsWith('z ');
      });

      // Extract day number from Day_Description e.g. "Day 01: Arrive Cape Town" -> 1
      var zohoByDay = {};
      guestBookings.forEach(function(b) {
        var desc = b.Day_Description || '';
        var match = desc.match(/Day\s+(\d+):/i);
        var dayNum = match ? parseInt(match[1], 10) : null;
        if (dayNum === null) return;
        // If multiple guest bookings on same day, keep the one with highest status priority
        // (shouldn't happen once Booking_Type is correctly set, but just in case)
        if (!zohoByDay[dayNum]) {
          zohoByDay[dayNum] = {
            day: dayNum,
            lodge: (b.Lodge_Name || '').trim(),
            check_in: b.Check_in_Date || '',
            zoho_id: b.id,
            meals: b.Meals || '',
          };
        }
      });

      // 2. Fetch Supabase itinerary for this tour
      var supaRows = await supabaseGet(
        'itinerary?tour_name=eq.' + encodeURIComponent(tourName) +
        '&order=day.asc&select=id,day,lodge,title,type'
      );

      var supaByDay = {};
      (supaRows || []).forEach(function(r) {
        if (r.type && r.type.toLowerCase().startsWith('welcome')) return;
        supaByDay[r.day] = { id: r.id, day: r.day, lodge: (r.lodge || '').trim(), title: r.title };
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
        rows.push({
          day: day,
          title: supa ? supa.title : (zoho ? ('Day ' + day) : ''),
          zoho_lodge: zLodge,
          supabase_lodge: sLodge,
          match: match,
          supabase_id: supa ? supa.id : null,
          zoho_id: zoho ? zoho.zoho_id : null,
          check_in: zoho ? zoho.check_in : null,
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

      var guestBookings = allZoho.filter(function(b) {
        var type = b.Booking_Type || 'Guest';
        var desc = b.Day_Description || '';
        return type === 'Guest' && !desc.startsWith('Z ') && !desc.startsWith('z ');
      });

      var zohoByDay = {};
      guestBookings.forEach(function(b) {
        var desc = b.Day_Description || '';
        var match = desc.match(/Day\s+(\d+):/i);
        var dayNum = match ? parseInt(match[1], 10) : null;
        if (dayNum === null) return;
        if (!zohoByDay[dayNum]) {
          zohoByDay[dayNum] = { day: dayNum, lodge: (b.Lodge_Name || '').trim(), narrative: (b.Route_Narrative || '').trim() };
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
