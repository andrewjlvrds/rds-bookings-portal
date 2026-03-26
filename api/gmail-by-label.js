import { getGmailToken, gmailApi } from './_gmail.js';

function decodeBase64Url(str) {
  if (!str) return '';
  var padded = str.replace(/-/g, '+').replace(/_/g, '/');
  try { return Buffer.from(padded, 'base64').toString('utf-8'); }
  catch (e) { return ''; }
}

function getHeader(headers, name) {
  if (!headers) return '';
  var h = headers.find(function(x) { return x.name.toLowerCase() === name.toLowerCase(); });
  return h ? h.value : '';
}

function extractBody(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body && payload.body.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.parts) {
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
    // Fallback to HTML
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

function extractAttachments(payload) {
  var attachments = [];
  if (!payload || !payload.parts) return attachments;
  payload.parts.forEach(function(part) {
    if (part.filename && part.filename.length > 0) {
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType,
        size: part.body ? part.body.size : 0,
      });
    }
    if (part.parts) {
      part.parts.forEach(function(sub) {
        if (sub.filename && sub.filename.length > 0) {
          attachments.push({
            filename: sub.filename,
            mimeType: sub.mimeType,
            size: sub.body ? sub.body.size : 0,
          });
        }
      });
    }
  });
  return attachments;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  var labelId = req.query.label_id;
  if (!labelId) return res.status(400).json({ error: 'label_id required' });

  var maxResults = parseInt(req.query.max_results) || 50;
  var pageToken = req.query.page_token || '';

  try {
    var token = await getGmailToken();

    // List messages with this label
    var listPath = 'messages?labelIds=' + encodeURIComponent(labelId) + '&maxResults=' + maxResults;
    if (pageToken) listPath += '&pageToken=' + encodeURIComponent(pageToken);

    var listResult = await gmailApi(token, listPath);
    var messageRefs = listResult.messages || [];
    var nextPageToken = listResult.nextPageToken || null;

    if (messageRefs.length === 0) {
      return res.status(200).json({
        success: true,
        emails: [],
        count: 0,
        nextPageToken: null,
      });
    }

    // Fetch full messages in batches of 10
    var emails = [];
    for (var i = 0; i < messageRefs.length; i += 10) {
      var batch = messageRefs.slice(i, i + 10);
      var fetched = await Promise.all(batch.map(async function(ref) {
        try {
          var msg = await gmailApi(token, 'messages/' + ref.id + '?format=full');
          var headers = msg.payload ? msg.payload.headers : [];
          var from = getHeader(headers, 'From');
          var to = getHeader(headers, 'To');
          var subject = getHeader(headers, 'Subject');
          var date = getHeader(headers, 'Date');
          var body = extractBody(msg.payload);
          var attachments = extractAttachments(msg.payload);

          // Determine direction
          var isOutbound = from.toLowerCase().includes('bookings@ridedownsouth.com') ||
                           from.toLowerCase().includes('andrew@ridedownsouth.com');

          // Get all label names for this message
          var labelIds = msg.labelIds || [];

          return {
            id: msg.id,
            threadId: msg.threadId,
            from: from,
            to: to,
            subject: subject,
            date: date,
            body: body,
            direction: isOutbound ? 'outbound' : 'inbound',
            attachments: attachments,
            labelIds: labelIds,
            snippet: msg.snippet || '',
          };
        } catch (e) {
          console.error('Failed to fetch message:', ref.id, e.message);
          return null;
        }
      }));
      fetched.forEach(function(e) { if (e) emails.push(e); });
    }

    // Sort by date descending
    emails.sort(function(a, b) {
      return new Date(b.date || 0) - new Date(a.date || 0);
    });

    res.status(200).json({
      success: true,
      emails: emails,
      count: emails.length,
      nextPageToken: nextPageToken,
    });
  } catch (err) {
    console.error('gmail-by-label error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
