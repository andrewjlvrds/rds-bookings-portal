// GET ?tour=FoSA 9 Sep 26
// Returns lodge bookings for a tour instance in itinerary format for admin CMS sync
import { zohoApi } from './_zoho.js';

export default async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  var tourName = req.query.tour;
  if (!tourName) return res.status(400).json({ error: 'tour required' });

  try {
    var fields = 'Name,Lodge_Name,Check_in_Date,Day_Description,Booking_Type,Meals,Route_Narrative,Tour,id';
    var allBookings = [];
    var page = 1;
    var hasMore = true;
    while (hasMore && page <= 5) {
      var result = await zohoApi('GET',
        'Lodge_Bookings?fields=' + fields + '&per_page=200&page=' + page
      );
      var data = (result && result.data) || [];
      allBookings = allBookings.concat(data);
      hasMore = result && result.info && result.info.more_records;
      page++;
    }
    // Filter to this tour by name
    allBookings = allBookings.filter(function(b) {
      var name = b.Tour ? (typeof b.Tour === 'object' ? b.Tour.name : b.Tour) : '';
      return name === tourName;
    });

    // Filter and sort — same logic as portal-sync
    // Supports both "Day N:" (standard) and "Day N - X:" (split/branching routes — e.g. Oddballs add-on)
    var relevant = allBookings.filter(function(b) {
      var type = b.Booking_Type || '';
      var desc = b.Day_Description || '';
      // Allow blank Booking_Type (treat as Guest), exclude Guide/Pre-tour/Z-day
      return type !== 'Guide' && type !== 'Pre-tour' &&
             !desc.startsWith('Z ') && !desc.startsWith('z ') &&
             desc.match(/Day\s+\d+(\s*-\s*\d+)?\s*:/i); // must have a day number (supports "Day N:" or "Day N - X:")
    });

    relevant.sort(function(a, b) {
      var ta = a.Booking_Type || 'Guest';
      var tb = b.Booking_Type || 'Guest';
      if (ta === 'Excursion' && tb !== 'Excursion') return -1;
      if (ta !== 'Excursion' && tb === 'Excursion') return 1;
      return 0;
    });

    // Build by day, Guest wins over Excursion
    // For split-route days (Day 15 - 1, Day 15 - 2), "- 1" is the standard route and wins.
    // "- 2" represents an optional branching route (e.g. Oddballs add-on) and is excluded from the main itinerary.
    var byDay = {};
    relevant.forEach(function(b) {
      var desc = b.Day_Description || '';
      var match = desc.match(/Day\s+(\d+)(?:\s*-\s*(\d+))?\s*:/i);
      if (!match) return;
      var dayNum = parseInt(match[1], 10);
      var splitNum = match[2] ? parseInt(match[2], 10) : null;
      if (!dayNum || dayNum < 1) return;
      // Skip split-route "- 2" and higher — only the canonical standard route ("- 1" or unnumbered) goes into the main itinerary
      if (splitNum && splitNum > 1) return;
      var type = b.Booking_Type || 'Guest'; // blank = treat as Guest
      var existing = byDay[dayNum];
      var existingType = existing ? (existing.booking_type || 'Guest') : null;
      if (!existing || (existingType !== 'Guest' && type === 'Guest')) {
        // Extract title after "Day N:" or "Day N - X:"
        var routeMatch = desc.match(/Day\s+\d+(?:\s*-\s*\d+)?\s*[:\-]?\s*(.+)/i);
        byDay[dayNum] = {
          day: dayNum,
          title: routeMatch ? routeMatch[1].trim() : ('Day ' + dayNum),
          lodge: (b.Lodge_Name || (b.Name || '').split(' - ')[0] || '').trim(),
          meals: b.Meals || '',
          narrative: (b.Route_Narrative || '').trim(),
          booking_type: type,
        };
      }
    });

    // Remove excursion-only days
    Object.keys(byDay).forEach(function(d) {
      if (byDay[d].booking_type === 'Excursion') delete byDay[d];
    });

    var days = Object.keys(byDay).map(Number).sort(function(a, b) { return a - b; })
      .map(function(d) { return byDay[d]; });

    return res.status(200).json({ tour: tourName, days: days });

  } catch(err) {
    console.error('itinerary-export error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
