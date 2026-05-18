// Shared Gmail API helper

export async function getGmailToken() {
  var response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }).toString(),
  });
  var data = await response.json();
  if (data.error) throw new Error('Gmail auth: ' + data.error);
  return data.access_token;
}

export async function gmailApi(token, path) {
  var response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/' + path, {
    headers: { 'Authorization': 'Bearer ' + token },
  });
  if (!response.ok) {
    var text = await response.text();
    throw new Error('Gmail API error: ' + response.status + ' ' + text);
  }
  return response.json();
}

// Cache for label IDs to avoid repeated lookups
var labelCache = {};

// Get or create a Gmail label, returns the label ID
// Supports nested labels like "Lodge Bookings/FoSA MAR27"
export async function getOrCreateLabel(token, labelName) {
  // Check cache first
  if (labelCache[labelName]) return labelCache[labelName];

  // Fetch all labels
  var labelsResult = await gmailApi(token, 'labels');
  var labels = labelsResult.labels || [];

  // Case-insensitive match — Gmail treats labels as distinct even with different casing,
  // so we normalise here to avoid creating e.g. "bahnhof" alongside "Bahnhof Hotel"
  var labelNameLower = labelName.toLowerCase();
  var existing = labels.find(function(l) { return l.name.toLowerCase() === labelNameLower; });
  if (existing) {
    labelCache[labelName] = existing.id;
    return existing.id;
  }

  // Create the parent label first if nested (e.g. "Lodge Bookings" before "Lodge Bookings/FoSA MAR27")
  var parts = labelName.split('/');
  if (parts.length > 1) {
    var parentName = parts[0];
    var parentExists = labels.find(function(l) { return l.name === parentName; });
    if (!parentExists) {
      try {
        var parentRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: parentName,
            labelListVisibility: 'labelShow',
            messageListVisibility: 'show',
          }),
        });
        var parentData = await parentRes.json();
        if (parentData.id) {
          labelCache[parentName] = parentData.id;
        }
      } catch (e) {
        console.error('Failed to create parent label:', parentName, e.message);
      }
    }
  }

  // Create the label
  try {
    var createRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: labelName,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
      }),
    });
    var createData = await createRes.json();
    if (createData.id) {
      labelCache[labelName] = createData.id;
      return createData.id;
    } else {
      console.error('Failed to create label:', labelName, JSON.stringify(createData));
      return null;
    }
  } catch (e) {
    console.error('Error creating label:', labelName, e.message);
    return null;
  }
}

// Apply a label to a Gmail message
export async function labelMessage(token, messageId, labelId) {
  if (!messageId || !labelId) return false;
  try {
    var res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + messageId + '/modify', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        addLabelIds: [labelId],
        removeLabelIds: ['INBOX'],
      }),
    });
    return res.ok;
  } catch (e) {
    console.error('Failed to label message:', messageId, e.message);
    return false;
  }
}

// Build a tour label name: "FoSA Mar 27" → "FoSA Mar 27"
// With lodge: "FoSA Mar 27" + "Hohewarte" → "FoSA Mar 27/Hohewarte"
export function tourLabelName(tourName, lodgeName) {
  var base = tourName || 'Unassigned';
  if (lodgeName) return base + '/' + lodgeName;
  return base;
}
