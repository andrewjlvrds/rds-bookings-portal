import { zohoApi } from './_zoho.js';

// Helper: paginate a Zoho GET request
async function fetchAll(path, maxPages) {
  var all = [];
  var page = 1;
  var hasMore = true;
  while (hasMore && page <= (maxPages || 5)) {
    var result = await zohoApi('GET', path + '&page=' + page);
    var data = (result && result.data) || [];
    all = all.concat(data);
    hasMore = result && result.info && result.info.more_records;
    page++;
  }
  return all;
}

export default async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Batch 1 (38 fields): core guest data — keep well under 50
    var f1 = [
      'Name','First_Name','Last_Name','Email','Phone_1',
      'Tour_Name','Tour','Tour_start_date','Tour_end_date',
      'Booking_Status','Participant_Type','Booking_Date','Booking_Ref',
      'Room_Preference_2','Add_ons_Notes',
      'Motorcycle_Preference','Pannier_Bags_2','Motorcycle_notes',
      'Tour_Price','Amount_O_S','Currency','Guest_Currency',
      'Deposit_Amount_Paid','Deposit_Paid_Date',
      'Balance_Amount_Received','Balance_Paid_Date','Balance_Due_Date',
      'Nationality1','Passport_Number',
      'Dietary_Requirements','Medical_Conditions_Allergies',
      'Emergency_Contact','T_Shirt_Size',
      'Arrival_Flight_Details','Departure_Flight_Details',
      'Departure_Flight_Details_CT_to_home',
      'Additional_Transfers_Required','Transfer_Hotel_Leg_1_Override',
      'id'
    ].join(',');

    // Batch 2 (38 fields): accommodation, excursions, gear, transfers, extra booking info
    var f2 = [
      'id','Tour','Tour_Name',
      'Booking_Notes','Client_Comments','Anything_else_we_should_know',
      'Pre_tour_accommodation_req_d','Pre_Tour_Accommodation_details',
      'Pre_tour_Accommodation_booked','Pre_tour_accommodation_amount',
      'Post_tour_accommodation_req_d','Post_Tour_Accommodation_details',
      'Post_tour_Accommodation_booked','Post_tour_accommodation_amount',
      'Okavango_Full_Day_HH','Okavango_Short_Heli','Okavango_Excursion_Amount',
      'Okavango_45_min_Scenic_Flight',
      'Morning_Game_Drive','Morning_Game_Drive_Omaruru',
      'Zambezi_Dinner_Cruise','Zambezi_Dinner_Cruise_Amount',
      'Pre_Tour_1_day_Ride','day_Ride_Amount','Oddballs_2_night_stay','Oddballs',
      'Add_ons_Price','Misc_amounts_added','Extra_amounts_notes',
      'Motorcycle_Upgrade_BMW_1250GS','Motorcycle_Upgrade_Honda_Africa_Twin_CRF1100',
      'Exchange_Rate','Total_Amount_Due',
      'Lowered_Seat_2','Top_Box','Pannier_Bags',
      'Pillion','Pillion_Name','Pillion1',
      'BMW1250_Upgrade','CRF1100_Upgrade','Bike_Upgrade_Notes','Bike_Upgrade_Amount',
      'Secondary_Email',
      'Request_Capey_Leg_1','Request_Capey_Departure','Request_Capey_home_departure',
      'No_of_Pax_Leg_1'
    ].join(',');

    // Batch 3 (20 fields): riding profile, admin, remaining transfer pax
    var f3 = [
      'id','Tour','Tour_Name',
      'Do_you_have_a_bike_licence','Licence_Type','License',
      'How_many_years_riding','Gravel_Roads_Experience','Tar_Roads_Experience',
      'Previous_Adventure_Riding_Experience',
      'Any_physical_or_medical_limitiations','Do_you_need_a_single_room',
      'Seat_height_ok','Own_Bike_Type',
      'Global_Rescue_Option','Travel_Insurance_Details',
      'Waiver_Signed','Booking_Approved',
      'No_of_Pax_Departure','No_of_Pax_Home_departure'
    ].join(',');

    var apiError = null;
    var base = 'Bookings?fields=';
    var sort = '&sort_by=Created_Time&sort_order=desc&per_page=200';

    // Fetch all three batches
    var allBookings = [];
    var extra2 = {};
    var extra3 = {};

    try {
      allBookings = await fetchAll(base + f1 + sort, 5);
    } catch (e) {
      apiError = 'Fetch 1: ' + e.message;
      console.error('guests f1 error:', e.message);
    }

    try {
      var d2 = await fetchAll(base + f2 + sort, 5);
      d2.forEach(function(bk) { extra2[bk.id] = bk; });
    } catch (e) {
      if (!apiError) apiError = 'Fetch 2 (logistics): ' + e.message;
      console.error('guests f2 error:', e.message);
    }

    try {
      var d3 = await fetchAll(base + f3 + sort, 5);
      d3.forEach(function(bk) { extra3[bk.id] = bk; });
    } catch (e) {
      if (!apiError) apiError = 'Fetch 3 (profile): ' + e.message;
      console.error('guests f3 error:', e.message);
    }

    // Merge and process
    var guests = allBookings.map(function(bk) {
      var e2 = extra2[bk.id] || {};
      var e3 = extra3[bk.id] || {};

      var tourRef = bk.Tour;
      var tourId = '';
      var tourName = bk.Tour_Name || '';
      var tourInstance = '';  // clean instance name from the Tour lookup (e.g. "FoSA 11 Sep 26")
      if (tourRef) {
        if (typeof tourRef === 'object') {
          tourId = tourRef.id || '';
          tourInstance = tourRef.name || '';
          tourName = tourName || tourRef.name || '';
        } else { tourId = tourRef; }
      }

      // Excursion summary
      var excursions = [];
      if (e2.Okavango_Full_Day_HH) excursions.push('Okavango Full Day Safari & Flight');
      if (e2.Okavango_Short_Heli) excursions.push('Okavango Scenic Flight');
      if (e2.Morning_Game_Drive) excursions.push('Morning Game Drive');
      if (e2.Zambezi_Dinner_Cruise) excursions.push('Zambezi Dinner Cruise');
      if (e2.Pre_Tour_1_day_Ride) excursions.push('Pre-Tour 1-day Ride');
      if (e2.Oddballs_2_night_stay) excursions.push('Oddballs 2-night stay');

      // Gear summary
      var gear = [];
      if (e2.Lowered_Seat_2 === 'Yes') gear.push('Lowered seat');
      if (e2.Top_Box) gear.push('Top box');
      if (e2.Pannier_Bags) gear.push('Panniers');

      return {
        id: bk.id,
        name: [bk.First_Name, bk.Last_Name].filter(Boolean).join(' ') || bk.Name || '',
        first_name: bk.First_Name || '',
        last_name: bk.Last_Name || '',
        email: bk.Email || '',
        secondary_email: e2.Secondary_Email || '',
        phone: bk.Phone_1 || '',
        tour_id: tourId,
        tour_name: tourName,
        tour_instance: tourInstance,
        tour_start: bk.Tour_start_date || '',
        tour_end: bk.Tour_end_date || '',
        status: bk.Booking_Status || '',
        booking_date: bk.Booking_Date || '',
        booking_ref: bk.Booking_Ref || '',
        participant_type: bk.Participant_Type || '',
        room_type: bk.Room_Preference_2 || '',
        roommate: bk.Add_ons_Notes || '',
        sharing_info: e3.Do_you_need_a_single_room || '',
        motorcycle: bk.Motorcycle_Preference || '',
        allocated_bike: bk.Pannier_Bags_2 || '',
        moto_notes: bk.Motorcycle_notes || '',
        bmw_upgrade: e2.BMW1250_Upgrade || '',
        crf_upgrade: e2.CRF1100_Upgrade || '',
        bike_upgrade_notes: e2.Bike_Upgrade_Notes || '',
        tour_price: bk.Tour_Price || '',
        total_due: '',
        total_received: '',
        amount_os: bk.Amount_O_S || '',
        balance_due: bk.Amount_O_S || '',
        currency: bk.Currency || bk.Guest_Currency || '',
        deposit_due: '',
        deposit_paid: bk.Deposit_Amount_Paid || '',
        deposit_date: bk.Deposit_Paid_Date || '',
        balance_received: bk.Balance_Amount_Received || '',
        balance_paid_date: bk.Balance_Paid_Date || '',
        balance_due_date: bk.Balance_Due_Date || '',
        nationality: bk.Nationality1 || '',
        passport: bk.Passport_Number || '',
        dietary: bk.Dietary_Requirements || '',
        medical: bk.Medical_Conditions_Allergies || '',
        physical_limitations: e3.Any_physical_or_medical_limitiations || '',
        emergency_contact: bk.Emergency_Contact || '',
        tshirt: bk.T_Shirt_Size || '',
        arrival_flight: bk.Arrival_Flight_Details || '',
        departure_flight: bk.Departure_Flight_Details || '',
        departure_flight_home: bk.Departure_Flight_Details_CT_to_home || '',
        additional_transfers: bk.Additional_Transfers_Required || '',
        transfer_hotel: bk.Transfer_Hotel_Leg_1_Override || '',
        notes: e2.Booking_Notes || '',
        client_comments: e2.Client_Comments || '',
        anything_else: e2.Anything_else_we_should_know || '',
        // Accommodation
        pre_tour_reqd: e2.Pre_tour_accommodation_req_d || '',
        pre_tour_details: e2.Pre_Tour_Accommodation_details || '',
        pre_tour_booked: e2.Pre_tour_Accommodation_booked || false,
        pre_tour_amount: e2.Pre_tour_accommodation_amount || '',
        post_tour_reqd: e2.Post_tour_accommodation_req_d || '',
        post_tour_details: e2.Post_Tour_Accommodation_details || '',
        post_tour_booked: e2.Post_tour_Accommodation_booked || false,
        post_tour_amount: e2.Post_tour_accommodation_amount || '',
        // Excursions
        excursions: excursions.join(', '),
        excursion_details: {
          okavango_full: e2.Okavango_Full_Day_HH || false,
          okavango_heli: e2.Okavango_Short_Heli || false,
          okavango_amount: e2.Okavango_Excursion_Amount || '',
          okavango_scenic: e2.Okavango_45_min_Scenic_Flight || '',
          game_drive: e2.Morning_Game_Drive || false,
          game_drive_amount: e2.Morning_Game_Drive_Omaruru || '',
          zambezi: e2.Zambezi_Dinner_Cruise || false,
          zambezi_amount: e2.Zambezi_Dinner_Cruise_Amount || '',
          pre_ride: e2.Pre_Tour_1_day_Ride || false,
          pre_ride_amount: e2.day_Ride_Amount || '',
          oddballs: e2.Oddballs_2_night_stay || false,
          oddballs_amount: e2.Oddballs || '',
          other_addons_amount: e2.Add_ons_Price || '',
          misc_amounts: e2.Misc_amounts_added || '',
          extra_amounts_notes: e2.Extra_amounts_notes || '',
        },
        // Bike upgrade amounts (in addition to the existing text fields)
        bike_upgrade_bmw_amount: e2.Motorcycle_Upgrade_BMW_1250GS || '',
        bike_upgrade_honda_amount: e2.Motorcycle_Upgrade_Honda_Africa_Twin_CRF1100 || '',
        bike_upgrade_amount: e2.Bike_Upgrade_Amount || '',
        pillion_amount: e2.Pillion1 || '',
        // Currency / payment headline figures
        exchange_rate: e2.Exchange_Rate || '',
        total_amount_due: e2.Total_Amount_Due || bk.Tour_Price || '',
        gear: gear.join(', '),
        pillion: e2.Pillion || '',
        pillion_name: e2.Pillion_Name || '',
        licence: e3.Do_you_have_a_bike_licence || '',
        licence_type: e3.Licence_Type || '',
        licence_number: e3.License || '',
        years_riding: e3.How_many_years_riding || '',
        gravel_experience: e3.Gravel_Roads_Experience || '',
        tar_experience: e3.Tar_Roads_Experience || '',
        adventure_experience: e3.Previous_Adventure_Riding_Experience || '',
        own_bike: e3.Own_Bike_Type || '',
        global_rescue: e3.Global_Rescue_Option || '',
        insurance_details: e3.Travel_Insurance_Details || '',
        waiver_signed: e3.Waiver_Signed || false,
        booking_approved: e3.Booking_Approved || false,
        // Transfer requests
        capey_arrival: e2.Request_Capey_Leg_1 || false,
        capey_departure: e2.Request_Capey_Departure || false,
        capey_home: e2.Request_Capey_home_departure || false,
        pax_arrival: e2.No_of_Pax_Leg_1 || '',
        pax_departure: e3.No_of_Pax_Departure || '',
        pax_home: e3.No_of_Pax_Home_departure || '',
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
