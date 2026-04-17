import React, { useState } from 'react'
import { isConfirmed } from '../utils/helpers'

function categorizeTours(tours) {
  const today = new Date().toISOString().split('T')[0]
  const newBuild = []
  const drafts = []
  const yearGroups = {}
  const past = []

  ;(tours || []).forEach(tour => {
    if (tour.id === 'unassigned') { past.push(tour); return }
    const isDraft = typeof tour.id === 'string' && tour.id.startsWith('local_')
    if (isDraft) { drafts.push(tour); return }
    const depDate = tour.departure_date || tour.start_date || ''
    if (!depDate) { newBuild.push(tour); return }
    let completionDate = tour.end_date || ''
    if (!completionDate && depDate) {
      const bookingCount = (tour.bookings || []).length
      const estDays = bookingCount > 0 ? bookingCount : 21
      const est = new Date(depDate)
      est.setDate(est.getDate() + estDays)
      completionDate = est.toISOString().split('T')[0]
    }
    if (completionDate && completionDate < today) { past.push(tour); return }
    const year = depDate.substring(0, 4)
    if (!yearGroups[year]) yearGroups[year] = []
    yearGroups[year].push(tour)
  })

  const byDate = (a, b) => (a.start_date || a.departure_date || '').localeCompare(b.start_date || b.departure_date || '')
  newBuild.sort(byDate)
  drafts.sort(byDate)
  Object.keys(yearGroups).forEach(y => yearGroups[y].sort(byDate))
  past.sort((a, b) => (b.start_date || b.departure_date || '').localeCompare(a.start_date || a.departure_date || ''))
  const years = Object.keys(yearGroups).sort()
  return { newBuild, drafts, yearGroups, years, past }
}

const PLANNER_VIEWS = ['dashboard', 'itinerary', 'edit-itinerary', 'enquiry-preview']
const LODGE_VIEWS = ['lodge-dashboard', 'lodge-detail', 'payments', 'correspondence', 'lodges']
const GUEST_VIEWS = ['guest-dashboard', 'guest-tour', 'guest-detail', 'transfers', 'guest-excursions', 'guest-accommodation', 'guest-payments', 'guest-bikes']

function getSection(activeView) {
  if (GUEST_VIEWS.includes(activeView)) return 'guests'
  return 'lodges'
}

const TABS = [
  { id: 'lodges', label: 'Lodge bookings', defaultView: 'lodge-dashboard' },
  { id: 'guests', label: 'Guest bookings', defaultView: 'guest-dashboard' },
]

export default function Layout({ tours, activeTour, onSelectTour, activeView, onSelectView, onCreateTour, children }) {
  const currentSection = getSection(activeView)

  const handleTabClick = (tab) => {
    if (tab.id !== currentSection) {
      onSelectTour(null)
      onSelectView(tab.defaultView)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* ═══ TOP TAB BAR ═══ */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '0 20px',
        borderBottom: '0.5px solid var(--border-default)',
        background: 'var(--bg-primary)', flexShrink: 0,
      }}>
        <span
          onClick={() => { onSelectTour(null); onSelectView('lodge-dashboard') }}
          style={{
            fontSize: 15, fontWeight: 500, padding: '12px 12px 12px 0',
            color: 'var(--text-primary)', letterSpacing: -0.3,
            cursor: 'pointer',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = 0.7}
          onMouseLeave={e => e.currentTarget.style.opacity = 1}
        >
          RDS Portal
        </span>
        <span style={{ width: 0.5, height: 20, background: 'var(--border-default)', margin: '0 8px' }} />
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab)}
            style={{
              padding: '12px 14px', fontSize: 13, fontWeight: 500,
              background: 'none', border: 'none', cursor: 'pointer',
              color: currentSection === tab.id ? 'var(--blue-text)' : 'var(--text-muted)',
              borderBottom: currentSection === tab.id ? '2px solid var(--blue-mid)' : '2px solid transparent',
              marginBottom: -0.5,
            }}
            onMouseEnter={e => { if (currentSection !== tab.id) e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { if (currentSection !== tab.id) e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            {tab.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => { onSelectTour(null); onSelectView('dashboard') }}
          style={{
            padding: '12px 14px', fontSize: 12,
            background: 'none', border: 'none', cursor: 'pointer',
            color: PLANNER_VIEWS.includes(activeView) ? 'var(--text-primary)' : 'var(--text-hint)',
            borderBottom: PLANNER_VIEWS.includes(activeView) ? '2px solid var(--text-muted)' : '2px solid transparent',
            marginBottom: -0.5,
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
          onMouseLeave={e => { if (!PLANNER_VIEWS.includes(activeView)) e.currentTarget.style.color = 'var(--text-hint)' }}
        >
          Tour planner
        </button>
      </div>

      {/* ═══ SIDEBAR + MAIN ═══ */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar
          section={currentSection}
          tours={tours}
          activeTour={activeTour}
          onSelectTour={onSelectTour}
          activeView={activeView}
          onSelectView={onSelectView}
          onCreateTour={onCreateTour}
        />
        <main style={{ flex: 1, padding: '24px 32px', overflow: 'auto', minWidth: 0 }}>
          {children}
        </main>
      </div>
    </div>
  )
}


function Sidebar({ section, tours, activeTour, onSelectTour, activeView, onSelectView, onCreateTour }) {
  // Filter tours for committed-only sections
  const committedTours = (tours || []).filter(t => {
    if (typeof t.id === 'string' && t.id.startsWith('local_')) return false
    if (t.tour_status === 'Draft') return false
    return true
  })

  const tourClickView = section === 'guests' ? 'guest-tour' : 'itinerary'
  const handleTourClick = (tour) => {
    onSelectTour(tour)
    onSelectView(tourClickView)
  }

  return (
    <nav style={{
      width: 240, flexShrink: 0, background: 'var(--bg-primary)',
      borderRight: '0.5px solid var(--border-default)',
      overflow: 'auto', display: 'flex', flexDirection: 'column',
    }}>
      {/* Section-specific sub-nav */}
      {section === 'lodges' && (
        <div style={{ padding: '8px 0', borderBottom: '0.5px solid var(--border-default)' }}>
          <NavItem label="Payments" active={activeView === 'payments'} onClick={() => { onSelectTour(null); onSelectView('payments') }} />
          <NavItem label="Correspondence" active={activeView === 'correspondence'} onClick={() => { onSelectTour(null); onSelectView('correspondence') }} />
          <NavItem label="Lodges" active={activeView === 'lodges'} onClick={() => { onSelectTour(null); onSelectView('lodges') }} />
        </div>
      )}

      {section === 'guests' && (
        <div style={{ padding: '8px 0', borderBottom: '0.5px solid var(--border-default)' }}>
          <NavItem label="Transfers" active={activeView === 'transfers'} onClick={() => { onSelectTour(null); onSelectView('transfers') }} />
          <NavItem label="Excursions" active={activeView === 'guest-excursions'} onClick={() => { onSelectTour(null); onSelectView('guest-excursions') }} />
          <NavItem label="Accommodation" active={activeView === 'guest-accommodation'} onClick={() => { onSelectTour(null); onSelectView('guest-accommodation') }} />
          <NavItem label="Payments" active={activeView === 'guest-payments'} onClick={() => { onSelectTour(null); onSelectView('guest-payments') }} />
          <NavItem label="Bikes & gear" active={activeView === 'guest-bikes'} onClick={() => { onSelectTour(null); onSelectView('guest-bikes') }} />
        </div>
      )}

      {/* Tour list */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <TourList
          tours={section === 'planner' ? tours : committedTours}
          activeTour={activeTour}
          onTourClick={handleTourClick}
          onCreateTour={section === 'planner' ? onCreateTour : null}
          mode={section === 'planner' ? 'planner' : 'committed'}
        />
      </div>

      {/* Bottom */}
      <div style={{ flexShrink: 0, borderTop: '0.5px solid var(--border-default)', padding: '8px 0' }}>
        <NavItem label="Getting started" active={activeView === 'getting-started'} onClick={() => { onSelectTour(null); onSelectView('getting-started') }} />
      </div>
    </nav>
  )
}


function TourList({ tours, activeTour, onTourClick, onCreateTour, mode }) {
  const [showPast, setShowPast] = useState(false)
  const [collapsedYears, setCollapsedYears] = useState({})
  const { newBuild, drafts, yearGroups, years, past } = categorizeTours(tours)

  const toggleYear = (year) => {
    setCollapsedYears(prev => ({ ...prev, [year]: !prev[year] }))
  }

  return (
    <>
      {/* Planner mode: drafts and new tours only */}
      {mode === 'planner' && (
        <TourGroup
          label="Draft tours"
          tours={[...newBuild, ...drafts]}
          activeTour={activeTour}
          onTourClick={onTourClick}
          onAdd={onCreateTour || null}
          drafts={drafts}
        />
      )}

      {/* Committed mode: year groups and past only */}
      {mode === 'committed' && (
        <>
          {years.map(year => (
            <div key={year} style={{ borderTop: '0.5px solid var(--border-default)' }}>
              <button
                onClick={() => toggleYear(year)}
                style={{
                  display: 'flex', width: '100%', textAlign: 'left',
                  padding: '8px 16px 6px', background: 'transparent', border: 'none',
                  fontSize: 11, fontWeight: 500, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: 0.5,
                  justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
                }}
              >
                <span>{year} Tours ({yearGroups[year].length})</span>
                <span style={{ fontSize: 10, transition: 'transform 0.15s', transform: collapsedYears[year] ? 'rotate(0deg)' : 'rotate(180deg)', display: 'inline-block' }}>▾</span>
              </button>
              {!collapsedYears[year] && yearGroups[year].map(tour => (
                <TourItem key={tour.id} tour={tour} active={activeTour && activeTour.id === tour.id} onClick={() => onTourClick(tour)} />
              ))}
            </div>
          ))}

          {past.length > 0 && (
            <div style={{ borderTop: '0.5px solid var(--border-default)' }}>
              <button
                onClick={() => setShowPast(!showPast)}
                style={{
                  display: 'flex', width: '100%', textAlign: 'left',
                  padding: '8px 16px 6px', background: 'transparent', border: 'none',
                  fontSize: 11, fontWeight: 500, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: 0.5,
                  justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
                }}
              >
                <span>Past ({past.length})</span>
                <span style={{ fontSize: 10, transition: 'transform 0.15s', transform: showPast ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block' }}>▾</span>
              </button>
              {showPast && past.map(tour => (
                <TourItem key={tour.id} tour={tour} active={activeTour && activeTour.id === tour.id} onClick={() => onTourClick(tour)} dimmed />
              ))}
            </div>
          )}

          {years.length === 0 && past.length === 0 && (
            <div style={{ padding: '20px 16px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
              No committed tours yet.
            </div>
          )}
        </>
      )}
    </>
  )
}


function NavItem({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', width: '100%', textAlign: 'left',
        padding: '7px 16px',
        background: active ? 'var(--blue-bg)' : 'transparent',
        border: 'none', fontSize: 13, fontWeight: 500,
        color: active ? 'var(--blue-text)' : 'var(--text-secondary)',
        alignItems: 'center', transition: 'background 0.1s', borderRadius: 0,
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-secondary)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      <span>{label}</span>
    </button>
  )
}


function TourGroup({ label, tours, activeTour, onTourClick, onAdd, drafts }) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newType, setNewType] = useState('FoSA 20')
  const [saving, setSaving] = useState(false)

  const handleAdd = async () => {
    if (!newName.trim() || !newDate) return
    setSaving(true)
    try {
      await onAdd({ name: newName.trim(), departure_date: newDate, tour_type: newType })
      setAdding(false)
      setNewName('')
      setNewDate('')
    } catch (err) {
      alert('Error creating tour: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ borderTop: '0.5px solid var(--border-default)', padding: '4px 0' }}>
      <div style={{
        padding: '8px 16px 6px', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex',
        justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>{label}</span>
        {onAdd && (
          <button onClick={() => setAdding(!adding)}
            style={{ background: 'none', border: 'none', fontSize: 14, color: 'var(--text-muted)', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}
            title="Add tour"
          >{adding ? '×' : '+'}</button>
        )}
      </div>

      {adding && (
        <div style={{ padding: '4px 16px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="Tour name (e.g. FoSA Sep 27)"
            style={{ width: '100%', fontSize: 12, padding: '5px 8px', border: '0.5px solid var(--border-default)', borderRadius: 4, outline: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
            autoFocus />
          <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
            style={{ width: '100%', fontSize: 12, padding: '5px 8px', border: '0.5px solid var(--border-default)', borderRadius: 4, outline: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
          <select value={newType} onChange={e => setNewType(e.target.value)}
            style={{ width: '100%', fontSize: 12, padding: '5px 8px', border: '0.5px solid var(--border-default)', borderRadius: 4, outline: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
            <option value="FoSA 21">FoSA 21</option>
            <option value="FoSA 20">FoSA 20</option>
            <option value="FoSA 15">FoSA 15</option>
            <option value="Edge 14">Edge 14</option>
            <option value="Edge 12">Edge 12</option>
            <option value="Custom">Custom</option>
          </select>
          <button onClick={handleAdd} disabled={saving || !newName.trim() || !newDate}
            style={{ fontSize: 12, padding: '5px 12px', fontWeight: 500, border: 'none', borderRadius: 4, cursor: 'pointer', background: 'var(--blue-mid)', color: '#fff', opacity: (!newName.trim() || !newDate || saving) ? 0.5 : 1 }}>
            {saving ? 'Adding...' : 'Add tour'}
          </button>
        </div>
      )}

      {tours.map(tour => {
        const isDraftTour = (drafts || []).some(d => d.id === tour.id)
        return (
          <TourItem key={tour.id} tour={tour} active={activeTour && activeTour.id === tour.id}
            onClick={() => onTourClick(tour)} isDraft={isDraftTour} />
        )
      })}
    </div>
  )
}


function TourItem({ tour, active, onClick, dimmed, isDraft }) {
  const bookings = tour.bookings || []
  const confirmed = bookings.filter(b => isConfirmed(b)).length
  const total = bookings.length

  let hasDraft = false
  try {
    const draft = localStorage.getItem('itinerary_draft_' + tour.id)
    if (draft && JSON.parse(draft).length > 0) hasDraft = true
  } catch (e) {}

  return (
    <button onClick={onClick}
      style={{
        display: 'flex', width: '100%', textAlign: 'left', padding: '8px 16px',
        background: active ? 'var(--blue-bg)' : 'transparent',
        border: 'none', fontSize: 13, fontWeight: active ? 500 : 400,
        color: active ? 'var(--blue-text)' : dimmed ? 'var(--text-muted)' : 'var(--text-primary)',
        alignItems: 'center', justifyContent: 'space-between',
        transition: 'background 0.1s', borderRadius: 0, opacity: dimmed ? 0.7 : 1,
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-secondary)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
        {tour.name}
        {((hasDraft && total === 0) || isDraft) && (
          <span style={{ fontSize: 9, color: 'var(--amber-text)', fontWeight: 500 }}>draft</span>
        )}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0, marginLeft: 8 }}>
        {confirmed}/{total}
      </span>
    </button>
  )
}

export { categorizeTours }
