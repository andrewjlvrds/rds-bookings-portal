import React, { useState } from 'react'
import { getStatus, fmtDate, fmtDateFull } from '../utils/helpers'
import { generateDateChangeEmail } from '../utils/emailTemplates'

// Statuses that require a date-change notification
const POST_ENQUIRY = new Set([
  'Enquiry Sent', 'Availability Confirmed', 'Confirmed',
  'Proforma Received', 'Deposit Paid', 'Balance Paid',
])

// Build lodge directory lookup (same logic as EnquiryPreview)
function buildLookup(lodges) {
  const list = (lodges || []).filter(l => l.name).map(l => ({
    ...l,
    _lower: l.name.toLowerCase().trim(),
    _words: l.name.toLowerCase().trim().split(/\s+/),
  }))
  return (name) => {
    if (!name) return null
    const q = name.toLowerCase().trim()
    let match = list.find(l => l._lower === q)
    if (!match) match = list.find(l => l._lower.includes(q) || q.includes(l._lower))
    if (!match) {
      const qWords = q.split(/\s+/).filter(w => w.length > 2)
      if (qWords.length > 0) {
        let best = null, bestScore = 0
        for (const l of list) {
          const hits = qWords.filter(w => l._lower.includes(w)).length
          const score = hits / Math.max(qWords.length, l._words.length)
          if (hits >= 1 && score > bestScore) { best = l; bestScore = score }
        }
        if (best) match = best
      }
    }
    return match || null
  }
}

export default function DateChangePreview({ tour, lodges, dateChangeBookings, onBack, onDone }) {
  const [sender, setSender] = useState('Helen')
  const [sent, setSent] = useState({})     // { idx: 'sent' | 'sent-warn' | 'error: ...' }
  const [excluded, setExcluded] = useState({})
  const [editedSubjects, setEditedSubjects] = useState({})
  const [editedBodies, setEditedBodies] = useState({})
  const [sending, setSending] = useState(false)

  const lookupLodge = buildLookup(lodges)

  // Build one card per affected booking — dedupe same lodge if it shifted
  // multiple nights (shouldn't happen but be safe)
  const cards = (dateChangeBookings || []).map((entry, i) => {
    const { booking, oldCheckIn, oldCheckOut, newCheckIn, newCheckOut, night } = entry
    const rawLodge = booking.Lodge_Name || booking.Name || ''
    const lodgeName = (typeof rawLodge === 'object' ? rawLodge.name || '' : rawLodge).split(' - ')[0]
    const lr = lookupLodge(lodgeName)
    const email = lr ? (lr.email || lr.Preferred_Email || lr.email2 || '') : (booking.Email || booking.Lodge_Email || '')
    const contactName = booking.Contact_Name || (lr ? lr.contact || lr.Contact_First_Name || '' : '')
    const bookingRef = booking.Lodge_Reference || booking.RDS_Reference || ''
    const nights = (() => {
      if (!newCheckIn || !newCheckOut) return 1
      const a = new Date(newCheckIn), b = new Date(newCheckOut)
      return Math.round((b - a) / 86400000) || 1
    })()
    return { i, lodgeName, email, contactName, bookingRef, oldCheckIn, oldCheckOut, newCheckIn, newCheckOut, nights, booking }
  })

  const generateForCard = (card) => {
    const subject = 'Date change — ' + tour.name + (card.bookingRef ? ' — ' + card.bookingRef : '')
    const body = generateDateChangeEmail({
      sender,
      contactName: card.contactName,
      lodgeName: card.lodgeName,
      bookingRef: card.bookingRef,
      oldCheckIn: card.oldCheckIn,
      oldCheckOut: card.oldCheckOut,
      newCheckIn: card.newCheckIn,
      newCheckOut: card.newCheckOut,
      nights: card.nights,
    })
    return { subject, body }
  }

  const activeCards = cards.filter((c) => !excluded[c.i])
  const allSent = activeCards.length > 0 &&
    cards.every((c) => excluded[c.i] || sent[c.i] === 'sent' || sent[c.i] === 'sent-warn')

  const handleSendAll = async () => {
    if (!activeCards.length) return
    setSending(true)
    for (const card of cards) {
      if (excluded[card.i]) continue
      const gen = generateForCard(card)
      const subject = editedSubjects[card.i] !== undefined ? editedSubjects[card.i] : gen.subject
      const body    = editedBodies[card.i]    !== undefined ? editedBodies[card.i]    : gen.body
      const bookingId = card.booking.id || card.booking['Record Id']
      try {
        const res = await fetch('/api/send-enquiry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: card.email,
            subject,
            body,
            booking_ids: [bookingId].filter(Boolean),
            tour_name: tour.name,
            lodge_name: card.lodgeName,
            sender,
            is_reply: true,
          }),
        })
        const d = await res.json()
        if (d.email_sent) {
          setSent(prev => ({ ...prev, [card.i]: d.update_errors?.length ? 'sent-warn' : 'sent' }))
          // Update status to Date Change Requested
          const bookingId = card.booking.id || card.booking['Record Id']
          if (bookingId) {
            fetch('/api/update-bookings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ records: [{ id: bookingId, Status: 'Date Change Requested' }] }),
            }).catch(() => {})
          }
        } else {
          setSent(prev => ({ ...prev, [card.i]: 'error: ' + (d.email_error || 'Send failed') }))
        }
      } catch (e) {
        setSent(prev => ({ ...prev, [card.i]: 'error: ' + e.message }))
      }
      if (card.i < cards.length - 1) await new Promise(r => setTimeout(r, 800))
    }
    setSending(false)
  }

  const inputStyle = {
    fontSize: 13, padding: '6px 8px',
    border: '0.5px solid var(--border-default)', borderRadius: 4,
    outline: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)',
    fontFamily: 'var(--font-sans)',
  }

  return (
    <div>
      {/* Back */}
      <button
        onClick={onBack}
        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, padding: '0 0 12px', cursor: 'pointer' }}
      >
        ← Back to {tour.name}
      </button>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 500 }}>Date change notifications — {tour.name}</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            {activeCards.length} lodge{activeCards.length !== 1 ? 's' : ''} to notify — dates shifted during last sync
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Sender toggle */}
          <div style={{ display: 'flex', gap: 0, marginRight: 8 }}>
            {['Helen', 'Andrew'].map(s => (
              <button key={s} onClick={() => setSender(s)} style={{
                fontSize: 12, padding: '4px 10px', border: 'none', cursor: 'pointer',
                background: sender === s ? 'var(--blue-bg)' : 'var(--bg-secondary)',
                color: sender === s ? 'var(--blue-text)' : 'var(--text-muted)',
                borderRadius: s === 'Helen' ? '4px 0 0 4px' : '0 4px 4px 0',
                fontWeight: 500,
              }}>{s}</button>
            ))}
          </div>
          {allSent ? (
            <button className="btn btn-primary" onClick={onDone}>Done</button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={handleSendAll}
              disabled={sending || !activeCards.length}
            >
              {sending ? 'Sending…' : 'Send ' + activeCards.length + ' email' + (activeCards.length !== 1 ? 's' : '')}
            </button>
          )}
        </div>
      </div>

      {cards.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)' }}>
          No lodges to notify.
        </div>
      )}

      {cards.map((card) => {
        const gen = generateForCard(card)
        const subject = editedSubjects[card.i] !== undefined ? editedSubjects[card.i] : gen.subject
        const body    = editedBodies[card.i]    !== undefined ? editedBodies[card.i]    : gen.body
        const isEdited = editedSubjects[card.i] !== undefined || editedBodies[card.i] !== undefined
        const isExcluded = excluded[card.i]
        const status = sent[card.i]
        const isSent = status === 'sent' || status === 'sent-warn'

        return (
          <div
            key={card.i}
            style={{
              border: '0.5px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              marginBottom: 12,
              opacity: isExcluded ? 0.4 : 1,
              background: isSent ? 'var(--green-bg)' : 'var(--bg-primary)',
            }}
          >
            {/* Card header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 16px',
              borderBottom: (!isExcluded && !isSent) ? '0.5px solid var(--border-default)' : 'none',
            }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {card.lodgeName}
                  {isEdited && !isSent && (
                    <span style={{ fontSize: 10, color: 'var(--amber-text)', fontWeight: 500, padding: '1px 6px', background: 'var(--amber-bg, #FFF4E5)', borderRadius: 3 }}>edited</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, display: 'flex', gap: 12 }}>
                  <span>To: {card.email || <span style={{ color: 'var(--red-text)' }}>No email on file</span>}</span>
                  <span style={{ color: 'var(--amber-text)' }}>
                    {fmtDateFull(card.oldCheckIn)} → {fmtDateFull(card.newCheckIn)}
                  </span>
                  <span>{getStatus(card.booking)}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {status === 'sent' && <span style={{ fontSize: 12, color: 'var(--green-text)', fontWeight: 500 }}>Sent</span>}
                {status === 'sent-warn' && <span style={{ fontSize: 12, color: 'var(--amber-text)', fontWeight: 500 }}>Sent (status update failed)</span>}
                {status && status.startsWith('error') && <span style={{ fontSize: 12, color: 'var(--red-text)' }}>{status}</span>}
                {!status && isEdited && (
                  <button
                    onClick={() => {
                      setEditedSubjects(prev => { const n = { ...prev }; delete n[card.i]; return n })
                      setEditedBodies(prev => { const n = { ...prev }; delete n[card.i]; return n })
                    }}
                    style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}
                  >Reset</button>
                )}
                {!status && (
                  <button
                    onClick={() => setExcluded(prev => ({ ...prev, [card.i]: !prev[card.i] }))}
                    style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}
                  >{isExcluded ? 'Include' : 'Skip'}</button>
                )}
              </div>
            </div>

            {/* Email editor */}
            {!isExcluded && !isSent && (
              <div style={{ padding: '12px 16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: '6px 8px', alignItems: 'start' }}>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', paddingTop: 6 }}>Subject:</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={e => setEditedSubjects(prev => ({ ...prev, [card.i]: e.target.value }))}
                    style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
                  />
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', paddingTop: 6 }}>Body:</label>
                  <textarea
                    value={body}
                    onChange={e => setEditedBodies(prev => ({ ...prev, [card.i]: e.target.value }))}
                    rows={Math.min(18, Math.max(8, body.split('\n').length + 2))}
                    style={{
                      ...inputStyle, width: '100%', boxSizing: 'border-box',
                      lineHeight: 1.6, padding: '8px 10px',
                      resize: 'vertical', whiteSpace: 'pre-wrap',
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
