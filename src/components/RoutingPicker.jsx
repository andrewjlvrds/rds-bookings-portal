import React, { useState, useEffect } from 'react'
import { fmtDate } from '../utils/helpers'

/*
 * RoutingPicker — the modal Helen uses to assign or reassign an email
 * to a specific lodge booking.
 *
 * Used in two places:
 *   - Inbox: routing unmatched/tour-bucket emails to a booking
 *   - LodgeDetail email row: reassigning a misrouted email to a
 *     different booking
 *
 * Props:
 *   email       — the email record (for displaying subject in header)
 *   tours       — full tours array (for the left column)
 *   currentBookingId — optional, hides this booking from the right
 *                      column (so reassignments can't be no-ops)
 *   onCancel    — fired on backdrop click or Cancel
 *   onRoute     — fired with the chosen bookingId when she clicks one
 */
export default function RoutingPicker({ email, tours, currentBookingId, onCancel, onRoute }) {
  const [search, setSearch] = useState('')
  const [selectedTourId, setSelectedTourId] = useState(null)

  // Pre-select the tour whose name appears in the subject (best-effort).
  useEffect(() => {
    const subj = (email.subject || email.email_subject || '').toLowerCase()
    const found = (tours || []).find(t => subj.includes(t.name.toLowerCase()))
    if (found) setSelectedTourId(found.id)
  }, [email, tours])

  const committedTours = (tours || []).filter(t => {
    if (typeof t.id === 'string' && t.id.startsWith('local_')) return false
    if (t.tour_status === 'Draft') return false
    return true
  }).sort((a, b) => (a.start_date || a.departure_date || '').localeCompare(b.start_date || b.departure_date || ''))

  const filteredTours = search
    ? committedTours.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    : committedTours

  const selectedTour = committedTours.find(t => t.id === selectedTourId)
  const tourBookings = selectedTour
    ? (selectedTour.bookings || [])
        .filter(bk => bk.id !== currentBookingId) // hide current booking on reassign
        .slice()
        .sort((a, b) => (a.Check_in_Date || '').localeCompare(b.Check_in_Date || ''))
    : []

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-primary)', borderRadius: 'var(--radius-lg)',
          maxWidth: 640, width: '100%', maxHeight: '85vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 16px', borderBottom: '0.5px solid var(--border-default)' }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>
            {currentBookingId ? 'Reassign email to a different booking' : 'Route email to booking'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {email.subject || email.email_subject || '(no subject)'}
          </div>
        </div>

        <div style={{ padding: '10px 16px', borderBottom: '0.5px solid var(--border-default)' }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tours..."
            style={{
              width: '100%', fontSize: 13, padding: '6px 10px',
              border: '0.5px solid var(--border-default)', borderRadius: 4,
              outline: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)',
            }}
          />
        </div>

        <div style={{ flex: 1, overflow: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          {/* Tours */}
          <div style={{ borderRight: '0.5px solid var(--border-default)', overflow: 'auto' }}>
            <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '0.5px solid var(--border-subtle)' }}>
              Tours
            </div>
            {filteredTours.map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedTourId(t.id)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 12px', fontSize: 12,
                  border: 'none', background: selectedTourId === t.id ? 'var(--blue-bg)' : 'transparent',
                  color: selectedTourId === t.id ? 'var(--blue-text)' : 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                {t.name}
              </button>
            ))}
            {filteredTours.length === 0 && (
              <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>No tours found</div>
            )}
          </div>

          {/* Bookings within selected tour */}
          <div style={{ overflow: 'auto' }}>
            <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '0.5px solid var(--border-subtle)' }}>
              {selectedTour ? 'Lodge bookings' : 'Pick a tour first'}
            </div>
            {tourBookings.map(bk => {
              const ln = (typeof bk.Lodge_Name === 'object' ? bk.Lodge_Name?.name : bk.Lodge_Name) || bk.Name || '(unnamed)'
              return (
                <button
                  key={bk.id}
                  onClick={() => onRoute(bk.id)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '8px 12px', fontSize: 12,
                    border: 'none', background: 'transparent',
                    color: 'var(--text-primary)', cursor: 'pointer',
                    borderBottom: '0.5px solid var(--border-subtle)',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ fontWeight: 500 }}>{ln}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {fmtDate(bk.Check_in_Date)} → {fmtDate(bk.Check_out_Date)}
                  </div>
                </button>
              )
            })}
            {selectedTour && tourBookings.length === 0 && (
              <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                {currentBookingId ? 'No other bookings on this tour' : 'No bookings on this tour'}
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: '10px 16px', borderTop: '0.5px solid var(--border-default)', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} className="btn btn-sm">Cancel</button>
        </div>
      </div>
    </div>
  )
}
