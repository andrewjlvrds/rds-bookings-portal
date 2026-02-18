import { zohoApi } from './_zoho.js';

function str(v) {
  if (!v) return '';
  if (typeof v === 'object') return v.name || v.id || '';
  return String(v);
}

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
      var searchUrl = 'Bookings/search?criteria=' + encodeURIComponent('(Tour:equals:' + tourId + ')') + '&fields=' + guestFields + '&per_page=200';
      var guestResult = await zohoApi('GET', searchUrl);
      guests = (guestResult.data || []).map(function(g) {
        var singleRoom = g.Do_you_need_a_single_room === true ||
          g.Do_you_need_a_single_room === 'true' ||
          g.Do_you_need_a_single_room === 'Yes';
        return {
          id: g.id || '',
          name: str(g.First_Name) + ' ' + str(g.Last_Name),
          first_name: str(g.First_Name),
          last_name: str(g.Last_Name),
          email: str(g.Email),
          phone: str(g.Phone_1),
          nationality: str(g.Nationality1),
          dietary: str(g.Dietary_Requirements),
          medical: str(g.Medical_Conditions_Allergies),
          room_pref: str(g.Room_Preference_2) || (singleRoom ? 'Single' : ''),
          single_room: singleRoom,
          pillion: g.Pillion === true || g.Pillion === 'true' || g.Pillion1 === true || g.Pillion1 === 'true',
          pillion_name: str(g.Pillion_Name),
          bike_pref: str(g.Motorcycle_Preference),
          own_bike: str(g.Own_Bike_Type),
          status: str(g.Booking_Status),
          tcs_checked: g.T_s_and_C_s_checked === true || g.T_s_and_C_s_checked === 'true' || g.T_s_and_C_s_checked === '1',
          damage_deposit: str(g.Damage_Deposit),
          moto_deposit: str(g.Motorcycle_Deposit),
          moto_refunded: str(g.Motorcycle_Deposit_Refunded),
          insurance1: str(g.Travel_Insurance_1),
          insurance2: str(g.Travel_Insurance_2),
          insurance_details: str(g.Insurance_Details),
          emergency: str(g.Emergency_Contact),
          passport: str(g.Passport_Number),
          arrival_flight: str(g.Arrival_Flight_Details),
          departure_flight: str(g.Departure_Flight_Details),
          tshirt: str(g.T_Shirt_Size),
          booking_ref: str(g.Booking_Reference),
        };
      });
    } catch(e) {
      if (e.message && e.message.indexOf('204') === -1) {
        console.error('Guest fetch error:', e.message);
      }
    }

    var crew = [];
    var crewFields = [
      [tour.Lead_Guide1, 'Lead Guide'],
      [tour.Guide_2, 'Guide 2'],
      [tour.Driver, 'Driver'],
      [tour.Bike_Retrieve_Driver_1, 'Retrieve Driver 1'],
      [tour.Bike_Retrieve_Driver_2, 'Retrieve Driver 2']
    ];
    crewFields.forEach(function(cf) {
      var val = cf[0];
      if (val) crew.push({ name: str(val), role: cf[1] });
    });

    res.status(200).json({
      tour: {
        id: tour.id || '',
        name: str(tour.Tour_Name) || str(tour.Name),
        type: str(tour.Tour_Type),
        departure: str(tour.Departure_Date),
        end: str(tour.End_Date),
        status: str(tour.Status),
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
