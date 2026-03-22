import React from 'react'
import { fmtDate, fmtDateFull, fmtCurrency, getStatusBadge, isConfirmed, isActiveBooking, today, daysBetween, getTourName, getStatus } from '../utils/helpers'
import { categorizeTours } from './Layout'

export default function Dashboard({ tours, allBookings, onSelectTour, onSelectView }) {
  const { newBuild, upcoming } = categorizeTours(tours)
  const activeTours = [...newBuild, ...upcoming]

  // Only count bookings from active tours
  const activeBookings = activeTours.flatMap(t => (t.bookings || []).filter(isActiveBooking))

  // Metrics
  const totalLodges = activeBookings.length
  const confirmed = activeBookings.filter(b => isConfirmed(b)).length
  const needsAttention = computeNeedsAttention(activeTours.flatMap(t => t.bookings || []))

  return (
    <div>
      <h1 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>Lodge bookings</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
        {activeTours.length} active tours · {totalLodges} bookings
      </p>

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 24 }}>
        <div className="metric-card">
          <div className="metric-label">Active tours</div>
          <div className="metric-value">{activeTours.length}</div>
          <div className="metric-sub">{activeTours.map(t => t.name).join(', ')}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Total lodges</div>
          <div className="metric-value">{totalLodges}</div>
          <div className="metric-sub">across all tours</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Confirmed</div>
          <div className="metric-value" style={{ color: 'var(--green-text)' }}>{confirmed}</div>
          <div className="metric-sub">{totalLodges ? Math.round(confirmed / totalLodges * 100) : 0}% of total</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Needs attention</div>
          <div className="metric-value" style={{ color: needsAttention.length > 0 ? 'var(--red-text)' : 'var(--green-text)' }}>
            {needsAttention.length}
          </div>
          <div className="metric-sub">
            {needsAttention.length === 0 ? 'All good' : summarizeAttention(needsAttention)}
          </div>
        </div>
      </div>

      {/* Needs attention */}
      {needsAttention.length > 0 && (
        <div className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-head">
            Needs attention
            <span style={{
              background: 'var(--red-bg)', color: 'var(--red-text)',
              fontSize: 11, padding: '1px 7px', borderRadius: 10, fontWeight: 500
            }}>{needsAttention.length}</span>
          </div>
          <div>
            {needsAttention.slice(0, 8).map((item, i) => (
              <AttentionRow key={i} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* Tours */}
      {newBuild.length > 0 && (
        <>
          <h2 style={{ fontSize: 15, fontWeight: 500, marginBottom: 10 }}>New tours — clean build</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginBottom: 24 }}>
            {newBuild.map(tour => (
              <TourCard
                key={tour.id}
                tour={tour}
                onClick={() => { onSelectTour(tour); onSelectView('itinerary') }}
              />
            ))}
          </div>
        </>
      )}

      {upcoming.length > 0 && (
        <>
          <h2 style={{ fontSize: 15, fontWeight: 500, marginBottom: 10 }}>Upcoming tours</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {upcoming.map(tour => (
              <TourCard
                key={tour.id}
                tour={tour}
                onClick={() => { onSelectTour(tour); onSelectView('itinerary') }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function TourCard({ tour, onClick }) {
  const bookings = (tour.bookings || []).filter(isActiveBooking)
  const total = bookings.length
  const confirmed = bookings.filter(b => isConfirmed(b)).length
  const enquired = bookings.filter(b => (getStatus(b)) === 'Enquiry Sent').length
  const ready = bookings.filter(b => (getStatus(b)) === 'Not Started').length
  const unavail = bookings.filter(b => (getStatus(b)) === 'Not Available').length

  const pctConfirmed = total ? Math.round(confirmed / total * 100) : 0
  const pctEnquired = total ? Math.round(enquired / total * 100) : 0
  const pctReady = total ? Math.round(ready / total * 100) : 0
  const pctUnavail = total ? Math.round(unavail / total * 100) : 0

  // Get date range
  const dates = bookings.map(b => b['Check-in'] || b.Check_in_Date || '').filter(Boolean).sort()
  const firstDate = dates[0]
  const lastDate = dates[dates.length - 1]

  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        border: '0.5px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)',
        padding: '14px 16px',
        background: 'var(--bg-primary)',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)' }}
    >
      <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 6 }}>{tour.name}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
        {firstDate && lastDate ? fmtDateFull(firstDate) + ' — ' + fmtDateFull(lastDate) : 'No dates'} · {total} nights
      </div>

      {/* Progress bar */}
      <div style={{
        height: 6, background: 'var(--bg-secondary)', borderRadius: 3,
        overflow: 'hidden', display: 'flex',
      }}>
        {pctConfirmed > 0 && <div style={{ width: pctConfirmed + '%', background: '#639922' }} />}
        {pctEnquired > 0 && <div style={{ width: pctEnquired + '%', background: '#BA7517' }} />}
        {pctReady > 0 && <div style={{ width: pctReady + '%', background: '#378ADD' }} />}
        {pctUnavail > 0 && <div style={{ width: pctUnavail + '%', background: '#E24B4A' }} />}
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
        {confirmed > 0 && <span><Dot color="#639922" /> {confirmed} confirmed</span>}
        {enquired > 0 && <span><Dot color="#BA7517" /> {enquired} enquired</span>}
        {ready > 0 && <span><Dot color="#378ADD" /> {ready} ready</span>}
        {unavail > 0 && <span><Dot color="#E24B4A" /> {unavail} unavail</span>}
      </div>
    </button>
  )
}

function Dot({ color }) {
  return (
    <span style={{
      display: 'inline-block',
      width: 8, height: 8, borderRadius: '50%',
      background: color, verticalAlign: 'middle', marginRight: 3,
    }} />
  )
}

function AttentionRow({ item }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '10px 14px',
      borderBottom: '0.5px solid var(--border-light)',
      fontSize: 13,
    }}>
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.tour} · {item.context}</div>
        <div style={{ fontWeight: 500 }}>{item.title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.detail}</div>
      </div>
      <button className="btn btn-sm">{item.action}</button>
    </div>
  )
}

// Compute items needing attention
function computeNeedsAttention(bookings) {
  const items = []
  const now = today()

  bookings.forEach(bk => {
    const status = getStatus(bk)
    const lodge = bk['Lodge Booking Name'] || bk.Lodge_Booking_Name || bk.Name || ''
    const tour = getTourName(bk)
    const dayDesc = bk['Day Description'] || bk.Day_Description || ''

    // Skip alternatives
    if (dayDesc.startsWith('Z ') || dayDesc.startsWith('z ')) return

    // Overdue payments
    const paymentFields = [
      ['Deposit', bk['Deposit Due Date'] || bk.Deposit_Due_Date, bk['Deposit Amount'] || bk.Deposit_Amount],
      ['2nd payment', bk['2nd  Payment Due Date'] || bk.Second_Payment_Due_Date, bk['2nd Payment Amount'] || bk.Second_Payment_Amount],
    ]
    paymentFields.forEach(([label, dueDate, amount]) => {
      if (dueDate && amount && dueDate < now && status !== 'Balance Paid') {
        items.push({
          type: 'overdue',
          tour,
          context: 'Night ' + (bk['Day Description'] || '').replace(/Day\s+/, '').split(':')[0],
          title: lodge.split(' - ')[0] + ' — payment overdue',
          detail: label + ' ' + fmtCurrency(amount, bk['Currency'] || bk.Lodge_Currency) + ' was due ' + fmtDateFull(dueDate),
          action: 'Review',
        })
      }
    })

    // Waitlisted
    if (status === 'Waitlisted') {
      items.push({
        type: 'waitlisted',
        tour,
        context: fmtDate(bk['Check-in'] || bk.Check_in_Date),
        title: lodge.split(' - ')[0] + ' — waitlisted',
        detail: 'Check for availability update or try backup',
        action: 'Review',
      })
    }
  })

  return items
}

function summarizeAttention(items) {
  const types = {}
  items.forEach(i => { types[i.type] = (types[i.type] || 0) + 1 })
  return Object.entries(types).map(([t, n]) => n + ' ' + t).join(', ')
}
