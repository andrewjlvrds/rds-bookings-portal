// AI-powered email parser for lodge replies
// Uses Claude to extract structured booking data from lodge emails

var SYSTEM_PROMPT = [
  'You are a data extraction assistant for Ride Down South (RDS), a motorcycle tour company in Southern Africa.',
  'Read emails from lodges/hotels and extract structured booking information.',
  '',
  'RDS sends enquiry emails to lodges requesting availability for motorcycle tour groups.',
  'Lodges reply with availability confirmations, quotes, proforma invoices, or cancellation responses.',
  '',
  'IMPORTANT: The email content may include text extracted from PDF or Excel attachments.',
  'Attachment content appears between --- ATTACHMENT: filename --- and --- END ATTACHMENT --- markers.',
  'Attachments often contain proforma invoices, rate cards, or booking confirmations with critical data.',
  'When attachments are present, PRIORITISE data from attachments over email body text — the attachment',
  'is usually the authoritative source for amounts, dates, payment terms, and cancellation policies.',
  '',
  'EXTRACT THESE FIELDS (only if explicitly stated):',
  '',
  '1. email_type: "availability_confirmation" | "availability_denial" | "proforma_invoice" | "cancellation_response" | "payment_confirmation" | "general_correspondence" | "rate_card" | "partial_availability"',
  '2. availability: "confirmed" | "denied" | "waitlisted" | "alternatives_offered" | "partial" | null',
  '   Use "partial" when the lodge offers FEWER rooms than requested. Compare rooms offered against "Rooms requested" in the booking context.',
  '   If the lodge says they cannot accommodate all rooms, or offers fewer than requested, or mentions rooms being short — this is "partial".',
  '   If they mention a specific number of rooms and it is less than the requested total, this is "partial".',
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
  '13. reservation_comments: Important notes, special conditions, partial availability details.',
  '    For partial availability, include EXACTLY what rooms are offered and what is pending.',
  '    Format: "Confirmed: 8 standard, 1 honeymoon, 2 family (11 total). Pending: 2 more rooms (waiting for group cancellation)."',
  '14. meals: "BB" | "HB" | "FB" | "DBB" | "AI" | "SC" | "RO" | null',
  '15. suggested_status: "Availability Confirmed" | "Not Available" | "Proforma Received" | "Waitlisted" | "Cancelled" | "Deposit Paid" | "Balance Paid" | null',
  '16. rooms_offered: Short summary of rooms actually offered by the lodge, e.g. "8 std, 1 honeymoon, 2 family" or "13 rooms confirmed". Only extract if the lodge specifies room types/counts.',
  '',
  'PAYMENT RECEIPT FIELDS (extract when email confirms a payment was received):',
  '17. payment_received_amount: Amount received/paid (numeric)',
  '18. payment_received_date: Date payment was received (YYYY-MM-DD)',
  '19. payment_received_currency: Currency of payment received',
  '20. payment_method: "EFT" | "credit_card" | "bank_transfer" | "cash" | "other" | null',
  '21. receipt_reference: Receipt or transaction reference number from the lodge',
  '22. balance_due: Remaining balance after payment (numeric, if stated)',
  '23. payment_slot: Which payment this relates to: "deposit" | "2nd_payment" | "3rd_payment" | "4th_payment" | null (infer from context — e.g. if they say "deposit received" → "deposit")',
  '',
  'RATE CARD RULES:',
  '- If the email includes a rate card or rate sheet (often as an attachment), extract the relevant rates.',
  '- Match rates to the booking dates. Use the rate card period that covers the check-in date from the booking context.',
  '- If both RACK and STO rates are given, use the STO rate (tour operator rate).',
  '- If rooms_offered lists specific room types AND rates are available, calculate total_amount by multiplying each room type count by its per-night rate by number of nights.',
  '- Include the calculation in reservation_comments so RDS can verify, e.g. "STO rates: 8 × R1395 + 1 × R2362.50 + 2 × R2461.50 = R18,445 per night × 1 night = R18,445".',
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
  '- If email confirms a payment was received (receipt, proof of payment, "thank you for payment"), email_type should be "payment_confirmation".',
  '- For payment confirmations, extract payment_received_amount, payment_received_date, and payment_slot. If the lodge mentions "deposit" → payment_slot is "deposit". If they mention "balance" or "final payment" → infer the appropriate slot.',
  '- If payment confirmation and deposit was paid, suggested_status should be "Deposit Paid". If balance/final payment, "Balance Paid".',
  '',
  'VALIDATION — COMPARE LODGE RESPONSE AGAINST BOOKING CONTEXT:',
  'After extracting fields, compare what the lodge has quoted/confirmed against the booking context above.',
  'Check for discrepancies in:',
  '- CHECK-IN DATE: Does the lodge\'s invoice/confirmation date match the requested check-in?',
  '- CHECK-OUT DATE: Does it match the requested check-out?',
  '- NUMBER OF NIGHTS: Does the number of nights on the invoice match what was requested?',
  '- ROOM COUNT: Does the total number of rooms (guest + guide) match what was requested?',
  '  Room config format is "single/twin/double/guides" e.g. "8/2/1/3" means 8 single, 2 twin, 1 double, 3 guide rooms.',
  '  Count total rooms in the lodge response and compare against the total from the config.',
  '- GUEST COUNT: Does the number of guests/pax on the invoice match expected pax from the room config?',
  '  Expected pax = singles + (twins × 2) + (doubles × 2). Guides are separate.',
  '- MEAL BASIS: Does the meal basis match what was requested (BB, DBB, HB, FB etc)?',
  '',
  'Only flag CLEAR discrepancies — not minor formatting differences.',
  'If the booking context field is "Unknown" or empty, skip that check.',
  '',
  'Include discrepancies in the output as an array. Each discrepancy should have:',
  '- field: what was checked (e.g. "check_in", "nights", "room_count", "guest_count", "meals")',
  '- expected: what RDS requested (from booking context)',
  '- received: what the lodge quoted/confirmed',
  '- severity: "high" (wrong dates or significantly wrong counts) or "medium" (minor count differences, meal basis)',
  '',
  'RESPOND WITH VALID JSON ONLY:',
  '{',
  '  "extracted": {',
  '    "field_name": { "value": <value>, "confidence": "high|medium|low" }',
  '  },',
  '  "discrepancies": [',
  '    { "field": "check_in", "expected": "2026-05-02", "received": "2026-05-03", "severity": "high" }',
  '  ],',
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
      var map = { confirmed: 'Available', denied: 'Not Available', waitlisted: 'Waitlisted', alternatives_offered: 'Alternatives Offered', partial: 'Partially Available' };
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
  rooms_offered: { zoho: 'Reservation_Comments', transform: function(v) { return 'Rooms: ' + v; } },
  // Receipt fields — mapped dynamically based on payment_slot
  balance_due: { zoho: 'Balance_Due' },
  receipt_reference: { zoho: 'Payment_Note', transform: function(v) { return 'Receipt: ' + v; } },
  // payment_received_amount, payment_received_date, payment_slot handled in extractionToZohoFields
};

// Map payment slot to Zoho field prefixes
var SLOT_FIELD_MAP = {
  deposit: { paid_date: 'Deposit_Paid_Date', paid_amount: 'Deposit_Paid_Amount' },
  '2nd_payment': { paid_date: 'nd_Payment_Paid_Date', paid_amount: 'nd_Payment_Paid_Amount' },
  '3rd_payment': { paid_date: 'rd_Payment_Paid_Date', paid_amount: 'rd_Payment_Paid_Amount' },
  '4th_payment': { paid_date: 'th_Payment_Paid_Date', paid_amount: 'th_Payment_Paid_Amount' },
};

// Status order — AI may only advance status, never regress it.
// A lodge reply that mentions availability on a "Deposit Paid" booking
// should not silently reset status to "Availability Confirmed".
var STATUS_ORDER = [
  'Not Started',
  'Ready to Send',
  'Enquiry Sent',
  'Availability Confirmed',
  'Confirmed',
  'Proforma Received',
  'Deposit Paid',
  'Balance Paid',
  // These sit outside the main flow — AI can set them from any state
  'Not Available',
  'Waitlisted',
  'Cancelled',
];
var STATUS_FLOW_ORDER = [
  'Not Started', 'Ready to Send', 'Enquiry Sent',
  'Availability Confirmed', 'Confirmed', 'Proforma Received',
  'Deposit Paid', 'Balance Paid',
];
// Returns true if newStatus is an advancement (or a valid side-state)
function isStatusAdvancement(currentStatus, newStatus) {
  var sideStates = new Set(['Not Available', 'Waitlisted', 'Cancelled', 'Credit against booking']);
  if (sideStates.has(newStatus)) return true; // always allow side-states
  var cur = STATUS_FLOW_ORDER.indexOf(currentStatus);
  var next = STATUS_FLOW_ORDER.indexOf(newStatus);
  if (next === -1) return false; // unknown status — don't write
  if (cur === -1) return true;  // current unknown — allow
  return next > cur;            // only advance
}

export async function parseEmail(emailBody, bookingContext) {
  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  var userMessage = '';

  if (bookingContext) {
    userMessage += '--- BOOKING CONTEXT (what RDS requested) ---\n';
    userMessage += 'Lodge: ' + (bookingContext.lodge_name || 'Unknown') + '\n';
    userMessage += 'Tour: ' + (bookingContext.tour_name || 'Unknown') + '\n';
    userMessage += 'Check-in: ' + (bookingContext.check_in || 'Unknown') + '\n';
    userMessage += 'Check-out: ' + (bookingContext.check_out || 'Unknown') + '\n';
    userMessage += 'Nights: ' + (bookingContext.nights || 'Unknown') + '\n';
    userMessage += 'Current status: ' + (bookingContext.status || 'Unknown') + '\n';
    if (bookingContext.rooms_requested) {
      userMessage += 'Room config requested (single/twin/double/guides): ' + bookingContext.rooms_requested + '\n';
    }
    if (bookingContext.guide_rooms) {
      userMessage += 'Guide rooms: ' + bookingContext.guide_rooms + '\n';
    }
    if (bookingContext.meals_requested) {
      userMessage += 'Meal basis requested: ' + bookingContext.meals_requested + '\n';
    }
    if (bookingContext.deposit_amount) {
      userMessage += 'Deposit amount: ' + bookingContext.deposit_amount + ' (paid: ' + (bookingContext.deposit_paid || 'unknown') + ')\n';
    }
    if (bookingContext.payment_2_amount) {
      userMessage += '2nd payment amount: ' + bookingContext.payment_2_amount + ' (paid: ' + (bookingContext.payment_2_paid || 'unknown') + ')\n';
    }
    if (bookingContext.payment_3_amount) {
      userMessage += '3rd payment amount: ' + bookingContext.payment_3_amount + ' (paid: ' + (bookingContext.payment_3_paid || 'unknown') + ')\n';
    }
    if (bookingContext.payment_4_amount) {
      userMessage += '4th payment amount: ' + bookingContext.payment_4_amount + ' (paid: ' + (bookingContext.payment_4_paid || 'unknown') + ')\n';
    }
    if (bookingContext.has_attachments) {
      userMessage += 'Attachments included: ' + (bookingContext.attachment_filenames || []).join(', ') + '\n';
      userMessage += 'Note: Attachment text is appended below the email body. Prioritise data from attachments.\n';
    }
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
// Financial amount fields that must NEVER be silently overwritten.
// If a value already exists in Zoho, the parsed value is demoted to flagged
// (shown in the UI for Helen to act on) rather than written automatically.


var PROTECTED_AMOUNT_FIELDS = new Set([
  'Total_Amount',
  'Deposit_Amount',
  'Second_Payment_Amount',
  'Third_Payment_Amount',
  'Fourth_Payment_Amount',
  'Deposit_Due_Date',
  'Second_Payment_Due_Date',
  'Third_Payment_Due_Date',
  'Fourth_Payment_Due_Date',
]);

// Only includes fields with medium+ confidence.
// Pass existingZohoValues (object keyed by Zoho field name) to protect
// financial fields from silent overwrites.
// existingZohoValues should include Status (as existing.Status) for the
// forward-only status guard.
export function extractionToZohoFields(extraction, existingZohoValues) {
  var confidenceLevels = { high: 3, medium: 2, low: 1 };
  var minLevel = 2; // medium or higher
  var existing = existingZohoValues || {};
  var currentStatus = existing.Status || '';

  var extracted = extraction.extracted || {};
  var updates = {};
  var flagged = {};

  // Determine payment slot first (needed for receipt field mapping)
  var paymentSlot = null;
  if (extracted.payment_slot && extracted.payment_slot.value) {
    var slotConf = confidenceLevels[extracted.payment_slot.confidence] || 0;
    if (slotConf >= minLevel) {
      paymentSlot = extracted.payment_slot.value;
    }
  }

  var keys = Object.keys(extracted);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var field = extracted[key];

    if (!field || field.value === null || field.value === undefined) continue;

    var level = confidenceLevels[field.confidence] || 0;

    // Handle slot-based payment fields
    if (key === 'payment_received_amount' && paymentSlot && SLOT_FIELD_MAP[paymentSlot]) {
      if (level >= minLevel) {
        updates[SLOT_FIELD_MAP[paymentSlot].paid_amount] = field.value;
      } else {
        flagged[key] = { value: field.value, confidence: field.confidence, zoho_field: SLOT_FIELD_MAP[paymentSlot].paid_amount };
      }
      continue;
    }

    if (key === 'payment_received_date' && paymentSlot && SLOT_FIELD_MAP[paymentSlot]) {
      if (level >= minLevel) {
        updates[SLOT_FIELD_MAP[paymentSlot].paid_date] = field.value;
      } else {
        flagged[key] = { value: field.value, confidence: field.confidence, zoho_field: SLOT_FIELD_MAP[paymentSlot].paid_date };
      }
      continue;
    }

    // Skip fields handled above or without mapping
    if (key === 'payment_slot' || key === 'payment_received_currency' || key === 'payment_method') continue;

    var mapping = FIELD_MAP[key];
    if (!mapping) continue;

    if (level >= minLevel) {
      var value = field.value;
      if (mapping.transform) value = mapping.transform(value);

      // Protected financial fields: never auto-write if Zoho already has a value,
      // or if the field is Total_Amount (always requires human review).
      var zohoField = mapping.zoho;
      var isProtected = PROTECTED_AMOUNT_FIELDS.has(zohoField);
      var existingVal = existing[zohoField];
      var existingIsSet = existingVal !== null && existingVal !== undefined && existingVal !== '' && existingVal !== 0;
      if (isProtected && existingIsSet) {
        // Demote to flagged — Helen will see the parsed value but it won't be written
        flagged[key] = {
          value: value,
          confidence: field.confidence,
          zoho_field: zohoField,
          existing_value: existingVal,
          reason: 'field_already_set',
        };
        continue;
      }

      // Forward-only status guard: AI may only advance status, never regress.
      // e.g. a follow-up reply on a "Deposit Paid" booking must not reset to "Availability Confirmed".
      if (zohoField === 'Status' && currentStatus) {
        if (!isStatusAdvancement(currentStatus, value)) {
          flagged[key] = {
            value: value,
            confidence: field.confidence,
            zoho_field: zohoField,
            existing_value: currentStatus,
            reason: 'status_regression_blocked',
          };
          console.log('Status regression blocked: ' + currentStatus + ' → ' + value);
          continue;
        }
        // Log the advancement for audit trail
        console.log('Status advancing: ' + currentStatus + ' → ' + value);
      }

      // Whitelist guard: only write Status values that are valid Zoho picklist values.
      // Prevents AI hallucinations (e.g. "Wise Payment") from corrupting booking status.
      if (zohoField === 'Status') {
        var VALID_STATUSES = new Set([
          'Not Started', 'Ready to Send', 'Enquiry Sent', 'Availability Confirmed',
          'Confirmed', 'Proforma Received', 'Deposit Paid', 'Balance Paid',
          'Not Available', 'Cancelled', 'Waitlisted', 'Credit against booking',
        ]);
        if (!VALID_STATUSES.has(value)) {
          flagged[key] = {
            value: value,
            confidence: field.confidence,
            zoho_field: zohoField,
            existing_value: currentStatus,
            reason: 'invalid_status_value',
          };
          console.log('Invalid status value blocked: "' + value + '" (not in picklist)');
          continue;
        }
      }

      // For fields that can come from multiple sources, append rather than overwrite
      if ((zohoField === 'Payment_Note' || zohoField === 'Reservation_Comments') && updates[zohoField]) {
        updates[zohoField] += '\n' + value;
      } else {
        updates[zohoField] = value;
      }
    } else {
      flagged[key] = { value: field.value, confidence: field.confidence, zoho_field: mapping.zoho };
    }
  }

  // If we got a payment method or receipt ref, add to Payment_Note
  if (extracted.payment_method && extracted.payment_method.value) {
    var methodNote = 'Method: ' + extracted.payment_method.value;
    updates.Payment_Note = updates.Payment_Note ? updates.Payment_Note + '\n' + methodNote : methodNote;
  }

  // Truncate fields to Zoho character limits
  if (updates.Reservation_Comments && updates.Reservation_Comments.length > 255) {
    updates.Reservation_Comments = updates.Reservation_Comments.substring(0, 252) + '...';
  }
  if (updates.Cancellation_Policy_Text && updates.Cancellation_Policy_Text.length > 255) {
    updates.Cancellation_Policy_Text = updates.Cancellation_Policy_Text.substring(0, 252) + '...';
  }

  // Handle discrepancies from validation
  var discrepancies = extraction.discrepancies || [];
  if (discrepancies.length > 0) {
    // Build a warning string for Reservation_Comments
    var warnings = discrepancies.map(function(d) {
      return '⚠ ' + d.field + ': expected ' + d.expected + ', got ' + d.received;
    });
    var warningStr = warnings.join('; ');
    // Prepend to reservation comments so it's visible
    if (updates.Reservation_Comments) {
      updates.Reservation_Comments = warningStr + ' | ' + updates.Reservation_Comments;
    } else {
      updates.Reservation_Comments = warningStr;
    }
    // Re-truncate after prepending
    if (updates.Reservation_Comments.length > 255) {
      updates.Reservation_Comments = updates.Reservation_Comments.substring(0, 252) + '...';
    }
  }

  return { updates: updates, flagged: flagged, has_flags: Object.keys(flagged).length > 0, discrepancies: discrepancies };
}
