import React, { useState, useEffect } from 'react'
import Itinerary from './Itinerary'
import Payments from './Payments'
import TourCorrespondence from './TourCorrespondence'
import { fmtDateFull } from '../utils/helpers'

/*
 * TourPanel wraps the three tour-level sub-views:
 *   - Itinerary (default)
 *   - Correspondence
 *   - Payments
 *
 * It preserves all props that used to be passed straight to Itinerary,
 * and uses local state for activeTab so the sub-tab choice survives
 * between renders but resets when you navigate to a different tour.
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
  const [activeTab, setActiveTab] = useState(initialTab || 'itinerary')

  // If the caller passes a new initialTab (e.g. "Back" from LodgeDetail
  // restores the tab you came from), honour it.
  useEffect(() => {
    if (initialTab && initialTab !== activeTab) setActiveTab(initialTab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab, tour && tour.id])

  const bookings = (tour && tour.bookings) || []
  const newReplyCount = bookings.filter(b => b && b.New_Reply === true).length

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
      }}>
        <TabBtn label="Itinerary" active={activeTab === 'itinerary'} onClick={() => setActiveTab('itinerary')} />
        <TabBtn
          label="Correspondence"
          active={activeTab === 'correspondence'}
          onClick={() => setActiveTab('correspondence')}
          badge={newReplyCount}
        />
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

      {activeTab === 'correspondence' && (
        <TourCorrespondence
          tour={tour}
          lodges={lodges}
          onSelectBooking={(bk) => onSelectBooking(bk, 'correspondence')}
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

function TabBtn({ label, active, onClick, badge }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '9px 16px', fontSize: 13, fontWeight: 500,
        background: 'none', border: 'none', cursor: 'pointer',
        color: active ? 'var(--blue-text)' : 'var(--text-muted)',
        borderBottom: active ? '2px solid var(--blue-mid)' : '2px solid transparent',
        marginBottom: -0.5,
        display: 'flex', alignItems: 'center', gap: 6,
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text-primary)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--text-muted)' }}
    >
      <span>{label}</span>
      {badge > 0 && (
        <span style={{
          fontSize: 10, fontWeight: 600,
          background: '#C62828', color: '#fff',
          padding: '1px 6px', borderRadius: 9, lineHeight: 1.3,
          minWidth: 18, textAlign: 'center',
        }}>
          {badge}
        </span>
      )}
    </button>
  )
}
