// Email templates for lodge enquiries

// Generate subject line — RDS reference with current lodge name
export function generateSubject(booking, tourName, currentLodgeName) {
  const rdsRef = booking.RDS_Reference || ''
  
  if (rdsRef && currentLodgeName) {
    // Check if the lodge name in the ref matches the current lodge
    // RDS ref format: RDS-TourCode-MonYY-LodgeName-YY/MM/DD
    const parts = rdsRef.split('-')
    if (parts.length >= 4) {
      // Rebuild with current lodge name
      const lodgeClean = currentLodgeName.replace(/[^a-zA-Z0-9]/g, '')
      // Find the date part at the end (YY/MM/DD)
      const dateMatch = rdsRef.match(/(\d{2}\/\d{2}\/\d{2})$/)
      if (dateMatch) {
        const datePart = dateMatch[1]
        const prefix = parts.slice(0, 3).join('-') // RDS-TourCode-MonYY
        return prefix + '-' + lodgeClean + '-' + datePart
      }
    }
  }
  
  if (rdsRef) return rdsRef
  return 'Booking enquiry - ' + tourName
}

// Format date for email display (e.g. "14 April 2027")
export function emailDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T12:00:00')
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
  return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear()
}

// Build the enquiry email body
export function generateEnquiryEmail(bookings, tourName, lodgeName, opts = {}) {
  const { tourConfig = {}, sender = 'Andrew' } = opts
  const pax_single = tourConfig.pax_single || 8
  const pax_twin = tourConfig.pax_twin || 2
  const pax_double = tourConfig.pax_double || 1
  const guide_rooms = tourConfig.guide_rooms || 3
  const totalPax = pax_single + (pax_twin * 2) + (pax_double * 2)
  const numGuides = guide_rooms

  const first = bookings[0]
  const last = bookings[bookings.length - 1]
  const checkIn = emailDate(first.Check_in_Date)
  const checkOut = emailDate(last.Check_out_Date)
  const totalNights = bookings.reduce((sum, b) => sum + (parseInt(b.Nights) || 1), 0)

  // Collect excursions from all bookings in the group (multi-night stays may have different excursions)
  const excursions = []
  bookings.forEach(b => {
    const exc = b.Excursion || b.excursion || ''
    if (!exc) return
    const excDate = (b.Excursion_Date || b.excursion_date) ? emailDate(b.Excursion_Date || b.excursion_date) : ''
    // Use check-in date as fallback for excursion date
    const fallbackDate = b.Check_in_Date ? emailDate(b.Check_in_Date) : ''
    excursions.push({ name: exc, date: excDate || fallbackDate })
  })

  // Regenerate refs with current lodge name if it's changed
  const lodgeClean = (lodgeName || '').replace(/[^a-zA-Z0-9]/g, '')
  const refs = bookings.map(b => {
    const ref = b.RDS_Reference || ''
    if (!ref || !lodgeClean) return ref
    const dateMatch = ref.match(/(\d{2}\/\d{2}\/\d{2})$/)
    if (dateMatch) {
      const parts = ref.split('-')
      if (parts.length >= 4) {
        return parts.slice(0, 3).join('-') + '-' + lodgeClean + '-' + dateMatch[1]
      }
    }
    return ref
  }).filter(Boolean)
  const refStr = refs.join(', ')
  const refRequest = refStr ? '\nPlease quote our booking ref ' + refStr + ' in your reply.' : ''

  let body = `Hi team,

Ride Down South has another motorcycle tour coming your way. Can you please let us know your room availability at ${lodgeName}?

Check-in: ${checkIn}
Check-out: ${checkOut}
Nights: ${totalNights}

Room requirements:
* ${pax_single} pax in single rooms
* ${pax_double * 2} pax in ${pax_double} shared room${pax_double > 1 ? 's' : ''} (double bed)
* ${pax_twin * 2} pax in ${pax_twin} shared room${pax_twin > 1 ? 's' : ''} (twin beds)
* ${numGuides} guide${numGuides > 1 ? 's' : ''} in available rooms`

  if (excursions.length > 0) {
    body += '\n\nExcursions:'
    excursions.forEach(e => {
      body += '\n* ' + e.name + ' for ' + totalPax + ' pax' + (e.date ? ' on ' + e.date : '')
    })
  }

  body += '\n\nCould you also confirm your STO (Special Tour Operator) rates for these dates?'

  body += refRequest + '\n\n\n\nThanks,\n\n' + sender + '\nRide Down South\nbookings@ridedownsouth.com'

  return body
}

// Backward compat
export function newLodgeEmail(bookings, tourName, lodgeName, tourConfig = {}) {
  return generateEnquiryEmail(bookings, tourName, lodgeName, { tourConfig })
}

export function returningLodgeEmail(bookings, tourName, lodgeName, contactName, tourConfig = {}) {
  return generateEnquiryEmail(bookings, tourName, lodgeName, { contactName, tourConfig })
}

// Generate a booking confirmation reply
// Sent when lodge has confirmed availability or sent a proforma — we confirm the booking
export function generateConfirmationEmail(bookings, lodgeName, opts = {}) {
  const { sender = 'Andrew', contactName = '' } = opts
  const first = bookings[0]
  const last = bookings[bookings.length - 1]
  const checkIn = emailDate(first.Check_in_Date)
  const checkOut = emailDate(last.Check_out_Date)
  const totalNights = bookings.reduce((sum, b) => sum + (parseInt(b.Nights) || 1), 0)

  const refs = bookings.map(b => b.RDS_Reference || '').filter(Boolean)
  const refStr = refs.length > 0 ? ' (' + refs.join(', ') + ')' : ''

  const greeting = contactName ? 'Hi ' + contactName.split(' ')[0] + ',' : 'Hi team,'

  const body = greeting + `

Thanks for coming back to us. Please go ahead and confirm the booking for ${checkIn} to ${checkOut} (${totalNights} night${totalNights > 1 ? 's' : ''})${refStr}.

Can you confirm when the deposit is due and we'll arrange payment?

Cheers,

${sender}
Ride Down South
bookings@ridedownsouth.com`

  return body
}

// ============================================================================
// Lodge reply templates
// ============================================================================
// Templates for ongoing back-and-forth with lodges *after* the initial enquiry.
// Voice calibrated against Helen's sent emails (Feb–May 2026), with a light
// warming pass. See lodge-templates docs for source sample and rationale.
//
// All templates use Helen's actual signature pattern. Sender toggle ('Helen' or
// 'Andrew') swaps the name; everything else stays consistent so lodges receive
// a uniform-looking thread regardless of who's writing.

// Build the sender signature block used across all reply templates.
function replySignature(sender = 'Helen') {
  const name = sender === 'Andrew' ? 'Andrew Vaughan' : 'Helen Baker'
  return name + '\nLodge Bookings | Ride Down South\nbookings@ridedownsouth.com'
}

// Build an opening greeting. Falls back to bare 'Hi' if no contact known.
function replyGreeting(contactName) {
  if (!contactName) return 'Hi'
  const first = String(contactName).trim().split(/\s+/)[0]
  return 'Hi ' + first
}

// Format a rooming list block from a guest array.
// Expected shape per guest: { name, roomType, sharingWith, dietary, isGuide, isLeadGuide, cell }
// roomType: 'single' | 'twin' | 'double'
export function formatRoomingList(guests = []) {
  if (!Array.isArray(guests) || guests.length === 0) return ''

  // Group: singles, twin pairs, double pairs, guides
  const singles = guests.filter(g => !g.isGuide && g.roomType === 'single')
  const guides = guests.filter(g => g.isGuide)

  // Pair up sharing guests by sharingWith key
  const pairBuckets = {}
  guests.forEach(g => {
    if (g.isGuide) return
    if (g.roomType === 'twin' || g.roomType === 'double') {
      const key = g.sharingWith || g.name
      const bucketKey = [g.name, g.sharingWith].sort().join('|')
      if (!pairBuckets[bucketKey]) pairBuckets[bucketKey] = { type: g.roomType, members: [] }
      pairBuckets[bucketKey].members.push(g)
    }
  })

  const twinPairs = Object.values(pairBuckets).filter(p => p.type === 'twin')
  const doublePairs = Object.values(pairBuckets).filter(p => p.type === 'double')

  const lines = []

  if (singles.length > 0) {
    lines.push(singles.length + ' pax in single rooms')
    singles.forEach(g => {
      lines.push(g.name + (g.dietary ? ' (' + g.dietary + ')' : ''))
    })
    lines.push('')
  }

  if (twinPairs.length > 0) {
    const totalTwinPax = twinPairs.length * 2
    lines.push(totalTwinPax + ' pax sharing ' + twinPairs.length + ' twin room' + (twinPairs.length > 1 ? 's' : ''))
    twinPairs.forEach(p => {
      const names = p.members.map(m => m.name).join(' & ')
      const diet = p.members.filter(m => m.dietary).map(m => m.name.split(/\s+/)[0] + ' is ' + m.dietary).join(', ')
      lines.push(names + (diet ? ' (' + diet + ')' : ''))
    })
    lines.push('')
  }

  if (doublePairs.length > 0) {
    const totalDoublePax = doublePairs.length * 2
    lines.push(totalDoublePax + ' pax sharing ' + doublePairs.length + ' double room' + (doublePairs.length > 1 ? 's' : ''))
    doublePairs.forEach(p => {
      const names = p.members.map(m => m.name).join(' & ')
      const diet = p.members.filter(m => m.dietary).map(m => m.name.split(/\s+/)[0] + ' is ' + m.dietary).join(', ')
      lines.push(names + (diet ? ' (' + diet + ')' : ''))
    })
    lines.push('')
  }

  if (guides.length > 0) {
    lines.push(guides.length + ' tour guide' + (guides.length > 1 ? 's' : ''))
    guides.forEach(g => {
      if (g.isLeadGuide && g.cell) {
        lines.push(g.name + ' (Lead Guide: Cell Number: ' + g.cell + ')')
      } else if (g.isLeadGuide) {
        lines.push(g.name + ' (Lead Guide)')
      } else {
        lines.push(g.name)
      }
    })
  }

  // Trim trailing blank line
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()

  return lines.join('\n')
}

// 1. Follow-up — no response from original recipient (forwarding to alt email)
export function followUpNoResponseEmail(opts = {}) {
  const { sender = 'Helen', dateSent = '', originalEmail = '' } = opts
  return 'Hi\n\n' +
    'I sent the email below on ' + dateSent + ' to ' + originalEmail +
    ' but haven\u2019t heard back, so I thought I\u2019d try this address. ' +
    'Please let me know if you have accommodation available for these dates.\n\n' +
    'Many thanks\n\n' + replySignature(sender)
}

// 2. Follow-up — gentle nudge on existing thread
export function followUpNudgeEmail(opts = {}) {
  const { sender = 'Helen', contactName = '', dateSent = '', outstandingAsk = '' } = opts
  const ask = outstandingAsk || 'let me know when you have a moment'
  return replyGreeting(contactName) + '\n\n' +
    'Just following up on my email below from ' + dateSent + ' \u2014 ' + ask + '.\n\n' +
    'Thanks so much\n\n' + replySignature(sender)
}

// 3. Date or room change request
export function dateRoomChangeEmail(opts = {}) {
  const { sender = 'Helen', contactName = '', originalDate = '', roomingSummary = '' } = opts
  return replyGreeting(contactName) + '\n\n' +
    'I hope you\u2019re well. Would you be able to change our booking of ' + originalDate +
    ' to the following?\n\n' + roomingSummary + '\n\n' +
    'Let me know if that works on your side.\n\n' +
    'Kind regards\n\n' + replySignature(sender)
}

// 4. Adding extra guests to confirmed booking
export function addExtraGuestsEmail(opts = {}) {
  const { sender = 'Helen', contactName = '', date = '', bookingRef = '', roomingSummary = '' } = opts
  const refLine = bookingRef ? ' (Booking Reference ' + bookingRef + ')' : ''
  return replyGreeting(contactName) + '\n\n' +
    'Ride Down South has a booking with you on ' + date + refLine +
    '. We\u2019ve had some extra guests join the tour \u2014 is it possible to add accommodation so the total comes to the following?\n\n' +
    roomingSummary + '\n\n' +
    'Let me know what\u2019s possible.\n\n' +
    'Many thanks\n\n' + replySignature(sender)
}

// 5. Final rooming list (highest-frequency template)
export function finalRoomingListEmail(opts = {}) {
  const { sender = 'Helen', contactName = '', date = '', bookingRef = '', roomingList = '', dietaryNote = '', leadGuideName = '' } = opts

  const refPart = bookingRef ? ', ' + bookingRef : ''
  const dietarySentence = dietaryNote ? ' Please note ' + dietaryNote + '.' : ''
  const guideSentence = leadGuideName
    ? ' ' + leadGuideName + ' is the lead guide \u2014 his cell number is next to his name in case you need it.'
    : ''

  return replyGreeting(contactName) + '\n\n' +
    'Here\u2019s the final rooming list for our booking of ' + date + refPart + '.' +
    dietarySentence + guideSentence + '\n\n' +
    roomingList + '\n\n' +
    'Thanks so much \u2014 looking forward to having the group with you.\n\n' +
    'Kind regards\n\n' + replySignature(sender)
}

// 6. Proof of payment — deposit attached
export function popDepositEmail(opts = {}) {
  const { sender = 'Helen', contactName = '', date = '', bookingRef = '' } = opts
  const refPart = bookingRef ? ' (' + bookingRef + ')' : ''
  return replyGreeting(contactName) + '\n\n' +
    'POP attached for the deposit on our ' + date + ' booking' + refPart + '. ' +
    'Let me know if anything looks off on your side.\n\n' +
    'Many thanks\n\n' + replySignature(sender)
}

// 7. Payment in progress — bank delay holding message
export function paymentInProgressEmail(opts = {}) {
  const { sender = 'Helen', contactName = '', amount = '' } = opts
  const amountPhrase = amount || '50% deposit'
  return replyGreeting(contactName) + '\n\n' +
    'Quick update \u2014 the ' + amountPhrase + ' has been entered into our banking and authorised on our side. ' +
    'Now it\u2019s just down to the bank, which can take a few days. I\u2019ll send the POP through as soon as it comes through.\n\n' +
    'Thanks for your patience\n\n' + replySignature(sender)
}

// 8. Payment terms / deposit query
export function paymentTermsQueryEmail(opts = {}) {
  const { sender = 'Helen', contactName = '', lodgeName = '', missedOnInvoice = false } = opts
  const lodgePhrase = lodgeName || 'the lodge'
  const apology = missedOnInvoice ? ' I can\u2019t see it on the invoice anywhere \u2014 apologies if I\u2019ve missed it.' : ''
  return replyGreeting(contactName) + '\n\n' +
    'Could you let me know the deposit and payment schedule at ' + lodgePhrase + '?' + apology + '\n\n' +
    'Many thanks\n\n' + replySignature(sender)
}

// 9. Late check-out / special guest request
export function lateCheckoutEmail(opts = {}) {
  const { sender = 'Helen', contactName = '', date = '', bookingRef = '', guests = [], lateUntil = '' } = opts
  const refPart = bookingRef ? ' on reservation number ' + bookingRef : ''
  const guestNames = guests.length > 1
    ? guests.slice(0, -1).join(', ') + ' and ' + guests[guests.length - 1]
    : guests[0] || ''
  const count = guests.length || 0
  const countPhrase = count === 1 ? 'One' : (count + ' of')
  const untilPhrase = lateUntil ? ', until ' + lateUntil : ''
  return replyGreeting(contactName) + '\n\n' +
    countPhrase + ' our guests' + refPart + ' have a late departure on ' + date + '. ' +
    guestNames + ' ' + (count === 1 ? 'has' : 'have') +
    ' asked whether they\u2019re able to have a late check-out on that day' + untilPhrase +
    ' \u2014 would that be possible?\n\n' +
    'Many thanks\n\n' + replySignature(sender)
}

// 10. Cancellation request
export function cancellationEmail(opts = {}) {
  const { sender = 'Helen', contactName = '', lodgeName = '', date = '', bookingRef = '' } = opts
  const refPart = bookingRef ? ' (Ref ' + bookingRef + ')' : ''
  return replyGreeting(contactName) + '\n\n' +
    'Could you please cancel the Ride Down South booking at ' + lodgeName + ' for ' + date + refPart + '. ' +
    'Thanks for your help with the booking.\n\n' +
    'Kind regards\n\n' + replySignature(sender)
}

// Registry — for use by template-picker UI in reply composer.
//
// Each template has:
//   id      — stable string identifier
//   label   — human-readable label for picker dropdown
//   fn      — the template function, takes opts object, returns string body
//   fields  — UI metadata describing what inputs the picker should render
//
// Field shape:
//   { key, label, type, required?, autofillFrom?, placeholder?, helpText? }
//
//   type:           'text' | 'textarea' | 'guests' | 'rooming' | 'bool'
//   autofillFrom:   key in the picker's `context` prop to pre-fill from
//                   ('contactName', 'date', 'bookingRef', 'lodgeName',
//                    'leadGuideName' — sender is handled separately)
//   required:       insert button disabled until this field has a value
//   placeholder:    placeholder text in the input
//   helpText:       small grey text below the input
//
// 'guests' renders a multi-line input where each line becomes a guest name.
// 'rooming' renders a textarea pre-filled with formatRoomingList()
//           output if context.guests is provided, else blank.
// 'bool'   renders a checkbox.

export const LODGE_REPLY_TEMPLATES = [
  {
    id: 'followUpNoResponse',
    label: 'Follow-up: no response (try alt email)',
    fn: followUpNoResponseEmail,
    fields: [
      { key: 'dateSent', label: 'Date original was sent', type: 'text', required: true, placeholder: 'e.g. 19 March' },
      { key: 'originalEmail', label: 'Original email address', type: 'text', required: true, placeholder: 'e.g. reservations@lodge.com' },
    ],
  },
  {
    id: 'followUpNudge',
    label: 'Follow-up: gentle nudge',
    fn: followUpNudgeEmail,
    fields: [
      { key: 'contactName', label: 'Contact first name', type: 'text', autofillFrom: 'contactName', placeholder: 'leave blank for "Hi"' },
      { key: 'dateSent', label: 'Date original was sent', type: 'text', required: true, placeholder: 'e.g. 22 April' },
      { key: 'outstandingAsk', label: 'Outstanding question', type: 'textarea', required: true, placeholder: 'e.g. let me know whether the guide rooms are suitable for guests', helpText: 'Phrase this as a sentence fragment — it follows "Just following up on my email below from {date} —"' },
    ],
  },
  {
    id: 'dateRoomChange',
    label: 'Date / room change request',
    fn: dateRoomChangeEmail,
    fields: [
      { key: 'contactName', label: 'Contact first name', type: 'text', autofillFrom: 'contactName' },
      { key: 'originalDate', label: 'Original booking date', type: 'text', required: true, autofillFrom: 'date', placeholder: 'e.g. 14 September 2026' },
      { key: 'roomingSummary', label: 'New room requirements', type: 'rooming', required: true, helpText: 'Plain text, one room group per block. The format helpers expect lines like "8 pax in single rooms" + names below.' },
    ],
  },
  {
    id: 'addExtraGuests',
    label: 'Add extra guests to confirmed booking',
    fn: addExtraGuestsEmail,
    fields: [
      { key: 'contactName', label: 'Contact first name', type: 'text', autofillFrom: 'contactName' },
      { key: 'date', label: 'Booking date', type: 'text', required: true, autofillFrom: 'date' },
      { key: 'bookingRef', label: 'Booking reference', type: 'text', autofillFrom: 'bookingRef' },
      { key: 'roomingSummary', label: 'Updated room requirements (including new guests)', type: 'rooming', required: true },
    ],
  },
  {
    id: 'finalRoomingList',
    label: 'Final rooming list',
    fn: finalRoomingListEmail,
    fields: [
      { key: 'contactName', label: 'Contact first name', type: 'text', autofillFrom: 'contactName' },
      { key: 'date', label: 'Booking date', type: 'text', required: true, autofillFrom: 'date' },
      { key: 'bookingRef', label: 'Booking reference', type: 'text', autofillFrom: 'bookingRef' },
      { key: 'roomingList', label: 'Final rooming list', type: 'rooming', required: true },
      { key: 'dietaryNote', label: 'Dietary note (optional)', type: 'text', placeholder: "e.g. David Nguyen's dietary requirements", helpText: 'Appears as "Please note {dietary note}." Leave blank to omit.' },
      { key: 'leadGuideName', label: 'Lead guide first name', type: 'text', autofillFrom: 'leadGuideName', placeholder: 'e.g. Pierre' },
    ],
  },
  {
    id: 'popDeposit',
    label: 'Proof of payment (deposit attached)',
    fn: popDepositEmail,
    fields: [
      { key: 'contactName', label: 'Contact first name', type: 'text', autofillFrom: 'contactName' },
      { key: 'date', label: 'Booking date', type: 'text', required: true, autofillFrom: 'date' },
      { key: 'bookingRef', label: 'Booking reference', type: 'text', autofillFrom: 'bookingRef', placeholder: 'e.g. Proforma 16070' },
    ],
  },
  {
    id: 'paymentInProgress',
    label: 'Payment authorised, bank pending',
    fn: paymentInProgressEmail,
    fields: [
      { key: 'contactName', label: 'Contact first name', type: 'text', autofillFrom: 'contactName' },
      { key: 'amount', label: 'Payment description', type: 'text', placeholder: 'e.g. 50% deposit, or NAD 2928 deposit', helpText: 'Defaults to "50% deposit" if blank.' },
    ],
  },
  {
    id: 'paymentTermsQuery',
    label: 'Payment terms / deposit query',
    fn: paymentTermsQueryEmail,
    fields: [
      { key: 'contactName', label: 'Contact first name', type: 'text', autofillFrom: 'contactName' },
      { key: 'lodgeName', label: 'Lodge name', type: 'text', autofillFrom: 'lodgeName' },
      { key: 'missedOnInvoice', label: 'Add "can\u2019t see it on the invoice"', type: 'bool' },
    ],
  },
  {
    id: 'lateCheckout',
    label: 'Late check-out / special request',
    fn: lateCheckoutEmail,
    fields: [
      { key: 'contactName', label: 'Contact first name', type: 'text', autofillFrom: 'contactName' },
      { key: 'date', label: 'Departure date', type: 'text', required: true, autofillFrom: 'date' },
      { key: 'bookingRef', label: 'Reservation number', type: 'text', autofillFrom: 'bookingRef' },
      { key: 'guests', label: 'Guest names (one per line)', type: 'guests', required: true, placeholder: 'David Nguyen\nOlivier Jeanson' },
      { key: 'lateUntil', label: 'Until what time (optional)', type: 'text', placeholder: 'e.g. 2pm' },
    ],
  },
  {
    id: 'cancellation',
    label: 'Cancellation request',
    fn: cancellationEmail,
    fields: [
      { key: 'contactName', label: 'Contact first name', type: 'text', autofillFrom: 'contactName' },
      { key: 'lodgeName', label: 'Lodge name', type: 'text', required: true, autofillFrom: 'lodgeName' },
      { key: 'date', label: 'Booking date', type: 'text', required: true, autofillFrom: 'date' },
      { key: 'bookingRef', label: 'Booking reference', type: 'text', autofillFrom: 'bookingRef' },
    ],
  },
]
