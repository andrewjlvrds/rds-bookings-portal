import { zohoApi } from './_zoho.js';

export default async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    var fields = [
      'Name','First_Name','Last_Name','Tour_Name','Tour_start_date','Tour_end_date','Tour',
      'Arrival_Flight_Details','No_of_Pax_Leg_1','Transfer_Hotel_Leg_1_Override',
      'Request_Capey_Leg_1','Capey_Status_Leg_1',
      'Departure_Flight_Details','No_of_Pax_Departure',
      'Request_Capey_Departure','Capey_Status_Departure',
      'No_of_Pax_Home_departure',
      'Request_Capey_home_departure','Capey_Status_Home_Departure',
      'Additional_Transfers_Required','Airport_Transfers_Required',
      'Booking_Status','id'
    ].join(',');

    var allBookings = [];
    var page = 1;
    var hasMore = true;
    var apiError = null;

    while (hasMore && page <= 5) {
      try {
        var result = await zohoApi('GET',
          'Bookings?fields=' + fields +
          '&sort_by=Created_Time&sort_order=desc&per_page=200&page=' + page
        );
        if (!result || !result.data) {
          // Try with module API name if display name fails
          if (page === 1) {
            console.log('Bookings returned no data, trying CustomModule4...');
            result = await zohoApi('GET',
              'CustomModule4?fields=' + fields +
              '&sort_by=Created_Time&sort_order=desc&per_page=200&page=' + page
            );
          }
          if (!result || !result.data) {
            apiError = 'No data returned from Zoho. Module may not be accessible.';
            break;
          }
        }
        var data = result.data || [];
        allBookings = allBookings.concat(data);
        hasMore = result.info && result.info.more_records;
        page++;
      } catch (fetchErr) {
        apiError = fetchErr.message;
        console.error('transfers fetch error page ' + page + ':', fetchErr.message);
        break;
      }
    }

    // Filter to only bookings that have transfer data or airport transfers required
    var transfers = allBookings.filter(function(bk) {
      return bk.Airport_Transfers_Required ||
        bk.Arrival_Flight_Details ||
        bk.Departure_Flight_Details ||
        bk.Departure_Flight_Details_CT_to_home ||
        bk.Departure_Flight_from_CT_to_Home ||
        bk.Additional_Transfers_Required;
    });

    res.status(200).json({
      success: true,
      bookings: allBookings,
      transfers: transfers.length,
      total: allBookings.length,
      api_error: apiError || undefined,
    });
  } catch (err) {
    console.error('transfers-data error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
