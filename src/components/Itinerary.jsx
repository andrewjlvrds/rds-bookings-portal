import React from 'react'
import { fmtDate, fmtDateFull, fmtCurrency, getStatusBadge, isActiveBooking, isConfirmed, getStatus } from '../utils/helpers'

export default function Itinerary({ tour, onSelectBooking, onEditItinerary }) {
  if (!tour) return null

  const allBookings = tour.bookings || []
  // Separate active bookings from alternatives
  const active = allBookings.filter(isActiveBooking)
  const sorted = active.slice().sort((a, b) => {
    const dA = a['Check-in'] || a.Check_in_Date || ''
    const dB = b['Check-in'] || b.Check_in_Date || ''
    return dA.localeCompare(dB)
  })

  // Find alternatives for each date
  const altsByDate = {}
  allBookings.filter(b => !isActiveBooking(b)).forEach(bk => {
    const date = bk['Check-in'] || bk.Check_in_Date || ''
    if (!altsByDate[date]) altsByDate[date] = []
    altsByDate[date].push(bk)
  })

  // Stats
  const confirmed = sorted.filter(b => isConfirmed(b)).length
  const enquired = sorted.filter(b => (getStatus(b)) === 'Enquiry Sent').length
  const ready = sorted.filter(b => (getStatus(b)) === 'Not Started').length

  // Get room config from first booking
  const firstBk = sorted[0]
  const roomConfig = firstBk ? (firstBk['Sgl/Twin/Dbl/Guides'] || firstBk.Sgl_Twin_Dbl_Guides || '') : ''

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 500 }}>{tour.name}</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            {sorted.length} nights
            {roomConfig ? ' · Pax: ' + roomConfig : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={onEditItinerary}>
            {sorted.length === 0 ? 'Create itinerary' : 'Edit itinerary'}
          </button>
          {sorted.length > 0 && (
            <button className="btn btn-primary">Enquire all ready</button>
          )}
        </div>
      </div>

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
            <col style={{ width: 80 }} />
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
              const lodge = (bk['Lodge Booking Name'] || bk.Lodge_Booking_Name || bk.Name || '').split(' - ')[0]
              const dayDesc = bk['Day Description'] || bk.Day_Description || ''
              const checkIn = bk['Check-in'] || bk.Check_in_Date || ''
              const amount = bk['Total Amount'] || bk.Total_Amount
              const currency = bk['Currency'] || bk.Lodge_Currency || ''
              const meals = bk['Meals'] || bk.Meals || ''
              const alts = altsByDate[checkIn] || []

              // Extract night number from day description
              const nightMatch = dayDesc.match(/Day\s*(\d+)/)
              const nightNum = nightMatch ? nightMatch[1] : ''

              // Extract route from day description
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
                    <div style={{ fontWeight: 500 }}>{lodge}</div>
                    {alts.length > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {alts.length} alternative{alts.length > 1 ? 's' : ''} tried
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{meals}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 12 }}>
                    {amount ? fmtCurrency(amount, currency) : '—'}
                  </td>
                  <td>
                    <span className={'badge ' + badge.cls}>{badge.label}</span>
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
        <span><strong style={{ color: 'var(--text-primary)' }}>{ready}</strong> ready to send</span>
        <span><strong style={{ color: 'var(--text-primary)' }}>{sorted.length - confirmed - enquired - ready}</strong> other</span>
      </div>
    </div>
  )
}
