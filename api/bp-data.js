import { zohoApi } from './_zoho.js';

export default async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Step 1: Fetch all tours from the Tours module
    var tourFields = 'Name,Departure_Date,End_Date,Status,Tour_Type,' +
      'Guide_Rooms,Max_Guests,Number_of_riders,' +
      'Pax_in_Single_Rooms,Pax_in_Shared_Double_Rooms,Pax_in_Shared_Twin_Rooms,id';

    var allTours = [];
    try {
      var tourResult = await zohoApi('GET',
        'Tours?fields=' + tourFields + '&per_page=200'
      );
      allTours = (tourResult && tourResult.data) || [];
    } catch(tourErr) {
      console.error('Tours fetch error:', tourErr.message);
      // Continue without tour data — fall back to booking-derived tours
    }

    var tourMap = {};
    allTours.forEach(function(t) {
      tourMap[t.id] = {
        id: t.id,
        name: t.Name || '',
        departure_date: t.Departure_Date || null,
        end_date: t.End_Date || null,
        start_date: t.Departure_Date || null,
        tour_status: t.Status || '',
        tour_type: t.Tour_Type || '',
        guide_rooms: t.Guide_Rooms || 0,
        max_guests: t.Max_Guests || 0,
        num_riders: t.Number_of_riders || 0,
        pax_single: t.Pax_in_Single_Rooms || 0,
        pax_twin: t.Pax_in_Shared_Twin_Rooms || 0,
        pax_double: t.Pax_in_Shared_Double_Rooms || 0,
        bookings: [],
      };
    });

    // Step 2: Fetch all lodge bookings
    var bookingFields = [
      'Name','Lodge_Name','Check_in_Date','Check_out_Date','Nights','Status',
      'Sgl_Twin_Dbl_Guides','Meals','Total_Amount','Deposit_Amount',
      'Lodge_Currency','Booking_Reference','Payment_Stage','Reservation_Comments',
      'Lodge','Tour',
      'RDS_Reference','Lodge_Reference','Cancel_Free_Before',
      'Credit_Amount','Enquiry_Sent_Date','Last_Response_Date',
      'Follow_up_Date','Excursion','Excursion_booking_status','Excursion_Date','Excursion_notes',
      'Deposit_Due_Date','Second_Payment_Amount','Second_Payment_Due_Date',
      'Third_Payment_Amount','Third_Payment_Due_Date',
      'Deposit_Paid_Date','nd_Payment_Paid_Date','rd_Payment_Paid_Date','th_Payment_Paid_Date',
      'Deposit_Paid_Amount','nd_Payment_Paid_Amount','rd_Payment_Paid_Amount','th_Payment_Paid_Amount',
      'Fourth_Payment_Amount','Fourth_Payment_Due_Date',
      'Email','Contact_Name','Payment_Note',
      'Day_Description','Booking_Type','Lodge_Priority','New_Reply','id'
    ].join(',');

    var allBookings = [];
    var page = 1;
    var hasMore = true;

    while (hasMore && page <= 5) {
      var result = await zohoApi('GET',
        'Lodge_Bookings?fields=' + bookingFields +
        '&sort_by=Created_Time&sort_order=desc&per_page=200&page=' + page
      );

      var data = (result && result.data) || [];
      allBookings = allBookings.concat(data);
      hasMore = result && result.info && result.info.more_records;
      page++;
    }

    // Step 3: Assign bookings to tours
    var unassigned = { id: 'unassigned', name: 'Unassigned Bookings', bookings: [], departure_date: null };

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

      var lodgeId = '';
      if (bk.Lodge) {
        lodgeId = typeof bk.Lodge === 'object' ? bk.Lodge.id : bk.Lodge;
      }

      var enriched = Object.assign({}, bk, {
        lodge_id: lodgeId,
        lodge_email: bk.Email || '',
        tour_id: tourId,
        tour_name: tourName,
      });

      if (tourId && tourMap[tourId]) {
        tourMap[tourId].bookings.push(enriched);
      } else {
        unassigned.bookings.push(enriched);
      }
    });

    // Step 4: Build final tour list
    var tours = Object.values(tourMap);

    if (unassigned.bookings.length > 0) {
      tours.push(unassigned);
    }

    // Compute summary fields
    tours.forEach(function(tour) {
      var bks = tour.bookings;
      tour.count = bks.length;
      tour.confirmed = bks.filter(function(b) {
        return b.Status === 'Balance Paid' || b.Status === 'Deposit Paid' ||
               b.Status === 'Confirmed' || b.Status === 'Paid in Full';
      }).length;

      // Fall back to booking dates if tour has no departure_date
      if (!tour.start_date && bks.length > 0) {
        var sorted = bks.slice().sort(function(a, b) {
          return (a.Check_in_Date || '').localeCompare(b.Check_in_Date || '');
        });
        tour.start_date = sorted[0].Check_in_Date || null;
        tour.end_date = tour.end_date || sorted[sorted.length - 1].Check_out_Date || null;
      }
    });

    // Sort: future tours first by departure date, then past
    var now = new Date().toISOString().split('T')[0];
    tours.sort(function(a, b) {
      var aDate = a.departure_date || a.start_date || '';
      var bDate = b.departure_date || b.start_date || '';
      var aFuture = aDate >= now || !aDate;
      var bFuture = bDate >= now || !bDate;
      if (aFuture && !bFuture) return -1;
      if (!aFuture && bFuture) return 1;
      if (aFuture) return aDate.localeCompare(bDate);
      return bDate.localeCompare(aDate);
    });

    // Step 5: Fetch all lodges for the directory
    var allLodges = [];
    try {
      var lodgeFields = 'Name,Email,Preferred_Email,Email_Reservations_2,Email_Accounts,' +
        'Email_4,Secondary_Email,Contact_First_Name,Phone,Country,Status,Lodge_Currency,' +
        'STO_Discount,STO_Valid_From,STO_Valid_To,Guide_Room_Policy,id';

      var lodgePage = 1;
      var lodgeMore = true;
      while (lodgeMore && lodgePage <= 3) {
        var lodgeResult = await zohoApi('GET',
          'Lodges?fields=' + lodgeFields + '&per_page=200&page=' + lodgePage
        );
        var lodgeData = (lodgeResult && lodgeResult.data) || [];
        allLodges = allLodges.concat(lodgeData);
        lodgeMore = lodgeResult && lodgeResult.info && lodgeResult.info.more_records;
        lodgePage++;
      }
    } catch(lodgeErr) {
      console.error('Lodges fetch error:', lodgeErr.message);
    }

    // Build lodge directory: name → { email, id, etc }
    var lodgeDirectory = allLodges.map(function(l) {
      return {
        id: l.id,
        name: l.Name || '',
        email: l.Preferred_Email || l.Email || '',
        email2: l.Email_Reservations_2 || l.Secondary_Email || '',
        contact: l.Contact_First_Name || '',
        country: l.Country || '',
        status: l.Status || '',
        currency: l.Lodge_Currency || '',
        sto_discount: l.STO_Discount || '',
        guide_room_policy: l.Guide_Room_Policy || '',
      };
    });

    res.status(200).json({
      tours: tours,
      lodges: lodgeDirectory,
      total_bookings: allBookings.length,
      total_tours: tours.length,
      total_lodges: lodgeDirectory.length,
    });

  } catch(err) {
    if (err.message && (err.message.indexOf('204') > -1 || err.message.indexOf('No Content') > -1)) {
      return res.status(200).json({ tours: [], total_bookings: 0, total_tours: 0 });
    }
    console.error('bp-data error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
