import React from 'react'

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

      {/* Tour list */}
      <div style={{
        borderTop: '0.5px solid var(--border-default)',
        padding: '8px 0',
        flex: 1,
      }}>
        <div style={{
          padding: '8px 20px 6px',
          fontSize: 11,
          fontWeight: 500,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}>
          Tours
        </div>

        {(tours || []).map(tour => (
          <TourItem
            key={tour.id}
            tour={tour}
            active={activeTour && activeTour.id === tour.id}
            onClick={() => { onSelectTour(tour); onSelectView('itinerary') }}
          />
        ))}
      </div>
    </nav>
  )
}

function NavItem({ label, active, onClick, count }) {
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
      {count !== undefined && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{count}</span>
      )}
    </button>
  )
}

function TourItem({ tour, active, onClick }) {
  const confirmed = (tour.bookings || []).filter(b => {
    const status = b['Booking Status'] || b.Booking_Status || ''
    return ['Balance Paid', 'Deposit Paid', 'Confirmed'].includes(status)
  }).length
  const total = (tour.bookings || []).length

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
        color: active ? 'var(--blue-text)' : 'var(--text-primary)',
        alignItems: 'center',
        justifyContent: 'space-between',
        transition: 'background 0.1s',
        borderRadius: 0,
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
