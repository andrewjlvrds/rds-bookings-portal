import React, { useState, useEffect, useRef } from 'react'
import Itinerary from './Itinerary'
import Payments from './Payments'
import { fmtDateFull } from '../utils/helpers'
import { fmtDate } from '../utils/helpers'

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
  tours,
  initialTab,
  onSelectBooking,
  onEditItinerary,
  onDeleteTour,
  onEnquireReady,
  onDateChangeEmails,
  onRefresh,
  onBack,
  onUpdateTour,
}) {
  const VALID_TABS = ['correspondence', 'itinerary', 'payments']
  const safeInitial = VALID_TABS.indexOf(initialTab) >= 0 ? initialTab : 'itinerary'
  const [activeTab, setActiveTab] = useState(safeInitial)
  const [showReplyList, setShowReplyList] = useState(false)
  const replyDropRef = useRef(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!showReplyList) return
    const handler = (e) => { if (replyDropRef.current && !replyDropRef.current.contains(e.target)) setShowReplyList(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showReplyList])

  // If the caller passes a new initialTab (e.g. "Back" from LodgeDetail
  // restores the tab you came from), honour it — but only if it's valid.
  useEffect(() => {
    const next = VALID_TABS.indexOf(initialTab) >= 0 ? initialTab : 'itinerary'
    if (next !== activeTab) setActiveTab(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab, tour && tour.id])

  const bookings = (tour && tour.bookings) || []
  const replyBookings = bookings.filter(b => b && b.New_Reply === true)
  const newReplyCount = replyBookings.length

  return (
    <div>
      {/* Breadcrumb */}
      {onBack && (
        <div style={{ marginBottom: 14 }}>
          <button
            onClick={onBack}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 13, color: 'var(--text-muted)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>&#8592;</span>
            Tour Planner
          </button>
          <span style={{ margin: '0 6px', color: 'var(--border-strong)', fontSize: 13 }}>/</span>
          <span style={{ fontSize: 13, color: 'var(--text)' }}>{tour.name}</span>
        </div>
      )}
      {/* Tour header strip */}
      <div style={{ marginBottom: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 500, letterSpacing: -0.2, display: 'flex', alignItems: 'center' }}>
          <input
            type="text"
            defaultValue={tour.name}
            key={tour.id}
            onBlur={e => {
              const newName = e.target.value.trim()
              if (!newName) return
              if (onUpdateTour) onUpdateTour({ name: newName })
              const isLocal = (tour.id || '').startsWith('local_') || tour.local
              if (isLocal) {
                try {
                  const locals = JSON.parse(localStorage.getItem('rds_local_tours') || '[]')
                  localStorage.setItem('rds_local_tours', JSON.stringify(locals.map(t => t.id === tour.id ? { ...t, name: newName } : t)))
                } catch(e) {}
              } else {
                fetch('/api/update-tour', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ tour_id: tour.id, updates: { Name: newName } }),
                }).then(r => r.ok && onRefresh && onRefresh()).catch(() => {})
              }
            }}
            style={{
              fontSize: 18, fontWeight: 500, letterSpacing: -0.2,
              border: 'none', borderBottom: '0.5px solid transparent',
              background: 'transparent', color: 'var(--text-primary)',
              outline: 'none', padding: '0 2px',
              width: Math.max(120, (tour.name || '').length * 11) + 'px',
            }}
            onFocus={e => e.target.style.borderBottomColor = 'var(--border-default)'}
            onBlurCapture={e => e.target.style.borderBottomColor = 'transparent'}
            title="Click to rename tour"
          />
        </h1>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 10 }}>
          {tour.departure_date && (
            <span>
              {(() => {
                const dep = tour.departure_date ? new Date(tour.departure_date) : null
                const end = tour.end_date ? new Date(tour.end_date) : null
                if (!dep) return ''
                const depDay = dep.getUTCDate()
                const endDay = end ? end.getUTCDate() : null
                const month = dep.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })
                const endMonth = end ? end.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }) : null
                const year = dep.getUTCFullYear()
                if (end && endMonth !== month) return depDay + ' ' + month + ' – ' + endDay + ' ' + endMonth + ' ' + year
                if (end) return depDay + '–' + endDay + ' ' + month + ' ' + year
                return depDay + ' ' + month + ' ' + year
              })()}
            </span>
          )}
          {newReplyCount > 0 && (
            <span style={{ position: 'relative' }} ref={replyDropRef}>
              <span
                onClick={() => setShowReplyList(!showReplyList)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: 12, color: '#C62828', fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#C62828' }} />
                {newReplyCount} lodge{newReplyCount !== 1 ? 's' : ''} need{newReplyCount === 1 ? 's' : ''} response
                <span style={{ fontSize: 10, opacity: 0.7 }}>▾</span>
              </span>
              {showReplyList && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, marginTop: 6,
                  background: 'var(--bg-primary)', border: '0.5px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  minWidth: 240, zIndex: 20,
                }}>
                  <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', borderBottom: '0.5px solid var(--border-light)' }}>
                    Lodges awaiting response
                  </div>
                  {replyBookings.map(bk => {
                    const lodge = (bk.Lodge_Name && bk.Lodge_Name.name) || bk.Lodge_Name || bk.Name || ''
                    const checkIn = bk.Check_in_Date || ''
                    const lastResp = bk.Last_Response_Date || ''
                    return (
                      <div
                        key={bk.id || bk['Record Id']}
                        onClick={() => { setShowReplyList(false); onSelectBooking(bk, 'itinerary') }}
                        style={{
                          padding: '8px 12px', cursor: 'pointer', fontSize: 12,
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          borderBottom: '0.5px solid var(--border-light)',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div>
                          <div style={{ fontWeight: 500 }}>{lodge}</div>
                          {checkIn && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>Check-in: {checkIn}</div>}
                        </div>
                        {lastResp && (
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            {lastResp}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 0, marginBottom: 18,
        borderBottom: '0.5px solid var(--border-default)',
      }}>
        <TabBtn label="Correspondence" active={activeTab === 'correspondence'} onClick={() => setActiveTab('correspondence')} />
        <TabBtn label="Itinerary" active={activeTab === 'itinerary'} onClick={() => setActiveTab('itinerary')} />
        <TabBtn label="Payments" active={activeTab === 'payments'} onClick={() => setActiveTab('payments')} />
      </div>

      {/* Active tab content */}
      {activeTab === 'correspondence' && (
        <Itinerary
          tour={tour}
          lodges={lodges}
          tours={tours}
          onSelectBooking={(bk) => onSelectBooking(bk, 'itinerary')}
          onEditItinerary={onEditItinerary}
          onDeleteTour={onDeleteTour}
          onEnquireReady={onEnquireReady}
          onDateChangeEmails={onDateChangeEmails}
          onRefresh={onRefresh}
          initialSubTab="correspondence"
        />
      )}

      {activeTab === 'itinerary' && (
        <Itinerary
          tour={tour}
          lodges={lodges}
          tours={tours}
          onSelectBooking={(bk) => onSelectBooking(bk, 'itinerary')}
          onEditItinerary={onEditItinerary}
          onDeleteTour={onDeleteTour}
          onEnquireReady={onEnquireReady}
          onDateChangeEmails={onDateChangeEmails}
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
