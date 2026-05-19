import React, { useState, useEffect } from 'react'
import { fmtDate } from '../utils/helpers'
import { cleanEmailBody } from '../utils/emailBody'
import RoutingPicker from './RoutingPicker'

/*
 * Inbox — Helen's portal-as-inbox view.
 *
 * Three sections:
 *   1. Unread       — matched inbound emails she hasn't opened
 *   2. Unmatched    — emails the matcher couldn't route to a booking
 *   3. Tour-bucket  — tour known but specific booking ambiguous
 *
 * Section 1 click → opens the relevant LodgeDetail (handled by parent).
 * Sections 2 & 3 have a "Route to booking" picker that calls
 *   /api/email-route, which moves the blob to emails/booking/{id}/.
 */
export default function Inbox({
  tours, allBookings, lodges,
  data, readyToMarkDone, loading, error,
  onRefresh, ensureFresh, onLocalUpdate, onLocalReadyDoneUpdate,
  onSelectBooking, onMarkRead, onMarkManyRead,
}) {
  const [routingEmail, setRoutingEmail] = useState(null) // { email, sourcePath }
  const [toast, setToast] = useState(null) // { msg, ok }
  const [activeTab, setActiveTab] = useState(null) // 'routing' | 'unread' | 'search' | null (auto)
  const [searchQuery, setSearchQuery] = React.useState('')
  const [searchResults, setSearchResults] = React.useState(null) // null = not searched
  const [searching, setSearching] = React.useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)

  const handleSyncFromGmail = async () => {
    if (!confirm(
      'This will mark portal emails as already-read if they have been read in Gmail (or are older than 30 days).\n\n' +
      'It is safe to run multiple times but normally only needs to be run once at cutover.\n\n' +
      'Continue?'
    )) return
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/sync-gmail-read-state', { method: 'POST' })
      const d = await res.json()
      if (!d.success) throw new Error(d.error || 'Sync failed')
      // Refresh data BEFORE showing the result toast so the count
      // visible alongside the toast is the post-sync count, not stale.
      if (onRefresh) await onRefresh()
      setSyncResult({ total: d.stats.total_marked_read })
    } catch (err) {
      setSyncResult({ error: err.message })
    } finally {
      setSyncing(false)
    }
  }

  // Nuclear option for cutover: mark every booking email as read,
  // regardless of Gmail state or age. Helen runs this when she wants
  // a true clean slate. Goes through a dedicated endpoint that
  // derives email IDs from blob paths (no fetching), so it's fast
  // and doesn't time out on large backlogs.
  const handleMarkAllReadEverywhere = async () => {
    if (!confirm(
      'This marks EVERY lodge email as read in the portal — including ones the Gmail sync did not catch.\n\n' +
      'Use this when you want a completely clean inbox to start working from. Anything important will reappear when the lodge follows up.\n\n' +
      'This cannot be undone for the bulk action — though you can still mark individual emails unread later.\n\n' +
      'Continue?'
    )) return
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/mark-all-booking-emails-read', { method: 'POST' })
      const d = await res.json()
      if (!d.success) throw new Error(d.error || 'Mark-all failed')
      if (onRefresh) await onRefresh()
      setSyncResult({ total: d.stats.newly_marked_read })
    } catch (err) {
      setSyncResult({ error: err.message })
    } finally {
      setSyncing(false)
    }
  }

  // On first mount of this view, ensure data is fresh (cached if <30s old).
  useEffect(() => { if (ensureFresh) ensureFresh() }, [])

  const handleOpenEmail = (email) => {
    if (!email.booking_id) return
    const bk = allBookings.find(b => b.id === email.booking_id)
    if (!bk) {
      alert('Could not find booking for this email — refreshing.')
      if (onRefresh) onRefresh()
      return
    }
    // Don't mark read on open — only on explicit Dismiss.
    // Email stays in the list until Helen acts on it.
    onSelectBooking(bk, email.id)
  }

  const handleDismiss = (email) => {
    if (onMarkRead && email.id) onMarkRead(email.id)
    if (onLocalUpdate) onLocalUpdate(prev => ({
      ...prev,
      unread: (prev.unread || []).filter(e => e.id !== email.id),
      unmatched: (prev.unmatched || []).filter(e => e.id !== email.id),
      tour_bucket: (prev.tour_bucket || []).filter(e => e.id !== email.id),
      stats: {
        ...prev.stats,
        unread: (prev.unread || []).filter(e => e.id !== email.id).length,
        unmatched: (prev.unmatched || []).filter(e => e.id !== email.id).length,
        tour_bucket: (prev.tour_bucket || []).filter(e => e.id !== email.id).length,
      },
    }))
  }

  const handleDismissAll = (filterFn) => {
    const toRemove = filterFn ? needsRouting.filter(filterFn) : needsRouting
    if (toRemove.length === 0) return
    const ids = toRemove.map(e => e.id).filter(Boolean)
    if (onMarkManyRead) onMarkManyRead(ids)
    if (onLocalUpdate) onLocalUpdate(prev => {
      const removeSet = new Set(ids)
      const nextUnmatched = (prev.unmatched || []).filter(e => !removeSet.has(e.id))
      const nextTourBucket = (prev.tour_bucket || []).filter(e => !removeSet.has(e.id))
      return {
        ...prev,
        unmatched: nextUnmatched,
        tour_bucket: nextTourBucket,
        stats: { ...prev.stats, unmatched: nextUnmatched.length, tour_bucket: nextTourBucket.length },
      }
    })
  }

  const handleMarkAllRead = (bucket) => {
    if (!data || !data[bucket] || data[bucket].length === 0) return
    if (!confirm('Mark all ' + data[bucket].length + ' emails in this section as read?')) return
    const ids = data[bucket].map(e => e.id).filter(Boolean)
    if (onMarkManyRead) onMarkManyRead(ids)
    if (onLocalUpdate) onLocalUpdate(prev => ({
      ...prev,
      [bucket]: [],
      stats: { ...prev.stats, [bucket]: 0 },
    }))
  }

  const handleRoute = async (email, sourcePath, bookingId, isReassign) => {
    try {
      const res = await fetch('/api/email-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_path: sourcePath, booking_id: bookingId }),
      })
      const result = await res.json()
      if (!result.success) throw new Error(result.error || 'Routing failed')

      // Telemetry — log this as a match correction
      if (isReassign) {
        try {
          let newLodge = '', newCheckIn = ''
          if (tours) {
            for (const t of tours) {
              const found = (t.bookings || []).find(b => b.id === bookingId)
              if (found) {
                newLodge = (typeof found.Lodge_Name === 'object' ? found.Lodge_Name?.name : found.Lodge_Name) || found.Name || ''
                newCheckIn = found.Check_in_Date || ''
                break
              }
            }
          }
          fetch('/api/match-correction-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email_id: email.id,
              gmail_message_id: email.gmail_message_id || email.message_id || null,
              subject: email.subject || email.email_subject || '',
              from: email.from || email.email_from || '',
              email_date: email.date || email.email_date || null,
              original_booking_id: email.booking_id || null,
              original_match_method: email.match_method || null,
              new_booking_id: bookingId,
              new_booking_lodge: newLodge,
              new_booking_check_in: newCheckIn,
              surface: 'inbox',
              author: 'Helen',
            }),
          }).catch(() => {})
        } catch (_) { /* swallow */ }
      }

      if (onLocalUpdate) onLocalUpdate(prev => ({
        ...prev,
        unread: (prev.unread || []).filter(e => e.id !== email.id),
        unmatched: (prev.unmatched || []).filter(e => e.id !== email.id),
        tour_bucket: (prev.tour_bucket || []).filter(e => e.id !== email.id),
      }))
      setRoutingEmail(null)
      setToast({ msg: 'Email routed successfully', ok: true })
      setTimeout(() => setToast(null), 4000)
    } catch (err) {
      setToast({ msg: 'Could not route email: ' + err.message, ok: false })
      setTimeout(() => setToast(null), 6000)
    }
  }

  const handleReassignUnread = (email) => {
    if (!email.booking_id) {
      alert('Cannot reassign — missing booking id')
      return
    }
    // Use _blob_path if available (set by inbox.js), otherwise construct it
    const sourcePath = email._blob_path || ('emails/booking/' + email.booking_id + '/' + email.id + '.json')
    setRoutingEmail({ email, sourcePath, isReassign: true })
  }

  const handleMarkLogEntryDone = async (entryId) => {
    try {
      const res = await fetch('/api/activity-log', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entryId, status: 'done' }),
      })
      const d = await res.json()
      if (!d.success) throw new Error(d.error || 'Update failed')
      if (onLocalReadyDoneUpdate) onLocalReadyDoneUpdate(prev => prev.filter(e => e.id !== entryId))
    } catch (err) {
      alert('Could not update entry: ' + err.message)
    }
  }

  if (loading && !data) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading inbox...</div>
  }

  if (error && !data) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ color: 'var(--red-text)', marginBottom: 8 }}>Error: {error}</div>
        <button className="btn" onClick={onRefresh}>Retry</button>
      </div>
    )
  }

  const unread = data?.unread || []
  const unmatched = data?.unmatched || []
  const tourBucket = data?.tour_bucket || []
  const needsRouting = [...unmatched, ...tourBucket]
  const total = unread.length + needsRouting.length + readyToMarkDone.length

  // Default-tab logic: Unread first, then Needs routing if unread is clear.
  const defaultTab = unread.length > 0 ? 'unread' : 'routing'
  const tab = activeTab || defaultTab

  return (
    <div>
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: toast.ok ? '#166534' : '#991b1b',
          color: '#fff', fontSize: 13, fontWeight: 500,
          padding: '10px 18px', borderRadius: 6,
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span>{toast.ok ? '✓' : '✕'}</span>
          <span>{toast.msg}</span>
          <button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 14, marginLeft: 4 }}>×</button>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 500 }}>Inbox</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            {total === 0 ? 'All caught up.' : total + ' item' + (total === 1 ? '' : 's') + ' need attention'}
          </div>
          {syncResult && (
            <div style={{
              marginTop: 8, padding: '6px 10px', fontSize: 12,
              background: syncResult.error ? 'var(--red-bg, #FEE)' : 'var(--green-bg, #E8F5E9)',
              color: syncResult.error ? 'var(--red-text)' : 'var(--green-text)',
              borderRadius: 4, display: 'inline-block',
            }}>
              {syncResult.error
                ? 'Sync failed: ' + syncResult.error
                : 'Synced — ' + syncResult.total + ' email' + (syncResult.total === 1 ? '' : 's') + ' marked read'}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {/* Show backlog-drain buttons only when there's a meaningful
              backlog and we haven't just successfully synced. */}
          {(data?.stats?.unread || 0) > 30 && !syncResult && (
            <>
              <button
                onClick={handleSyncFromGmail}
                className="btn btn-sm"
                style={{ fontSize: 12 }}
                disabled={syncing}
                title="Mark emails as read if they have already been read in Gmail."
              >
                {syncing ? 'Working...' : 'Sync from Gmail'}
              </button>
              <button
                onClick={handleMarkAllReadEverywhere}
                style={{
                  fontSize: 11, padding: '4px 10px',
                  background: 'none', border: '0.5px solid var(--border-default)',
                  borderRadius: 4, cursor: 'pointer', color: 'var(--text-muted)',
                }}
                disabled={syncing}
                title="Nuclear option — mark every lodge email as read for a clean slate."
              >
                Mark all read
              </button>
            </>
          )}
          <button onClick={onRefresh} className="btn btn-sm" style={{ fontSize: 12 }} disabled={loading}>{loading ? 'Refreshing...' : '↻ Refresh'}</button>
        </div>
      </div>

      {total === 0 && (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)' }}>
          Nothing new to look at. New replies will appear here as they arrive.
        </div>
      )}

      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '0.5px solid var(--border-default)' }}>
        <TabButton
          active={tab === 'unread'}
          onClick={() => setActiveTab('unread')}
          label="Unread"
          count={unread.length}
          urgentColour="#C62828"
        />
        <TabButton
          active={tab === 'routing'}
          onClick={() => setActiveTab('routing')}
          label="Needs routing"
          count={needsRouting.length}
          urgentColour="#E65100"
        />
        <TabButton
          active={tab === 'search'}
          onClick={() => setActiveTab('search')}
          label="Search"
        />
      </div>
      {tab === 'routing' && total > 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, padding: '0 2px' }}>
          Emails the system couldn't automatically match to a booking. Assign each one to the right booking, or dismiss if not relevant.
        </div>
      )}
      {tab === 'routing' && needsRouting.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
            {needsRouting.some(e => (e.subject || '').toLowerCase().includes('perfectstay') || (e.from || '').toLowerCase().includes('perfectstay')) && (
              <button
                onClick={() => handleDismissAll(e =>
                  (e.subject || '').toLowerCase().includes('perfectstay') ||
                  (e.from || '').toLowerCase().includes('perfectstay')
                )}
                style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                Dismiss all Perfectstay
              </button>
            )}
            <button
              onClick={() => handleDismissAll(null)}
              style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              Dismiss all
            </button>
          </div>
          <div style={{ border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            {needsRouting.map(email => (
              <UnmatchedRow
                key={email.id}
                email={email}
                sourcePath={email._blob_path}
                onRoute={() => setRoutingEmail({ email, sourcePath: email._blob_path })}
                onDismiss={() => handleDismiss(email)}
              />
            ))}
          </div>
        </>
      )}
      {tab === 'routing' && needsRouting.length === 0 && total > 0 && (
        <EmptyTab message="No emails need routing right now." />
      )}

      {tab === 'unread' && unread.length > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <button
              onClick={() => handleMarkAllRead('unread')}
              style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              Mark all read
            </button>
          </div>
          <div style={{ border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            {unread.map(email => (
              <UnreadRow
                key={email.id}
                email={email}
                tours={tours}
                allBookings={allBookings}
                onOpen={() => handleOpenEmail(email)}
                onDismiss={() => handleDismiss(email)}
                onReassign={() => handleReassignUnread(email)}
              />
            ))}
          </div>
        </div>
      )}
      {tab === 'unread' && unread.length === 0 && total > 0 && (
        <EmptyTab message="No unread replies." />
      )}

      {tab === 'ready' && readyToMarkDone.length > 0 && (
        <div style={{ border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          {readyToMarkDone.map(entry => (
            <ReadyDoneRow
              key={entry.id}
              entry={entry}
              onMarkDone={() => handleMarkLogEntryDone(entry.id)}
            />
          ))}
        </div>
      )}
      {tab === 'ready' && readyToMarkDone.length === 0 && total > 0 && (
        <EmptyTab message="No replies waiting on your sign-off." />
      )}

      {tab === 'search' && (
        <EmailSearch allBookings={allBookings} tours={tours} onSelectBooking={onSelectBooking} />
      )}

      {routingEmail && (
        <RoutingPicker
          email={routingEmail.email}
          tours={tours}
          currentBookingId={routingEmail.isReassign ? routingEmail.email.booking_id : null}
          onCancel={() => setRoutingEmail(null)}
          onRoute={(bookingId) => handleRoute(routingEmail.email, routingEmail.sourcePath, bookingId, !!routingEmail.isReassign)}
        />
      )}
    </div>
  )
}

function TabButton({ active, onClick, label, count, urgentColour }) {
  const showColour = count > 0
  return (
    <button
      onClick={onClick}
      style={{
        padding: '10px 18px', fontSize: 13, fontWeight: 500,
        background: 'none', border: 'none', cursor: 'pointer',
        color: active ? 'var(--text-primary)' : 'var(--text-muted)',
        borderBottom: active ? '2px solid var(--blue-mid)' : '2px solid transparent',
        marginBottom: -0.5,
        display: 'flex', alignItems: 'center', gap: 8,
      }}
    >
      {label}
      {count > 0 && (
        <span style={{
          fontSize: 10, fontWeight: 600,
          background: showColour ? urgentColour : 'var(--bg-secondary)',
          color: showColour ? '#fff' : 'var(--text-muted)',
          padding: '1px 7px', borderRadius: 9, minWidth: 18, textAlign: 'center', lineHeight: 1.5,
        }}>
          {count}
        </span>
      )}
    </button>
  )
}

function EmptyTab({ message }) {
  return (
    <div style={{
      padding: 40, textAlign: 'center', color: 'var(--text-muted)',
      background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', fontSize: 13,
    }}>
      {message}
    </div>
  )
}

function Section({ title, subtitle, accent, onMarkAllRead, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 }}>
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: accent, display: 'inline-block' }} />
            {title}
          </h2>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</div>
        </div>
        {onMarkAllRead && (
          <button
            onClick={onMarkAllRead}
            style={{
              background: 'none', border: 'none', fontSize: 11,
              color: 'var(--text-muted)', cursor: 'pointer', padding: '4px 0',
            }}
          >
            Mark all read
          </button>
        )}
      </div>
      <div style={{ border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  )
}

function UnreadRow({ email, tours, allBookings, onOpen, onDismiss, onReassign }) {
  const bk = allBookings.find(b => b.id === email.booking_id)
  const lodgeName = bk ? (typeof bk.Lodge_Name === 'object' ? bk.Lodge_Name?.name : bk.Lodge_Name) || bk.Name || '' : ''
  const tour = bk && tours ? tours.find(t => (t.bookings || []).some(b => b.id === bk.id)) : null
  const tourName = tour ? tour.name : ''
  const checkIn = bk?.Check_in_Date || ''
  const subject = email.subject || email.email_subject || '(no subject)'
  const snippet = cleanEmailBody(email.body || email.email_content || '').replace(/\s+/g, ' ').slice(0, 140)
  const dateStr = email.date || email.email_date
  const ago = dateStr ? timeAgo(new Date(dateStr)) : ''

  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '12px 16px',
        borderBottom: '0.5px solid var(--border-subtle)',
        cursor: 'pointer', background: 'var(--bg-primary)',
      }}
      onClick={onOpen}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
      onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-primary)'}
    >
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#C62828', marginTop: 6, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {lodgeName || email.from || 'Unknown lodge'}
            {tourName && <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>· {tourName}</span>}
            {checkIn && <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>· {fmtDate(checkIn)}</span>}
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{ago}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {subject}
        </div>
        {snippet && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {snippet}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
        {bk && onReassign && (
          <button
            onClick={e => { e.stopPropagation(); onReassign() }}
            style={{
              background: 'none', border: 'none', fontSize: 11,
              color: 'var(--text-muted)', cursor: 'pointer', padding: '2px 6px',
            }}
            title="This is the wrong booking — pick a different one"
          >
            Reassign
          </button>
        )}
        <button
          onClick={e => { e.stopPropagation(); onDismiss() }}
          style={{
            background: 'none', border: 'none', fontSize: 11,
            color: 'var(--text-muted)', cursor: 'pointer', padding: '2px 6px',
          }}
          title="Mark read without opening"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

function UnmatchedRow({ email, sourcePath, onRoute, onDismiss }) {
  const [expanded, setExpanded] = useState(false)
  const subject = email.subject || email.email_subject || '(no subject)'
  const from = email.from || email.email_from || ''
  const rawBody = email.body || email.email_content || ''
  const body = cleanEmailBody(rawBody)
  const snippet = body.replace(/\s+/g, ' ').slice(0, 140)
  const dateStr = email.date || email.email_date
  const ago = dateStr ? timeAgo(new Date(dateStr)) : ''
  const fullDate = dateStr ? new Date(dateStr).toLocaleString() : ''
  const attachments = Array.isArray(email.attachments) ? email.attachments : []

  // Tour bucket emails encode the tour in the path:
  //   emails/tour-bucket/{safeTour}/{id}.json
  let bucketHint = ''
  if (sourcePath && sourcePath.startsWith('emails/tour-bucket/')) {
    const parts = sourcePath.split('/')
    if (parts.length >= 3) bucketHint = parts[2].replace(/_/g, ' ')
  }

  return (
    <div style={{
      borderBottom: '0.5px solid var(--border-subtle)',
      background: expanded ? 'var(--bg-secondary)' : 'var(--bg-primary)',
    }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ padding: '12px 16px', cursor: 'pointer' }}
        onMouseEnter={e => { if (!expanded) e.currentTarget.parentElement.style.background = 'var(--bg-secondary)' }}
        onMouseLeave={e => { if (!expanded) e.currentTarget.parentElement.style.background = 'var(--bg-primary)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {from || 'Unknown sender'}
            {bucketHint && <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>· tour: {bucketHint}</span>}
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{ago}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {subject}
        </div>
        {!expanded && snippet && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {snippet}
          </div>
        )}
      </div>

      {expanded && (
        <div style={{ padding: '0 16px 14px 16px' }}>
          {fullDate && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
              Received: {fullDate}
            </div>
          )}
          <div style={{
            fontSize: 12, lineHeight: 1.7, color: 'var(--text-primary)',
            whiteSpace: 'pre-wrap', maxHeight: 400, overflowY: 'auto',
            background: 'var(--bg-primary)', padding: '12px 14px',
            borderRadius: 'var(--radius-md)', border: '0.5px solid var(--border-light)',
          }}>
            {body || '(no content)'}
          </div>
          {attachments.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
              Attachments: {attachments.map(a => a.filename || 'unnamed').join(', ')}
            </div>
          )}
        </div>
      )}

      <div style={{ padding: '0 16px 12px 16px', display: 'flex', gap: 6 }}>
        <button
          onClick={(e) => { e.stopPropagation(); onRoute() }}
          className="btn btn-sm"
          style={{ fontSize: 11 }}
        >Route to booking</button>
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss() }}
          style={{
            background: 'none', border: 'none', fontSize: 11,
            color: 'var(--text-muted)', cursor: 'pointer', padding: '2px 6px',
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}


function ReadyDoneRow({ entry, onMarkDone }) {
  const replyAt = entry.reply_received_at ? new Date(entry.reply_received_at) : null
  const ago = replyAt ? timeAgo(replyAt) : ''
  return (
    <div style={{
      padding: '10px 14px',
      borderBottom: '0.5px solid var(--border-subtle)',
      background: 'var(--bg-primary)',
      display: 'flex', alignItems: 'flex-start', gap: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {entry.action}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          {entry.recipient && <>→ {entry.recipient}</>}
          {entry.tour_name && <> · {entry.tour_name}</>}
          {ago && <> · reply received {ago}</>}
        </div>
      </div>
      <button
        onClick={onMarkDone}
        className="btn btn-primary btn-sm"
        style={{ fontSize: 11, flexShrink: 0 }}
      >
        Mark done
      </button>
    </div>
  )
}

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return minutes + 'm ago'
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return hours + 'h ago'
  const days = Math.floor(hours / 24)
  if (days < 7) return days + 'd ago'
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return weeks + 'w ago'
  const months = Math.floor(days / 30)
  return months + 'mo ago'
}

// ── EmailSearch ───────────────────────────────────────────────────────────
// Site-wide email search across all stored blobs.
// Searches by lodge name, sender, subject, or check-in date.


// ── EmailSearch ───────────────────────────────────────────────────────────
// Global email search. Loads full email index once, then filters client-side
// as you type. Matches tokens against lodge name, tour name, check-in date,
// subject, and sender — so "desert sands 30 may bon 26" works naturally.

function EmailSearch({ allBookings, tours, onSelectBooking }) {
  const [query, setQuery] = React.useState('')
  const [index, setIndex] = React.useState(null)   // full email metadata array
  const [indexLoading, setIndexLoading] = React.useState(false)
  const [indexError, setIndexError] = React.useState(null)

  // Build booking lookup enriched with lodge name, tour name, check-in
  const bookingMap = React.useMemo(() => {
    const m = {}
    allBookings.forEach(b => {
      const id = b.id || b['Record Id']
      if (!id) return
      const lodge = ((b.Lodge_Name && typeof b.Lodge_Name === 'object'
        ? b.Lodge_Name.name : b.Lodge_Name) || b.Name || '').split(' - ')[0]
      const tourName = b.Tour && typeof b.Tour === 'object' ? b.Tour.name : (b.Tour || '')
      const checkIn = b.Check_in_Date || b['Check-in'] || ''
      m[id] = { booking: b, lodge, tourName, checkIn }
    })
    return m
  }, [allBookings])

  // Load index on mount
  React.useEffect(() => {
    setIndexLoading(true)
    fetch('/api/email-search?q=*')
      .then(r => r.json())
      .then(d => { setIndex(d.results || []); setIndexLoading(false) })
      .catch(e => { setIndexError(e.message); setIndexLoading(false) })
  }, [])

  // Client-side filtering — split query into tokens, all must match
  const results = React.useMemo(() => {
    if (!index || !query.trim()) return null
    const rawTokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
    if (!rawTokens.length) return null

    // Split tokens into general (3+ chars) and date fragments (1-2 digit numbers, years)
    const generalTokens = rawTokens.filter(t => t.length >= 3 && !/^\d{1,2}$/.test(t))
    const dateTokens = rawTokens.filter(t => /^\d{1,4}$/.test(t)) // e.g. "30", "26", "2026"

    return index.filter(em => {
      const meta = bookingMap[em.booking_id] || {}
      const dateSearchable = [em.date || '', meta.checkIn || ''].join(' ').toLowerCase()
      const fullSearchable = [
        em.subject || '',
        em.from || '',
        em.date || '',
        meta.lodge || '',
        meta.tourName || '',
        meta.checkIn || '',
      ].join(' ').toLowerCase()

      const generalMatch = generalTokens.every(t => fullSearchable.includes(t))
      const dateMatch = dateTokens.every(t => dateSearchable.includes(t))
      return generalMatch && dateMatch
    }).slice(0, 50)
  }, [index, query, bookingMap])

  const inputRef = React.useRef(null)

  return (
    <div>
      {/* Search input */}
      <div style={{ marginBottom: 16, position: 'relative' }}>
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="e.g. desert sands 30 may bon 26"
          autoFocus
          style={{
            width: '100%', fontSize: 13, padding: '8px 12px',
            border: '0.5px solid var(--border-default)', borderRadius: 4,
            background: 'var(--bg-primary)', color: 'var(--text-primary)',
            fontFamily: 'var(--font-sans)', boxSizing: 'border-box',
          }}
        />
        {indexLoading && (
          <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--text-muted)' }}>
            Loading index…
          </span>
        )}
      </div>

      {indexError && (
        <div style={{ fontSize: 12, color: 'var(--red-text)', marginBottom: 12 }}>Could not load email index: {indexError}</div>
      )}

      {!query.trim() && !indexLoading && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {index ? `${index.length} emails indexed. ` : ''}
          Type any combination of lodge name, tour, date or subject.
        </div>
      )}

      {results && results.length === 0 && query.trim() && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No emails found for "{query}".</div>
      )}

      {results && results.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
            {results.length}{results.length === 50 ? '+' : ''} result{results.length !== 1 ? 's' : ''}
          </div>
          <div style={{ border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            {results.map((em, i) => {
              const meta = bookingMap[em.booking_id] || {}
              const { booking, lodge, tourName, checkIn } = meta
              const date = em.date
                ? new Date(em.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
                : ''
              const isInbound = em.direction === 'inbound'
              const from = (em.from || '').split('<')[0].trim() || em.from || ''

              return (
                <div
                  key={i}
                  onClick={() => booking && onSelectBooking(booking, em.id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '44px 170px 1fr 70px',
                    alignItems: 'center', gap: 10, padding: '9px 14px',
                    borderBottom: i < results.length - 1 ? '0.5px solid var(--border-light)' : 'none',
                    cursor: booking ? 'pointer' : 'default',
                  }}
                  onMouseEnter={e => { if (booking) e.currentTarget.style.background = 'var(--bg-secondary)' }}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <span style={{ fontSize: 10, fontWeight: 600, color: isInbound ? 'var(--green-text)' : 'var(--blue-text)' }}>
                    {isInbound ? '↙ In' : '↗ Out'}
                  </span>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {lodge || '—'}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tourName}{checkIn ? ' · ' + checkIn : ''}
                    </div>
                  </div>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {em.subject || '(no subject)'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {from}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', whiteSpace: 'nowrap' }}>{date}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
