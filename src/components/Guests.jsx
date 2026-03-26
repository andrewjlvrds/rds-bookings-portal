import React, { useState, useEffect, useMemo } from 'react'
import { fmtDate, fmtDateFull, fmtCurrency } from '../utils/helpers'

export default function Guests({ tours }) {
  const [guests, setGuests] = useState([])
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState(null)
  const [tourFilter, setTourFilter] = useState('all')
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

  // Build tour name → tour data lookup from portal's tours (which have real dates)
  const tourLookup = useMemo(() => {
    const map = {}
    ;(tours || []).forEach(t => {
      if (t.name) map[t.name] = t
    })
    return map
  }, [tours])

  const futureTourNames = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    const names = new Set()
    ;(tours || []).forEach(t => {
      const endDate = t.end_date || t.departure_date || ''
      if (!endDate || endDate >= today) {
        if (t.name) names.add(t.name)
      }
    })
    return names
  }, [tours])

  // Group guests by tour
  const tourGroups = useMemo(() => {
    const groups = {}
    const today = new Date().toISOString().split('T')[0]

    guests.forEach(g => {
      if (g.status === 'Cancelled' || g.status === 'Refunded') return

      const tourName = g.tour_name || 'Unassigned'

      // Apply search filter
      if (search) {
        const q = search.toLowerCase()
        const searchable = [g.name, g.email, g.motorcycle, g.participant_type, g.room_type, tourName].join(' ').toLowerCase()
        if (!searchable.includes(q)) return
      }

      // Apply tour filter
      if (tourFilter !== 'all' && tourName !== tourFilter) return

      // Skip past tours unless showPast
      if (!showPast && futureTourNames.size > 0 && tourName !== 'Unassigned' && !futureTourNames.has(tourName)) return

      if (!groups[tourName]) {
        const portalTour = tourLookup[tourName]
        groups[tourName] = {
          name: tourName,
          departure: portalTour ? (portalTour.departure_date || portalTour.start_date || '') : (g.tour_start || ''),
          guests: [],
        }
      }
      groups[tourName].guests.push(g)
    })

    // Sort tours by departure date (future first)
    return Object.values(groups).sort((a, b) => {
      if (!a.departure && b.departure) return 1
      if (a.departure && !b.departure) return -1
      return (a.departure || '').localeCompare(b.departure || '')
    })
  }, [guests, tourFilter, search, showPast, futureTourNames, tourLookup])

  // Unique tour names for filter dropdown
  const tourNames = useMemo(() => {
    const names = new Set()
    guests.forEach(g => {
      if (g.tour_name && g.status !== 'Cancelled' && g.status !== 'Refunded') {
        names.add(g.tour_name)
      }
    })
    return Array.from(names).sort()
  }, [guests])

  // Detail view
  if (selectedGuest) {
    return (
      <GuestDetail
        guest={selectedGuest}
        onBack={() => setSelectedGuest(null)}
      />
    )
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading guests...</div>
  }

  const totalGuests = tourGroups.reduce((sum, g) => sum + g.guests.length, 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 500 }}>Tour Guests</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            {totalGuests} guest{totalGuests !== 1 ? 's' : ''} across {tourGroups.length} tour{tourGroups.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Search guests..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              fontSize: 13, padding: '6px 10px', width: 200,
              border: '0.5px solid var(--border-default)', borderRadius: 6,
              outline: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)',
            }}
          />
          <select
            value={tourFilter}
            onChange={e => setTourFilter(e.target.value)}
            style={{
              fontSize: 13, padding: '6px 10px',
              border: '0.5px solid var(--border-default)', borderRadius: 6,
              background: 'var(--bg-primary)', color: 'var(--text-primary)',
            }}
          >
            <option value="all">All tours</option>
            {tourNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <button
            className="btn"
            onClick={() => setShowPast(!showPast)}
            style={{ fontSize: 12 }}
          >
            {showPast ? 'Hide past' : 'Show past'}
          </button>
        </div>
      </div>

      {apiError && (
        <div style={{
          padding: '8px 12px', marginBottom: 12, fontSize: 12,
          background: '#FFF8E1', border: '0.5px solid #FFD54F', borderRadius: 6,
          color: '#F57F17',
        }}>
          {apiError}
        </div>
      )}

      {tourGroups.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          {search ? 'No guests match your search.' : 'No guests found.'}
        </div>
      )}

      {tourGroups.map(group => (
        <TourGuestGroup
          key={group.name}
          group={group}
          onSelectGuest={setSelectedGuest}
        />
      ))}
    </div>
  )
}

function TourGuestGroup({ group, onSelectGuest }) {
  const [collapsed, setCollapsed] = useState(false)

  // Summary stats
  const riders = group.guests.filter(g => g.participant_type === 'Rider' || (!g.participant_type && g.motorcycle)).length
  const pillions = group.guests.filter(g => g.participant_type === 'Pillion').length
  const nonRiders = group.guests.filter(g => g.participant_type === 'Non-Rider' || g.participant_type === 'Non-riding').length

  // Pre-tour logistics summary
  const withPreAccom = group.guests.filter(g => g.pre_tour_accom || g.pre_tour_notes).length
  const withExcursions = group.guests.filter(g => g.excursions || g.excursion_notes).length
  const withFlights = group.guests.filter(g => g.arrival_flight || g.departure_flight).length

  return (
    <div style={{ marginBottom: 24 }}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 0', background: 'none', border: 'none', borderBottom: '1.5px solid var(--text-primary)',
          cursor: 'pointer', marginBottom: collapsed ? 0 : 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>
            {group.name}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {group.guests.length} guest{group.guests.length !== 1 ? 's' : ''}
            {group.departure ? ' · ' + fmtDateFull(group.departure) : ''}
          </span>
          {(riders > 0 || pillions > 0 || nonRiders > 0) && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              ({[
                riders > 0 ? riders + ' rider' + (riders !== 1 ? 's' : '') : '',
                pillions > 0 ? pillions + ' pillion' + (pillions !== 1 ? 's' : '') : '',
                nonRiders > 0 ? nonRiders + ' non-riding' : '',
              ].filter(Boolean).join(', ')})
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {withPreAccom > 0 && <LogisticsBadge label="Pre-tour" count={withPreAccom} />}
          {withExcursions > 0 && <LogisticsBadge label="Excursions" count={withExcursions} />}
          {withFlights > 0 && <LogisticsBadge label="Flights" count={withFlights} />}
          <span style={{
            fontSize: 10, transition: 'transform 0.15s',
            transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)',
            display: 'inline-block', color: 'var(--text-muted)',
          }}>▾</span>
        </div>
      </button>

      {!collapsed && (
        <div className="table-wrap" style={{ marginTop: 0 }}>
          <table style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '22%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '10%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Room</th>
                <th>Motorcycle</th>
                <th>Balance</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {group.guests.map(g => (
                <GuestRow key={g.id} guest={g} onSelect={() => onSelectGuest(g)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function LogisticsBadge({ label, count }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 500, padding: '2px 6px',
      background: 'var(--blue-bg)', color: 'var(--blue-text)',
      borderRadius: 4,
    }}>
      {label}: {count}
    </span>
  )
}

function GuestRow({ guest, onSelect }) {
  const g = guest
  const statusColors = {
    'Confirmed': { bg: '#E8F5E9', color: '#2E7D32' },
    'Paid': { bg: '#E8F5E9', color: '#2E7D32' },
    'Deposit Paid': { bg: '#FFF8E1', color: '#F57F17' },
    'Pending': { bg: '#FFF8E1', color: '#F57F17' },
    'Enquiry': { bg: '#E3F2FD', color: '#1565C0' },
    'Cancelled': { bg: '#FFEBEE', color: '#C62828' },
  }

  const getStatusStyle = (status) => {
    for (const [key, style] of Object.entries(statusColors)) {
      if (status && status.toLowerCase().includes(key.toLowerCase())) return style
    }
    return { bg: '#F5F5F5', color: 'var(--text-muted)' }
  }

  const ss = getStatusStyle(g.status)

  // Pre-tour indicator dots
  const hasPreTour = g.pre_tour_accom || g.pre_tour_notes || g.post_tour_accom || g.post_tour_notes
  const hasExcursion = g.excursions || g.excursion_notes
  const hasSpecial = g.dietary || g.medical || g.special_requests

  const balance = g.balance_due || ''
  const balanceNum = parseFloat(balance) || 0

  return (
    <tr
      onClick={onSelect}
      style={{ cursor: 'pointer' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-secondary)' }}
      onMouseLeave={e => { e.currentTarget.style.background = '' }}
    >
      <td style={{ fontWeight: 500 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {g.name || '—'}
          {(hasPreTour || hasExcursion || hasSpecial) && (
            <span style={{ display: 'flex', gap: 3 }}>
              {hasPreTour && <span title="Pre/post tour accommodation" style={{ width: 6, height: 6, borderRadius: '50%', background: '#42A5F5', display: 'inline-block' }} />}
              {hasExcursion && <span title="Excursions requested" style={{ width: 6, height: 6, borderRadius: '50%', background: '#AB47BC', display: 'inline-block' }} />}
              {hasSpecial && <span title="Dietary/medical/special requests" style={{ width: 6, height: 6, borderRadius: '50%', background: '#FF7043', display: 'inline-block' }} />}
            </span>
          )}
        </div>
      </td>
      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{g.participant_type || '—'}</td>
      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{g.room_type || '—'}</td>
      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{g.motorcycle || '—'}</td>
      <td style={{
        fontSize: 12, fontVariantNumeric: 'tabular-nums',
        color: balanceNum > 0 ? '#C62828' : balanceNum === 0 && g.amount_paid ? '#2E7D32' : 'var(--text-secondary)',
        fontWeight: balanceNum > 0 ? 500 : 400,
      }}>
        {balance ? fmtCurrency(balance, 'USD') : '—'}
      </td>
      <td>
        <span style={{
          fontSize: 11, fontWeight: 500, padding: '2px 8px',
          background: ss.bg, color: ss.color, borderRadius: 4,
          display: 'inline-block',
        }}>
          {g.status || '—'}
        </span>
      </td>
      <td style={{ textAlign: 'right' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>View →</span>
      </td>
    </tr>
  )
}


// ═══════════════════════════════════════
// GUEST DETAIL VIEW
// ═══════════════════════════════════════

function GuestDetail({ guest, onBack }) {
  const g = guest
  const [activeTab, setActiveTab] = useState('details')

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button
          onClick={onBack}
          style={{
            background: 'none', border: 'none', fontSize: 13,
            color: 'var(--blue-text)', cursor: 'pointer', padding: '4px 0',
          }}
        >← Back to guests</button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 500 }}>{g.name || 'Unknown Guest'}</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            {g.tour_name || 'No tour assigned'}
            {g.participant_type ? ' · ' + g.participant_type : ''}
            {g.status ? ' · ' + g.status : ''}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '0.5px solid var(--border-default)' }}>
        {['details', 'logistics', 'correspondence'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 16px', fontSize: 13, fontWeight: 500,
              background: 'none', border: 'none', cursor: 'pointer',
              color: activeTab === tab ? 'var(--blue-text)' : 'var(--text-muted)',
              borderBottom: activeTab === tab ? '2px solid var(--blue-mid)' : '2px solid transparent',
              marginBottom: -0.5,
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'details' && <DetailsPanel guest={g} />}
      {activeTab === 'logistics' && <LogisticsPanel guest={g} />}
      {activeTab === 'correspondence' && <CorrespondencePanel guest={g} />}
    </div>
  )
}


function DetailsPanel({ guest }) {
  const g = guest

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
      {/* Left column — Personal info */}
      <div>
        <SectionHeading>Personal Information</SectionHeading>
        <FieldGroup>
          <Field label="Full name" value={g.name} />
          <Field label="Email" value={g.email} link={g.email ? 'mailto:' + g.email : null} />
          <Field label="Phone" value={g.phone} />
          <Field label="Nationality" value={g.nationality} />
          <Field label="Date of birth" value={g.dob ? fmtDate(g.dob) : ''} />
          <Field label="Passport" value={g.passport} />
        </FieldGroup>

        <SectionHeading>Emergency Contact</SectionHeading>
        <FieldGroup>
          <Field label="Name" value={g.emergency_name} />
          <Field label="Phone" value={g.emergency_phone} />
        </FieldGroup>
      </div>

      {/* Right column — Booking info */}
      <div>
        <SectionHeading>Booking Details</SectionHeading>
        <FieldGroup>
          <Field label="Tour" value={g.tour_name} />
          <Field label="Participant type" value={g.participant_type} />
          <Field label="Room type" value={g.room_type} />
          <Field label="Room sharing with" value={g.room_sharing} />
          <Field label="Motorcycle" value={g.motorcycle} />
          <Field label="T-shirt size" value={g.tshirt} />
          <Field label="Rider portal" value={g.portal_status} />
        </FieldGroup>

        <SectionHeading>Payment</SectionHeading>
        <FieldGroup>
          <Field label="Booking amount" value={g.booking_amount ? fmtCurrency(g.booking_amount, 'USD') : ''} />
          <Field label="Amount paid" value={g.amount_paid ? fmtCurrency(g.amount_paid, 'USD') : ''} />
          <Field
            label="Balance due"
            value={g.balance_due ? fmtCurrency(g.balance_due, 'USD') : ''}
            highlight={parseFloat(g.balance_due) > 0 ? 'red' : parseFloat(g.balance_due) === 0 && g.amount_paid ? 'green' : null}
          />
        </FieldGroup>

        {(g.dietary || g.medical || g.special_requests) && (
          <>
            <SectionHeading>Special Requirements</SectionHeading>
            <FieldGroup>
              <Field label="Dietary" value={g.dietary} />
              <Field label="Medical" value={g.medical} />
              <Field label="Special requests" value={g.special_requests} />
            </FieldGroup>
          </>
        )}

        {g.notes && (
          <>
            <SectionHeading>Notes</SectionHeading>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
              {g.notes}
            </div>
          </>
        )}
      </div>
    </div>
  )
}


function LogisticsPanel({ guest }) {
  const g = guest

  const hasPreTour = g.pre_tour_accom || g.pre_tour_notes
  const hasPostTour = g.post_tour_accom || g.post_tour_notes
  const hasExcursions = g.excursions || g.excursion_notes
  const hasFlights = g.arrival_flight || g.departure_flight
  const hasTransfers = g.airport_transfers || g.additional_transfers
  const hasAnything = hasPreTour || hasPostTour || hasExcursions || hasFlights || hasTransfers

  if (!hasAnything) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        No pre-tour logistics recorded for this guest.
        <div style={{ fontSize: 12, marginTop: 8 }}>
          Information from client emails about accommodation, excursions, and transfers will appear here once captured.
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
      <div>
        {hasFlights && (
          <>
            <SectionHeading>Flight Details</SectionHeading>
            <FieldGroup>
              <Field label="Arrival flight" value={g.arrival_flight} multiline />
              <Field label="Departure flight" value={g.departure_flight} multiline />
            </FieldGroup>
          </>
        )}

        {hasTransfers && (
          <>
            <SectionHeading>Transfers</SectionHeading>
            <FieldGroup>
              <Field label="Airport transfers" value={g.airport_transfers} multiline />
              <Field label="Additional transfers" value={g.additional_transfers} multiline />
            </FieldGroup>
          </>
        )}
      </div>

      <div>
        {(hasPreTour || hasPostTour) && (
          <>
            <SectionHeading>Accommodation</SectionHeading>
            <FieldGroup>
              <Field label="Pre-tour accommodation" value={g.pre_tour_accom} />
              <Field label="Pre-tour notes" value={g.pre_tour_notes} multiline />
              <Field label="Post-tour accommodation" value={g.post_tour_accom} />
              <Field label="Post-tour notes" value={g.post_tour_notes} multiline />
            </FieldGroup>
          </>
        )}

        {hasExcursions && (
          <>
            <SectionHeading>Excursions</SectionHeading>
            <FieldGroup>
              <Field label="Excursions" value={g.excursions} />
              <Field label="Notes" value={g.excursion_notes} multiline />
            </FieldGroup>
          </>
        )}
      </div>
    </div>
  )
}


function CorrespondencePanel({ guest }) {
  const [emails, setEmails] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!guest.email) {
      setLoading(false)
      return
    }

    // Search Gmail for emails from/to this guest
    fetch('/api/gmail-search?q=' + encodeURIComponent('from:' + guest.email + ' OR to:' + guest.email) + '&max=20')
      .then(r => r.json())
      .then(d => {
        setEmails(d.messages || d.emails || [])
        setLoading(false)
      })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [guest.email])

  if (!guest.email) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        No email address recorded for this guest.
      </div>
    )
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading emails...</div>
  }

  if (error) {
    return (
      <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
        Could not load emails: {error}
      </div>
    )
  }

  if (emails.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        No email correspondence found for {guest.email}.
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        {emails.length} email{emails.length !== 1 ? 's' : ''} found for {guest.email}
      </div>
      {emails.map((email, i) => (
        <EmailRow key={email.id || i} email={email} />
      ))}
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
    if (body) return

    // Fetch email body
    if (email.id) {
      setLoadingBody(true)
      fetch('/api/gmail-fetch-body?id=' + email.id)
        .then(r => r.json())
        .then(d => { setBody(d.body || d.snippet || 'No body available'); setLoadingBody(false) })
        .catch(() => { setBody('Failed to load body'); setLoadingBody(false) })
    }
  }

  const subject = email.subject || email.Subject || '(no subject)'
  const from = email.from || email.From || ''
  const date = email.date || email.Date || ''

  return (
    <div style={{
      borderBottom: '0.5px solid var(--border-default)',
      padding: '10px 0',
    }}>
      <div
        onClick={handleExpand}
        style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{subject}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {from}{date ? ' · ' + date : ''}
          </div>
        </div>
        <span style={{
          fontSize: 10, color: 'var(--text-muted)',
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.15s', display: 'inline-block',
        }}>▾</span>
      </div>
      {expanded && (
        <div style={{
          marginTop: 8, padding: '10px 12px', fontSize: 12,
          background: 'var(--bg-secondary)', borderRadius: 6,
          color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.5,
          maxHeight: 400, overflow: 'auto',
        }}>
          {loadingBody ? 'Loading...' : (body || email.snippet || 'No content')}
        </div>
      )}
    </div>
  )
}


// ═══════════════════════════════════════
// SHARED UI HELPERS
// ═══════════════════════════════════════

function SectionHeading({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 500, color: 'var(--text-muted)',
      textTransform: 'uppercase', letterSpacing: 0.5,
      padding: '12px 0 6px', borderBottom: '0.5px solid var(--border-default)',
      marginBottom: 8,
    }}>
      {children}
    </div>
  )
}

function FieldGroup({ children }) {
  return <div style={{ marginBottom: 16 }}>{children}</div>
}

function Field({ label, value, link, highlight, multiline }) {
  if (!value && value !== 0) {
    return (
      <div style={{ display: 'flex', padding: '4px 0', fontSize: 13 }}>
        <span style={{ width: 160, flexShrink: 0, color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ color: 'var(--text-muted)' }}>—</span>
      </div>
    )
  }

  const valueStyle = {
    color: highlight === 'red' ? '#C62828' : highlight === 'green' ? '#2E7D32' : 'var(--text-primary)',
    fontWeight: highlight ? 500 : 400,
    whiteSpace: multiline ? 'pre-wrap' : 'normal',
    lineHeight: multiline ? 1.5 : 'normal',
  }

  return (
    <div style={{ display: 'flex', padding: '4px 0', fontSize: 13 }}>
      <span style={{ width: 160, flexShrink: 0, color: 'var(--text-muted)' }}>{label}</span>
      {link ? (
        <a href={link} style={{ ...valueStyle, color: 'var(--blue-text)', textDecoration: 'none' }}>{value}</a>
      ) : (
        <span style={valueStyle}>{value}</span>
      )}
    </div>
  )
}
