// Formatting and utility functions for the RDS portal

// Safely convert any value to a renderable string
// Zoho lookup fields come as {name, id} objects
export function str(v) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return v.name || v.id || ''
  return String(v)
}

// Get tour name from a booking (handles Zoho object or string)
export function getTourName(bk) {
  const tour = bk['Tour'] || bk.Tour || ''
  if (typeof tour === 'object') return tour.name || ''
  return bk.tour_name || tour || ''
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function fmtDate(d) {
  if (!d) return '—'
  const t = new Date(d)
  return t.getDate() + ' ' + MONTHS[t.getMonth()]
}

export function fmtDateFull(d) {
  if (!d) return '—'
  const t = new Date(d)
  return t.getDate() + ' ' + MONTHS[t.getMonth()] + ' ' + t.getFullYear()
}

export function fmtDateTime(d) {
  if (!d) return '—'
  const t = new Date(d)
  const h = String(t.getHours()).padStart(2, '0')
  const m = String(t.getMinutes()).padStart(2, '0')
  return t.getDate() + ' ' + MONTHS[t.getMonth()] + ' ' + h + ':' + m
}

export function fmtCurrency(amount, currency) {
  if (!amount && amount !== 0) return '—'
  const n = parseFloat(amount)
  if (isNaN(n)) return amount
  const formatted = n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  return currency ? currency + ' ' + formatted : formatted
}

// Status badge mapping
const STATUS_MAP = {
  'Balance Paid': { cls: 'badge-paid', label: 'Paid' },
  'Deposit Paid': { cls: 'badge-paid', label: 'Deposit paid' },
  'Confirmed': { cls: 'badge-confirmed', label: 'Confirmed' },
  'Availability Confirmed': { cls: 'badge-confirmed', label: 'Available' },
  'Proforma Received': { cls: 'badge-confirmed', label: 'Proforma received' },
  'Enquiry Sent': { cls: 'badge-enquired', label: 'Enquired' },
  'Not Started': { cls: 'badge-ready', label: 'Ready to send' },
  'Not Available': { cls: 'badge-unavailable', label: 'Unavailable' },
  'Cancelled': { cls: 'badge-unavailable', label: 'Cancelled' },
  'Waitlisted': { cls: 'badge-waiting', label: 'Waitlisted' },
  'Credit against booking': { cls: 'badge-enquired', label: 'Credit' },
  'Excursion': { cls: 'badge-ready', label: 'Excursion' },
  'Closed for Renovations': { cls: 'badge-unavailable', label: 'Closed' },
  'Not suitable': { cls: 'badge-unavailable', label: 'Not suitable' },
}

export function getStatusBadge(status) {
  return STATUS_MAP[status] || { cls: 'badge-ready', label: status || '—' }
}

// Check if a booking is "confirmed" (in a positive state)
export function isConfirmed(status) {
  return ['Balance Paid', 'Deposit Paid', 'Confirmed', 'Availability Confirmed', 'Proforma Received'].includes(status)
}

// Check if booking is the "active" one (not an alternative that was tried and rejected)
export function isActiveBooking(booking) {
  const status = booking['Booking Status'] || booking.Booking_Status || ''
  // Z-prefixed day descriptions are alternatives
  const dayDesc = booking['Day Description'] || booking.Day_Description || ''
  if (dayDesc.startsWith('Z ') || dayDesc.startsWith('z ')) return false
  // Not Available with no amount = tried and rejected
  if (status === 'Not Available' || status === 'Cancelled' || status === 'Not suitable' || status === 'Closed for Renovations') return false
  return true
}

// Parse the Sgl/Twin/Dbl/Guides string
export function parseRoomConfig(config) {
  if (!config) return null
  const parts = config.split('/')
  if (parts.length !== 4) return null
  return {
    single: parseInt(parts[0]) || 0,
    twin: parseInt(parts[1]) || 0,
    double: parseInt(parts[2]) || 0,
    guides: parseInt(parts[3]) || 0,
    total: parts.reduce((s, p) => s + (parseInt(p) || 0), 0)
  }
}

// Get today's date as YYYY-MM-DD
export function today() {
  return new Date().toISOString().split('T')[0]
}

// Days between two dates
export function daysBetween(d1, d2) {
  const a = new Date(d1)
  const b = new Date(d2)
  return Math.round((b - a) / (86400000))
}

// Zoho CRM link
const ZOHO_ORG = 'https://crm.zoho.com/crm/org6aborc8aa540df51/tab'
export function zohoBookingUrl(id) { return ZOHO_ORG + '/CustomModule1/' + id }
export function zohoTourUrl(id) { return ZOHO_ORG + '/CustomModule3/' + id }
