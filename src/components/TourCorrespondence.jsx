import React, { useState, useEffect, useMemo } from 'react'
import { fmtDate } from '../utils/helpers'

/*
 * TourCorrespondence — lists all stored emails across this tour's bookings.
 * Flat list, sorted most recent first, with the lodge name on each row.
 * No lodge-detail navigation here — that stays on the Itinerary tab.
 *
 * Rows where the matching booking has New_Reply === true get a dot +
 * bubble to the top of the "needs response" filter.
 */
export default function TourCorrespondence({ tour, lodges, onRefresh }) {
  const [emailsByBooking, setEmailsByBooking] = useState({}) // { bookingId: [emails] }
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('new-reply') // 'new-reply' | 'all' | 'inbound' | 'outbound'
  const [expandedKey, setExpandedKey] = useState(null)
  const [polling, setPolling] = useState(false)
  const [pollResult, setPollResult] = useState(null)

  const bookings = useMemo(
    () => (tour && tour.bookings) || [],
    [tour && tour.id]
  )

  // Build a bookingId → lodge name map
  const lodgeNameById = useMemo(() => {
    const map = {}
    bookings.forEach(b => {
      const bkId = b.id || b['Record Id']
      const raw = b.Lodge_Name || b.Name || ''
      const name = typeof raw === 'object' ? (raw.name || '') : String(raw).split(' - ')[0]
      map[bkId] = name
    })
    return map
  }, [bookings])

  // Fetch emails for each booking in parallel
  useEffect(() => {
    let cancelled = false
    if (!bookings.length) { setEmailsByBooking({}); setLoading(false); return }
    setLoading(true)

    Promise.all(
      bookings.map(b => {
        const bkId = b.id || b['Record Id']
        return fetch('/api/bp-emails?booking_id=' + bkId)
          .then(r => r.json())
          .then(d => ({ bkId, emails: d.emails || [] }))
          .catch(() => ({ bkId, emails: [] }))
      })
    ).then(results => {
      if (cancelled) return
      const map = {}
      results.forEach(r => { map[r.bkId] = r.emails })
      setEmailsByBooking(map)
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [tour && tour.id, bookings.length])

  // Flatten to a single list of rows
  const rows = useMemo(() => {
    const out = []
    bookings.forEach(b => {
      const bkId = b.id || b['Record Id']
      const emails = emailsByBooking[bkId] || []
      const lodge = lodgeNameById[bkId] || '—'
      const hasNewReply = b.New_Reply === true
      emails.forEach((em, i) => {
        out.push({
          key: (em.id || em.message_id || em.gmail_id || bkId + '_' + i),
          bookingId: bkId,
          lodge,
          hasNewReply,
          date: em.date || em.email_date || '',
          from: em.from || em.email_from || '',
          subject: em.subject || em.email_subject || '',
          body: em.body || em.email_content || '',
          direction: em.direction || '',
          attachments: em.attachments || [],
        })
      })
    })
    out.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    return out
  }, [emailsByBooking, bookings, lodgeNameById])

  const filtered = useMemo(() => {
    if (filter === 'all') return rows
    if (filter === 'inbound') return rows.filter(r => r.direction !== 'outbound')
    if (filter === 'outbound') return rows.filter(r => r.direction === 'outbound')
    if (filter === 'new-reply') {
      // Rows belonging to bookings flagged New_Reply, inbound only, most recent inbound per booking bubbled
      return rows.filter(r => r.hasNewReply && r.direction !== 'outbound')
    }
    return rows
  }, [rows, filter])

  const newReplyCount = bookings.filter(b => b.New_Reply === true).length
  const inboundCount = rows.filter(r => r.direction !== 'outbound').length
  const outboundCount = rows.filter(r => r.direction === 'outbound').length

  const handlePoll = async () => {
    setPolling(true)
    setPollResult(null)
    try {
      const res = await fetch('/api/poll-gmail')
      const data = await res.json()
      setPollResult(data)
      if (data.stored > 0 && onRefresh) onRefresh()
      // Re-fetch emails for this tour
      const updates = await Promise.all(
        bookings.map(b => {
          const bkId = b.id || b['Record Id']
          return fetch('/api/bp-emails?booking_id=' + bkId)
            .then(r => r.json())
            .then(d => ({ bkId, emails: d.emails || [] }))
            .catch(() => ({ bkId, emails: [] }))
        })
      )
      const map = {}
      updates.forEach(r => { map[r.bkId] = r.emails })
      setEmailsByBooking(map)
    } catch (err) {
      setPollResult({ error: err.message })
    } finally {
      setPolling(false)
    }
  }

  return (
    <div>
      {/* Filter + actions strip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
        flexWrap: 'wrap',
      }}>
        <FilterBtn
          label="Needs response"
          count={newReplyCount}
          active={filter === 'new-reply'}
          onClick={() => setFilter('new-reply')}
          accent
        />
        <FilterBtn
          label="All"
          count={rows.length}
          active={filter === 'all'}
          onClick={() => setFilter('all')}
        />
        <FilterBtn
          label="Inbound"
          count={inboundCount}
          active={filter === 'inbound'}
          onClick={() => setFilter('inbound')}
        />
        <FilterBtn
          label="Outbound"
          count={outboundCount}
          active={filter === 'outbound'}
          onClick={() => setFilter('outbound')}
        />
        <div style={{ flex: 1 }} />
        <button
          onClick={handlePoll}
          disabled={polling}
          className="btn"
          style={{ fontSize: 12 }}
        >
          {polling ? 'Checking...' : 'Check replies'}
        </button>
      </div>

      {pollResult && (
        <div style={{
          fontSize: 12, color: 'var(--text-muted)', marginBottom: 12,
          padding: '8px 12px', background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-md)',
        }}>
          {pollResult.error
            ? 'Error: ' + pollResult.error
            : (pollResult.stored || 0) + ' new email' + ((pollResult.stored || 0) !== 1 ? 's' : '') + ' stored · ' + (pollResult.scanned || 0) + ' scanned'
          }
        </div>
      )}

      {loading && (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          Loading emails...
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div style={{
          padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13,
          background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)',
        }}>
          {filter === 'new-reply' ? 'No lodge replies needing response.' : 'No emails to show.'}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div style={{
          border: '0.5px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-primary)',
          overflow: 'hidden',
        }}>
          {filtered.map((r, i) => (
            <EmailListRow
              key={r.key}
              row={r}
              isLast={i === filtered.length - 1}
              expanded={expandedKey === r.key}
              onToggle={() => setExpandedKey(expandedKey === r.key ? null : r.key)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FilterBtn({ label, count, active, onClick, accent }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 11px', fontSize: 12, fontWeight: 500,
        border: '0.5px solid',
        borderColor: active ? (accent ? '#C62828' : 'var(--blue-mid)') : 'var(--border-default)',
        borderRadius: 999,
        background: active ? (accent ? '#FFEBEE' : 'var(--blue-bg)') : 'var(--bg-primary)',
        color: active ? (accent ? '#C62828' : 'var(--blue-text)') : 'var(--text-secondary)',
        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
      }}
    >
      <span>{label}</span>
      {count > 0 && (
        <span style={{
          fontSize: 10, fontWeight: 600,
          background: active ? (accent ? '#C62828' : 'var(--blue-mid)') : 'var(--border-default)',
          color: active ? '#fff' : 'var(--text-muted)',
          padding: '0 6px', borderRadius: 9, minWidth: 16, textAlign: 'center',
        }}>
          {count}
        </span>
      )}
    </button>
  )
}

function EmailListRow({ row, isLast, expanded, onToggle }) {
  const isOutbound = row.direction === 'outbound'
  const firstLine = (row.body || '').split('\n').filter(l => l.trim())[0] || ''
  const preview = firstLine.length > 140 ? firstLine.substring(0, 140) + '...' : firstLine
  const sender = isOutbound ? 'to lodge' : (row.from.split('<')[0].trim() || row.from)

  return (
    <div style={{ borderBottom: isLast ? 'none' : '0.5px solid var(--border-light)' }}>
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
          cursor: 'pointer', fontSize: 12,
          background: expanded ? 'var(--bg-secondary)' : 'transparent',
        }}
      >
        {/* New reply dot */}
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: row.hasNewReply && !isOutbound ? '#C62828' : 'transparent',
          flexShrink: 0,
        }} />
        {/* Direction label */}
        <span style={{
          fontWeight: 500, fontSize: 11, width: 52, flexShrink: 0,
          color: isOutbound ? 'var(--blue-text)' : 'var(--green-text)',
        }}>
          {isOutbound ? 'Sent' : 'Received'}
        </span>
        {/* Lodge name */}
        <span style={{
          fontWeight: 500, width: 160, flexShrink: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: 'var(--text-primary)',
        }}>
          {row.lodge}
        </span>
        {/* Sender */}
        <span style={{
          color: 'var(--text-muted)', width: 150, flexShrink: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {sender}
        </span>
        {/* Subject / preview */}
        <span style={{
          color: 'var(--text-secondary)', flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {expanded ? row.subject : (preview || row.subject)}
        </span>
        {/* Attachments */}
        {row.attachments.length > 0 && (
          <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>
            📎 {row.attachments.length}
          </span>
        )}
        {/* Date */}
        <span style={{
          color: 'var(--text-hint)', fontSize: 11, flexShrink: 0,
          width: 70, textAlign: 'right',
        }}>
          {row.date ? fmtDate(row.date) : ''}
        </span>
      </div>
      {expanded && (
        <div style={{ padding: '8px 14px 14px 88px' }}>
          {row.subject && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
              Subject: {row.subject}
            </div>
          )}
          <div style={{
            fontSize: 12, lineHeight: 1.7, color: 'var(--text-primary)',
            whiteSpace: 'pre-wrap', maxHeight: 400, overflowY: 'auto',
            background: 'var(--bg-primary)', padding: '12px 14px',
            borderRadius: 'var(--radius-md)', border: '0.5px solid var(--border-light)',
          }}>
            {row.body || '(no content)'}
          </div>
        </div>
      )}
    </div>
  )
}
