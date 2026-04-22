import { getGmailToken, gmailApi } from './_gmail.js';

// GET /api/diag-gmail-profile — who are we? Confirms the OAuth token is
// scoped to the right mailbox.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    var token = await getGmailToken();
    var profile = await gmailApi(token, 'profile');
    res.status(200).json({
      emailAddress: profile.emailAddress,
      messagesTotal: profile.messagesTotal,
      threadsTotal: profile.threadsTotal,
      historyId: profile.historyId,
    });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
}
