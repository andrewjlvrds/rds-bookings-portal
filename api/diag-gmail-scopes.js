import { getGmailToken } from './_gmail.js';

// GET /api/diag-gmail-scopes — report the OAuth scopes the token holds,
// plus full label listing (not just user type filter), so we see
// everything the token can actually see.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    var token = await getGmailToken();

    // Check scopes via tokeninfo endpoint
    var scopeRes = await fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + token);
    var scopeData = await scopeRes.json();

    // Full label list — ALL labels, not filtered
    var labelRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    var labelData = await labelRes.json();

    res.status(200).json({
      token_info: {
        scope: scopeData.scope,
        audience: scopeData.audience,
        email: scopeData.email,
        expires_in: scopeData.expires_in,
      },
      labels: {
        total: (labelData.labels || []).length,
        all: (labelData.labels || []).map(function(l) {
          return { name: l.name, id: l.id, type: l.type, messageListVisibility: l.messageListVisibility, labelListVisibility: l.labelListVisibility };
        }),
      },
    });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
}
