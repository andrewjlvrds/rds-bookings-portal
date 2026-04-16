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
    console.log('itinerary-export: tour=' + tourName + ' filtered records=' + allBookings.length);

    // Filter and sort — same logic as portal-sync
    var relevant = allBookings.filter(function(b) {
      var type = b.Booking_Type;
      var desc = b.Day_Description || '';
      return type && type !== 'Guide' && type !== 'Pre-tour' &&
             !desc.startsWith('Z ') && !desc.startsWith('z ');
    });

    relevant.sort(function(a, b) {
      var ta = a.Booking_Type || 'Guest';
      var tb = b.Booking_Type || 'Guest';
      if (ta === 'Excursion' && tb !== 'Excursion') return -1;
      if (ta !== 'Excursion' && tb === 'Excursion') return 1;
      return 0;
    });

    // Build by day, Guest wins over Excursion
    var byDay = {};
    relevant.forEach(function(b) {
      var desc = b.Day_Description || '';
      var match = desc.match(/Day\s+(\d+):/i);
      var dayNum = match ? parseInt(match[1], 10) : null;
      if (!dayNum || dayNum < 1) return;
      var type = b.Booking_Type || 'Guest';
      var existing = byDay[dayNum];
      var existingType = existing ? (existing.booking_type || 'Guest') : null;
      if (!existing || (existingType !== 'Guest' && type === 'Guest')) {
        var routeMatch = desc.match(/Day\s*\d+[:\-]?\s*(.+)/i);
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

    console.log('itinerary-export: days returned=' + days.length);
    return res.status(200).json({ tour: tourName, days: days });

  } catch(err) {
    console.error('itinerary-export error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
