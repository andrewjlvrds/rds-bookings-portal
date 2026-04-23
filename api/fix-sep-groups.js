import { list, put, del } from '@vercel/blob';

/*
 * fix-sep-groups — one-shot: re-route mismatched Sep 26 Group A/B emails.
 *
 * Scans all booking blobs, finds emails whose subject contains "Group A"
 * or "Group B", checks whether they're under the correct Sep tour booking,
 * and moves them if not.
 *
 * Group A → FoSA 11 Sep 26
 * Group B → FoSA 9 Sep 26
 *
 * GET  ?dry=true   — preview what would move (default)
 * GET  ?dry=false  — actually move blobs
 *
 * DELETE THIS ENDPOINT AFTER USE.
 */

// Lazy import Zoho helper
var _zoho;
async function zohoApi(method, path, body) {
  if (!_zoho) _zoho = await import('./_zoho.js');
  return _zoho.zohoApi(method, path, body);
}

export default async function handler(req, res) {
  var t0 = Date.now();
  var dry = req.query.dry !== 'false';

  try {
    // 1. Fetch all Sep 26 lodge bookings from Zoho to build a lookup
    var fields = 'Name,Lodge_Name,Tour,Check_in_Date,Check_out_Date,RDS_Reference,id';
    var allBookings = [];
    for (var page = 1; page <= 5; page++) {
      var r = await zohoApi('GET', 'Lodge_Bookings?fields=' + fields + '&per_page=200&page=' + page);
      if (r && r.data) allBookings = allBookings.concat(r.data);
      if (!r || !r.info || !r.info.more_records) break;
    }

    // Filter to Sep 26 tours only
    var sep9Bookings = {};  // lodge name (lower) → booking id
    var sep11Bookings = {}; // lodge name (lower) → booking id
    allBookings.forEach(function(bk) {
      var tourName = (bk.Tour && bk.Tour.name) || '';
      var lodge = (bk.Lodge_Name && bk.Lodge_Name.name) || bk.Lodge_Name || bk.Name || '';
      var lodgeKey = String(lodge).toLowerCase().trim();
      if (tourName.indexOf('FoSA 9 Sep') !== -1) sep9Bookings[lodgeKey] = bk.id;
      if (tourName.indexOf('FoSA 11 Sep') !== -1) sep11Bookings[lodgeKey] = bk.id;
    });

    // 2. Scan all booking blobs for Group A/B subjects
    var allBlobs = [];
    var cursor = null;
    for (var p = 0; p < 20; p++) {
      var lr = await list({ prefix: 'emails/booking/', limit: 1000, cursor: cursor });
      allBlobs = allBlobs.concat(lr.blobs || []);
      cursor = lr.cursor;
      if (!cursor) break;
    }

    // 3. Read blobs in batches and find misrouted ones
    var toMove = [];
    var checked = 0;
    var batchSize = 30;

    for (var bi = 0; bi < allBlobs.length; bi += batchSize) {
      if (Date.now() - t0 > 45000) break; // safety timeout
      var batch = allBlobs.slice(bi, bi + batchSize);
      var records = await Promise.all(batch.map(function(b) {
        return fetch(b.url)
          .then(function(rr) { return rr.ok ? rr.json() : null; })
          .catch(function() { return null; });
      }));

      for (var ri = 0; ri < records.length; ri++) {
        var rec = records[ri];
        var blob = batch[ri];
        if (!rec || !rec.subject) continue;
        checked++;

        var subj = rec.subject || '';
        var isGroupA = /group\s*a\b/i.test(subj);
        var isGroupB = /group\s*b\b/i.test(subj);
        if (!isGroupA && !isGroupB) continue;

        // Find which booking this is currently under
        var pathMatch = (blob.pathname || '').match(/emails\/booking\/([^/]+)\//);
        if (!pathMatch) continue;
        var currentBookingId = pathMatch[1];

        // Find the lodge name from the record
        var lodgeInSubj = '';
        // Try to extract lodge name from subject (e.g. "RE: Cape Dutch Quarters: 11 September...")
        var parts = subj.replace(/^RE:\s*/i, '').split(':');
        if (parts.length > 0) lodgeInSubj = parts[0].trim().toLowerCase();

        // Determine correct booking
        var correctBookingId = null;
        if (isGroupA && sep11Bookings[lodgeInSubj]) {
          correctBookingId = sep11Bookings[lodgeInSubj];
        } else if (isGroupB && sep9Bookings[lodgeInSubj]) {
          correctBookingId = sep9Bookings[lodgeInSubj];
        }

        if (!correctBookingId) continue;
        if (correctBookingId === currentBookingId) continue; // already correct

        var safeId = (rec.id || rec.message_id || '').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
        if (!safeId) safeId = blob.pathname.split('/').pop().replace('.json', '');

        toMove.push({
          subject: subj,
          lodge: lodgeInSubj,
          group: isGroupA ? 'A' : 'B',
          from_booking: currentBookingId,
          to_booking: correctBookingId,
          blob_path: blob.pathname,
          safe_id: safeId,
          record: rec,
        });
      }
    }

    // 4. Move blobs if not dry
    var moved = 0;
    var moveErrors = [];
    if (!dry) {
      for (var mi = 0; mi < toMove.length; mi++) {
        var mv = toMove[mi];
        var newPath = 'emails/booking/' + mv.to_booking + '/' + mv.safe_id + '.json';
        var updatedRecord = Object.assign({}, mv.record, {
          booking_id: mv.to_booking,
          _rerouted_from: mv.from_booking,
          _rerouted_at: new Date().toISOString(),
          _rerouted_reason: 'group_' + mv.group.toLowerCase() + '_fix',
        });
        try {
          await put(newPath, JSON.stringify(updatedRecord), {
            access: 'public', contentType: 'application/json', addRandomSuffix: false,
          });
          // Delete old blob
          await del(mv.blob_path);
          moved++;
        } catch (e) {
          moveErrors.push({ path: mv.blob_path, error: e.message });
        }
      }
    }

    res.status(200).json({
      dry: dry,
      elapsed_ms: Date.now() - t0,
      blobs_scanned: allBlobs.length,
      blobs_checked: checked,
      sep9_lodges: Object.keys(sep9Bookings).length,
      sep11_lodges: Object.keys(sep11Bookings).length,
      to_move: toMove.map(function(m) {
        return {
          subject: m.subject,
          lodge: m.lodge,
          group: m.group,
          from_booking: m.from_booking,
          to_booking: m.to_booking,
        };
      }),
      moved: moved,
      move_errors: moveErrors,
    });
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack, elapsed_ms: Date.now() - t0 });
  }
}
