import { getGmailToken, gmailApi } from './_gmail.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    var token = await getGmailToken();
    var result = await gmailApi(token, 'labels');
    var labels = result.labels || [];

    // Filter to INBOX/ sub-labels and Lodge Bookings/ sub-labels
    var inboxLabels = [];
    var lodgeBookingLabels = [];

    labels.forEach(function(l) {
      if (l.name && l.name.startsWith('INBOX/') && l.type === 'user') {
        inboxLabels.push({
          id: l.id,
          name: l.name,
          shortName: l.name.replace('INBOX/', ''),
        });
      }
      if (l.name && l.name.startsWith('Lodge Bookings/') && l.type === 'user') {
        lodgeBookingLabels.push({
          id: l.id,
          name: l.name,
          shortName: l.name.replace('Lodge Bookings/', ''),
        });
      }
    });

    // Sort: year-month labels first (descending), then named tours
    inboxLabels.sort(function(a, b) {
      return a.shortName.localeCompare(b.shortName);
    });
    lodgeBookingLabels.sort(function(a, b) {
      return a.shortName.localeCompare(b.shortName);
    });

    res.status(200).json({
      success: true,
      inbox_labels: inboxLabels,
      lodge_booking_labels: lodgeBookingLabels,
    });
  } catch (err) {
    console.error('gmail-labels error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
