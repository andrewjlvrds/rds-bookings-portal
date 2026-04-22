import React, { useState, useEffect, useMemo } from 'react'
import { fmtDateFull } from '../utils/helpers'
import { categorizeTours } from './Layout'
import { getTourReadiness } from '../utils/guestReadiness'

export default function GuestDashboard({ tours, onSelectView, onSelectTour }) {
  const [guests, setGuests] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/guests')
      .then(r => r.json())
      .then(d => {
        setGuests((d.guests || []).filter(g => g.status !== 'Cancelled' && g.status !== 'Refunded'))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const { yearGroups, years } = categorizeTours(tours)
  const committedTours = years.flatMap(y => yearGroups[y])

  // Build tour → guests map
  const tourGuestMap = useMemo(() => {
    const map = {}
    guests.forEach(g => {
      const name = g.tour_name || 'Unassigned'
      if (!map[name]) map[name] = []
      map[name].push(g)
    })
    return map
  }, [guests])

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Guest Bookings</h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {committedTours.length} active tour{committedTours.length !== 1 ? 's' : ''}
          {!loading && guests.length > 0 ? ' · ' + guests.length + ' guest' + (guests.length !== 1 ? 's' : '') : ''}
        </p>
      </div>

      {/* Tour cards with readiness */}
      {years.map(year => (
        <div key={year} style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 500, marginBottom: 10 }}>{year} Tours</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {yearGroups[year].map(tour => {
              const tGuests = tourGuestMap[tour.name] || []
              const readiness = tGuests.length > 0 ? getTourReadiness(tGuests) : null
              return (
                <TourCard
                  key={tour.id}
                  tour={tour}
                  guestCount={tGuests.length}
                  readiness={readiness}
                  onClick={() => onSelectTour(tour)}
                />
              )
            })}
          </div>
        </div>
      ))}

      {committedTours.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)' }}>
          No committed tours to display. Create tours in the Tour Planner tab.
        </div>
      )}
    </div>
  )
}

function TourCard({ tour, guestCount, readiness, onClick }) {
  const pct = readiness ? readiness.pct : 0
  const barColor = pct >= 80 ? '#2E7D32' : pct >= 50 ? '#F57F17' : pct > 0 ? '#E65100' : '#DDD'

  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        border: '0.5px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)', padding: '14px 16px',
        background: 'var(--bg-primary)',
        cursor: 'pointer', transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)' }}
    >
      <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 4 }}>{tour.name}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
        {tour.departure_date ? fmtDateFull(tour.departure_date) : 'No dates'}
        {guestCount > 0 ? ' · ' + guestCount + ' guest' + (guestCount !== 1 ? 's' : '') : ''}
      </div>
      {readiness && guestCount > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Readiness</span>
            <span style={{ fontSize: 11, fontWeight: 500, color: barColor }}>{pct}%</span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: '#ECEFF1', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: pct + '%', background: barColor, borderRadius: 2, transition: 'width 0.3s' }} />
          </div>
          {readiness.actionItems > 0 && (
            <div style={{ fontSize: 10, color: '#E65100', marginTop: 4 }}>
              {readiness.actionItems} action{readiness.actionItems !== 1 ? 's' : ''} needed
            </div>
          )}
        </div>
      )}
    </button>
  )
}

