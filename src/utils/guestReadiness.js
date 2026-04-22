/**
 * Guest Readiness Engine
 * 
 * Computes a per-guest checklist from existing Zoho booking fields.
 * ~70% of items are derived (field populated = done).
 * ~30% need explicit status from a Zoho multi-select field (Actions_Completed).
 * 
 * Until that field exists, explicit items show as 'pending' by default.
 */

// Checklist item categories — these map to the sub-views
export const CATEGORIES = {
  info: { label: 'Guest Info', color: '#1565C0' },
  transfers: { label: 'Transfers', color: '#E65100' },
  accommodation: { label: 'Accommodation', color: '#1565C0' },
  excursions: { label: 'Excursions', color: '#6A1B9A' },
  bikes: { label: 'Bikes & Gear', color: '#00695C' },
  payments: { label: 'Payments', color: '#2E7D32' },
  admin: { label: 'Admin', color: '#546E7A' },
}

/**
 * Returns the full checklist for a guest.
 * Each item: { key, label, category, status, derivedFrom?, note? }
 * status: 'complete' | 'incomplete' | 'not_applicable' | 'action_needed'
 */
export function getGuestChecklist(guest) {
  const g = guest || {}
  const actions = parseActions(g.actions_completed)
  const isRider = g.participant_type === 'Rider'
  const isPillion = g.participant_type === 'Pillion'
  const isCrew = ['Crew', 'Lead Guide', '2nd Guide', 'Support Vehicle Driver'].includes(g.participant_type)

  const items = []

  // ─── GUEST INFO (derived) ───
  items.push({
    key: 'passport',
    label: 'Passport on file',
    category: 'info',
    status: g.passport ? 'complete' : 'incomplete',
  })
  items.push({
    key: 'emergency_contact',
    label: 'Emergency contact',
    category: 'info',
    status: g.emergency_contact ? 'complete' : 'incomplete',
  })
  items.push({
    key: 'dietary',
    label: 'Dietary info received',
    category: 'info',
    status: g.dietary ? 'complete' : 'incomplete',
    note: g.dietary || null,
  })
  items.push({
    key: 'insurance',
    label: 'Travel insurance details',
    category: 'info',
    status: g.insurance_details ? 'complete' : 'incomplete',
  })

  // ─── TRANSFERS (mix of derived + explicit) ───
  items.push({
    key: 'arrival_flight',
    label: 'Arrival flight details',
    category: 'transfers',
    status: g.arrival_flight ? 'complete' : 'incomplete',
    note: g.arrival_flight || null,
  })
  items.push({
    key: 'departure_flight',
    label: 'Departure flight details',
    category: 'transfers',
    status: g.departure_flight ? 'complete' : 'incomplete',
    note: g.departure_flight || null,
  })

  // Capey transfers — only relevant if requested
  if (g.capey_arrival) {
    items.push({
      key: 'capey_arrival',
      label: 'Capey arrival transfer booked',
      category: 'transfers',
      status: actions.has('Capey Arrival Booked') ? 'complete' : 'action_needed',
      actionValue: 'Capey Arrival Booked',
    })
  }
  if (g.capey_departure) {
    items.push({
      key: 'capey_departure',
      label: 'Capey departure transfer booked',
      category: 'transfers',
      status: actions.has('Capey Departure Booked') ? 'complete' : 'action_needed',
      actionValue: 'Capey Departure Booked',
    })
  }
  if (g.capey_home) {
    items.push({
      key: 'capey_home',
      label: 'Capey home departure booked',
      category: 'transfers',
      status: actions.has('Capey Home Booked') ? 'complete' : 'action_needed',
      actionValue: 'Capey Home Booked',
    })
  }

  // ─── ACCOMMODATION (mix) ───
  if (g.pre_tour_reqd === 'Yes' || g.pre_tour_details) {
    items.push({
      key: 'pre_accom',
      label: 'Pre-tour accommodation confirmed',
      category: 'accommodation',
      status: g.pre_tour_booked ? 'complete' :
              actions.has('Pre-tour Accom Confirmed') ? 'complete' : 'action_needed',
      note: g.pre_tour_details || null,
      actionValue: 'Pre-tour Accom Confirmed',
    })
  }
  if (g.post_tour_reqd === 'Yes' || g.post_tour_details) {
    items.push({
      key: 'post_accom',
      label: 'Post-tour accommodation confirmed',
      category: 'accommodation',
      status: g.post_tour_booked ? 'complete' :
              actions.has('Post-tour Accom Confirmed') ? 'complete' : 'action_needed',
      note: g.post_tour_details || null,
      actionValue: 'Post-tour Accom Confirmed',
    })
  }

  // ─── EXCURSIONS (explicit — need confirmation with supplier) ───
  if (g.excursions) {
    items.push({
      key: 'excursions_confirmed',
      label: 'Excursions confirmed with supplier',
      category: 'excursions',
      status: actions.has('Excursions Confirmed') ? 'complete' : 'action_needed',
      note: g.excursions,
      actionValue: 'Excursions Confirmed',
    })
  }

  // ─── BIKES & GEAR (derived + explicit) ───
  if (isRider || isPillion) {
    items.push({
      key: 'bike_preference',
      label: 'Bike preference stated',
      category: 'bikes',
      status: g.motorcycle ? 'complete' : (isCrew ? 'not_applicable' : 'incomplete'),
      note: g.motorcycle || null,
    })
    items.push({
      key: 'bike_allocated',
      label: 'Bike allocated',
      category: 'bikes',
      status: g.allocated_bike ? 'complete' :
              actions.has('Bike Allocated') ? 'complete' : 'action_needed',
      note: g.allocated_bike || null,
      actionValue: 'Bike Allocated',
    })
  }

  // ─── PAYMENTS (derived) ───
  if (!isCrew) {
    const depositNum = parseFloat(g.deposit_paid) || 0
    items.push({
      key: 'deposit_paid',
      label: 'Deposit paid',
      category: 'payments',
      status: depositNum > 0 ? 'complete' : 'incomplete',
    })
    const balNum = parseFloat(g.balance_due) || 0
    const balReceived = parseFloat(g.balance_received) || 0
    items.push({
      key: 'balance_paid',
      label: 'Balance paid',
      category: 'payments',
      status: balNum <= 0 && balReceived > 0 ? 'complete' :
              balNum > 0 ? 'incomplete' : 'incomplete',
    })
  }

  // ─── ADMIN (derived) ───
  items.push({
    key: 'waiver',
    label: 'Waiver signed',
    category: 'admin',
    status: g.waiver_signed ? 'complete' : 'incomplete',
  })

  // Dietary passed to lodges (explicit)
  if (g.dietary) {
    items.push({
      key: 'dietary_sent',
      label: 'Dietary info sent to lodges',
      category: 'admin',
      status: actions.has('Dietary Sent to Lodges') ? 'complete' : 'action_needed',
      actionValue: 'Dietary Sent to Lodges',
    })
  }

  return items
}

/**
 * Get summary scores for a guest
 */
export function getGuestReadiness(guest) {
  const checklist = getGuestChecklist(guest)
  const total = checklist.filter(i => i.status !== 'not_applicable').length
  const done = checklist.filter(i => i.status === 'complete').length
  const actionNeeded = checklist.filter(i => i.status === 'action_needed').length
  const incomplete = checklist.filter(i => i.status === 'incomplete').length
  return { checklist, total, done, actionNeeded, incomplete, pct: total > 0 ? Math.round((done / total) * 100) : 0 }
}

/**
 * Get tour-level readiness summary
 */
export function getTourReadiness(guests) {
  const all = (guests || []).map(g => getGuestReadiness(g))
  const totalItems = all.reduce((s, r) => s + r.total, 0)
  const doneItems = all.reduce((s, r) => s + r.done, 0)
  const actionItems = all.reduce((s, r) => s + r.actionNeeded, 0)
  const incompleteItems = all.reduce((s, r) => s + r.incomplete, 0)
  const pct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0

  // Per-category breakdown
  const byCategory = {}
  Object.keys(CATEGORIES).forEach(cat => {
    let catTotal = 0, catDone = 0, catAction = 0
    all.forEach(r => {
      r.checklist.filter(i => i.category === cat && i.status !== 'not_applicable').forEach(i => {
        catTotal++
        if (i.status === 'complete') catDone++
        if (i.status === 'action_needed') catAction++
      })
    })
    if (catTotal > 0) byCategory[cat] = { total: catTotal, done: catDone, actionNeeded: catAction, pct: Math.round((catDone / catTotal) * 100) }
  })

  return { guests: all, totalItems, doneItems, actionItems, incompleteItems, pct, byCategory }
}

/**
 * Get outstanding items across all guests, filtered by category
 * Returns items sorted: action_needed first, then incomplete
 */
export function getOutstandingItems(guests, category) {
  const items = []
  ;(guests || []).forEach(g => {
    const checklist = getGuestChecklist(g)
    checklist.forEach(item => {
      if (category && item.category !== category) return
      if (item.status === 'complete' || item.status === 'not_applicable') return
      items.push({ ...item, guest: g })
    })
  })
  // action_needed first (things someone needs to do), then incomplete (waiting on guest)
  items.sort((a, b) => {
    if (a.status === 'action_needed' && b.status !== 'action_needed') return -1
    if (b.status === 'action_needed' && a.status !== 'action_needed') return 1
    return 0
  })
  return items
}

// ─── Helpers ───

function parseActions(val) {
  // Actions_Completed could be a semicolon-separated string (Zoho multi-select)
  // or not present yet
  if (!val) return new Set()
  if (Array.isArray(val)) return new Set(val)
  return new Set(val.split(';').map(s => s.trim()).filter(Boolean))
}
