// Email templates for lodge enquiries

// Generate subject line — just the RDS reference
export function generateSubject(booking, tourName) {
  const rdsRef = booking.RDS_Reference || ''
  if (rdsRef) return rdsRef
  return 'Booking enquiry - ' + tourName
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

  const refs = bookings.map(b => b.RDS_Reference).filter(Boolean)
  const refStr = refs.join(', ')
  const refRequest = refStr ? '\nPlease quote our booking ref ' + refStr + ' in your reply.' : ''
  const refLine = refStr ? '\nRef: ' + refStr : ''

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
      body += '\n* ' + e.name + ' for ' + totalPax + ' pax + ' + numGuides + ' guides' + (e.date ? ' on ' + e.date : '')
    })
  }

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
