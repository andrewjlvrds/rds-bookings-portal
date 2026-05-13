import React from 'react'
import { fmtDateFull } from '../utils/helpers'
import { categorizeTours } from './Layout'

const MONTH = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function fmtShort(d) {
  if (!d) return ''
  var p = d.split('-')
  return p[2].replace(/^0/,'') + ' ' + MONTH[parseInt(p[1])-1]
}

function StatusBadge({ status }) {
  var cfg = {
    'Confirmed':   { bg: '#e8f5e9', color: '#2e7d32', label: 'Confirmed' },
    'Provisional': { bg: '#fff8e1', color: '#e65100', label: 'Provisional' },
    'Cancelled':   { bg: '#fce4ec', color: '#c62828', label: 'Cancelled' },
  }[status] || { bg: '#f5f5f5', color: '#666', label: status || 'Unknown' }
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
      background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  )
}

function TourCard({ tour, onClick, isDraft }) {
  const hasDraftItinerary = React.useMemo(() => {
    try {
      const raw = localStorage.getItem('itinerary_draft_' + tour.id)
      return !!(raw && JSON.parse(raw).length > 0)
    } catch (e) { return false }
  }, [tour.id])

  const start = tour.departure_date || tour.start_date
  const end   = tour.end_date
  const dateStr = start
    ? (end && end.substring(5,7) !== (start||'').substring(5,7)
        ? fmtShort(start) + ' – ' + fmtShort(end)
        : fmtShort(start) + (end ? ' – ' + end.split('-')[2].replace(/^0/,'') + ' ' + MONTH[parseInt(end.split('-')[1])-1] : ''))
    : 'No date'

  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        border: '0.5px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)', padding: '14px 16px',
        background: 'var(--bg-secondary)',
        cursor: 'pointer', transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
        <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{tour.name}</span>
        {isDraft
          ? <span style={{ fontSize: 10, color: '#e65100', fontWeight: 500, background: '#FFF3E0', padding: '1px 6px', borderRadius: 4 }}>local draft</span>
          : <StatusBadge status={tour.tour_status} />
        }
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <span>{dateStr}</span>
        {tour.tour_type && <span>· {tour.tour_type}</span>}
        {hasDraftItinerary && <span style={{ color: 'var(--blue-mid)' }}>· draft itinerary</span>}
        {!isDraft && tour.bookings && <span>· {tour.bookings.length} booked</span>}
      </div>
    </button>
  )
}

function Section({ title, tours, onSelectTour, onSelectView, isDraft, extra }) {
  if (!tours || tours.length === 0) return null
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{title}</h2>
        {extra}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
        {tours.map(tour => (
          <TourCard
            key={tour.id}
            tour={tour}
            isDraft={isDraft}
            onClick={() => { onSelectTour(tour); onSelectView('itinerary') }}
          />
        ))}
      </div>
    </div>
  )
}

export default function PlannerDashboard({ tours, onSelectTour, onSelectView }) {
  const { newBuild, drafts, yearGroups, years } = categorizeTours(tours)

  // Confirmed Zoho tours across all years
  const confirmedTours = years.flatMap(y => yearGroups[y] || [])
    .filter(t => t.tour_status !== 'Cancelled')
    .sort((a, b) => (a.departure_date || '').localeCompare(b.departure_date || ''))

  const newTourBtn = (
    <button
      onClick={() => onSelectView('new-tour')}
      style={{ fontSize: 13, padding: '6px 12px', fontWeight: 500,
        border: 'none', borderRadius: 6, cursor: 'pointer',
        background: 'var(--blue-mid)', color: '#fff' }}>
      + New tour
    </button>
  )

  const hasDrafts = newBuild.length > 0 || drafts.length > 0

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Tour Planner</h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Select a confirmed tour to build its itinerary, or create a new draft.
        </p>
      </div>

      {/* Confirmed Zoho tours */}
      {confirmedTours.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Confirmed tours</h2>
            {!hasDrafts && newTourBtn}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
            {confirmedTours.map(tour => (
              <TourCard
                key={tour.id}
                tour={tour}
                isDraft={false}
                onClick={() => { onSelectTour(tour); onSelectView('itinerary') }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Draft / local tours */}
      {hasDrafts && (
        <Section
          title="Draft tours"
          tours={[...newBuild, ...drafts]}
          onSelectTour={onSelectTour}
          onSelectView={onSelectView}
          isDraft={true}
          extra={newTourBtn}
        />
      )}

      {/* Empty state */}
      {confirmedTours.length === 0 && !hasDrafts && (
        <div style={{ padding: '40px 20px', textAlign: 'center',
          background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', marginBottom: 24 }}>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 14 }}>
            No tours yet. Create a new tour or promote one from the Client Ops calendar.
          </div>
          {newTourBtn}
        </div>
      )}
    </div>
  )
}
