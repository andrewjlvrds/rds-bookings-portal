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
