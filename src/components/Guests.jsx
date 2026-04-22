import React, { useState, useEffect, useMemo } from 'react'
import { fmtDate, fmtDateFull, fmtCurrency } from '../utils/helpers'
import { getGuestReadiness, getGuestChecklist, getTourReadiness, getOutstandingItems, CATEGORIES } from '../utils/guestReadiness'

export default function Guests({ tours, filterTour, subView }) {
  const [guests, setGuests] = useState([])
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState(null)
  const [tourFilter, setTourFilter] = useState(filterTour || 'all')
  const [search, setSearch] = useState('')
  const [selectedGuest, setSelectedGuest] = useState(null)
  const [showPast, setShowPast] = useState(false)

  useEffect(() => {
    fetch('/api/guests')
      .then(r => r.json())
      .then(d => {
        setGuests(d.guests || [])
        if (d.api_error) setApiError(d.api_error)
        setLoading(false)
      })
      .catch(err => { setApiError(err.message); setLoading(false) })
  }, [])

  // Sync filterTour prop
  useEffect(() => {
    if (filterTour) setTourFilter(filterTour)
  }, [filterTour])

  const SUB_VIEW_TITLES = {
    excursions: 'Excursions',
    accommodation: 'Accommodation',
    payments: 'Guest Payments',
    bikes: 'Bikes & Gear',
    info: 'Guest Info & Admin',
  }
  const pageTitle = SUB_VIEW_TITLES[subView] || (filterTour ? filterTour : 'Tour Guests')

  const tourLookup = useMemo(() => {
    const map = {}
    ;(tours || []).forEach(t => { if (t.name) map[t.name] = t })
    return map
  }, [tours])

  const futureTourNames = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    const names = new Set()
    ;(tours || []).forEach(t => {
      const endDate = t.end_date || t.departure_date || ''
      if (!endDate || endDate >= today) { if (t.name) names.add(t.name) }
    })
    return names
  }, [tours])

  const tourGroups = useMemo(() => {
    const groups = {}
    guests.forEach(g => {
      if (g.status === 'Cancelled' || g.status === 'Refunded') return
      const tourName = g.tour_name || 'Unassigned'
      if (search) {
        const q = search.toLowerCase()
        const searchable = [g.name, g.email, g.motorcycle, g.participant_type, g.room_type, tourName].join(' ').toLowerCase()
        if (!searchable.includes(q)) return
      }
      if (tourFilter !== 'all' && tourName !== tourFilter) return
      if (!showPast && futureTourNames.size > 0 && tourName !== 'Unassigned' && !futureTourNames.has(tourName)) return
      if (!groups[tourName]) {
        const pt = tourLookup[tourName]
        groups[tourName] = { name: tourName, departure: pt ? (pt.departure_date || pt.start_date || '') : (g.tour_start || ''), guests: [] }
      }
      groups[tourName].guests.push(g)
    })
    return Object.values(groups).sort((a, b) => {
      if (!a.departure && b.departure) return 1
      if (a.departure && !b.departure) return -1
      return (a.departure || '').localeCompare(b.departure || '')
    })
  }, [guests, tourFilter, search, showPast, futureTourNames, tourLookup])

  const tourNames = useMemo(() => {
    const names = new Set()
    guests.forEach(g => { if (g.tour_name && g.status !== 'Cancelled') names.add(g.tour_name) })
    return Array.from(names).sort()
  }, [guests])

  if (selectedGuest) {
    return <GuestDetail guest={selectedGuest} onBack={() => setSelectedGuest(null)} />
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading guests...</div>
  }

  const totalGuests = tourGroups.reduce((s, g) => s + g.guests.length, 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 500 }}>{pageTitle}</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            {totalGuests} guest{totalGuests !== 1 ? 's' : ''} across {tourGroups.length} tour{tourGroups.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="text" placeholder="Search guests..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ fontSize: 13, padding: '6px 10px', width: 200, border: '0.5px solid var(--border-default)', borderRadius: 6, outline: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
          {!filterTour && (
            <select value={tourFilter} onChange={e => setTourFilter(e.target.value)}
              style={{ fontSize: 13, padding: '6px 10px', border: '0.5px solid var(--border-default)', borderRadius: 6, background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
              <option value="all">All tours</option>
              {tourNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
          <button className="btn" onClick={() => setShowPast(!showPast)} style={{ fontSize: 12 }}>
            {showPast ? 'Hide past' : 'Show past'}
          </button>
        </div>
      </div>

      {apiError && (
        <div style={{ padding: '8px 12px', marginBottom: 12, fontSize: 12, background: '#FFF8E1', border: '0.5px solid #FFD54F', borderRadius: 6, color: '#F57F17' }}>
          {apiError}
        </div>
      )}

      {tourGroups.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          {search ? 'No guests match your search.' : 'No guests found.'}
        </div>
      )}

      {tourGroups.map(group => (
        <TourGuestGroup key={group.name} group={group} onSelectGuest={setSelectedGuest} />
      ))}
    </div>
  )
}

function TourGuestGroup({ group, onSelectGuest }) {
  const [collapsed, setCollapsed] = useState(false)
  const riders = group.guests.filter(g => g.participant_type === 'Rider').length
  const pillions = group.guests.filter(g => g.participant_type === 'Pillion').length
  const crew = group.guests.filter(g => ['Crew', 'Lead Guide', '2nd Guide', 'Support Vehicle Driver'].includes(g.participant_type)).length
  const carPax = group.guests.filter(g => g.participant_type === 'Car Passenger').length

  const readiness = useMemo(() => getTourReadiness(group.guests), [group.guests])
  const pct = readiness.pct
  const barColor = pct >= 80 ? '#2E7D32' : pct >= 50 ? '#F57F17' : pct > 0 ? '#E65100' : '#DDD'

  return (
    <div style={{ marginBottom: 24 }}>
      <button onClick={() => setCollapsed(!collapsed)}
        style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', background: 'none', border: 'none', borderBottom: '1.5px solid var(--text-primary)', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>{group.name}</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {group.guests.length} guest{group.guests.length !== 1 ? 's' : ''}
            {group.departure ? ' · ' + fmtDateFull(group.departure) : ''}
          </span>
          {(riders > 0 || pillions > 0 || carPax > 0) && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              ({[
                riders > 0 ? riders + ' rider' + (riders !== 1 ? 's' : '') : '',
                pillions > 0 ? pillions + ' pillion' + (pillions !== 1 ? 's' : '') : '',
                carPax > 0 ? carPax + ' car' : '',
                crew > 0 ? crew + ' crew' : '',
              ].filter(Boolean).join(', ')})
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: barColor }}>{pct}%</span>
          <div style={{ width: 60, height: 4, borderRadius: 2, background: '#ECEFF1', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: pct + '%', background: barColor, borderRadius: 2 }} />
          </div>
          {readiness.actionItems > 0 && (
            <span style={{ fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 8, background: '#FFF3E0', color: '#E65100' }}>
              {readiness.actionItems} action{readiness.actionItems !== 1 ? 's' : ''}
            </span>
          )}
          <span style={{ fontSize: 10, transition: 'transform 0.15s', transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)', display: 'inline-block', color: 'var(--text-muted)' }}>▾</span>
        </div>
      </button>
      {!collapsed && (
        <div className="table-wrap" style={{ marginTop: 0 }}>
          <table style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '20%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '10%' }} />
            </colgroup>
            <thead><tr>
              <th>Name</th><th>Type</th><th>Room</th><th>Motorcycle</th><th>Balance</th><th>Status</th><th>Readiness</th><th></th>
            </tr></thead>
            <tbody>
              {group.guests.map(g => <GuestRow key={g.id} guest={g} onSelect={() => onSelectGuest(g)} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}


const STATUS_STYLES = {
  'Balance Paid': { bg: '#E8F5E9', color: '#2E7D32' },
  'Deposit Paid': { bg: '#FFF8E1', color: '#F57F17' },
  'Booked': { bg: '#E3F2FD', color: '#1565C0' },
  'New Booking': { bg: '#E3F2FD', color: '#1565C0' },
  'Possible / Enquired': { bg: '#F3E5F5', color: '#7B1FA2' },
  'Waitlisted': { bg: '#FFF3E0', color: '#E65100' },
  'Deposit Details Sent': { bg: '#FFF8E1', color: '#F57F17' },
  'Quote Sent': { bg: '#F3E5F5', color: '#7B1FA2' },
  'Postponed': { bg: '#ECEFF1', color: '#546E7A' },
  'Cancelled': { bg: '#FFEBEE', color: '#C62828' },
}

function GuestRow({ guest: g, onSelect }) {
  const ss = STATUS_STYLES[g.status] || { bg: '#F5F5F5', color: 'var(--text-muted)' }
  const hasPreTour = g.pre_tour_reqd === 'Yes' || g.pre_tour_details
  const hasExcursion = !!g.excursions
  const hasSpecial = g.dietary || g.medical || g.physical_limitations || g.anything_else
  const bal = parseFloat(g.balance_due) || 0
  const cur = g.currency || 'USD'

  const rd = useMemo(() => getGuestReadiness(g), [g])
  const pct = rd.pct
  const rColor = pct >= 80 ? '#2E7D32' : pct >= 50 ? '#F57F17' : pct > 0 ? '#E65100' : '#DDD'

  return (
    <tr onClick={onSelect} style={{ cursor: 'pointer' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-secondary)' }}
      onMouseLeave={e => { e.currentTarget.style.background = '' }}>
      <td style={{ fontWeight: 500 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {g.name || '—'}
          {(hasPreTour || hasExcursion || hasSpecial) && (
            <span style={{ display: 'flex', gap: 3 }}>
              {hasPreTour && <Dot title="Pre/post tour accommodation" color="#42A5F5" />}
              {hasExcursion && <Dot title="Excursions" color="#AB47BC" />}
              {hasSpecial && <Dot title="Dietary/medical/special" color="#FF7043" />}
            </span>
          )}
        </div>
      </td>
      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{g.participant_type || '—'}</td>
      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{g.room_type || '—'}</td>
      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{g.allocated_bike || g.motorcycle || '—'}</td>
      <td style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: bal > 0 ? '#C62828' : bal === 0 && g.total_received ? '#2E7D32' : 'var(--text-secondary)', fontWeight: bal > 0 ? 500 : 400 }}>
        {g.balance_due ? fmtCurrency(g.balance_due, cur) : '—'}
      </td>
      <td>
        <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', background: ss.bg, color: ss.color, borderRadius: 4, display: 'inline-block' }}>
          {g.status || '—'}
        </span>
      </td>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#ECEFF1', overflow: 'hidden', flexShrink: 0 }}>
            <div style={{ height: '100%', width: pct + '%', background: rColor, borderRadius: 2 }} />
          </div>
          <span style={{ fontSize: 10, fontWeight: 500, color: rColor, fontVariantNumeric: 'tabular-nums' }}>{rd.done}/{rd.total}</span>
        </div>
      </td>
      <td style={{ textAlign: 'right' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>View →</span>
      </td>
    </tr>
  )
}

function Dot({ title, color }) {
  return <span title={title} style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
}

// ═══════════════════════════════════════
// GUEST DETAIL VIEW
// ═══════════════════════════════════════

function GuestDetail({ guest: g, onBack }) {
  const [activeTab, setActiveTab] = useState('readiness')

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: 13, color: 'var(--blue-text)', cursor: 'pointer', padding: '4px 0' }}>← Back to guests</button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 500 }}>{g.name || 'Unknown Guest'}</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            {g.tour_name || 'No tour assigned'}
            {g.participant_type ? ' · ' + g.participant_type : ''}
            {g.booking_ref ? ' · Ref #' + g.booking_ref : ''}
            {g.status ? ' · ' + g.status : ''}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '0.5px solid var(--border-default)' }}>
        {['readiness', 'details', 'logistics', 'correspondence'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ padding: '8px 16px', fontSize: 13, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer',
              color: activeTab === tab ? 'var(--blue-text)' : 'var(--text-muted)',
              borderBottom: activeTab === tab ? '2px solid var(--blue-mid)' : '2px solid transparent', marginBottom: -0.5 }}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>
      {activeTab === 'readiness' && <ReadinessPanel g={g} />}
      {activeTab === 'details' && <DetailsPanel g={g} />}
      {activeTab === 'logistics' && <LogisticsPanel g={g} />}
      {activeTab === 'correspondence' && <CorrespondencePanel g={g} />}
    </div>
  )
}

function ReadinessPanel({ g }) {
  // Optimistic local copy of actions_completed. When the user marks an
  // item done or undoes it, we update this immediately and write to Zoho
  // in the background. Parent-level refresh isn't needed for the UI to
  // reflect the change.
  const [localActions, setLocalActions] = useState(g.actions_completed || '')
  const [pending, setPending] = useState(null) // actionValue currently being written

  // Build a synthetic guest with our local actions_completed so the
  // readiness engine reads the current (optimistic) state.
  const gLive = { ...g, actions_completed: localActions }
  const rd = getGuestReadiness(gLive)
  const pct = rd.pct
  const barColor = pct >= 80 ? '#2E7D32' : pct >= 50 ? '#F57F17' : pct > 0 ? '#E65100' : '#DDD'

  const parseSet = (val) => {
    if (!val) return new Set()
    if (Array.isArray(val)) return new Set(val)
    return new Set(String(val).split(';').map(s => s.trim()).filter(Boolean))
  }
  const serialise = (set) => Array.from(set).join(';')

  const writeActions = async (nextSet, actionValue) => {
    setPending(actionValue)
    const prev = localActions
    const next = serialise(nextSet)
    setLocalActions(next) // optimistic
    try {
      const res = await fetch('/api/update-bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_ids: [g.id],
          updates: { Actions_Completed: Array.from(nextSet) },
        }),
      })
      if (!res.ok) throw new Error('Update failed (' + res.status + ')')
    } catch (err) {
      setLocalActions(prev) // rollback
      alert('Could not update: ' + err.message)
    } finally {
      setPending(null)
    }
  }

  const markDone = (actionValue) => {
    const set = parseSet(localActions)
    set.add(actionValue)
    writeActions(set, actionValue)
  }
  const undo = (actionValue) => {
    const set = parseSet(localActions)
    set.delete(actionValue)
    writeActions(set, actionValue)
  }

  // Group by category
  const grouped = {}
  rd.checklist.forEach(item => {
    if (!grouped[item.category]) grouped[item.category] = []
    grouped[item.category].push(item)
  })

  const STATUS_ICON = {
    complete: '✓',
    incomplete: '○',
    action_needed: '!',
    not_applicable: '—',
  }
  const STATUS_COLOR = {
    complete: '#2E7D32',
    incomplete: '#9E9E9E',
    action_needed: '#E65100',
    not_applicable: '#BDBDBD',
  }
  const STATUS_BG = {
    complete: '#E8F5E9',
    incomplete: '#F5F5F5',
    action_needed: '#FFF3E0',
    not_applicable: '#FAFAFA',
  }

  return (
    <div>
      {/* Summary bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px', marginBottom: 20,
        background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)',
        border: '0.5px solid var(--border-default)',
      }}>
        <div>
          <span style={{ fontSize: 28, fontWeight: 600, color: barColor, fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
          <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 8 }}>ready</span>
        </div>
        <div style={{ flex: 1, maxWidth: 200 }}>
          <div style={{ height: 6, borderRadius: 3, background: '#ECEFF1', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: pct + '%', background: barColor, borderRadius: 3, transition: 'width 0.3s' }} />
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {rd.done} of {rd.total} items complete
          {rd.actionNeeded > 0 && <span style={{ color: '#E65100', fontWeight: 500 }}> · {rd.actionNeeded} need action</span>}
        </div>
      </div>

      {/* Checklist by category */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {Object.keys(CATEGORIES).map(cat => {
          const items = grouped[cat]
          if (!items || items.length === 0) return null
          const catInfo = CATEGORIES[cat]
          const catDone = items.filter(i => i.status === 'complete').length
          const catTotal = items.filter(i => i.status !== 'not_applicable').length

          return (
            <div key={cat}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: catInfo.color }} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{catInfo.label}</span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{catDone}/{catTotal}</span>
              </div>
              {items.map(item => (
                <div key={item.key} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 10px',
                  marginBottom: 2, borderRadius: 6,
                  background: item.status === 'action_needed' ? STATUS_BG.action_needed : 'transparent',
                }}>
                  <span style={{
                    width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: item.status === 'action_needed' ? 11 : 10,
                    fontWeight: 600,
                    background: STATUS_BG[item.status],
                    color: STATUS_COLOR[item.status],
                    border: '1px solid ' + (item.status === 'complete' ? '#A5D6A7' : item.status === 'action_needed' ? '#FFB74D' : '#E0E0E0'),
                  }}>
                    {STATUS_ICON[item.status]}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13,
                      color: item.status === 'complete' ? 'var(--text-secondary)' : 'var(--text-primary)',
                      textDecoration: item.status === 'complete' ? 'line-through' : 'none',
                      opacity: item.status === 'complete' ? 0.7 : 1,
                    }}>
                      {item.label}
                    </div>
                    {item.note && item.status !== 'complete' && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.note}
                      </div>
                    )}
                    {item.status === 'action_needed' && (
                      <div style={{ fontSize: 10, color: '#E65100', fontWeight: 500, marginTop: 1 }}>
                        Needs action from team
                      </div>
                    )}
                    {item.status === 'incomplete' && (
                      <div style={{ fontSize: 10, color: '#9E9E9E', marginTop: 1 }}>
                        Waiting on guest
                      </div>
                    )}
                  </div>
                  {item.actionValue && item.status === 'action_needed' && (
                    <button
                      onClick={() => markDone(item.actionValue)}
                      disabled={pending === item.actionValue}
                      style={{
                        fontSize: 11, fontWeight: 500, padding: '3px 10px',
                        border: '0.5px solid #A5D6A7', borderRadius: 4,
                        background: '#E8F5E9', color: '#2E7D32',
                        cursor: 'pointer', flexShrink: 0, alignSelf: 'center',
                      }}
                    >
                      {pending === item.actionValue ? '...' : 'Mark done'}
                    </button>
                  )}
                  {item.actionValue && item.status === 'complete' && parseSet(localActions).has(item.actionValue) && (
                    <button
                      onClick={() => undo(item.actionValue)}
                      disabled={pending === item.actionValue}
                      title="Undo — mark as not done"
                      style={{
                        fontSize: 11, padding: '3px 8px',
                        border: 'none', background: 'transparent',
                        color: 'var(--text-muted)',
                        cursor: 'pointer', flexShrink: 0, alignSelf: 'center',
                      }}
                    >
                      {pending === item.actionValue ? '...' : '↶ Undo'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DetailsPanel({ g }) {
  const cur = g.currency || 'USD'
  const bal = parseFloat(g.balance_due) || 0

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
      <div>
        <SH>Personal Information</SH>
        <FG>
          <F label="Full name" value={g.name} />
          <F label="Email" value={g.email} link={g.email ? 'mailto:' + g.email : null} />
          {g.secondary_email && <F label="Secondary email" value={g.secondary_email} />}
          <F label="Phone" value={g.phone} />
          <F label="Nationality" value={g.nationality} />
          <F label="Passport" value={g.passport} />
          <F label="Emergency contact" value={g.emergency_contact} />
        </FG>

        <SH>Riding Profile</SH>
        <FG>
          <F label="Licence" value={g.licence} />
          <F label="Licence type" value={g.licence_type} />
          <F label="Years riding" value={g.years_riding} />
          <F label="Gravel experience" value={g.gravel_experience} />
          <F label="Tar experience" value={g.tar_experience} />
          <F label="Adventure experience" value={g.adventure_experience} />
          <F label="Own bike" value={g.own_bike} />
        </FG>

        {(g.dietary || g.medical || g.physical_limitations || g.anything_else) && (
          <>
            <SH>Special Requirements</SH>
            <FG>
              <F label="Dietary" value={g.dietary} />
              <F label="Medical / allergies" value={g.medical} />
              <F label="Physical limitations" value={g.physical_limitations} />
              <F label="Anything else" value={g.anything_else} />
            </FG>
          </>
        )}
      </div>

      <div>
        <SH>Booking Details</SH>
        <FG>
          <F label="Tour" value={g.tour_name} />
          <F label="Booking ref" value={g.booking_ref} />
          <F label="Booking date" value={g.booking_date ? fmtDate(g.booking_date) : ''} />
          <F label="Participant type" value={g.participant_type} />
          <F label="Room type" value={g.room_type} />
          <F label="Roommate" value={g.roommate} />
          <F label="Sharing info" value={g.sharing_info} />
        </FG>

        <SH>Motorcycle</SH>
        <FG>
          <F label="Preference" value={g.motorcycle} />
          <F label="Allocated bike" value={g.allocated_bike} />
          {g.bmw_upgrade && <F label="BMW 1250 upgrade" value={g.bmw_upgrade} />}
          {g.crf_upgrade && <F label="CRF1100 upgrade" value={g.crf_upgrade} />}
          {g.bike_upgrade_notes && <F label="Upgrade notes" value={g.bike_upgrade_notes} />}
          <F label="Gear" value={g.gear} />
          {g.moto_notes && <F label="Motorcycle notes" value={g.moto_notes} />}
          <F label="T-shirt size" value={g.tshirt} />
        </FG>

        <SH>Payment</SH>
        <FG>
          <F label="Tour price" value={g.tour_price ? fmtCurrency(g.tour_price, cur) : ''} />
          <F label="Total due" value={g.total_due ? fmtCurrency(g.total_due, cur) : ''} />
          <F label="Total received" value={g.total_received ? fmtCurrency(g.total_received, cur) : ''} />
          <F label="Deposit paid" value={g.deposit_paid ? fmtCurrency(g.deposit_paid, cur) + (g.deposit_date ? ' (' + fmtDate(g.deposit_date) + ')' : '') : ''} />
          <F label="Balance received" value={g.balance_received ? fmtCurrency(g.balance_received, cur) + (g.balance_paid_date ? ' (' + fmtDate(g.balance_paid_date) + ')' : '') : ''} />
          <F label="Balance due" value={g.balance_due ? fmtCurrency(g.balance_due, cur) : ''} highlight={bal > 0 ? 'red' : bal === 0 && g.total_received ? 'green' : null} />
          {g.balance_due_date && <F label="Balance due date" value={fmtDate(g.balance_due_date)} highlight={new Date(g.balance_due_date) < new Date() && bal > 0 ? 'red' : null} />}
        </FG>

        {(g.notes || g.client_comments) && (
          <>
            <SH>Notes</SH>
            <FG>
              {g.notes && <F label="Booking notes" value={g.notes} multiline />}
              {g.client_comments && <F label="Client comments" value={g.client_comments} multiline />}
            </FG>
          </>
        )}

        <SH>Admin</SH>
        <FG>
          <F label="Waiver signed" value={g.waiver_signed ? 'Yes' : 'No'} />
          <F label="Booking approved" value={g.booking_approved ? 'Yes' : 'No'} />
          <F label="Insurance" value={g.insurance_details} />
          <F label="Global Rescue" value={g.global_rescue} />
          <F label="How found RDS" value={g.how_found} />
        </FG>
      </div>
    </div>
  )
}

function LogisticsPanel({ g }) {
  const hasFlights = g.arrival_flight || g.departure_flight || g.departure_flight_home
  const hasTransfers = g.additional_transfers || g.transfer_hotel || g.capey_arrival || g.capey_departure || g.capey_home
  const hasPreTour = g.pre_tour_reqd === 'Yes' || g.pre_tour_details
  const hasPostTour = g.post_tour_reqd === 'Yes' || g.post_tour_details
  const hasExcursions = !!g.excursions
  const ed = g.excursion_details || {}
  const hasAnything = hasFlights || hasTransfers || hasPreTour || hasPostTour || hasExcursions

  if (!hasAnything) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        No pre-tour logistics recorded for this guest.
        <div style={{ fontSize: 12, marginTop: 8 }}>Information from client emails about accommodation, excursions, and transfers will appear here once captured.</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
      <div>
        {hasFlights && (
          <>
            <SH>Flight Details</SH>
            <FG>
              <F label="Arrival flight" value={g.arrival_flight} multiline />
              <F label="Departure flight" value={g.departure_flight} multiline />
              {g.departure_flight_home && <F label="CT → Home flight" value={g.departure_flight_home} multiline />}
            </FG>
          </>
        )}
        {hasTransfers && (
          <>
            <SH>Transfers</SH>
            <FG>
              {g.transfer_hotel && <F label="Arrival hotel" value={g.transfer_hotel} />}
              {g.additional_transfers && <F label="Additional transfers" value={g.additional_transfers} multiline />}
              {g.capey_arrival && <F label="Capey (arrival)" value={'Requested' + (g.pax_arrival ? ' · ' + g.pax_arrival + ' pax' : '')} />}
              {g.capey_departure && <F label="Capey (departure)" value={'Requested' + (g.pax_departure ? ' · ' + g.pax_departure + ' pax' : '')} />}
              {g.capey_home && <F label="Capey (home)" value={'Requested' + (g.pax_home ? ' · ' + g.pax_home + ' pax' : '')} />}
            </FG>
          </>
        )}
      </div>
      <div>
        {(hasPreTour || hasPostTour) && (
          <>
            <SH>Accommodation</SH>
            <FG>
              <F label="Pre-tour required" value={g.pre_tour_reqd || 'No info'} highlight={g.pre_tour_reqd === 'Yes' && !g.pre_tour_booked ? 'amber' : g.pre_tour_booked ? 'green' : null} />
              {g.pre_tour_details && <F label="Pre-tour details" value={g.pre_tour_details} multiline />}
              {g.pre_tour_booked && <F label="Pre-tour booked" value="Yes" highlight="green" />}
              {g.pre_tour_amount && <F label="Pre-tour amount" value={fmtCurrency(g.pre_tour_amount, g.currency || 'USD')} />}
              <F label="Post-tour required" value={g.post_tour_reqd || 'No info'} highlight={g.post_tour_reqd === 'Yes' && !g.post_tour_booked ? 'amber' : g.post_tour_booked ? 'green' : null} />
              {g.post_tour_details && <F label="Post-tour details" value={g.post_tour_details} multiline />}
              {g.post_tour_booked && <F label="Post-tour booked" value="Yes" highlight="green" />}
              {g.post_tour_amount && <F label="Post-tour amount" value={fmtCurrency(g.post_tour_amount, g.currency || 'USD')} />}
            </FG>
          </>
        )}
        {hasExcursions && (
          <>
            <SH>Excursions</SH>
            <FG>
              {ed.okavango_full && <F label="Okavango Full Day" value={'Yes' + (ed.okavango_amount ? ' · ' + fmtCurrency(ed.okavango_amount, g.currency || 'USD') : '')} />}
              {ed.okavango_heli && <F label="Okavango Scenic Flight" value={'Yes' + (ed.okavango_scenic ? ' · ' + fmtCurrency(ed.okavango_scenic, g.currency || 'USD') : '')} />}
              {ed.game_drive && <F label="Morning Game Drive" value={'Yes' + (ed.game_drive_amount ? ' · ' + fmtCurrency(ed.game_drive_amount, g.currency || 'USD') : '')} />}
              {ed.zambezi && <F label="Zambezi Dinner Cruise" value={'Yes' + (ed.zambezi_amount ? ' · ' + fmtCurrency(ed.zambezi_amount, g.currency || 'USD') : '')} />}
              {ed.pre_ride && <F label="Pre-Tour 1-day Ride" value={'Yes' + (ed.pre_ride_amount ? ' · ' + fmtCurrency(ed.pre_ride_amount, g.currency || 'USD') : '')} />}
              {ed.oddballs && <F label="Oddballs 2-night stay" value="Yes" />}
            </FG>
          </>
        )}
        {g.pillion_name && (
          <>
            <SH>Pillion</SH>
            <FG>
              <F label="Pillion name" value={g.pillion_name} />
              <F label="Pillion info" value={g.pillion} />
            </FG>
          </>
        )}
      </div>
    </div>
  )
}

function CorrespondencePanel({ g }) {
  const [emails, setEmails] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!g.email) { setLoading(false); return }
    fetch('/api/gmail-search?q=' + encodeURIComponent('from:' + g.email + ' OR to:' + g.email) + '&max=20')
      .then(r => r.json())
      .then(d => { setEmails(d.messages || d.emails || []); setLoading(false) })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [g.email])

  if (!g.email) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No email address recorded for this guest.</div>
  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading emails...</div>
  if (error) return <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>Could not load emails: {error}</div>
  if (emails.length === 0) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No email correspondence found for {g.email}.</div>

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        {emails.length} email{emails.length !== 1 ? 's' : ''} found for {g.email}
      </div>
      {emails.map((email, i) => <EmailRow key={email.id || i} email={email} />)}
    </div>
  )
}

function EmailRow({ email }) {
  const [expanded, setExpanded] = useState(false)
  const [body, setBody] = useState(null)
  const [loadingBody, setLoadingBody] = useState(false)

  const handleExpand = () => {
    if (expanded) { setExpanded(false); return }
    setExpanded(true)
    if (body || !email.id) return
    setLoadingBody(true)
    fetch('/api/gmail-fetch-body?id=' + email.id)
      .then(r => r.json())
      .then(d => { setBody(d.body || d.snippet || 'No body available'); setLoadingBody(false) })
      .catch(() => { setBody('Failed to load body'); setLoadingBody(false) })
  }

  return (
    <div style={{ borderBottom: '0.5px solid var(--border-default)', padding: '10px 0' }}>
      <div onClick={handleExpand} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{email.subject || email.Subject || '(no subject)'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {email.from || email.From || ''}{(email.date || email.Date) ? ' · ' + (email.date || email.Date) : ''}
          </div>
        </div>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s', display: 'inline-block' }}>▾</span>
      </div>
      {expanded && (
        <div style={{ marginTop: 8, padding: '10px 12px', fontSize: 12, background: 'var(--bg-secondary)', borderRadius: 6, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.5, maxHeight: 400, overflow: 'auto' }}>
          {loadingBody ? 'Loading...' : (body || email.snippet || 'No content')}
        </div>
      )}
    </div>
  )
}

// Shared UI
function SH({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, padding: '12px 0 6px', borderBottom: '0.5px solid var(--border-default)', marginBottom: 8 }}>{children}</div>
}
function FG({ children }) { return <div style={{ marginBottom: 16 }}>{children}</div> }
function F({ label, value, link, highlight, multiline }) {
  if (!value && value !== 0) return (
    <div style={{ display: 'flex', padding: '4px 0', fontSize: 13 }}>
      <span style={{ width: 160, flexShrink: 0, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ color: 'var(--text-muted)' }}>—</span>
    </div>
  )
  const hl = highlight === 'red' ? '#C62828' : highlight === 'green' ? '#2E7D32' : highlight === 'amber' ? '#F57F17' : null
  const vs = { color: hl || 'var(--text-primary)', fontWeight: hl ? 500 : 400, whiteSpace: multiline ? 'pre-wrap' : 'normal', lineHeight: multiline ? 1.5 : 'normal' }
  return (
    <div style={{ display: 'flex', padding: '4px 0', fontSize: 13 }}>
      <span style={{ width: 160, flexShrink: 0, color: 'var(--text-muted)' }}>{label}</span>
      {link ? <a href={link} style={{ ...vs, color: 'var(--blue-text)', textDecoration: 'none' }}>{value}</a> : <span style={vs}>{value}</span>}
    </div>
  )
}
