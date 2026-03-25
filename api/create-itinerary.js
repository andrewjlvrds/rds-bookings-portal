import { zohoApi } from './_zoho.js';

export default async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  try {
    var body = req.body || {};
    var tourId = body.tour_id;
    var tourName = body.tour_name || '';
    var departureDate = body.departure_date || '';
    var nights = body.nights || [];

    if (!tourId) {
      return res.status(400).json({ error: 'Missing tour_id' });
    }
    if (!nights.length) {
      return res.status(400).json({ error: 'No nights provided' });
    }

    // Create lodge bookings in Zoho
    var created = [];
    var errors = [];

    for (var i = 0; i < nights.length; i++) {
      var night = nights[i];
      var checkIn = night.date;

      // Compute check-out (next day)
      var checkOutDate = new Date(checkIn);
      checkOutDate.setDate(checkOutDate.getDate() + 1);
      var checkOut = checkOutDate.toISOString().split('T')[0];

      // Day description
      var dayNum = night.pre_tour ? 'Pre tour' : 'Day ' + String(night.day).padStart(2, '0');
      var dayDesc = dayNum + (night.route ? ': ' + night.route : '');

      // Lodge booking name: "Lodge Name - YYYY-MM-DD"
      var bookingName = (night.lodge || 'TBD') + ' - ' + checkIn;

      // RDS reference: RDS-TourCode-MonYY-LodgeName-YY/MM/DD
      var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      var depDate = new Date(departureDate);
      var depMonthStr = monthNames[depDate.getMonth()];
      var depYearStr = String(depDate.getFullYear()).slice(-2);

      var tourCode = tourName.split(' ')[0] || 'TOUR';
      var lodgeShort = (night.lodge || 'TBD').replace(/[^a-zA-Z0-9]/g, '');
      var ciDate = new Date(checkIn);
      var ciStr = String(ciDate.getFullYear()).slice(-2) + '/' +
        String(ciDate.getMonth() + 1).padStart(2, '0') + '/' +
        String(ciDate.getDate()).padStart(2, '0');
      var rdsRef = 'RDS-' + tourCode + '-' + depMonthStr + depYearStr + '-' + lodgeShort + '-' + ciStr;

      var record = {
        Name: bookingName,
        Lodge_Name: night.lodge || '',
        Day_Description: dayDesc,
        Check_in_Date: checkIn,
        Check_out_Date: checkOut,
        Nights: 1,
        Meals: night.meals || 'BB',
        Status: 'Not Started',
        Tour: tourId,
      };

      // RDS_Reference may not be active in Zoho API yet — try but don't fail
      try { record.RDS_Reference = rdsRef; } catch(e) {}

      try {
        var result = await zohoApi('POST', 'Lodge_Bookings', { data: [record] });

        if (result && result.data && result.data[0]) {
          var created_record = result.data[0];
          if (created_record.status === 'success') {
            created.push({
              night: i + 1,
              lodge: night.lodge,
              date: checkIn,
              zoho_id: created_record.details.id,
              rds_ref: rdsRef,
            });
          } else {
            errors.push({
              night: i + 1,
              lodge: night.lodge,
              error: created_record.message || 'Unknown error',
            });
          }
        }
      } catch (err) {
        errors.push({
          night: i + 1,
          lodge: night.lodge,
          error: err.message,
        });
      }

      // Small delay to avoid rate limiting
      if (i < nights.length - 1) {
        await new Promise(function(resolve) { setTimeout(resolve, 200); });
      }
    }

    res.status(200).json({
      success: true,
      tour_id: tourId,
      tour_name: tourName,
      created: created.length,
      errors: errors.length,
      details: { created: created, errors: errors },
    });

  } catch(err) {
    console.error('create-itinerary error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
