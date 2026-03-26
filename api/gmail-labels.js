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

    var inboxLabels = [];
    var lodgeBookingLabels = [];
    var tourLabels = []; // New format: TourName/LodgeName (no prefix)

    // Known prefixes that indicate legacy grouping
    var legacyPrefixes = ['INBOX/', 'Lodge Bookings/', 'CATEGORY_', 'CHAT', 'SENT', 'DRAFT', 'SPAM', 'TRASH', 'UNREAD', 'STARRED', 'IMPORTANT'];
    // System label IDs to skip
    var systemIds = ['INBOX', 'SENT', 'DRAFT', 'SPAM', 'TRASH', 'UNREAD', 'STARRED', 'IMPORTANT', 'CATEGORY_PERSONAL', 'CATEGORY_SOCIAL', 'CATEGORY_PROMOTIONS', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS'];

    labels.forEach(function(l) {
      if (!l.name || l.type !== 'user') return;

      if (l.name.startsWith('INBOX/')) {
        inboxLabels.push({
          id: l.id,
          name: l.name,
          shortName: l.name.replace('INBOX/', ''),
        });
      } else if (l.name.startsWith('Lodge Bookings/')) {
        lodgeBookingLabels.push({
          id: l.id,
          name: l.name,
          shortName: l.name.replace('Lodge Bookings/', ''),
        });
      } else {
        // Check if it's a new-format tour label (not a legacy prefix)
        var isLegacy = legacyPrefixes.some(function(p) { return l.name.startsWith(p); });
        var isSystem = systemIds.indexOf(l.id) > -1;
        if (!isLegacy && !isSystem) {
          tourLabels.push({
            id: l.id,
            name: l.name,
            shortName: l.name,
          });
        }
      }
    });

    // Sort all groups
    inboxLabels.sort(function(a, b) { return a.shortName.localeCompare(b.shortName); });
    lodgeBookingLabels.sort(function(a, b) { return a.shortName.localeCompare(b.shortName); });
    tourLabels.sort(function(a, b) { return a.shortName.localeCompare(b.shortName); });

    res.status(200).json({
      success: true,
      inbox_labels: inboxLabels,
      lodge_booking_labels: lodgeBookingLabels,
      tour_labels: tourLabels,
    });
  } catch (err) {
    console.error('gmail-labels error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
