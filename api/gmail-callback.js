export default async function(req, res) {
  var code = req.query.code;
  var error = req.query.error;

  if (error) {
    return res.status(400).send('OAuth error: ' + error);
  }

  if (!code) {
    return res.status(400).send('No authorization code received');
  }

  try {
    var response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: code,
        client_id: process.env.GMAIL_CLIENT_ID,
        client_secret: process.env.GMAIL_CLIENT_SECRET,
        redirect_uri: 'https://rds-bookings-portal.vercel.app/api/gmail-callback',
        grant_type: 'authorization_code',
      }).toString(),
    });

    var data = await response.json();

    if (data.error) {
      return res.status(400).send('Token error: ' + data.error + ' - ' + (data.error_description || ''));
    }

    // Display the refresh token for the user to copy into Vercel env vars
    res.status(200).send(`
      <html>
      <body style="font-family: sans-serif; max-width: 600px; margin: 40px auto; padding: 20px;">
        <h2 style="color: #1a7f37;">Gmail OAuth Success</h2>
        <p>bookings@ridedownsouth.com has been authorized.</p>
        <p>Add this refresh token as <strong>GMAIL_REFRESH_TOKEN</strong> in Vercel environment variables:</p>
        <textarea style="width: 100%; height: 80px; font-family: monospace; font-size: 12px; padding: 8px;" readonly onclick="this.select()">${data.refresh_token}</textarea>
        <p style="color: #666; font-size: 13px; margin-top: 16px;">
          Also add these if not already set:<br>
          GMAIL_CLIENT_ID = ${process.env.GMAIL_CLIENT_ID}<br>
          GMAIL_CLIENT_SECRET = (already in env)
        </p>
        <p style="color: #666; font-size: 13px;">You can close this page after copying the refresh token.</p>
      </body>
      </html>
    `);

  } catch(err) {
    res.status(500).send('Error exchanging code: ' + err.message);
  }
}
