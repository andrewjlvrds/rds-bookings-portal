// Diagnostic: find lodge correspondence in inbox/sent that is NOT under any
// known tour label. Fast approach — uses Gmail's search operator to exclude
// labelled messages server-side, so we only fetch the unlabelled subset.
//
// Query param: ?days=N (default 30, cap 365)

import { getGmailToken, gmailApi } from './_gmail.js';

const TOUR_LABEL_PREFIXES = [
  'FoSA Mar 27',
  'INBOX/2026-03 (30 Mar - 18 Apr)',
  'INBOX/2026-04 (24 Apr - 13 May)',
  'INBOX/2026-05 (25 May - 6 June)',
  'INBOX/2026-07 Great Lakes',
  'INBOX/2026-09 Sept (9-28) Group B',
  'INBOX/2026-09 Sept (11-30) Group A',
  'INBOX/2026-10 October',
];

export default async function handler(req, res) {
  var t0 = Date.now();
  var deadlineMs = 8500;
  try {
    var days = parseInt((req.query && req.query.days) || '30', 10);
    if (!(days > 0) || days > 365) days = 30;

    var token = await getGmailToken();

    var labelListResp = await gmailApi(token, 'labels');
    var allLabels = labelListResp.labels || [];

    var tourLabels = [];
    for (var i = 0; i < allLabels.length; i++) {
      var ln = allLabels[i].name;
      for (var p = 0; p < TOUR_LABEL_PREFIXES.length; p++) {
        if (ln === TOUR_LABEL_PREFIXES[p] || ln.indexOf(TOUR_LABEL_PREFIXES[p] + '/') === 0) {
          tourLabels.push({ id: allLabels[i].id, name: ln });
          break;
        }
      }
    }

    var excludes = tourLabels.map(function(l) {
      return '-label:"' + l.name.replace(/"/g, '') + '"';
    }).join(' ');
    var query = '(in:inbox OR in:sent) newer_than:' + days + 'd ' + excludes;

    var allMessages = [];
    var pageToken = null;
    var pages = 0;
    while (pages < 5) {
      if (Date.now() - t0 > 3000) break;
      var url = 'messages?q=' + encodeURIComponent(query) + '&maxResults=100' + (pageToken ? '&pageToken=' + pageToken : '');
      var r = await gmailApi(token, url);
      if (r.messages) allMessages = allMessages.concat(r.messages);
      pageToken = r.nextPageToken;
      pages++;
      if (!pageToken) break;
    }

    var samples = [];
    var batchSize = 20;
    var processed = 0;
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
        if (!results[ri].ok) continue;
        var msg = results[ri].msg;
        var hdrs = (msg.payload && msg.payload.headers) || [];
        var getHdr = function(n) {
          for (var k = 0; k < hdrs.length; k++) {
            if (hdrs[k].name.toLowerCase() === n.toLowerCase()) return hdrs[k].value;
          }
          return '';
        };
        var labels = msg.labelIds || [];
        samples.push({
          gmail_id: results[ri].id,
          from: getHdr('From'),
          to: getHdr('To'),
          subject: getHdr('Subject'),
          date: getHdr('Date'),
          in_inbox: labels.indexOf('INBOX') > -1,
          is_sent: labels.indexOf('SENT') > -1,
          other_labels: labels.filter(function(l) {
            return l !== 'INBOX' && l !== 'SENT' && l !== 'UNREAD' && l !== 'IMPORTANT' && l.indexOf('CATEGORY_') !== 0;
          }),
        });
      }
    }

    samples.sort(function(a, b) { return new Date(b.date || 0) - new Date(a.date || 0); });

    res.status(200).json({
      window_days: days,
      query_preview: query.length > 500 ? query.substring(0, 500) + '...' : query,
      tour_labels_in_account: tourLabels.length,
      elapsed_ms: Date.now() - t0,
      hit_timeout: hitTimeout,
      total_unlabelled_in_range: allMessages.length,
      metadata_processed: processed,
      samples: samples.slice(0, 100),
    });
  } catch (e) {
    res.status(500).json({ error: e.message, elapsed_ms: Date.now() - t0 });
  }
}
