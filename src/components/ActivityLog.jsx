import React, { useState, useEffect } from 'react'
import { fmtDate } from '../utils/helpers'

/*
 * Activity Log — replaces Helen's parallel spreadsheet.
 *
 * Cross-cuts bookings, lodges, tours. Newest first. Grouped by day.
 * Filterable by category, status, recipient, tour, and free-text.
 *
 * Two ways to render this same data:
 *   - Top-level view (this component): everything, with filters
 *   - Per-booking view: filtered to a specific booking — handled by
 *     <BookingActivityLog /> inside LodgeDetail
 *
 * Entries are append-only. Status can be flipped (waiting → done,
 * done → waiting). Genuine accidents can be hard-deleted.
 */

const CATEGORY_META = {
  email:    { label: 'Email',    colour: '#1565C0', bg: '#E3F2FD' },
  payment:  { label: 'Payment',  colour: '#00695C', bg: '#B2DFDB' }, // Helen's turquoise
  call:     { label: 'Call',     colour: '#6A1B9A', bg: '#F3E5F5' },
  whatsapp: { label: 'WhatsApp', colour: '#2E7D32', bg: '#E8F5E9' },
  other:    { label: 'Other',    colour: '#5F5E5A', bg: '#F2F1ED' },
}

const STATUS_META = {
  done:      { label: 'Done',                colour: '#2E7D32' },
  waiting:   { label: 'Waiting for response', colour: '#E65100' },
  follow_up: { label: 'Follow up',           colour: '#1565C0' },
}

export default function ActivityLog({ tours, allBookings, onSelectBooking }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [filter, setFilter] = useState({ category: '', status: '', search: '', tour: '' })

  const fetchLog = () => {
    setLoading(true)
    fetch('/api/activity-log')
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Load failed')))
      .then(d => { setEntries(d.entries || []); setLoading(false) })
      .catch(err => { setError(err.message); setLoading(false) })
  }

  useEffect(() => { fetchLog() }, [])

  const handleStatusChange = async (id, status) => {
    try {
      const res = await fetch('/api/activity-log', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      const d = await res.json()
      if (!d.success) throw new Error(d.error || 'Update failed')
      setEntries(prev => prev.map(e => e.id === id ? d.entry : e))
    } catch (err) {
      alert('Could not update: ' + err.message)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this entry permanently?')) return
    try {
      const res = await fetch('/api/activity-log?id=' + encodeURIComponent(id), { method: 'DELETE' })
      const d = await res.json()
      if (!d.success) throw new Error(d.error || 'Delete failed')
      setEntries(prev => prev.filter(e => e.id !== id))
    } catch (err) {
      alert('Could not delete: ' + err.message)
    }
  }

  const handleAdd = async (entry) => {
    try {
      const res = await fetch('/api/activity-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      })
      const d = await res.json()
      if (!d.success) throw new Error(d.error || 'Save failed')
      setEntries(prev => [d.entry, ...prev])
      setShowAdd(false)
    } catch (err) {
      alert('Could not save: ' + err.message)
    }
  }

  // Apply filters
  const filtered = entries.filter(e => {
    if (filter.category && e.category !== filter.category) return false
    if (filter.status && e.status !== filter.status) return false
    if (filter.tour && e.tour_name !== filter.tour) return false
    if (filter.search) {
      const q = filter.search.toLowerCase()
      const hay = (e.action + ' ' + (e.recipient || '') + ' ' + (e.tour_name || '')).toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  // Group by day
  const groups = []
  let currentDay = null
  filtered.forEach(e => {
    const day = (e.created_at || '').slice(0, 10)
    if (day !== currentDay) {
      groups.push({ day, entries: [] })
      currentDay = day
    }
    groups[groups.length - 1].entries.push(e)
  })

  const tourNames = Array.from(new Set(entries.map(e => e.tour_name).filter(Boolean))).sort()

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 500 }}>Activity Log</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            {entries.length} entries · {entries.filter(e => e.status === 'waiting').length} waiting for response
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={fetchLog} className="btn btn-sm" style={{ fontSize: 12 }}>↻</button>
          <button onClick={() => setShowAdd(true)} className="btn btn-primary btn-sm" style={{ fontSize: 12 }}>+ Log entry</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text" placeholder="Search actions, recipients..."
          value={filter.search} onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
          style={inputStyle(220)}
        />
        <select value={filter.category} onChange={e => setFilter(f => ({ ...f, category: e.target.value }))} style={selectStyle()}>
          <option value="">All categories</option>
          {Object.keys(CATEGORY_META).map(k => <option key={k} value={k}>{CATEGORY_META[k].label}</option>)}
        </select>
        <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))} style={selectStyle()}>
          <option value="">All statuses</option>
          {Object.keys(STATUS_META).map(k => <option key={k} value={k}>{STATUS_META[k].label}</option>)}
        </select>
        {tourNames.length > 0 && (
          <select value={filter.tour} onChange={e => setFilter(f => ({ ...f, tour: e.target.value }))} style={selectStyle()}>
            <option value="">All tours</option>
            {tourNames.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        {(filter.search || filter.category || filter.status || filter.tour) && (
          <button
            onClick={() => setFilter({ category: '', status: '', search: '', tour: '' })}
            style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}
          >Clear</button>
        )}
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {filtered.length === entries.length ? '' : filtered.length + ' of ' + entries.length}
        </span>
      </div>

      {loading && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>}
      {error && <div style={{ padding: 20, color: 'var(--red-text)' }}>Error: {error}</div>}

      {!loading && !error && entries.length === 0 && (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)' }}>
          No entries yet. Click "+ Log entry" to start tracking activity.
        </div>
      )}

      {!loading && !error && entries.length > 0 && filtered.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)' }}>
          No entries match the current filters.
        </div>
      )}

      {groups.map(g => (
        <DayGroup
          key={g.day}
          day={g.day}
          entries={g.entries}
          allBookings={allBookings}
          onSelectBooking={onSelectBooking}
          onStatusChange={handleStatusChange}
          onDelete={handleDelete}
        />
      ))}

      {showAdd && (
        <EntryFormModal
          tours={tours}
          allBookings={allBookings}
          onCancel={() => setShowAdd(false)}
          onSave={handleAdd}
        />
      )}
    </div>
  )
}

function DayGroup({ day, entries, allBookings, onSelectBooking, onStatusChange, onDelete }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: 0.5,
        padding: '6px 0', marginBottom: 4,
      }}>
        {fmtDayHeader(day)}
      </div>
      <div style={{ border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        {entries.map(e => (
          <EntryRow
            key={e.id}
            entry={e}
            allBookings={allBookings}
            onSelectBooking={onSelectBooking}
            onStatusChange={onStatusChange}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  )
}

function EntryRow({ entry, allBookings, onSelectBooking, onStatusChange, onDelete }) {
  const cat = CATEGORY_META[entry.category] || CATEGORY_META.other
  const status = STATUS_META[entry.status] || STATUS_META.done
  const time = entry.created_at ? new Date(entry.created_at).toTimeString().slice(0, 5) : ''

  // Resolve linked bookings to clickable chips
  const linked = (entry.booking_ids || [])
    .map(id => (allBookings || []).find(b => b.id === id))
    .filter(Boolean)
    .map(bk => ({
      id: bk.id,
      label: ((typeof bk.Lodge_Name === 'object' ? bk.Lodge_Name?.name : bk.Lodge_Name) || bk.Name || 'Booking') +
             (bk.Check_in_Date ? ' · ' + fmtDate(bk.Check_in_Date) : ''),
      booking: bk,
    }))

  return (
    <div style={{
      padding: '10px 14px',
      borderBottom: '0.5px solid var(--border-subtle)',
      background: cat.bg,
      display: 'grid', gridTemplateColumns: '54px 1fr auto', gap: 10, alignItems: 'flex-start',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingTop: 1 }}>{time}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {entry.action}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{
            fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 3,
            background: 'rgba(255,255,255,0.6)', color: cat.colour,
          }}>{cat.label}</span>
          {entry.recipient && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>→ {entry.recipient}</span>
          )}
          {entry.tour_name && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {entry.tour_name}</span>
          )}
          {entry.amount && entry.amount.value && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              · {entry.amount.currency || ''} {entry.amount.value.toLocaleString()}
            </span>
          )}
          {linked.map(l => (
            <button
              key={l.id}
              onClick={() => onSelectBooking && onSelectBooking(l.booking)}
              style={{
                fontSize: 10, padding: '1px 6px', borderRadius: 3,
                background: 'rgba(0,0,0,0.05)', color: 'var(--text-secondary)',
                border: 'none', cursor: 'pointer',
              }}
              title="Open this booking"
            >{l.label}</button>
          ))}
          {entry.author && entry.author !== 'Helen' && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>by {entry.author}</span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <select
          value={entry.status}
          onChange={e => onStatusChange(entry.id, e.target.value)}
          style={{
            fontSize: 11, padding: '2px 6px',
            border: '0.5px solid var(--border-default)', borderRadius: 3,
            background: 'rgba(255,255,255,0.7)', color: status.colour,
            cursor: 'pointer', fontWeight: 500,
          }}
          title={status.label}
        >
          {Object.keys(STATUS_META).map(k => (
            <option key={k} value={k}>{STATUS_META[k].label}</option>
          ))}
        </select>
        <button
          onClick={() => onDelete(entry.id)}
          style={{
            background: 'none', border: 'none', fontSize: 11,
            color: 'var(--text-muted)', cursor: 'pointer', padding: '2px 4px',
          }}
          title="Delete"
        >×</button>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────
// Entry form — used standalone (top-level Activity Log)
// or embedded inline (per-booking quick-add).
// ───────────────────────────────────────────────────────

export function EntryForm({ tours, allBookings, defaultBookingIds, defaultTourName, onCancel, onSave, compact }) {
  const [action, setAction] = useState('')
  const [category, setCategory] = useState('email')
  const [status, setStatus] = useState('done')
  const [recipient, setRecipient] = useState('')
  const [bookingIds, setBookingIds] = useState(defaultBookingIds || [])
  const [tourName, setTourName] = useState(defaultTourName || '')
  const [amountValue, setAmountValue] = useState('')
  const [amountCurrency, setAmountCurrency] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [author, setAuthor] = useState('Helen')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!action.trim()) return
    setSaving(true)
    const entry = {
      action: action.trim(),
      category, status,
      recipient: recipient.trim() || null,
      booking_ids: bookingIds,
      tour_name: tourName || null,
      author,
      follow_up_date: followUpDate || null,
    }
    if (amountValue) {
      entry.amount = { value: parseFloat(amountValue), currency: amountCurrency.trim() || null }
    }
    try { await onSave(entry) } catch (e) { /* parent handles */ }
    setSaving(false)
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <textarea
        value={action} onChange={e => setAction(e.target.value)}
        placeholder="What did you do? e.g. 'Emailed Livingstone Lodge re 12 May payment'"
        rows={compact ? 2 : 3}
        autoFocus
        style={{
          fontSize: 13, lineHeight: 1.5, padding: '8px 10px',
          border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-md)',
          outline: 'none', resize: 'vertical', fontFamily: 'var(--font-sans)',
          background: 'var(--bg-primary)', color: 'var(--text-primary)',
        }}
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select value={category} onChange={e => setCategory(e.target.value)} style={selectStyle()}>
          {Object.keys(CATEGORY_META).map(k => <option key={k} value={k}>{CATEGORY_META[k].label}</option>)}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)} style={selectStyle()}>
          {Object.keys(STATUS_META).map(k => <option key={k} value={k}>{STATUS_META[k].label}</option>)}
        </select>
        <input
          type="text" value={recipient} onChange={e => setRecipient(e.target.value)}
          placeholder="Recipient (optional) — e.g. Mike, Livingstone Lodge"
          style={inputStyle(220)}
        />
        <input
          type="text" value={amountValue} onChange={e => setAmountValue(e.target.value)}
          placeholder="Amount" style={inputStyle(80)}
        />
        <input
          type="text" value={amountCurrency} onChange={e => setAmountCurrency(e.target.value)}
          placeholder="USD" style={inputStyle(60)}
        />
        {status === 'follow_up' && (
          <input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} style={inputStyle(140)} />
        )}
      </div>
      {!compact && tours && (
        <BookingPicker
          tours={tours}
          allBookings={allBookings}
          selected={bookingIds}
          onChange={setBookingIds}
          onTourNameChange={setTourName}
        />
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 0 }}>
          <button
            onClick={() => setAuthor('Helen')}
            style={{
              fontSize: 11, padding: '4px 10px', border: 'none', cursor: 'pointer',
              background: author === 'Helen' ? 'var(--blue-bg)' : 'var(--bg-secondary)',
              color: author === 'Helen' ? 'var(--blue-text)' : 'var(--text-muted)',
              borderRadius: '4px 0 0 4px', fontWeight: 500,
            }}
          >Helen</button>
          <button
            onClick={() => setAuthor('Andrew')}
            style={{
              fontSize: 11, padding: '4px 10px', border: 'none', cursor: 'pointer',
              background: author === 'Andrew' ? 'var(--blue-bg)' : 'var(--bg-secondary)',
              color: author === 'Andrew' ? 'var(--blue-text)' : 'var(--text-muted)',
              borderRadius: '0 4px 4px 0', fontWeight: 500,
            }}
          >Andrew</button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {onCancel && <button onClick={onCancel} className="btn btn-sm" disabled={saving}>Cancel</button>}
          <button onClick={handleSubmit} className="btn btn-primary btn-sm" disabled={saving || !action.trim()}>
            {saving ? 'Saving...' : 'Save entry'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EntryFormModal({ tours, allBookings, defaultBookingIds, defaultTourName, onCancel, onSave }) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-primary)', borderRadius: 'var(--radius-lg)',
          maxWidth: 640, width: '100%', maxHeight: '90vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 16px', borderBottom: '0.5px solid var(--border-default)' }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>New activity log entry</div>
        </div>
        <div style={{ padding: 16, overflow: 'auto' }}>
          <EntryForm
            tours={tours}
            allBookings={allBookings}
            defaultBookingIds={defaultBookingIds}
            defaultTourName={defaultTourName}
            onCancel={onCancel}
            onSave={onSave}
          />
        </div>
      </div>
    </div>
  )
}

function BookingPicker({ tours, allBookings, selected, onChange, onTourNameChange }) {
  const [open, setOpen] = useState(false)
  const [tourId, setTourId] = useState(null)

  const committedTours = (tours || []).filter(t => {
    if (typeof t.id === 'string' && t.id.startsWith('local_')) return false
    if (t.tour_status === 'Draft') return false
    return true
  })

  const tour = committedTours.find(t => t.id === tourId)
  const tourBookings = tour ? (tour.bookings || []).slice().sort((a, b) => (a.Check_in_Date || '').localeCompare(b.Check_in_Date || '')) : []

  const toggle = (id) => {
    if (selected.includes(id)) onChange(selected.filter(s => s !== id))
    else onChange([...selected, id])
    if (tour && onTourNameChange) onTourNameChange(tour.name)
  }

  const selectedBookings = (allBookings || []).filter(b => selected.includes(b.id))

  return (
    <div style={{ border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: selectedBookings.length > 0 || open ? 8 : 0 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Linked bookings:</span>
        {selectedBookings.length === 0 && !open && (
          <button onClick={() => setOpen(true)} style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--blue-text)', cursor: 'pointer' }}>
            + add
          </button>
        )}
        {selectedBookings.length > 0 && !open && (
          <button onClick={() => setOpen(true)} style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--blue-text)', cursor: 'pointer' }}>
            edit
          </button>
        )}
      </div>
      {selectedBookings.map(bk => {
        const ln = (typeof bk.Lodge_Name === 'object' ? bk.Lodge_Name?.name : bk.Lodge_Name) || bk.Name || ''
        return (
          <span key={bk.id} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 11, padding: '2px 8px', borderRadius: 3, marginRight: 4, marginBottom: 4,
            background: 'var(--blue-bg)', color: 'var(--blue-text)',
          }}>
            {ln} · {fmtDate(bk.Check_in_Date)}
            <button
              onClick={() => onChange(selected.filter(s => s !== bk.id))}
              style={{ background: 'none', border: 'none', color: 'var(--blue-text)', cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1 }}
            >×</button>
          </span>
        )
      })}
      {open && (
        <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <select value={tourId || ''} onChange={e => setTourId(e.target.value)} style={selectStyle()}>
            <option value="">Pick a tour...</option>
            {committedTours.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button onClick={() => setOpen(false)} className="btn btn-sm" style={{ fontSize: 11 }}>Done</button>
          {tour && (
            <div style={{ gridColumn: '1 / -1', maxHeight: 160, overflow: 'auto', border: '0.5px solid var(--border-subtle)', borderRadius: 4 }}>
              {tourBookings.map(bk => {
                const ln = (typeof bk.Lodge_Name === 'object' ? bk.Lodge_Name?.name : bk.Lodge_Name) || bk.Name || ''
                const checked = selected.includes(bk.id)
                return (
                  <label key={bk.id} style={{
                    display: 'flex', gap: 6, padding: '4px 8px', fontSize: 12, cursor: 'pointer',
                    background: checked ? 'var(--blue-bg)' : 'transparent',
                  }}>
                    <input type="checkbox" checked={checked} onChange={() => toggle(bk.id)} />
                    <span>{ln}</span>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>{fmtDate(bk.Check_in_Date)}</span>
                  </label>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────
// Per-booking activity log — embedded inside LodgeDetail
// ───────────────────────────────────────────────────────

export function BookingActivityLog({ bookingId, tourName, booking }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  const fetchLog = () => {
    setLoading(true)
    fetch('/api/activity-log?booking_id=' + encodeURIComponent(bookingId))
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Load failed')))
      .then(d => { setEntries(d.entries || []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { if (bookingId) fetchLog() }, [bookingId])

  const handleAdd = async (entry) => {
    // Always link this booking
    if (!entry.booking_ids || !entry.booking_ids.includes(bookingId)) {
      entry.booking_ids = [...(entry.booking_ids || []), bookingId]
    }
    if (!entry.tour_name && tourName) entry.tour_name = tourName
    const res = await fetch('/api/activity-log', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    })
    const d = await res.json()
    if (!d.success) throw new Error(d.error || 'Save failed')
    setEntries(prev => [d.entry, ...prev])
    setShowAdd(false)
  }

  const handleStatusChange = async (id, status) => {
    const res = await fetch('/api/activity-log', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    const d = await res.json()
    if (d.success) setEntries(prev => prev.map(e => e.id === id ? d.entry : e))
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this entry?')) return
    const res = await fetch('/api/activity-log?id=' + encodeURIComponent(id), { method: 'DELETE' })
    const d = await res.json()
    if (d.success) setEntries(prev => prev.filter(e => e.id !== id))
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          {entries.filter(e => e.status === 'waiting').length > 0 &&
            ' · ' + entries.filter(e => e.status === 'waiting').length + ' waiting'}
        </div>
        <button onClick={() => setShowAdd(s => !s)} className="btn btn-sm" style={{ fontSize: 11 }}>
          {showAdd ? 'Cancel' : '+ Add note'}
        </button>
      </div>
      {showAdd && (
        <div style={{ background: 'var(--bg-secondary)', padding: 12, borderRadius: 'var(--radius-md)', marginBottom: 12 }}>
          <EntryForm
            tours={null}
            allBookings={null}
            defaultBookingIds={[bookingId]}
            defaultTourName={tourName}
            onCancel={() => setShowAdd(false)}
            onSave={handleAdd}
            compact
          />
        </div>
      )}
      {loading && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Loading...</div>}
      {!loading && entries.length === 0 && (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
          No entries logged for this booking yet.
        </div>
      )}
      {entries.length > 0 && (
        <div style={{ border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          {entries.map(e => (
            <EntryRow
              key={e.id} entry={e} allBookings={[]}
              onStatusChange={handleStatusChange} onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────
// Style helpers + utilities
// ───────────────────────────────────────────────────────

function inputStyle(width) {
  return {
    fontSize: 12, padding: '5px 8px', width,
    border: '0.5px solid var(--border-default)', borderRadius: 4,
    outline: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)',
  }
}

function selectStyle() {
  return {
    fontSize: 12, padding: '5px 8px',
    border: '0.5px solid var(--border-default)', borderRadius: 4,
    outline: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)',
    cursor: 'pointer',
  }
}

function fmtDayHeader(day) {
  if (!day) return ''
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  if (day === today) return 'Today'
  if (day === yesterday) return 'Yesterday'
  const d = new Date(day + 'T12:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
