import React, { useState, useEffect } from 'react'
import { fmtDate, fmtDateFull, fmtCurrency, getStatusBadge, getStatus, daysBetween } from '../utils/helpers'

export default function LodgeDetail({ booking, tour, lodges, onBack, onRefresh }) {
  const [emails, setEmails] = useState([])
  const [loadingEmails, setLoadingEmails] = useState(true)
  const [editing, setEditing] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)

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
  useEffect(() => {
    setLoadingEmails(true)
    fetch('/api/bp-emails?booking_id=' + bookingId)
      .then(r => r.json())
      .then(d => {
        setEmails(d.emails || [])
        setLoadingEmails(false)
      })
      .catch(() => setLoadingEmails(false))
  }, [bookingId])

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
            <DetailRows rows={[
              { label: 'Lodge', value: lodgeName },
              { label: 'Contact', value: lodgeContact || '—' },
              { label: 'Email', value: lodgeEmail ? <a href={'mailto:' + lodgeEmail}>{lodgeEmail}</a> : '—' },
              { label: 'Check-in', value: fmtDateFull(checkIn) },
              { label: 'Check-out', value: fmtDateFull(checkOut) },
              { label: 'Nights', value: nights || '—' },
              { label: 'Meals', value: meals || '—' },
              { label: 'RDS reference', value: rdsRef || '—' },
              { label: 'Lodge reference', value: lodgeRef || '—' },
              { label: 'Total', value: total ? fmtCurrency(total, currency) : '—' },
              ...(credit > 0 ? [{ label: 'Credit applied', value: fmtCurrency(credit, currency) }] : []),
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
            {payments.length > 0 ? (
              <div>
                {/* Total */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 12, borderBottom: '0.5px solid var(--border-light)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Total</span>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{fmtCurrency(total, currency)}</span>
                </div>

                {/* Payment items */}
                {payments.map((p, i) => {
                  const overdue = p.due && p.due < today && !['Balance Paid', 'Deposit Paid'].includes(status)
                  return (
                    <div
                      key={i}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '8px 0',
                        borderBottom: i < payments.length - 1 ? '0.5px solid var(--border-light)' : 'none',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 13 }}>{p.label}</div>
                        {p.due && (
                          <div style={{ fontSize: 11, color: overdue ? 'var(--red-text)' : 'var(--text-muted)', marginTop: 1 }}>
                            Due {fmtDateFull(p.due)}
                            {overdue && ' — overdue'}
                          </div>
                        )}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                        {fmtCurrency(p.amount, currency)}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                No payment schedule set
              </div>
            )}

            {/* Cancellation */}
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '0.5px solid var(--border-light)' }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
                Cancellation
              </div>
              {cancelBefore ? (
                <div style={{ fontSize: 13, marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Free cancel before: </span>
                  <span style={{
                    fontWeight: 500,
                    color: cancelBefore < today ? 'var(--red-text)' : 'var(--green-text)',
                  }}>
                    {fmtDateFull(cancelBefore)}
                  </span>
                  {cancelBefore < today && (
                    <span style={{ fontSize: 11, color: 'var(--red-text)', marginLeft: 6 }}>Passed</span>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No free cancellation date set</div>
              )}
              {cancelPolicy && (
                <div style={{
                  fontSize: 12, color: 'var(--text-secondary)', marginTop: 6,
                  padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)',
                  lineHeight: 1.5, whiteSpace: 'pre-wrap',
                }}>
                  {cancelPolicy}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Email thread */}
      <div className="panel">
        <div className="panel-head">
          <span>Email thread</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
            {loadingEmails ? 'Loading...' : emails.length + ' email' + (emails.length !== 1 ? 's' : '')}
          </span>
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

function DetailRows({ rows }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '6px 12px' }}>
      {rows.map((r, i) => (
        <React.Fragment key={i}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.label}</div>
          <div style={{ fontSize: 13 }}>{r.value}</div>
        </React.Fragment>
      ))}
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
