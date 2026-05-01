import { loadReadState, markRead, markUnread, markManyRead } from './_read-state.js';

/*
 * /api/email-read-state
 *
 *   GET                         → { state: { emailId: readAtISO, ... } }
 *   POST { email_id, read }     → marks single email read or unread
 *   POST { email_ids: [...] }   → marks many as read in one call
 *
 * Front end calls GET on portal load (one cheap blob fetch) and POSTs
 * when an email is opened. State is shared across Helen + Andrew.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const state = await loadReadState();
      return res.status(200).json({ success: true, state });
    }

    if (req.method === 'POST') {
      const body = req.body || {};

      if (Array.isArray(body.email_ids) && body.email_ids.length > 0) {
        const state = await markManyRead(body.email_ids);
        return res.status(200).json({ success: true, state, marked: body.email_ids.length });
      }

      const emailId = body.email_id;
      if (!emailId) return res.status(400).json({ error: 'email_id required' });

      const read = body.read !== false; // default true
      const state = read ? await markRead(emailId) : await markUnread(emailId);
      return res.status(200).json({ success: true, state, email_id: emailId, read });
    }

    return res.status(405).json({ error: 'GET or POST only' });
  } catch (err) {
    console.error('email-read-state error:', err);
    return res.status(500).json({ error: err.message });
  }
}
