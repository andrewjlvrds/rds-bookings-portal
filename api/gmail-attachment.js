// Download a Gmail attachment by message ID and attachment ID
// Returns the raw file for browser download

import { getGmailToken, gmailApi } from './_gmail.js';

export default async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var messageId = req.query.messageId;
  var attachmentId = req.query.attachmentId;
  var filename = req.query.filename || 'attachment';
  var mimeType = req.query.mimeType || 'application/octet-stream';

  if (!messageId || !attachmentId) {
    return res.status(400).json({ error: 'messageId and attachmentId required' });
  }

  try {
    var token = await getGmailToken();
    var result = await gmailApi(token, 'messages/' + messageId + '/attachments/' + attachmentId);

    if (!result || !result.data) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    // Gmail returns base64url — convert to standard base64
    var b64 = result.data.replace(/-/g, '+').replace(/_/g, '/');
    var buffer = Buffer.from(b64, 'base64');

    // Set download headers
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename.replace(/"/g, '') + '"');
    res.setHeader('Content-Length', buffer.length);

    return res.send(buffer);
  } catch (err) {
    console.error('gmail-attachment error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
