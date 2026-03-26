import { getGmailToken, gmailApi } from './_gmail.js';

function decodeBase64Url(str) {
  if (!str) return '';
  var padded = str.replace(/-/g, '+').replace(/_/g, '/');
  try { return Buffer.from(padded, 'base64').toString('utf-8'); }
  catch (e) { return ''; }
}

function extractBody(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body && payload.body.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.parts) {
    // Try text/plain first
    for (var i = 0; i < payload.parts.length; i++) {
      var part = payload.parts[i];
      if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        return decodeBase64Url(part.body.data);
      }
      if (part.parts) {
        for (var j = 0; j < part.parts.length; j++) {
          if (part.parts[j].mimeType === 'text/plain' && part.parts[j].body && part.parts[j].body.data) {
            return decodeBase64Url(part.parts[j].body.data);
          }
        }
      }
    }
    // Fallback to text/html
    for (var k = 0; k < payload.parts.length; k++) {
      var p = payload.parts[k];
      if (p.mimeType === 'text/html' && p.body && p.body.data) {
        var html = decodeBase64Url(p.body.data);
        return html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/&nbsp;/g, ' ')
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/\s+/g, ' ')
                    .trim();
      }
      if (p.parts) {
        for (var m = 0; m < p.parts.length; m++) {
          if (p.parts[m].mimeType === 'text/html' && p.parts[m].body && p.parts[m].body.data) {
            var html2 = decodeBase64Url(p.parts[m].body.data);
            return html2.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                        .replace(/<[^>]+>/g, ' ')
                        .replace(/&nbsp;/g, ' ')
                        .replace(/&amp;/g, '&')
                        .replace(/\s+/g, ' ')
                        .trim();
          }
        }
      }
    }
  }
  return '';
}

export default async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var messageId = req.query.message_id;
  if (!messageId) return res.status(400).json({ error: 'message_id required' });

  try {
    var token = await getGmailToken();
    var msg = await gmailApi(token, 'messages/' + messageId + '?format=full');
    var body = extractBody(msg.payload);

    res.status(200).json({ success: true, body: body, message_id: messageId });
  } catch (err) {
    console.error('gmail-fetch-body error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
