import { zohoApi } from './_zoho.js';
import { storeEmail, storeSentIndex } from './_email-store.js';
import { getGmailToken, getOrCreateLabel, labelMessage, tourLabelName } from './_gmail.js';
import { appendEntry } from './_activity-log.js';

// Build RFC 2822 email and base64url encode it.
// Caller must provide messageId (RFC 5322 format, including angle brackets).
// We set it explicitly so we know the exact value Gmail will use — this lets
// us build a lookup index for when lodges reply (the reply's In-Reply-To
// header will echo this ID back).
//
// inReplyTo (optional) — the RFC Message-ID we're replying to. When present,
// we add In-Reply-To and References headers so the lodge's mail client
// threads the reply correctly AND Gmail threads our outbound with the
// original thread in our sent folder.
function buildRawEmail(from, to, subject, bodyText, messageId, inReplyTo) {
  var lines = [
    'From: ' + from,
    'To: ' + to,
    'Subject: ' + subject,
    'Message-ID: ' + messageId,
  ];
  if (inReplyTo) {
    var normalized = String(inReplyTo).trim();
    if (!/^</.test(normalized)) normalized = '<' + normalized + '>';
    lines.push('In-Reply-To: ' + normalized);
    lines.push('References: ' + normalized);
  }
  lines.push('MIME-Version: 1.0');
  lines.push('Content-Type: text/plain; charset=UTF-8');
  lines.push('');
  lines.push(bodyText);
  var raw = lines.join('\r\n');

  // Base64url encode
  return Buffer.from(raw).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Generate an RFC 5322 compliant Message-ID with our domain.
// Format: <timestamp.rand@ridedownsouth.com>
function generateMessageId() {
  var ts = Date.now().toString(36);
  var rand = Math.random().toString(36).substring(2, 12);
  return '<' + ts + '.' + rand + '@ridedownsouth.com>';
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
    var tourName = body.tour_name || '';
    var isReply = body.is_reply || false;
    var inReplyTo = body.in_reply_to_message_id || null;

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
    var rfcMessageId = generateMessageId();

    try {
      var token = await getGmailToken();
      var raw = buildRawEmail(fromFull, to, subject, emailBody, rfcMessageId, inReplyTo);

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

        // Read back the actual Message-ID Gmail assigned.
        // Gmail usually respects ours but sometimes rewrites it. If it did,
        // we want to index the value that lodges will actually see and
        // reply to — that's the header on the sent message, not ours.
        var actualMessageId = rfcMessageId;
        try {
          var sentMsg = await fetch(
            'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + gmailMessageId + '?format=metadata&metadataHeaders=Message-ID',
            { headers: { 'Authorization': 'Bearer ' + token } }
          );
          if (sentMsg.ok) {
            var sentData = await sentMsg.json();
            var sentHdrs = (sentData.payload && sentData.payload.headers) || [];
            for (var shi = 0; shi < sentHdrs.length; shi++) {
              if (sentHdrs[shi].name && sentHdrs[shi].name.toLowerCase() === 'message-id') {
                actualMessageId = sentHdrs[shi].value;
                break;
              }
            }
          }
        } catch (readBackErr) {
          console.error('Failed to read back Message-ID:', readBackErr.message);
          // Fall back to our generated one — usually correct
        }

        // Write sent-index BEFORE labelling — this is the critical one.
        // If the label step fails, matching still works via Message-ID.
        // If the sent-index write fails, we fall back to subject/label matching.
        try {
          await storeSentIndex({
            rfc_message_id: actualMessageId,
            gmail_message_id: gmailMessageId,
            gmail_thread_id: gmailThreadId,
            booking_ids: bookingIds,
            tour_name: tourName,
            lodge_name: lodgeName,
            to: to,
            subject: subject,
            sent_at: new Date().toISOString(),
          });
          // Update outer var so response reflects what we actually indexed
          rfcMessageId = actualMessageId;
        } catch (sxErr) {
          console.error('Failed to write sent-index:', sxErr.message);
          // Non-fatal — email is already sent
        }

        // Apply Gmail label for the tour/lodge
        if (tourName) {
          try {
            // Label with TourName/LodgeName (e.g. "FoSA Apr 27/Hohewarte")
            var labelName = tourLabelName(tourName, lodgeName);
            var labelId = await getOrCreateLabel(token, labelName);
            if (labelId) {
              await labelMessage(token, gmailMessageId, labelId);
              console.log('Labelled sent email as', labelName);
            }
          } catch (labelErr) {
            console.error('Failed to label sent email:', labelErr.message);
          }
        }
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
            type: isReply ? 'reply' : 'enquiry',
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

      // Auto-log activity entry — the lodge action Helen would have
      // manually written in her sheet ("Emailed Hohewarte re FoSA Apr 26").
      // One entry per send, linked to all bookings included in that email.
      try {
        var actionText = isReply
          ? ('Replied to ' + (lodgeName || 'lodge'))
          : ('Emailed ' + (lodgeName || 'lodge') + (tourName ? ' re ' + tourName : ''));
        await appendEntry({
          action: actionText,
          category: 'email',
          status: 'waiting',
          recipient: lodgeName || null,
          booking_ids: bookingIds,
          tour_name: tourName || null,
          author: 'Helen', // sender hardcoded in From header; refine when toggle wired through
        });
      } catch (logErr) {
        // Logging failure should not break the send — log it and move on.
        console.error('activity-log auto-entry failed:', logErr.message);
      }
    }

    res.status(200).json({
      success: true,
      email_sent: emailSent,
      email_error: emailError,
      gmail_message_id: gmailMessageId,
      gmail_thread_id: gmailThreadId,
      rfc_message_id: rfcMessageId,
      bookings_updated: updatedCount,
      update_errors: updateErrors,
    });

  } catch(err) {
    console.error('send-enquiry error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
