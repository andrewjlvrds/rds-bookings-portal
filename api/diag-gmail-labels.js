import { getGmailToken, gmailApi } from './_gmail.js';

// GET /api/diag-gmail-labels — dump ALL Gmail labels with NO filtering so
// we see exactly what the OAuth token can actually see.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    var token = await getGmailToken();
    var result = await gmailApi(token, 'labels');
    var labels = result.labels || [];

    res.status(200).json({
      total: labels.length,
      labels: labels.map(function(l) {
        return { name: l.name, id: l.id, type: l.type || null };
      }),
    });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
}
