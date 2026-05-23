import { getGmailToken, gmailApi } from './_gmail.js';

export default async function handler(req, res) {
  const msgId = req.query.msg_id;
  if (!msgId) return res.status(400).json({ error: 'msg_id required' });
  const token = await getGmailToken();
  const msg = await gmailApi(token, 'messages/' + msgId + '?format=full');
  
  function describePayload(p, depth) {
    if (!p) return null;
    const out = {
      mimeType: p.mimeType,
      hasData: !!(p.body && p.body.data),
      dataLen: p.body && p.body.data ? p.body.data.length : 0,
      attachmentId: p.body && p.body.attachmentId ? p.body.attachmentId.substring(0,20)+'...' : null,
      filename: p.filename || null,
      size: p.body && p.body.size ? p.body.size : 0,
    };
    if (p.parts && depth < 4) out.parts = p.parts.map(pp => describePayload(pp, depth+1));
    return out;
  }
  
  res.json({ payload: describePayload(msg.payload, 0) });
}
