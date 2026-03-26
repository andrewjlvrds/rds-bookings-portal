import { getGmailToken, gmailApi } from './_gmail.js';

// Decode base64url string
function decodeBase64Url(str) {
  if (!str) return '';
  var padded = str.replace(/-/g, '+').replace(/_/g, '/');
  try { return Buffer.from(padded, 'base64').toString('utf-8'); }
  catch (e) { return ''; }
}

// Extract plain text body from Gmail message payload
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
    for (var k = 0; k < payload.parts.length; k++) {
      if (payload.parts[k].mimeType === 'text/html' && payload.parts[k].body && payload.parts[k].body.data) {
        var html = decodeBase64Url(payload.parts[k].body.data);
        return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }
    }
  }
  return '';
}

function getHeader(headers, name) {
  if (!headers) return '';
  var lower = name.toLowerCase();
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].name.toLowerCase() === lower) return headers[i].value;
  }
  return '';
}

function extractAttachments(payload) {
  var attachments = [];
  function walkParts(parts) {
    if (!parts) return;
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].filename && parts[i].filename.length > 0) {
        attachments.push({ filename: parts[i].filename, mimeType: parts[i].mimeType || '', size: parts[i].body ? parts[i].body.size || 0 : 0 });
      }
      if (parts[i].parts) walkParts(parts[i].parts);
    }
  }
  if (payload.parts) walkParts(payload.parts);
  return attachments;
}

export default async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    var lodgeEmail = req.query.lodge_email || '';
    var lodgeName = req.query.lodge_name || '';
    var checkInDate = req.query.check_in || '';
    var maxResults = parseInt(req.query.max) || 20;

    if (!lodgeEmail && !lodgeName) {
      return res.status(400).json({ error: 'lodge_email or lodge_name required' });
    }

    var token = await getGmailToken();

    // Build Gmail search query
    // Search for emails from/to the lodge email, or mentioning the lodge name
    var queryParts = [];
    if (lodgeEmail) {
      // Emails from or to this lodge address
      queryParts.push('(from:' + lodgeEmail + ' OR to:' + lodgeEmail + ')');
    } else if (lodgeName) {
      queryParts.push(lodgeName);
    }

    // Date filter: if check-in date provided, search from 6 months before to 1 month after
    if (checkInDate) {
      var checkIn = new Date(checkInDate);
      var after = new Date(checkIn);
      after.setMonth(after.getMonth() - 6);
      var before = new Date(checkIn);
      before.setMonth(before.getMonth() + 1);
      var afterStr = after.toISOString().split('T')[0].replace(/-/g, '/');
      var beforeStr = before.toISOString().split('T')[0].replace(/-/g, '/');
      queryParts.push('after:' + afterStr);
      queryParts.push('before:' + beforeStr);
    }

    var query = queryParts.join(' ');
    var listResult = await gmailApi(token, 'messages?q=' + encodeURIComponent(query) + '&maxResults=' + maxResults);
    var messages = listResult.messages || [];

    if (messages.length === 0) {
      return res.status(200).json({ success: true, emails: [], query: query });
    }

    var results = [];
    for (var i = 0; i < messages.length; i++) {
      try {
        var msg = await gmailApi(token, 'messages/' + messages[i].id + '?format=full');
        var headers = msg.payload ? msg.payload.headers : [];
        var from = getHeader(headers, 'From');
        var to = getHeader(headers, 'To');
        var subject = getHeader(headers, 'Subject');
        var date = getHeader(headers, 'Date');
        var body = extractBody(msg.payload);
        var attachments = extractAttachments(msg.payload);

        results.push({
          gmail_id: messages[i].id,
          thread_id: msg.threadId || '',
          from: from,
          to: to,
          subject: subject,
          date: date ? new Date(date).toISOString() : '',
          body: body,
          attachments: attachments,
          snippet: msg.snippet || '',
        });
      } catch (msgErr) {
        console.error('Error fetching message', messages[i].id, msgErr.message);
      }

      // Rate limit
      if (i < messages.length - 1) {
        await new Promise(function(r) { setTimeout(r, 100); });
      }
    }

    // Sort by date descending
    results.sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });

    res.status(200).json({ success: true, emails: results, query: query, total: results.length });
  } catch (err) {
    console.error('gmail-search error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
