import React, { useState, useEffect } from 'react'
import { fmtDate, fmtDateFull, fmtCurrency, getStatusBadge, getStatus, daysBetween } from '../utils/helpers'
import { cleanEmailBody, looksLikeRawHtml, splitQuotedContent } from '../utils/emailBody'
import { BookingActivityLog } from './ActivityLog'
import RoutingPicker from './RoutingPicker'
import TemplatePicker from './TemplatePicker'
import { SENDER_PROFILES } from '../utils/emailTemplates'

export default function LodgeDetail({ booking, tour, lodges, onBack, onRefresh, onMarkBookingDone, readState, onMarkRead, tours, backLabel, focusEmailId, focusTab }) {
  const [emails, setEmails] = useState([])
  const [loadingEmails, setLoadingEmails] = useState(true)
  const [editing, setEditing] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [metaTick, setMetaTick] = useState(0) // force re-render on localStorage meta changes
  const [bookingMeta, setBookingMeta] = useState({ handledBy: '', notes: '' })
  const [polling, setPolling] = useState(false)
  const [gmailResults, setGmailResults] = useState([])
  const [searchingGmail, setSearchingGmail] = useState(false)
  const [lastDismissed, setLastDismissed] = useState(null)

  // Invoice line items
  const [invoiceItems, setInvoiceItems] = useState(null) // null = not yet loaded
  const [invoiceLoading, setInvoiceLoading] = useState(false)
  const [invoiceSaving, setInvoiceSaving] = useState(false)
  const [showAddInvoice, setShowAddInvoice] = useState(false)
  const [newInvoice, setNewInvoice] = useState({ date: '', description: '', amount: '', currency: '', type: 'invoice' })
  const [editingInvoiceId, setEditingInvoiceId] = useState(null)

  // AI parsed fields — collected from all emails that have ai_parsed_flags
  const [aiParsedFields, setAiParsedFields] = useState({})
  // If the booking arrives with a pending new-reply flag, OR if Helen
  // navigated here by clicking a specific email, land on the
  // Correspondence tab so she sees the thread first.
  const [activeDetailTab, setActiveDetailTab] = useState(
    focusTab || ((focusEmailId || booking.New_Reply === true) ? 'correspondence' : 'details')
  )

  const bookingId = booking.id || booking['Record Id']
  const lodgeName = (booking.Lodge_Name || booking.Name || '').split(' - ')[0]
  const status = getStatus(booking)
  const badge = getStatusBadge(status)

  // Lodge directory lookup — fuzzy match (exact → substring → word overlap)
  const lodgeRecord = (() => {
    if (!lodgeName) return null
    const lower = lodgeName.toLowerCase().trim()
    const list = lodges || []
    // Exact match
    for (let i = 0; i < list.length; i++) {
      if (list[i].name && list[i].name.toLowerCase().trim() === lower) return list[i]
    }
    // Substring match (lodge name contains or is contained in booking name)
    for (let i = 0; i < list.length; i++) {
      if (!list[i].name) continue
      const ln = list[i].name.toLowerCase().trim()
      if (ln.length > 3 && (lower.indexOf(ln) > -1 || ln.indexOf(lower) > -1)) return list[i]
    }
    // Word overlap
    const words = lower.split(/\s+/).filter(w => w.length > 3)
    if (words.length > 0) {
      for (let i = 0; i < list.length; i++) {
        if (!list[i].name) continue
        const ln = list[i].name.toLowerCase()
        if (words.some(w => ln.indexOf(w) > -1)) return list[i]
      }
    }
    return null
  })()

  const lodgeEmail = lodgeRecord
    ? (lodgeRecord.email || '')
    : (booking.Email || booking.Lodge_Email || '')
  const lodgeContact = lodgeRecord
    ? (lodgeRecord.contact || '')
    : (booking.Contact_Name || '')

  const fetchEmails = () => {
    setLoadingEmails(true)
    fetch('/api/bp-emails?booking_id=' + bookingId)
      .then(r => r.json())
      .then(d => { setEmails(d.emails || []); setLoadingEmails(false) })
      .catch(() => setLoadingEmails(false))
  }

  useEffect(() => { fetchEmails() }, [bookingId])

  // Fetch blob-based meta (handledBy, notes) for this booking
  useEffect(() => {
    fetch('/api/bp-meta?booking_id=' + bookingId)
      .then(r => r.ok ? r.json() : { handledBy: '', notes: '' })
      .then(data => setBookingMeta(data))
      .catch(() => {})
  }, [bookingId])

  // Fetch invoice line items when Details tab is active
  useEffect(() => {
    if (activeDetailTab !== 'details' || invoiceItems !== null) return
    setInvoiceLoading(true)
    fetch('/api/invoices?booking_id=' + bookingId)
      .then(r => r.json())
      .then(d => { setInvoiceItems(d.items || []); setInvoiceLoading(false) })
      .catch(() => { setInvoiceItems([]); setInvoiceLoading(false) })
  }, [activeDetailTab, bookingId])

  // Collect AI parsed flags from emails — merge all flags, newest email wins per field
  useEffect(() => {
    if (emails.length === 0) return
    const merged = {}
    const sorted = [...emails].sort((a, b) => new Date(a.date || a.email_date || 0) - new Date(b.date || b.email_date || 0))
    sorted.forEach(em => {
      if (em.ai_parsed_flags && typeof em.ai_parsed_flags === 'object') {
        Object.entries(em.ai_parsed_flags).forEach(([key, f]) => {
          merged[key] = { ...f, email_date: em.date, email_subject: em.subject }
        })
      }
    })
    setAiParsedFields(merged)
  }, [emails])

  const handleCheckReplies = async () => {
    setPolling(true)
    try {
      const res = await fetch('/api/poll-gmail', { method: 'POST' })
      const result = await res.json()
      if (result.stored > 0) { fetchEmails(); if (onRefresh) onRefresh() }
    } catch (err) { console.error('Poll error:', err) }
    finally { setPolling(false) }
  }

  const handleSearchGmail = async () => {
    setSearchingGmail(true)
    try {
      const params = new URLSearchParams()
      if (lodgeEmail) params.set('lodge_email', lodgeEmail)
      else params.set('lodge_name', lodgeName)
      if (checkIn) params.set('check_in', checkIn)
      const res = await fetch('/api/gmail-search?' + params.toString())
      const result = await res.json()
      if (result.emails) {
        // Filter out emails we already have stored (by gmail_id matching message_id)
        const storedIds = new Set(emails.map(e => e.message_id || e.gmail_id || ''))
        const newResults = result.emails.filter(gm => !storedIds.has(gm.gmail_id))
        setGmailResults(newResults)
      }
    } catch (err) { console.error('Gmail search error:', err) }
    finally { setSearchingGmail(false) }
  }

  const handleSave = async (field, value) => {
    setSavingEdit(true)
    try {
      const updates = {}
      updates[field] = value
      const res = await fetch('/api/update-bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_ids: [bookingId], updates }),
      })
      if (!res.ok) throw new Error('Failed to update')
      setEditing(null)
      if (onRefresh) onRefresh()
    } catch (err) { alert('Error: ' + err.message) }
    finally { setSavingEdit(false) }
  }

  const total = parseFloat(booking.Total_Amount || booking['Total Amount']) || 0
  const currency = booking.Lodge_Currency || booking.Currency || ''
  const deposit = parseFloat(booking.Deposit_Amount) || 0
  const today = new Date().toISOString().split('T')[0]
  const cancelBefore = booking.Cancel_Free_Before || ''
  const cancelPolicy = booking.Cancellation_Policy_Text || ''
  const credit = parseFloat(booking.Credit_Amount) || 0

  const checkIn = booking.Check_in_Date || booking['Check-in'] || ''
  const checkOut = booking.Check_out_Date || booking['Check-out'] || ''
  const nights = booking.Nights || (checkIn && checkOut ? daysBetween(checkIn, checkOut) : '')
  const meals = booking.Meals || ''
  const rdsRef = booking.RDS_Reference || ''
  const lodgeRef = booking.Lodge_Reference || ''
  const enquirySent = booking.Enquiry_Sent_Date || ''
  const lastResponse = booking.Last_Response_Date || ''
  const followUp = booking.Follow_up_Date || ''
  const dayDesc = booking.Day_Description || booking['Day Description'] || ''
  const balanceDue = booking.Balance_Due_calculated

  const handleCopyAiField = async (zohoField, value) => {
    try {
      await handleSave(zohoField, value)
      // Remove from aiParsedFields once copied
      setAiParsedFields(prev => {
        const next = { ...prev }
        Object.keys(next).forEach(k => { if (next[k].zoho_field === zohoField) delete next[k] })
        return next
      })
    } catch (e) { /* handleSave already alerts */ }
  }

  const handleAddInvoiceItem = async () => {
    if (!newInvoice.amount || !newInvoice.date) return
    setInvoiceSaving(true)
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, item: { ...newInvoice }, currency }),
      })
      const d = await res.json()
      setInvoiceItems(d.items || [])
      setNewInvoice({ date: '', description: '', amount: '', currency: '', type: 'invoice' })
      setShowAddInvoice(false)
    } catch (e) { alert('Error saving invoice: ' + e.message) }
    finally { setInvoiceSaving(false) }
  }

  const handleDeleteInvoiceItem = async (id) => {
    if (!confirm('Delete this line item?')) return
    setInvoiceSaving(true)
    try {
      const res = await fetch('/api/invoices?booking_id=' + bookingId + '&id=' + id + '&currency=' + encodeURIComponent(currency), { method: 'DELETE' })
      const d = await res.json()
      setInvoiceItems(d.items || [])
    } catch (e) { alert('Error: ' + e.message) }
    finally { setInvoiceSaving(false) }
  }

  const handleSyncTotal = async () => {
    if (!invoiceItems || invoiceItems.length === 0) return
    const derived = invoiceItems.reduce((sum, i) => sum + (i.type === 'credit' ? -(parseFloat(i.amount)||0) : (parseFloat(i.amount)||0)), 0)
    if (!confirm('Set Total_Amount to ' + fmtCurrency(Math.round(derived*100)/100, currency) + '?')) return
    setInvoiceSaving(true)
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, currency, sync_total: true }),
      })
      const d = await res.json()
      setInvoiceItems(d.items || [])
      if (onRefresh) onRefresh()
    } catch (e) { alert('Error: ' + e.message) }
    finally { setInvoiceSaving(false) }
  }

  const invoiceDerivedTotal = (invoiceItems || []).reduce((sum, i) => sum + (i.type === 'credit' ? -(parseFloat(i.amount)||0) : (parseFloat(i.amount)||0)), 0)

  const STATUS_OPTIONS = [
    'Not Started', 'Ready to Send', 'Enquiry Sent', 'Availability Confirmed',
    'Confirmed', 'Proforma Received', 'Deposit Paid', 'Balance Paid',
    'Not Available', 'Cancelled', 'Waitlisted', 'Credit against booking',
  ]

  return (
    <div>
      {/* Back button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', color: 'var(--text-muted)',
          fontSize: 13, padding: '0 0 12px', cursor: 'pointer',
        }}>
          ← {backLabel || ('Back to ' + (tour ? tour.name : 'itinerary'))}
        </button>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {booking.New_Reply === true && (
            <button
              onClick={() => {
                handleSave('New_Reply', false)
                // Also clear blob-based read state for all unread inbound emails
                const unreadIds = emails
                  .filter(em => em.direction !== 'outbound' && em.id && readState && !readState[em.id])
                  .map(em => em.id)
                unreadIds.forEach(id => { if (onMarkRead) onMarkRead(id) })
                onMarkBookingDone && onMarkBookingDone(bookingId)
              }}
              disabled={savingEdit}
              title="Mark all replies as read and clear the unread flag"
              style={{
                background: '#FFEBEE', border: '0.5px solid #C62828',
                borderRadius: 4, fontSize: 11, padding: '3px 10px', cursor: 'pointer',
                color: '#C62828', fontWeight: 500,
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#C62828' }} />
              {savingEdit ? 'Marking...' : 'Mark actioned'}
            </button>
          )}
          <button
            disabled={polling}
            onClick={async () => {
              setPolling(true)
              fetchEmails()
              try {
                await fetch('/api/reparse-email', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ booking_id: bookingId }),
                })
              } catch (e) { console.error('Reparse error:', e) }
              fetchEmails()
              if (onRefresh) onRefresh()
              setPolling(false)
            }}
            style={{
              background: 'none', border: '0.5px solid var(--border-default)',
              borderRadius: 4, fontSize: 11, padding: '3px 10px', cursor: polling ? 'default' : 'pointer',
              color: 'var(--text-muted)', opacity: polling ? 0.5 : 1,
            }}
          >{polling ? 'Refreshing...' : '↻ Refresh'}</button>
        </div>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 500 }}>{lodgeName}</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            {dayDesc}
            {checkIn ? ' · ' + fmtDateFull(checkIn) + ' – ' + fmtDateFull(checkOut) : ''}
            {nights ? ' · ' + nights + ' night' + (nights > 1 ? 's' : '') : ''}
          </div>
        </div>
        <div>
          {editing === 'status' ? (
            <select
              value={status}
              onChange={e => handleSave('Status', e.target.value)}
              autoFocus
              onBlur={() => setTimeout(() => setEditing(null), 200)}
              style={{
                fontSize: 12, padding: '4px 8px',
                border: '0.5px solid var(--blue-mid)', borderRadius: 6,
                outline: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)',
              }}
            >
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : (
            <span
              className={'badge ' + badge.cls}
              onClick={() => setEditing('status')}
              style={{ cursor: 'pointer', fontSize: 12, padding: '4px 10px' }}
              title="Click to change status"
            >
              {badge.label}
            </span>
          )}
        </div>
      </div>


      {/* Booking Type toggle */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
        padding: '8px 14px', background: 'var(--bg-secondary)',
        borderRadius: 'var(--radius-md)', fontSize: 12,
      }}>
        <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>Booking type:</span>
        {['Guest', 'Guide', 'Excursion'].map(type => {
          const current = booking.Booking_Type || 'Guest'
          const active = current === type
          return (
            <button
              key={type}
              onClick={() => { if (!active) handleSave('Booking_Type', type) }}
              style={{
                fontSize: 12, padding: '3px 12px', borderRadius: 12, cursor: active ? 'default' : 'pointer',
                border: '0.5px solid ' + (active ? 'var(--blue-mid)' : 'var(--border-default)'),
                background: active ? 'var(--blue-bg)' : 'transparent',
                color: active ? 'var(--blue-text)' : 'var(--text-muted)',
                fontWeight: active ? 600 : 400,
              }}
            >{type}</button>
          )
        })}
        {(booking.Booking_Type && booking.Booking_Type !== 'Guest') && (
          <span style={{ fontSize: 11, color: 'var(--amber-text)', marginLeft: 4 }}>
            ⚠ Excluded from rider portal sync
          </span>
        )}
      </div>

      {/* Handled by + Internal notes */}
      {(() => {
        const handledBy = bookingMeta.handledBy || ''
        const notes = bookingMeta.notes || ''
        const saveMeta = (field, value) => {
          fetch('/api/bp-meta', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ booking_id: bookingId, [field]: value }),
          }).then(r => r.ok ? r.json() : null).then(data => {
            if (data) setBookingMeta(prev => ({ ...prev, [field]: value }))
          })
        }
        return (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16,
            padding: '8px 14px', background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-md)', fontSize: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ color: 'var(--text-muted)' }}>Handled by:</span>
              <select
                value={handledBy}
                onChange={e => saveMeta('handledBy', e.target.value)}
                style={{
                  fontSize: 12, padding: '2px 6px', borderRadius: 4, cursor: 'pointer',
                  border: handledBy ? '0.5px solid var(--blue-mid)' : '0.5px solid var(--border-default)',
                  background: handledBy ? 'var(--blue-bg)' : 'var(--bg-primary)',
                  color: handledBy ? 'var(--blue-text)' : 'var(--text-muted)',
                  fontWeight: handledBy ? 600 : 400,
                }}
              >
                <option value=""></option>
                <option value="Helen">Helen</option>
                <option value="Andrew">Andrew</option>
                <option value="Mike">Mike</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Internal notes</div>
              <textarea
                value={notes}
                onChange={e => saveMeta('notes', e.target.value)}
                placeholder="Add internal note…"
                rows={2}
                style={{
                  width: '100%', fontSize: 12, padding: '4px 6px', borderRadius: 4,
                  border: '0.5px solid var(--border-default)', background: 'var(--bg-primary)',
                  color: 'var(--text-primary)', resize: 'vertical', fontFamily: 'inherit',
                }}
              />
            </div>
          </div>
        )
      })()}

      {/* Internal tab bar: Details | Correspondence */}
      <div style={{
        display: 'flex', gap: 0, marginBottom: 16,
        borderBottom: '0.5px solid var(--border-default)',
      }}>
        <button
          onClick={() => setActiveDetailTab('details')}
          style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 500,
            background: 'none', border: 'none', cursor: 'pointer',
            color: activeDetailTab === 'details' ? 'var(--blue-text)' : 'var(--text-muted)',
            borderBottom: activeDetailTab === 'details' ? '2px solid var(--blue-mid)' : '2px solid transparent',
            marginBottom: -0.5,
          }}
        >
          Details
        </button>
        <button
          onClick={() => setActiveDetailTab('correspondence')}
          style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 500,
            background: 'none', border: 'none', cursor: 'pointer',
            color: activeDetailTab === 'correspondence' ? 'var(--blue-text)' : 'var(--text-muted)',
            borderBottom: activeDetailTab === 'correspondence' ? '2px solid var(--blue-mid)' : '2px solid transparent',
            marginBottom: -0.5,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <span>Correspondence</span>
          {emails.length > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 500, color: 'var(--text-muted)',
              background: 'var(--bg-secondary)', padding: '1px 6px', borderRadius: 9,
            }}>
              {emails.length}
            </span>
          )}
          {booking.New_Reply === true && (
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#C62828' }} />
          )}
        </button>
        <button
          onClick={() => setActiveDetailTab('activity')}
          style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 500,
            background: 'none', border: 'none', cursor: 'pointer',
            color: activeDetailTab === 'activity' ? 'var(--blue-text)' : 'var(--text-muted)',
            borderBottom: activeDetailTab === 'activity' ? '2px solid var(--blue-mid)' : '2px solid transparent',
            marginBottom: -0.5,
          }}
        >
          Activity log
        </button>
      </div>

      {activeDetailTab === 'activity' && (
        <BookingActivityLog
          bookingId={bookingId}
          tourName={tour ? tour.name : ''}
          booking={booking}
        />
      )}

      {activeDetailTab === 'details' && (<>
      {/* Discrepancy warning banner */}
      {booking.Reservation_Comments && booking.Reservation_Comments.includes('⚠') && (
        <div style={{
          background: '#FFF3E0', border: '1px solid #FFB74D', borderRadius: 6,
          padding: '10px 14px', marginBottom: 16, fontSize: 13, lineHeight: 1.5,
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12
        }}>
          <div>
            <span style={{ fontWeight: 600, color: '#E65100' }}>⚠ Lodge response mismatch</span>
            <span style={{ color: '#BF360C', marginLeft: 8 }}>
              {booking.Reservation_Comments.split('|')[0].trim()}
            </span>
          </div>
          <button
            onClick={() => handleSave('Reservation_Comments', '')}
            style={{ fontSize: 11, padding: '2px 8px', border: '0.5px solid #FFB74D', borderRadius: 3,
              background: 'transparent', cursor: 'pointer', color: '#E65100', whiteSpace: 'nowrap', flexShrink: 0 }}
          >Clear</button>
        </div>
      )}
      {/* Row 1: Tour details + Booking details */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Tour details panel */}
        <div className="panel">
          <div className="panel-head">Tour details</div>
          <div className="panel-body">
            {tour ? (
              <DetailRows rows={[
                { label: 'Tour', value: tour.name || '—' },
                { label: 'Departure', value: tour.departure_date ? fmtDateFull(tour.departure_date) : '—' },
                { label: 'End date', value: tour.end_date ? fmtDateFull(tour.end_date) : '—' },
                { label: 'Tour status', value: tour.tour_status || '—' },
                { label: 'Tour type', value: tour.tour_type || '—' },
                { label: 'Max guests', value: tour.max_guests || '—' },
                { label: 'Riders', value: tour.num_riders || '—' },
              ]} />
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No tour linked</div>
            )}
          </div>
        </div>

        {/* Booking details panel */}
        <div className="panel">
          <div className="panel-head">Booking details</div>
          <div className="panel-body">
            <DetailRows onEdit={handleSave} rows={[
              { label: 'Lodge', value: lodgeName },
              { label: 'Contact', value: lodgeContact || '—' },
              { label: 'Email', value: lodgeEmail ? <a href={'mailto:' + lodgeEmail}>{lodgeEmail}</a> : '—' },
              { label: 'Check-in', value: fmtDateFull(checkIn) },
              { label: 'Check-out', value: fmtDateFull(checkOut) },
              { label: 'Nights', value: nights || '—' },
              { label: 'Meals', value: meals || '—' },
              { label: 'RDS reference', value: rdsRef || '—' },
              { label: 'Lodge reference', value: lodgeRef || '—', field: 'Lodge_Reference', raw: lodgeRef },
              { label: 'Total', value: total ? fmtCurrency(total, currency) : '—', field: 'Total_Amount', type: 'number', raw: total || '' },
              { label: 'Currency', value: currency || '—', field: 'Lodge_Currency', raw: currency },
              ...(credit > 0 ? [{ label: 'Credit applied', value: fmtCurrency(credit, currency), field: 'Credit_Amount', type: 'number', raw: credit }] : []),
            ]} />

            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid var(--border-light)' }}>
              <DetailRows rows={[
                { label: 'Enquiry sent', value: enquirySent ? fmtDateFull(enquirySent) : '—' },
                { label: 'Last response', value: lastResponse ? fmtDateFull(lastResponse) : '—' },
                { label: 'Follow up', value: followUp ? fmtDateFull(followUp) : '—' },
              ]} />
            </div>

            {lodgeRecord && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid var(--border-light)' }}>
                <DetailRows rows={[
                  { label: 'Country', value: lodgeRecord.country || '—' },
                  { label: 'Currency', value: lodgeRecord.currency || '—' },
                  { label: 'STO discount', value: lodgeRecord.sto_discount || '—' },
                  { label: 'Guide room policy', value: lodgeRecord.guide_room_policy || '—' },
                ]} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Invoice line items panel — full width */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Invoices & charges</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {invoiceItems && invoiceItems.length > 0 && (
              <button
                onClick={handleSyncTotal}
                disabled={invoiceSaving}
                title="Set Total_Amount to sum of line items"
                style={{ fontSize: 11, padding: '2px 8px', border: '0.5px solid var(--border-default)', borderRadius: 3, background: 'var(--bg-primary)', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >Set total from items ({fmtCurrency(Math.round(invoiceDerivedTotal*100)/100, currency)})</button>
            )}
            <button
              onClick={() => setShowAddInvoice(v => !v)}
              style={{ fontSize: 11, padding: '2px 8px', border: '0.5px solid var(--border-default)', borderRadius: 3, background: 'var(--bg-primary)', cursor: 'pointer', color: 'var(--text-secondary)' }}
            >+ Add</button>
          </div>
        </div>
        <div className="panel-body">
          {invoiceLoading && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Loading…</div>}
          {!invoiceLoading && invoiceItems && invoiceItems.length === 0 && !showAddInvoice && (
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No invoices recorded yet.</div>
          )}
          {!invoiceLoading && invoiceItems && invoiceItems.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '2px 8px 6px 0', fontWeight: 500 }}>Date</th>
                  <th style={{ padding: '2px 8px 6px 0', fontWeight: 500 }}>Type</th>
                  <th style={{ padding: '2px 8px 6px 0', fontWeight: 500 }}>Description</th>
                  <th style={{ padding: '2px 0 6px 0', fontWeight: 500, textAlign: 'right' }}>Amount</th>
                  <th style={{ width: 24 }}></th>
                </tr>
              </thead>
              <tbody>
                {invoiceItems.map(item => (
                  <tr key={item.id} style={{ borderTop: '0.5px solid var(--border-light)' }}>
                    <td style={{ padding: '5px 8px 5px 0', color: 'var(--text-primary)' }}>{item.date}</td>
                    <td style={{ padding: '5px 8px 5px 0' }}>
                      <span style={{
                        fontSize: 10, padding: '1px 5px', borderRadius: 3, fontWeight: 500,
                        background: item.type === 'credit' ? 'var(--green-bg, #F0FDF4)' : item.type === 'adjustment' ? 'var(--amber-bg, #FFFBEB)' : 'var(--blue-bg)',
                        color: item.type === 'credit' ? 'var(--green-text, #166534)' : item.type === 'adjustment' ? 'var(--amber-text, #92400E)' : 'var(--blue-text)',
                      }}>{item.type}</span>
                    </td>
                    <td style={{ padding: '5px 8px 5px 0', color: 'var(--text-secondary)' }}>{item.description || '—'}</td>
                    <td style={{ padding: '5px 0', textAlign: 'right', color: item.type === 'credit' ? 'var(--green-text, #166534)' : 'var(--text-primary)', fontWeight: 500 }}>
                      {item.type === 'credit' ? '−' : ''}{fmtCurrency(parseFloat(item.amount)||0, item.currency || currency)}
                    </td>
                    <td style={{ padding: '5px 0 5px 8px', textAlign: 'right' }}>
                      <button onClick={() => handleDeleteInvoiceItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, padding: '0 2px' }} title="Delete">×</button>
                    </td>
                  </tr>
                ))}
                {invoiceItems.length > 1 && (
                  <tr style={{ borderTop: '1px solid var(--border-default)' }}>
                    <td colSpan={3} style={{ padding: '6px 8px 2px 0', fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>Derived total</td>
                    <td style={{ padding: '6px 0 2px 0', textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)' }}>{fmtCurrency(Math.round(invoiceDerivedTotal*100)/100, currency)}</td>
                    <td></td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {/* Add invoice form */}
          {showAddInvoice && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.5fr', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Date</div>
                  <input type="date" value={newInvoice.date} onChange={e => setNewInvoice(v => ({...v, date: e.target.value}))}
                    style={{ width: '100%', fontSize: 12, padding: '4px 6px', border: '0.5px solid var(--border-default)', borderRadius: 3 }} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Type</div>
                  <select value={newInvoice.type} onChange={e => setNewInvoice(v => ({...v, type: e.target.value}))}
                    style={{ width: '100%', fontSize: 12, padding: '4px 6px', border: '0.5px solid var(--border-default)', borderRadius: 3 }}>
                    <option value="invoice">Invoice</option>
                    <option value="credit">Credit note</option>
                    <option value="adjustment">Adjustment</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Amount</div>
                  <input type="number" placeholder="0.00" value={newInvoice.amount} onChange={e => setNewInvoice(v => ({...v, amount: e.target.value}))}
                    style={{ width: '100%', fontSize: 12, padding: '4px 6px', border: '0.5px solid var(--border-default)', borderRadius: 3 }} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Description</div>
                  <input type="text" placeholder="e.g. Extra pre-night, 2 pax" value={newInvoice.description} onChange={e => setNewInvoice(v => ({...v, description: e.target.value}))}
                    style={{ width: '100%', fontSize: 12, padding: '4px 6px', border: '0.5px solid var(--border-default)', borderRadius: 3 }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button onClick={() => { setShowAddInvoice(false); setNewInvoice({ date: '', description: '', amount: '', currency: '', type: 'invoice' }) }}
                  style={{ fontSize: 11, padding: '3px 10px', border: '0.5px solid var(--border-default)', borderRadius: 3, background: 'var(--bg-primary)', cursor: 'pointer', color: 'var(--text-secondary)' }}>Cancel</button>
                <button onClick={handleAddInvoiceItem} disabled={invoiceSaving || !newInvoice.amount || !newInvoice.date}
                  style={{ fontSize: 11, padding: '3px 10px', border: 'none', borderRadius: 3, background: 'var(--blue-mid)', cursor: 'pointer', color: '#fff', opacity: (!newInvoice.amount || !newInvoice.date) ? 0.5 : 1 }}>
                  {invoiceSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Payments + Pax */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Payment & cancellation panel */}
        <div className="panel">
          <div className="panel-head">Payments & cancellation</div>
          <div className="panel-body" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 0, alignItems: 'start' }}>
          <div>{/* left col */}

            {/* AI parsed fields — shown when emails have extracted but unconfirmed data */}
            {Object.keys(aiParsedFields).filter(k => k !== 'suggested_status').length > 0 && (
              <div style={{ marginBottom: 14, paddingBottom: 12, borderBottom: '0.5px solid var(--border-light)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--amber-text, #92400E)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span>⚠</span><span>AI parsed — not yet saved</span>
                </div>
                {Object.entries(aiParsedFields).filter(([key]) => key !== 'suggested_status').map(([key, f]) => (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderTop: '0.5px solid var(--border-light)' }}>
                    <div style={{ fontSize: 11 }}>
                      <span style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 10 }}>{f.zoho_field}</span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500, marginLeft: 8 }}>{String(f.value)}</span>
                      {f.existing_value != null && (
                        <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontSize: 10 }}>existing: {String(f.existing_value)}</span>
                      )}
                    </div>
                    <button
                      onClick={() => handleCopyAiField(f.zoho_field, f.value)}
                      style={{ fontSize: 10, padding: '2px 7px', border: '0.5px solid var(--blue-mid)', borderRadius: 3, background: 'var(--blue-bg)', cursor: 'pointer', color: 'var(--blue-text)', whiteSpace: 'nowrap', marginLeft: 8 }}
                    >Copy across</button>
                  </div>
                ))}
              </div>
            )}

            <DetailRows onEdit={handleSave} rows={[
              { label: 'Total', value: total ? fmtCurrency(total, currency) : '—', field: 'Total_Amount', type: 'number', raw: total || '' },
              ...(balanceDue != null && balanceDue !== '' ? [{ label: 'Balance due', value: fmtCurrency(parseFloat(balanceDue) || 0, currency) }] : []),
            ]} />

            {/* Payment slots */}
            {[
              { prefix: 'Deposit', amountField: 'Deposit_Amount', dueField: 'Deposit_Due_Date', paidDateField: 'Deposit_Paid_Date', paidAmountField: 'Deposit_Paid_Amount', label: 'Deposit' },
              { prefix: '2nd', amountField: 'Second_Payment_Amount', dueField: 'Second_Payment_Due_Date', paidDateField: 'nd_Payment_Paid_Date', paidAmountField: 'nd_Payment_Paid_Amount', label: '2nd payment' },
              { prefix: '3rd', amountField: 'Third_Payment_Amount', dueField: 'Third_Payment_Due_Date', paidDateField: 'rd_Payment_Paid_Date', paidAmountField: 'rd_Payment_Paid_Amount', label: '3rd payment' },
              { prefix: '4th', amountField: 'Fourth_Payment_Amount', dueField: 'Fourth_Payment_Due_Date', paidDateField: 'th_Payment_Paid_Date', paidAmountField: 'th_Payment_Paid_Amount', label: '4th payment' },
            ].map(slot => {
              const amt = parseFloat(booking[slot.amountField]) || 0
              const due = booking[slot.dueField] || ''
              const paidDate = booking[slot.paidDateField] || ''
              const paidAmt = booking[slot.paidAmountField]
              return (
                <div key={slot.prefix} style={{ marginTop: 12, paddingTop: 10, borderTop: '0.5px solid var(--border-light)' }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 6 }}>{slot.label}</div>
                  <DetailRows onEdit={handleSave} rows={[
                    { label: 'Amount', value: amt ? fmtCurrency(amt, currency) : '—', field: slot.amountField, type: 'number', raw: amt || '' },
                    { label: 'Due', value: due ? fmtDateFull(due) : '—', field: slot.dueField, type: 'date', raw: due },
                    { label: 'Paid', value: paidDate ? fmtDateFull(paidDate) : '—', field: slot.paidDateField, type: 'date', raw: paidDate },
                    { label: 'Paid amount', value: paidAmt ? fmtCurrency(parseFloat(paidAmt), currency) : '—', field: slot.paidAmountField, type: 'number', raw: paidAmt || '' },
                  ]} />
                </div>
              )
            })}

            {/* Cancellation */}
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '0.5px solid var(--border-light)' }}>
              <DetailRows onEdit={handleSave} rows={[
                { label: 'Free cancel before', value: cancelBefore ? fmtDateFull(cancelBefore) : '—', field: 'Cancel_Free_Before', type: 'date', raw: cancelBefore },
                { label: 'Cancel policy', value: cancelPolicy || '—', field: 'Cancellation_Policy_Text', type: 'multiline', raw: cancelPolicy },
              ]} />
            </div>

            {/* Payment note */}
            {booking.Payment_Note && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid var(--border-light)' }}>
                <DetailRows onEdit={handleSave} rows={[
                  { label: 'Payment note', value: booking.Payment_Note || '—', field: 'Payment_Note', type: 'multiline', raw: booking.Payment_Note || '' },
                ]} />
              </div>
            )}
          </div>{/* end left col */}

          {/* Right col — proforma pricing from invoice/email */}
          {(() => {
            const sgl = parseFloat(booking.Single_Room_Price) || 0
            const twin = parseFloat(booking.Shared_Twin_Room_Price) || 0
            const dbl = parseFloat(booking.Shared_Double_Room_Price) || 0
            const guide = parseFloat(booking.Guide_Room_Price) || 0
            const hasRoomPrices = sgl || twin || dbl || guide
            const nights = parseInt(booking.Nights) || 1
            const paxSgl = tour ? (tour.pax_single || 0) : 0
            const paxTwin = tour ? (tour.pax_twin || 0) : 0
            const paxDbl = tour ? (tour.pax_double || 0) : 0
            const guideRooms = tour ? (tour.guide_rooms || 0) : 0
            const calcTotal = hasRoomPrices
              ? (paxSgl * sgl + Math.ceil(paxTwin / 2) * twin + Math.ceil(paxDbl / 2) * dbl + guideRooms * guide) * nights
              : 0
            const depAmt = parseFloat(booking.Deposit_Amount) || 0
            const depDue = booking.Deposit_Due_Date || ''
            const cancelBefore2 = booking.Cancel_Free_Before || ''
            const invoiceTotal = parseFloat(booking.Total_Amount) || 0
            const hasAnyData = hasRoomPrices || invoiceTotal || depAmt || depDue || cancelBefore2
            if (!hasAnyData) return null
            const rowStyle = { display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '4px 0', borderBottom: '0.5px solid var(--border-light)' }
            const labelStyle = { color: 'var(--text-muted)' }
            const valStyle = { fontWeight: 500, textAlign: 'right' }
            return (
              <div style={{ minWidth: 210, maxWidth: 250, borderLeft: '0.5px solid var(--border-light)', paddingLeft: 16, marginLeft: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>From invoice</div>

                {/* Totals */}
                {invoiceTotal > 0 && (
                  <div style={rowStyle}>
                    <span style={labelStyle}>Total</span>
                    <span style={{ ...valStyle, fontWeight: 600 }}>{fmtCurrency(invoiceTotal, currency)}</span>
                  </div>
                )}
                {depAmt > 0 && (
                  <div style={rowStyle}>
                    <span style={labelStyle}>Deposit</span>
                    <span style={valStyle}>{fmtCurrency(depAmt, currency)}</span>
                  </div>
                )}
                {depDue && (
                  <div style={rowStyle}>
                    <span style={labelStyle}>Deposit due</span>
                    <span style={valStyle}>{fmtDateFull(depDue)}</span>
                  </div>
                )}
                {cancelBefore2 && (
                  <div style={rowStyle}>
                    <span style={labelStyle}>Free cancel before</span>
                    <span style={valStyle}>{fmtDateFull(cancelBefore2)}</span>
                  </div>
                )}

                {/* Room rates */}
                {hasRoomPrices && (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 10, marginBottom: 4 }}>Room rates / night</div>
                    {[['Single', sgl, paxSgl], ['Twin (shared)', twin, Math.ceil(paxTwin/2)], ['Double (shared)', dbl, Math.ceil(paxDbl/2)], ['Guide room', guide, guideRooms]].map(([label, price, qty]) =>
                      price > 0 ? (
                        <div key={label} style={rowStyle}>
                          <span style={labelStyle}>{label}{qty > 0 ? <span style={{ fontSize: 10 }}> ×{qty}</span> : ''}</span>
                          <span style={valStyle}>{fmtCurrency(price, currency)}</span>
                        </div>
                      ) : null
                    )}
                    {calcTotal > 0 && !invoiceTotal && (
                      <div style={{ ...rowStyle, borderBottom: 'none' }}>
                        <span style={labelStyle}>Est. total ({nights}N)</span>
                        <span style={{ ...valStyle, fontWeight: 600 }}>{fmtCurrency(calcTotal, currency)}</span>
                      </div>
                    )}
                  </>
                )}

                {/* Editable rate inputs */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 10, paddingTop: 8, borderTop: '0.5px solid var(--border-light)' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Edit rates</div>
                  {[['Single_Room_Price','Single'], ['Shared_Twin_Room_Price','Twin'], ['Shared_Double_Room_Price','Double'], ['Guide_Room_Price','Guide']].map(([field, label]) =>
                    <div key={field} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 52 }}>{label}</span>
                      <input
                        type="number"
                        defaultValue={parseFloat(booking[field]) || ''}
                        placeholder="—"
                        onBlur={e => { const v = parseFloat(e.target.value); handleSave(field, isNaN(v) ? null : v) }}
                        style={{ width: 80, fontSize: 11, padding: '2px 5px', border: '0.5px solid var(--border-default)', borderRadius: 3, background: 'var(--bg-primary)' }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )
          })()}
          </div>{/* end panel-body grid */}
        </div>

        {/* Pax info panel */}
        <div>
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-head">Pax info</div>
            <div className="panel-body">
              {tour && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 6 }}>Tour pax</div>
                  <DetailRows rows={[
                    { label: 'Single rooms', value: tour.pax_single || 0 },
                    { label: 'Shared twin', value: tour.pax_twin || 0 },
                    { label: 'Shared double', value: tour.pax_double || 0 },
                    { label: 'Guide rooms', value: tour.guide_rooms || 0 },
                  ]} />
                </>
              )}
              <div style={{ marginTop: tour ? 14 : 0, paddingTop: tour ? 12 : 0, borderTop: tour ? '0.5px solid var(--border-light)' : 'none' }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 6 }}>Booked at lodge</div>
                <DetailRows onEdit={handleSave} rows={[
                  { label: 'Room config', value: booking.Sgl_Twin_Dbl_Guides || '—', field: 'Sgl_Twin_Dbl_Guides', raw: booking.Sgl_Twin_Dbl_Guides || '' },
                  { label: 'Total pax', value: booking.Total_Pax_excl_guides ?? '—' },
                  { label: 'Guide rooms', value: booking.Number_of_guides ?? '—' },
                ]} />
              </div>
            </div>
          </div>

          {/* Excursion card */}
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-head">Excursion</div>
            <div className="panel-body">
              <DetailRows onEdit={handleSave} rows={[
                { label: 'Excursion', value: booking.Excursion || '—', field: 'Excursion', raw: booking.Excursion || '' },
                { label: 'Status', value: booking.Excursion_booking_status || '—', field: 'Excursion_booking_status', raw: booking.Excursion_booking_status || '' },
                { label: 'Date', value: booking.Excursion_Date ? fmtDateFull(booking.Excursion_Date) : '—', field: 'Excursion_Date', type: 'date', raw: booking.Excursion_Date || '' },
                { label: 'Notes', value: booking.Excursion_notes || '—', field: 'Excursion_notes', type: 'multiline', raw: booking.Excursion_notes || '' },
              ]} />
            </div>
          </div>

          {/* Booking notes card */}
          <div className="panel">
            <div className="panel-head">Notes</div>
            <div className="panel-body">
              <DetailRows onEdit={handleSave} rows={[
                { label: 'Booking notes', value: booking.Booking_Notes || '—', field: 'Booking_Notes', type: 'multiline', raw: booking.Booking_Notes || '' },
                { label: 'Reservation', value: booking.Reservation_Comments || '—', field: 'Reservation_Comments', type: 'multiline', raw: booking.Reservation_Comments || '' },
              ]} />
            </div>
          </div>
        </div>
      </div>
      </>)}

      {activeDetailTab === 'correspondence' && (<>
      {/* Email thread */}
      <div className="panel">
        <div className="panel-head">
          <span>Email thread</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
              {loadingEmails ? 'Loading...' : emails.length + ' email' + (emails.length !== 1 ? 's' : '')}
            </span>
            {onMarkBookingDone && (
              <button
                className="btn btn-sm"
                onClick={() => {
                  // Mark all inbound emails in this thread as read
                  const unreadIds = emails
                    .filter(em => em.direction !== 'outbound' && em.id && readState && !readState[em.id])
                    .map(em => em.id)
                  unreadIds.forEach(id => { if (onMarkRead) onMarkRead(id) })
                  onMarkBookingDone(bookingId)
                }}
                style={{ fontSize: 11, padding: '3px 10px', background: 'var(--green-bg)', color: 'var(--green-text)', border: '0.5px solid var(--green-border)' }}
                title="Mark all emails in this thread as read"
              >✓ Mark done</button>
            )}
            <button
              className="btn btn-sm"
              disabled={polling || searchingGmail}
              onClick={async () => {
                setPolling(true)
                try {
                  // 1. Poll Gmail scoped to this booking's label — fast, targeted.
                  // refetch=true bypasses dedup so emails stored with empty body get re-fetched.
                  try {
                    const gmailLabel = ((tour ? tour.name : '') + '/' + lodgeName)
                      .replace(/[/\s]+/g, '-').toLowerCase()
                    await fetch('/api/poll-gmail?refetch=true&label=' + encodeURIComponent(gmailLabel) + '&booking_id=' + encodeURIComponent(bookingId), { method: 'POST' })
                  } catch(e) { console.error('poll-gmail refetch failed:', e) }
                  // 2. Re-parse attachments and fix empty bodies
                  await fetch('/api/reparse-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ booking_id: bookingId }),
                  })
                  fetchEmails()
                  if (onRefresh) onRefresh()
                } catch (err) { console.error('Refresh error:', err) }
                finally { setPolling(false) }
              }}
              style={{ fontSize: 11, padding: '3px 10px' }}
            >{(polling || searchingGmail) ? 'Refreshing...' : '↻ Refresh'}</button>
          </div>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {loadingEmails ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '14px' }}>Loading emails...</div>
          ) : emails.length === 0 && gmailResults.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '14px' }}>No emails recorded for this booking yet.</div>
          ) : (
            <div>
              {emails.map((em, i) => <EmailRow key={em.id || i} email={em} bookingId={bookingId} onDelete={fetchEmails} readState={readState} onMarkRead={onMarkRead} tours={tours} onReassigned={() => { fetchEmails(); if (onRefresh) onRefresh() }} autoExpand={focusEmailId && em.id === focusEmailId} />)}
            </div>
          )}

          {/* Gmail search results */}
          {gmailResults.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border-default)' }}>
              <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>Gmail results ({gmailResults.length})</span>
                <button
                  onClick={async () => {
                    for (const gm of gmailResults) {
                      const isFromUs = (gm.from || '').indexOf('ridedownsouth.com') > -1
                      const rawBody = gm.body || ''
                      const body = looksLikeRawHtml(rawBody) ? cleanEmailBody(rawBody) : rawBody
                      try {
                        await fetch('/api/import-email', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            message_id: gm.gmail_id,
                            booking_id: bookingId,
                            type: isFromUs ? 'outbound' : 'lodge_reply',
                            direction: isFromUs ? 'outbound' : 'inbound',
                            email_from: gm.from || '',
                            email_to: gm.to || '',
                            email_subject: gm.subject || '',
                            email_content: body,
                            email_date: gm.date || '',
                            attachments: gm.attachments || [],
                            import_source: 'gmail_search',
                          }),
                        })
                      } catch (err) { console.error('Import failed for', gm.gmail_id, err) }
                    }
                    setGmailResults([])
                    fetchEmails()
                    if (onRefresh) onRefresh()
                  }}
                  style={{ fontSize: 11, padding: '2px 8px', border: '0.5px solid var(--blue-mid)', borderRadius: 3, background: 'var(--blue-bg)', cursor: 'pointer', color: 'var(--blue-text)' }}
                >Import all</button>
                <button
                  onClick={() => setGmailResults([])}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11 }}
                >Clear</button>
              </div>
              {lastDismissed && (
                <div style={{ padding: '6px 14px', fontSize: 12, background: '#FFF8E1', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Dismissed: {lastDismissed.subject || 'email'}</span>
                  <button
                    onClick={() => { setGmailResults(prev => [...prev, lastDismissed]); setLastDismissed(null) }}
                    className="btn btn-sm"
                    style={{ fontSize: 11, padding: '2px 8px' }}
                  >Undo</button>
                </div>
              )}
              {gmailResults.map((gm) => (
                <GmailResultRow
                  key={gm.gmail_id}
                  email={gm}
                  bookingId={bookingId}
                  onImported={() => { fetchEmails(); setGmailResults(prev => prev.filter(g => g.gmail_id !== gm.gmail_id)) }}
                  onDismiss={() => { setLastDismissed(gm); setGmailResults(prev => prev.filter(g => g.gmail_id !== gm.gmail_id)) }}
                />
              ))}
            </div>
          )}


          <ReplyComposer
            bookingId={bookingId}
            lodgeEmail={lodgeEmail}
            lodgeName={lodgeName}
            rdsRef={rdsRef}
            lodgeRef={lodgeRef}
            tourName={tour ? tour.name : ''}
            contactName={lodgeContact}
            checkInDate={checkIn ? fmtDateFull(checkIn) : ''}
            lastSubject={emails.length > 0 ? (emails[0].subject || emails[0].email_subject || '') : ''}
            lastInboundMessageId={(() => {
              var inbound = emails.find(e => e.direction === 'inbound' && e.rfc_message_id)
              return inbound ? inbound.rfc_message_id : null
            })()}
            onSent={() => { setTimeout(() => { fetchEmails(); if (onRefresh) onRefresh() }, 1000) }}
          />
        </div>
      </div>
      </>)}
    </div>
  )
}

function DetailRows({ rows, onEdit }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '6px 12px' }}>
      {rows.map((r, i) => (
        <React.Fragment key={i}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.label}</div>
          {r.field && onEdit ? (
            <EditableCell value={r.raw !== undefined ? r.raw : ''} display={r.value} field={r.field} type={r.type || 'text'} onEdit={onEdit} />
          ) : (
            <div style={{ fontSize: 13 }}>{r.value}</div>
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

function EditableCell({ value, display, field, type, onEdit }) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(value != null ? String(value) : '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (editValue === String(value || '')) { setEditing(false); return }
    setSaving(true)
    try {
      var saveVal = editValue
      if (type === 'number') saveVal = parseFloat(editValue) || 0
      await onEdit(field, saveVal)
      setEditing(false)
    } catch (err) { alert('Error: ' + err.message) }
    finally { setSaving(false) }
  }

  if (editing) {
    const isMultiline = type === 'multiline'
    return (
      <div style={{ display: 'flex', gap: 4, alignItems: isMultiline ? 'flex-start' : 'center' }}>
        {isMultiline ? (
          <textarea
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') setEditing(false) }}
            autoFocus
            disabled={saving}
            rows={3}
            style={{
              fontSize: 13, padding: '4px 6px', width: '100%',
              border: '0.5px solid var(--blue-mid)', borderRadius: 4,
              outline: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)',
              fontFamily: 'var(--font-sans)', resize: 'vertical',
            }}
          />
        ) : (
          <input
            type={type === 'date' ? 'date' : type === 'number' ? 'number' : 'text'}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false) }}
            onBlur={() => setTimeout(handleSave, 150)}
            autoFocus
            disabled={saving}
            style={{
              fontSize: 13, padding: '2px 6px', width: '100%',
              border: '0.5px solid var(--blue-mid)', borderRadius: 4,
              outline: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)',
            }}
          />
        )}
        {isMultiline && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <button onClick={handleSave} disabled={saving} className="btn btn-sm" style={{ fontSize: 10, padding: '2px 6px' }}>
              {saving ? '...' : 'Save'}
            </button>
            <button onClick={() => setEditing(false)} style={{ fontSize: 10, padding: '2px 6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
              Cancel
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      onClick={() => { setEditValue(value != null ? String(value) : ''); setEditing(true) }}
      style={{ fontSize: 13, cursor: 'pointer', borderBottom: '1px dashed var(--border-default)', display: 'inline', paddingBottom: 1 }}
      title="Click to edit"
    >
      {display || '—'}
    </div>
  )
}

function EmailRow({ email, bookingId, onDelete, readState, onMarkRead, tours, onReassigned, autoExpand }) {
  const [expanded, setExpanded] = useState(!!autoExpand)
  const [showAttText, setShowAttText] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [reassigning, setReassigning] = useState(false)
  const [reassignError, setReassignError] = useState(null)
  const rowRef = React.useRef(null)
  const isOutbound = email.direction === 'outbound'
  const isUnread = !isOutbound && email.id && readState && !readState[email.id]

  // Mark handled — local state persisted to localStorage
  const handledKey = email.id ? 'rds_handled_' + email.id : null
  const [handled, setHandled] = useState(() => {
    if (!handledKey) return false
    try { return !!localStorage.getItem(handledKey) } catch (e) { return false }
  })
  const markHandled = (e) => {
    e.stopPropagation()
    if (!handledKey) return
    try { localStorage.setItem(handledKey, new Date().toISOString()) } catch (e) {}
    setHandled(true)
    // Also mark read if still unread
    if (isUnread && onMarkRead && email.id) onMarkRead(email.id)
  }
  const date = email.date || email.email_date || ''
  const from = email.from || email.email_from || ''
  const subject = email.subject || email.email_subject || ''
  const rawBody = email.body || email.email_content || ''
  const isHtml = looksLikeRawHtml(rawBody)
  const body = isHtml ? cleanEmailBody(rawBody) : rawBody
  const { main: bodyMain, quoted: bodyQuoted } = isHtml ? { main: body, quoted: '' } : splitQuotedContent(body)
  const attachments = email.attachments || []
  const gmailMsgId = email.gmail_message_id || email.message_id || ''
  const hasExtracted = attachments.some(a => a && a.extractedText)
  const firstLine = bodyMain.split('\n').filter(l => l.trim())[0] || ''
  const preview = firstLine.length > 120 ? firstLine.substring(0, 120) + '...' : firstLine
  const [showQuoted, setShowQuoted] = React.useState(false)

  // When this row is the auto-expand target, scroll it into view
  // and mark read once on mount.
  useEffect(() => {
    if (autoExpand && rowRef.current) {
      // Defer slightly so the layout has settled.
      setTimeout(() => {
        rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
      if (onMarkRead && email.id && isUnread) onMarkRead(email.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoExpand])

  const handleToggle = () => {
    const next = !expanded
    setExpanded(next)
    // Mark read the first time the row is expanded
    if (next && isUnread && onMarkRead) onMarkRead(email.id)
  }

  // Reassign — moves this email to a different booking. The
  // email-route endpoint accepts emails/booking/{id}/ source paths
  // for reassignment and updates the activity log accordingly.
  // Also writes a match-correction log entry — every reassignment
  // is signal that the matcher got it wrong, useful for diagnosis
  // and eventual matcher improvements.
  const handleReassign = async (newBookingId) => {
    setReassignError(null)
    const safeId = email.id
    if (!safeId) {
      setReassignError('Cannot reassign — email has no id')
      return
    }
    const sourcePath = 'emails/booking/' + bookingId + '/' + safeId + '.json'
    try {
      const res = await fetch('/api/email-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_path: sourcePath, booking_id: newBookingId }),
      })
      const result = await res.json()
      if (!result.success) throw new Error(result.error || 'Reassign failed')

      // Log the correction. Fire-and-forget — failing to log must
      // not block the reassign.
      try {
        // Find the new booking in the tours array so we can
        // denormalise its lodge name + check-in date for the log.
        let newLodge = '', newCheckIn = ''
        if (tours) {
          for (const t of tours) {
            const found = (t.bookings || []).find(b => b.id === newBookingId)
            if (found) {
              newLodge = (typeof found.Lodge_Name === 'object' ? found.Lodge_Name?.name : found.Lodge_Name) || found.Name || ''
              newCheckIn = found.Check_in_Date || ''
              break
            }
          }
        }
        const matchedAtStr = email.created_at || email._uploaded_at || email.email_date || email.date
        const timeSinceMatchMs = matchedAtStr ? (Date.now() - new Date(matchedAtStr).getTime()) : null
        fetch('/api/match-correction-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email_id: safeId,
            gmail_message_id: email.gmail_message_id || email.message_id || null,
            subject: email.subject || email.email_subject || '',
            from: email.from || email.email_from || '',
            email_date: email.date || email.email_date || null,
            original_booking_id: bookingId,
            original_match_method: email.match_method || null,
            new_booking_id: newBookingId,
            new_booking_lodge: newLodge,
            new_booking_check_in: newCheckIn,
            surface: 'lodge_detail',
            time_since_match_ms: timeSinceMatchMs,
            author: 'Helen',
          }),
        }).catch(() => {})
      } catch (_) { /* swallow */ }

      setReassigning(false)
      if (onReassigned) onReassigned()
    } catch (err) {
      setReassignError(err.message)
    }
  }

  // Extract flags from ai_flags array
  const flags = Array.isArray(email.ai_flags) ? email.ai_flags : []
  const swapFlag = flags.find(f => f && f.lodge_swap)
  const fanOutFlag = flags.find(f => f && f.fanned_out_from)
  const matchMethod = email.match_method || email._match_method || null

  const downloadUrl = (att) => {
    if (!att.attachmentId || !gmailMsgId) return null
    return '/api/gmail-attachment?messageId=' + encodeURIComponent(gmailMsgId) +
      '&attachmentId=' + encodeURIComponent(att.attachmentId) +
      '&filename=' + encodeURIComponent(att.filename || 'attachment') +
      '&mimeType=' + encodeURIComponent(att.mimeType || 'application/octet-stream')
  }

  const fmtSize = (bytes) => {
    if (!bytes) return ''
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <div
      ref={rowRef}
      style={{
        borderBottom: '0.5px solid var(--border-light)',
        boxShadow: autoExpand ? '0 0 0 2px var(--blue-mid, #4A90E2) inset' : 'none',
      }}
    >
      <div
        onClick={handleToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
          cursor: 'pointer', fontSize: 12,
          background: expanded ? 'var(--bg-secondary)' : (isUnread ? 'var(--bg-primary)' : 'transparent'),
        }}
      >
        <span style={{ fontSize: 9, color: 'var(--text-muted)', width: 12, flexShrink: 0 }}>
          {expanded ? '▾' : '▸'}
        </span>
        {isUnread ? (
          <span
            style={{ width: 6, height: 6, borderRadius: '50%', background: '#C62828', flexShrink: 0 }}
            title="Unread"
          />
        ) : (
          <span style={{ width: 6, flexShrink: 0 }} />
        )}
        <span style={{ fontWeight: 600, fontSize: 11, width: 52, flexShrink: 0, color: isOutbound ? 'var(--blue-text)' : 'var(--green-text)' }}>
          {isOutbound ? 'Sent' : 'Received'}
        </span>
        <span style={{ color: 'var(--text-secondary)', width: 180, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {isOutbound ? 'to lodge' : from.split('<')[0].trim() || from}
        </span>
        <span style={{
          color: isUnread ? 'var(--text-primary)' : 'var(--text-secondary)',
          fontWeight: isUnread ? 600 : 400,
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {expanded ? subject : (subject || preview)}
        </span>
        {swapFlag && (
          <span style={{
            fontSize: 9, flexShrink: 0, padding: '1px 5px', borderRadius: 3,
            background: 'var(--amber-bg, #fef3c7)', color: 'var(--amber-text, #92400e)', fontWeight: 600,
          }} title={'Originally filed under ' + (swapFlag.original_lodge || 'another lodge')}>
            {swapFlag.original_lodge || 'lodge swap'}
          </span>
        )}
        {fanOutFlag && (
          <span style={{
            fontSize: 9, flexShrink: 0, padding: '1px 5px', borderRadius: 3,
            background: 'var(--blue-bg)', color: 'var(--blue-text)', fontWeight: 500,
          }} title="Copy of reply fanned out from a sibling booking via Message-ID match">
            fan-out
          </span>
        )}
        {attachments.length > 0 && (
          <span style={{
            color: hasExtracted ? 'var(--green-text)' : 'var(--text-muted)',
            fontSize: 11, flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 3,
          }}>
            📎 {attachments.length}
          </span>
        )}
        <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0, width: 70, textAlign: 'right' }}>
          {date ? fmtDate(date) : ''}
        </span>
        {!isOutbound && email.id && (
          handled ? (
            <span style={{
              fontSize: 10, padding: '2px 6px', borderRadius: 3, flexShrink: 0,
              color: 'var(--green-text)', whiteSpace: 'nowrap',
            }} title="Marked as handled">✓ Handled</span>
          ) : (
            <button
              onClick={markHandled}
              style={{
                fontSize: 10, padding: '2px 6px', border: '0.5px solid var(--green-border, #86EFAC)',
                borderRadius: 3, background: 'var(--green-bg)', cursor: 'pointer',
                color: 'var(--green-text)', flexShrink: 0, whiteSpace: 'nowrap',
              }}
              title="Mark as handled — we've responded to this"
            >Mark handled</button>
          )
        )}
        {!isOutbound && tours && email.id && (
          <button
            onClick={(e) => { e.stopPropagation(); setReassignError(null); setReassigning(true) }}
            style={{
              fontSize: 10, padding: '2px 6px', border: '0.5px solid var(--border-default)',
              borderRadius: 3, background: 'var(--bg-primary)', cursor: 'pointer',
              color: 'var(--text-primary)', flexShrink: 0, whiteSpace: 'nowrap',
            }}
            title="Move this email to a different booking"
          >Reroute</button>
        )}
      </div>
      {expanded && (
        <div style={{ padding: '8px 14px 14px 88px' }}>
          {subject && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Subject: {subject}</div>}
          {(matchMethod || swapFlag || fanOutFlag) && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 6, fontSize: 10, color: 'var(--text-muted)' }}>
              {matchMethod && <span>Match: {matchMethod}</span>}
              {swapFlag && <span style={{ color: 'var(--amber-text, #92400e)' }}>Lodge swap from: {swapFlag.original_lodge || '?'}</span>}
              {fanOutFlag && <span style={{ color: 'var(--blue-text)' }}>Fanned out from booking {fanOutFlag.fanned_out_from}</span>}
            </div>
          )}
          <div style={{
            fontSize: 12, lineHeight: 1.7, color: 'var(--text-primary)',
            background: 'var(--bg-primary)',
            borderRadius: 'var(--radius-md)', border: '0.5px solid var(--border-light)',
            overflow: 'hidden',
          }}>
            {body
              ? isHtml
                ? <iframe
                    srcDoc={rawBody}
                    sandbox="allow-same-origin"
                    style={{ width: '100%', border: 'none', display: 'block', minHeight: 200, maxHeight: 500 }}
                    onLoad={e => {
                      try {
                        const h = e.target.contentDocument?.documentElement?.scrollHeight
                        if (h) e.target.style.height = Math.min(h + 16, 500) + 'px'
                      } catch {}
                    }}
                  />
                : <div style={{ padding: '12px 14px' }}>
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: 'var(--text-primary)', fontSize: 12 }}>{bodyMain || body}</div>
                    {bodyQuoted && (
                      <div style={{ marginTop: 8 }}>
                        <button
                          onClick={() => setShowQuoted(v => !v)}
                          style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: '0.5px solid var(--border-light)', borderRadius: 3, padding: '2px 8px', cursor: 'pointer' }}
                        >{showQuoted ? 'Hide quoted' : 'Show quoted'}</button>
                        {showQuoted && (
                          <div style={{ marginTop: 8, paddingLeft: 12, borderLeft: '2px solid var(--border-default)', whiteSpace: 'pre-wrap', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                            {bodyQuoted}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
              : <div style={{ padding: '12px 14px', color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 13 }}>
                  No content stored — this may be a stale entry from an older index run.
                  Try <strong>Re-parse</strong> above to re-fetch from Gmail, or delete if the email no longer exists.
                </div>
            }
          </div>
          {attachments.length > 0 && (
            <div style={{
              marginTop: 8, padding: '8px 10px',
              background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)',
              border: '0.5px solid var(--border-light)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Attachments ({attachments.length})
              </div>
              {attachments.map((att, idx) => {
                const url = downloadUrl(att)
                const hasText = att && att.extractedText
                return (
                  <div key={idx} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
                    fontSize: 11, color: 'var(--text-primary)',
                    borderTop: idx > 0 ? '0.5px solid var(--border-light)' : 'none',
                  }}>
                    <span style={{ fontSize: 13, flexShrink: 0 }}>
                      {(att.mimeType || '').includes('pdf') ? '📄' :
                       (att.mimeType || '').includes('sheet') || (att.mimeType || '').includes('excel') ? '📊' :
                       (att.mimeType || '').includes('image') ? '🖼' : '📎'}
                    </span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {att.filename || 'attachment'}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 10, flexShrink: 0 }}>
                      {fmtSize(att.size)}
                    </span>
                    {hasText && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowAttText(showAttText === idx ? null : idx) }}
                        style={{
                          background: 'var(--green-bg)', color: 'var(--green-text)',
                          border: 'none', borderRadius: 3, padding: '2px 6px',
                          fontSize: 10, cursor: 'pointer', flexShrink: 0,
                        }}
                      >
                        {showAttText === idx ? 'Hide text' : 'View text'}
                      </button>
                    )}
                    {url && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          background: 'var(--blue-bg)', color: 'var(--blue-text)',
                          border: 'none', borderRadius: 3, padding: '2px 6px',
                          fontSize: 10, cursor: 'pointer', textDecoration: 'none', flexShrink: 0,
                        }}
                      >
                        Download
                      </a>
                    )}
                    {!url && !hasText && (
                      <span style={{ color: 'var(--text-hint)', fontSize: 10 }}>no download</span>
                    )}
                  </div>
                )
              })}
              {showAttText !== null && attachments[showAttText] && attachments[showAttText].extractedText && (
                <div style={{
                  marginTop: 8, padding: '10px 12px',
                  background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)',
                  border: '0.5px solid var(--border-light)',
                  fontSize: 11, lineHeight: 1.6, color: 'var(--text-secondary)',
                  whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto',
                }}>
                  <div style={{ fontWeight: 500, marginBottom: 4, color: 'var(--text-primary)' }}>
                    Extracted text: {attachments[showAttText].filename}
                  </div>
                  {attachments[showAttText].extractedText}
                </div>
              )}
            </div>
          )}
          {email.ai_summary && (
            <div style={{ marginTop: 6, padding: '6px 10px', background: 'var(--blue-bg)', borderRadius: 'var(--radius-sm)', fontSize: 11, color: 'var(--blue-text)' }}>
              AI: {email.ai_summary}
            </div>
          )}
          {reassignError && (
            <div style={{ marginTop: 8, padding: '6px 10px', background: 'var(--red-bg, #FEE)', color: 'var(--red-text)', fontSize: 11, borderRadius: 4 }}>
              {reassignError}
            </div>
          )}
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
            {!isOutbound && tours && email.id && (
              <button
                onClick={(e) => { e.stopPropagation(); setReassignError(null); setReassigning(true) }}
                style={{
                  fontSize: 10, padding: '2px 8px', border: '0.5px solid var(--border-default)',
                  borderRadius: 3, background: 'var(--bg-primary)', cursor: 'pointer',
                  color: 'var(--text-secondary)',
                }}
                title="Move this email to a different booking"
              >Reassign to another booking</button>
            )}
            <button
              onClick={async (e) => {
                e.stopPropagation()
                if (!confirm('Delete this email from this booking?')) return
                setDeleting(true)
                try {
                  await fetch('/api/delete-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ booking_id: bookingId, message_id: email.message_id || email.id }),
                  })
                  if (onDelete) onDelete()
                } catch (err) { console.error(err) }
                finally { setDeleting(false) }
              }}
              disabled={deleting}
              style={{
                fontSize: 10, padding: '2px 8px', border: '0.5px solid var(--border-default)',
                borderRadius: 3, background: 'var(--bg-primary)', cursor: 'pointer',
                color: 'var(--red-text)',
              }}
            >{deleting ? 'Deleting...' : 'Delete email'}</button>
          </div>
        </div>
      )}
      {reassigning && (
        <RoutingPicker
          email={email}
          tours={tours}
          currentBookingId={bookingId}
          onCancel={() => setReassigning(false)}
          onRoute={(newBookingId) => handleReassign(newBookingId)}
        />
      )}
    </div>
  )
}

function GmailResultRow({ email, bookingId, onImported, onDismiss }) {
  const [expanded, setExpanded] = useState(false)
  const [importing, setImporting] = useState(false)
  const from = email.from || ''
  const subject = email.subject || ''
  const rawBody = email.body || ''
  const isHtml = looksLikeRawHtml(rawBody)
  const body = isHtml ? cleanEmailBody(rawBody) : rawBody
  const { main: bodyMain, quoted: bodyQuoted } = isHtml ? { main: body, quoted: '' } : splitQuotedContent(body)
  const [showQuoted, setShowQuoted] = React.useState(false)
  const date = email.date || ''
  const isFromUs = from.indexOf('bookings@ridedownsouth.com') > -1 || from.indexOf('ridedownsouth.com') > -1

  const handleImport = async (e) => {
    e.stopPropagation()
    setImporting(true)
    try {
      const res = await fetch('/api/import-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_id: email.gmail_id,
          booking_id: bookingId,
          type: isFromUs ? 'outbound' : 'lodge_reply',
          direction: isFromUs ? 'outbound' : 'inbound',
          email_from: from,
          email_to: email.to || '',
          email_subject: subject,
          email_content: body,
          email_date: date,
          attachments: email.attachments || [],
          import_source: 'gmail_search',
        }),
      })
      if (res.ok) onImported()
    } catch (err) { console.error('Import error:', err) }
    finally { setImporting(false) }
  }

  const firstLine = body.split('\n').filter(l => l.trim())[0] || ''
  const preview = firstLine.length > 100 ? firstLine.substring(0, 100) + '...' : firstLine

  return (
    <div style={{ borderBottom: '0.5px solid var(--border-light)' }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', cursor: 'pointer', fontSize: 12 }}
      >
        <span style={{ fontWeight: 500, fontSize: 11, width: 52, flexShrink: 0, color: isFromUs ? 'var(--blue-text)' : 'var(--green-text)' }}>
          {isFromUs ? 'Sent' : 'Received'}
        </span>
        <span style={{ color: 'var(--text-muted)', width: 160, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {isFromUs ? 'to lodge' : from.split('<')[0].trim() || from}
        </span>
        <span style={{ color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {expanded ? subject : (subject || preview)}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0, width: 70, textAlign: 'right' }}>
          {date ? fmtDate(date) : ''}
        </span>
        <button
          onClick={handleImport}
          disabled={importing}
          className="btn btn-sm"
          style={{ fontSize: 10, padding: '2px 6px', flexShrink: 0, background: '#E3F2FD', color: '#1565C0', border: '1px solid #90CAF9' }}
        >
          {importing ? '...' : 'Link'}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss() }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-hint)', fontSize: 14, flexShrink: 0, padding: '0 4px' }}
          title="Dismiss"
        >×</button>
      </div>
      {expanded && (
        <div style={{ padding: '0 14px 12px 76px' }}>
          {subject && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{subject}</div>}
          <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)', border: '0.5px solid var(--border-light)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            {isHtml
              ? <iframe
                  srcDoc={rawBody}
                  sandbox="allow-same-origin"
                  style={{ width: '100%', border: 'none', display: 'block', minHeight: 150, maxHeight: 400 }}
                  onLoad={e => {
                    try {
                      const h = e.target.contentDocument?.documentElement?.scrollHeight
                      if (h) e.target.style.height = Math.min(h + 16, 400) + 'px'
                    } catch {}
                  }}
                />
              : <div style={{ whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto', padding: '8px 10px' }}>{body}</div>
            }
          </div>
        </div>
      )}
    </div>
  )
}

function ReplyComposer({ bookingId, lodgeEmail, lodgeName, rdsRef, lodgeRef, tourName, contactName, checkInDate, lastSubject, lastInboundMessageId, onSent }) {
  const [open, setOpen] = useState(false)
  const [sent, setSent] = useState(false)

  // Build the default subject. If the lodge has provided their own
  // booking reference, append it (unless it's already in lastSubject)
  // so Helen sees both refs in one glance and threading stays clean.
  const buildDefaultSubject = () => {
    let base = lastSubject && lastSubject.startsWith('Re:')
      ? lastSubject
      : 'Re: ' + (lastSubject || 'Booking enquiry - ' + tourName + (rdsRef ? ' [' + rdsRef + ']' : ''))
    if (lodgeRef && !base.includes(lodgeRef)) {
      base += ' / Lodge ref: ' + lodgeRef
    }
    return base
  }
  const defaultSubject = buildDefaultSubject()
  const [sender, setSender] = useState('Helen')

  const buildSig = (s) => {
    const p = SENDER_PROFILES[s] || SENDER_PROFILES.Helen
    return '\n\nKind regards,\n' + p.name + '\n' + p.role + ' | Ride Down South\nbookings@ridedownsouth.com\nwww.ridedownsouth.com'
  }

  const [toAddr, setToAddr] = useState(lodgeEmail || '')
  const [subject, setSubject] = useState(defaultSubject)
  const [body, setBody] = useState(buildSig('Helen'))
  const [sending, setSending] = useState(false)

  // Keep signature in sync with sender toggle
  React.useEffect(() => {
    setBody(prev => {
      const sigIdx = prev.lastIndexOf('Kind regards,')
      const beforeSig = sigIdx > 0 ? prev.slice(0, sigIdx) : prev + '\n\n'
      return beforeSig + 'Kind regards,' + buildSig(sender).replace('\n\nKind regards,', '')
    })
  }, [sender])

  // Strip signature from generated template to avoid duplicates, then prepend.
  const handleTemplateInsert = (generated) => {
    const sigIdx = generated.lastIndexOf('Kind regards,')
    const bodyOnly = sigIdx > 0 ? generated.slice(0, sigIdx).trimEnd() : generated.trimEnd()
    setBody(prev => {
      const existingSigIdx = prev.lastIndexOf('Kind regards,')
      const existingSig = existingSigIdx >= 0 ? prev.slice(existingSigIdx) : 'Kind regards,' + buildSig(sender).replace('\n\nKind regards,', '')
      return bodyOnly + '\n\n' + existingSig
    })
  }

  const handleSend = async () => {
    if (!body.trim() || !toAddr.trim()) return
    setSending(true)
    try {
      const res = await fetch('/api/send-enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: toAddr, subject, body: body.trim(),
          booking_ids: [bookingId], lodge_name: lodgeName, tour_name: tourName, is_reply: true,
          sender,
          in_reply_to_message_id: lastInboundMessageId || null,
        }),
      })
      const result = await res.json()
      if (result.email_sent) {
        setBody(buildSig(sender))
        setSent(true)
        setTimeout(() => { setSent(false); setOpen(false) }, 2000)
        if (onSent) onSent()
      }
      else alert('Send failed: ' + (result.email_error || 'Unknown error'))
    } catch (err) { alert('Error: ' + err.message) }
    finally { setSending(false) }
  }

  if (!open) {
    return (
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="btn btn-sm" onClick={() => setOpen(true)} style={{ fontSize: 12 }}>
          Reply to {lodgeName}
        </button>
        {sent && <span style={{ fontSize: 11, color: 'var(--green-text)' }}>✓ Sent</span>}
      </div>
    )
  }

  return (
    <div style={{ padding: '12px 14px', borderTop: '0.5px solid var(--border-default)', background: 'var(--bg-secondary)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '50px 1fr', gap: '6px 8px', marginBottom: 8 }}>
        <label style={{ fontSize: 12, color: 'var(--text-muted)', paddingTop: 4 }}>To:</label>
        <input
          type="email"
          value={toAddr}
          onChange={e => setToAddr(e.target.value)}
          style={{
            fontSize: 13, padding: '4px 8px',
            border: '0.5px solid var(--border-default)', borderRadius: 4,
            outline: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)',
          }}
        />
        <label style={{ fontSize: 12, color: 'var(--text-muted)', paddingTop: 4 }}>Subject:</label>
        <input
          type="text"
          value={subject}
          onChange={e => setSubject(e.target.value)}
          style={{
            fontSize: 13, padding: '4px 8px',
            border: '0.5px solid var(--border-default)', borderRadius: 4,
            outline: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)',
          }}
        />
      </div>
      {/* Sender toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>From:</span>
        <div style={{ display: 'flex', border: '0.5px solid var(--border-default)', borderRadius: 3, overflow: 'hidden' }}>
          {['Helen', 'Andrew', 'Mike', 'Rogan'].map(s => (
            <button key={s} onClick={() => setSender(s)} style={{
              fontSize: 10, padding: '2px 10px', border: 'none', cursor: 'pointer',
              background: sender === s ? 'var(--blue-bg)' : 'transparent',
              color: sender === s ? 'var(--blue-text)' : 'var(--text-secondary)',
              fontWeight: sender === s ? 600 : 400,
            }}>{s}</button>
          ))}
        </div>
      </div>
      <TemplatePicker
        context={{
          contactName: contactName || '',
          date: checkInDate || '',
          bookingRef: lodgeRef || rdsRef || '',
          lodgeName: lodgeName || '',
          sender,
        }}
        onInsert={handleTemplateInsert}
      />
      <textarea
        value={body} onChange={e => setBody(e.target.value)}
        placeholder="Type your reply..."
        autoFocus rows={8}
        style={{
          width: '100%', fontSize: 13, lineHeight: 1.5, padding: '8px 10px',
          border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-md)',
          outline: 'none', resize: 'vertical', fontFamily: 'var(--font-sans)',
          background: 'var(--bg-primary)', color: 'var(--text-primary)',
        }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={handleSend} disabled={sending || !body.trim() || !toAddr.trim()}>
          {sending ? 'Sending...' : 'Send reply'}
        </button>
        <button className="btn btn-sm" onClick={() => setOpen(false)} disabled={sending}>Cancel</button>
      </div>
    </div>
  )
}
