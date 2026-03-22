import { zohoApi } from './_zoho.js';

export default async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var bookingId = req.query.id;
  var statusValue = req.query.status || 'Enquiry Sent';
  var fieldName = req.query.field || 'Status';

  if (!bookingId) return res.status(400).json({ error: 'id required' });

  try {
    // First, read the current record to see field names
    var current = await zohoApi('GET', 'Lodge_Bookings/' + bookingId + '?fields=Status,Booking_Status,Name');
    console.log('Current record:', JSON.stringify(current));

    // Try updating with the specified field name
    var updateData = { id: bookingId };
    updateData[fieldName] = statusValue;

    console.log('Attempting update with field:', fieldName, '=', statusValue);
    var result = await zohoApi('PUT', 'Lodge_Bookings', { data: [updateData] });
    console.log('Update result:', JSON.stringify(result));

    res.status(200).json({
      current: current,
      field_used: fieldName,
      value: statusValue,
      result: result,
    });
  } catch(err) {
    console.error('test-status error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
