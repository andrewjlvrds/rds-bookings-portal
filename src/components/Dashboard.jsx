import React, { useState } from 'react'
import { fmtDate, fmtDateFull, fmtCurrency, getStatusBadge, isConfirmed, isActiveBooking, today, daysBetween, getTourName, getStatus } from '../utils/helpers'
import { categorizeTours } from './Layout'

export default function Dashboard({ tours, allBookings, onSelectTour, onSelectView }) {
  const [showAttention, setShowAttention] = useState(false)
  const { newBuild, drafts, yearGroups, years, past } = categorizeTours(tours)
  const now = today()

  // Draft tours from categorizeTours (local_ prefix IDs)
  const draftTours = drafts

  // All active tours (all year groups combined)
  const activeTours = years.flatMap(y => yearGroups[y])
  const allActiveBookings = activeTours.flatMap(t => (t.bookings || []).filter(isActiveBooking))

  // Payment metrics across all active bookings
  const allPayableBookings = [...activeTours, ...newBuild].flatMap(t => t.bookings || [])
  const payments = extractPaymentSummary(allPayableBookings, now)

  // Needs attention
  const needsAttention = computeNeedsAttention(allPayableBookings)

  // Overall metrics
  const totalLodges = allActiveBookings.length
  const confirmed = allActiveBookings.filter(b => isConfirmed(b)).length

  return (
    <div>
      <h1 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>Lodge bookings</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
        {activeTours.length + newBuild.length} active tour{activeTours.length + newBuild.length !== 1 ? 's' : ''} · {totalLodges} bookings
      </p>

      {/* Top metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 24 }}>
        <div className="metric-card">
          <div className="metric-label">Active tours</div>
          <div className="metric-value">{activeTours.length + newBuild.length}</div>
          <div className="metric-sub">{years.map(y => y + ': ' + yearGroups[y].length).join(', ')}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Total lodges</div>
          <div className="metric-value">{totalLodges}</div>
          <div className="metric-sub">{confirmed} confirmed ({totalLodges ? Math.round(confirmed / totalLodges * 100) : 0}%)</div>
        </div>
        <div className="metric-card" style={{ cursor: 'pointer' }} onClick={() => onSelectView('payments')}>
          <div className="metric-label">Overdue payments</div>
          <div className="metric-value" style={{ color: payments.overdue > 0 ? 'var(--red-text)' : 'var(--green-text)' }}>
            {payments.overdue > 0 ? payments.overdue : 'None'}
          </div>
          <div className="metric-sub">{payments.overdue > 0 ? 'R ' + payments.overdueTotal.toLocaleString() : 'All up to date'}</div>
        </div>
        <div className="metric-card" style={{ cursor: needsAttention.length > 0 ? 'pointer' : 'default' }} onClick={() => needsAttention.length > 0 && setShowAttention(!showAttention)}>
          <div className="metric-label">Needs attention</div>
          <div className="metric-value" style={{ color: needsAttention.length > 0 ? 'var(--red-text)' : 'var(--green-text)' }}>
            {needsAttention.length}
          </div>
          <div className="metric-sub">
            {needsAttention.length === 0 ? 'All good' : summarizeAttention(needsAttention)}
          </div>
        </div>
      </div>

      {/* Needs attention — shown on click */}
      {showAttention && needsAttention.length > 0 && (
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

      {/* Payments summary */}
      {(payments.dueSoon > 0 || payments.overdue > 0) && (
        <div className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-head">
            Upcoming payments
            <button className="btn btn-sm" style={{ fontSize: 11 }} onClick={() => onSelectView('payments')}>View all</button>
          </div>
          <div style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', gap: 24, fontSize: 13 }}>
              {payments.overdue > 0 && (
                <div>
                  <span style={{ color: 'var(--red-text)', fontWeight: 500 }}>{payments.overdue} overdue</span>
                  <span style={{ color: 'var(--text-muted)' }}> · R {payments.overdueTotal.toLocaleString()}</span>
                </div>
              )}
              {payments.dueSoon > 0 && (
                <div>
                  <span style={{ color: 'var(--amber-text)', fontWeight: 500 }}>{payments.dueSoon} due this week</span>
                  <span style={{ color: 'var(--text-muted)' }}> · R {payments.dueSoonTotal.toLocaleString()}</span>
                </div>
              )}
              <div>
                <span style={{ fontWeight: 500 }}>{payments.upcoming} upcoming</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tours by year */}
      {years.map(year => (
        <div key={year} style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 500, marginBottom: 10 }}>{year} Tours</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {yearGroups[year].map(tour => (
              <TourCard
                key={tour.id}
                tour={tour}
                onClick={() => { onSelectTour(tour); onSelectView('itinerary') }}
              />
            ))}
          </div>
        </div>
      ))}

      {/* New & draft tours */}
      {(newBuild.length > 0 || draftTours.length > 0) && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 500, marginBottom: 10 }}>New tours</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {[...newBuild, ...draftTours].map(tour => (
              <TourCard
                key={tour.id}
                tour={tour}
                onClick={() => { onSelectTour(tour); onSelectView('itinerary') }}
                isDraft={typeof tour.id === 'string' && tour.id.startsWith('local_')}
              />
            ))}
          </div>
        </div>
      )}

      {activeTours.length === 0 && newBuild.length === 0 && draftTours.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)' }}>
          No tours to display. Create a new tour from the sidebar.
        </div>
      )}
    </div>
  )
}

function TourCard({ tour, onClick, isDraft }) {
  const bookings = (tour.bookings || []).filter(isActiveBooking)
  const total = bookings.length
  const confirmed = bookings.filter(b => isConfirmed(b)).length
  const enquired = bookings.filter(b => getStatus(b) === 'Enquiry Sent').length
  const ready = bookings.filter(b => getStatus(b) === 'Not Started' || getStatus(b) === 'Ready to Send').length
  const unavail = bookings.filter(b => getStatus(b) === 'Not Available').length

  const pctConfirmed = total ? Math.round(confirmed / total * 100) : 0
  const pctEnquired = total ? Math.round(enquired / total * 100) : 0
  const pctReady = total ? Math.round(ready / total * 100) : 0
  const pctUnavail = total ? Math.round(unavail / total * 100) : 0

  const dates = bookings.map(b => b['Check-in'] || b.Check_in_Date || '').filter(Boolean).sort()
  const firstDate = dates[0]
  const lastDate = dates[dates.length - 1]

  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        border: '0.5px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)', padding: '14px 16px',
        background: isDraft ? 'var(--bg-secondary)' : 'var(--bg-primary)',
        cursor: 'pointer', transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontWeight: 500, fontSize: 14 }}>{tour.name}</span>
        {isDraft && <span style={{ fontSize: 10, color: 'var(--amber-text)', fontWeight: 500, background: '#FFF3E0', padding: '1px 6px', borderRadius: 4 }}>draft</span>}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
        {tour.departure_date ? fmtDateFull(tour.departure_date) : 'No dates'}
        {firstDate && lastDate ? ' · ' + total + ' nights' : total > 0 ? ' · ' + total + ' bookings' : ''}
      </div>

      {total > 0 && (
        <>
          <div style={{ height: 6, background: 'var(--bg-secondary)', borderRadius: 3, overflow: 'hidden', display: 'flex' }}>
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
        </>
      )}
    </button>
  )
}

function Dot({ color }) {
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, verticalAlign: 'middle', marginRight: 3 }} />
}

function AttentionRow({ item }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 14px', borderBottom: '0.5px solid var(--border-light)', fontSize: 13,
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

function extractPaymentSummary(bookings, now) {
  const sevenDays = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
  let overdue = 0, overdueTotal = 0, dueSoon = 0, dueSoonTotal = 0, upcoming = 0

  ;(bookings || []).forEach(bk => {
    const status = getStatus(bk)
    if (status === 'Balance Paid') return
    const dayDesc = bk.Day_Description || bk['Day Description'] || ''
    if (dayDesc.startsWith('Z ') || dayDesc.startsWith('z ')) return

    const slots = [
      [bk.Deposit_Due_Date, bk.Deposit_Amount, bk.Deposit_Paid_Date],
      [bk.Second_Payment_Due_Date, bk.Second_Payment_Amount, bk.nd_Payment_Paid_Date],
      [bk.Third_Payment_Due_Date, bk.Third_Payment_Amount, bk.rd_Payment_Paid_Date],
      [bk.Fourth_Payment_Due_Date, bk.Fourth_Payment_Amount, bk.th_Payment_Paid_Date],
    ]
    slots.forEach(([due, amount, paid]) => {
      if (!due || paid) return
      const amt = parseFloat(amount) || 0
      if (due < now) { overdue++; overdueTotal += amt }
      else if (due <= sevenDays) { dueSoon++; dueSoonTotal += amt }
      else { upcoming++ }
    })
  })

  return { overdue, overdueTotal, dueSoon, dueSoonTotal, upcoming }
}

function computeNeedsAttention(bookings) {
  const items = []
  const now = today()

  bookings.forEach(bk => {
    const status = getStatus(bk)
    const lodge = bk['Lodge Booking Name'] || bk.Lodge_Booking_Name || bk.Name || ''
    const tour = getTourName(bk)
    const dayDesc = bk['Day Description'] || bk.Day_Description || ''
    if (dayDesc.startsWith('Z ') || dayDesc.startsWith('z ')) return

    // Overdue payments
    const slots = [
      ['Deposit', bk.Deposit_Due_Date, bk.Deposit_Amount, bk.Deposit_Paid_Date],
      ['2nd payment', bk.Second_Payment_Due_Date, bk.Second_Payment_Amount, bk.nd_Payment_Paid_Date],
      ['3rd payment', bk.Third_Payment_Due_Date, bk.Third_Payment_Amount, bk.rd_Payment_Paid_Date],
      ['4th payment', bk.Fourth_Payment_Due_Date, bk.Fourth_Payment_Amount, bk.th_Payment_Paid_Date],
    ]
    slots.forEach(([label, dueDate, amount, paidDate]) => {
      if (dueDate && amount && dueDate < now && status !== 'Balance Paid' && !paidDate) {
        items.push({
          type: 'overdue',
          tour,
          context: fmtDate(bk.Check_in_Date || bk['Check-in']),
          title: lodge.split(' - ')[0] + ' — payment overdue',
          detail: label + ' ' + fmtCurrency(amount, bk.Lodge_Currency || bk.Currency) + ' was due ' + fmtDateFull(dueDate),
          action: 'Review',
        })
      }
    })

    if (status === 'Waitlisted') {
      items.push({
        type: 'waitlisted', tour,
        context: fmtDate(bk.Check_in_Date || bk['Check-in']),
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
