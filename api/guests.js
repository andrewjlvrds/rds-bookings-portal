import { zohoApi } from './_zoho.js';

export default async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Correct field names from Zoho Bookings module schema (167 fields)
    // Zoho hard limit: 50 fields per request — split into two fetches
    var fields1 = [
      'Name','First_Name','Last_Name','Email','Secondary_Email','Phone_1',
      'Tour_Name','Tour','Tour_start_date','Tour_end_date',
      'Booking_Status','Participant_Type','Booking_Date','Booking_Ref',
      'Room_Preference_2','Add_ons_Notes',
      'Motorcycle_Preference','Pannier_Bags_2','Motorcycle_notes',
      'BMW1250_Upgrade','CRF1100_Upgrade','Bike_Upgrade_Notes',
      'Tour_Price','Total_Amount_Due','Total_Received','Paid_to_date',
      'Amount_O_S','Balance_Due_calculated','Currency','Guest_Currency',
      'Deposit_Amount_Due','Deposit_Amount_Paid','Deposit_Paid_Date',
      'Balance_Amount_Received','Balance_Paid_Date','Balance_Due_Date',
      'Nationality1','Passport_Number',
      'Dietary_Requirements','Medical_Conditions_Allergies',
      'Emergency_Contact','T_Shirt_Size',
      'Arrival_Flight_Details','Departure_Flight_Details',
      'Departure_Flight_Details_CT_to_home',
      'Additional_Transfers_Required',
      'Transfer_Hotel_Leg_1_Override',
      'Booking_Notes','Client_Comments','Anything_else_we_should_know',
      'id'
    ].join(',');

    var fields2 = [
      'First_Name','Last_Name','Tour','Tour_Name',
      'Pre_tour_accommodation_req_d','Pre_Tour_Accommodation_details',
      'Pre_tour_Accommodation_booked','Pre_tour_accommodation_amount',
      'Post_tour_accommodation_req_d','Post_Tour_Accommodation_details',
      'Post_tour_Accommodation_booked','Post_tour_accommodation_amount',
      'Okavango_Full_Day_HH','Okavango_Short_Heli','Okavango_Excursion_Amount',
      'Okavango_45_min_Scenic_Flight',
      'Morning_Game_Drive','Morning_Game_Drive_Omaruru',
      'Zambezi_Dinner_Cruise','Zambezi_Dinner_Cruise_Amount',
      'Pre_Tour_1_day_Ride','day_Ride_Amount',
      'Oddballs_2_night_stay',
      'Lowered_Seat_2','Top_Box','Pannier_Bags',
      'Pillion','Pillion_Name','Pillion1',
      'Do_you_have_a_bike_licence','Licence_Type','License',
      'How_many_years_riding','Gravel_Roads_Experience','Tar_Roads_Experience',
      'Previous_Adventure_Riding_Experience',
      'Any_physical_or_medical_limitiations','Do_you_need_a_single_room',
      'Seat_height_ok','Own_Bike_Type',
      'Global_Rescue_Option','Insurance_Details','Travel_Insurance_Details',
      'Waiver_Signed','Booking_Approved',
      'How_did_you_find_out_about_RDS',
      'Enroll_in_Pre_tour_Cadence',
      'Request_Capey_Leg_1','Request_Capey_Departure','Request_Capey_home_departure',
      'No_of_Pax_Leg_1','No_of_Pax_Departure','No_of_Pax_Home_departure',
      'id'
    ].join(',');

    var allBookings = [];
    var extraData = {};
    var page = 1;
    var hasMore = true;
    var apiError = null;

    // Fetch 1: core guest fields
    while (hasMore && page <= 5) {
      try {
        var result = await zohoApi('GET',
          'Bookings?fields=' + fields1 +
          '&sort_by=Created_Time&sort_order=desc&per_page=200&page=' + page
        );
        var data = (result && result.data) || [];
        allBookings = allBookings.concat(data);
        hasMore = result && result.info && result.info.more_records;
        page++;
      } catch (fetchErr) {
        apiError = fetchErr.message;
        console.error('guests fetch1 error page ' + page + ':', fetchErr.message);
        break;
      }
    }

    // Fetch 2: pre-tour logistics & excursions
    page = 1;
    hasMore = true;
    while (hasMore && page <= 5) {
      try {
        var result2 = await zohoApi('GET',
          'Bookings?fields=' + fields2 +
          '&sort_by=Created_Time&sort_order=desc&per_page=200&page=' + page
        );
        var data2 = (result2 && result2.data) || [];
        data2.forEach(function(bk) {
          extraData[bk.id] = bk;
        });
        hasMore = result2 && result2.info && result2.info.more_records;
        page++;
      } catch (fetchErr) {
        // Non-fatal — just won't have logistics data
        console.error('guests fetch2 error:', fetchErr.message);
        if (!apiError) apiError = 'Logistics fields partially unavailable: ' + fetchErr.message;
        break;
      }
    }

    // Merge and process
    var guests = allBookings.map(function(bk) {
      var extra = extraData[bk.id] || {};

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

      // Build excursion summary from booleans
      var excursions = [];
      if (extra.Okavango_Full_Day_HH) excursions.push('Okavango Full Day Safari & Flight');
      if (extra.Okavango_Short_Heli) excursions.push('Okavango Scenic Flight');
      if (extra.Morning_Game_Drive) excursions.push('Morning Game Drive');
      if (extra.Zambezi_Dinner_Cruise) excursions.push('Zambezi Dinner Cruise');
      if (extra.Pre_Tour_1_day_Ride) excursions.push('Pre-Tour 1-day Ride');
      if (extra.Oddballs_2_night_stay) excursions.push('Oddballs 2-night stay');

      // Build gear summary
      var gear = [];
      if (extra.Lowered_Seat_2 === 'Yes') gear.push('Lowered seat');
      if (extra.Top_Box) gear.push('Top box');
      if (extra.Pannier_Bags) gear.push('Panniers');

      return {
        id: bk.id,
        name: [bk.First_Name, bk.Last_Name].filter(Boolean).join(' ') || bk.Name || '',
        first_name: bk.First_Name || '',
        last_name: bk.Last_Name || '',
        email: bk.Email || '',
        secondary_email: bk.Secondary_Email || '',
        phone: bk.Phone_1 || '',
        tour_id: tourId,
        tour_name: tourName,
        tour_start: bk.Tour_start_date || '',
        tour_end: bk.Tour_end_date || '',
        status: bk.Booking_Status || '',
        booking_date: bk.Booking_Date || '',
        booking_ref: bk.Booking_Ref || '',
        participant_type: bk.Participant_Type || '',
        room_type: bk.Room_Preference_2 || '',
        roommate: bk.Add_ons_Notes || '',
        sharing_info: extra.Do_you_need_a_single_room || '',
        motorcycle: bk.Motorcycle_Preference || '',
        allocated_bike: bk.Pannier_Bags_2 || '',
        moto_notes: bk.Motorcycle_notes || '',
        bmw_upgrade: bk.BMW1250_Upgrade || '',
        crf_upgrade: bk.CRF1100_Upgrade || '',
        bike_upgrade_notes: bk.Bike_Upgrade_Notes || '',
        tour_price: bk.Tour_Price || '',
        total_due: bk.Total_Amount_Due || '',
        total_received: bk.Total_Received || bk.Paid_to_date || '',
        amount_os: bk.Amount_O_S || '',
        balance_due: bk.Balance_Due_calculated || bk.Amount_O_S || '',
        currency: bk.Currency || bk.Guest_Currency || '',
        deposit_due: bk.Deposit_Amount_Due || '',
        deposit_paid: bk.Deposit_Amount_Paid || '',
        deposit_date: bk.Deposit_Paid_Date || '',
        balance_received: bk.Balance_Amount_Received || '',
        balance_paid_date: bk.Balance_Paid_Date || '',
        balance_due_date: bk.Balance_Due_Date || '',
        nationality: bk.Nationality1 || '',
        passport: bk.Passport_Number || '',
        dietary: bk.Dietary_Requirements || '',
        medical: bk.Medical_Conditions_Allergies || '',
        physical_limitations: extra.Any_physical_or_medical_limitiations || '',
        emergency_contact: bk.Emergency_Contact || '',
        tshirt: bk.T_Shirt_Size || '',
        arrival_flight: bk.Arrival_Flight_Details || '',
        departure_flight: bk.Departure_Flight_Details || '',
        departure_flight_home: bk.Departure_Flight_Details_CT_to_home || '',
        additional_transfers: bk.Additional_Transfers_Required || '',
        transfer_hotel: bk.Transfer_Hotel_Leg_1_Override || '',
        notes: bk.Booking_Notes || '',
        client_comments: bk.Client_Comments || '',
        anything_else: bk.Anything_else_we_should_know || '',
        // Pre/post tour accommodation
        pre_tour_reqd: extra.Pre_tour_accommodation_req_d || '',
        pre_tour_details: extra.Pre_Tour_Accommodation_details || '',
        pre_tour_booked: extra.Pre_tour_Accommodation_booked || false,
        pre_tour_amount: extra.Pre_tour_accommodation_amount || '',
        post_tour_reqd: extra.Post_tour_accommodation_req_d || '',
        post_tour_details: extra.Post_Tour_Accommodation_details || '',
        post_tour_booked: extra.Post_tour_Accommodation_booked || false,
        post_tour_amount: extra.Post_tour_accommodation_amount || '',
        // Excursions
        excursions: excursions.join(', '),
        excursion_details: {
          okavango_full: extra.Okavango_Full_Day_HH || false,
          okavango_heli: extra.Okavango_Short_Heli || false,
          okavango_amount: extra.Okavango_Excursion_Amount || '',
          okavango_scenic: extra.Okavango_45_min_Scenic_Flight || '',
          game_drive: extra.Morning_Game_Drive || false,
          game_drive_amount: extra.Morning_Game_Drive_Omaruru || '',
          zambezi: extra.Zambezi_Dinner_Cruise || false,
          zambezi_amount: extra.Zambezi_Dinner_Cruise_Amount || '',
          pre_ride: extra.Pre_Tour_1_day_Ride || false,
          pre_ride_amount: extra.day_Ride_Amount || '',
          oddballs: extra.Oddballs_2_night_stay || false,
        },
        // Gear
        gear: gear.join(', '),
        // Riding experience
        pillion: extra.Pillion || '',
        pillion_name: extra.Pillion_Name || '',
        licence: extra.Do_you_have_a_bike_licence || '',
        licence_type: extra.Licence_Type || '',
        licence_number: extra.License || '',
        years_riding: extra.How_many_years_riding || '',
        gravel_experience: extra.Gravel_Roads_Experience || '',
        tar_experience: extra.Tar_Roads_Experience || '',
        adventure_experience: extra.Previous_Adventure_Riding_Experience || '',
        own_bike: extra.Own_Bike_Type || '',
        // Insurance / admin
        global_rescue: extra.Global_Rescue_Option || '',
        insurance_details: extra.Travel_Insurance_Details || '',
        waiver_signed: extra.Waiver_Signed || false,
        booking_approved: extra.Booking_Approved || false,
        how_found: extra.How_did_you_find_out_about_RDS || '',
        // Transfer requests
        capey_arrival: extra.Request_Capey_Leg_1 || false,
        capey_departure: extra.Request_Capey_Departure || false,
        capey_home: extra.Request_Capey_home_departure || false,
        pax_arrival: extra.No_of_Pax_Leg_1 || '',
        pax_departure: extra.No_of_Pax_Departure || '',
        pax_home: extra.No_of_Pax_Home_departure || '',
      };
    });

    res.status(200).json({
      success: true,
      guests: guests,
      total: guests.length,
      api_error: apiError || undefined,
    });
  } catch (err) {
    console.error('guests error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
