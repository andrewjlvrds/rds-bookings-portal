import React, { useState, useEffect } from 'react'
import Guests from './Guests'
import { fmtDateFull } from '../utils/helpers'

/*
 * GuestTourPanel — per-tour guest view with category tabs.
 *
 * Tabs:
 *   - Guests (default): full guest list for this tour (readiness table)
 *   - Transfers / Excursions / Accommodation / Payments / Bikes & Gear / Guest Info:
 *     the category slice of Guests, scoped to this tour only
 *
 * Underneath, every tab renders <Guests/> with the right props — Guests
 * already handles filterTour and subView, so this is just a thin wrapper.
 */
export default function GuestTourPanel({ tour, tours, initialTab }) {
  const [activeTab, setActiveTab] = useState(initialTab || 'guests')

  useEffect(() => {
    if (initialTab && initialTab !== activeTab) setActiveTab(initialTab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab, tour && tour.id])

  // subView passed into Guests — 'guests' tab uses no subView (full table)
  const subViewFor = (tab) => (tab === 'guests' ? undefined : tab)

  return (
    <div>
      {/* Tour header strip */}
      <div style={{ marginBottom: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 500, letterSpacing: -0.2 }}>{tour.name}</h1>
        {tour.departure_date && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            Departs {fmtDateFull(tour.departure_date)}
            {tour.end_date ? '  ·  returns ' + fmtDateFull(tour.end_date) : ''}
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 0, marginBottom: 18,
        borderBottom: '0.5px solid var(--border-default)',
        overflowX: 'auto',
      }}>
        <TabBtn label="Guests" active={activeTab === 'guests'} onClick={() => setActiveTab('guests')} />
        <TabBtn label="Transfers" active={activeTab === 'transfers'} onClick={() => setActiveTab('transfers')} />
        <TabBtn label="Excursions" active={activeTab === 'excursions'} onClick={() => setActiveTab('excursions')} />
        <TabBtn label="Accommodation" active={activeTab === 'accommodation'} onClick={() => setActiveTab('accommodation')} />
        <TabBtn label="Payments" active={activeTab === 'payments'} onClick={() => setActiveTab('payments')} />
        <TabBtn label="Bikes & Gear" active={activeTab === 'bikes'} onClick={() => setActiveTab('bikes')} />
        <TabBtn label="Guest Info" active={activeTab === 'info'} onClick={() => setActiveTab('info')} />
      </div>

      {/* Active tab renders Guests scoped to this tour with the right subView */}
      <Guests
        tours={tours}
        filterTour={tour.name}
        subView={subViewFor(activeTab)}
      />
    </div>
  )
}

function TabBtn({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '9px 16px', fontSize: 13, fontWeight: 500,
        background: 'none', border: 'none', cursor: 'pointer',
        color: active ? 'var(--blue-text)' : 'var(--text-muted)',
        borderBottom: active ? '2px solid var(--blue-mid)' : '2px solid transparent',
        marginBottom: -0.5, whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text-primary)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--text-muted)' }}
    >
      {label}
    </button>
  )
}
