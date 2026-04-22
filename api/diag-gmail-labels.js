import { getGmailToken, gmailApi } from './_gmail.js';

// GET /api/diag-gmail-labels — dump all user labels with message counts so
// we can see the actual label inventory when reindex filters miss them.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    var token = await getGmailToken();
    var result = await gmailApi(token, 'labels');
    var labels = result.labels || [];

    // Filter to user labels (skip system labels like INBOX, SENT, etc.)
    var userLabels = labels.filter(function(l) { return l.type === 'user' || !l.type; });

    // Fetch message count per label (in parallel-ish, but capped)
    var detailed = [];
    for (var i = 0; i < userLabels.length; i++) {
      try {
        var detail = await gmailApi(token, 'labels/' + userLabels[i].id);
        detailed.push({
          name: detail.name,
          id: detail.id,
          messagesTotal: detail.messagesTotal || 0,
          messagesUnread: detail.messagesUnread || 0,
          type: detail.type,
        });
      } catch (e) {
        detailed.push({ name: userLabels[i].name, id: userLabels[i].id, error: e.message });
      }
    }

    detailed.sort(function(a, b) { return (b.messagesTotal || 0) - (a.messagesTotal || 0); });

    res.status(200).json({
      total_labels: labels.length,
      user_labels: detailed.length,
      labels: detailed,
    });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
}
