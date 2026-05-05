import React, { useState, useEffect } from 'react'
import { fmtDate } from '../utils/helpers'
import { categorizeTours } from './Layout'

/*
 * RoutingPicker — the modal Helen uses to assign or reassign an email
 * to a specific lodge booking.
 *
 * Used in two places:
 *   - Inbox: routing unmatched/tour-bucket emails to a booking
 *   - LodgeDetail email row: reassigning a misrouted email to a
 *     different booking
 *
 * Tour column is grouped by year (matches the sidebar) with the Past
 * group collapsed by default — keeps the picker scannable when there
 * are many historical tours and sandbox/test entries cluttering the
 * full list.
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
  const [collapsedGroups, setCollapsedGroups] = useState({ past: true }) // past collapsed by default

  // Pre-select the tour whose name appears in the subject (best-effort).
  useEffect(() => {
    const subj = (email.subject || email.email_subject || '').toLowerCase()
    const found = (tours || []).find(t => subj.includes(t.name.toLowerCase()))
    if (found) setSelectedTourId(found.id)
  }, [email, tours])

  const { yearGroups, years, past } = categorizeTours(tours)

  // When searching: flatten back to a single list. Grouping only
  // applies when browsing.
  const isSearching = search.trim().length > 0
  const matchesSearch = (t) => t.name.toLowerCase().includes(search.toLowerCase())

  const allTours = [...years.flatMap(y => yearGroups[y]), ...past]
  const flatFiltered = isSearching ? allTours.filter(matchesSearch) : null

  const selectedTour = allTours.find(t => t.id === selectedTourId)
  const tourBookings = selectedTour
    ? (selectedTour.bookings || [])
        .filter(bk => {
          if (bk.id === currentBookingId) return false
          // Exclude Z-prefixed (cancelled/fallback) bookings — catches "Z Day", "ZDay", "z " etc.
          const dayDesc = bk.Day_Description || ''
          if (/^z\s*day/i.test(dayDesc) || dayDesc.startsWith('Z ') || dayDesc.startsWith('z ')) return false
          // Exclude non-actionable statuses
          const s = bk.Status || ''
          if (['Cancelled', 'Not suitable', 'Closed for Renovations', 'Not Available', 'Unavailable',
               'Waitlisted', 'Booked on Booking.com', 'No Response', 'Credit against booking'].includes(s)) return false
          return true
        })
        .slice()
        .sort((a, b) => (a.Check_in_Date || '').localeCompare(b.Check_in_Date || ''))
    : []

  const toggleGroup = (key) => setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }))

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
            {isSearching ? (
              <>
                {flatFiltered.map(t => (
                  <TourButton
                    key={t.id}
                    tour={t}
                    selected={selectedTourId === t.id}
                    onClick={() => setSelectedTourId(t.id)}
                  />
                ))}
                {flatFiltered.length === 0 && (
                  <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>No tours found</div>
                )}
              </>
            ) : (
              <>
                {years.map(y => {
                  const tours = yearGroups[y]
                  if (!tours || tours.length === 0) return null
                  const collapsed = !!collapsedGroups[y]
                  return (
                    <div key={y}>
                      <GroupHeader
                        label={y + ' tours'}
                        count={tours.length}
                        collapsed={collapsed}
                        onToggle={() => toggleGroup(y)}
                      />
                      {!collapsed && tours.map(t => (
                        <TourButton
                          key={t.id}
                          tour={t}
                          selected={selectedTourId === t.id}
                          onClick={() => setSelectedTourId(t.id)}
                        />
                      ))}
                    </div>
                  )
                })}
                {past.length > 0 && (
                  <div>
                    <GroupHeader
                      label="Past"
                      count={past.length}
                      collapsed={!!collapsedGroups.past}
                      onToggle={() => toggleGroup('past')}
                    />
                    {!collapsedGroups.past && past.map(t => (
                      <TourButton
                        key={t.id}
                        tour={t}
                        selected={selectedTourId === t.id}
                        onClick={() => setSelectedTourId(t.id)}
                      />
                    ))}
                  </div>
                )}
                {years.length === 0 && past.length === 0 && (
                  <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>No tours available</div>
                )}
              </>
            )}
          </div>

          {/* Bookings within selected tour */}
          <div style={{ overflow: 'auto' }}>
            <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '0.5px solid var(--border-subtle)' }}>
              {selectedTour ? 'Lodge bookings' : 'Pick a tour first'}
            </div>
            {tourBookings.map(bk => {
              // Lodge_Name may be a lookup object or a string
              const lodgeName = (typeof bk.Lodge_Name === 'object' ? bk.Lodge_Name?.name : bk.Lodge_Name) || ''
              const recordName = bk.Name?.split(' - ')[0] || ''
              // Show lodge name; if record name is different and meaningful, show it as subtitle
              const displayName = lodgeName || recordName || '(unnamed)'
              const subtitle = lodgeName && recordName && recordName !== lodgeName ? recordName : null
              const dayDesc = bk.Day_Description || ''
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
                  <div style={{ fontWeight: 500 }}>{displayName}</div>
                  {subtitle && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{subtitle}</div>}
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                    {dayDesc ? dayDesc.replace(/^Day \d+[^:]*: /, '') + ' · ' : ''}{fmtDate(bk.Check_in_Date)} → {fmtDate(bk.Check_out_Date)}
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

function GroupHeader({ label, count, collapsed, onToggle }) {
  return (
    <button
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', padding: '8px 12px', border: 'none',
        background: 'var(--bg-secondary)', cursor: 'pointer',
        fontSize: 11, fontWeight: 500, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: 0.5,
        borderBottom: '0.5px solid var(--border-subtle)',
      }}
    >
      <span>{label} ({count})</span>
      <span style={{ fontSize: 10 }}>{collapsed ? '▸' : '▾'}</span>
    </button>
  )
}

function TourButton({ tour, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '8px 12px', fontSize: 12,
        border: 'none', background: selected ? 'var(--blue-bg)' : 'transparent',
        color: selected ? 'var(--blue-text)' : 'var(--text-primary)',
        cursor: 'pointer',
        borderBottom: '0.5px solid var(--border-subtle)',
      }}
    >
      {tour.name}
    </button>
  )
}
