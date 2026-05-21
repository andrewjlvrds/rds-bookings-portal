import React, { useState } from 'react'
import { fmtDate, fmtDateFull, fmtCurrency, getStatusBadge, isActiveBooking, isConfirmed, getStatus } from '../utils/helpers'
import { generateSubject, generateEnquiryEmail, generateConfirmationEmail } from '../utils/emailTemplates'
import PortalSync from './PortalSync'
import RoutingPicker from './RoutingPicker'

export default function Itinerary({ tour, lodges, onSelectBooking, onEditItinerary, onDeleteTour, onEnquireReady, onRefresh, initialSubTab, tours }) {
  const [activeTab, setActiveTab] = useState(initialSubTab === 'correspondence' ? 'correspondence' : 'bookings')
  const [marking, setMarking] = useState(false)
  const [editing, setEditing] = useState(null) // { id, field, value }
  const [savingEdit, setSavingEdit] = useState(false)
  const [editingDate, setEditingDate] = useState(false)
  const [newDate, setNewDate] = useState(tour.departure_date || '')
  const [savingDate, setSavingDate] = useState(false)
  const [sendingId, setSendingId] = useState(null) // booking id currently sending
  const [sentIds, setSentIds] = useState({}) // { id: 'sent' | 'error: ...' }
  const [previewId, setPreviewId] = useState(null) // booking id showing preview
  const [confirmId, setConfirmId] = useState(null) // booking id showing confirm preview
  const [showTourPayments, setShowTourPayments] = useState(false)
  const [sender, setSender] = useState('Helen')
  const [narrativeState, setNarrativeState] = useState({}) // { [bookingId]: { loading, text, confidence, saved, error, editing } }
  const [showCancelled, setShowCancelled] = useState(false) // toggle cancelled rows in the list

  // Utility: date string math in UTC to avoid timezone off-by-one (ZA is UTC+2)
  const parseYMD = (s) => {
    if (!s) return null
    const [y, m, d] = s.split('-').map(Number)
    if (!y || !m || !d) return null
    return new Date(Date.UTC(y, m - 1, d))
  }
  const formatYMD = (dt) => dt.toISOString().slice(0, 10)
  const addDaysToYMD = (s, days) => {
    const d = parseYMD(s)
    if (!d) return ''
    d.setUTCDate(d.getUTCDate() + days)
    return formatYMD(d)
  }

  const handleSaveDate = async () => {
    if (!newDate || newDate === tour.departure_date) {
      setEditingDate(false)
      return
    }

    const oldDep = parseYMD(tour.departure_date)
    const newDep = parseYMD(newDate)
    if (!oldDep || !newDep) {
      alert('Invalid date')
      return
    }
    const shiftDays = Math.round((newDep - oldDep) / 86400000)

    // What we're about to move
    const zohoBookings = sorted // from main render scope — active, sorted lodge bookings
    const draftCount = draftNights.length
    const zohoCount = zohoBookings.length

    // Build a concise confirmation message
    const shiftLabel = shiftDays > 0 ? '+' + shiftDays + ' day' + (shiftDays !== 1 ? 's' : '')
      : shiftDays < 0 ? shiftDays + ' day' + (shiftDays !== -1 ? 's' : '')
      : '0 days'
    const parts = []
    if (zohoCount) parts.push(zohoCount + ' lodge booking' + (zohoCount !== 1 ? 's' : '') + ' in Zoho')
    if (draftCount) parts.push(draftCount + ' draft night' + (draftCount !== 1 ? 's' : ''))
    const scope = parts.length ? parts.join(' and ') : 'no itinerary yet'

    const msg =
      'Shift departure date?\n\n' +
      fmtDateFull(tour.departure_date) + '  →  ' + fmtDateFull(newDate) + '  (' + shiftLabel + ')\n\n' +
      'This will shift ' + scope + ' by the same amount.'

    if (!confirm(msg)) return

    setSavingDate(true)
    try {
      // 1. Update tour's Departure_Date in Zoho (if it's a Zoho tour)
      const isLocalTour = typeof tour.id === 'string' && tour.id.startsWith('local_')
      if (!isLocalTour) {
        const res = await fetch('/api/update-tour', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tour_id: tour.id, updates: { Departure_Date: newDate } }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error('Failed to update departure date: ' + (err.error || res.status))
        }
      } else {
        // Local tour — update localStorage
        try {
          const localTours = JSON.parse(localStorage.getItem('rds_local_tours') || '[]')
          const idx = localTours.findIndex(t => t.id === tour.id)
          if (idx >= 0) {
            localTours[idx].departure_date = newDate
            localTours[idx].start_date = newDate
            // Shift end date too if present
            if (localTours[idx].end_date) {
              localTours[idx].end_date = addDaysToYMD(localTours[idx].end_date, shiftDays)
            }
            localStorage.setItem('rds_local_tours', JSON.stringify(localTours))
          }
        } catch (e) {}
      }

      // 2. Shift draft nights in localStorage
      if (draftCount) {
        const shifted = draftNights.map(n => ({
          ...n,
          date: n.date ? addDaysToYMD(n.date, shiftDays) : n.date,
          excursion_date: n.excursion_date ? addDaysToYMD(n.excursion_date, shiftDays) : n.excursion_date,
        }))
        localStorage.setItem(draftKey, JSON.stringify(shifted))
      }

      // 3. Shift Zoho lodge bookings
      if (zohoCount) {
        const shifts = zohoBookings.map(bk => {
          const ci = bk.Check_in_Date || bk['Check-in'] || ''
          const co = bk.Check_out_Date || bk['Check-out'] || ''
          return {
            id: bk.id || bk['Record Id'],
            check_in: ci ? addDaysToYMD(ci, shiftDays) : null,
            check_out: co ? addDaysToYMD(co, shiftDays) : null,
          }
        }).filter(s => s.id && (s.check_in || s.check_out))

        if (shifts.length) {
          const res = await fetch('/api/shift-booking-dates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shifts }),
          })
          const result = await res.json().catch(() => ({}))
          if (!res.ok || !result.success) {
            const errCount = (result && result.errors) || 0
            const updCount = (result && result.updated) || 0
            throw new Error(
              'Partial failure: ' + updCount + ' updated, ' + errCount + ' failed. ' +
              'The tour date was changed but some lodge bookings may be out of sync.'
            )
          }
        }
      }

      setEditingDate(false)
      if (onRefresh) onRefresh()
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setSavingDate(false)
    }
  }

  // Send enquiry for a single lodge booking (or group of consecutive nights at same lodge)
  const handleSendEnquiry = async (bookingGroup) => {
    const firstBk = bookingGroup[0]
    const bkId = firstBk.id || firstBk['Record Id']
    const rawLodge = firstBk.Lodge_Name || firstBk['Lodge Booking Name'] || firstBk.Name || ''
    const lodge = (typeof rawLodge === 'object' ? rawLodge.name || '' : rawLodge).split(' - ')[0]
    const lodgeRecord = lookupLodge(lodge)
    const email = lodgeRecord ? (lodgeRecord.email || lodgeRecord.email2 || '') : (firstBk.Email || firstBk.Lodge_Email || '')

    if (!email) {
      alert('No email address found for ' + lodge + '. Check the lodge directory in Zoho.')
      return
    }

    setSendingId(bkId)
    try {
      const subject = generateSubject(firstBk, tour.name, lodge)
      const body = generateEnquiryEmail(
        bookingGroup, tour.name, lodge,
        { sender, tourConfig: { pax_single: tour.pax_single, pax_twin: tour.pax_twin, pax_double: tour.pax_double, guide_rooms: tour.guide_rooms } }
      )

      const res = await fetch('/api/send-enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email,
          subject,
          body,
          booking_ids: bookingGroup.map(b => b.id || b['Record Id']).filter(Boolean),
          tour_name: tour.name,
          lodge_name: lodge,
        }),
      })

      if (res.ok) {
        const result = await res.json()
        if (result.email_sent) {
          setSentIds(prev => ({ ...prev, [bkId]: 'sent' }))
          setPreviewId(null)
        } else {
          setSentIds(prev => ({ ...prev, [bkId]: 'error: ' + (result.email_error || 'Failed') }))
        }
      } else {
        const err = await res.json()
        setSentIds(prev => ({ ...prev, [bkId]: 'error: ' + (err.error || 'Failed') }))
      }
    } catch (err) {
      setSentIds(prev => ({ ...prev, [bkId]: 'error: ' + err.message }))
    } finally {
      setSendingId(null)
    }
  }

  // Confirm booking — send reply to lodge and update status to Confirmed
  const handleConfirmBooking = async (bookingGroup) => {
    const firstBk = bookingGroup[0]
    const bkId = firstBk.id || firstBk['Record Id']
    const rawLodge = firstBk.Lodge_Name || firstBk['Lodge Booking Name'] || firstBk.Name || ''
    const lodge = (typeof rawLodge === 'object' ? rawLodge.name || '' : rawLodge).split(' - ')[0]
    const lodgeRecord = lookupLodge(lodge)
    const email = lodgeRecord ? (lodgeRecord.email || lodgeRecord.email2 || '') : (firstBk.Email || firstBk.Lodge_Email || '')
    const contactName = firstBk.Contact_Name || ''

    if (!email) {
      alert('No email address found for ' + lodge)
      return
    }

    setSendingId(bkId)
    try {
      const subject = 'Re: ' + generateSubject(firstBk, tour.name, lodge)
      const body = generateConfirmationEmail(bookingGroup, lodge, { sender, contactName })

      // Send as reply
      const res = await fetch('/api/send-enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email,
          subject,
          body,
          booking_ids: bookingGroup.map(b => b.id || b['Record Id']).filter(Boolean),
          tour_name: tour.name,
          lodge_name: lodge,
          is_reply: true,
        }),
      })

      if (res.ok) {
        const result = await res.json()
        if (result.email_sent) {
          // Update status to Confirmed
          const bookingIds = bookingGroup.map(b => b.id || b['Record Id']).filter(Boolean)
          await fetch('/api/update-bookings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              booking_ids: bookingIds,
              updates: { Status: 'Confirmed' },
            }),
          })
          setSentIds(prev => ({ ...prev, [bkId]: 'confirmed' }))
          setConfirmId(null)
          if (onRefresh) onRefresh()
        } else {
          setSentIds(prev => ({ ...prev, [bkId]: 'error: ' + (result.email_error || 'Failed') }))
        }
      } else {
        const err = await res.json()
        setSentIds(prev => ({ ...prev, [bkId]: 'error: ' + (err.error || 'Failed') }))
      }
    } catch (err) {
      setSentIds(prev => ({ ...prev, [bkId]: 'error: ' + err.message }))
    } finally {
      setSendingId(null)
    }
  }

  if (!tour) return null

  // Check for a draft itinerary in localStorage
  const draftKey = 'itinerary_draft_' + tour.id
  let draftNights = []
  try {
    const raw = localStorage.getItem(draftKey)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Drop drafts that reference Zoho bookings that are no longer active
        // (cancelled or deleted). Those drafts are stale — written before a
        // sync / cancel action — and otherwise resurface as phantom "draft
        // only" nights in the banner below.
        const activeIds = new Set(
          (tour.bookings || [])
            .filter(isActiveBooking)
            .map(bk => String(bk.id || bk['Record Id'] || ''))
            .filter(Boolean)
        )
        const hasStaleRef = parsed.some(n => n.zoho_id && !activeIds.has(String(n.zoho_id)))
        if (hasStaleRef) {
          try { localStorage.removeItem(draftKey) } catch (e) {}
        } else {
          draftNights = parsed
        }
      }
    }
  } catch (e) {}
  const hasDraft = draftNights.length > 0

  // Build lodge list for fuzzy matching
  const lodgeList = (lodges || []).filter(l => l.name).map(l => ({
    ...l,
    _lower: l.name.toLowerCase().trim(),
  }))
  const lookupLodge = (name) => {
    if (!name) return null
    const q = name.toLowerCase().trim()
    // Exact match
    let match = lodgeList.find(l => l._lower === q)
    // Substring match
    if (!match) match = lodgeList.find(l => l._lower.includes(q) || q.includes(l._lower))
    // Word overlap
    if (!match) {
      const qWords = q.split(/\s+/).filter(w => w.length > 2)
      if (qWords.length > 0) {
        let best = null, bestScore = 0
        for (const l of lodgeList) {
          const hits = qWords.filter(w => l._lower.includes(w)).length
          const score = hits / Math.max(qWords.length, l._lower.split(/\s+/).length)
          if (hits >= 2 && score > bestScore) { best = l; bestScore = score }
        }
        if (best) match = best
      }
    }
    return match || null
  }

  const allBookings = tour.bookings || []
  const cancelledCount = allBookings.filter(bk => !isActiveBooking(bk)).length
  const active = showCancelled ? allBookings : allBookings.filter(isActiveBooking)
  const sorted = active.slice().sort((a, b) => {
    const dA = a['Check-in'] || a.Check_in_Date || ''
    const dB = b['Check-in'] || b.Check_in_Date || ''
    return dA.localeCompare(dB)
  })

  // Merge draft data into Zoho bookings — draft holds fields Zoho doesn't store (km, route_notes, etc)
  const draftByDate = {}
  draftNights.forEach(n => { if (n.date) draftByDate[n.date] = n })

  const merged = sorted.map(bk => {
    const checkIn = bk.Check_in_Date || bk['Check-in'] || ''
    const draft = draftByDate[checkIn]
    if (!draft) return bk
    // Overlay draft-only fields onto Zoho booking (draft enriches, doesn't override Zoho status/amounts)
    return {
      ...bk,
      _km: draft.km || '',
      _route_notes: draft.route_notes || '',
      _backup: draft.backup || '',
      // Use draft lodge if Zoho has no lodge name (the write-to-Zoho failed)
      Lodge_Name: bk.Lodge_Name || draft.lodge || bk.Name || '',
      // Use draft excursion if Zoho doesn't have one
      Excursion: bk.Excursion || draft.excursion || '',
      Excursion_Date: bk.Excursion_Date || draft.excursion_date || '',
    }
  })

  // Find draft nights that aren't in Zoho yet (new additions in editor)
  const zohoCheckInDates = new Set(sorted.map(bk => bk.Check_in_Date || bk['Check-in'] || ''))
  const draftOnlyNights = draftNights.filter(n => n.date && !zohoCheckInDates.has(n.date))

  // Group consecutive nights at the same lodge (for sending one email per stay)
  const lodgeGroupMap = {} // booking id → array of bookings in the group
  let currentGroup = []
  merged.forEach((bk, i) => {
    const lodge = (bk.Lodge_Name || bk['Lodge Booking Name'] || bk.Name || '').split(' - ')[0]
    const prevLodge = i > 0 ? (merged[i-1].Lodge_Name || merged[i-1]['Lodge Booking Name'] || merged[i-1].Name || '').split(' - ')[0] : ''
    if (lodge === prevLodge && lodge) {
      currentGroup.push(bk)
    } else {
      currentGroup = [bk]
    }
    lodgeGroupMap[bk.id || bk['Record Id']] = currentGroup
  })

  // Detect alternative lodges for same date (e.g. Klein Aus Vista + Bahnhof both on 25 Mar)
  const dateBookings = {} // check-in date → array of bookings
  merged.forEach(bk => {
    const d = bk.Check_in_Date || bk['Check-in'] || ''
    if (!d) return
    const lodge = (bk.Lodge_Name || bk['Lodge Booking Name'] || bk.Name || '').split(' - ')[0]
    if (!dateBookings[d]) dateBookings[d] = []
    // Only count as alternative if different lodge on same date
    const existing = dateBookings[d]
    const isDuplicate = existing.some(b => {
      const l = (b.Lodge_Name || b['Lodge Booking Name'] || b.Name || '').split(' - ')[0]
      return l === lodge
    })
    if (!isDuplicate) dateBookings[d].push(bk)
  })
  // Lodge priority — Option 1 (or blank) = primary, Option 2/3/4 = alternatives
  // Guide/Excursion bookings are sub-items and never treated as alternatives
  const priorityOrder = { 'Option 1': 1, 'Option 2': 2, 'Option 3': 3, 'Option 4': 4 }
  const alternativeSet = new Set() // booking IDs that are option 2/3/4

  merged.forEach(bk => {
    const p = bk.Lodge_Priority || ''
    const t = bk.Booking_Type || 'Guest'
    if (t === 'Guide' || t === 'Excursion') return
    if (p === 'Option 2' || p === 'Option 3' || p === 'Option 4') {
      alternativeSet.add(bk.id || bk['Record Id'])
    }
  })

  // Decide what to show: Zoho bookings take priority, then draft
  const hasZohoBookings = sorted.length > 0
  const hasContent = hasZohoBookings || hasDraft

  // Stats
  const confirmed = sorted.filter(b => isConfirmed(b)).length
  const enquired = sorted.filter(b => getStatus(b) === 'Enquiry Sent').length
  const notStarted = sorted.filter(b => getStatus(b) === 'Not Started').length
  const readyToSend = sorted.filter(b => { const s = getStatus(b); return s === 'Ready to send' || s === 'Ready to Send' }).length

  const firstBk = sorted[0]
  const roomConfig = firstBk ? (firstBk['Sgl/Twin/Dbl/Guides'] || firstBk.Sgl_Twin_Dbl_Guides || '') : ''

  // Mark all "Not Started" bookings as "Ready to send"
  const handleMarkAllReady = async () => {
    const toMark = sorted
      .filter(b => getStatus(b) === 'Not Started' && (b.Lodge_Name || b.Name || '').trim())
      .map(b => b.id || b['Record Id'])
      .filter(Boolean)

    if (!toMark.length) {
      alert('No bookings to mark as ready. All bookings need a lodge assigned and status "Not Started".')
      return
    }

    setMarking(true)
    try {
      const res = await fetch('/api/update-bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_ids: toMark,
          updates: { Status: 'Ready to Send' },
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to update')
      }
      if (onRefresh) onRefresh()
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setMarking(false)
    }
  }

  // Inline edit a booking field
  const handleInlineSave = async () => {
    if (!editing) return
    setSavingEdit(true)
    try {
      const updates = {}
      if (editing.field === 'lodge') {
        updates.Lodge_Name = editing.value
        updates.Name = editing.value + ' - ' + (editing.checkIn || '')
      }
      const res = await fetch('/api/update-bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_ids: [editing.id], updates }),
      })
      if (!res.ok) throw new Error('Failed to update')
      setEditing(null)
      if (onRefresh) onRefresh()
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setSavingEdit(false)
    }
  }

  const handlePDF = () => {
    const rows = sorted.filter(isActiveBooking).map(bk => {
      const rawLodge = bk.Lodge_Name && typeof bk.Lodge_Name === 'object' ? bk.Lodge_Name.name : bk.Lodge_Name
      const lodge = rawLodge ? rawLodge.split(' - ')[0] : (bk.Name || '').split(' - ')[0].replace(/\s+BoN.*|\s+FoSA.*|\s+WH-CT.*|\s+GL.*|\s+EoA.*|\s+2026.*|\s+2027.*/, '')
      const dd = bk.Day_Description || ''
      const routeMatch = dd.match(/Day\s*\d+:\s*(.+)/)
      const route = routeMatch ? routeMatch[1] : dd
      const day = dd.match(/Day\s*(\d+)/)?.[1] || ''
      return { day, date: bk.Check_in_Date || '', route, lodge, meals: bk.Meals || '' }
    })
    const dep = tour.departure_date ? new Date(tour.departure_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'TBC'
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${tour.name}</title>
<style>* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: Arial, sans-serif; font-size: 11px; color: #222; padding: 20px; }
h1 { font-size: 16px; font-weight: 600; margin-bottom: 2px; }
.sub { font-size: 11px; color: #666; margin-bottom: 14px; }
table { width: 100%; border-collapse: collapse; margin-top: 8px; }
th { text-align: left; font-size: 10px; font-weight: 600; color: #666; text-transform: uppercase; letter-spacing: 0.5px; padding: 6px 8px; border-bottom: 1.5px solid #333; }
td { padding: 7px 8px; border-bottom: 0.5px solid #ddd; vertical-align: top; }
.day { font-weight: 500; width: 40px; } .date { width: 70px; color: #555; } .lodge { font-weight: 500; } .meals { width: 40px; color: #888; }
.footer { margin-top: 14px; font-size: 9px; color: #999; }
@media print { body { padding: 0; } }
</style></head><body>
<h1>${tour.name}</h1><div class="sub">Departure: ${dep}</div>
<table><thead><tr><th>Day</th><th>Date</th><th>Route</th><th>Lodge</th></tr></thead>
<tbody>${rows.map(r => `<tr><td class="day">${r.day}</td><td class="date">${r.date ? new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}</td><td>${r.route}</td><td class="lodge">${r.lodge}</td></tr>`).join('')}</tbody>
</table>
<div class="footer">Ride Down South · ${tour.name} · Generated ${new Date().toLocaleDateString('en-GB')}</div>
</body></html>`
    const win = window.open('', '_blank')
    win.document.write(html)
    win.document.close()
    setTimeout(() => win.print(), 300)
  }

  return (
    <div>
      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, justifyContent: 'flex-end' }}>
        <button className="btn" style={{ fontSize: 12, padding: '4px 10px' }} onClick={handlePDF} title="Download itinerary as PDF">↓ PDF</button>
        <button className="btn" onClick={onEditItinerary}>
          {hasContent ? 'Edit itinerary' : 'Create itinerary'}
        </button>
        {notStarted > 0 && (
          <button className="btn" onClick={handleMarkAllReady} disabled={marking}>
            {marking ? 'Marking...' : 'Mark all ready (' + notStarted + ')'}
          </button>
        )}
        {readyToSend > 0 && (
          <button className="btn btn-primary" onClick={onEnquireReady}>
            Enquire all ready ({readyToSend})
          </button>
        )}
        {onRefresh && (
          <button
            className="btn"
            onClick={onRefresh}
            style={{ fontSize: 12, padding: '4px 8px' }}
            title="Refresh data from Zoho"
          >↻</button>
        )}
      </div>

      {activeTab === 'portal-sync' && <PortalSync tour={tour} />}

      {(activeTab === 'correspondence' || initialSubTab === 'correspondence') && activeTab === 'correspondence' && (
        <TourInbox tour={tour} sorted={sorted} onSelectBooking={onSelectBooking} tours={tours} />
      )}

      {(activeTab === 'bookings' || (!activeTab || activeTab === 'bookings')) && <>

      {/* Tour config — room requirements for enquiries */}
      <TourConfig tour={tour} />

      {/* Tour summary: payments + correspondence */}
      {hasZohoBookings && (() => {
        const now = new Date().toISOString().split('T')[0]
        const sevenDays = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
        const bks = sorted.filter(b => {
          const dd = b.Day_Description || b['Day Description'] || ''
          return !(dd.startsWith('Z ') || dd.startsWith('z '))
        })
        // Payment stats
        let payOverdue = 0, payOverdueAmt = 0, payDueSoon = 0, payUpcoming = 0, payPaid = 0
        bks.forEach(bk => {
          const s = getStatus(bk)
          if (s === 'Balance Paid') return
          const slots = [
            [bk.Deposit_Due_Date, bk.Deposit_Amount, bk.Deposit_Paid_Date],
            [bk.Second_Payment_Due_Date, bk.Second_Payment_Amount, bk.nd_Payment_Paid_Date],
            [bk.Third_Payment_Due_Date, bk.Third_Payment_Amount, bk.rd_Payment_Paid_Date],
            [bk.Fourth_Payment_Due_Date, bk.Fourth_Payment_Amount, bk.th_Payment_Paid_Date],
          ]
          slots.forEach(([due, amount, paid]) => {
            if (!due && !amount) return
            if (paid) { payPaid++; return }
            const amt = parseFloat(amount) || 0
            if (due && due < now) { payOverdue++; payOverdueAmt += amt }
            else if (due && due <= sevenDays) { payDueSoon++ }
            else if (due || amount) { payUpcoming++ }
          })
        })
        // Correspondence stats
        const totalBookings = bks.length
        const confirmed = bks.filter(b => isConfirmed(b)).length
        const enquired = bks.filter(b => {
          const s = getStatus(b)
          return s === 'Enquiry Sent' || s === 'Available' || s === 'Availability Confirmed' || s === 'Proforma Received'
        }).length
        const needsReply = bks.filter(b => {
          const s = getStatus(b)
          return (s === 'Availability Confirmed' || (s === 'Enquiry Sent' && b.Last_Response_Date))
        }).length
        const notStarted = bks.filter(b => getStatus(b) === 'Not Started' || getStatus(b) === 'Ready to Send').length

        // Build payment detail rows for expandable view
        const paymentRows = []
        bks.forEach(bk => {
          const s = getStatus(bk)
          if (s === 'Balance Paid') return
          const lodge = (bk.Lodge_Name || bk.Name || '').split(' - ')[0]
          const currency = bk.Lodge_Currency || bk.Currency || ''
          const slots = [
            ['Deposit', bk.Deposit_Due_Date, bk.Deposit_Amount, bk.Deposit_Paid_Date],
            ['2nd', bk.Second_Payment_Due_Date, bk.Second_Payment_Amount, bk.nd_Payment_Paid_Date],
            ['3rd', bk.Third_Payment_Due_Date, bk.Third_Payment_Amount, bk.rd_Payment_Paid_Date],
            ['4th', bk.Fourth_Payment_Due_Date, bk.Fourth_Payment_Amount, bk.th_Payment_Paid_Date],
          ]
          slots.forEach(([label, due, amount, paid]) => {
            if (!due && !amount) return
            const amt = parseFloat(amount) || 0
            let statusKey = 'upcoming', statusLabel = 'Upcoming'
            if (paid) { statusKey = 'paid'; statusLabel = 'Paid' }
            else if (due && due < now) { const d = Math.round((new Date(now) - new Date(due)) / 86400000); statusKey = 'overdue'; statusLabel = d + 'd overdue' }
            else if (due && due <= sevenDays) { statusKey = 'due-soon'; statusLabel = 'Due soon' }
            paymentRows.push({ lodge, label, due, amount: amt, currency, statusKey, statusLabel, booking: bk })
          })
        })
        paymentRows.sort((a, b) => {
          const order = { overdue: 0, 'due-soon': 1, upcoming: 2, paid: 3 }
          return (order[a.statusKey] ?? 2) - (order[b.statusKey] ?? 2) || (a.due || '').localeCompare(b.due || '')
        })

        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div
              onClick={() => setShowTourPayments(!showTourPayments)}
              style={{
                padding: '12px 16px', borderRadius: 'var(--radius-md)',
                border: '0.5px solid var(--border-default)', background: 'var(--bg-primary)',
                cursor: 'pointer', gridColumn: showTourPayments ? '1 / -1' : undefined,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 15 }}>💰</span> Payments
                  </div>
                  {payOverdue > 0 ? (
                    <div style={{ fontSize: 12, color: '#C62828', fontWeight: 500 }}>
                      {payOverdue} overdue · R {payOverdueAmt.toLocaleString()}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--green-text)', fontWeight: 500 }}>No overdue payments</div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {payDueSoon > 0 ? payDueSoon + ' due this week · ' : ''}{payUpcoming} upcoming · {payPaid} paid
                  </div>
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', transform: showTourPayments ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>▾</span>
              </div>
              {showTourPayments && paymentRows.length > 0 && (
                <div style={{ marginTop: 12, borderTop: '0.5px solid var(--border-light)', paddingTop: 8 }} onClick={e => e.stopPropagation()}>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 500 }}>Lodge</th>
                        <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 500 }}>Payment</th>
                        <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 500 }}>Due</th>
                        <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 500 }}>Amount</th>
                        <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 500 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentRows.map((p, pi) => (
                        <tr
                          key={pi}
                          style={{ cursor: 'pointer', borderTop: '0.5px solid var(--border-light)' }}
                          onClick={() => onSelectBooking(p.booking)}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <td style={{ padding: '6px 8px', fontWeight: 500 }}>{p.lodge}</td>
                          <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{p.label}</td>
                          <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{p.due ? fmtDate(p.due) : '—'}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {p.currency} {p.amount.toLocaleString()}
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                            <span style={{
                              fontSize: 10, padding: '2px 6px', borderRadius: 8, fontWeight: 500,
                              background: p.statusKey === 'overdue' ? '#FFEBEE' : p.statusKey === 'due-soon' ? '#FFF3E0' : p.statusKey === 'paid' ? '#E8F5E9' : 'var(--bg-secondary)',
                              color: p.statusKey === 'overdue' ? '#C62828' : p.statusKey === 'due-soon' ? '#E65100' : p.statusKey === 'paid' ? '#2E7D32' : 'var(--text-muted)',
                            }}>{p.statusLabel}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {!showTourPayments && (
            <div style={{
              padding: '12px 16px', borderRadius: 'var(--radius-md)',
              border: '0.5px solid var(--border-default)', background: 'var(--bg-primary)',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 15 }}>📧</span> Bookings
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>
                {confirmed} confirmed · {enquired} in progress
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                {needsReply > 0 ? needsReply + ' need' + (needsReply === 1 ? 's' : '') + ' response · ' : ''}{notStarted > 0 ? notStarted + ' not started' : totalBookings + ' total'}
              </div>
            </div>
            )}
          </div>
        )
      })()}

      {/* Draft itinerary preview (when no Zoho bookings but draft exists) */}
      {!hasZohoBookings && hasDraft && (
        <DraftPreview
          tour={tour}
          draftNights={draftNights}
          lookupLodge={lookupLodge}
          onEditItinerary={onEditItinerary}
          onRefresh={onRefresh}
        />
      )}

      {/* Zoho bookings table */}
      {hasZohoBookings && (
      <div>
      <div className="table-wrap">
        <table style={{ tableLayout: 'fixed', width: '100%' }}>
          <colgroup>
            <col style={{ width: 44 }} />
            <col style={{ width: 72 }} />
            <col style={{ width: '25%' }} />
            <col style={{ width: '28%' }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 140 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Day</th>
              <th>Date</th>
              <th>Route</th>
              <th>Lodge</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {merged.map((bk, i) => {
              const status = getStatus(bk)
              const badge = getStatusBadge(status)
              const lodge = (bk.Lodge_Name || bk['Lodge Booking Name'] || bk.Name || '').split(' - ')[0]
              const dayDesc = bk['Day Description'] || bk.Day_Description || ''
              const checkIn = bk['Check-in'] || bk.Check_in_Date || ''
              const bkId = bk.id || bk['Record Id']
              const isFallback = alternativeSet.has(bkId)

              // Skip fallback rows — but only if there's a primary on the same date to show under
              if (isFallback) {
                const hasPrimary = merged.some(other => {
                  const otherDate = other.Check_in_Date || other['Check-in'] || ''
                  const otherId = other.id || other['Record Id']
                  return otherDate === checkIn && !alternativeSet.has(otherId)
                })
                if (hasPrimary) return null
                // No primary exists — show as normal row (orphaned fallback)
              }

              // Skip guide/excursion bookings from main rows — they render as sub-items
              const bkType = bk.Booking_Type || 'Guest'
              const isSubItem = bkType === 'Guide' || bkType === 'Excursion'
              if (isSubItem) {
                const hasPrimary = merged.some(other => {
                  const otherDate = other.Check_in_Date || other['Check-in'] || ''
                  const otherType = other.Booking_Type || 'Guest'
                  const otherId = other.id || other['Record Id']
                  return otherDate === checkIn && otherType === 'Guest' && !alternativeSet.has(otherId)
                })
                if (hasPrimary) return null
              }

              // Find fallback bookings for this date
              const fallbacks = merged.filter(fb => {
                const fbDate = fb.Check_in_Date || fb['Check-in'] || ''
                const fbId = fb.id || fb['Record Id']
                return fbDate === checkIn && alternativeSet.has(fbId)
              })

              // Find guide/excursion sub-bookings for this date
              const subItems = merged.filter(sb => {
                const sbDate = sb.Check_in_Date || sb['Check-in'] || ''
                const sbType = sb.Booking_Type || 'Guest'
                const sbId = sb.id || sb['Record Id']
                return sbDate === checkIn && (sbType === 'Guide' || sbType === 'Excursion') && sbId !== bkId
              })

              const nightMatch = dayDesc.match(/Day\s*(\d+)/)
              const nightNum = nightMatch ? nightMatch[1] : String(i + 1).padStart(2, '0')

              const routeMatch = dayDesc.match(/Day\s*\d+:\s*(.+)/)
              const route = routeMatch ? routeMatch[1] : dayDesc

              return (
                <React.Fragment key={bk['Record Id'] || bk.id || i}>
                <tr
                  style={Object.assign({ cursor: 'default' }, status === 'Not Available' ? { opacity: 0.6 } : {})}
                >
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{nightNum}</td>
                  <td>{fmtDate(checkIn)}</td>
                  <td>
                    <div
                      onClick={() => onSelectBooking(bk)}
                      style={{ fontSize: 13, color: 'var(--blue-text)', cursor: 'pointer', display: 'inline-block', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}
                    >{route || '—'}</div>
                    {bk._km && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{bk._km} km</div>}
                    {bk._route_notes && <div style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 1 }}>{bk._route_notes}</div>}
                    {bk.Booking_Notes && !['guide','excursion','fallback'].includes((bk.Booking_Notes || '').toLowerCase().trim()) && <div style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 2 }}>{bk.Booking_Notes}</div>}
                    {bk.Excursion && (
                      <div style={{ fontSize: 10, color: 'var(--blue-text)', marginTop: 2 }}>
                        Excursion: {bk.Excursion}
                        {bk.Excursion_booking_status ? ' (' + bk.Excursion_booking_status + ')' : ''}
                      </div>
                    )}
                  </td>
                  <td>
                    {editing && editing.id === (bk.id || bk['Record Id']) && editing.field === 'lodge' ? (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input
                          type="text"
                          value={editing.value}
                          onChange={e => setEditing({ ...editing, value: e.target.value })}
                          onKeyDown={e => { if (e.key === 'Enter') handleInlineSave(); if (e.key === 'Escape') setEditing(null) }}
                          autoFocus
                          style={{
                            flex: 1, fontSize: 13, fontWeight: 500, padding: '2px 6px',
                            border: '0.5px solid var(--blue-mid)', borderRadius: 4,
                            outline: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)',
                          }}
                        />
                        <button onClick={handleInlineSave} disabled={savingEdit} style={{
                          fontSize: 11, padding: '2px 8px', border: '0.5px solid var(--border-default)',
                          borderRadius: 4, background: 'var(--bg-primary)', cursor: 'pointer', color: 'var(--blue-text)',
                        }}>{savingEdit ? '...' : 'Save'}</button>
                        <button onClick={() => setEditing(null)} style={{
                          fontSize: 11, padding: '2px 6px', border: 'none',
                          background: 'none', cursor: 'pointer', color: 'var(--text-muted)',
                        }}>×</button>
                      </div>
                    ) : (
                      <div
                        onClick={(e) => { e.stopPropagation(); setEditing({ id: bk.id || bk['Record Id'], field: 'lodge', value: lodge, checkIn: checkIn }) }}
                        style={{ fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                        title="Click to edit lodge"
                      >
                        {bk.New_Reply === true && (
                          <span
                            title="New reply from lodge — needs response"
                            style={{
                              width: 7, height: 7, borderRadius: '50%',
                              background: '#C62828', flexShrink: 0,
                            }}
                          />
                        )}
                        {(bk.Reservation_Comments || '').includes('⚠') && (
                          <span
                            title={(bk.Reservation_Comments || '').split('|')[0].trim()}
                            style={{
                              fontSize: 12, cursor: 'help', flexShrink: 0,
                            }}
                          >⚠️</span>
                        )}
                        {lodge}
                      </div>
                    )}
                    {lodge && (() => {
                      const lr = lookupLodge(lodge)
                      if (!lr) return <div style={{ fontSize: 10, color: 'var(--red-text)' }}>Not in Zoho</div>
                      if (!lr.email) return <div style={{ fontSize: 10, color: 'var(--amber-text)' }}>No email</div>
                      return <div style={{ fontSize: 10, color: 'var(--green-text)' }}>{lr.email}</div>
                    })()}
                    {(bk.Previously_Tried || bk['Previously Tried'] || '') && (
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                        Tried: {bk.Previously_Tried || bk['Previously Tried']}
                      </div>
                    )}
                    {bk._backup && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>Backup: {bk._backup}</div>
                    )}
                    {/* Lodge priority dropdown — for primary rows */}
                    {(() => {
                      const currentPriority = bk.Lodge_Priority || ''
                      const isDefault = !currentPriority || currentPriority === 'Option 1'
                      return (
                        <select
                          value={currentPriority || 'Option 1'}
                          onClick={e => e.stopPropagation()}
                          onChange={e => {
                            e.stopPropagation()
                            fetch('/api/update-bookings', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ booking_ids: [bk.id || bk['Record Id']], updates: { Lodge_Priority: e.target.value } }),
                            }).then(r => { if (r.ok) setTimeout(() => onRefresh && onRefresh(), 1500) })
                          }}
                          style={{
                            marginTop: 2, fontSize: 9, padding: '1px 2px',
                            border: isDefault ? 'none' : '0.5px solid #f59e0b',
                            borderRadius: 3, background: isDefault ? 'transparent' : 'rgba(245,158,11,0.15)',
                            cursor: 'pointer', color: isDefault ? 'var(--text-secondary)' : '#b45309',
                            fontWeight: isDefault ? 400 : 600,
                          }}
                        >
                          <option value="Option 1">Option 1</option>
                          <option value="Option 2">Option 2</option>
                          <option value="Option 3">Option 3</option>
                          <option value="Option 4">Option 4</option>
                        </select>
                      )
                    })()}
                    {/* Booking type dropdown */}
                    {(() => {
                      const currentType = bk.Booking_Type || 'Guest'
                      const isGuest = currentType === 'Guest'
                      const typeStyle = currentType === 'Guide'
                        ? { color: '#065f46' }
                        : currentType === 'Excursion'
                        ? { color: '#4338ca' }
                        : { color: 'var(--text-muted)' }
                      return (
                        <select
                          value={currentType}
                          onClick={e => e.stopPropagation()}
                          onChange={e => {
                            e.stopPropagation()
                            const next = e.target.value
                            fetch('/api/update-bookings', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ booking_ids: [bk.id || bk['Record Id']], updates: { Booking_Type: next } }),
                            }).then(r => { if (r.ok) setTimeout(() => onRefresh && onRefresh(), 1500) })
                          }}
                          style={{
                            marginTop: 3, fontSize: 9, padding: '1px 2px',
                            border: isGuest ? 'none' : '0.5px solid var(--border-default)',
                            borderRadius: 3, background: 'transparent', cursor: 'pointer',
                            color: isGuest ? 'var(--text-secondary)' : typeStyle.color,
                            fontWeight: isGuest ? 400 : 600,
                            textTransform: 'uppercase', letterSpacing: 0.3,
                            appearance: isGuest ? 'none' : 'auto',
                          }}
                        >
                          <option value="Guest">Guest</option>
                          <option value="Guide">Guide</option>
                          <option value="Excursion">Excursion</option>
                        </select>
                      )
                    })()}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {editing && editing.id === (bk.id || bk['Record Id']) && editing.field === 'status' ? (
                      <select
                        value={editing.value}
                        onChange={e => {
                          const newVal = e.target.value
                          setEditing({ ...editing, value: newVal })
                          setSavingEdit(true)
                          fetch('/api/update-bookings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ booking_ids: [editing.id], updates: { Status: newVal } }),
                          }).then(res => {
                            if (!res.ok) throw new Error('Failed')
                            setEditing(null)
                            if (onRefresh) onRefresh()
                          }).catch(err => alert('Error: ' + err.message))
                          .finally(() => setSavingEdit(false))
                        }}
                        autoFocus
                        onBlur={() => setTimeout(() => setEditing(null), 200)}
                        style={{
                          fontSize: 12, padding: '2px 4px',
                          border: '0.5px solid var(--blue-mid)', borderRadius: 4,
                          outline: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)',
                        }}
                      >
                        <option value="Not Started">Not Started</option>
                        <option value="Ready to Send">Ready to Send</option>
                        <option value="Enquiry Sent">Enquiry Sent</option>
                        <option value="Availability Confirmed">Availability Confirmed</option>
                        <option value="Confirmed">Confirmed</option>
                        <option value="Proforma Received">Proforma Received</option>
                        <option value="Deposit Paid">Deposit Paid</option>
                        <option value="Balance Paid">Balance Paid</option>
                        <option value="Not Available">Not Available</option>
                        <option value="Cancelled">Cancelled</option>
                        <option value="Waitlisted">Waitlisted</option>
                        <option value="Credit against booking">Credit against booking</option>
                      </select>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                        <span
                          className={'badge ' + badge.cls}
                          onClick={() => setEditing({ id: bk.id || bk['Record Id'], field: 'status', value: status })}
                          style={{ cursor: 'pointer' }}
                          title="Click to change status"
                        >{badge.label}</span>
                        {status === 'Not Available' && (
                          <button
                            onClick={() => {
                              const newLodge = prompt('Enter backup lodge name:', '')
                              if (!newLodge) return
                              const prevTried = [bk.Previously_Tried || bk['Previously Tried'] || '', lodge].filter(Boolean).join(', ')
                              fetch('/api/update-bookings', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  booking_ids: [bk.id || bk['Record Id']],
                                  updates: {
                                    Lodge_Name: newLodge,
                                    Name: newLodge + ' - ' + checkIn,
                                    Status: 'Not Started',
                                    Previously_Tried: prevTried,
                                  },
                                }),
                              }).then(res => {
                                if (!res.ok) throw new Error('Failed')
                                if (onRefresh) onRefresh()
                              }).catch(err => alert('Error: ' + err.message))
                            }}
                            style={{
                              fontSize: 10, padding: '2px 8px',
                              border: '0.5px solid var(--border-default)', borderRadius: 4,
                              background: 'var(--bg-primary)', cursor: 'pointer',
                              color: 'var(--amber-text)',
                            }}
                          >↻ Try backup</button>
                        )}
                        {(status === 'Waitlisted' || status === 'Not Available') && (
                        <button
                          onClick={() => {
                            const fbLodge = prompt('Fallback lodge name:')
                            if (!fbLodge) return
                            // Create a new Lodge Booking for the same date, tagged as FALLBACK
                            fetch('/api/create-itinerary', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                tour_id: tour.id,
                                tour_name: tour.name || '',
                                departure_date: tour.departure_date || '',
                                nights: [{
                                  lodge: fbLodge,
                                  date: checkIn,
                                  meals: bk.Meals || 'BB',
                                  day: nightNum,
                                  route: route,
                                  booking_notes: 'FALLBACK',
                                }],
                              }),
                            }).then(res => {
                              if (!res.ok) throw new Error('Failed')
                              if (onRefresh) onRefresh()
                            }).catch(err => alert('Error: ' + err.message))
                          }}
                          style={{
                            fontSize: 9, padding: '2px 6px',
                            border: '0.5px solid var(--border-default)', borderRadius: 3,
                            background: 'var(--bg-primary)', cursor: 'pointer',
                            color: 'var(--text-muted)',
                          }}
                        >+ Fallback</button>
                        )}
                      </div>
                    )}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <button
                        className="btn btn-sm"
                        onClick={() => onSelectBooking(bk)}
                        style={{ fontSize: 11, padding: '3px 6px' }}
                      >View</button>
                      {(() => {
                        const bkId = bk.id || bk['Record Id']
                        const s = getStatus(bk)
                        const isSent = sentIds[bkId] === 'sent'
                        const isError = sentIds[bkId] && sentIds[bkId].startsWith('error')
                        const isSending = sendingId === bkId
                        const group = lodgeGroupMap[bkId] || [bk]
                        const isFirstInGroup = group[0] === bk
                        const alreadySent = s === 'Enquiry Sent'

                        if (!isFirstInGroup) return null
                        if (!lodge) return null

                        return (
                          <>
                            {(alreadySent || isSent) && <span style={{ fontSize: 10, color: 'var(--green-text)' }}>✓</span>}
                            {sentIds[bkId] === 'confirmed' && <span style={{ fontSize: 10, color: 'var(--green-text)' }}>✓ Confirmed</span>}
                            {isError && <span style={{ fontSize: 10, color: 'var(--red-text)' }} title={sentIds[bkId]}>✗</span>}
                            <button
                              onClick={() => { setPreviewId(previewId === bkId ? null : bkId); setConfirmId(null) }}
                              disabled={isSending}
                              style={{
                                fontSize: 10, padding: '3px 6px',
                                border: '0.5px solid var(--blue-mid)', borderRadius: 4,
                                background: previewId === bkId ? 'var(--blue-bg)' : 'var(--bg-primary)',
                                cursor: 'pointer', color: 'var(--blue-text)', whiteSpace: 'nowrap',
                              }}
                            >{isSending ? '...' : group.length > 1 ? 'Email (' + group.length + 'n)' : 'Email'}</button>
                            {(s === 'Available' || s === 'Availability Confirmed' || s === 'Proforma Received') && (
                              <button
                                onClick={() => { setConfirmId(confirmId === bkId ? null : bkId); setPreviewId(null) }}
                                disabled={isSending}
                                style={{
                                  fontSize: 10, padding: '3px 6px',
                                  border: '0.5px solid var(--green-mid, #34a853)', borderRadius: 4,
                                  background: confirmId === bkId ? 'var(--green-bg)' : 'var(--bg-primary)',
                                  cursor: 'pointer', color: 'var(--green-text)', whiteSpace: 'nowrap',
                                }}
                              >Confirm</button>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  </td>
                </tr>
                {/* Inline email preview */}
                {(() => {
                  const bkId = bk.id || bk['Record Id']
                  if (previewId !== bkId) return null
                  const rawLodge = bk.Lodge_Name || bk['Lodge Booking Name'] || bk.Name || ''
                  const lodge = (typeof rawLodge === 'object' ? rawLodge.name || '' : rawLodge).split(' - ')[0]
                  const lodgeRecord = lookupLodge(lodge)
                  const toEmail = lodgeRecord ? (lodgeRecord.email || lodgeRecord.email2 || '') : (bk.Email || bk.Lodge_Email || '')
                  const group = lodgeGroupMap[bkId] || [bk]

                  return (
                    <tr>
                      <td colSpan="6" style={{ padding: 0 }}>
                        <InlineComposer
                          toEmail={toEmail}
                          booking={bk}
                          tourName={tour.name}
                          sender={sender}
                          onSenderChange={setSender}
                          onClose={() => setPreviewId(null)}
                          onSent={() => { setPreviewId(null); if (onRefresh) onRefresh() }}
                        />
                      </td>
                    </tr>
                  )
                })()}
                {/* Inline confirmation preview */}
                {(() => {
                  const bkId = bk.id || bk['Record Id']
                  if (confirmId !== bkId) return null
                  const rawLodge = bk.Lodge_Name || bk['Lodge Booking Name'] || bk.Name || ''
                  const lodge = (typeof rawLodge === 'object' ? rawLodge.name || '' : rawLodge).split(' - ')[0]
                  const lodgeRecord = lookupLodge(lodge)
                  const email = lodgeRecord ? (lodgeRecord.email || lodgeRecord.email2 || '') : (bk.Email || bk.Lodge_Email || '')
                  const group = lodgeGroupMap[bkId] || [bk]
                  const contactName = bk.Contact_Name || (lodgeRecord ? lodgeRecord.contact || '' : '')
                  const subject = 'Re: ' + generateSubject(bk, tour.name, lodge)
                  const body = generateConfirmationEmail(group, lodge, { sender, contactName })

                  return (
                    <tr>
                      <td colSpan="6" style={{ padding: 0 }}>
                        <div style={{
                          margin: '0 16px 8px', padding: '12px 16px',
                          background: '#f0fdf4', borderRadius: 'var(--radius-md)',
                          border: '0.5px solid #86efac',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <div style={{ fontSize: 12 }}>
                              <span style={{ fontWeight: 600, color: 'var(--green-text)' }}>Confirm booking </span>
                              <span style={{ color: 'var(--text-muted)' }}>To: </span>
                              <span style={{ fontWeight: 500 }}>{email || 'No email on file'}</span>
                            </div>
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              <div style={{ display: 'flex', gap: 0 }}>
                                {['Helen', 'Andrew'].map(s => (
                                  <button key={s} onClick={() => setSender(s)} style={{
                                    fontSize: 10, padding: '2px 8px', border: 'none', cursor: 'pointer',
                                    background: sender === s ? 'var(--green-bg)' : 'transparent',
                                    color: sender === s ? 'var(--green-text)' : 'var(--text-muted)',
                                    borderRadius: s === 'Helen' ? '3px 0 0 3px' : '0 3px 3px 0', fontWeight: 500,
                                  }}>{s}</button>
                                ))}
                              </div>
                              <button
                                onClick={() => setConfirmId(null)}
                                style={{ fontSize: 11, padding: '2px 6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                              >×</button>
                              <button
                                onClick={() => handleConfirmBooking(group)}
                                disabled={!email || sendingId}
                                style={{
                                  fontSize: 11, padding: '3px 10px', borderRadius: 4, border: 'none',
                                  background: '#16a34a', color: 'white', cursor: 'pointer', fontWeight: 500,
                                }}
                              >{sendingId ? 'Sending...' : 'Send & Confirm'}</button>
                            </div>
                          </div>
                          <pre style={{
                            fontSize: 11, lineHeight: 1.6, color: 'var(--text-primary)',
                            whiteSpace: 'pre-wrap', fontFamily: 'var(--font-sans)',
                            margin: 0, maxHeight: 200, overflow: 'auto',
                          }}>{body}</pre>
                        </div>
                      </td>
                    </tr>
                  )
                })()}
                {/* Fallback sub-rows for this date */}
                {fallbacks.map(fb => {
                  const fbLodge = (fb.Lodge_Name || fb['Lodge Booking Name'] || fb.Name || '').split(' - ')[0]
                  const fbStatus = getStatus(fb)
                  const fbBadge = getStatusBadge(fbStatus)
                  const fbId = fb.id || fb['Record Id']
                  const fbLr = lookupLodge(fbLodge)
                  const fbEmail = fbLr ? (fbLr.email || '') : ''
                  return (
                    <tr
                      key={'fb-' + fbId}
                      style={{
                        borderLeft: '3px solid #f59e0b',
                        background: 'rgba(245,158,11,0.04)',
                        fontSize: 12,
                      }}
                    >
                      <td></td>
                      <td></td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 11, paddingLeft: 16 }}>
                        <select
                          value={fb.Lodge_Priority || 'Option 2'}
                          onClick={e => e.stopPropagation()}
                          onChange={e => {
                            e.stopPropagation()
                            const val = e.target.value
                            fetch('/api/update-bookings', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ booking_ids: [fbId], updates: { Lodge_Priority: val } }),
                            }).then(r => { if (r.ok) setTimeout(() => onRefresh && onRefresh(), 1500) })
                          }}
                          style={{
                            fontSize: 9, padding: '1px 4px', borderRadius: 3,
                            background: 'rgba(245,158,11,0.15)', color: '#b45309',
                            border: '0.5px solid #f59e0b', fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          <option value="Option 1">Option 1</option>
                          <option value="Option 2">Option 2</option>
                          <option value="Option 3">Option 3</option>
                          <option value="Option 4">Option 4</option>
                        </select>
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {fbLodge}
                        </div>
                        {fbEmail && <div style={{ fontSize: 10, color: 'var(--green-text)' }}>{fbEmail}</div>}
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                          {editing && editing.id === fbId && editing.field === 'status' ? (
                            <select
                              value={editing.value}
                              onChange={e => {
                                const newVal = e.target.value
                                setEditing({ ...editing, value: newVal })
                                setSavingEdit(true)
                                fetch('/api/update-bookings', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ booking_ids: [fbId], updates: { Status: newVal } }),
                                }).then(r => { if (r.ok) { setEditing(null); if (onRefresh) onRefresh() } })
                                .finally(() => setSavingEdit(false))
                              }}
                              onBlur={() => setEditing(null)}
                              autoFocus
                              style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4, border: '0.5px solid var(--blue-mid)' }}
                            >
                              {['Not Started','Ready to Send','Enquiry Sent','Available','Availability Confirmed','Proforma Received','Confirmed','Deposit Paid','Balance Paid','Not Available','Waitlisted','Cancelled'].map(s =>
                                <option key={s} value={s}>{s}</option>
                              )}
                            </select>
                          ) : (
                            <span
                              className={'badge ' + fbBadge.cls}
                              onClick={() => setEditing({ id: fbId, field: 'status', value: fbStatus })}
                              style={{ cursor: 'pointer' }}
                              title="Click to change status"
                            >{fbBadge.label}</span>
                          )}
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              fetch('/api/update-bookings', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ booking_ids: [fbId], updates: { Lodge_Priority: 'Option 1' } }),
                              }).then(r => { if (r.ok) setTimeout(() => onRefresh && onRefresh(), 1500) })
                            }}
                            style={{
                              fontSize: 9, padding: '2px 6px', border: '0.5px solid var(--border-default)',
                              borderRadius: 3, background: 'rgba(245,158,11,0.15)', cursor: 'pointer', color: '#b45309',
                            }}
                          >↑ Make primary</button>
                        </div>
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <button className="btn btn-sm" onClick={() => onSelectBooking(fb)} style={{ fontSize: 11, padding: '3px 6px' }}>View</button>
                          <button
                            onClick={() => setPreviewId(previewId === fbId ? null : fbId)}
                            style={{
                              fontSize: 10, padding: '3px 6px',
                              border: '0.5px solid var(--blue-mid)', borderRadius: 4,
                              background: previewId === fbId ? 'var(--blue-bg)' : 'var(--bg-primary)',
                              cursor: 'pointer', color: 'var(--blue-text)',
                            }}
                          >Email</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {/* Guide / Excursion sub-item rows */}
                {subItems.map(sb => {
                  const sbLodge = (sb.Lodge_Name || sb['Lodge Booking Name'] || sb.Name || '').split(' - ')[0]
                  const sbStatus = getStatus(sb)
                  const sbBadge = getStatusBadge(sbStatus)
                  const sbId = sb.id || sb['Record Id']
                  const sbType = sb.Booking_Type || 'Guide'
                  const sbLr = lookupLodge(sbLodge)
                  const sbEmail = sbLr ? (sbLr.email || '') : ''
                  const typeColor = sbType === 'Excursion' ? { bg: 'rgba(99,102,241,0.1)', color: '#4338ca', border: '#c7d2fe' } : { bg: 'rgba(16,185,129,0.08)', color: '#065f46', border: '#a7f3d0' }
                  return (
                    <tr
                      key={'sub-' + sbId}
                      style={{ cursor: 'pointer', background: typeColor.bg, fontSize: 12 }}

                    >
                      <td></td>
                      <td></td>
                      <td style={{ paddingLeft: 20 }}>
                        <select
                          value={sbType}
                          onClick={e => e.stopPropagation()}
                          onChange={e => {
                            e.stopPropagation()
                            fetch('/api/update-bookings', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ booking_ids: [sbId], updates: { Booking_Type: e.target.value } }),
                            }).then(r => { if (r.ok) setTimeout(() => onRefresh && onRefresh(), 1500) })
                          }}
                          style={{
                            fontSize: 9, padding: '1px 4px', borderRadius: 3,
                            background: typeColor.bg, color: typeColor.color,
                            border: '0.5px solid ' + typeColor.border,
                            fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          <option value="Guest">Guest</option>
                          <option value="Guide">Guide</option>
                          <option value="Excursion">Excursion</option>
                        </select>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{sbLodge}</div>
                        {sbEmail && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{sbEmail}</div>}
                      </td>
                      <td>
                        <span className={'badge ' + sbBadge.cls}>{sbBadge.label}</span>
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <button className="btn btn-sm" onClick={() => onSelectBooking(sb)} style={{ fontSize: 11, padding: '3px 6px' }}>View</button>
                          {sbEmail && (
                            <button
                              onClick={() => setPreviewId(previewId === sbId ? null : sbId)}
                              style={{
                                fontSize: 10, padding: '3px 6px',
                                border: '0.5px solid var(--blue-mid)', borderRadius: 4,
                                background: previewId === sbId ? 'var(--blue-bg)' : 'var(--bg-primary)',
                                cursor: 'pointer', color: 'var(--blue-text)',
                              }}
                            >Email</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Summary bar */}
      <div style={{
        display: 'flex', gap: 16, marginTop: 16, alignItems: 'center',
        padding: '12px 16px', background: 'var(--bg-secondary)',
        borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--text-muted)',
      }}>
        <span><strong style={{ color: 'var(--text-primary)' }}>{confirmed}</strong> confirmed</span>
        <span><strong style={{ color: 'var(--text-primary)' }}>{enquired}</strong> enquired</span>
        <span><strong style={{ color: 'var(--text-primary)' }}>{readyToSend}</strong> ready to send</span>
        <span><strong style={{ color: 'var(--text-primary)' }}>{notStarted}</strong> not started</span>
        {cancelledCount > 0 && (
          <span
            onClick={() => setShowCancelled(s => !s)}
            style={{ marginLeft: 'auto', cursor: 'pointer', userSelect: 'none', color: 'var(--text-muted)', textDecoration: 'underline', textDecorationStyle: 'dotted' }}
            title={showCancelled ? 'Hide cancelled bookings' : 'Show cancelled bookings'}
          >
            {showCancelled ? 'Hide' : 'Show'} {cancelledCount} cancelled
          </span>
        )}
      </div>

      {/* Draft-only nights not yet in Zoho */}
      {draftOnlyNights.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{
            padding: '10px 16px', background: 'var(--amber-bg)',
            borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--amber-text)',
            marginBottom: 8,
          }}>
            <strong>{draftOnlyNights.length} night{draftOnlyNights.length !== 1 ? 's' : ''}</strong> in draft not yet pushed to Zoho — edit itinerary to push
          </div>
          <div className="table-wrap">
            <table style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 50 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: '28%' }} />
                <col style={{ width: '30%' }} />
                <col style={{ width: 60 }} />
              </colgroup>
              <thead>
                <tr><th>Day</th><th>Date</th><th>Route</th><th>Lodge</th><th>Meals</th></tr>
              </thead>
              <tbody>
                {draftOnlyNights.map((n, i) => {
                  const lr = lookupLodge(n.lodge)
                  return (
                    <tr key={'draft_' + i} style={{ opacity: 0.7 }}>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{n.pre_tour ? 'Pre' : n.day}</td>
                      <td>{fmtDate(n.date)}</td>
                      <td>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{n.route || ''}</div>
                        {n.km && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{n.km} km</div>}
                        {n.route_notes && <div style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>{n.route_notes}</div>}
                        {n.excursion && <div style={{ fontSize: 10, color: 'var(--blue-text)', marginTop: 2 }}>Excursion: {n.excursion}</div>}
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{n.lodge || '—'}</div>
                        {n.lodge && lr && lr.email && <div style={{ fontSize: 10, color: 'var(--green-text)' }}>{lr.email}</div>}
                        {n.lodge && !lr && <div style={{ fontSize: 10, color: 'var(--red-text)' }}>Not in Zoho</div>}
                        {n.backup && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Backup: {n.backup}</div>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{n.meals || ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>
      )}
      </>
      }
    </div>
  )
}

function TourConfig({ tour }) {
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState({
    pax_single: tour.pax_single || 8,
    pax_twin: tour.pax_twin || 2,
    pax_double: tour.pax_double || 1,
    guide_rooms: tour.guide_rooms || 3,
    num_riders: tour.num_riders || 12,
    max_guests: tour.max_guests || 12,
  })

  const totalPax = config.pax_single + (config.pax_twin * 2) + (config.pax_double * 2)
  const totalRooms = config.pax_single + config.pax_twin + config.pax_double + config.guide_rooms
  const hasConfig = totalPax > 0 || config.guide_rooms > 0

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/update-tour', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tour_id: tour.id, updates: {
          Pax_in_Single_Rooms: config.pax_single,
          Pax_in_Shared_Twin_Rooms: config.pax_twin,
          Pax_in_Shared_Double_Rooms: config.pax_double,
          Guide_Rooms: config.guide_rooms,
          Number_of_riders: config.num_riders,
          Max_Guests: config.max_guests,
        }})
      })
      if (!res.ok) throw new Error('Failed to save')
    } catch(err) {
      alert('Error saving: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const Field = ({ label, field }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <label style={{ fontSize: 12, color: 'var(--text-muted)', width: 100 }}>{label}</label>
      <input
        type="number" min="0" value={config[field]}
        onChange={e => setConfig(prev => ({ ...prev, [field]: parseInt(e.target.value) || 0 }))}
        style={{
          width: 50, fontSize: 13, padding: '3px 6px', textAlign: 'center',
          border: '0.5px solid var(--border-default)', borderRadius: 4,
          background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none',
        }}
      />
    </div>
  )

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        style={{
          display: 'flex', gap: 16, marginBottom: 16,
          padding: '10px 16px', background: hasConfig ? 'var(--bg-secondary)' : 'var(--amber-bg)',
          borderRadius: 'var(--radius-md)', fontSize: 12,
          color: hasConfig ? 'var(--text-muted)' : 'var(--amber-text)',
          border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer',
        }}
      >
        {hasConfig ? (
          <>
            <span>{totalPax} pax</span>
            <span>{config.pax_single} single, {config.pax_twin} twin, {config.pax_double} double</span>
            <span>{config.guide_rooms} guide room{config.guide_rooms !== 1 ? 's' : ''}</span>
            <span>{totalRooms} rooms total</span>
            <span style={{ marginLeft: 'auto' }}>Edit</span>
          </>
        ) : (
          <span>Room configuration not set — click to configure before sending enquiries</span>
        )}
      </button>
    )
  }

  return (
    <div style={{
      padding: 16, marginBottom: 16,
      border: '0.5px solid var(--border-default)',
      borderRadius: 'var(--radius-lg)',
      background: 'var(--bg-primary)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Room configuration</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={handleSave} disabled={saving} style={{ fontSize: 12, padding: '4px 12px' }}>
            {saving ? 'Saving...' : 'Save to Zoho'}
          </button>
          <button onClick={() => setExpanded(false)} style={{
            background: 'none', border: 'none', fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer',
          }}>Close</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
        <Field label="Single rooms" field="pax_single" />
        <Field label="Shared twin" field="pax_twin" />
        <Field label="Shared double" field="pax_double" />
        <Field label="Guide rooms" field="guide_rooms" />
        <Field label="Riders" field="num_riders" />
        <Field label="Max guests" field="max_guests" />
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
        {totalPax} pax · {totalRooms} rooms total
      </div>
    </div>
  )
}

function DraftPreview({ tour, draftNights, lookupLodge, onEditItinerary, onRefresh }) {
  const [pushing, setPushing] = useState(false)
  const [zohoTourName, setZohoTourName] = useState(tour.name || '')
  const isLocalTour = (tour.id || '').startsWith('local_') || tour.local

  const handlePushToZoho = async () => {
    if (isLocalTour && !zohoTourName.trim()) {
      alert('Please enter a Zoho Tour Name before pushing.')
      return
    }
    if (!confirm('Push ' + draftNights.length + ' nights to Zoho? This will create the tour and lodge bookings.')) return
    setPushing(true)
    try {
      let tourId = tour.id
      let tourName = zohoTourName || tour.name

      // Create tour in Zoho first if local
      if (isLocalTour) {
        const createRes = await fetch('/api/create-tour', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: tourName,
            departure_date: tour.departure_date,
            tour_type: tour.tour_type || '',
          }),
        })
        if (!createRes.ok) {
          const err = await createRes.json()
          throw new Error('Failed to create tour: ' + (err.error || ''))
        }
        const createResult = await createRes.json()
        tourId = createResult.id
        // Remove from local tours
        try {
          const localTours = JSON.parse(localStorage.getItem('rds_local_tours') || '[]')
          localStorage.setItem('rds_local_tours', JSON.stringify(localTours.filter(t => t.id !== tour.id)))
        } catch (e) {}
      }

      const response = await fetch('/api/create-itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tour_id: tourId,
          tour_name: tourName,
          departure_date: tour.departure_date,
          nights: draftNights.map(n => ({
            date: n.date,
            route: n.route,
            lodge: n.lodge,
            backup: n.backup,
            meals: n.meals,
            region: n.region,
            day: n.day,
            km: n.km || '',
            route_notes: n.route_notes || '',
            pre_tour: n.pre_tour || false,
          })),
        }),
      })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Failed')
      }
      localStorage.removeItem('itinerary_draft_' + tour.id)
      if (onRefresh) onRefresh()
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setPushing(false)
    }
  }

  const handleDeleteDraft = () => {
    if (!confirm('Delete this draft? You can undo within 24 hours.')) return
    // Backup before deleting
    try {
      const backup = { data: draftNights, deleted_at: Date.now(), tour_id: tour.id, tour_name: tour.name }
      localStorage.setItem('itinerary_backup_' + tour.id, JSON.stringify(backup))
    } catch (e) {}
    localStorage.removeItem('itinerary_draft_' + tour.id)
    window.location.reload()
  }

  return (
    <div>
      {/* Zoho Tour Name field for local tours */}
      {isLocalTour && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
          padding: '8px 16px', background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-md)', fontSize: 12,
        }}>
          <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Zoho Tour Name:</span>
          <input
            type="text"
            value={zohoTourName}
            onChange={e => setZohoTourName(e.target.value)}
            placeholder="e.g. FoSA 1 Sep 27"
            style={{
              flex: 1, fontSize: 13, fontWeight: 500, padding: '4px 8px',
              border: '0.5px solid var(--border-default)', borderRadius: 4,
              outline: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)',
            }}
          />
        </div>
      )}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12, padding: '10px 16px', background: 'var(--amber-bg)',
        borderRadius: 'var(--radius-md)', fontSize: 12,
      }}>
        <span style={{ color: 'var(--amber-text)' }}>
          <strong>Draft</strong> — {draftNights.length} nights, not yet in Zoho
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={onEditItinerary} style={{ fontSize: 12, padding: '4px 12px' }}>
            Edit
          </button>
          <button
            className="btn btn-primary"
            onClick={handlePushToZoho}
            disabled={pushing || (isLocalTour && !zohoTourName.trim())}
            style={{ fontSize: 12, padding: '4px 12px' }}
          >
            {pushing ? 'Pushing...' : 'Push to Zoho'}
          </button>
          <button
            onClick={handleDeleteDraft}
            style={{
              background: 'none', border: 'none', fontSize: 11,
              color: 'var(--text-muted)', cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--red-text)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
          >Delete draft</button>
        </div>
      </div>
      <div className="table-wrap">
        <table style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 50 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: '25%' }} />
            <col style={{ width: '30%' }} />
            <col style={{ width: '10%' }} />
          </colgroup>
          <thead>
            <tr><th>Day</th><th>Date</th><th>Route</th><th>Lodge</th><th>Meals</th></tr>
          </thead>
          <tbody>
            {draftNights.map((n, i) => {
              const lodge = n.lodge || ''
              const lr = lookupLodge(lodge)
              return (
                <tr key={n.id || i}>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{n.pre_tour ? 'Pre' : n.day}</td>
                  <td>{fmtDate(n.date)}</td>
                  <td>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{n.route || ''}</div>
                    {n.km && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{n.km} km</div>}
                    {n.route_notes && <div style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>{n.route_notes}</div>}
                    {n.excursion && (
                      <div style={{ fontSize: 10, color: 'var(--blue-text)', marginTop: 2 }}>
                        Excursion: {n.excursion}
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{lodge}</div>
                    {lodge && lr && lr.email && <div style={{ fontSize: 10, color: 'var(--green-text)' }}>{lr.email}</div>}
                    {lodge && lr && !lr.email && <div style={{ fontSize: 10, color: 'var(--amber-text)' }}>No email</div>}
                    {lodge && !lr && <div style={{ fontSize: 10, color: 'var(--red-text)' }}>Not in Zoho</div>}
                    {n.backup && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Backup: {n.backup}</div>}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{n.meals || ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── TourInbox ──────────────────────────────────────────────────────────────
// Conversation-grouped view: one row per booking/lodge, showing thread summary.
// Click row to expand full thread inline. View button opens booking detail.

function TourInbox({ tour, sorted, onSelectBooking, tours }) {
  const [allEmails, setAllEmails] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [expanded, setExpanded] = React.useState({}) // bookingId → bool
  const [threadCache, setThreadCache] = React.useState({}) // bookingId → emails[]
  const [expandedEmail, setExpandedEmail] = React.useState({}) // emailId → bool
  const [routingEmail, setRoutingEmail] = React.useState(null) // { email, bookingId }

  // Build booking map
  const bookingMap = React.useMemo(() => {
    const m = {}
    sorted.forEach(b => { m[b.id || b['Record Id']] = b })
    return m
  }, [sorted])

  // Load all email summaries for the tour upfront
  React.useEffect(() => {
    const ids = sorted.map(b => b.id || b['Record Id']).filter(Boolean)
    if (!ids.length) { setLoading(false); return }
    fetch('/api/bp-tour-emails?booking_ids=' + ids.join(','))
      .then(r => r.json())
      .then(d => { setAllEmails(d.emails || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [tour.id])

  // Group emails by booking_id, newest first per group
  const conversations = React.useMemo(() => {
    if (!allEmails) return []
    const groups = {}
    allEmails.forEach(em => {
      if (!groups[em.booking_id]) groups[em.booking_id] = []
      groups[em.booking_id].push(em)
    })
    // Sort each group newest first
    Object.values(groups).forEach(g => g.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)))
    // Sort conversations by most recent email
    return Object.entries(groups).sort((a, b) => {
      const aDate = a[1][0] ? new Date(a[1][0].date || 0) : 0
      const bDate = b[1][0] ? new Date(b[1][0].date || 0) : 0
      return bDate - aDate
    })
  }, [allEmails])

  const toggleExpand = async (bookingId) => {
    const isOpen = expanded[bookingId]
    setExpanded(prev => ({ ...prev, [bookingId]: !isOpen }))
    // Load full thread if not cached
    if (!isOpen && !threadCache[bookingId]) {
      try {
        const r = await fetch('/api/bp-emails?booking_id=' + bookingId)
        const d = await r.json()
        setThreadCache(prev => ({ ...prev, [bookingId]: d.emails || [] }))
      } catch (e) { /* ignore */ }
    }
  }

  const handleReroute = async (newBookingId) => {
    if (!routingEmail) return
    const sourcePath = routingEmail.email._blob_path || ('emails/booking/' + routingEmail.bookingId + '/' + (routingEmail.email.id || routingEmail.email.gmail_message_id) + '.json')
    try {
      const r = await fetch('/api/email-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_path: sourcePath, booking_id: newBookingId }),
      })
      const d = await r.json()
      if (!d.success) throw new Error(d.error || 'Route failed')
      setRoutingEmail(null)
      // Remove from thread cache
      setThreadCache(prev => {
        const next = { ...prev }
        if (next[routingEmail.bookingId]) {
          next[routingEmail.bookingId] = next[routingEmail.bookingId].filter(e => e.id !== routingEmail.email.id)
        }
        return next
      })
    } catch (e) {
      alert('Could not reroute: ' + e.message)
    }
  }

  if (loading) return <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
  if (!conversations.length) return <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>No emails found for this tour.</div>

  return (
    <>
    <div style={{ border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
      {conversations.map(([bookingId, summaries], ci) => {
        const bk = bookingMap[bookingId]
        const lodge = bk
          ? ((bk.Lodge_Name && typeof bk.Lodge_Name === 'object' ? bk.Lodge_Name.name : bk.Lodge_Name) || bk.Name || '—')
          : bookingId
        const latest = summaries[0]
        const hasNewReply = bk && bk.New_Reply === true
        const count = summaries.length
        const isOpen = expanded[bookingId]
        const thread = threadCache[bookingId]
        const date = latest && latest.date
          ? new Date(latest.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
          : ''

        return (
          <div key={bookingId} style={{ borderBottom: ci < conversations.length - 1 ? '0.5px solid var(--border-light)' : 'none' }}>
            {/* Conversation row */}
            <div
              onClick={() => toggleExpand(bookingId)}
              style={{
                display: 'grid', gridTemplateColumns: '24px 1fr auto auto auto',
                alignItems: 'center', gap: 10, padding: '10px 14px',
                cursor: 'pointer', background: isOpen ? 'var(--bg-secondary)' : hasNewReply ? 'var(--blue-bg)' : 'var(--bg-primary)',
              }}
              onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = 'var(--bg-secondary)' }}
              onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = hasNewReply ? 'var(--blue-bg)' : 'var(--bg-primary)' }}
            >
              <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
                {hasNewReply
                  ? <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#C62828', display: 'inline-block' }} />
                  : <span style={{ color: 'var(--text-muted)' }}>{isOpen ? '▾' : '▸'}</span>
                }
              </div>
              <div>
                <span style={{ fontWeight: hasNewReply ? 600 : 500, fontSize: 13, color: 'var(--text-primary)' }}>{lodge}</span>
                <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {latest ? latest.subject || '(no subject)' : ''}
                </span>
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{count} email{count !== 1 ? 's' : ''}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{date}</span>
              <button
                onClick={e => { e.stopPropagation(); bk && onSelectBooking(bk, 'itinerary', { focusTab: 'correspondence' }) }}
                style={{ fontSize: 11, padding: '2px 8px', border: '0.5px solid var(--border-default)', borderRadius: 3, background: 'var(--bg-primary)', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >View</button>
            </div>

            {/* Expanded thread */}
            {isOpen && (
              <div style={{ background: 'var(--bg-secondary)', borderTop: '0.5px solid var(--border-light)' }}>
                {!thread && (
                  <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>Loading thread…</div>
                )}
                {thread && thread.length === 0 && (
                  <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>No emails stored for this booking.</div>
                )}
                {thread && thread.map((em, ei) => {
                  const emId = em.id || ei
                  const isEmailOpen = expandedEmail[emId]
                  const isInbound = em.direction === 'inbound'
                  const emDate = em.date ? new Date(em.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
                  const from = (em.from || '').split('<')[0].trim() || em.from || ''
                  const body = em.body || em.email_content || ''

                  const bodyText = body.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
                  return (
                    <div key={emId} style={{ borderBottom: ei < thread.length - 1 ? '0.5px solid var(--border-light)' : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px 8px 32px' }}>
                        <span style={{ fontSize: 10, color: isInbound ? 'var(--green-text)' : 'var(--blue-text)', fontWeight: 500, flexShrink: 0, width: 32 }}>
                          {isInbound ? '↙ In' : '↗ Out'}
                        </span>
                        <div
                          onClick={() => setExpandedEmail(prev => ({ ...prev, [emId]: !isEmailOpen }))}
                          style={{ flex: 1, cursor: 'pointer', overflow: 'hidden', minWidth: 0 }}
                        >
                          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>{em.subject || '(no subject)'}</span>
                          {!isEmailOpen && bodyText && (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
                              {bodyText.slice(0, 100)}{bodyText.length > 100 ? '…' : ''}
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>{emDate}</span>
                        {isInbound && tours && (
                          <button
                            onClick={e => { e.stopPropagation(); setRoutingEmail({ email: em, bookingId }) }}
                            style={{ fontSize: 10, padding: '2px 6px', border: '0.5px solid var(--border-default)', borderRadius: 3, background: 'var(--bg-primary)', cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0 }}
                          >Reroute</button>
                        )}
                      </div>
                      {isEmailOpen && body && (
                        <div style={{ padding: '8px 14px 12px 64px', fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto', background: 'var(--bg-primary)' }}>
                          {bodyText}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
    {routingEmail && (
      <RoutingPicker
        email={routingEmail.email}
        tours={tours}
        currentBookingId={routingEmail.bookingId}
        onCancel={() => setRoutingEmail(null)}
        onRoute={handleReroute}
      />
    )}
    </>
  )
}

// ── InlineComposer ────────────────────────────────────────────────────────
// Blank email composer that opens inline in the itinerary row.
// To, Subject, Body all editable. Sender toggle Helen/Andrew.

const SIGNATURES = {
  Helen: `Kind regards,
Helen Baker
Lodge Bookings | Ride Down South
bookings@ridedownsouth.com
www.ridedownsouth.com`,
  Andrew: `Kind regards,
Andrew Vaughan
Director | Ride Down South
bookings@ridedownsouth.com
www.ridedownsouth.com`,
}

function InlineComposer({ toEmail, booking, tourName, sender, onSenderChange, onClose, onSent }) {
  const [to, setTo] = React.useState(toEmail || '')
  const [subject, setSubject] = React.useState('')
  const [body, setBody] = React.useState('\n\n' + SIGNATURES[sender] || '')
  const [sending, setSending] = React.useState(false)
  const [error, setError] = React.useState(null)

  // Keep signature in sync with sender toggle
  React.useEffect(() => {
    setBody(prev => {
      const sigStart = prev.lastIndexOf('Kind regards,')
      const beforeSig = sigStart > 0 ? prev.slice(0, sigStart) : prev + '\n\n'
      return beforeSig + SIGNATURES[sender]
    })
  }, [sender])

  const handleSend = async () => {
    if (!to) { setError('No recipient email address'); return }
    if (!subject.trim()) { setError('Please add a subject line'); return }
    setSending(true)
    setError(null)
    try {
      const bookingId = booking.id || booking['Record Id']
      const rawLodge = booking.Lodge_Name || booking.Name || ''
      const lodgeName = (typeof rawLodge === 'object' ? rawLodge.name || '' : rawLodge).split(' - ')[0]
      const res = await fetch('/api/send-enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          subject: subject.trim(),
          body: body.trim(),
          booking_ids: [bookingId],
          tour_name: tourName,
          lodge_name: lodgeName,
          sender,
        }),
      })
      const d = await res.json()
      if (!d.email_sent) throw new Error(d.email_error || d.error || 'Send failed')
      onSent()
    } catch (e) {
      setError(e.message)
      setSending(false)
    }
  }

  const inputStyle = {
    width: '100%', fontSize: 12, padding: '5px 8px',
    border: '0.5px solid var(--border-default)', borderRadius: 3,
    background: 'var(--bg-primary)', color: 'var(--text-primary)',
    fontFamily: 'var(--font-sans)', boxSizing: 'border-box',
  }

  return (
    <div style={{
      margin: '0 16px 8px', padding: '14px 16px',
      background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)',
      border: '0.5px solid var(--border-default)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>New email</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {/* Sender toggle */}
          <div style={{ display: 'flex', border: '0.5px solid var(--border-default)', borderRadius: 3, overflow: 'hidden' }}>
            {['Helen', 'Andrew'].map(s => (
              <button key={s} onClick={() => onSenderChange(s)} style={{
                fontSize: 10, padding: '2px 10px', border: 'none', cursor: 'pointer',
                background: sender === s ? 'var(--blue-bg)' : 'transparent',
                color: sender === s ? 'var(--blue-text)' : 'var(--text-secondary)',
                fontWeight: sender === s ? 600 : 400,
              }}>{s}</button>
            ))}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, lineHeight: 1, padding: '0 2px' }}>×</button>
        </div>
      </div>

      {/* To */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 48, flexShrink: 0 }}>To</span>
        <input
          value={to}
          onChange={e => setTo(e.target.value)}
          placeholder="recipient@lodge.com"
          style={inputStyle}
        />
      </div>

      {/* Subject */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 48, flexShrink: 0 }}>Subject</span>
        <input
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="Email subject"
          style={inputStyle}
        />
      </div>

      {/* Body */}
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        rows={10}
        style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6, padding: '8px' }}
      />

      {error && (
        <div style={{ fontSize: 11, color: 'var(--red-text)', marginTop: 6 }}>{error}</div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
        <button onClick={onClose} className="btn btn-sm">Cancel</button>
        <button
          onClick={handleSend}
          disabled={sending}
          className="btn btn-primary"
          style={{ fontSize: 11, padding: '4px 14px' }}
        >{sending ? 'Sending…' : 'Send'}</button>
      </div>
    </div>
  )
}
