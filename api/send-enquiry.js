import { zohoApi } from './_zoho.js';

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

    if (!to) {
      return res.status(400).json({ error: 'No recipient email' });
    }
    if (!emailBody) {
      return res.status(400).json({ error: 'No email body' });
    }
    if (!bookingIds.length) {
      return res.status(400).json({ error: 'No booking IDs' });
    }

    // Send email via Zoho CRM send_mail action on the first booking record
    // This links the email thread to the booking record in Zoho
    // Replies from the lodge will appear on this record
    var primaryBookingId = bookingIds[0];
    var fromEmail = process.env.SEND_FROM_EMAIL || 'bookings@ridedownsouth.com';
    var fromName = process.env.SEND_FROM_NAME || 'Helen Sobey';

    // Convert plain text body to HTML (preserve line breaks)
    var htmlBody = emailBody
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');

    var emailPayload = {
      data: [{
        from: { user_name: fromName, email: fromEmail },
        to: [{ user_name: lodgeName || to, email: to }],
        subject: subject,
        content: htmlBody,
        mail_format: 'html',
      }]
    };

    var emailSent = false;
    var emailError = null;

    try {
      var emailResult = await zohoApi('POST',
        'Lodge_Bookings/' + primaryBookingId + '/actions/send_mail',
        emailPayload
      );
      emailSent = true;
    } catch(emailErr) {
      emailError = emailErr.message;
      console.error('Email send failed:', emailErr.message);
    }

    // Update all booking statuses to "Enquiry Sent" regardless of email success
    // (if email failed, operator can resend manually)
    var today = new Date().toISOString().split('T')[0];
    var followUp = new Date();
    followUp.setDate(followUp.getDate() + 7);
    var followUpDate = followUp.toISOString().split('T')[0];

    var updateRecords = bookingIds.map(function(id) {
      return {
        id: id,
        Status: 'Enquiry Sent',
      };
    });

    // Try to set date fields — these might fail if not in API yet
    try {
      updateRecords.forEach(function(r) {
        r.Enquiry_Sent_Date = today;
        r.Follow_up_Date = followUpDate;
      });
    } catch(e) {}

    var updatedCount = 0;
    var updateErrors = [];

    try {
      var updateResult = await zohoApi('PUT', 'Lodge_Bookings', { data: updateRecords });
      if (updateResult && updateResult.data) {
        updateResult.data.forEach(function(r) {
          if (r.status === 'success') {
            updatedCount++;
          } else {
            updateErrors.push(r.message || 'Update failed');
          }
        });
      }
    } catch(updateErr) {
      updateErrors.push(updateErr.message);
    }

    res.status(200).json({
      success: true,
      email_sent: emailSent,
      email_error: emailError,
      bookings_updated: updatedCount,
      update_errors: updateErrors,
    });

  } catch(err) {
    console.error('send-enquiry error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
