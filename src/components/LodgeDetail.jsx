import React, { useState, useEffect } from 'react'
import { fmtDate, fmtDateFull, fmtCurrency, getStatusBadge, getStatus, daysBetween } from '../utils/helpers'

export default function LodgeDetail({ booking, tour, lodges, onBack, onRefresh }) {
  const [emails, setEmails] = useState([])
  const [loadingEmails, setLoadingEmails] = useState(true)
  const [editing, setEditing] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [polling, setPolling] = useState(false)
  const [gmailResults, setGmailResults] = useState([])
  const [searchingGmail, setSearchingGmail] = useState(false)
  const [lastDismissed, setLastDismissed] = useState(null)

  const bookingId = booking.id || booking['Record Id']
  const lodgeName = (booking.Lodge_Name || booking.Name || '').split(' - ')[0]
  const status = getStatus(booking)
  const badge = getStatusBadge(status)

  // Lodge directory lookup
  const lodgeLookup = {}
  ;(lodges || []).forEach(l => { if (l.name) lodgeLookup[l.name.toLowerCase()] = l })
  const lodgeRecord = lodgeName ? lodgeLookup[lodgeName.toLowerCase()] || null : null

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

  const STATUS_OPTIONS = [
    'Not Started', 'Ready to Send', 'Enquiry Sent', 'Availability Confirmed',
    'Confirmed', 'Proforma Received', 'Deposit Paid', 'Balance Paid',
    'Not Available', 'Cancelled', 'Waitlisted', 'Credit against booking',
  ]

  return (
    <div>
      {/* Back button */}
      <button onClick={onBack} style={{
        background: 'none', border: 'none', color: 'var(--text-muted)',
        fontSize: 13, padding: '0 0 12px', cursor: 'pointer',
      }}>
        ← Back to {tour ? tour.name : 'itinerary'}
      </button>

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

      {/* Row 2: Payments + Pax */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Payment & cancellation panel */}
        <div className="panel">
          <div className="panel-head">Payments & cancellation</div>
          <div className="panel-body">
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
              // Show slot if amount or due date exists
              if (!amt && !due) return null
              return (
                <div key={slot.prefix} style={{ marginTop: 12, paddingTop: 10, borderTop: '0.5px solid var(--border-light)' }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 6 }}>{slot.label}</div>
                  <DetailRows onEdit={handleSave} rows={[
                    { label: 'Amount', value: amt ? fmtCurrency(amt, currency) : '—', field: slot.amountField, type: 'number', raw: amt || '' },
                    { label: 'Due', value: due ? fmtDateFull(due) : '—', field: slot.dueField, type: 'date', raw: due },
                    ...(paidDate ? [
                      { label: 'Paid', value: fmtDateFull(paidDate), field: slot.paidDateField, type: 'date', raw: paidDate },
                      { label: 'Paid amount', value: paidAmt ? fmtCurrency(parseFloat(paidAmt), currency) : '—', field: slot.paidAmountField, type: 'number', raw: paidAmt || '' },
                    ] : [
                      { label: 'Paid', value: '—' },
                    ]),
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
          </div>
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

      {/* Email thread */}
      <div className="panel">
        <div className="panel-head">
          <span>Email thread</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {lodgeEmail && (
              <button
                className="btn btn-sm"
                onClick={handleSearchGmail}
                disabled={searchingGmail}
                style={{ fontSize: 11, padding: '3px 10px' }}
              >
                {searchingGmail ? 'Searching...' : 'Search Gmail'}
              </button>
            )}
            <button
              className="btn btn-sm"
              onClick={handleCheckReplies}
              disabled={polling}
              style={{ fontSize: 11, padding: '3px 10px' }}
            >
              {polling ? 'Checking...' : 'Check for replies'}
            </button>
            <button
              className="btn btn-sm"
              onClick={async () => {
                setPolling(true)
                try {
                  const res = await fetch('/api/poll-gmail?refetch=true')
                  const result = await res.json()
                  if (result.stored > 0) { fetchEmails(); if (onRefresh) onRefresh() }
                  else fetchEmails()
                } catch (err) { console.error('Re-fetch error:', err) }
                finally { setPolling(false) }
              }}
              disabled={polling}
              style={{ fontSize: 11, padding: '3px 10px', color: 'var(--text-muted)' }}
              title="Re-fetch emails from Gmail (fixes missing content)"
            >Re-fetch</button>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
              {loadingEmails ? 'Loading...' : emails.length + ' email' + (emails.length !== 1 ? 's' : '')}
            </span>
          </div>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {loadingEmails ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '14px' }}>Loading emails...</div>
          ) : emails.length === 0 && gmailResults.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '14px' }}>No emails recorded for this booking yet.</div>
          ) : (
            <div>
              {emails.map((em, i) => <EmailRow key={em.id || i} email={em} />)}
            </div>
          )}

          {/* Gmail search results */}
          {gmailResults.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border-default)' }}>
              <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, background: 'var(--bg-secondary)' }}>
                Gmail results ({gmailResults.length})
                <button
                  onClick={() => setGmailResults([])}
                  style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11 }}
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
            tourName={tour ? tour.name : ''}
            lastSubject={emails.length > 0 ? (emails[0].subject || emails[0].email_subject || '') : ''}
            onSent={() => { setTimeout(() => { fetchEmails(); if (onRefresh) onRefresh() }, 1000) }}
          />
        </div>
      </div>
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

function EmailRow({ email }) {
  const [expanded, setExpanded] = useState(false)
  const isOutbound = email.direction === 'outbound'
  const date = email.date || email.email_date || ''
  const from = email.from || email.email_from || ''
  const subject = email.subject || email.email_subject || ''
  const body = email.body || email.email_content || ''
  const attachments = email.attachments || []
  const firstLine = body.split('\n').filter(l => l.trim())[0] || ''
  const preview = firstLine.length > 120 ? firstLine.substring(0, 120) + '...' : firstLine

  return (
    <div style={{ borderBottom: '0.5px solid var(--border-light)' }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
          cursor: 'pointer', fontSize: 12,
          background: expanded ? 'var(--bg-secondary)' : 'transparent',
        }}
      >
        <span style={{ fontSize: 9, color: 'var(--text-muted)', width: 12, flexShrink: 0 }}>
          {expanded ? '▾' : '▸'}
        </span>
        <span style={{ fontWeight: 500, fontSize: 11, width: 52, flexShrink: 0, color: isOutbound ? 'var(--blue-text)' : 'var(--green-text)' }}>
          {isOutbound ? 'Sent' : 'Received'}
        </span>
        <span style={{ color: 'var(--text-muted)', width: 180, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {isOutbound ? 'to lodge' : from.split('<')[0].trim() || from}
        </span>
        <span style={{ color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {expanded ? subject : (preview || subject)}
        </span>
        {attachments.length > 0 && (
          <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>
            {attachments.length} file{attachments.length > 1 ? 's' : ''}
          </span>
        )}
        <span style={{ color: 'var(--text-hint)', fontSize: 11, flexShrink: 0, width: 70, textAlign: 'right' }}>
          {date ? fmtDate(date) : ''}
        </span>
      </div>
      {expanded && (
        <div style={{ padding: '8px 14px 14px 88px' }}>
          {subject && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Subject: {subject}</div>}
          <div style={{
            fontSize: 12, lineHeight: 1.7, color: 'var(--text-primary)',
            whiteSpace: 'pre-wrap', maxHeight: 400, overflowY: 'auto',
            background: 'var(--bg-primary)', padding: '12px 14px',
            borderRadius: 'var(--radius-md)', border: '0.5px solid var(--border-light)',
          }}>
            {body || '(no content)'}
          </div>
          {attachments.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
              Attachments: {attachments.map(a => a.filename || a).join(', ')}
            </div>
          )}
          {email.ai_summary && (
            <div style={{ marginTop: 6, padding: '6px 10px', background: 'var(--blue-bg)', borderRadius: 'var(--radius-sm)', fontSize: 11, color: 'var(--blue-text)' }}>
              AI: {email.ai_summary}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function GmailResultRow({ email, bookingId, onImported, onDismiss }) {
  const [expanded, setExpanded] = useState(false)
  const [importing, setImporting] = useState(false)
  const from = email.from || ''
  const subject = email.subject || ''
  const body = email.body || ''
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
          {expanded ? subject : preview}
        </span>
        <span style={{ color: 'var(--text-hint)', fontSize: 11, flexShrink: 0, width: 70, textAlign: 'right' }}>
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
          <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto' }}>
            {body}
          </div>
        </div>
      )}
    </div>
  )
}

function ReplyComposer({ bookingId, lodgeEmail, lodgeName, rdsRef, tourName, lastSubject, onSent }) {
  const [open, setOpen] = useState(false)
  const defaultSubject = lastSubject && lastSubject.startsWith('Re:')
    ? lastSubject
    : 'Re: ' + (lastSubject || 'Booking enquiry - ' + tourName + (rdsRef ? ' [' + rdsRef + ']' : ''))
  const defaultSignature = '\n\nTake care,\nHelen Baker\nLodge Bookings | Ride Down South\nbookings@ridedownsouth.com'

  const [toAddr, setToAddr] = useState(lodgeEmail || '')
  const [subject, setSubject] = useState(defaultSubject)
  const [body, setBody] = useState(defaultSignature)
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    if (!body.trim() || !toAddr.trim()) return
    setSending(true)
    try {
      const res = await fetch('/api/send-enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: toAddr, subject, body: body.trim(),
          booking_ids: [bookingId], lodge_name: lodgeName, is_reply: true,
        }),
      })
      const result = await res.json()
      if (result.email_sent) { setBody(defaultSignature); setOpen(false); if (onSent) onSent() }
      else alert('Send failed: ' + (result.email_error || 'Unknown error'))
    } catch (err) { alert('Error: ' + err.message) }
    finally { setSending(false) }
  }

  if (!open) {
    return (
      <div style={{ padding: '10px 14px' }}>
        <button className="btn btn-sm" onClick={() => setOpen(true)} style={{ fontSize: 12 }}>
          Reply to {lodgeName}
        </button>
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
