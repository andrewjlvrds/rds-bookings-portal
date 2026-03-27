import React, { useState, useEffect, useMemo } from 'react'
import { fmtDateFull } from '../utils/helpers'
import { categorizeTours } from './Layout'
import { getTourReadiness, getOutstandingItems, CATEGORIES } from '../utils/guestReadiness'

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

  // Overall outstanding items
  const outstanding = useMemo(() => getOutstandingItems(guests), [guests])
  const actionNeeded = outstanding.filter(i => i.status === 'action_needed')
  const waitingOnGuest = outstanding.filter(i => i.status === 'incomplete')

  // Category summaries for the nav panels
  const catSummaries = useMemo(() => {
    const result = {}
    Object.keys(CATEGORIES).forEach(cat => {
      const items = getOutstandingItems(guests, cat)
      result[cat] = {
        action: items.filter(i => i.status === 'action_needed').length,
        incomplete: items.filter(i => i.status === 'incomplete').length,
        total: items.length,
      }
    })
    return result
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

      {/* Readiness summary bar */}
      {!loading && guests.length > 0 && (
        <div style={{
          display: 'flex', gap: 20, marginBottom: 24, padding: '14px 18px',
          background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)',
          border: '0.5px solid var(--border-default)',
        }}>
          <StatBlock value={guests.length} label="Guests" />
          <StatBlock
            value={actionNeeded.length}
            label="Actions needed"
            color={actionNeeded.length > 0 ? '#E65100' : '#2E7D32'}
          />
          <StatBlock
            value={waitingOnGuest.length}
            label="Waiting on guest"
            color={waitingOnGuest.length > 0 ? '#F57F17' : '#2E7D32'}
          />
        </div>
      )}

      {/* Nav panels with outstanding counts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 14 }}>
        <NavPanel
          title="Transfers"
          desc="Flights, airport transfers, Capey"
          color="#E65100"
          action={catSummaries.transfers?.action || 0}
          waiting={catSummaries.transfers?.incomplete || 0}
          onClick={() => onSelectView('transfers')}
        />
        <NavPanel
          title="Excursions"
          desc="Add-on activities"
          color="#6A1B9A"
          action={catSummaries.excursions?.action || 0}
          waiting={catSummaries.excursions?.incomplete || 0}
          onClick={() => onSelectView('guest-excursions')}
        />
        <NavPanel
          title="Accommodation"
          desc="Pre & post tour stays"
          color="#1565C0"
          action={catSummaries.accommodation?.action || 0}
          waiting={catSummaries.accommodation?.incomplete || 0}
          onClick={() => onSelectView('guest-accommodation')}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 28 }}>
        <NavPanel
          title="Payments"
          desc="Deposits & balances"
          color="#2E7D32"
          action={catSummaries.payments?.action || 0}
          waiting={catSummaries.payments?.incomplete || 0}
          onClick={() => onSelectView('guest-payments')}
        />
        <NavPanel
          title="Bikes & Gear"
          desc="Allocation & accessories"
          color="#00695C"
          action={catSummaries.bikes?.action || 0}
          waiting={catSummaries.bikes?.incomplete || 0}
          onClick={() => onSelectView('guest-bikes')}
        />
        <NavPanel
          title="Guest Info"
          desc="Passports, dietary, insurance"
          color="#546E7A"
          action={(catSummaries.info?.action || 0) + (catSummaries.admin?.action || 0)}
          waiting={(catSummaries.info?.incomplete || 0) + (catSummaries.admin?.incomplete || 0)}
          onClick={() => onSelectView('guest-info')}
        />
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

function StatBlock({ value, label, color }) {
  return (
    <div style={{ minWidth: 80 }}>
      <div style={{ fontSize: 22, fontWeight: 600, color: color || 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{label}</div>
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

function NavPanel({ title, desc, color, action, waiting, onClick }) {
  const total = action + waiting
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
          <span style={{ fontWeight: 500, fontSize: 14 }}>{title}</span>
        </div>
        {total > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '1px 7px',
            borderRadius: 10, background: action > 0 ? '#FFF3E0' : '#FFF8E1',
            color: action > 0 ? '#E65100' : '#F57F17',
          }}>
            {total}
          </span>
        )}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2 }}>{desc}</div>
      {total > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          {action > 0 ? action + ' to action' : ''}
          {action > 0 && waiting > 0 ? ' · ' : ''}
          {waiting > 0 ? waiting + ' waiting on guest' : ''}
        </div>
      )}
      {total === 0 && (
        <div style={{ fontSize: 11, color: '#2E7D32', marginTop: 4 }}>All clear</div>
      )}
    </button>
  )
}
