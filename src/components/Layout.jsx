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

const LODGE_VIEWS = ['dashboard', 'itinerary', 'edit-itinerary', 'enquiry-preview', 'lodge-detail', 'payments', 'correspondence', 'lodges']
const GUEST_VIEWS = ['guest-dashboard', 'guest-tour', 'guest-detail', 'transfers', 'guest-excursions', 'guest-accommodation', 'guest-payments', 'guest-bikes']

function getSection(activeView) {
  if (GUEST_VIEWS.includes(activeView)) return 'guests'
  if (LODGE_VIEWS.includes(activeView)) return 'lodges'
  return null
}

export default function Layout({ tours, activeTour, onSelectTour, activeView, onSelectView, onCreateTour, children }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar
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
  )
}

function Sidebar({ tours, activeTour, onSelectTour, activeView, onSelectView, onCreateTour }) {
  const currentSection = getSection(activeView)
  const [lodgeExpanded, setLodgeExpanded] = useState(currentSection === 'lodges' || !currentSection)
  const [guestExpanded, setGuestExpanded] = useState(currentSection === 'guests')

  // Keep sections in sync when views change
  const handleLodgeToggle = () => {
    if (!lodgeExpanded) {
      setLodgeExpanded(true)
      setGuestExpanded(false)
      onSelectTour(null)
      onSelectView('dashboard')
    } else {
      setLodgeExpanded(false)
    }
  }

  const handleGuestToggle = () => {
    if (!guestExpanded) {
      setGuestExpanded(true)
      setLodgeExpanded(false)
      onSelectTour(null)
      onSelectView('guest-dashboard')
    } else {
      setGuestExpanded(false)
    }
  }

  return (
    <nav style={{
      width: 260, flexShrink: 0, background: 'var(--bg-primary)',
      borderRight: '0.5px solid var(--border-default)', height: '100vh',
      position: 'sticky', top: 0,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* ═══ FIXED HEADER ZONE ═══ */}
      <div style={{ flexShrink: 0 }}>
        {/* Portal title */}
        <button
          onClick={() => { onSelectTour(null); onSelectView('dashboard'); setLodgeExpanded(true); setGuestExpanded(false) }}
          style={{
            display: 'block', width: '100%', textAlign: 'left', padding: '18px 20px',
            background: 'var(--bg-primary)', border: 'none',
            borderBottom: '0.5px solid var(--border-default)',
            fontSize: 15, fontWeight: 500, color: 'var(--text-primary)', letterSpacing: -0.3,
          }}
        >
          RDS Portal
        </button>

        {/* Section headers — always visible */}
        <SectionHeader label="Lodge bookings" expanded={lodgeExpanded} active={currentSection === 'lodges'} onClick={handleLodgeToggle} />
        <SectionHeader label="Guest bookings" expanded={guestExpanded} active={currentSection === 'guests'} onClick={handleGuestToggle} />
      </div>

      {/* ═══ SCROLLABLE CONTENT ZONE ═══ */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* Lodge bookings content */}
        {lodgeExpanded && (
          <SectionContent
            subItems={[
              { label: 'Payments', view: 'payments' },
              { label: 'Correspondence', view: 'correspondence' },
              { label: 'Lodges', view: 'lodges' },
            ]}
            activeView={activeView}
            onSelectView={(v) => { onSelectTour(null); onSelectView(v) }}
            tours={tours}
            activeTour={activeTour}
            onTourClick={(tour) => { onSelectTour(tour); onSelectView('itinerary') }}
            onCreateTour={onCreateTour}
          />
        )}

        {/* Guest bookings content */}
        {guestExpanded && (
          <SectionContent
            subItems={[
              { label: 'Transfers', view: 'transfers' },
              { label: 'Excursions', view: 'guest-excursions' },
              { label: 'Accommodation', view: 'guest-accommodation' },
              { label: 'Payments', view: 'guest-payments' },
              { label: 'Bikes & gear', view: 'guest-bikes' },
            ]}
            activeView={activeView}
            onSelectView={(v) => { onSelectTour(null); onSelectView(v) }}
            tours={tours}
            activeTour={activeTour}
            onTourClick={(tour) => { onSelectTour(tour); onSelectView('guest-tour') }}
          />
        )}
      </div>

      {/* Bottom */}
      <div style={{ flexShrink: 0, borderTop: '0.5px solid var(--border-default)', padding: '8px 0' }}>
        <NavItem label="Getting started" active={activeView === 'getting-started'} onClick={() => { onSelectTour(null); onSelectView('getting-started') }} />
      </div>
    </nav>
  )
}


function SectionHeader({ label, expanded, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', width: '100%', textAlign: 'left',
        padding: '10px 20px 8px', background: 'var(--bg-primary)', border: 'none',
        borderBottom: '0.5px solid var(--border-default)',
        fontSize: 11, fontWeight: 600, color: active ? 'var(--blue-text)' : 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: 0.5,
        cursor: 'pointer', alignItems: 'center', justifyContent: 'space-between',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text-primary)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.color = active ? 'var(--blue-text)' : 'var(--text-muted)' }}
    >
      <span>{label}</span>
      <span style={{
        fontSize: 10, transition: 'transform 0.15s',
        transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
        display: 'inline-block',
      }}>▾</span>
    </button>
  )
}

function SectionContent({ subItems, activeView, onSelectView, tours, activeTour, onTourClick, onCreateTour }) {
  return (
    <>
      <div style={{ padding: '4px 0' }}>
        {subItems.map(item => (
          <NavItem key={item.view} label={item.label} active={activeView === item.view}
            onClick={() => onSelectView(item.view)} indent />
        ))}
      </div>
      <TourList
        tours={tours}
        activeTour={activeTour}
        onTourClick={onTourClick}
        onCreateTour={onCreateTour}
      />
    </>
  )
}


function TourList({ tours, activeTour, onTourClick, onCreateTour }) {
  const [showPast, setShowPast] = useState(false)
  const [collapsedYears, setCollapsedYears] = useState({})
  const { newBuild, drafts, yearGroups, years, past } = categorizeTours(tours)

  const toggleYear = (year) => {
    setCollapsedYears(prev => ({ ...prev, [year]: !prev[year] }))
  }

  return (
    <>
      {/* New & draft tours */}
      <TourGroup
        label="New tours"
        tours={[...newBuild, ...drafts]}
        activeTour={activeTour}
        onTourClick={onTourClick}
        onAdd={onCreateTour || null}
        drafts={drafts}
      />

      {/* Year groups */}
      {years.map(year => (
        <div key={year} style={{ borderTop: '0.5px solid var(--border-default)' }}>
          <button
            onClick={() => toggleYear(year)}
            style={{
              display: 'flex', width: '100%', textAlign: 'left',
              padding: '8px 20px 6px', background: 'transparent', border: 'none',
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

      {/* Past tours */}
      {past.length > 0 && (
        <div style={{ borderTop: '0.5px solid var(--border-default)' }}>
          <button
            onClick={() => setShowPast(!showPast)}
            style={{
              display: 'flex', width: '100%', textAlign: 'left',
              padding: '8px 20px 6px', background: 'transparent', border: 'none',
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
    </>
  )
}


function NavItem({ label, active, onClick, indent }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', width: '100%', textAlign: 'left',
        padding: indent ? '6px 20px 6px 32px' : '8px 20px',
        background: active ? 'var(--blue-bg)' : 'transparent',
        border: 'none', fontSize: 13, fontWeight: 500,
        color: active ? 'var(--blue-text)' : 'var(--text-secondary)',
        alignItems: 'center', justifyContent: 'space-between',
        transition: 'background 0.1s', borderRadius: 0,
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
        padding: '8px 20px 6px', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)',
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
        <div style={{ padding: '4px 20px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="Tour name (e.g. FoSA Sep 27)"
            style={{ width: '100%', fontSize: 12, padding: '5px 8px', border: '0.5px solid var(--border-default)', borderRadius: 4, outline: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
            autoFocus />
          <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
            style={{ width: '100%', fontSize: 12, padding: '5px 8px', border: '0.5px solid var(--border-default)', borderRadius: 4, outline: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
          <select value={newType} onChange={e => setNewType(e.target.value)}
            style={{ width: '100%', fontSize: 12, padding: '5px 8px', border: '0.5px solid var(--border-default)', borderRadius: 4, outline: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
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
        display: 'flex', width: '100%', textAlign: 'left', padding: '8px 20px',
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
