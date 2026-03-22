// Email templates for lodge enquiries
// Sign-off: Helen Baker (Lodge Booking Manager)

// Generate subject line with RDS reference
export function generateSubject(booking, tourName) {
  const rdsRef = booking.RDS_Reference || ''
  const lodge = booking.Lodge_Name || ''
  const checkIn = booking.Check_in_Date || ''
  if (rdsRef) {
    return 'Booking enquiry - ' + tourName + ' [' + rdsRef + ']'
  }
  return 'Booking enquiry - ' + tourName + ' - ' + checkIn
}

// Format date for email display (e.g. "14 April 2027")
function emailDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T12:00:00')
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
  return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear()
}

// Build the date/room table for the email
function buildDateTable(bookings) {
  const rows = bookings.map(bk => {
    const checkIn = emailDate(bk.Check_in_Date)
    const checkOut = emailDate(bk.Check_out_Date)
    const nights = bk.Nights || 1
    const meals = bk.Meals || 'BB'
    return `  ${checkIn} - ${checkOut} (${nights} night${nights > 1 ? 's' : ''}, ${meals})`
  })
  return rows.join('\n')
}

// Build room requirements text from tour data
function buildRoomRequirements(opts = {}) {
  const pax_single = opts.pax_single || 8
  const pax_twin = opts.pax_twin || 2
  const pax_double = opts.pax_double || 1
  const guide_rooms = opts.guide_rooms || 3

  const parts = []
  if (pax_single) parts.push(pax_single + ' single room' + (pax_single > 1 ? 's' : ''))
  if (pax_twin) parts.push(pax_twin + ' shared twin room' + (pax_twin > 1 ? 's' : ''))
  if (pax_double) parts.push(pax_double + ' shared double room' + (pax_double > 1 ? 's' : ''))

  const totalPax = pax_single + (pax_twin * 2) + (pax_double * 2)
  const roomStr = parts.join(', ')
  const guideStr = guide_rooms ? guide_rooms + ' guide room' + (guide_rooms > 1 ? 's' : '') + ' (staff quarters if available)' : ''

  return { roomStr, guideStr, totalPax }
}

// New lodge template — first time contacting this lodge
export function newLodgeEmail(bookings, tourName, lodgeName, tourConfig = {}) {
  const dateTable = buildDateTable(bookings)
  const { roomStr, guideStr } = buildRoomRequirements(tourConfig)

  return `Dear Reservations,

I'm writing from Ride Down South, a guided motorcycle tour operator running trips through Southern Africa. We're planning our ${tourName} departure and would like to enquire about availability at ${lodgeName}.

Could you please let us know if you have availability for the following dates:

${dateTable}

We would need ${roomStr}${guideStr ? ', plus ' + guideStr : ''}.

If available, could you please provide:
- Your rates for the above dates
- Your cancellation and payment terms
- Whether you offer a tour operator or STO discount

We look forward to hearing from you.

Take care,
Helen Baker
Lodge Bookings
Ride Down South
helen@ridedownsouth.com`
}

// Returning lodge template — we've stayed here before
export function returningLodgeEmail(bookings, tourName, lodgeName, contactName, tourConfig = {}) {
  const dateTable = buildDateTable(bookings)
  const greeting = contactName ? `Hi ${contactName},` : 'Hi there,'
  const { roomStr, guideStr } = buildRoomRequirements(tourConfig)

  return `${greeting}

Hope you're well. We'd like to book ${lodgeName} again for our upcoming ${tourName} departure.

${dateTable}

We would need ${roomStr}${guideStr ? ', plus ' + guideStr : ''}.

Could you confirm availability and let us know your current rates? If we don't have an STO agreement on file yet, we'd appreciate details on any tour operator rates available.

Take care,
Helen Baker
Lodge Bookings
Ride Down South
helen@ridedownsouth.com`
}

// Generate the right email based on whether we've contacted this lodge before
export function generateEnquiryEmail(bookings, tourName, lodgeName, opts = {}) {
  const { contactName, isReturning, tourConfig } = opts

  if (isReturning) {
    return returningLodgeEmail(bookings, tourName, lodgeName, contactName, tourConfig)
  }
  return newLodgeEmail(bookings, tourName, lodgeName, tourConfig)
}
