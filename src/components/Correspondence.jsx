import React, { useState, useEffect, useMemo } from 'react'
import { fmtDate } from '../utils/helpers'

export default function Correspondence({ tours, onSelectBooking, allBookings }) {
  const [labels, setLabels] = useState({ inbox: [], lodgeBookings: [] })
  const [loadingLabels, setLoadingLabels] = useState(true)
  const [selectedLabel, setSelectedLabel] = useState(null)
  const [emails, setEmails] = useState([])
  const [loadingEmails, setLoadingEmails] = useState(false)
  const [nextPageToken, setNextPageToken] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [search, setSearch] = useState('')
  const [directionFilter, setDirectionFilter] = useState('all')
  const [labelGroup, setLabelGroup] = useState('inbox')

  // Load labels on mount
  useEffect(() => {
    fetch('/api/gmail-labels')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setLabels({
            inbox: d.inbox_labels || [],
            lodgeBookings: d.lodge_booking_labels || [],
          })
        }
        setLoadingLabels(false)
      })
      .catch(() => setLoadingLabels(false))
  }, [])

  // Load emails when label selected
  useEffect(() => {
    if (!selectedLabel) { setEmails([]); return }
    setLoadingEmails(true)
    setEmails([])
    setNextPageToken(null)
    setExpanded(null)
    fetch('/api/gmail-by-label?label_id=' + encodeURIComponent(selectedLabel.id) + '&max_results=50')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setEmails(d.emails || [])
          setNextPageToken(d.nextPageToken || null)
        }
        setLoadingEmails(false)
      })
      .catch(() => setLoadingEmails(false))
  }, [selectedLabel])

  const loadMore = () => {
    if (!nextPageToken || !selectedLabel || loadingEmails) return
    setLoadingEmails(true)
    fetch('/api/gmail-by-label?label_id=' + encodeURIComponent(selectedLabel.id) +
      '&max_results=50&page_token=' + encodeURIComponent(nextPageToken))
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setEmails(prev => [...prev, ...(d.emails || [])])
          setNextPageToken(d.nextPageToken || null)
        }
        setLoadingEmails(false)
      })
      .catch(() => setLoadingEmails(false))
  }

  // Group labels by year
  const groupedLabels = useMemo(() => {
    const active = labelGroup === 'inbox' ? labels.inbox : labels.lodgeBookings
    const groups = {}
    active.forEach(l => {
      const match = l.shortName.match(/^(20\d{2})/)
      const year = match ? match[1] : 'Other'
      if (!groups[year]) groups[year] = []
      groups[year].push(l)
    })
    const sorted = Object.keys(groups).sort((a, b) => {
      if (a === 'Other') return 1
      if (b === 'Other') return -1
      return b.localeCompare(a)
    })
    return sorted.map(y => ({ year: y, labels: groups[y] }))
  }, [labels, labelGroup])

  // Filter emails
  const filtered = useMemo(() => {
    let result = emails
    if (directionFilter !== 'all') {
      result = result.filter(em => em.direction === directionFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(em =>
        (em.subject || '').toLowerCase().includes(q) ||
        (em.from || '').toLowerCase().includes(q) ||
        (em.to || '').toLowerCase().includes(q) ||
        (em.snippet || '').toLowerCase().includes(q)
      )
    }
    return result
  }, [emails, directionFilter, search])

  const inCount = emails.filter(e => e.direction === 'inbound').length
  const outCount = emails.filter(e => e.direction === 'outbound').length

  return (
    <div style={{ display: 'flex', gap: 0, height: 'calc(100vh - 60px)' }}>
      {/* Sidebar: label browser */}
      <div style={{
        width: 240, flexShrink: 0, borderRight: '0.5px solid var(--border-default)',
        overflowY: 'auto', padding: '12px 0',
      }}>
        <div style={{ padding: '0 14px 12px', fontSize: 13, fontWeight: 600 }}>Correspondence</div>

        {/* Label group toggle */}
        <div style={{ display: 'flex', gap: 0, margin: '0 10px 10px', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '0.5px solid var(--border-default)' }}>
          {[
            { key: 'inbox', label: 'Inbox' },
            { key: 'lodgeBookings', label: 'Lodge Bookings' },
          ].map(g => (
            <button
              key={g.key}
              onClick={() => { setLabelGroup(g.key); setSelectedLabel(null) }}
              style={{
                flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 500, border: 'none',
                cursor: 'pointer',
                background: labelGroup === g.key ? 'var(--blue-mid)' : 'var(--bg-secondary)',
                color: labelGroup === g.key ? '#fff' : 'var(--text-secondary)',
              }}
            >{g.label}</button>
          ))}
        </div>

        {loadingLabels ? (
          <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)' }}>Loading labels...</div>
        ) : groupedLabels.length === 0 ? (
          <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)' }}>No labels found</div>
        ) : (
          groupedLabels.map(group => (
            <div key={group.year}>
              <div style={{
                padding: '8px 14px 4px', fontSize: 10, fontWeight: 600,
                color: 'var(--text-hint)', textTransform: 'uppercase', letterSpacing: '0.5px',
              }}>
                {group.year}
              </div>
              {group.labels.map(l => (
                <button
                  key={l.id}
                  onClick={() => setSelectedLabel(l)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '7px 14px 7px 20px', fontSize: 12, border: 'none',
                    cursor: 'pointer',
                    background: selectedLabel && selectedLabel.id === l.id ? 'var(--blue-bg)' : 'transparent',
                    color: selectedLabel && selectedLabel.id === l.id ? 'var(--blue-text)' : 'var(--text-secondary)',
                    fontWeight: selectedLabel && selectedLabel.id === l.id ? 500 : 400,
                  }}
                >
                  {l.shortName}
                </button>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Main: email list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {!selectedLabel ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            <div style={{ fontSize: 18, marginBottom: 8 }}>Select a label</div>
            <div>Choose a tour or month label from the sidebar to browse correspondence.</div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>{selectedLabel.shortName}</h2>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {loadingEmails ? 'loading...' : `${emails.length} emails`}
              </span>
            </div>

            {/* Direction tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-default)', marginBottom: 10 }}>
              {[
                { key: 'all', label: 'All', count: emails.length },
                { key: 'inbound', label: 'Received', count: inCount },
                { key: 'outbound', label: 'Sent', count: outCount },
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setDirectionFilter(f.key)}
                  style={{
                    padding: '6px 16px', fontSize: 12, fontWeight: 500, border: 'none',
                    background: 'transparent', cursor: 'pointer',
                    color: directionFilter === f.key ? 'var(--blue-text)' : 'var(--text-muted)',
                    borderBottom: directionFilter === f.key ? '2px solid var(--blue-mid)' : '2px solid transparent',
                    marginBottom: -1,
                  }}
                >
                  {f.label}
                  <span style={{ fontSize: 10, marginLeft: 4, color: 'var(--text-hint)' }}>{f.count}</span>
                </button>
              ))}
            </div>

            {/* Search */}
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search subject, sender..."
              style={{
                width: '100%', maxWidth: 360, fontSize: 12, padding: '6px 10px',
                border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-md)',
                outline: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)',
                marginBottom: 12,
              }}
            />

            {/* Email list */}
            <div className="panel">
              <div className="panel-body" style={{ padding: 0 }}>
                {loadingEmails && emails.length === 0 ? (
                  <div style={{ padding: 20, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                    Loading emails from Gmail...
                  </div>
                ) : filtered.length === 0 ? (
                  <div style={{ padding: 20, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                    {emails.length === 0 ? 'No emails in this label' : 'No emails match this filter'}
                  </div>
                ) : (
                  filtered.map(em => {
                    const isOut = em.direction === 'outbound'
                    const isExpanded = expanded === em.id
                    const fromDisplay = isOut
                      ? (em.to || '').split('<')[0].trim() || em.to
                      : (em.from || '').split('<')[0].trim() || em.from

                    return (
                      <div key={em.id} style={{ borderBottom: '0.5px solid var(--border-light)' }}>
                        <div
                          onClick={() => setExpanded(isExpanded ? null : em.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '8px 12px', cursor: 'pointer', fontSize: 12,
                          }}
                        >
                          <span style={{
                            fontWeight: 500, fontSize: 10, width: 44, flexShrink: 0,
                            color: isOut ? 'var(--blue-text)' : 'var(--green-text)',
                          }}>
                            {isOut ? 'SENT' : 'IN'}
                          </span>
                          <span style={{
                            fontWeight: 500, width: 180, flexShrink: 0,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {fromDisplay || '—'}
                          </span>
                          <span style={{
                            color: 'var(--text-secondary)', flex: 1,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {em.subject || '(no subject)'}
                          </span>
                          {em.attachments && em.attachments.length > 0 && (
                            <span style={{ color: 'var(--text-muted)', fontSize: 10, flexShrink: 0 }}>
                              📎{em.attachments.length}
                            </span>
                          )}
                          <span style={{ color: 'var(--text-hint)', fontSize: 11, flexShrink: 0, width: 70, textAlign: 'right' }}>
                            {fmtDate(em.date)}
                          </span>
                        </div>

                        {isExpanded && (
                          <div style={{ padding: '0 12px 10px 64px' }}>
                            <div style={{ display: 'flex', gap: 12, marginBottom: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                              <span>From: {em.from || '—'}</span>
                              <span>To: {em.to || '—'}</span>
                            </div>
                            {em.subject && (
                              <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6 }}>{em.subject}</div>
                            )}
                            <div style={{
                              fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)',
                              whiteSpace: 'pre-wrap', maxHeight: 400, overflowY: 'auto',
                            }}>
                              {em.body || em.snippet || '(no content)'}
                            </div>
                            {em.attachments && em.attachments.length > 0 && (
                              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                                Attachments: {em.attachments.map(a => a.filename).join(', ')}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Load more */}
            {nextPageToken && (
              <div style={{ textAlign: 'center', padding: 12 }}>
                <button
                  className="btn btn-sm"
                  onClick={loadMore}
                  disabled={loadingEmails}
                  style={{ fontSize: 12 }}
                >
                  {loadingEmails ? 'Loading...' : 'Load more emails'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
