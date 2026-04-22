// Diagnostic: count emails in bookings@ inbox/sent that are NOT under any
// known tour label. Must stay inside Vercel's ~10s function timeout.
//
// Strategy:
//   1. Search Gmail for a configurable time window (default 30d)
//   2. Fetch metadata in parallel batches of 20
//   3. Hard-stop before ~8 seconds elapse, return partial results
//   4. `days` query param to widen/narrow window
const { gmailToken, gmailApi } = require('./_gmail.js');

const TOUR_LABEL_MAPPINGS = [
  { match: 'FoSA Mar 27', tour: 'FoSA Mar 27' },
  { match: 'INBOX/2026-03 (30 Mar - 18 Apr)', tour: 'FoSA Mar 26' },
  { match: 'INBOX/2026-04 (24 Apr - 13 May)', tour: 'FoSA Apr 26' },
  { match: 'INBOX/2026-05 (25 May - 6 June)', tour: 'BoN May 26' },
  { match: 'INBOX/2026-07 Great Lakes', tour: 'GL Jul 26' },
  { match: 'INBOX/2026-09 Sept (9-28) Group B', tour: 'FoSA 9 Sep 26' },
  { match: 'INBOX/2026-09 Sept (11-30) Group A', tour: 'FoSA 11 Sep 26' },
  { match: 'INBOX/2026-10 October', tour: 'FoSA Oct 26' },
];

function isTourLabel(labelName) {
  for (var i = 0; i < TOUR_LABEL_MAPPINGS.length; i++) {
    if (labelName.indexOf(TOUR_LABEL_MAPPINGS[i].match) === 0) return true;
  }
  return false;
}

module.exports = async function handler(req, res) {
  var t0 = Date.now();
  var deadlineMs = 8000;
  try {
    var days = parseInt((req.query && req.query.days) || '30', 10);
    if (!(days > 0) || days > 365) days = 30;

    var token = await gmailToken();

    var labelListResp = await gmailApi(token, 'labels');
    var allLabels = labelListResp.labels || [];
    var tourLabelIds = {};
    var tourLabelNames = [];
    var labelNameById = {};
    for (var li = 0; li < allLabels.length; li++) {
      labelNameById[allLabels[li].id] = allLabels[li].name;
      if (isTourLabel(allLabels[li].name)) {
        tourLabelIds[allLabels[li].id] = allLabels[li].name;
        tourLabelNames.push(allLabels[li].name);
      }
    }

    var query = 'newer_than:' + days + 'd (in:inbox OR in:sent)';
    var searchUrl = 'messages?q=' + encodeURIComponent(query) + '&maxResults=500';
    var allMessages = [];
    var pageToken = null;
    var pages = 0;
    while (pages < 3) {
      if (Date.now() - t0 > 3500) break;
      var url = searchUrl + (pageToken ? '&pageToken=' + pageToken : '');
      var r = await gmailApi(token, url);
      if (r.messages) allMessages = allMessages.concat(r.messages);
      pageToken = r.nextPageToken;
      pages++;
      if (!pageToken) break;
    }

    var unlabelled = [];
    var labelled = 0;
    var processed = 0;
    var batchSize = 20;
    var hitTimeout = false;

    for (var bi = 0; bi < allMessages.length; bi += batchSize) {
      if (Date.now() - t0 > deadlineMs) { hitTimeout = true; break; }
      var batch = allMessages.slice(bi, bi + batchSize);
      var results = await Promise.all(batch.map(function(m) {
        return gmailApi(token, 'messages/' + m.id + '?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date')
          .then(function(r) { return { ok: true, id: m.id, msg: r }; })
          .catch(function(e) { return { ok: false, id: m.id, err: e.message }; });
      }));

      for (var ri = 0; ri < results.length; ri++) {
        processed++;
        var rr = results[ri];
        if (!rr.ok) continue;
        var msg = rr.msg;
        var labels = msg.labelIds || [];
        var hasTourLabel = false;
        for (var lj = 0; lj < labels.length; lj++) {
          if (tourLabelIds[labels[lj]]) { hasTourLabel = true; break; }
        }
        if (hasTourLabel) { labelled++; continue; }

        var hdrs = (msg.payload && msg.payload.headers) || [];
        var getHdr = function(n) {
          for (var k = 0; k < hdrs.length; k++) {
            if (hdrs[k].name.toLowerCase() === n.toLowerCase()) return hdrs[k].value;
          }
          return '';
        };

        var labelNames = [];
        for (var lx = 0; lx < labels.length; lx++) {
          labelNames.push(labelNameById[labels[lx]] || labels[lx]);
        }

        unlabelled.push({
          gmail_id: rr.id,
          from: getHdr('From'),
          to: getHdr('To'),
          subject: getHdr('Subject'),
          date: getHdr('Date'),
          labels: labelNames,
          in_inbox: labels.indexOf('INBOX') > -1,
          is_sent: labels.indexOf('SENT') > -1,
        });
      }
    }

    unlabelled.sort(function(a, b) {
      return new Date(b.date || 0) - new Date(a.date || 0);
    });

    res.status(200).json({
      window_days: days,
      searched_query: query,
      elapsed_ms: Date.now() - t0,
      hit_timeout: hitTimeout,
      total_messages_in_range: allMessages.length,
      messages_processed: processed,
      with_tour_label: labelled,
      without_tour_label: unlabelled.length,
      tour_labels_count: tourLabelNames.length,
      unlabelled_sample: unlabelled.slice(0, 100),
    });
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack, elapsed_ms: Date.now() - t0 });
  }
};
