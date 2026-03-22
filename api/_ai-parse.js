// AI-powered email parser for lodge replies
// Uses Claude to extract structured booking data from lodge emails

var SYSTEM_PROMPT = [
  'You are a data extraction assistant for Ride Down South (RDS), a motorcycle tour company in Southern Africa.',
  'Read emails from lodges/hotels and extract structured booking information.',
  '',
  'RDS sends enquiry emails to lodges requesting availability for motorcycle tour groups.',
  'Lodges reply with availability confirmations, quotes, proforma invoices, or cancellation responses.',
  '',
  'EXTRACT THESE FIELDS (only if explicitly stated):',
  '',
  '1. email_type: "availability_confirmation" | "availability_denial" | "proforma_invoice" | "cancellation_response" | "payment_confirmation" | "general_correspondence" | "rate_card"',
  '2. availability: "confirmed" | "denied" | "waitlisted" | "alternatives_offered" | null',
  '3. booking_reference: Lodge\'s booking/reservation reference number',
  '4. total_amount: Total accommodation cost (numeric only, no symbols)',
  '5. currency: "ZAR" | "USD" | "EUR" | "BWP" | "NAD" | "SZL" | "ZMW" | "MZN" | null',
  '6. deposit_amount: Deposit amount (numeric)',
  '7. deposit_due_date: When deposit is due (YYYY-MM-DD)',
  '8. payment_2_amount: Second payment amount',
  '9. payment_2_due_date: Second payment due date (YYYY-MM-DD)',
  '10. cancellation_policy: Summary of cancellation terms',
  '11. cancel_free_before: Last date for free cancellation (YYYY-MM-DD)',
  '12. contact_name: Name of person who sent the email',
  '13. reservation_comments: Important notes, special conditions from lodge',
  '14. meals: "BB" | "HB" | "FB" | "DBB" | "AI" | "SC" | "RO" | null',
  '15. suggested_status: "Availability Confirmed" | "Not Available" | "Proforma Received" | "Waitlisted" | "Cancelled" | null',
  '',
  'RULES:',
  '- Only extract explicitly stated information. Do NOT guess.',
  '- For each field, provide confidence: "high", "medium", or "low".',
  '- Amounts: numeric only (e.g. 15000 not "R15,000"). If multiple line items, sum for total.',
  '- Dates: YYYY-MM-DD format.',
  '- Southern African lodges quote in ZAR, NAD, BWP, USD etc.',
  '- "STO rate" = Special Tour Operator rate (discounted).',
  '- If email is just confirming availability without rates, suggested_status should be "Availability Confirmed".',
  '- If email includes a proforma/invoice with amounts, suggested_status should be "Proforma Received".',
  '',
  'RESPOND WITH VALID JSON ONLY:',
  '{',
  '  "extracted": {',
  '    "field_name": { "value": <value>, "confidence": "high|medium|low" }',
  '  },',
  '  "summary": "One sentence summary",',
  '  "requires_action": "Action needed from RDS, or null",',
  '  "flags": ["anything unusual"]',
  '}'
].join('\n');

// Field mapping: AI field name → Zoho API field name
var FIELD_MAP = {
  availability: {
    zoho: 'Lodge_Availability',
    transform: function(v) {
      var map = { confirmed: 'Available', denied: 'Not Available', waitlisted: 'Waitlisted', alternatives_offered: 'Alternatives Offered' };
      return map[v] || v;
    }
  },
  booking_reference: { zoho: 'Lodge_Reference' },
  total_amount: { zoho: 'Total_Amount' },
  currency: { zoho: 'Lodge_Currency' },
  deposit_amount: { zoho: 'Deposit_Amount' },
  deposit_due_date: { zoho: 'Deposit_Due_Date' },
  payment_2_amount: { zoho: 'Second_Payment_Amount' },
  payment_2_due_date: { zoho: 'Second_Payment_Due_Date' },
  cancellation_policy: { zoho: 'Cancellation_Policy_Text' },
  cancel_free_before: { zoho: 'Cancel_Free_Before' },
  contact_name: { zoho: 'Contact_Name' },
  reservation_comments: { zoho: 'Reservation_Comments' },
  meals: { zoho: 'Meals' },
  suggested_status: { zoho: 'Status' },
};

export async function parseEmail(emailBody, bookingContext) {
  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  var userMessage = '';

  if (bookingContext) {
    userMessage += '--- BOOKING CONTEXT ---\n';
    userMessage += 'Lodge: ' + (bookingContext.lodge_name || 'Unknown') + '\n';
    userMessage += 'Tour: ' + (bookingContext.tour_name || 'Unknown') + '\n';
    userMessage += 'Check-in: ' + (bookingContext.check_in || 'Unknown') + '\n';
    userMessage += 'Check-out: ' + (bookingContext.check_out || 'Unknown') + '\n';
    userMessage += 'Nights: ' + (bookingContext.nights || 'Unknown') + '\n';
    userMessage += 'Current status: ' + (bookingContext.status || 'Unknown') + '\n';
    userMessage += '--- END CONTEXT ---\n\n';
  }

  userMessage += '--- EMAIL ---\n' + emailBody + '\n--- END EMAIL ---';

  var response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    var errText = await response.text();
    throw new Error('Claude API error: ' + response.status + ' ' + errText);
  }

  var data = await response.json();

  // Extract text from response
  var text = '';
  for (var i = 0; i < data.content.length; i++) {
    if (data.content[i].type === 'text') text += data.content[i].text;
  }

  // Strip markdown fences and parse JSON
  text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

  try {
    return JSON.parse(text);
  } catch (e) {
    console.error('AI returned invalid JSON:', text.substring(0, 300));
    throw new Error('AI returned invalid JSON');
  }
}

// Convert AI extraction to Zoho field updates
// Only includes fields with high or medium confidence
export function extractionToZohoFields(extraction) {
  var confidenceLevels = { high: 3, medium: 2, low: 1 };
  var minLevel = 2; // medium or higher

  var extracted = extraction.extracted || {};
  var updates = {};
  var flagged = {};

  var keys = Object.keys(extracted);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var field = extracted[key];

    if (!field || field.value === null || field.value === undefined) continue;

    var level = confidenceLevels[field.confidence] || 0;
    var mapping = FIELD_MAP[key];
    if (!mapping) continue;

    if (level >= minLevel) {
      var value = field.value;
      if (mapping.transform) value = mapping.transform(value);
      updates[mapping.zoho] = value;
    } else {
      flagged[key] = { value: field.value, confidence: field.confidence, zoho_field: mapping.zoho };
    }
  }

  return { updates: updates, flagged: flagged, has_flags: Object.keys(flagged).length > 0 };
}
