import React, { useState } from 'react'
import { getStatus, isConfirmed } from '../utils/helpers'

// Categorise tours into groups based on departure dates
// New build: departing Nov 2026 onwards (our active build targets)
// Upcoming: departing before Nov 2026, not yet completed
// Past: completed tours
function categorizeTours(tours) {
  const NEW_BUILD_CUTOFF = '2026-11-01'
  const today = new Date().toISOString().split('T')[0]
  const newBuild = []
  const upcoming = []
  const past = []

  ;(tours || []).forEach(tour => {
    if (tour.id === 'unassigned') {
      past.push(tour)
      return
    }

    const startDate = tour.start_date || ''
    const endDate = tour.end_date || ''

    // No bookings at all — definitely a new build
    if (!startDate) {
      newBuild.push(tour)
      return
    }

    // New build: departure date on or after Nov 2026
    if (startDate >= NEW_BUILD_CUTOFF) {
      newBuild.push(tour)
      return
    }

    // Past: end date before today
    if (endDate && endDate < today) {
      past.push(tour)
      return
    }

    // Everything else is upcoming
    upcoming.push(tour)
  })

  // Sort new build and upcoming by start date ascending
  const byDate = (a, b) => (a.start_date || '').localeCompare(b.start_date || '')
  newBuild.sort(byDate)
  upcoming.sort(byDate)
  // Past by start date descending (most recent first)
  past.sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''))

  return { newBuild, upcoming, past }
}

export default function Layout({ tours, activeTour, onSelectTour, activeView, onSelectView, children }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar
        tours={tours}
        activeTour={activeTour}
        onSelectTour={onSelectTour}
        activeView={activeView}
        onSelectView={onSelectView}
      />
      <main style={{ flex: 1, padding: '24px 32px', overflow: 'auto', minWidth: 0 }}>
        {children}
      </main>
    </div>
  )
}

function Sidebar({ tours, activeTour, onSelectTour, activeView, onSelectView }) {
  const [showUpcoming, setShowUpcoming] = useState(false)
  const [showPast, setShowPast] = useState(false)
  const { newBuild, upcoming, past } = categorizeTours(tours)

  return (
    <nav style={{
      width: 260,
      flexShrink: 0,
      background: 'var(--bg-primary)',
      borderRight: '0.5px solid var(--border-default)',
      height: '100vh',
      overflow: 'auto',
      position: 'sticky',
      top: 0,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Logo / Title */}
      <button
        onClick={() => { onSelectTour(null); onSelectView('dashboard') }}
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'left',
          padding: '18px 20px',
          background: 'transparent',
          border: 'none',
          borderBottom: '0.5px solid var(--border-default)',
          fontSize: 15,
          fontWeight: 500,
          color: 'var(--text-primary)',
          letterSpacing: -0.3,
        }}
      >
        RDS Lodge Bookings
      </button>

      {/* Navigation items */}
      <div style={{ padding: '8px 0' }}>
        <NavItem
          label="Dashboard"
          active={activeView === 'dashboard' && !activeTour}
          onClick={() => { onSelectTour(null); onSelectView('dashboard') }}
        />
        <NavItem
          label="Payments"
          active={activeView === 'payments' && !activeTour}
          onClick={() => { onSelectTour(null); onSelectView('payments') }}
        />
      </div>

      {/* New build tours */}
      {newBuild.length > 0 && (
        <TourGroup
          label="New tours"
          tours={newBuild}
          activeTour={activeTour}
          onSelectTour={onSelectTour}
          onSelectView={onSelectView}
        />
      )}

      {/* Upcoming tours with activity — collapsed by default */}
      {upcoming.length > 0 && (
        <div style={{ borderTop: '0.5px solid var(--border-default)' }}>
          <button
            onClick={() => setShowUpcoming(!showUpcoming)}
            style={{
              display: 'flex',
              width: '100%',
              textAlign: 'left',
              padding: '8px 20px 6px',
              background: 'transparent',
              border: 'none',
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
            }}
          >
            <span>Upcoming ({upcoming.length})</span>
            <span style={{
              fontSize: 10,
              transition: 'transform 0.15s',
              transform: showUpcoming ? 'rotate(180deg)' : 'rotate(0deg)',
              display: 'inline-block',
            }}>▾</span>
          </button>

          {showUpcoming && upcoming.map(tour => (
            <TourItem
              key={tour.id}
              tour={tour}
              active={activeTour && activeTour.id === tour.id}
              onClick={() => { onSelectTour(tour); onSelectView('itinerary') }}
            />
          ))}
        </div>
      )}

      {/* Past tours — collapsed by default */}
      {past.length > 0 && (
        <div style={{ borderTop: '0.5px solid var(--border-default)' }}>
          <button
            onClick={() => setShowPast(!showPast)}
            style={{
              display: 'flex',
              width: '100%',
              textAlign: 'left',
              padding: '8px 20px 6px',
              background: 'transparent',
              border: 'none',
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
            }}
          >
            <span>Past tours ({past.length})</span>
            <span style={{
              fontSize: 10,
              transition: 'transform 0.15s',
              transform: showPast ? 'rotate(180deg)' : 'rotate(0deg)',
              display: 'inline-block',
            }}>▾</span>
          </button>

          {showPast && past.map(tour => (
            <TourItem
              key={tour.id}
              tour={tour}
              active={activeTour && activeTour.id === tour.id}
              onClick={() => { onSelectTour(tour); onSelectView('itinerary') }}
              dimmed
            />
          ))}
        </div>
      )}
    </nav>
  )
}

function TourGroup({ label, tours, activeTour, onSelectTour, onSelectView }) {
  return (
    <div style={{ borderTop: '0.5px solid var(--border-default)', padding: '4px 0' }}>
      <div style={{
        padding: '8px 20px 6px',
        fontSize: 11,
        fontWeight: 500,
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}>
        {label}
      </div>

      {tours.map(tour => (
        <TourItem
          key={tour.id}
          tour={tour}
          active={activeTour && activeTour.id === tour.id}
          onClick={() => { onSelectTour(tour); onSelectView('itinerary') }}
        />
      ))}
    </div>
  )
}

function NavItem({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        width: '100%',
        textAlign: 'left',
        padding: '8px 20px',
        background: active ? 'var(--blue-bg)' : 'transparent',
        border: 'none',
        fontSize: 13,
        fontWeight: 500,
        color: active ? 'var(--blue-text)' : 'var(--text-secondary)',
        alignItems: 'center',
        justifyContent: 'space-between',
        transition: 'background 0.1s',
        borderRadius: 0,
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-secondary)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      <span>{label}</span>
    </button>
  )
}

function TourItem({ tour, active, onClick, dimmed }) {
  const bookings = tour.bookings || []
  const confirmed = bookings.filter(b => isConfirmed(b)).length
  const total = bookings.length

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        width: '100%',
        textAlign: 'left',
        padding: '8px 20px',
        background: active ? 'var(--blue-bg)' : 'transparent',
        border: 'none',
        fontSize: 13,
        fontWeight: active ? 500 : 400,
        color: active ? 'var(--blue-text)' : dimmed ? 'var(--text-muted)' : 'var(--text-primary)',
        alignItems: 'center',
        justifyContent: 'space-between',
        transition: 'background 0.1s',
        borderRadius: 0,
        opacity: dimmed ? 0.7 : 1,
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-secondary)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {tour.name}
      </span>
      <span style={{
        fontSize: 11,
        color: 'var(--text-muted)',
        fontVariantNumeric: 'tabular-nums',
        flexShrink: 0,
        marginLeft: 8,
      }}>
        {confirmed}/{total}
      </span>
    </button>
  )
}

// Export categorize function so Dashboard can use it too
export { categorizeTours }
