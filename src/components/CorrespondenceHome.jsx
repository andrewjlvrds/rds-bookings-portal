import React, { useState, useEffect } from 'react'
import RoutingPicker from './RoutingPicker'

/*
 * Correspondence — the default landing tab.
 *
 * Four cards over a 72-hour window: came in / auto-filed / routed by
 * hand / needs routing. Clicking a card expands its email list in
 * place (no navigation, no disorientation). Needs-routing rows carry
 * the matcher's hint chips — one tap files the email via
 * /api/email-route (which repairs anchors, learns the sender, and
 * syncs the Gmail label) and the row disappears. Dismiss hides noise
 * via the shared read-state.
 */
export default function CorrespondenceHome({ tours, allBookings, onSelectBooking }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState('needs_routing')
  const [removed, setRemoved] = useState(new Set())
  const [busy, setBusy] = useState(null) // email id being routed
  const [toast, setToast] = useState(null)
  const [picking, setPicking] = useState(null) // email needing manual pick

  const load = () => {
    fetch('/api/daily-summary?days=3&include=emails')
      .then(r => r.json())
      .then(d => { if (d.success) setData(d); else setError(d.error || 'Failed to load') })
      .catch(e => setError(e.message))
  }
  useEffect(load, [])

  const bookingName = (id) => {
    if (!id || !allBookings) return ''
    const bk = allBookings.find(b => b.id === id)
    if (!bk) return ''
    let lodge = bk.Lodge_Name
    if (typeof lodge === 'object' && lodge !== null) lodge = lodge.name
    lodge = (lodge || bk.Name || '').split(' - ')[0]
    let tour = bk.Tour
    if (typeof tour === 'object' && tour !== null) tour = tour.name
    return lodge + (tour ? ' · ' + tour : '')
  }

  const flash = (msg, ok) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 4000) }

  const routeEmail = async (email, bookingId) => {
    setBusy(email.id)
    try {
      const res = await fetch('/api/email-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_path: email.blob_path, booking_id: bookingId }),
      })
      const d = await res.json()
      if (!d.success) throw new Error(d.error || 'Routing failed')
      setRemoved(prev => new Set(prev).add(email.id))
      const label = d.label_sync && d.label_sync.applied
      flash('Filed' + (label ? ' — Gmail label: ' + label : ''), true)
      fetch('/api/match-correction-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email_id: email.id, subject: email.subject, from: email.from,
          email_date: email.date, original_booking_id: null,
          original_match_method: 'unmatched', new_booking_id: bookingId,
          surface: 'correspondence-home', author: 'Helen',
        }),
      }).catch(() => {})
    } catch (e) {
      flash('Could not file: ' + e.message, false)
    } finally {
      setBusy(null)
      setPicking(null)
    }
  }

  const dismissEmail = (email) => {
    setRemoved(prev => new Set(prev).add(email.id))
    fetch('/api/email-read-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email_id: email.id, read: true }),
    }).catch(() => {})
  }

  if (error) return <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>Could not load correspondence summary: {error}</div>

  const t = data && data.totals
  const q = data && data.queues
  const lists = (data && data.emails) || {}
  const visible = (arr) => (arr || []).filter(e => !removed.has(e.id))
  const routingList = visible(lists.needs_routing)

  const CARDS = [
    { key: 'came_in', label: 'Came in', value: t && t.came_in },
    { key: 'auto_filed', label: 'Auto-filed', value: t && t.auto_filed, color: 'var(--green-text, #0F6E56)' },
    { key: 'manual', label: 'Routed by hand', value: t && t.manually_routed },
    { key: 'needs_routing', label: 'Needs routing', value: q != null ? routingList.length : null, color: routingList.length > 0 ? '#BA7517' : 'var(--green-text, #0F6E56)' },
  ]

  return (
    <div style={{ maxWidth: 980, margin: '0 auto' }}>
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: toast.ok ? '#166534' : '#991b1b', color: '#fff', fontSize: 13, fontWeight: 500, padding: '10px 18px', borderRadius: 6 }}>
          {toast.msg}
        </div>
      )}
      <h1 style={{ fontSize: 18, fontWeight: 500, marginBottom: 2 }}>Correspondence</h1>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>Last 72 hours · click a card to see its emails</div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        {CARDS.map(c => (
          <div key={c.key}
            onClick={() => setExpanded(expanded === c.key ? null : c.key)}
            style={{
              flex: 1, minWidth: 160, cursor: 'pointer',
              background: 'var(--bg-primary, #fff)',
              border: expanded === c.key ? '1.5px solid var(--blue-mid, #85B7EB)' : '1px solid var(--border-default, #E5E5E5)',
              borderRadius: 10, padding: '14px 16px',
            }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
              <span>{c.label}</span>
              <span style={{ fontSize: 10 }}>{expanded === c.key ? '▲' : '▼'}</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 600, color: c.color || 'var(--text-primary)' }}>{c.value == null ? '—' : c.value}</div>
          </div>
        ))}
      </div>

      {data && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, alignItems: 'flex-end', height: 38 }}>
          {data.per_day.map(d => {
            const max = Math.max(1, ...data.per_day.map(x => x.inbound))
            return (
              <div key={d.day} title={d.day + ': ' + d.inbound + ' in, ' + d.auto + ' auto-filed'} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 2 }}>
                <div style={{ height: Math.max(3, Math.round((d.inbound / max) * 30)), background: d.inbound ? '#9FE1CB' : '#EEE', borderRadius: 3 }} />
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>{d.day.slice(8)}</div>
              </div>
            )
          })}
        </div>
      )}

      {expanded && !data && <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: 20 }}>Loading…</div>}

      {expanded && data && (
        <div style={{ border: '0.5px solid var(--border-default, #E5E5E5)', borderRadius: 10, overflow: 'hidden' }}>
          {visible(lists[expanded]).length === 0 && (
            <div style={{ padding: 24, fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
              {expanded === 'needs_routing' ? 'Nothing needs routing. All clear.' : 'Nothing in this bucket for the last 72 hours.'}
            </div>
          )}
          {visible(lists[expanded]).map(e => (
            <div key={e.id + (e.blob_path || '')} style={{ padding: '11px 16px', borderBottom: '0.5px solid var(--border-subtle, #F0F0F0)', opacity: busy === e.id ? 0.5 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {(e.from || '').replace(/<.*>/, '').trim() || e.from || 'Unknown sender'}
                    {e.booking_id && <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>→ {bookingName(e.booking_id)}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.subject || '(no subject)'}</div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexShrink: 0, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{e.date ? new Date(e.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''}</span>
                  {expanded === 'needs_routing' && (
                    <button onClick={() => dismissEmail(e)} style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}>Dismiss</button>
                  )}
                  {expanded !== 'needs_routing' && e.booking_id && onSelectBooking && (
                    <button onClick={() => onSelectBooking(e.booking_id)} style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--blue-text, #185FA5)', cursor: 'pointer', padding: 0 }}>Open</button>
                  )}
                </div>
              </div>
              {expanded === 'needs_routing' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 7, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Looks like:</span>
                  {(e.match_hints || []).filter(h => h && h.id).map(h => (
                    <button key={h.id} disabled={busy === e.id}
                      onClick={() => routeEmail(e, h.id)}
                      title={'File to this booking' + (h.check_in ? ' — check-in ' + h.check_in : '')}
                      style={{
                        fontSize: 12, padding: '3px 10px', borderRadius: 12, cursor: 'pointer',
                        background: h.confident ? 'var(--blue-bg, #E6F1FB)' : 'var(--bg-primary, #fff)',
                        color: h.confident ? 'var(--blue-text, #185FA5)' : 'var(--text-secondary)',
                        border: '0.5px solid ' + (h.confident ? 'var(--blue-mid, #85B7EB)' : 'var(--border-default, #DDD)'),
                      }}>
                      {h.lodge}{h.tour ? ' · ' + h.tour : ''}{h.check_in ? ' · ' + h.check_in.slice(5) : ''}
                    </button>
                  ))}
                  <button disabled={busy === e.id}
                    onClick={() => setPicking(e)}
                    style={{ fontSize: 12, padding: '3px 10px', borderRadius: 12, cursor: 'pointer', background: 'none', border: '0.5px dashed var(--border-default, #CCC)', color: 'var(--text-muted)' }}>
                    {(e.match_hints || []).length ? 'Someone else…' : 'Choose booking…'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {picking && (
        <RoutingPicker
          email={picking}
          tours={tours}
          onCancel={() => setPicking(null)}
          onRoute={(bookingId) => routeEmail(picking, bookingId)}
        />
      )}
    </div>
  )
}
