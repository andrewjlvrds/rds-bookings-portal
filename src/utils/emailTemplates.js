// Email templates for lodge enquiries
// Sign-off: Helen Sobey (Lodge Booking Manager)

// Generate subject line with RDS reference
export function generateSubject(booking, tourName) {
  const rdsRef = booking.RDS_Reference || ''
  const lodge = booking.Lodge_Name || ''
  const checkIn = booking.Check_in_Date || ''
  if (rdsRef) {
    return `Booking enquiry – ${tourName} [${rdsRef}]`
  }
  return `Booking enquiry – ${tourName} – ${checkIn}`
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
    return `  ${checkIn} – ${checkOut} (${nights} night${nights > 1 ? 's' : ''}, ${meals})`
  })
  return rows.join('\n')
}

// New lodge template — first time contacting this lodge
export function newLodgeEmail(bookings, tourName, lodgeName) {
  const dateTable = buildDateTable(bookings)
  const totalNights = bookings.reduce((sum, b) => sum + (b.Nights || 1), 0)

  return `Dear Reservations,

I'm writing from Ride Down South, a guided motorcycle tour operator running trips through Southern Africa. We're planning our ${tourName} departure and would like to enquire about availability at ${lodgeName}.

Could you please let us know if you have availability for the following dates:

${dateTable}

We would need accommodation for up to 12 guests plus 3 guide rooms (staff quarters if available).

If available, could you please provide:
– Your rates for the above dates
– Your cancellation and payment terms
– Whether you offer a tour operator or STO discount

We look forward to hearing from you.

Take care,
Helen Sobey
Lodge Bookings
Ride Down South
helen@ridedownsouth.com`
}

// Returning lodge template — we've stayed here before
export function returningLodgeEmail(bookings, tourName, lodgeName, contactName) {
  const dateTable = buildDateTable(bookings)
  const greeting = contactName ? `Hi ${contactName},` : 'Hi there,'

  return `${greeting}

Hope you're well. We'd like to book ${lodgeName} again for our upcoming ${tourName} departure.

${dateTable}

Same setup as before — up to 12 guests plus 3 guide rooms.

Could you confirm availability and let us know your current rates? If we don't have an STO agreement on file yet, we'd appreciate details on any tour operator rates available.

Take care,
Helen Sobey
Lodge Bookings
Ride Down South
helen@ridedownsouth.com`
}

// Generate the right email based on whether we've contacted this lodge before
export function generateEnquiryEmail(bookings, tourName, lodgeName, opts = {}) {
  const { contactName, isReturning } = opts

  if (isReturning) {
    return returningLodgeEmail(bookings, tourName, lodgeName, contactName)
  }
  return newLodgeEmail(bookings, tourName, lodgeName)
}
