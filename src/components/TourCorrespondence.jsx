import React, { useState, useEffect, useMemo } from 'react'
import { fmtDate, getStatusBadge, getStatus } from '../utils/helpers'

/*
 * TourCorrespondence — one row per lodge for this tour.
 *
 * Each row aggregates:
 *   - All bookings at that lodge (within this tour only — never across tours)
 *   - All emails stored for those bookings (merged, sorted by date desc)
 *
 * Collapsed by default. Click to expand → shows the email thread inline
 * plus an "Open booking" button that routes to LodgeDetail on the
 * earliest booking at that lodge.
 *
 * New_Reply indicator: red dot + Mark actioned button appears on the
 * lodge row when any of that lodge's bookings has New_Reply === true.
 * Mark actioned clears New_Reply on ALL bookings at that lodge.
 */
export default function TourCorrespondence({ tour, lodges, onSelectBooking, onRefresh }) {
  const [emailsByBooking, setEmailsByBooking] = useState({}) // { bookingId: [emails] }
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('new-reply') // 'new-reply' | 'all'
  const [expandedLodge, setExpandedLodge] = useState(null)
  const [polling, setPolling] = useState(false)
  const [pollResult, setPollResult] = useState(null)
  const [marking, setMarking] = useState(null) // lodge name currently being marked

  const bookings = useMemo(
    () => (tour && tour.bookings) || [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tour && tour.id, (tour && tour.bookings && tour.bookings.length) || 0]
  )

  const getLodgeName = (b) => {
    const raw = b.Lodge_Name || b.Name || ''
    return typeof raw === 'object' ? (raw.name || '') : String(raw).split(' - ')[0]
  }

  // Fetch emails per booking in parallel
  const fetchAllEmails = () => {
    if (!bookings.length) { setEmailsByBooking({}); setLoading(false); return Promise.resolve() }
    return Promise.all(
      bookings.map(b => {
        const bkId = b.id || b['Record Id']
        return fetch('/api/bp-emails?booking_id=' + bkId)
          .then(r => r.json())
          .then(d => ({ bkId, emails: d.emails || [] }))
          .catch(() => ({ bkId, emails: [] }))
      })
    ).then(results => {
      const map = {}
      results.forEach(r => { map[r.bkId] = r.emails })
      setEmailsByBooking(map)
      setLoading(false)
    })
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchAllEmails().then(() => { if (cancelled) return })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour && tour.id])

  // Group bookings by lodge name
  const lodgeGroups = useMemo(() => {
    const groups = {}
    bookings.forEach(b => {
      const lodgeName = getLodgeName(b)
      if (!lodgeName) return
      if (!groups[lodgeName]) {
        groups[lodgeName] = {
          lodge: lodgeName,
          bookings: [],
          emails: [],
          hasNewReply: false,
          latestDate: '',
          latestReplyDate: '',
        }
      }
      groups[lodgeName].bookings.push(b)
      if (b.New_Reply === true) groups[lodgeName].hasNewReply = true

      const bkId = b.id || b['Record Id']
      const bkEmails = emailsByBooking[bkId] || []
      bkEmails.forEach(em => {
        groups[lodgeName].emails.push({ ...em, _bookingId: bkId })
      })
    })

    // Sort emails within each group (most recent first), calc latest dates
    Object.values(groups).forEach(g => {
      g.emails.sort((a, b) => {
        const da = new Date(a.date || a.email_date || 0)
        const db = new Date(b.date || b.email_date || 0)
        return db - da
      })
      if (g.emails.length > 0) {
        g.latestDate = g.emails[0].date || g.emails[0].email_date || ''
      }
      const latestInbound = g.emails.find(e => e.direction !== 'outbound')
      if (latestInbound) {
        g.latestReplyDate = latestInbound.date || latestInbound.email_date || ''
      }
      // Sort bookings by check-in date (earliest first)
      g.bookings.sort((a, b) => (a.Check_in_Date || '').localeCompare(b.Check_in_Date || ''))
    })

    return Object.values(groups)
  }, [bookings, emailsByBooking])

  // Sort lodges: needs-response first, then by latest activity
  const sortedLodges = useMemo(() => {
    const arr = lodgeGroups.slice()
    arr.sort((a, b) => {
      if (a.hasNewReply && !b.hasNewReply) return -1
      if (!a.hasNewReply && b.hasNewReply) return 1
      return (b.latestDate || '').localeCompare(a.latestDate || '')
    })
    return arr
  }, [lodgeGroups])

  const filtered = useMemo(() => {
    if (filter === 'all') return sortedLodges
    if (filter === 'new-reply') return sortedLodges.filter(g => g.hasNewReply)
    return sortedLodges
  }, [sortedLodges, filter])

  const newReplyCount = lodgeGroups.filter(g => g.hasNewReply).length

  const handlePoll = async () => {
    setPolling(true)
    setPollResult(null)
    try {
      const res = await fetch('/api/poll-gmail')
      const data = await res.json()
      setPollResult(data)
      if (data.stored > 0 && onRefresh) onRefresh()
      await fetchAllEmails()
    } catch (err) {
      setPollResult({ error: err.message })
    } finally {
      setPolling(false)
    }
  }

  const handleMarkLodgeActioned = async (group) => {
    const toClear = group.bookings.filter(b => b.New_Reply === true)
    if (toClear.length === 0) return
    setMarking(group.lodge)
    try {
      const res = await fetch('/api/update-bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_ids: toClear.map(b => b.id || b['Record Id']),
          updates: { New_Reply: false },
        }),
      })
      if (!res.ok) throw new Error('Update failed (' + res.status + ')')
      if (onRefresh) onRefresh()
    } catch (err) {
      alert('Could not mark actioned: ' + err.message)
    } finally {
      setMarking(null)
    }
  }

  const handleOpenBooking = (group) => {
    if (!onSelectBooking || group.bookings.length === 0) return
    onSelectBooking(group.bookings[0], 'correspondence')
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
          label="All lodges"
          count={lodgeGroups.length}
          active={filter === 'all'}
          onClick={() => setFilter('all')}
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
          {filter === 'new-reply'
            ? 'No lodge replies needing response.'
            : 'No lodges to show for this tour.'}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div style={{
          border: '0.5px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-primary)',
          overflow: 'hidden',
        }}>
          {filtered.map((group, i) => (
            <LodgeRow
              key={group.lodge}
              group={group}
              isLast={i === filtered.length - 1}
              expanded={expandedLodge === group.lodge}
              onToggle={() => setExpandedLodge(expandedLodge === group.lodge ? null : group.lodge)}
              onMarkActioned={() => handleMarkLodgeActioned(group)}
              onOpenBooking={() => handleOpenBooking(group)}
              marking={marking === group.lodge}
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

function LodgeRow({ group, isLast, expanded, onToggle, onMarkActioned, onOpenBooking, marking }) {
  const bookingCount = group.bookings.length
  const emailCount = group.emails.length

  const primaryBooking = group.bookings[0]
  const status = primaryBooking ? getStatus(primaryBooking) : ''
  const badge = status ? getStatusBadge(status) : null

  const daySublabel = bookingCount > 1 ? bookingCount + ' stays' : ''

  return (
    <div style={{ borderBottom: isLast ? 'none' : '0.5px solid var(--border-light)' }}>
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
          cursor: 'pointer', fontSize: 13,
          background: expanded ? 'var(--bg-secondary)' : 'transparent',
        }}
      >
        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: group.hasNewReply ? '#C62828' : 'transparent',
          flexShrink: 0,
        }} />
        <span style={{
          fontWeight: 500, flex: 1, minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: 'var(--text-primary)',
        }}>
          {group.lodge}
          {daySublabel && (
            <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
              · {daySublabel}
            </span>
          )}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
          {emailCount} email{emailCount !== 1 ? 's' : ''}
        </span>
        {badge && (
          <span style={{
            fontSize: 10, fontWeight: 500,
            padding: '2px 8px', borderRadius: 10,
            background: badge.bg, color: badge.color,
            flexShrink: 0,
          }}>
            {badge.label}
          </span>
        )}
        <span style={{
          color: 'var(--text-hint)', fontSize: 11, flexShrink: 0,
          width: 60, textAlign: 'right',
        }}>
          {group.latestDate ? fmtDate(group.latestDate) : ''}
        </span>
        <span style={{
          fontSize: 10, color: 'var(--text-muted)', flexShrink: 0,
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.15s', width: 12, textAlign: 'center',
        }}>
          ▾
        </span>
      </div>
      {expanded && (
        <div style={{
          padding: '4px 14px 14px 31px',
          background: 'var(--bg-secondary)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 10, paddingTop: 4,
          }}>
            <button
              onClick={(e) => { e.stopPropagation(); onOpenBooking() }}
              style={{
                background: 'var(--bg-primary)',
                border: '0.5px solid var(--border-default)',
                borderRadius: 4, fontSize: 11, padding: '4px 10px',
                cursor: 'pointer', color: 'var(--text-primary)',
                fontWeight: 500,
              }}
            >
              Open booking →
            </button>
            {group.hasNewReply && (
              <button
                onClick={(e) => { e.stopPropagation(); onMarkActioned() }}
                disabled={marking}
                style={{
                  background: '#FFEBEE', border: '0.5px solid #C62828',
                  borderRadius: 4, fontSize: 11, padding: '4px 10px',
                  cursor: 'pointer', color: '#C62828', fontWeight: 500,
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#C62828' }} />
                {marking ? 'Marking...' : 'Mark actioned'}
              </button>
            )}
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {bookingCount > 1
                ? bookingCount + ' bookings · ' + emailCount + ' emails'
                : emailCount + ' email' + (emailCount !== 1 ? 's' : '')}
            </span>
          </div>

          {group.emails.length === 0 ? (
            <div style={{
              fontSize: 12, color: 'var(--text-muted)', padding: '12px',
              background: 'var(--bg-primary)', borderRadius: 4,
              border: '0.5px solid var(--border-light)',
            }}>
              No emails recorded for this lodge yet.
            </div>
          ) : (
            <div style={{
              background: 'var(--bg-primary)',
              border: '0.5px solid var(--border-light)',
              borderRadius: 4,
              overflow: 'hidden',
            }}>
              {group.emails.map((em, i) => (
                <EmailRow
                  key={em.id || em.message_id || em.gmail_id || i}
                  email={em}
                  isLast={i === group.emails.length - 1}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EmailRow({ email, isLast }) {
  const [open, setOpen] = useState(false)
  const isOutbound = email.direction === 'outbound'
  const date = email.date || email.email_date || ''
  const from = email.from || email.email_from || ''
  const subject = email.subject || email.email_subject || ''
  const body = email.body || email.email_content || ''
  const attachments = email.attachments || []
  const firstLine = body.split('\n').filter(l => l.trim())[0] || ''
  const preview = firstLine.length > 120 ? firstLine.substring(0, 120) + '...' : firstLine
  const sender = isOutbound ? 'to lodge' : (from.split('<')[0].trim() || from)

  return (
    <div style={{ borderBottom: isLast ? 'none' : '0.5px solid var(--border-light)' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
          cursor: 'pointer', fontSize: 12,
          background: open ? 'var(--bg-secondary)' : 'transparent',
        }}
      >
        <span style={{
          fontWeight: 500, fontSize: 11, width: 56, flexShrink: 0,
          color: isOutbound ? 'var(--blue-text)' : 'var(--green-text)',
        }}>
          {isOutbound ? 'Sent' : 'Received'}
        </span>
        <span style={{
          color: 'var(--text-muted)', width: 140, flexShrink: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {sender}
        </span>
        <span style={{
          color: 'var(--text-secondary)', flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {open ? subject : (preview || subject)}
        </span>
        {attachments.length > 0 && (
          <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>
            📎 {attachments.length}
          </span>
        )}
        <span style={{
          color: 'var(--text-hint)', fontSize: 11, flexShrink: 0,
          width: 60, textAlign: 'right',
        }}>
          {date ? fmtDate(date) : ''}
        </span>
      </div>
      {open && (
        <div style={{ padding: '6px 14px 12px 80px' }}>
          {subject && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
              Subject: {subject}
            </div>
          )}
          <div style={{
            fontSize: 12, lineHeight: 1.7, color: 'var(--text-primary)',
            whiteSpace: 'pre-wrap', maxHeight: 400, overflowY: 'auto',
            background: 'var(--bg-primary)', padding: '10px 12px',
            borderRadius: 4, border: '0.5px solid var(--border-light)',
          }}>
            {body || '(no content)'}
          </div>
        </div>
      )}
    </div>
  )
}
