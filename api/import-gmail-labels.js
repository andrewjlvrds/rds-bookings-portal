// POST /api/import-gmail-labels
// Imports emails from Gmail tour/lodge labels into blob storage.
// Matches lodge sub-label names to Zoho bookings using fuzzy matching.
// Flags low-confidence matches rather than guessing.
//
// Body: { tour_id?, dry_run?: true, skip_existing?: true }
// dry_run=true: returns what would be imported without writing anything

import { getGmailToken, gmailApi } from './_gmail.js';
import { zohoApi } from './_zoho.js';
import { storeEmail, isEmailStored } from './_email-store.js';

// Label → tour name mapping
// These are the known Gmail label names and which portal tour they map to.
// Matched against Zoho tour names using substring overlap.
const LABEL_TOUR_MAP = [
  { pattern: '2026-04', tour: 'FoSA Apr 26' },
  { pattern: '2026-05', tour: 'BoN May 26' },
  { pattern: '2026-06', tour: 'June 26' },
  { pattern: '2026-07', tour: 'GL Jul 26' },
  { pattern: '2026-08', tour: 'WH-CT Aug 26' },
  { pattern: '2026-09 Sept (9-28)', tour: 'FoSA 9 Sep 26' },
  { pattern: '2026-09-sept--9-28', tour: 'FoSA 9 Sep 26' },
  { pattern: '2026-10', tour: 'FoSA Oct 26' },
  { pattern: 'FoSA 11 Sep 26', tour: 'FoSA 11 Sep 26' },
  { pattern: 'FoSA 9 Sep 26', tour: 'FoSA 9 Sep 26' },
  { pattern: 'FoSA Apr 26', tour: 'FoSA Apr 26' },
  { pattern: 'FoSA Apr 27', tour: 'FoSA Apr 27' },
  { pattern: 'FoSA Mar 27', tour: 'FoSA Mar 27' },
  { pattern: 'FoSA Oct 26', tour: 'FoSA Oct 26' },
  { pattern: 'BoN May 26', tour: 'BoN May 26' },
  { pattern: 'GL Jul 26', tour: 'GL Jul 26' },
];

// Labels to skip entirely
const SKIP_PATTERNS = ['Complete 2026', '2025 Archive', 'Finances', 'General', 
  'Lodges and Com', 'Previous 2025', 'Programmes', 'Zoho', 'Guests'];

function labelToTourName(labelName) {
  const lower = labelName.toLowerCase();
  for (const skip of SKIP_PATTERNS) {
    if (lower.includes(skip.toLowerCase())) return null;
  }
  for (const { pattern, tour } of LABEL_TOUR_MAP) {
    if (lower.includes(pattern.toLowerCase())) return tour;
  }
  return null;
}

// Fuzzy match lodge sub-label name to a booking
// Returns { booking, confidence: 'high'|'medium'|'low' }
function matchLodgeLabel(labelName, bookings) {
  const query = labelName.toLowerCase().trim();
  
  // Exact match
  for (const bk of bookings) {
    const lodge = getLodgeName(bk).toLowerCase().trim();
    if (lodge === query) return { booking: bk, confidence: 'high' };
  }
  
  // Substring match (label contains lodge name or vice versa)
  for (const bk of bookings) {
    const lodge = getLodgeName(bk).toLowerCase().trim();
    if (lodge.length > 3 && (query.includes(lodge) || lodge.includes(query))) {
      return { booking: bk, confidence: 'high' };
    }
  }

  // Word overlap scoring
  const queryWords = query.split(/\s+/).filter(w => w.length > 3);
  let bestScore = 0, bestBk = null;
  for (const bk of bookings) {
    const lodge = getLodgeName(bk).toLowerCase().trim();
    const lodgeWords = lodge.split(/\s+/).filter(w => w.length > 3);
    const matches = queryWords.filter(w => lodge.includes(w)).length +
                    lodgeWords.filter(w => query.includes(w)).length;
    const score = matches / Math.max(queryWords.length + lodgeWords.length, 1);
    if (score > bestScore) { bestScore = score; bestBk = bk; }
  }

  if (bestScore >= 0.5) return { booking: bestBk, confidence: 'medium' };
  if (bestScore >= 0.25) return { booking: bestBk, confidence: 'low' };
  return { booking: null, confidence: 'low' };
}

function getLodgeName(bk) {
  const ln = bk.Lodge_Name;
  if (ln && typeof ln === 'object') return ln.name || '';
  return (ln || bk.Name || '').split(' - ')[0].trim();
}

function extractBody(payload) {
  let text = '', html = '';
  function walk(part) {
    if (!part) return;
    if (part.mimeType === 'text/plain' && part.body?.data && !text) {
      text = Buffer.from(part.body.data.replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString('utf-8');
    }
    if (part.mimeType === 'text/html' && part.body?.data && !html) {
      html = Buffer.from(part.body.data.replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString('utf-8');
    }
    if (part.parts) part.parts.forEach(walk);
  }
  walk(payload);
  return text || html || '';
}

function getHeader(headers, name) {
  const h = (headers || []).find(h => h.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const body = req.body || {};
  const dryRun = body.dry_run === true || body.dry_run === 'true';
  const filterTourName = body.tour_name || null; // optional: only import for one tour
  const maxDuration = 50000; // 50s hard limit
  const t0 = Date.now();

  try {
    const token = await getGmailToken();

    // 1. Fetch all Gmail labels
    const labelsResult = await gmailApi(token, 'labels');
    const allLabels = labelsResult.labels || [];

    // 2. Fetch all Zoho bookings for matching (paginated)
    const allBookings = [];
    let bkPage = 1, bkMore = true;
    while (bkMore && bkPage <= 10) {
      const bkResult = await zohoApi('GET',
        'Lodge_Bookings?fields=id,Name,Lodge_Name,Check_in_Date,Check_out_Date,Tour&per_page=200&page=' + bkPage + '&sort_by=Created_Time&sort_order=desc'
      );
      const bkData = bkResult?.data || [];
      allBookings.push(...bkData);
      bkMore = bkResult?.info?.more_records || false;
      bkPage++;
    }

    // Group bookings by tour name
    const bookingsByTour = {};
    allBookings.forEach(bk => {
      const tourName = bk.Tour && typeof bk.Tour === 'object' ? bk.Tour.name : bk.Tour || '';
      if (!bookingsByTour[tourName]) bookingsByTour[tourName] = [];
      bookingsByTour[tourName].push(bk);
    });

    // 3. Find tour-level labels and their lodge sub-labels
    const results = {
      tours_processed: [],
      imported: 0,
      skipped_existing: 0,
      low_confidence: [],
      unmatched_labels: [],
      errors: [],
      dry_run: dryRun,
    };

    // Group labels by parent
    const tourLabels = {}; // tourLabelId → { name, tourName, lodgeLabels: [] }
    
    for (const label of allLabels) {
      const lname = label.name || '';
      
      // Skip system labels
      if (!lname.includes('/') && !['BoN May 26','FoSA 9 Sep 26','FoSA 11 Sep 26',
        'FoSA Apr 26','FoSA Apr 27','FoSA Mar 27','FoSA Oct 26','GL Jul 26'].includes(lname)) {
        continue;
      }

      // Check if it's a tour-level label (no lodge sub-part, or is INBOX/tour)
      const parts = lname.split('/');
      const topPart = parts[0] === 'INBOX' ? (parts[1] || '') : parts[0];
      const lodgePart = parts[0] === 'INBOX' ? parts[2] : parts[1];

      if (!lodgePart) {
        // This is a tour-level label
        const tourName = labelToTourName(topPart);
        if (tourName && (!filterTourName || tourName === filterTourName)) {
          tourLabels[label.id] = { 
            labelId: label.id, 
            labelName: lname, 
            tourName, 
            topPart,
            lodgeLabels: [] 
          };
        }
      }
    }

    // Now find lodge sub-labels
    for (const label of allLabels) {
      const lname = label.name || '';
      const parts = lname.split('/');
      
      if (parts.length < 2) continue;
      
      // Find parent tour label
      for (const [tid, tl] of Object.entries(tourLabels)) {
        if (lname.startsWith(tl.labelName + '/')) {
          const lodgeName = parts[parts.length - 1];
          tl.lodgeLabels.push({ labelId: label.id, labelName: lname, lodgeName });
        }
      }
    }

    // 4. Process each tour label
    for (const [, tl] of Object.entries(tourLabels)) {
      if (Date.now() - t0 > maxDuration) {
        results.errors.push('Time limit reached — run again to continue');
        break;
      }

      const tourResult = { tour: tl.tourName, label: tl.labelName, lodges: [] };
      const tourBookings = bookingsByTour[tl.tourName] || [];

      for (const ll of tl.lodgeLabels) {
        if (Date.now() - t0 > maxDuration) break;

        // Skip noise labels
        if (SKIP_PATTERNS.some(p => ll.lodgeName.toLowerCase().includes(p.toLowerCase()))) continue;

        // Match lodge label to booking
        const match = matchLodgeLabel(ll.lodgeName, tourBookings);
        
        if (!match.booking) {
          results.unmatched_labels.push({ label: ll.labelName, tour: tl.tourName });
          continue;
        }

        if (match.confidence === 'low') {
          results.low_confidence.push({ 
            label: ll.labelName, 
            matched_to: getLodgeName(match.booking),
            booking_id: match.booking.id,
            tour: tl.tourName,
          });
          continue; // Don't import low confidence without review
        }

        const bookingId = match.booking.id;
        const lodgeResult = { label: ll.lodgeName, booking_id: bookingId, 
          lodge: getLodgeName(match.booking), confidence: match.confidence,
          imported: 0, skipped: 0 };

        // Fetch messages under this label
        try {
          const msgsResult = await gmailApi(token, 
            'messages?labelIds=' + ll.labelId + '&maxResults=100'
          );
          const msgs = msgsResult.messages || [];

          for (const msg of msgs) {
            if (Date.now() - t0 > maxDuration) break;

            // Check if already stored
            const alreadyStored = await isEmailStored(bookingId, msg.id);
            if (alreadyStored) { lodgeResult.skipped++; results.skipped_existing++; continue; }

            if (dryRun) { lodgeResult.imported++; results.imported++; continue; }

            // Fetch full message
            try {
              const full = await gmailApi(token, 'messages/' + msg.id + '?format=full');
              if (!full?.payload) continue;

              const headers = full.payload.headers || [];
              const from = getHeader(headers, 'From');
              const to = getHeader(headers, 'To');
              const subject = getHeader(headers, 'Subject');
              const date = getHeader(headers, 'Date');
              const rfcId = getHeader(headers, 'Message-ID');
              const isFromUs = from.includes('ridedownsouth.com');
              const emailBody = extractBody(full.payload);

              if (!emailBody.trim()) { lodgeResult.skipped++; continue; }

              await storeEmail({
                booking_id: bookingId,
                message_id: msg.id,
                type: isFromUs ? 'enquiry' : 'lodge_reply',
                direction: isFromUs ? 'outbound' : 'inbound',
                email_from: from,
                email_to: to,
                email_subject: subject,
                email_content: emailBody,
                email_date: date ? new Date(date).toISOString() : new Date().toISOString(),
                gmail_thread_id: full.threadId || null,
                gmail_message_id: msg.id,
                rfc_message_id: rfcId || null,
                match_method: 'label_import_' + match.confidence,
              });

              lodgeResult.imported++;
              results.imported++;
            } catch (msgErr) {
              results.errors.push('msg ' + msg.id + ': ' + msgErr.message);
            }
          }
        } catch (labelErr) {
          results.errors.push('label ' + ll.labelName + ': ' + labelErr.message);
        }

        // After importing emails for this lodge booking, update Zoho
        // New_Reply and Last_Response_Date so the sidebar badges reflect reality.
        if (!dryRun && lodgeResult.imported > 0) {
          try {
            const today = new Date().toISOString().split('T')[0];
            await zohoApi('PUT', 'Lodge_Bookings', { data: [{
              id: bookingId,
              New_Reply: true,
              Last_Response_Date: today,
            }]});
          } catch (zohoErr) {
            console.error('Failed to update New_Reply for', bookingId, zohoErr.message);
          }
        }

        tourResult.lodges.push(lodgeResult);
      }

      results.tours_processed.push(tourResult);
    }

    return res.status(200).json(results);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
