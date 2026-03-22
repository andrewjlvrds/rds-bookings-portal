import React, { useState } from 'react'
import { fmtDate, fmtDateFull, fmtCurrency, today, daysBetween } from '../utils/helpers'

export default function Payments({ allBookings, tours }) {
  const [filter, setFilter] = useState('all')
  const [tourFilter, setTourFilter] = useState('all')

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
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
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
            onClick={() => setTourFilter(t.name)}
          >
            {t.name}
          </button>
        ))}
      </div>

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
            <col style={{ width: 90 }} />
            <col style={{ width: 60 }} />
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
            {filtered.map((p, i) => (
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
                  <button className="btn btn-sm" style={{ fontSize: 11, padding: '3px 8px' }}>
                    {p.statusKey === 'overdue' || p.statusKey === 'due-soon' ? 'Pay' : 'View'}
                  </button>
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
    const status = bk['Booking Status'] || bk.Booking_Status || ''
    const lodge = (bk['Lodge Booking Name'] || bk.Lodge_Booking_Name || bk.Name || '').split(' - ')[0]
    const tour = bk['Tour'] || ''
    const currency = bk['Currency'] || bk.Lodge_Currency || ''
    const ref = bk['Booking Reference'] || bk.Booking_Reference || ''
    const dayDesc = bk['Day Description'] || bk.Day_Description || ''

    // Skip alternatives
    if (dayDesc.startsWith('Z ') || dayDesc.startsWith('z ')) return

    const paymentSlots = [
      ['Deposit', bk['Deposit Due Date'] || bk.Deposit_Due_Date, bk['Deposit Amount'] || bk.Deposit_Amount],
      ['2nd payment', bk['2nd  Payment Due Date'] || bk.Second_Payment_Due_Date, bk['2nd Payment Amount'] || bk.Second_Payment_Amount],
      ['3rd payment', bk['3rd Payment Due Date'] || bk.Third_Payment_Due_Date, bk['3rd Payment amount'] || bk.Third_Payment_Amount],
      ['4th payment', bk['4th Payment Due Date'] || bk.Fourth_Payment_Due_Date, bk['4th Payment Amount'] || bk.Fourth_Payment_Amount],
    ]

    paymentSlots.forEach(([label, dueDate, amount]) => {
      if (!dueDate && !amount) return
      const amt = parseFloat(amount) || 0

      let statusKey, statusLabel
      if (status === 'Balance Paid') {
        statusKey = 'paid'
        statusLabel = 'Paid'
      } else if (dueDate && dueDate < now) {
        statusKey = 'overdue'
        const days = daysBetween(dueDate, now)
        statusLabel = days + 'd overdue'
      } else if (dueDate && dueDate <= sevenDays) {
        statusKey = 'due-soon'
        const days = daysBetween(now, dueDate)
        statusLabel = days === 0 ? 'Due today' : days + 'd'
      } else {
        statusKey = 'upcoming'
        statusLabel = 'Upcoming'
      }

      payments.push({
        key: (bk['Record Id'] || bk.id || '') + '_' + label,
        lodge,
        tour,
        currency,
        ref,
        label,
        dueDate,
        amount: amt,
        statusKey,
        statusLabel,
      })
    })
  })

  // Sort: overdue first, then by due date
  payments.sort((a, b) => {
    const order = { overdue: 0, 'due-soon': 1, upcoming: 2, paid: 3 }
    const oa = order[a.statusKey] ?? 2
    const ob = order[b.statusKey] ?? 2
    if (oa !== ob) return oa - ob
    return (a.dueDate || '').localeCompare(b.dueDate || '')
  })

  return payments
}
