export default async function(req, res) {
  var clientId = process.env.GMAIL_CLIENT_ID;
  var redirectUri = 'https://rds-bookings-portal.vercel.app/api/gmail-callback';
  var scopes = 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify';

  var url = 'https://accounts.google.com/o/oauth2/v2/auth?' +
    'client_id=' + encodeURIComponent(clientId) +
    '&redirect_uri=' + encodeURIComponent(redirectUri) +
    '&response_type=code' +
    '&scope=' + encodeURIComponent(scopes) +
    '&access_type=offline' +
    '&prompt=consent' +
    '&login_hint=bookings@ridedownsouth.com';

  res.redirect(302, url);
}
