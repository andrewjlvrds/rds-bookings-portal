import { findNarrative } from './_narratives.js';
import { zohoApi } from './_zoho.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var body = req.body || {};
  var bookingId = body.booking_id;       // Zoho lodge booking record ID
  var dayDescription = body.day_description; // e.g. "Day 08: Aus to Sesriem"
  var tourPrefix = body.tour_prefix;     // e.g. "FoSA", "EoA12", "BoN", "GL"
  var save = body.save === true;         // if true, write to Zoho

  if (!dayDescription || !tourPrefix) {
    return res.status(400).json({ error: 'day_description and tour_prefix required' });
  }

  // Find matching narrative from source library
  var match = findNarrative(dayDescription, tourPrefix);

  if (!match) {
    return res.status(200).json({
      found: false,
      day_description: dayDescription,
      tour_prefix: tourPrefix,
      message: 'No matching source narrative found for this route segment.',
    });
  }

  // If save=true and booking_id provided, write to Zoho Route_Narrative field
  if (save && bookingId) {
    try {
      await zohoApi('PUT', 'Lodge_Bookings/' + bookingId, {
        data: [{ Route_Narrative: match.text }]
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to save to Zoho: ' + err.message });
    }
  }

  return res.status(200).json({
    found: true,
    confidence: match.confidence,
    day_description: dayDescription,
    tour_prefix: tourPrefix,
    narrative: match.text,
    saved: save && !!bookingId,
  });
}
