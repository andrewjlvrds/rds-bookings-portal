import React, { useState, useRef } from 'react'
import { fmtDate, fmtDateFull, fmtCurrency, today, daysBetween, getTourName, getStatus } from '../utils/helpers'

const API = window.location.hostname === 'localhost' ? 'http://localhost:3000' : ''

export default function Payments({ allBookings, tours, onSelectBooking, onRefresh }) {
  const [filter, setFilter] = useState('all')
  const [tourFilter, setTourFilter] = useState('all')
  const [paying, setPaying] = useState(null)
  const [payError, setPayError] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [bulkPaying, setBulkPaying] = useState(false)
  const [lastPaidKeys, setLastPaidKeys] = useState([]) // for undo
  const lastClickedIdx = useRef(null)

  const now = today()
  const allPayments = extractPayments(allBookings, now)

  // Only include payments from tours with end/departure date >= today (or no date)
  const futureTourNames = new Set(
    (tours || []).filter(t => {
      if (!t.departure_date) return true
      if (typeof t.id === 'string' && t.id.startsWith('local_')) return false
      const endDate = t.end_date || t.departure_date
      return endDate >= now
    }).map(t => t.name)
  )
  const payments = allPayments.filter(p => futureTourNames.has(p.tour))

  // Apply filters
  let filtered = payments
  if (filter !== 'all') {
    if (filter === 'upcoming') {
      filtered = filtered.filter(p => p.statusKey === 'upcoming' || p.statusKey === 'due-soon')
    } else {
      filtered = filtered.filter(p => p.statusKey === filter)
    }
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

  const handleTourFilter = (tourName) => {
    setTourFilter(tourFilter === tourName ? 'all' : tourName)
  }

  // Checkbox handling with shift-click support
  const handleCheck = (key, idx, e) => {
    const next = new Set(selected)
    if (e.shiftKey && lastClickedIdx.current !== null) {
      const start = Math.min(lastClickedIdx.current, idx)
      const end = Math.max(lastClickedIdx.current, idx)
      for (let i = start; i <= end; i++) {
        next.add(filtered[i].key)
      }
    } else {
      if (next.has(key)) next.delete(key)
      else next.add(key)
    }
    lastClickedIdx.current = idx
    setSelected(next)
  }

  const handleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(p => p.key)))
    }
  }

  // Get Zoho field names for a payment slot
  const getSlotFields = (slot) => {
    if (slot === 'Deposit') return { date: 'Deposit_Paid_Date', amount: 'Deposit_Paid_Amount' }
    if (slot === '2nd payment') return { date: 'nd_Payment_Paid_Date', amount: 'nd_Payment_Paid_Amount' }
    if (slot === '3rd payment') return { date: 'rd_Payment_Paid_Date', amount: 'rd_Payment_Paid_Amount' }
    if (slot === '4th payment') return { date: 'th_Payment_Paid_Date', amount: 'th_Payment_Paid_Amount' }
    return null
  }

  // Mark single payment as paid
  const handleMarkPaid = async (p) => {
    if (!confirm(`Mark ${p.label} for ${p.lodge} as paid (${p.currency} ${p.amount ? p.amount.toLocaleString() : '—'})?`)) return
    await markPaid([p])
  }

  // Mark multiple payments as paid
  const handleBulkPaid = async () => {
    const toPay = filtered.filter(p => selected.has(p.key) && p.statusKey !== 'paid')
    if (toPay.length === 0) return
    const total = toPay.reduce((s, p) => s + (p.amount || 0), 0)
    if (!confirm(`Mark ${toPay.length} payment${toPay.length > 1 ? 's' : ''} as paid (total: R ${total.toLocaleString()})?`)) return
    await markPaid(toPay)
  }

  const markPaid = async (paymentsList) => {
    setBulkPaying(true)
    setPayError(null)
    const paidDate = new Date().toISOString().split('T')[0]
    const paidKeys = []

    // Group by bookingId to batch updates
    const byBooking = {}
    paymentsList.forEach(p => {
      if (!byBooking[p.bookingId]) byBooking[p.bookingId] = { updates: { id: p.bookingId }, payments: [] }
      const fields = getSlotFields(p.slot)
      if (fields) {
        byBooking[p.bookingId].updates[fields.date] = paidDate
        byBooking[p.bookingId].updates[fields.amount] = p.amount || 0
      }
      byBooking[p.bookingId].payments.push(p)
      paidKeys.push(p.key)
    })

    // Determine status updates
    Object.values(byBooking).forEach(({ updates, payments: bkPayments }) => {
      const allForBooking = payments.filter(sp => sp.bookingId === updates.id)
      const willBePaid = new Set(bkPayments.map(p => p.key))
      const allPaidAfter = allForBooking.every(sp => sp.statusKey === 'paid' || willBePaid.has(sp.key))
      if (allPaidAfter) {
        updates.Status = 'Balance Paid'
      } else if (bkPayments.some(p => p.slot === 'Deposit')) {
        updates.Status = 'Deposit Paid'
      }
    })

    try {
      const data = Object.values(byBooking).map(b => b.updates)
      const res = await fetch(API + '/api/zoho-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: 'Lodge_Bookings', data }),
      })
      const result = await res.json()
      if (!res.ok || result.error) throw new Error(result.error || 'Update failed')
      setLastPaidKeys(paidKeys)
      setSelected(new Set())
      if (onRefresh) onRefresh()
    } catch (err) {
      console.error('Mark paid error:', err)
      setPayError(err.message)
    } finally {
      setBulkPaying(false)
      setPaying(null)
    }
  }

  // Undo last bulk paid (clear the paid dates)
  const handleUndo = async () => {
    if (lastPaidKeys.length === 0) return
    setBulkPaying(true)
    try {
      const toPay = payments.filter(p => lastPaidKeys.includes(p.key))
      const byBooking = {}
      toPay.forEach(p => {
        if (!byBooking[p.bookingId]) byBooking[p.bookingId] = { id: p.bookingId }
        const fields = getSlotFields(p.slot)
        if (fields) {
          byBooking[p.bookingId][fields.date] = null
          byBooking[p.bookingId][fields.amount] = null
        }
      })
      const data = Object.values(byBooking)
      await fetch(API + '/api/zoho-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: 'Lodge_Bookings', data }),
      })
      setLastPaidKeys([])
      if (onRefresh) onRefresh()
    } catch (err) {
      setPayError('Undo failed: ' + err.message)
    } finally {
      setBulkPaying(false)
    }
  }

  const handleView = (p) => {
    if (onSelectBooking && p.booking) onSelectBooking(p.booking)
  }

  const selectedCount = filtered.filter(p => selected.has(p.key)).length
  const selectedUnpaid = filtered.filter(p => selected.has(p.key) && p.statusKey !== 'paid').length
  const allChecked = filtered.length > 0 && selected.size === filtered.length

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
        {['all', 'overdue', 'upcoming', 'paid'].map(f => (
          <button
            key={f}
            className={'filter-btn' + (filter === f ? ' active' : '')}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <span style={{ fontSize: 12, color: 'var(--text-hint)', padding: '5px 4px' }}>|</span>
        <button
          className={'filter-btn' + (tourFilter === 'all' ? ' active' : '')}
          onClick={() => setTourFilter('all')}
        >All tours</button>
        {(() => {
          // Only show future Zoho tours, grouped by year
          const todayStr = now
          const futureTours = (tours || []).filter(t => {
            if (!t.departure_date) return false
            if (typeof t.id === 'string' && t.id.startsWith('local_')) return false
            const endDate = t.end_date || t.departure_date
            return endDate >= todayStr
          })
          const byYear = {}
          futureTours.forEach(t => {
            const year = (t.departure_date || '').substring(0, 4)
            if (!byYear[year]) byYear[year] = []
            byYear[year].push(t)
          })
          const years = Object.keys(byYear).sort()
          return years.map(year => (
            <React.Fragment key={year}>
              <span style={{ fontSize: 10, color: 'var(--text-hint)', padding: '5px 2px', fontWeight: 500 }}>{year}:</span>
              {byYear[year].sort((a, b) => (a.departure_date || '').localeCompare(b.departure_date || '')).map(t => (
                <button
                  key={t.id}
                  className={'filter-btn' + (tourFilter === t.name ? ' active' : '')}
                  onClick={() => handleTourFilter(t.name)}
                >
                  {t.name}
                </button>
              ))}
            </React.Fragment>
          ))
        })()}
      </div>

      {/* Bulk action bar */}
      {selectedCount > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '8px 14px', marginBottom: 12, background: 'var(--blue-bg)',
          borderRadius: 'var(--radius-md)', fontSize: 13,
        }}>
          <span style={{ fontWeight: 500, color: 'var(--blue-text)' }}>
            {selectedCount} selected
          </span>
          {selectedUnpaid > 0 && (
            <button
              className="btn btn-sm"
              style={{ fontSize: 11, padding: '3px 10px', background: '#E8F5E9', color: '#2E7D32', border: '1px solid #A5D6A7' }}
              onClick={handleBulkPaid}
              disabled={bulkPaying}
            >
              {bulkPaying ? 'Updating...' : `Mark ${selectedUnpaid} as paid`}
            </button>
          )}
          <button
            className="btn btn-sm"
            style={{ fontSize: 11, padding: '3px 10px' }}
            onClick={() => setSelected(new Set())}
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Undo bar */}
      {lastPaidKeys.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 14px', marginBottom: 12, background: '#FFF8E1',
          borderRadius: 'var(--radius-md)', fontSize: 13,
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>
            Marked {lastPaidKeys.length} payment{lastPaidKeys.length > 1 ? 's' : ''} as paid
          </span>
          <button
            className="btn btn-sm"
            style={{ fontSize: 11, padding: '3px 10px' }}
            onClick={handleUndo}
            disabled={bulkPaying}
          >
            {bulkPaying ? 'Undoing...' : 'Undo'}
          </button>
        </div>
      )}

      {payError && (
        <div style={{ background: '#FEF5F5', border: '1px solid #E57373', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: '#C62828' }}>
          {payError}
          <button onClick={() => setPayError(null)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#C62828', fontWeight: 600, fontSize: 14 }}>×</button>
        </div>
      )}

      {/* Table */}
      <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 320px)', overflow: 'auto' }}>
        <table style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 36 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: 75 }} />
            <col style={{ width: 95 }} />
            <col style={{ width: 45 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 100 }} />
          </colgroup>
          <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--bg-primary)' }}>
            <tr>
              <th style={{ textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={handleSelectAll}
                  style={{ cursor: 'pointer' }}
                />
              </th>
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
              <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>No payments match this filter</td></tr>
            )}
            {filtered.map((p, idx) => (
              <tr key={p.key} style={{
                background: selected.has(p.key) ? 'var(--blue-bg)' :
                  p.statusKey === 'overdue' ? '#FEF5F5' : undefined,
              }}>
                <td style={{ textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={selected.has(p.key)}
                    onChange={(e) => handleCheck(p.key, idx, e)}
                    style={{ cursor: 'pointer' }}
                  />
                </td>
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
                        disabled={paying === p.key || bulkPaying}
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
        paidDate: bk.nd_Payment_Paid_Date,
        paidAmount: bk.nd_Payment_Paid_Amount,
      },
      {
        label: '3rd payment', slot: '3rd payment',
        dueDate: bk['3rd Payment Due Date'] || bk.Third_Payment_Due_Date,
        amount: bk['3rd Payment amount'] || bk.Third_Payment_Amount,
        paidDate: bk.rd_Payment_Paid_Date,
        paidAmount: bk.rd_Payment_Paid_Amount,
      },
      {
        label: '4th payment', slot: '4th payment',
        dueDate: bk['4th Payment Due Date'] || bk.Fourth_Payment_Due_Date,
        amount: bk['4th Payment Amount'] || bk.Fourth_Payment_Amount,
        paidDate: bk.th_Payment_Paid_Date,
        paidAmount: bk.th_Payment_Paid_Amount,
      },
    ]

    paymentSlots.forEach((ps) => {
      if (!ps.dueDate && !ps.amount) return
      const amt = parseFloat(ps.amount) || 0

      let statusKey, statusLabel
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
        bookingId, booking: bk,
        lodge, tour, currency, ref,
        label: ps.label, slot: ps.slot,
        dueDate: ps.dueDate, amount: amt,
        paidDate: ps.paidDate, paidAmount: ps.paidAmount,
        statusKey, statusLabel,
      })
    })
  })

  payments.sort((a, b) => {
    const order = { overdue: 0, 'due-soon': 1, upcoming: 2, paid: 3 }
    const oa = order[a.statusKey] ?? 2
    const ob = order[b.statusKey] ?? 2
    if (oa !== ob) return oa - ob
    return (a.dueDate || '').localeCompare(b.dueDate || '')
  })

  return payments
}
