import { zohoApi } from './_zoho.js';
import { storeEmail } from './_email-store.js';
import { getGmailToken } from './_gmail.js';

// Build RFC 2822 email and base64url encode it
function buildRawEmail(from, to, subject, bodyText) {
  var boundary = 'boundary_' + Date.now();
  var raw = [
    'From: ' + from,
    'To: ' + to,
    'Subject: ' + subject,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    bodyText,
  ].join('\r\n');

  // Base64url encode
  return Buffer.from(raw).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export default async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  try {
    var body = req.body || {};
    var to = body.to;
    var subject = body.subject || '';
    var emailBody = body.body || '';
    var bookingIds = body.booking_ids || [];
    var lodgeName = body.lodge_name || '';
    var isReply = body.is_reply || false;

    if (!to) return res.status(400).json({ error: 'No recipient email' });
    if (!emailBody) return res.status(400).json({ error: 'No email body' });
    if (!bookingIds.length) return res.status(400).json({ error: 'No booking IDs' });

    var fromEmail = 'bookings@ridedownsouth.com';
    var fromName = 'Helen Baker';
    var fromFull = fromName + ' <' + fromEmail + '>';

    // Send via Gmail API
    var emailSent = false;
    var emailError = null;
    var gmailMessageId = null;
    var gmailThreadId = null;

    try {
      var token = await getGmailToken();
      var raw = buildRawEmail(fromFull, to, subject, emailBody);

      var gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: raw }),
      });

      var gmailData = await gmailRes.json();

      if (gmailData.id) {
        emailSent = true;
        gmailMessageId = gmailData.id;
        gmailThreadId = gmailData.threadId;
      } else {
        emailError = gmailData.error ? gmailData.error.message : 'Gmail send failed';
      }
    } catch(emailErr) {
      emailError = emailErr.message;
      console.error('Gmail send failed:', emailErr.message);
    }

    // Update booking status if email sent
    var today = new Date().toISOString().split('T')[0];
    var followUp = new Date();
    followUp.setDate(followUp.getDate() + 7);
    var followUpDate = followUp.toISOString().split('T')[0];

    var updatedCount = 0;
    var updateErrors = [];

    if (emailSent && bookingIds.length > 0 && !isReply) {
      var updateRecords = bookingIds.map(function(id) {
        return { id: id, Status: 'Enquiry Sent', Enquiry_Sent_Date: today, Follow_up_Date: followUpDate };
      });

      console.log('Updating', bookingIds.length, 'bookings to Enquiry Sent:', JSON.stringify(bookingIds));

      try {
        var updateResult = await zohoApi('PUT', 'Lodge_Bookings', { data: updateRecords });
        console.log('Zoho update result:', JSON.stringify(updateResult));
        if (updateResult && updateResult.data) {
          updateResult.data.forEach(function(r) {
            if (r.status === 'success') updatedCount++;
            else {
              console.error('Zoho update item failed:', JSON.stringify(r));
              updateErrors.push(r.message || r.code || 'Update failed');
            }
          });
        } else {
          console.error('Zoho update returned no data:', JSON.stringify(updateResult));
          updateErrors.push('No data in update response');
        }
      } catch(updateErr) {
        console.error('Zoho status update failed:', updateErr.message);
        updateErrors.push(updateErr.message);
      }
    }

    // Store sent email in blob for email thread display
    if (emailSent) {
      for (var bi = 0; bi < bookingIds.length; bi++) {
        try {
          await storeEmail({
            booking_id: bookingIds[bi],
            message_id: gmailMessageId,
            type: 'enquiry',
            direction: 'outbound',
            email_from: 'bookings@ridedownsouth.com',
            email_to: to,
            email_subject: subject,
            email_content: emailBody,
            email_date: new Date().toISOString(),
            gmail_thread_id: gmailThreadId,
          });
        } catch(storeErr) {
          console.error('Failed to store email for booking', bookingIds[bi], storeErr.message);
        }
      }
    }

    res.status(200).json({
      success: true,
      email_sent: emailSent,
      email_error: emailError,
      gmail_message_id: gmailMessageId,
      gmail_thread_id: gmailThreadId,
      bookings_updated: updatedCount,
      update_errors: updateErrors,
    });

  } catch(err) {
    console.error('send-enquiry error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
