import { zohoApi } from './_zoho.js';

export default async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var tourId = req.query.tourId;
  if (!tourId) return res.status(400).json({ error: 'tourId required' });

  try {
    var tourResult = await zohoApi('GET',
      'Tours/' + tourId +
      '?fields=Tour_Name,Name,Departure_Date,End_Date,Status,' +
      'Lead_Guide1,Guide_2,Driver,Bike_Retrieve_Driver_1,Bike_Retrieve_Driver_2,' +
      'Max_Guests,Number_of_riders,Confirmed_Bookings,' +
      'Pax_in_Single_Rooms,Pax_in_Shared_Twin_Rooms,Pax_in_Shared_Double_Rooms,' +
      'Guide_Rooms,Tour_Type,id'
    );
    var tour = (tourResult.data || [])[0] || {};

    var guestFields = [
      'First_Name','Last_Name','Email','Phone_1','Nationality1',
      'Dietary_Requirements','Medical_Conditions_Allergies',
      'Room_Preference_2','Do_you_need_a_single_room',
      'Pillion','Pillion_Name','Pillion1',
      'Motorcycle_Preference','Own_Bike_Type',
      'Booking_Status','T_s_and_C_s_checked',
      'Damage_Deposit','Motorcycle_Deposit','Motorcycle_Deposit_Refunded',
      'Travel_Insurance_1','Travel_Insurance_2','Insurance_Details',
      'Emergency_Contact','Passport_Number',
      'Arrival_Flight_Details','Departure_Flight_Details',
      'T_Shirt_Size','Booking_Reference',
      'Tour','id','Name'
    ].join(',');

    var guests = [];
    try {
      var guestResult = await zohoApi('GET',
        'Bookings?fields=' + guestFields +
        '&criteria=(Tour.id:equals:' + tourId + ')' +
        '&per_page=50'
      );
      guests = (guestResult.data || []).map(function(g) {
        var singleRoom = g.Do_you_need_a_single_room === true ||
          g.Do_you_need_a_single_room === 'true' ||
          g.Do_you_need_a_single_room === 'Yes';
        return {
          id: g.id,
          name: (g.First_Name || '') + ' ' + (g.Last_Name || ''),
          first_name: g.First_Name || '',
          last_name: g.Last_Name || '',
          email: g.Email || '',
          phone: g.Phone_1 || '',
          nationality: g.Nationality1 || '',
          dietary: g.Dietary_Requirements || '',
          medical: g.Medical_Conditions_Allergies || '',
          room_pref: g.Room_Preference_2 || (singleRoom ? 'Single' : ''),
          single_room: singleRoom,
          pillion: g.Pillion || g.Pillion1 || false,
          pillion_name: g.Pillion_Name || '',
          bike_pref: g.Motorcycle_Preference || '',
          own_bike: g.Own_Bike_Type || '',
          status: g.Booking_Status || '',
          tcs_checked: g.T_s_and_C_s_checked || false,
          damage_deposit: g.Damage_Deposit || '',
          moto_deposit: g.Motorcycle_Deposit || '',
          moto_refunded: g.Motorcycle_Deposit_Refunded || '',
          insurance1: g.Travel_Insurance_1 || '',
          insurance2: g.Travel_Insurance_2 || '',
          insurance_details: g.Insurance_Details || '',
          emergency: g.Emergency_Contact || '',
          passport: g.Passport_Number || '',
          arrival_flight: g.Arrival_Flight_Details || '',
          departure_flight: g.Departure_Flight_Details || '',
          tshirt: g.T_Shirt_Size || '',
          booking_ref: g.Booking_Reference || '',
        };
      });
    } catch(e) {
      if (e.message && e.message.indexOf('204') === -1) {
        console.error('Guest fetch error:', e.message);
      }
    }

    var crew = [];
    if (tour.Lead_Guide1) crew.push({ name: tour.Lead_Guide1, role: 'Lead Guide' });
    if (tour.Guide_2) crew.push({ name: tour.Guide_2, role: 'Guide 2' });
    if (tour.Driver) crew.push({ name: tour.Driver, role: 'Driver' });
    if (tour.Bike_Retrieve_Driver_1) crew.push({ name: tour.Bike_Retrieve_Driver_1, role: 'Retrieve Driver 1' });
    if (tour.Bike_Retrieve_Driver_2) crew.push({ name: tour.Bike_Retrieve_Driver_2, role: 'Retrieve Driver 2' });

    res.status(200).json({
      tour: {
        id: tour.id,
        name: tour.Tour_Name || tour.Name || '',
        type: tour.Tour_Type || '',
        departure: tour.Departure_Date || '',
        end: tour.End_Date || '',
        status: tour.Status || '',
        max_guests: tour.Max_Guests || 0,
        num_riders: tour.Number_of_riders || 0,
        confirmed: tour.Confirmed_Bookings || 0,
        pax_single: tour.Pax_in_Single_Rooms || 0,
        pax_twin: tour.Pax_in_Shared_Twin_Rooms || 0,
        pax_double: tour.Pax_in_Shared_Double_Rooms || 0,
        guide_rooms: tour.Guide_Rooms || 0,
      },
      crew: crew,
      guests: guests,
      guest_count: guests.length,
      crew_count: crew.length,
    });

  } catch(err) {
    console.error('bp-tour-detail error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
