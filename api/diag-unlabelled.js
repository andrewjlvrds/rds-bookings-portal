// Diagnostic: count emails in bookings@ inbox/sent that are NOT under any
// known tour label — emails the reindex would currently miss.
const { gmailToken, gmailApi } = require('./_gmail.js');

// Same mapping as reindex-inbound.js - keep in sync
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
  try {
    var token = await gmailToken();
    
    // Build set of label IDs that are "tour labels"
    var labelListResp = await gmailApi(token, 'labels');
    var allLabels = labelListResp.labels || [];
    var tourLabelIds = {};
    var tourLabelNames = [];
    for (var li = 0; li < allLabels.length; li++) {
      if (isTourLabel(allLabels[li].name)) {
        tourLabelIds[allLabels[li].id] = allLabels[li].name;
        tourLabelNames.push(allLabels[li].name);
      }
    }

    // Search recent emails in inbox + sent, last 60 days
    // Use Gmail search — newer_than:60d, limit to bookings@ account
    var query = 'newer_than:60d (in:inbox OR in:sent)';
    var searchUrl = 'messages?q=' + encodeURIComponent(query) + '&maxResults=500';
    var allMessages = [];
    var pageToken = null;
    var pages = 0;
    while (pages < 5) {
      var url = searchUrl + (pageToken ? '&pageToken=' + pageToken : '');
      var r = await gmailApi(token, url);
      if (r.messages) allMessages = allMessages.concat(r.messages);
      pageToken = r.nextPageToken;
      pages++;
      if (!pageToken) break;
    }

    // For each, fetch headers + labelIds, check if any labels are tour labels
    var unlabelled = [];
    var labelled = 0;
    var sampleLimit = 50;
    for (var mi = 0; mi < allMessages.length; mi++) {
      var mid = allMessages[mi].id;
      var msg = await gmailApi(token, 'messages/' + mid + '?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date');
      var labels = msg.labelIds || [];
      var hasTourLabel = false;
      for (var lj = 0; lj < labels.length; lj++) {
        if (tourLabelIds[labels[lj]]) { hasTourLabel = true; break; }
      }
      if (hasTourLabel) { labelled++; continue; }
      
      var hdrs = (msg.payload && msg.payload.headers) || [];
      var get = function(n) {
        for (var k = 0; k < hdrs.length; k++) {
          if (hdrs[k].name.toLowerCase() === n.toLowerCase()) return hdrs[k].value;
        }
        return '';
      };
      
      var labelNames = labels.map(function(lid) {
        for (var al = 0; al < allLabels.length; al++) {
          if (allLabels[al].id === lid) return allLabels[al].name;
        }
        return lid;
      });
      
      unlabelled.push({
        gmail_id: mid,
        from: get('From'),
        to: get('To'),
        subject: get('Subject'),
        date: get('Date'),
        labels: labelNames,
        in_inbox: labels.indexOf('INBOX') > -1,
        is_sent: labels.indexOf('SENT') > -1,
      });
      
      if (unlabelled.length >= sampleLimit * 4) break; // cap work
    }

    res.status(200).json({
      searched_query: query,
      total_messages_scanned: Math.min(allMessages.length, labelled + unlabelled.length),
      total_messages_in_range: allMessages.length,
      with_tour_label: labelled,
      without_tour_label: unlabelled.length,
      tour_labels_count: tourLabelNames.length,
      unlabelled_sample: unlabelled.slice(0, sampleLimit),
    });
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack });
  }
};
