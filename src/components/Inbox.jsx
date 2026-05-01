import React, { useState, useEffect } from 'react'
import { fmtDate } from '../utils/helpers'

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
export default function Inbox({ tours, allBookings, lodges, onSelectBooking, onMarkRead, onMarkManyRead }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [routingEmail, setRoutingEmail] = useState(null) // { email, sourcePath }

  const fetchInbox = () => {
    setLoading(true)
    fetch('/api/inbox')
      .then(r => {
        if (!r.ok) throw new Error('Failed to load inbox')
        return r.json()
      })
      .then(d => {
        setData(d)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }

  useEffect(() => { fetchInbox() }, [])

  const handleOpenEmail = (email) => {
    if (!email.booking_id) return
    const bk = allBookings.find(b => b.id === email.booking_id)
    if (!bk) {
      alert('Could not find booking for this email — refreshing.')
      fetchInbox()
      return
    }
    // Mark this single email read before navigating away
    if (onMarkRead && email.id) onMarkRead(email.id)
    onSelectBooking(bk)
  }

  const handleDismiss = (email) => {
    if (onMarkRead && email.id) onMarkRead(email.id)
    setData(prev => prev ? {
      ...prev,
      unread: prev.unread.filter(e => e.id !== email.id),
      unmatched: prev.unmatched.filter(e => e.id !== email.id),
      tour_bucket: prev.tour_bucket.filter(e => e.id !== email.id),
      stats: {
        ...prev.stats,
        unread: prev.unread.filter(e => e.id !== email.id).length,
        unmatched: prev.unmatched.filter(e => e.id !== email.id).length,
        tour_bucket: prev.tour_bucket.filter(e => e.id !== email.id).length,
      },
    } : prev)
  }

  const handleMarkAllRead = (bucket) => {
    if (!data || !data[bucket] || data[bucket].length === 0) return
    if (!confirm('Mark all ' + data[bucket].length + ' emails in this section as read?')) return
    const ids = data[bucket].map(e => e.id).filter(Boolean)
    if (onMarkManyRead) onMarkManyRead(ids)
    setData(prev => ({
      ...prev,
      [bucket]: [],
      stats: { ...prev.stats, [bucket]: 0 },
    }))
  }

  const handleRoute = async (email, sourcePath, bookingId) => {
    try {
      const res = await fetch('/api/email-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_path: sourcePath, booking_id: bookingId }),
      })
      const result = await res.json()
      if (!result.success) throw new Error(result.error || 'Routing failed')
      // Remove from local state
      setData(prev => prev ? {
        ...prev,
        unmatched: prev.unmatched.filter(e => e.id !== email.id),
        tour_bucket: prev.tour_bucket.filter(e => e.id !== email.id),
      } : prev)
      setRoutingEmail(null)
    } catch (err) {
      alert('Could not route email: ' + err.message)
    }
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading inbox...</div>
  }

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ color: 'var(--red-text)', marginBottom: 8 }}>Error: {error}</div>
        <button className="btn" onClick={fetchInbox}>Retry</button>
      </div>
    )
  }

  const unread = data?.unread || []
  const unmatched = data?.unmatched || []
  const tourBucket = data?.tour_bucket || []
  const total = unread.length + unmatched.length + tourBucket.length

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 500 }}>Inbox</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            {total === 0 ? 'All caught up.' : total + ' email' + (total === 1 ? '' : 's') + ' need attention'}
          </div>
        </div>
        <button onClick={fetchInbox} className="btn btn-sm" style={{ fontSize: 12 }}>↻ Refresh</button>
      </div>

      {total === 0 && (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)' }}>
          Nothing new to look at. New replies will appear here as they arrive.
        </div>
      )}

      {unread.length > 0 && (
        <Section
          title="Unread replies"
          subtitle={unread.length + ' new ' + (unread.length === 1 ? 'reply' : 'replies') + ' from lodges'}
          accent="#C62828"
          onMarkAllRead={() => handleMarkAllRead('unread')}
        >
          {unread.map(email => (
            <UnreadRow
              key={email.id}
              email={email}
              tours={tours}
              allBookings={allBookings}
              onOpen={() => handleOpenEmail(email)}
              onDismiss={() => handleDismiss(email)}
            />
          ))}
        </Section>
      )}

      {unmatched.length > 0 && (
        <Section
          title="Unmatched — needs routing"
          subtitle="The matcher could not find a booking for these. Route them to the right lodge booking."
          accent="#E65100"
          onMarkAllRead={() => handleMarkAllRead('unmatched')}
        >
          {unmatched.map(email => (
            <UnmatchedRow
              key={email.id}
              email={email}
              sourcePath={email._blob_path}
              onRoute={() => setRoutingEmail({ email, sourcePath: email._blob_path })}
              onDismiss={() => handleDismiss(email)}
            />
          ))}
        </Section>
      )}

      {tourBucket.length > 0 && (
        <Section
          title="Tour known, booking unclear"
          subtitle="Tour matched but specific lodge booking ambiguous. Route to the right one."
          accent="#E65100"
          onMarkAllRead={() => handleMarkAllRead('tour_bucket')}
        >
          {tourBucket.map(email => (
            <UnmatchedRow
              key={email.id}
              email={email}
              sourcePath={email._blob_path}
              onRoute={() => setRoutingEmail({ email, sourcePath: email._blob_path })}
              onDismiss={() => handleDismiss(email)}
            />
          ))}
        </Section>
      )}

      {routingEmail && (
        <RoutingPicker
          email={routingEmail.email}
          sourcePath={routingEmail.sourcePath}
          tours={tours}
          allBookings={allBookings}
          lodges={lodges}
          onCancel={() => setRoutingEmail(null)}
          onRoute={(bookingId) => handleRoute(routingEmail.email, routingEmail.sourcePath, bookingId)}
        />
      )}
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

function UnreadRow({ email, tours, allBookings, onOpen, onDismiss }) {
  const bk = allBookings.find(b => b.id === email.booking_id)
  const lodgeName = bk ? (typeof bk.Lodge_Name === 'object' ? bk.Lodge_Name?.name : bk.Lodge_Name) || bk.Name || '' : ''
  const tour = bk && tours ? tours.find(t => (t.bookings || []).some(b => b.id === bk.id)) : null
  const tourName = tour ? tour.name : ''
  const checkIn = bk?.Check_in_Date || ''
  const subject = email.subject || email.email_subject || '(no subject)'
  const snippet = (email.body || email.email_content || '').replace(/\s+/g, ' ').slice(0, 140)
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
      <button
        onClick={e => { e.stopPropagation(); onDismiss() }}
        style={{
          background: 'none', border: 'none', fontSize: 11,
          color: 'var(--text-muted)', cursor: 'pointer', padding: '2px 6px',
          flexShrink: 0,
        }}
        title="Mark read without opening"
      >
        Dismiss
      </button>
    </div>
  )
}

function UnmatchedRow({ email, sourcePath, onRoute, onDismiss }) {
  const subject = email.subject || email.email_subject || '(no subject)'
  const from = email.from || email.email_from || ''
  const snippet = (email.body || email.email_content || '').replace(/\s+/g, ' ').slice(0, 140)
  const dateStr = email.date || email.email_date
  const ago = dateStr ? timeAgo(new Date(dateStr)) : ''

  // Tour bucket emails encode the tour in the path:
  //   emails/tour-bucket/{safeTour}/{id}.json
  let bucketHint = ''
  if (sourcePath && sourcePath.startsWith('emails/tour-bucket/')) {
    const parts = sourcePath.split('/')
    if (parts.length >= 3) bucketHint = parts[2].replace(/_/g, ' ')
  }

  return (
    <div style={{
      padding: '12px 16px',
      borderBottom: '0.5px solid var(--border-subtle)',
      background: 'var(--bg-primary)',
    }}>
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
      {snippet && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
          {snippet}
        </div>
      )}
      <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
        <button onClick={onRoute} className="btn btn-sm" style={{ fontSize: 11 }}>Route to booking</button>
        <button
          onClick={onDismiss}
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

function RoutingPicker({ email, tours, allBookings, lodges, onCancel, onRoute }) {
  const [search, setSearch] = useState('')
  const [selectedTourId, setSelectedTourId] = useState(null)

  // Try to pre-select tour from sender domain or subject
  // (best-effort — Helen can change it)
  useEffect(() => {
    const subj = (email.subject || email.email_subject || '').toLowerCase()
    const found = (tours || []).find(t => subj.includes(t.name.toLowerCase()))
    if (found) setSelectedTourId(found.id)
  }, [email, tours])

  const committedTours = (tours || []).filter(t => {
    if (typeof t.id === 'string' && t.id.startsWith('local_')) return false
    if (t.tour_status === 'Draft') return false
    return true
  }).sort((a, b) => (a.start_date || a.departure_date || '').localeCompare(b.start_date || b.departure_date || ''))

  const filteredTours = search
    ? committedTours.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    : committedTours

  const selectedTour = committedTours.find(t => t.id === selectedTourId)
  const tourBookings = selectedTour
    ? (selectedTour.bookings || []).slice().sort((a, b) => (a.Check_in_Date || '').localeCompare(b.Check_in_Date || ''))
    : []

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
          maxWidth: 640, width: '100%', maxHeight: '85vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 16px', borderBottom: '0.5px solid var(--border-default)' }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>Route email to booking</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {email.subject || email.email_subject || '(no subject)'}
          </div>
        </div>

        <div style={{ padding: '10px 16px', borderBottom: '0.5px solid var(--border-default)' }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tours..."
            style={{
              width: '100%', fontSize: 13, padding: '6px 10px',
              border: '0.5px solid var(--border-default)', borderRadius: 4,
              outline: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)',
            }}
          />
        </div>

        <div style={{ flex: 1, overflow: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          {/* Tours */}
          <div style={{ borderRight: '0.5px solid var(--border-default)', overflow: 'auto' }}>
            <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '0.5px solid var(--border-subtle)' }}>
              Tours
            </div>
            {filteredTours.map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedTourId(t.id)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 12px', fontSize: 12,
                  border: 'none', background: selectedTourId === t.id ? 'var(--blue-bg)' : 'transparent',
                  color: selectedTourId === t.id ? 'var(--blue-text)' : 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                {t.name}
              </button>
            ))}
            {filteredTours.length === 0 && (
              <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>No tours found</div>
            )}
          </div>

          {/* Bookings within selected tour */}
          <div style={{ overflow: 'auto' }}>
            <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '0.5px solid var(--border-subtle)' }}>
              {selectedTour ? 'Lodge bookings' : 'Pick a tour first'}
            </div>
            {tourBookings.map(bk => {
              const ln = (typeof bk.Lodge_Name === 'object' ? bk.Lodge_Name?.name : bk.Lodge_Name) || bk.Name || '(unnamed)'
              return (
                <button
                  key={bk.id}
                  onClick={() => onRoute(bk.id)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '8px 12px', fontSize: 12,
                    border: 'none', background: 'transparent',
                    color: 'var(--text-primary)', cursor: 'pointer',
                    borderBottom: '0.5px solid var(--border-subtle)',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ fontWeight: 500 }}>{ln}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {fmtDate(bk.Check_in_Date)} → {fmtDate(bk.Check_out_Date)}
                  </div>
                </button>
              )
            })}
            {selectedTour && tourBookings.length === 0 && (
              <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>No bookings on this tour</div>
            )}
          </div>
        </div>

        <div style={{ padding: '10px 16px', borderTop: '0.5px solid var(--border-default)', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} className="btn btn-sm">Cancel</button>
        </div>
      </div>
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
