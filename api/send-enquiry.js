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
    var tourName = body.tour_name || '';
    var lodgeName = body.lodge_name || '';

    if (!to) {
      return res.status(400).json({ error: 'No recipient email' });
    }
    if (!emailBody) {
      return res.status(400).json({ error: 'No email body' });
    }

    // Send email via Zoho CRM email API
    // We'll send from Helen's configured email in Zoho
    var emailResult = null;

    // Option 1: Use Zoho CRM send mail API (requires a record to attach to)
    // For now, we'll use a simple approach: send via the first booking record
    if (bookingIds.length > 0) {
      try {
        emailResult = await zohoApi('POST',
          'Lodge_Bookings/' + bookingIds[0] + '/actions/send_mail',
          {
            data: [{
              from: { user_name: 'Helen Sobey', email: 'helen@ridedownsouth.com' },
              to: [{ user_name: lodgeName, email: to }],
              subject: subject,
              content: emailBody.replace(/\n/g, '<br>'),
              mail_format: 'html',
            }]
          }
        );
      } catch(emailErr) {
        console.error('Zoho email send error:', emailErr.message);
        // Fall back: just update the status, log the error
        emailResult = { error: emailErr.message };
      }
    }

    // Update booking statuses to "Enquiry Sent"
    var today = new Date().toISOString().split('T')[0];
    var updateErrors = [];

    if (bookingIds.length > 0) {
      var records = bookingIds.map(function(id) {
        return {
          id: id,
          Status: 'Enquiry Sent',
          Enquiry_Sent_Date: today,
          Follow_up_Date: getFollowUpDate(today, 7),
        };
      });

      try {
        var updateResult = await zohoApi('PUT', 'Lodge_Bookings', { data: records });
        if (updateResult && updateResult.data) {
          updateResult.data.forEach(function(r) {
            if (r.status !== 'success') {
              updateErrors.push(r.message || 'Update failed');
            }
          });
        }
      } catch(updateErr) {
        updateErrors.push(updateErr.message);
      }
    }

    res.status(200).json({
      success: true,
      email_sent: !emailResult || !emailResult.error,
      email_error: emailResult && emailResult.error ? emailResult.error : null,
      bookings_updated: bookingIds.length - updateErrors.length,
      update_errors: updateErrors,
    });

  } catch(err) {
    console.error('send-enquiry error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

function getFollowUpDate(fromDate, days) {
  var d = new Date(fromDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}
