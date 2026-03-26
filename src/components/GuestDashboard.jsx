import React, { useState, useEffect } from 'react'
import { fmtDateFull } from '../utils/helpers'
import { categorizeTours } from './Layout'

export default function GuestDashboard({ tours, onSelectView, onSelectTour }) {
  const [guestCount, setGuestCount] = useState(null)

  useEffect(() => {
    fetch('/api/guests')
      .then(r => r.json())
      .then(d => {
        const guests = (d.guests || []).filter(g => g.status !== 'Cancelled' && g.status !== 'Refunded')
        setGuestCount(guests.length)
      })
      .catch(() => {})
  }, [])

  const { yearGroups, years } = categorizeTours(tours)
  const committedTours = years.flatMap(y => yearGroups[y])

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Guest Bookings</h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {committedTours.length} active tour{committedTours.length !== 1 ? 's' : ''}
          {guestCount !== null ? ' · ' + guestCount + ' guest' + (guestCount !== 1 ? 's' : '') : ''}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 28 }}>
        <NavPanel
          title="Transfers"
          desc="Flights, airport transfers, Capey"
          detail="Track arrival and departure logistics"
          color="#E65100"
          bg="#FFF3E0"
          onClick={() => onSelectView('transfers')}
        />
        <NavPanel
          title="Excursions"
          desc="Add-on activities"
          detail="Okavango, game drives, Zambezi cruise"
          color="#6A1B9A"
          bg="#F3E5F5"
          onClick={() => onSelectView('guest-excursions')}
        />
        <NavPanel
          title="Accommodation"
          desc="Pre & post tour stays"
          detail="Who needs it, what's booked"
          color="#1565C0"
          bg="#E3F2FD"
          onClick={() => onSelectView('guest-accommodation')}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 28 }}>
        <NavPanel
          title="Payments"
          desc="Guest payment tracking"
          detail="Deposits, balances, due dates"
          color="#2E7D32"
          bg="#E8F5E9"
          onClick={() => onSelectView('guest-payments')}
        />
        <NavPanel
          title="Bikes & gear"
          desc="Motorcycle allocation"
          detail="Preferences, upgrades, accessories"
          color="#00695C"
          bg="#E0F2F1"
          onClick={() => onSelectView('guest-bikes')}
        />
      </div>

      {years.map(year => (
        <div key={year} style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 500, marginBottom: 10 }}>{year} Tours</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {yearGroups[year].map(tour => (
              <TourCard key={tour.id} tour={tour} onClick={() => onSelectTour(tour)} />
            ))}
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

function TourCard({ tour, onClick }) {
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
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        {tour.departure_date ? fmtDateFull(tour.departure_date) : 'No dates'}
        {tour.num_riders ? ' · ' + tour.num_riders + ' riders' : ''}
      </div>
    </button>
  )
}

function NavPanel({ title, desc, detail, color, bg, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '16px', borderRadius: 'var(--radius-lg)',
        border: '0.5px solid var(--border-default)',
        background: 'var(--bg-primary)',
        cursor: 'pointer', transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ fontWeight: 500, fontSize: 14 }}>{title}</span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2 }}>{desc}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{detail}</div>
    </button>
  )
}
