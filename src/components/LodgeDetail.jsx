import React, { useState, useEffect } from 'react'
import { fmtDate, fmtDateFull, fmtCurrency, getStatusBadge, getStatus, daysBetween } from '../utils/helpers'

export default function LodgeDetail({ booking, tour, lodges, onBack, onRefresh }) {
  const [emails, setEmails] = useState([])
  const [loadingEmails, setLoadingEmails] = useState(true)
  const [editing, setEditing] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [polling, setPolling] = useState(false)

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

  // Fetch emails for this booking
  const fetchEmails = () => {
    setLoadingEmails(true)
    fetch('/api/bp-emails?booking_id=' + bookingId)
      .then(r => r.json())
      .then(d => {
        setEmails(d.emails || [])
        setLoadingEmails(false)
      })
      .catch(() => setLoadingEmails(false))
  }

  useEffect(() => { fetchEmails() }, [bookingId])

  // Check Gmail for new replies
  const handleCheckReplies = async () => {
    setPolling(true)
    try {
      const res = await fetch('/api/poll-gmail', { method: 'POST' })
      const result = await res.json()
      if (result.stored > 0) {
        fetchEmails()
        if (onRefresh) onRefresh()
      }
    } catch (err) {
      console.error('Poll error:', err)
    } finally {
      setPolling(false)
    }
  }

  // Save inline edit
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
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setSavingEdit(false)
    }
  }

  // Build payment schedule
  const payments = []
  const deposit = parseFloat(booking.Deposit_Amount) || 0
  const total = parseFloat(booking.Total_Amount || booking['Total Amount']) || 0
  const currency = booking.Lodge_Currency || booking.Currency || ''

  if (deposit > 0) {
    payments.push({
      label: 'Deposit',
      amount: deposit,
      due: booking.Deposit_Due_Date || null,
    })
  }

  const paymentFields = [
    { amount: 'Second_Payment_Amount', due: 'Second_Payment_Due_Date', label: '2nd payment' },
    { amount: 'Third_Payment_Amount', due: 'Third_Payment_Due_Date', label: '3rd payment' },
    { amount: 'Fourth_Payment_Amount', due: 'Fourth_Payment_Due_Date', label: '4th payment' },
  ]
  paymentFields.forEach(pf => {
    const amt = parseFloat(booking[pf.amount]) || 0
    if (amt > 0) {
      payments.push({ label: pf.label, amount: amt, due: booking[pf.due] || null })
    }
  })

  const today = new Date().toISOString().split('T')[0]
  const cancelBefore = booking.Cancel_Free_Before || ''
  const cancelPolicy = booking.Cancellation_Policy_Text || ''
  const credit = parseFloat(booking.Credit_Amount) || 0

  const checkIn = booking.Check_in_Date || booking['Check-in'] || ''
  const checkOut = booking.Check_out_Date || booking['Check-out'] || ''
  const nights = booking.Nights || (checkIn && checkOut ? daysBetween(checkIn, checkOut) : '')
  const meals = booking.Meals || booking['Meals'] || ''
  const rdsRef = booking.RDS_Reference || ''
  const lodgeRef = booking.Lodge_Reference || ''
  const enquirySent = booking.Enquiry_Sent_Date || ''
  const lastResponse = booking.Last_Response_Date || ''
  const followUp = booking.Follow_up_Date || ''
  const dayDesc = booking.Day_Description || booking['Day Description'] || ''

  const STATUS_OPTIONS = [
    'Not Started', 'Ready to Send', 'Enquiry Sent', 'Availability Confirmed',
    'Confirmed', 'Proforma Received', 'Deposit Paid', 'Balance Paid',
    'Not Available', 'Cancelled', 'Waitlisted', 'Credit against booking',
  ]

  return (
    <div>
      {/* Back button */}
      <button
        onClick={onBack}
        style={{
          background: 'none', border: 'none', color: 'var(--text-muted)',
          fontSize: 13, padding: '0 0 12px', cursor: 'pointer',
        }}
      >
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
              value={editing === 'status' ? (savingEdit ? status : undefined) : status}
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
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

            {/* Dates row */}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid var(--border-light)' }}>
              <DetailRows rows={[
                { label: 'Enquiry sent', value: enquirySent ? fmtDateFull(enquirySent) : '—' },
                { label: 'Last response', value: lastResponse ? fmtDateFull(lastResponse) : '—' },
                { label: 'Follow up', value: followUp ? fmtDateFull(followUp) : '—' },
              ]} />
            </div>

            {/* Lodge directory info */}
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

        {/* Payment & cancellation panel */}
        <div className="panel">
          <div className="panel-head">Payments & cancellation</div>
          <div className="panel-body">
            <DetailRows onEdit={handleSave} rows={[
              { label: 'Total', value: total ? fmtCurrency(total, currency) : '—', field: 'Total_Amount', type: 'number', raw: total || '' },
              { label: 'Deposit', value: deposit ? fmtCurrency(deposit, currency) : '—', field: 'Deposit_Amount', type: 'number', raw: deposit || '' },
              { label: 'Deposit due', value: booking.Deposit_Due_Date ? fmtDateFull(booking.Deposit_Due_Date) : '—', field: 'Deposit_Due_Date', type: 'date', raw: booking.Deposit_Due_Date || '' },
              { label: '2nd payment', value: booking.Second_Payment_Amount ? fmtCurrency(booking.Second_Payment_Amount, currency) : '—', field: 'Second_Payment_Amount', type: 'number', raw: booking.Second_Payment_Amount || '' },
              { label: '2nd due', value: booking.Second_Payment_Due_Date ? fmtDateFull(booking.Second_Payment_Due_Date) : '—', field: 'Second_Payment_Due_Date', type: 'date', raw: booking.Second_Payment_Due_Date || '' },
              { label: '3rd payment', value: booking.Third_Payment_Amount ? fmtCurrency(booking.Third_Payment_Amount, currency) : '—', field: 'Third_Payment_Amount', type: 'number', raw: booking.Third_Payment_Amount || '' },
              { label: '3rd due', value: booking.Third_Payment_Due_Date ? fmtDateFull(booking.Third_Payment_Due_Date) : '—', field: 'Third_Payment_Due_Date', type: 'date', raw: booking.Third_Payment_Due_Date || '' },
            ]} />

            {/* Cancellation */}
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '0.5px solid var(--border-light)' }}>
              <DetailRows onEdit={handleSave} rows={[
                { label: 'Free cancel before', value: cancelBefore ? fmtDateFull(cancelBefore) : '—', field: 'Cancel_Free_Before', type: 'date', raw: cancelBefore },
                { label: 'Cancel policy', value: cancelPolicy || '—', field: 'Cancellation_Policy_Text', raw: cancelPolicy },
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
            <button
              className="btn btn-sm"
              onClick={handleCheckReplies}
              disabled={polling}
              style={{ fontSize: 11, padding: '3px 10px' }}
            >
              {polling ? 'Checking...' : 'Check for replies'}
            </button>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
              {loadingEmails ? 'Loading...' : emails.length + ' email' + (emails.length !== 1 ? 's' : '')}
            </span>
          </div>
        </div>
        <div className="panel-body">
          {loadingEmails ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>
              Loading emails...
            </div>
          ) : emails.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>
              No emails recorded for this booking yet.
              {status === 'Enquiry Sent' && ' The sent enquiry will appear here once email tracking is connected.'}
            </div>
          ) : (
            <div>
              {emails.map((em, i) => (
                <EmailMessage key={em.id || i} email={em} isLast={i === emails.length - 1} />
              ))}
            </div>
          )}
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
    if (editValue === String(value || '')) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      var saveVal = editValue
      if (type === 'number') saveVal = parseFloat(editValue) || 0
      await onEdit(field, saveVal)
      setEditing(false)
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
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

function EmailMessage({ email, isLast }) {
  const [expanded, setExpanded] = useState(false)
  const isOutbound = email.direction === 'outbound'
  const date = email.date || email.email_date || ''
  const from = email.from || email.email_from || ''
  const to = email.to || email.email_to || ''
  const subject = email.subject || email.email_subject || ''
  const body = email.body || email.email_content || ''

  // Truncate body preview
  const preview = body.length > 200 ? body.substring(0, 200) + '...' : body

  return (
    <div style={{
      padding: '12px 0',
      borderBottom: isLast ? 'none' : '0.5px solid var(--border-light)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div>
          <span style={{
            fontSize: 12, fontWeight: 500,
            color: isOutbound ? 'var(--blue-text)' : 'var(--text-primary)',
          }}>
            {isOutbound ? 'Sent' : 'Received'}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
            {from}
          </span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {date ? fmtDateFull(date) : ''}
        </span>
      </div>
      {subject && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
          {subject}
        </div>
      )}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)',
          whiteSpace: 'pre-wrap', cursor: 'pointer',
        }}
      >
        {expanded ? body : preview}
      </div>
      {body.length > 200 && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: 'none', border: 'none', fontSize: 11,
            color: 'var(--blue-text)', cursor: 'pointer', padding: '4px 0 0',
          }}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
      {email.ai_summary && (
        <div style={{
          marginTop: 6, padding: '6px 8px', background: 'var(--blue-bg)',
          borderRadius: 'var(--radius-sm)', fontSize: 11, color: 'var(--blue-text)',
        }}>
          AI summary: {email.ai_summary}
        </div>
      )}
    </div>
  )
}
