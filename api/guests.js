import { zohoApi } from './_zoho.js';

export default async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Guest-relevant fields from the Bookings module (CustomModule4)
    var fields = [
      'Name','First_Name','Last_Name','Email','Phone',
      'Tour_Name','Tour','Tour_start_date','Tour_end_date',
      'Booking_Status','Participant_Type',
      'Room_Type','Room_Sharing_With',
      'Motorcycle','Motorcycle_Preference',
      'Booking_Amount','Amount_Paid','Balance_Due',
      'Nationality','Passport_Number','Date_of_Birth',
      'Dietary_Requirements','Medical_Information',
      'Emergency_Contact_Name','Emergency_Contact_Number',
      'Pre_Tour_Accommodation','Pre_Tour_Accommodation_Notes',
      'Post_Tour_Accommodation','Post_Tour_Accommodation_Notes',
      'Excursions','Excursion_Notes',
      'Arrival_Flight_Details','Departure_Flight_Details',
      'Airport_Transfers_Required','Additional_Transfers_Required',
      'T_Shirt_Size','Notes','Special_Requests',
      'Rider_Portal_Status',
      'id'
    ].join(',');

    var allBookings = [];
    var page = 1;
    var hasMore = true;
    var apiError = null;
    var usedModule = 'Bookings';

    while (hasMore && page <= 5) {
      try {
        var result = await zohoApi('GET',
          'Bookings?fields=' + fields +
          '&sort_by=Created_Time&sort_order=desc&per_page=200&page=' + page
        );
        if (!result || !result.data) {
          if (page === 1) {
            console.log('Bookings returned no data, trying CustomModule4...');
            usedModule = 'CustomModule4';
            result = await zohoApi('GET',
              'CustomModule4?fields=' + fields +
              '&sort_by=Created_Time&sort_order=desc&per_page=200&page=' + page
            );
          }
          if (!result || !result.data) {
            apiError = 'No data returned from Zoho Bookings module.';
            break;
          }
        }
        var data = result.data || [];
        allBookings = allBookings.concat(data);
        hasMore = result.info && result.info.more_records;
        page++;
      } catch (fetchErr) {
        // If field doesn't exist, Zoho returns an error — retry with fewer fields
        if (page === 1 && fetchErr.message && fetchErr.message.indexOf('invalid') > -1) {
          console.log('Some fields may not exist, trying minimal field set...');
          var minFields = [
            'Name','First_Name','Last_Name','Email','Phone',
            'Tour_Name','Tour','Tour_start_date','Tour_end_date',
            'Booking_Status','Booking_Amount','Amount_Paid','Balance_Due',
            'Arrival_Flight_Details','Departure_Flight_Details',
            'Airport_Transfers_Required','Additional_Transfers_Required',
            'Notes','id'
          ].join(',');
          try {
            result = await zohoApi('GET',
              usedModule + '?fields=' + minFields +
              '&sort_by=Created_Time&sort_order=desc&per_page=200&page=1'
            );
            if (result && result.data) {
              allBookings = result.data;
              apiError = 'Using minimal fields — some guest fields may not exist in Zoho yet.';
              hasMore = result.info && result.info.more_records;
              page = 2;
              // Continue pagination with minimal fields
              while (hasMore && page <= 5) {
                result = await zohoApi('GET',
                  usedModule + '?fields=' + minFields +
                  '&sort_by=Created_Time&sort_order=desc&per_page=200&page=' + page
                );
                if (result && result.data) {
                  allBookings = allBookings.concat(result.data);
                  hasMore = result.info && result.info.more_records;
                }
                page++;
              }
              break;
            }
          } catch (minErr) {
            apiError = minErr.message;
          }
          break;
        }
        apiError = fetchErr.message;
        console.error('guests fetch error page ' + page + ':', fetchErr.message);
        break;
      }
    }

    // Process guests — enrich with computed fields
    var guests = allBookings.map(function(bk) {
      var tourRef = bk.Tour;
      var tourId = '';
      var tourName = bk.Tour_Name || '';
      if (tourRef) {
        if (typeof tourRef === 'object') {
          tourId = tourRef.id || '';
          tourName = tourName || tourRef.name || '';
        } else {
          tourId = tourRef;
        }
      }

      return {
        id: bk.id,
        name: [bk.First_Name, bk.Last_Name].filter(Boolean).join(' ') || bk.Name || '',
        first_name: bk.First_Name || '',
        last_name: bk.Last_Name || '',
        email: bk.Email || '',
        phone: bk.Phone || '',
        tour_id: tourId,
        tour_name: tourName,
        tour_start: bk.Tour_start_date || '',
        tour_end: bk.Tour_end_date || '',
        status: bk.Booking_Status || '',
        participant_type: bk.Participant_Type || '',
        room_type: bk.Room_Type || '',
        room_sharing: bk.Room_Sharing_With || '',
        motorcycle: bk.Motorcycle || bk.Motorcycle_Preference || '',
        booking_amount: bk.Booking_Amount || '',
        amount_paid: bk.Amount_Paid || '',
        balance_due: bk.Balance_Due || '',
        nationality: bk.Nationality || '',
        passport: bk.Passport_Number || '',
        dob: bk.Date_of_Birth || '',
        dietary: bk.Dietary_Requirements || '',
        medical: bk.Medical_Information || '',
        emergency_name: bk.Emergency_Contact_Name || '',
        emergency_phone: bk.Emergency_Contact_Number || '',
        pre_tour_accom: bk.Pre_Tour_Accommodation || '',
        pre_tour_notes: bk.Pre_Tour_Accommodation_Notes || '',
        post_tour_accom: bk.Post_Tour_Accommodation || '',
        post_tour_notes: bk.Post_Tour_Accommodation_Notes || '',
        excursions: bk.Excursions || '',
        excursion_notes: bk.Excursion_Notes || '',
        arrival_flight: bk.Arrival_Flight_Details || '',
        departure_flight: bk.Departure_Flight_Details || '',
        airport_transfers: bk.Airport_Transfers_Required || '',
        additional_transfers: bk.Additional_Transfers_Required || '',
        tshirt: bk.T_Shirt_Size || '',
        notes: bk.Notes || '',
        special_requests: bk.Special_Requests || '',
        portal_status: bk.Rider_Portal_Status || '',
      };
    });

    res.status(200).json({
      success: true,
      guests: guests,
      total: guests.length,
      module_used: usedModule,
      api_error: apiError || undefined,
    });
  } catch (err) {
    console.error('guests error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
