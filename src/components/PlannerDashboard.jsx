import React from 'react'
import { fmtDateFull } from '../utils/helpers'
import { categorizeTours } from './Layout'

export default function PlannerDashboard({ tours, onSelectTour, onSelectView }) {
  const { newBuild, drafts } = categorizeTours(tours)
  const allDrafts = [...newBuild, ...drafts]

  const newTourBtnStyle = {
    fontSize: 13, padding: '6px 12px', fontWeight: 500,
    border: 'none', borderRadius: 6, cursor: 'pointer',
    background: 'var(--blue-mid)', color: '#fff',
  }

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Tour Planner</h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Build and edit tour itineraries. Create new tours, assign lodges, configure room requirements, then push to Zoho when ready.
        </p>
      </div>

      {allDrafts.length > 0 ? (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h2 style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>Draft tours</h2>
            <button onClick={() => onSelectView('new-tour')} style={newTourBtnStyle}>
              + New tour
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {allDrafts.map(tour => {
              const isDraft = typeof tour.id === 'string' && tour.id.startsWith('local_')
              let hasDraftItinerary = false
              try {
                const raw = localStorage.getItem('itinerary_draft_' + tour.id)
                if (raw && JSON.parse(raw).length > 0) hasDraftItinerary = true
              } catch (e) {}

              return (
                <button
                  key={tour.id}
                  onClick={() => { onSelectTour(tour); onSelectView('itinerary') }}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 500, fontSize: 14 }}>{tour.name}</span>
                    {isDraft && <span style={{ fontSize: 10, color: 'var(--amber-text)', fontWeight: 500, background: '#FFF3E0', padding: '1px 6px', borderRadius: 4 }}>local draft</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {tour.departure_date ? fmtDateFull(tour.departure_date) : 'No departure date'}
                    {tour.tour_type ? ' · ' + tour.tour_type : ''}
                    {hasDraftItinerary ? ' · has draft itinerary' : ''}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div style={{
          padding: '40px 20px', textAlign: 'center',
          background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)',
          marginBottom: 24,
        }}>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 14 }}>
            No draft tours yet.
          </div>
          <button onClick={() => onSelectView('new-tour')} style={newTourBtnStyle}>
            + New tour
          </button>
        </div>
      )}
    </div>
  )
}
