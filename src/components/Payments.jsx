import React, { useState } from 'react'
import { fmtDate, fmtDateFull, fmtCurrency, today, daysBetween, getTourName, getStatus } from '../utils/helpers'

const API = window.location.hostname === 'localhost' ? 'http://localhost:3000' : ''

export default function Payments({ allBookings, tours, onSelectBooking, onRefresh }) {
  const [filter, setFilter] = useState('all')
  const [tourFilter, setTourFilter] = useState('all')
  const [paying, setPaying] = useState(null)
  const [payError, setPayError] = useState(null)

  const now = today()
  const payments = extractPayments(allBookings, now)

  // Apply filters
  let filtered = payments
  if (filter !== 'all') {
    filtered = filtered.filter(p => p.statusKey === filter)
  }
  if (tourFilter !== 'all') {
    filtered = filtered.filter(p => p.tour === tourFilter)
  }

  // Metrics
  const overdue = payments.filter(p => p.statusKey === 'overdue')
  const dueThisWeek = payments.filter(p => p.statusKey === 'due-soon')
  const upcoming = payments.filter(p => p.statusKey === 'upcoming')
  const paid = payments.filter(p => p.statusKey === 'paid')

  const overdueTotal = overdue.reduce((s, p) => s + (p.amount || 0), 0)
  const weekTotal = dueThisWeek.reduce((s, p) => s + (p.amount || 0), 0)

  // Handle tour filter — clicking active tour deselects it
  const handleTourFilter = (tourName) => {
    setTourFilter(tourFilter === tourName ? 'all' : tourName)
  }

  // Mark payment as paid
  const handleMarkPaid = async (p) => {
    if (!confirm(`Mark ${p.label} for ${p.lodge} as paid (${p.currency} ${p.amount ? p.amount.toLocaleString() : '—'})?`)) return

    setPaying(p.key)
    setPayError(null)
    try {
      const paidDate = new Date().toISOString().split('T')[0]
      const updates = { id: p.bookingId }

      // Map slot to Zoho field names
      if (p.slot === 'Deposit') {
        updates.Deposit_Paid_Date = paidDate
        updates.Deposit_Paid_Amount = p.amount || 0
      } else if (p.slot === '2nd payment') {
        updates.Second_Payment_Paid_Date = paidDate
        updates.Second_Payment_Paid_Amount = p.amount || 0
      } else if (p.slot === '3rd payment') {
        updates.Third_Payment_Paid_Date = paidDate
        updates.Third_Payment_Paid_Amount = p.amount || 0
      } else if (p.slot === '4th payment') {
        updates.Fourth_Payment_Paid_Date = paidDate
        updates.Fourth_Payment_Paid_Amount = p.amount || 0
      }

      // Update booking status based on what's being paid
      const siblingPayments = payments.filter(sp => sp.bookingId === p.bookingId && sp.key !== p.key)
      const allOthersPaid = siblingPayments.every(sp => sp.statusKey === 'paid')
      if (allOthersPaid) {
        updates.Status = 'Balance Paid'
      } else if (p.slot === 'Deposit') {
        updates.Status = 'Deposit Paid'
      }

      const res = await fetch(API + '/api/zoho-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: 'Lodge_Bookings', data: [updates] }),
      })
      const result = await res.json()
      if (!res.ok || result.error) {
        throw new Error(result.error || 'Update failed')
      }
      if (onRefresh) onRefresh()
    } catch (err) {
      console.error('Mark paid error:', err)
      setPayError(p.lodge + ' ' + p.label + ': ' + err.message)
    } finally {
      setPaying(null)
    }
  }

  // Handle View — navigate to lodge detail
  const handleView = (p) => {
    if (onSelectBooking && p.booking) onSelectBooking(p.booking)
  }

  return (
    <div>
      <h1 style={{ fontSize: 18, fontWeight: 500, marginBottom: 6 }}>Payments</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
        All deposit and balance payments across active tours, most recent due date first.
      </p>

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 20 }}>
        <div className="metric-card">
          <div className="metric-label">Overdue</div>
          <div className="metric-value" style={{ color: overdue.length > 0 ? 'var(--red-text)' : 'var(--green-text)' }}>
            {overdue.length > 0 ? 'R ' + overdueTotal.toLocaleString() : 'None'}
          </div>
          <div className="metric-sub">{overdue.length} payment{overdue.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Due this week</div>
          <div className="metric-value" style={{ color: dueThisWeek.length > 0 ? 'var(--amber-text)' : 'var(--text-primary)' }}>
            {dueThisWeek.length > 0 ? 'R ' + weekTotal.toLocaleString() : 'None'}
          </div>
          <div className="metric-sub">{dueThisWeek.length} payment{dueThisWeek.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Upcoming</div>
          <div className="metric-value">{upcoming.length}</div>
          <div className="metric-sub">payments scheduled</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Paid to date</div>
          <div className="metric-value" style={{ color: 'var(--green-text)' }}>{paid.length}</div>
          <div className="metric-sub">of {payments.length} total</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {['all', 'overdue', 'due-soon', 'upcoming', 'paid'].map(f => (
          <button
            key={f}
            className={'filter-btn' + (filter === f ? ' active' : '')}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : f === 'due-soon' ? 'Due soon' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <span style={{ fontSize: 12, color: 'var(--text-hint)', padding: '5px 4px' }}>|</span>
        <button
          className={'filter-btn' + (tourFilter === 'all' ? ' active' : '')}
          onClick={() => setTourFilter('all')}
        >All tours</button>
        {tours.map(t => (
          <button
            key={t.id}
            className={'filter-btn' + (tourFilter === t.name ? ' active' : '')}
            onClick={() => handleTourFilter(t.name)}
          >
            {t.name}
          </button>
        ))}
      </div>

      {payError && (
        <div style={{ background: '#FEF5F5', border: '1px solid #E57373', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: '#C62828' }}>
          {payError}
          <button onClick={() => setPayError(null)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#C62828', fontWeight: 600, fontSize: 14 }}>×</button>
        </div>
      )}

      {/* Table */}
      <div className="table-wrap">
        <table style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 85 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: '25%' }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 50 }} />
            <col style={{ width: 95 }} />
            <col style={{ width: 110 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Due</th>
              <th>Tour</th>
              <th>Lodge</th>
              <th>Type</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
              <th>Ccy</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>No payments match this filter</td></tr>
            )}
            {filtered.map((p) => (
              <tr key={p.key} style={p.statusKey === 'overdue' ? { background: '#FEF5F5' } : {}}>
                <td style={{
                  fontWeight: 500,
                  color: p.statusKey === 'overdue' ? 'var(--red-text)' :
                         p.statusKey === 'due-soon' ? 'var(--amber-text)' : 'var(--text-primary)'
                }}>
                  {fmtDate(p.dueDate)}
                </td>
                <td style={{ fontSize: 12 }}>{p.tour}</td>
                <td>
                  <div style={{ fontWeight: 500 }}>{p.lodge}</div>
                  {p.ref && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.ref}</div>}
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.label}</td>
                <td style={{ textAlign: 'right', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                  {p.amount ? p.amount.toLocaleString() : '—'}
                </td>
                <td style={{ fontSize: 12 }}>{p.currency}</td>
                <td>
                  <span className={'badge badge-' + p.statusKey}>{p.statusLabel}</span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    {p.statusKey !== 'paid' && (
                      <button
                        className="btn btn-sm"
                        style={{ fontSize: 11, padding: '3px 8px', background: '#E8F5E9', color: '#2E7D32', border: '1px solid #A5D6A7' }}
                        onClick={() => handleMarkPaid(p)}
                        disabled={paying === p.key}
                      >
                        {paying === p.key ? '...' : 'Paid'}
                      </button>
                    )}
                    {p.booking && (
                      <button
                        className="btn btn-sm"
                        style={{ fontSize: 11, padding: '3px 8px' }}
                        onClick={() => handleView(p)}
                      >
                        View
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function extractPayments(bookings, now) {
  const payments = []
  const sevenDays = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]

  ;(bookings || []).forEach(bk => {
    const status = getStatus(bk)
    const lodge = (bk['Lodge Booking Name'] || bk.Lodge_Booking_Name || bk.Name || '').split(' - ')[0]
    const tour = getTourName(bk)
    const currency = bk['Currency'] || bk.Lodge_Currency || ''
    const ref = bk['Booking Reference'] || bk.Booking_Reference || ''
    const dayDesc = bk['Day Description'] || bk.Day_Description || ''
    const bookingId = bk['Record Id'] || bk.id || ''

    // Skip alternatives
    if (dayDesc.startsWith('Z ') || dayDesc.startsWith('z ')) return

    const paymentSlots = [
      {
        label: 'Deposit', slot: 'Deposit',
        dueDate: bk['Deposit Due Date'] || bk.Deposit_Due_Date,
        amount: bk['Deposit Amount'] || bk.Deposit_Amount,
        paidDate: bk.Deposit_Paid_Date,
        paidAmount: bk.Deposit_Paid_Amount,
      },
      {
        label: '2nd payment', slot: '2nd payment',
        dueDate: bk['2nd  Payment Due Date'] || bk.Second_Payment_Due_Date,
        amount: bk['2nd Payment Amount'] || bk.Second_Payment_Amount,
        paidDate: bk.Second_Payment_Paid_Date,
        paidAmount: bk.Second_Payment_Paid_Amount,
      },
      {
        label: '3rd payment', slot: '3rd payment',
        dueDate: bk['3rd Payment Due Date'] || bk.Third_Payment_Due_Date,
        amount: bk['3rd Payment amount'] || bk.Third_Payment_Amount,
        paidDate: bk.Third_Payment_Paid_Date,
        paidAmount: bk.Third_Payment_Paid_Amount,
      },
      {
        label: '4th payment', slot: '4th payment',
        dueDate: bk['4th Payment Due Date'] || bk.Fourth_Payment_Due_Date,
        amount: bk['4th Payment Amount'] || bk.Fourth_Payment_Amount,
        paidDate: bk.Fourth_Payment_Paid_Date,
        paidAmount: bk.Fourth_Payment_Paid_Amount,
      },
    ]

    paymentSlots.forEach((ps) => {
      if (!ps.dueDate && !ps.amount) return
      const amt = parseFloat(ps.amount) || 0

      let statusKey, statusLabel

      // Slot-level paid check first
      if (ps.paidDate) {
        statusKey = 'paid'
        statusLabel = 'Paid ' + fmtDate(ps.paidDate)
      } else if (status === 'Balance Paid') {
        statusKey = 'paid'
        statusLabel = 'Paid'
      } else if (ps.dueDate && ps.dueDate < now) {
        statusKey = 'overdue'
        const days = daysBetween(ps.dueDate, now)
        statusLabel = days + 'd overdue'
      } else if (ps.dueDate && ps.dueDate <= sevenDays) {
        statusKey = 'due-soon'
        const days = daysBetween(now, ps.dueDate)
        statusLabel = days === 0 ? 'Due today' : days + 'd'
      } else {
        statusKey = 'upcoming'
        statusLabel = 'Upcoming'
      }

      payments.push({
        key: bookingId + '_' + ps.label,
        bookingId,
        booking: bk,
        lodge, tour, currency, ref,
        label: ps.label,
        slot: ps.slot,
        dueDate: ps.dueDate,
        amount: amt,
        paidDate: ps.paidDate,
        paidAmount: ps.paidAmount,
        statusKey, statusLabel,
      })
    })
  })

  // Sort: overdue first, then due-soon, upcoming, paid last
  payments.sort((a, b) => {
    const order = { overdue: 0, 'due-soon': 1, upcoming: 2, paid: 3 }
    const oa = order[a.statusKey] ?? 2
    const ob = order[b.statusKey] ?? 2
    if (oa !== ob) return oa - ob
    return (a.dueDate || '').localeCompare(b.dueDate || '')
  })

  return payments
}
