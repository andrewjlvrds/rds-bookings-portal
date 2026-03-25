// Email templates for lodge enquiries

// Generate subject line with RDS reference
export function generateSubject(booking, tourName) {
  const rdsRef = booking.RDS_Reference || ''
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

  const excursion = first.Excursion || first.excursion || ''
  const excursionDate = (first.Excursion_Date || first.excursion_date) ? emailDate(first.Excursion_Date || first.excursion_date) : ''

  const refs = bookings.map(b => b.RDS_Reference).filter(Boolean)
  const refStr = refs.join(', ')
  const refRequest = refStr ? '\nPlease quote our booking ref ' + refStr + ' in your reply.' : ''
  const refLine = refStr ? '\nRef: ' + refStr : ''

  let body = `Hi team,

Ride Down South has another motorcycle tour coming your way. Can you please let us know your room availability?

Check-in: ${checkIn}
Check-out: ${checkOut}
Nights: ${totalNights}

Room requirements:
* ${pax_single} pax in single rooms
* ${pax_double * 2} pax in ${pax_double} shared room${pax_double > 1 ? 's' : ''} (double bed)
* ${pax_twin * 2} pax in ${pax_twin} shared room${pax_twin > 1 ? 's' : ''} (twin beds)
* Guide room${guide_rooms > 1 ? 's' : ''}: ${numGuides} guide${numGuides > 1 ? 's' : ''} in ${guide_rooms} room${guide_rooms > 1 ? 's' : ''}`

  if (excursion) {
    body += '\n\nExcursion: ' + excursion + ' for ' + totalPax + ' pax' + (excursionDate ? ' on ' + excursionDate : '')
  }

  body += refRequest + '\n\n\n\nThanks,\n\n' + sender + '\nRide Down South\nbookings@ridedownsouth.com' + refLine

  return body
}

// Backward compat
export function newLodgeEmail(bookings, tourName, lodgeName, tourConfig = {}) {
  return generateEnquiryEmail(bookings, tourName, lodgeName, { tourConfig })
}

export function returningLodgeEmail(bookings, tourName, lodgeName, contactName, tourConfig = {}) {
  return generateEnquiryEmail(bookings, tourName, lodgeName, { contactName, tourConfig })
}
