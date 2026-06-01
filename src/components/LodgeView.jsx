import React, { useState, useMemo } from 'react'
import { fmtDate, getStatus, getStatusBadge, isActiveBooking } from '../utils/helpers'

// Resolve a lodge name string from a booking (Lodge_Name / Lodge can be lookup objects)
function lodgeNameOf(b) {
  const ln = b.Lodge_Name
  if (ln && typeof ln === 'object') return ln.name || ''
  if (typeof ln === 'string') return ln
  const lk = b.Lodge
  if (lk && typeof lk === 'object') return lk.name || ''
  return ''
}

function fmtMoney(amount, currency) {
  if (amount === null || amount === undefined || amount === '') return null
  const n = Number(amount)
  if (isNaN(n) || n === 0) return null
  return (currency ? currency + ' ' : '') + n.toLocaleString()
}

// Bookings whose lodge lookup matches this lodge id (with a name fallback for
// older rows that were linked by name only).
export function bookingsForLodge(allBookings, lodge) {
  if (!lodge) return []
  const id = lodge.id
  const name = (lodge.name || '').trim().toLowerCase()
  return (allBookings || []).filter(b => {
    if (b.lodge_id && b.lodge_id === id) return true
    if (!b.lodge_id && name && lodgeNameOf(b).trim().toLowerCase() === name) return true
    return false
  })
}

// ── A single stored email, expandable to its body ──
function EmailRow({ em }) {
  const [open, setOpen] = useState(false)
  const isOut = em.direction === 'outbound'
  const who = isOut
    ? ((em.to || '').split('<')[0].trim() || em.to)
    : ((em.from || '').split('<')[0].trim() || em.from)
  const body = (em.body || em.email_content || '').trim()
  const when = em.date || em.email_date

  return (
    <div style={{ borderBottom: '0.5px solid var(--border-light)' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 12 }}
      >
        <span style={{
          fontWeight: 600, fontSize: 10, width: 34, flexShrink: 0, textAlign: 'center',
          padding: '2px 0', borderRadius: 3,
          background: isOut ? 'var(--blue-bg)' : 'var(--green-bg)',
          color: isOut ? 'var(--blue-text)' : 'var(--green-text)',
        }}>{isOut ? 'OUT' : 'IN'}</span>
        <span style={{ fontWeight: 500, width: 150, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {who || '—'}
        </span>
        <span style={{ color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {em.subject || '(no subject)'}
        </span>
        {em.attachments && em.attachments.length > 0 && (
          <span style={{ fontSize: 10, flexShrink: 0, color: 'var(--text-muted)' }}>📎 {em.attachments.length}</span>
        )}
        <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, width: 54, textAlign: 'right' }}>{fmtDate(when)}</span>
      </div>
      {open && (
        <div style={{
          padding: '4px 14px 14px 54px', fontSize: 12, lineHeight: 1.5,
          color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {body || <span style={{ color: 'var(--text-muted)' }}>(no body stored)</span>}
        </div>
      )}
    </div>
  )
}

// ── A single booking (one stay = one check-in date), expandable to its thread ──
function BookingBlock({ bk, onOpen }) {
  const [open, setOpen] = useState(false)
  const [emails, setEmails] = useState(null)
  const [loading, setLoading] = useState(false)
  const bookingId = bk.id || bk['Record Id']
  const badge = getStatusBadge(getStatus(bk))
  const money = fmtMoney(bk.Total_Amount, bk.Lodge_Currency)

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && emails === null && bookingId) {
      setLoading(true)
      fetch('/api/bp-emails?booking_id=' + bookingId)
        .then(r => r.json())
        .then(d => setEmails(d.emails || []))
        .catch(() => setEmails([]))
        .finally(() => setLoading(false))
    }
  }

  return (
    <div style={{ border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-md)', marginBottom: 8, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-secondary)' }}>
        <button
          onClick={toggle}
          style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <span style={{ fontSize: 10, color: 'var(--text-muted)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>▶</span>
          <span style={{ fontWeight: 600, fontSize: 13, flexShrink: 0 }}>
            {fmtDate(bk.Check_in_Date)} – {fmtDate(bk.Check_out_Date)}
          </span>
          {bk.Nights ? <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{bk.Nights}n</span> : null}
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {bk.tour_name || '—'}
          </span>
          {money && <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{money}</span>}
          <span className={'badge ' + badge.cls} style={{ flexShrink: 0 }}>{badge.label}</span>
        </button>
        {onOpen && (
          <button
            onClick={() => onOpen(bk)}
            className="btn btn-sm"
            style={{ fontSize: 11, padding: '4px 10px', flexShrink: 0 }}
            title="Open full booking"
          >Open ↗</button>
        )}
      </div>
      {open && (
        <div>
          {loading && <div style={{ padding: 14, fontSize: 12, color: 'var(--text-muted)' }}>Loading correspondence…</div>}
          {!loading && emails && emails.length === 0 && (
            <div style={{ padding: 14, fontSize: 12, color: 'var(--text-muted)' }}>No correspondence stored for this booking.</div>
          )}
          {!loading && emails && emails.map((em, i) => <EmailRow key={em.message_id || em.gmail_id || i} em={em} />)}
        </div>
      )}
    </div>
  )
}

export default function LodgeView({ lodge, allBookings, onBack, onSelectBooking, tours }) {
  const bookings = useMemo(() => {
    const list = bookingsForLodge(allBookings, lodge).filter(isActiveBooking)
    return list.sort((a, b) => (a.Check_in_Date || '').localeCompare(b.Check_in_Date || ''))
  }, [allBookings, lodge])

  const handleOpen = (bk) => {
    if (!onSelectBooking) return
    const t = (tours || []).find(x => x.id === bk.tour_id)
    onSelectBooking(bk, 'itinerary', { origin: 'lodges', tour: t })
  }

  if (!lodge) return null

  return (
    <div>
      <button
        onClick={onBack}
        className="btn btn-sm"
        style={{ fontSize: 12, padding: '5px 12px', marginBottom: 14 }}
      >← Back to lodges</button>

      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>{lodge.name}</h1>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {lodge.country && <span>{lodge.country}</span>}
          {lodge.email && <a href={'mailto:' + lodge.email} style={{ color: 'var(--blue-text)' }}>{lodge.email}</a>}
          {lodge.contact && <span>Contact: {lodge.contact}</span>}
          {lodge.currency && <span>{lodge.currency}</span>}
          <span>{bookings.length} active booking{bookings.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {bookings.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)' }}>
          No active bookings for this lodge.
        </div>
      ) : (
        bookings.map(bk => (
          <BookingBlock key={bk.id || bk['Record Id']} bk={bk} onOpen={onSelectBooking ? handleOpen : null} />
        ))
      )}
    </div>
  )
}
