import React, { useState } from 'react'
import { fmtDate, fmtDateFull, fmtCurrency, getStatusBadge, isActiveBooking, isConfirmed, getStatus } from '../utils/helpers'

export default function Itinerary({ tour, lodges, onSelectBooking, onEditItinerary, onDeleteTour, onEnquireReady, onRefresh }) {
  const [marking, setMarking] = useState(false)
  const [editing, setEditing] = useState(null) // { id, field, value }
  const [savingEdit, setSavingEdit] = useState(false)

  if (!tour) return null

  // Build lodge lookup
  const lodgeLookup = {}
  ;(lodges || []).forEach(l => {
    if (l.name) lodgeLookup[l.name.toLowerCase()] = l
  })
  const lookupLodge = (name) => name ? (lodgeLookup[name.toLowerCase()] || null) : null

  const allBookings = tour.bookings || []
  const active = allBookings.filter(isActiveBooking)
  const sorted = active.slice().sort((a, b) => {
    const dA = a['Check-in'] || a.Check_in_Date || ''
    const dB = b['Check-in'] || b.Check_in_Date || ''
    return dA.localeCompare(dB)
  })

  // Stats
  const confirmed = sorted.filter(b => isConfirmed(b)).length
  const enquired = sorted.filter(b => getStatus(b) === 'Enquiry Sent').length
  const notStarted = sorted.filter(b => getStatus(b) === 'Not Started').length
  const readyToSend = sorted.filter(b => { const s = getStatus(b); return s === 'Ready to send' || s === 'Ready to Send' }).length

  const firstBk = sorted[0]
  const roomConfig = firstBk ? (firstBk['Sgl/Twin/Dbl/Guides'] || firstBk.Sgl_Twin_Dbl_Guides || '') : ''

  // Mark all "Not Started" bookings as "Ready to send"
  const handleMarkAllReady = async () => {
    const toMark = sorted
      .filter(b => getStatus(b) === 'Not Started' && (b.Lodge_Name || b.Name || '').trim())
      .map(b => b.id || b['Record Id'])
      .filter(Boolean)

    if (!toMark.length) {
      alert('No bookings to mark as ready. All bookings need a lodge assigned and status "Not Started".')
      return
    }

    setMarking(true)
    try {
      const res = await fetch('/api/update-bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_ids: toMark,
          updates: { Status: 'Ready to Send' },
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to update')
      }
      if (onRefresh) onRefresh()
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setMarking(false)
    }
  }

  // Inline edit a booking field
  const handleInlineSave = async () => {
    if (!editing) return
    setSavingEdit(true)
    try {
      const updates = {}
      if (editing.field === 'lodge') {
        updates.Lodge_Name = editing.value
        updates.Name = editing.value + ' - ' + (editing.checkIn || '')
      }
      const res = await fetch('/api/update-bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_ids: [editing.id], updates }),
      })
      if (!res.ok) throw new Error('Failed to update')
      setEditing(null)
      if (onRefresh) onRefresh()
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 500 }}>{tour.name}</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            {sorted.length} nights
            {tour.departure_date ? ' · Departs ' + fmtDateFull(tour.departure_date) : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn" onClick={onEditItinerary}>
            {sorted.length === 0 ? 'Create itinerary' : 'Edit itinerary'}
          </button>
          {notStarted > 0 && (
            <button className="btn" onClick={handleMarkAllReady} disabled={marking}>
              {marking ? 'Marking...' : 'Mark all ready (' + notStarted + ')'}
            </button>
          )}
          {readyToSend > 0 && (
            <button className="btn btn-primary" onClick={onEnquireReady}>
              Enquire all ready ({readyToSend})
            </button>
          )}
          {onDeleteTour && (
            <button
              onClick={onDeleteTour}
              style={{
                background: 'none', border: 'none', fontSize: 12,
                color: 'var(--text-muted)', cursor: 'pointer', padding: '4px 8px',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--red-text)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              Delete tour
            </button>
          )}
        </div>
      </div>

      {/* Tour config — room requirements for enquiries */}
      <TourConfig tour={tour} />

      {/* Table */}
      <div className="table-wrap">
        <table style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 50 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '24%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 70 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Night</th>
              <th>Date</th>
              <th>Route</th>
              <th>Lodge</th>
              <th>Meals</th>
              <th>Amount</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((bk, i) => {
              const status = getStatus(bk)
              const badge = getStatusBadge(status)
              const lodge = (bk.Lodge_Name || bk['Lodge Booking Name'] || bk.Name || '').split(' - ')[0]
              const dayDesc = bk['Day Description'] || bk.Day_Description || ''
              const checkIn = bk['Check-in'] || bk.Check_in_Date || ''
              const amount = bk['Total Amount'] || bk.Total_Amount
              const currency = bk['Currency'] || bk.Lodge_Currency || ''
              const meals = bk['Meals'] || bk.Meals || ''

              const nightMatch = dayDesc.match(/Day\s*(\d+)/)
              const nightNum = nightMatch ? nightMatch[1] : String(i + 1).padStart(2, '0')

              const routeMatch = dayDesc.match(/Day\s*\d+:\s*(.+)/)
              const route = routeMatch ? routeMatch[1] : dayDesc

              return (
                <tr key={bk['Record Id'] || bk.id || i}>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{nightNum}</td>
                  <td>{fmtDate(checkIn)}</td>
                  <td>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{route}</div>
                  </td>
                  <td>
                    {editing && editing.id === (bk.id || bk['Record Id']) && editing.field === 'lodge' ? (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input
                          type="text"
                          value={editing.value}
                          onChange={e => setEditing({ ...editing, value: e.target.value })}
                          onKeyDown={e => { if (e.key === 'Enter') handleInlineSave(); if (e.key === 'Escape') setEditing(null) }}
                          autoFocus
                          style={{
                            flex: 1, fontSize: 13, fontWeight: 500, padding: '2px 6px',
                            border: '0.5px solid var(--blue-mid)', borderRadius: 4,
                            outline: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)',
                          }}
                        />
                        <button onClick={handleInlineSave} disabled={savingEdit} style={{
                          fontSize: 11, padding: '2px 8px', border: '0.5px solid var(--border-default)',
                          borderRadius: 4, background: 'var(--bg-primary)', cursor: 'pointer', color: 'var(--blue-text)',
                        }}>{savingEdit ? '...' : 'Save'}</button>
                        <button onClick={() => setEditing(null)} style={{
                          fontSize: 11, padding: '2px 6px', border: 'none',
                          background: 'none', cursor: 'pointer', color: 'var(--text-muted)',
                        }}>×</button>
                      </div>
                    ) : (
                      <div
                        onClick={() => setEditing({ id: bk.id || bk['Record Id'], field: 'lodge', value: lodge, checkIn: checkIn })}
                        style={{ fontWeight: 500, cursor: 'pointer' }}
                        title="Click to edit"
                      >{lodge}</div>
                    )}
                    {lodge && (() => {
                      const lr = lookupLodge(lodge)
                      if (!lr) return <div style={{ fontSize: 10, color: 'var(--red-text)' }}>Not in Zoho</div>
                      if (!lr.email) return <div style={{ fontSize: 10, color: 'var(--amber-text)' }}>No email</div>
                      return <div style={{ fontSize: 10, color: 'var(--green-text)' }}>{lr.email}</div>
                    })()}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{meals}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 12 }}>
                    {amount ? fmtCurrency(amount, currency) : '—'}
                  </td>
                  <td>
                    {editing && editing.id === (bk.id || bk['Record Id']) && editing.field === 'status' ? (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <select
                          value={editing.value}
                          onChange={e => {
                            const newVal = e.target.value
                            setEditing({ ...editing, value: newVal })
                            // Auto-save on select
                            setSavingEdit(true)
                            fetch('/api/update-bookings', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ booking_ids: [editing.id], updates: { Status: newVal } }),
                            }).then(res => {
                              if (!res.ok) throw new Error('Failed')
                              setEditing(null)
                              if (onRefresh) onRefresh()
                            }).catch(err => alert('Error: ' + err.message))
                            .finally(() => setSavingEdit(false))
                          }}
                          autoFocus
                          onBlur={() => setTimeout(() => setEditing(null), 200)}
                          style={{
                            fontSize: 12, padding: '2px 4px',
                            border: '0.5px solid var(--blue-mid)', borderRadius: 4,
                            outline: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)',
                          }}
                        >
                          <option value="Not Started">Not Started</option>
                          <option value="Ready to Send">Ready to Send</option>
                          <option value="Enquiry Sent">Enquiry Sent</option>
                          <option value="Availability Confirmed">Availability Confirmed</option>
                          <option value="Confirmed">Confirmed</option>
                          <option value="Proforma Received">Proforma Received</option>
                          <option value="Deposit Paid">Deposit Paid</option>
                          <option value="Balance Paid">Balance Paid</option>
                          <option value="Not Available">Not Available</option>
                          <option value="Cancelled">Cancelled</option>
                          <option value="Waitlisted">Waitlisted</option>
                          <option value="Credit against booking">Credit against booking</option>
                        </select>
                      </div>
                    ) : (
                      <span
                        className={'badge ' + badge.cls}
                        onClick={() => setEditing({ id: bk.id || bk['Record Id'], field: 'status', value: status })}
                        style={{ cursor: 'pointer' }}
                        title="Click to change status"
                      >{badge.label}</span>
                    )}
                  </td>
                  <td>
                    <button
                      className="btn btn-sm"
                      onClick={() => onSelectBooking(bk)}
                      style={{ fontSize: 12, padding: '4px 8px' }}
                    >
                      View
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Summary bar */}
      <div style={{
        display: 'flex', gap: 16, marginTop: 16,
        padding: '12px 16px', background: 'var(--bg-secondary)',
        borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--text-muted)',
      }}>
        <span><strong style={{ color: 'var(--text-primary)' }}>{confirmed}</strong> confirmed</span>
        <span><strong style={{ color: 'var(--text-primary)' }}>{enquired}</strong> enquired</span>
        <span><strong style={{ color: 'var(--text-primary)' }}>{readyToSend}</strong> ready to send</span>
        <span><strong style={{ color: 'var(--text-primary)' }}>{notStarted}</strong> not started</span>
      </div>
    </div>
  )
}

function TourConfig({ tour }) {
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState({
    pax_single: tour.pax_single || 8,
    pax_twin: tour.pax_twin || 2,
    pax_double: tour.pax_double || 1,
    guide_rooms: tour.guide_rooms || 3,
    num_riders: tour.num_riders || 12,
    max_guests: tour.max_guests || 12,
  })

  const totalPax = config.pax_single + (config.pax_twin * 2) + (config.pax_double * 2)
  const totalRooms = config.pax_single + config.pax_twin + config.pax_double + config.guide_rooms
  const hasConfig = totalPax > 0 || config.guide_rooms > 0

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/update-tour', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tour_id: tour.id, updates: {
          Pax_in_Single_Rooms: config.pax_single,
          Pax_in_Shared_Twin_Rooms: config.pax_twin,
          Pax_in_Shared_Double_Rooms: config.pax_double,
          Guide_Rooms: config.guide_rooms,
          Number_of_riders: config.num_riders,
          Max_Guests: config.max_guests,
        }})
      })
      if (!res.ok) throw new Error('Failed to save')
    } catch(err) {
      alert('Error saving: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const Field = ({ label, field }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <label style={{ fontSize: 12, color: 'var(--text-muted)', width: 100 }}>{label}</label>
      <input
        type="number" min="0" value={config[field]}
        onChange={e => setConfig(prev => ({ ...prev, [field]: parseInt(e.target.value) || 0 }))}
        style={{
          width: 50, fontSize: 13, padding: '3px 6px', textAlign: 'center',
          border: '0.5px solid var(--border-default)', borderRadius: 4,
          background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none',
        }}
      />
    </div>
  )

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        style={{
          display: 'flex', gap: 16, marginBottom: 16,
          padding: '10px 16px', background: hasConfig ? 'var(--bg-secondary)' : 'var(--amber-bg)',
          borderRadius: 'var(--radius-md)', fontSize: 12,
          color: hasConfig ? 'var(--text-muted)' : 'var(--amber-text)',
          border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer',
        }}
      >
        {hasConfig ? (
          <>
            <span>{totalPax} pax</span>
            <span>{config.pax_single} single, {config.pax_twin} twin, {config.pax_double} double</span>
            <span>{config.guide_rooms} guide room{config.guide_rooms !== 1 ? 's' : ''}</span>
            <span>{totalRooms} rooms total</span>
            <span style={{ marginLeft: 'auto' }}>Edit</span>
          </>
        ) : (
          <span>Room configuration not set — click to configure before sending enquiries</span>
        )}
      </button>
    )
  }

  return (
    <div style={{
      padding: 16, marginBottom: 16,
      border: '0.5px solid var(--border-default)',
      borderRadius: 'var(--radius-lg)',
      background: 'var(--bg-primary)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Room configuration</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={handleSave} disabled={saving} style={{ fontSize: 12, padding: '4px 12px' }}>
            {saving ? 'Saving...' : 'Save to Zoho'}
          </button>
          <button onClick={() => setExpanded(false)} style={{
            background: 'none', border: 'none', fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer',
          }}>Close</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
        <Field label="Single rooms" field="pax_single" />
        <Field label="Shared twin" field="pax_twin" />
        <Field label="Shared double" field="pax_double" />
        <Field label="Guide rooms" field="guide_rooms" />
        <Field label="Riders" field="num_riders" />
        <Field label="Max guests" field="max_guests" />
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
        {totalPax} pax · {totalRooms} rooms total
      </div>
    </div>
  )
}