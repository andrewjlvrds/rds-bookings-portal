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
