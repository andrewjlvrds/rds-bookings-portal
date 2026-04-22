import React, { useState, useEffect } from 'react'
import Itinerary from './Itinerary'
import Payments from './Payments'
import { fmtDateFull } from '../utils/helpers'

/*
 * TourPanel wraps the two tour-level sub-views:
 *   - Itinerary (default)
 *   - Payments
 *
 * Correspondence is no longer a tour-level tab — it lives inside
 * LodgeDetail as a per-lodge thread, which is where the conversation
 * actually belongs.
 */
export default function TourPanel({
  tour,
  lodges,
  initialTab,
  onSelectBooking,
  onEditItinerary,
  onDeleteTour,
  onEnquireReady,
  onRefresh,
}) {
  const VALID_TABS = ['itinerary', 'payments']
  const safeInitial = VALID_TABS.indexOf(initialTab) >= 0 ? initialTab : 'itinerary'
  const [activeTab, setActiveTab] = useState(safeInitial)

  // If the caller passes a new initialTab (e.g. "Back" from LodgeDetail
  // restores the tab you came from), honour it — but only if it's valid.
  useEffect(() => {
    const next = VALID_TABS.indexOf(initialTab) >= 0 ? initialTab : 'itinerary'
    if (next !== activeTab) setActiveTab(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab, tour && tour.id])

  const bookings = (tour && tour.bookings) || []
  const newReplyCount = bookings.filter(b => b && b.New_Reply === true).length

  return (
    <div>
      {/* Tour header strip */}
      <div style={{ marginBottom: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 500, letterSpacing: -0.2 }}>{tour.name}</h1>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 10 }}>
          {tour.departure_date && (
            <span>
              Departs {fmtDateFull(tour.departure_date)}
              {tour.end_date ? '  ·  returns ' + fmtDateFull(tour.end_date) : ''}
            </span>
          )}
          {newReplyCount > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 12, color: '#C62828', fontWeight: 500,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#C62828' }} />
              {newReplyCount} lodge{newReplyCount !== 1 ? 's' : ''} need{newReplyCount === 1 ? 's' : ''} response
            </span>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 0, marginBottom: 18,
        borderBottom: '0.5px solid var(--border-default)',
      }}>
        <TabBtn label="Itinerary" active={activeTab === 'itinerary'} onClick={() => setActiveTab('itinerary')} />
        <TabBtn label="Payments" active={activeTab === 'payments'} onClick={() => setActiveTab('payments')} />
      </div>

      {/* Active tab content */}
      {activeTab === 'itinerary' && (
        <Itinerary
          tour={tour}
          lodges={lodges}
          onSelectBooking={(bk) => onSelectBooking(bk, 'itinerary')}
          onEditItinerary={onEditItinerary}
          onDeleteTour={onDeleteTour}
          onEnquireReady={onEnquireReady}
          onRefresh={onRefresh}
        />
      )}

      {activeTab === 'payments' && (
        <Payments
          allBookings={bookings}
          tours={[tour]}
          onSelectBooking={(bk) => onSelectBooking(bk, 'payments')}
          onRefresh={onRefresh}
        />
      )}
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
        marginBottom: -0.5,
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text-primary)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--text-muted)' }}
    >
      {label}
    </button>
  )
}
