import React, { useState, useEffect, useMemo } from 'react'
import { fmtDate, fmtDateFull } from '../utils/helpers'

export default function Transfers() {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState(null)
  const [tourFilter, setTourFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [transferStatuses, setTransferStatuses] = useState(() => {
    try { return JSON.parse(localStorage.getItem('rds_transfer_statuses') || '{}') } catch (e) { return {} }
  })

  const STATUSES = ['Not started', 'Booked', 'Confirmed', 'Completed']
  const STATUS_COLORS = {
    'Not started': { bg: '#F5F5F5', color: 'var(--text-muted)', border: '#DDD' },
    'Booked': { bg: '#FFF8E1', color: '#F57F17', border: '#FFD54F' },
    'Confirmed': { bg: '#E8F5E9', color: '#2E7D32', border: '#A5D6A7' },
    'Completed': { bg: '#E3F2FD', color: '#1565C0', border: '#90CAF9' },
  }

  const cycleStatus = (id) => {
    setTransferStatuses(prev => {
      const current = prev[id] || 'Not started'
      const idx = STATUSES.indexOf(current)
      const next = STATUSES[(idx + 1) % STATUSES.length]
      const updated = { ...prev, [id]: next }
      localStorage.setItem('rds_transfer_statuses', JSON.stringify(updated))
      return updated
    })
  }

  useEffect(() => {
    fetch('/api/transfers-data')
      .then(r => r.json())
      .then(d => { setBookings(d.bookings || []); if (d.api_error) setApiError(d.api_error); if (!d.version) setApiError('Old API version - redeploy needed'); setLoading(false) })
      .catch(err => { setApiError(err.message); setLoading(false) })
  }, [])

  // Build transfer rows — each booking can have up to 3 transfer legs
  const transferRows = useMemo(() => {
    const rows = []
    const today = new Date().toISOString().split('T')[0]

    bookings.forEach(bk => {
      const clientName = [bk.First_Name, bk.Last_Name].filter(Boolean).join(' ') || bk.Name || ''
      const tourName = bk.Tour_Name || (bk.Tour ? (typeof bk.Tour === 'object' ? bk.Tour.name : bk.Tour) : '') || ''
      const tourStart = bk.Tour_start_date || ''
      const tourEnd = bk.Tour_end_date || ''
      const status = bk.Booking_Status || ''

      // Skip cancelled bookings
      if (status === 'Cancelled' || status === 'Refunded') return

      // Skip past tours (client-side filter as backup)
      const endOrStart = tourEnd || tourStart
      if (endOrStart && endOrStart < today) return

      // Arrival transfer
      if (bk.Arrival_Flight_Details || bk.Request_Capey_Leg_1) {
        rows.push({
          id: bk.id + '_arrival',
          bookingId: bk.id,
          client: clientName,
          tour: tourName,
          leg: 'Arrival',
          date: tourStart,
          flightDetails: bk.Arrival_Flight_Details || '',
          pax: bk.No_of_Pax_Leg_1 || '',
          hotel: bk.Transfer_Hotel_Leg_1_Override || '',
          requestCapey: bk.Request_Capey_Leg_1,
          capeyStatus: bk.Capey_Status_Leg_1 || '',
          bookingStatus: status,
        })
      }

      // Departure transfer (from tour destination)
      if (bk.Departure_Flight_Details || bk.Request_Capey_Departure) {
        rows.push({
          id: bk.id + '_departure',
          bookingId: bk.id,
          client: clientName,
          tour: tourName,
          leg: 'Departure',
          date: tourEnd,
          flightDetails: bk.Departure_Flight_Details || '',
          pax: bk.No_of_Pax_Departure || '',
          hotel: '',
          requestCapey: bk.Request_Capey_Departure,
          capeyStatus: bk.Capey_Status_Departure || '',
          bookingStatus: status,
        })
      }

      // Home departure (CT to home)
      const homeFlight = bk.Departure_Flight_Details_CT_to_home || bk.Departure_Flight_from_CT_to_Home || ''
      if (homeFlight || bk.Request_Capey_home_departure) {
        rows.push({
          id: bk.id + '_home',
          bookingId: bk.id,
          client: clientName,
          tour: tourName,
          leg: 'CT → Home',
          date: tourEnd,
          flightDetails: homeFlight,
          pax: bk.No_of_Pax_Home_departure || '',
          hotel: '',
          requestCapey: bk.Request_Capey_home_departure,
          capeyStatus: bk.Capey_Status_Home_Departure || '',
          bookingStatus: status,
        })
      }

      // Additional transfers
      if (bk.Additional_Transfers_Required) {
        rows.push({
          id: bk.id + '_additional',
          bookingId: bk.id,
          client: clientName,
          tour: tourName,
          leg: 'Additional',
          date: tourStart,
          flightDetails: bk.Additional_Transfers_Required,
          pax: '',
          hotel: '',
          requestCapey: false,
          capeyStatus: '',
          bookingStatus: status,
        })
      }
    })

    // Sort by date
    rows.sort((a, b) => (a.date || '').localeCompare(b.date || ''))

    return rows
  }, [bookings])

  // Get unique tour names
  const tourNames = useMemo(() => {
    const names = new Set()
    transferRows.forEach(r => { if (r.tour) names.add(r.tour) })
    return Array.from(names).sort()
  }, [transferRows])

  // Filter
  const filtered = useMemo(() => {
    let result = transferRows

    if (tourFilter !== 'all') {
      result = result.filter(r => r.tour === tourFilter)
    }

    if (statusFilter === 'pending') {
      result = result.filter(r => !r.capeyStatus || r.capeyStatus === 'Pending' || r.capeyStatus === 'Not Requested')
    } else if (statusFilter === 'confirmed') {
      result = result.filter(r => r.capeyStatus === 'Confirmed' || r.capeyStatus === 'Booked')
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(r =>
        r.client.toLowerCase().includes(q) ||
        r.flightDetails.toLowerCase().includes(q) ||
        r.tour.toLowerCase().includes(q) ||
        r.leg.toLowerCase().includes(q)
      )
    }

    return result
  }, [transferRows, tourFilter, statusFilter, search])

  // Group by tour date for display
  const today = new Date().toISOString().split('T')[0]
  const upcoming = filtered.filter(r => (r.date || '') >= today)
  const past = filtered.filter(r => (r.date || '') < today)

  return (
    <div>
      <h1 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>Transfers</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
        {loading ? 'Loading...' : `${transferRows.length} transfer legs across ${bookings.length} bookings`}
      </p>

      {apiError && (
        <div style={{ padding: '8px 12px', marginBottom: 12, background: '#FEF5F5', border: '1px solid #E57373', borderRadius: 6, fontSize: 13, color: '#C62828' }}>
          API error: {apiError}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {['all', 'pending', 'confirmed'].map(f => (
          <button
            key={f}
            className={'filter-btn' + (statusFilter === f ? ' active' : '')}
            onClick={() => setStatusFilter(f)}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <span style={{ fontSize: 12, color: 'var(--text-hint)', padding: '5px 4px' }}>|</span>
        <button
          className={'filter-btn' + (tourFilter === 'all' ? ' active' : '')}
          onClick={() => setTourFilter('all')}
        >All tours</button>
        {tourNames.slice(0, 15).map(t => (
          <button
            key={t}
            className={'filter-btn' + (tourFilter === t ? ' active' : '')}
            onClick={() => setTourFilter(tourFilter === t ? 'all' : t)}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search client, flight, tour..."
        style={{
          width: '100%', maxWidth: 400, fontSize: 13, padding: '8px 12px',
          border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-md)',
          outline: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)',
          marginBottom: 16,
        }}
      />

      {!loading && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Showing {filtered.length} transfers ({upcoming.length} upcoming, {past.length} past)
        </div>
      )}

      {/* Table */}
      <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 320px)', overflow: 'auto' }}>
        <table style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 80 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: '25%' }} />
            <col style={{ width: 50 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 95 }} />
          </colgroup>
          <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--bg-primary)' }}>
            <tr>
              <th>Date</th>
              <th>Client</th>
              <th>Tour</th>
              <th>Leg</th>
              <th>Flight details</th>
              <th>Pax</th>
              <th>Hotel</th>
              <th>Capey</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>Loading transfers...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>
                {transferRows.length === 0 ? 'No transfer data found in bookings.' : 'No transfers match this filter.'}
              </td></tr>
            ) : (
              filtered.map(r => {
                const isPast = (r.date || '') < today
                const capeyColor = r.capeyStatus === 'Confirmed' || r.capeyStatus === 'Booked'
                  ? 'var(--green-text)'
                  : r.capeyStatus === 'Pending' ? 'var(--amber-text)'
                  : 'var(--text-muted)'

                return (
                  <tr key={r.id} style={{ opacity: isPast ? 0.6 : 1 }}>
                    <td style={{
                      fontWeight: 500,
                      color: isPast ? 'var(--text-muted)' : 'var(--text-primary)',
                    }}>
                      {r.date ? fmtDate(r.date) : '—'}
                    </td>
                    <td style={{ fontWeight: 500 }}>{r.client}</td>
                    <td style={{ fontSize: 12 }}>{r.tour}</td>
                    <td>
                      <span style={{
                        fontSize: 11, fontWeight: 500,
                        color: r.leg === 'Arrival' ? 'var(--green-text)' :
                               r.leg === 'Departure' ? 'var(--blue-text)' :
                               r.leg === 'CT → Home' ? 'var(--amber-text)' : 'var(--text-muted)',
                      }}>
                        {r.leg}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {r.flightDetails || '—'}
                    </td>
                    <td style={{ fontSize: 12, textAlign: 'center' }}>{r.pax || '—'}</td>
                    <td style={{ fontSize: 12 }}>{r.hotel || '—'}</td>
                    <td>
                      {r.capeyStatus ? (
                        <span style={{ fontSize: 11, fontWeight: 500, color: capeyColor }}>
                          {r.capeyStatus}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {r.requestCapey ? 'Requested' : '—'}
                        </span>
                      )}
                    </td>
                    <td>
                      {(() => {
                        const st = transferStatuses[r.id] || 'Not started'
                        const sc = STATUS_COLORS[st] || STATUS_COLORS['Not started']
                        return (
                          <button
                            onClick={() => cycleStatus(r.id)}
                            style={{
                              fontSize: 10, fontWeight: 500, padding: '3px 8px',
                              borderRadius: 4, border: '1px solid ' + sc.border,
                              background: sc.bg, color: sc.color,
                              cursor: 'pointer', whiteSpace: 'nowrap',
                            }}
                          >
                            {st}
                          </button>
                        )
                      })()}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
