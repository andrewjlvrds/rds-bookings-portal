import { zohoApi } from './_zoho.js';

export default async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    var fields = [
      'Name','Lodge_Name','Check_in_Date','Check_out_Date','Nights','Status',
      'Pax_in_Single_Rooms','Pax_in_Shared_Double','Pax_in_Shared_Twin',
      'Number_of_guides','Single_Rooms','Shared_Twin_Rooms','Shared_Double_Rooms',
      'Guide_Rooms','Sgl_Twin_Dbl_Guides','Meals','Total_Amount','Deposit_Amount',
      'Lodge_Currency','Booking_Reference','Booking_Notes','Reservation_Comments',
      'Lodge_Availability','Lodge','Lodge_Contact','Lodge_ID','Tour',
      'Claude_Confidence','Claude_Updated_Time','Updated_by',
      'Follow_up_Date','Excursion','Excursion_booking_status','Excursion_Date','Excursion_notes',
      'Deposit_Due_Date','Second_Payment_Amount','Second_Payment_Due_Date',
      'Third_Payment_Amount','Third_Payment_Due_Date',
      'Fourth_Payment_Amount','Fourth_Payment_Due_Date',
      'Email','Contact_Name','Exchange_Rate','Currency',
      'Day_Description','Km','id'
    ].join(',');

    var allBookings = [];
    var page = 1;
    var hasMore = true;

    while (hasMore && page <= 5) {
      var result = await zohoApi('GET',
        'Lodge_Bookings?fields=' + fields +
        '&sort_by=Check_in_Date&sort_order=asc&per_page=200&page=' + page
      );

      var data = result.data || [];
      allBookings = allBookings.concat(data);
      hasMore = result.info && result.info.more_records;
      page++;
    }

    var tourMap = {};
    allBookings.forEach(function(bk) {
      var tourId = '';
      var tourName = '';

      if (bk.Tour) {
        if (typeof bk.Tour === 'object') {
          tourId = bk.Tour.id || '';
          tourName = bk.Tour.name || '';
        } else {
          tourId = bk.Tour;
          tourName = bk.Tour;
        }
      }

      if (!tourId) {
        tourId = 'unassigned';
        tourName = 'Unassigned Bookings';
      }

      if (!tourMap[tourId]) {
        tourMap[tourId] = { id: tourId, name: tourName, bookings: [] };
      }

      var lodgeId = '';
      if (bk.Lodge) {
        lodgeId = typeof bk.Lodge === 'object' ? bk.Lodge.id : bk.Lodge;
      }

      tourMap[tourId].bookings.push(Object.assign({}, bk, {
        lodge_id: lodgeId,
        lodge_email: bk.Email || '',
        tour_id: tourId,
        tour_name: tourName,
      }));
    });

    var tours = Object.values(tourMap);
    tours.sort(function(a, b) {
      var aDate = a.bookings[0] ? a.bookings[0].Check_in_Date || '' : '';
      var bDate = b.bookings[0] ? b.bookings[0].Check_in_Date || '' : '';
      var now = new Date().toISOString().split('T')[0];
      var aFuture = aDate >= now;
      var bFuture = bDate >= now;
      if (aFuture && !bFuture) return -1;
      if (!aFuture && bFuture) return 1;
      if (aFuture) return aDate.localeCompare(bDate);
      return bDate.localeCompare(aDate);
    });

    tours.forEach(function(tour) {
      var bks = tour.bookings;
      tour.count = bks.length;
      tour.confirmed = bks.filter(function(b) { return b.Status === 'Confirmed' || b.Status === 'Deposit Paid' || b.Status === 'Paid in Full' }).length;
      tour.start_date = bks.length ? bks[0].Check_in_Date : null;
      tour.end_date = bks.length ? bks[bks.length - 1].Check_out_Date : null;
    });

    res.status(200).json({
      tours: tours,
      total_bookings: allBookings.length,
      total_tours: tours.length,
    });

  } catch(err) {
    if (err.message && (err.message.indexOf('204') > -1 || err.message.indexOf('No Content') > -1)) {
      return res.status(200).json({ tours: [], total_bookings: 0, total_tours: 0 });
    }
    console.error('bp-data error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
