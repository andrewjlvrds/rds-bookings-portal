import React, { useState, useEffect, useMemo } from 'react'
import { fmtDate } from '../utils/helpers'

export default function Correspondence() {
  const [labels, setLabels] = useState([])
  const [loadingLabels, setLoadingLabels] = useState(true)
  const [selectedTour, setSelectedTour] = useState(null)
  const [selectedLodge, setSelectedLodge] = useState(null)
  const [emails, setEmails] = useState([])
  const [loadingEmails, setLoadingEmails] = useState(false)
  const [nextPageToken, setNextPageToken] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [search, setSearch] = useState('')
  const [directionFilter, setDirectionFilter] = useState('all')
  const [labelSource, setLabelSource] = useState('inbox') // 'inbox' or 'lodgeBookings'

  // Load labels on mount
  useEffect(() => {
    fetch('/api/gmail-labels')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setLabels([...(d.inbox_labels || []), ...(d.lodge_booking_labels || [])])
        }
        setLoadingLabels(false)
      })
      .catch(() => setLoadingLabels(false))
  }, [])

  // Parse label hierarchy: tour parents and lodge children
  const { tours, lodgesByTour } = useMemo(() => {
    const activeLabels = labels.filter(l => {
      if (labelSource === 'inbox') return l.name.startsWith('INBOX/')
      return l.name.startsWith('Lodge Bookings/')
    })

    const tourMap = {} // shortName -> label
    const lodgeMap = {} // tourShortName -> [lodgeLabels]

    activeLabels.forEach(l => {
      const parts = l.shortName.split('/')
      if (parts.length === 1) {
        // Tour-level label like "2026-04 (24 Apr - 13 May)"
        tourMap[l.shortName] = l
        if (!lodgeMap[l.shortName]) lodgeMap[l.shortName] = []
      } else if (parts.length === 2) {
        // Lodge sub-label like "2026-04 (24 Apr - 13 May)/Hohewarte"
        const tourPart = parts[0]
        const lodgePart = parts[1]
        if (!lodgeMap[tourPart]) lodgeMap[tourPart] = []
        lodgeMap[tourPart].push({ ...l, lodgeName: lodgePart })
        // Ensure tour parent exists even if no standalone label
        if (!tourMap[tourPart]) tourMap[tourPart] = null
      }
    })

    // Sort tours: most recent first (reverse alpha on YYYY-MM prefix)
    const tourList = Object.keys(tourMap).sort((a, b) => b.localeCompare(a))

    return { tours: tourList.map(t => ({ key: t, label: tourMap[t] })), lodgesByTour: lodgeMap }
  }, [labels, labelSource])

  // Build display name for tour (strip year prefix for cleaner look)
  const tourDisplayName = (key) => {
    // "2026-04 (24 Apr - 13 May)" -> "Apr - May '26"  or just show as-is but shorter
    const m = key.match(/^\d{4}-\d{2}\s*\((.+?)\)$/)
    if (m) return m[1]
    // "Complete 2026 Tours" etc
    return key
  }

  // Determine which label(s) to fetch emails from
  const activeLabel = useMemo(() => {
    if (selectedLodge) return selectedLodge
    if (selectedTour && selectedTour.label) return selectedTour.label
    return null
  }, [selectedTour, selectedLodge])

  // Load emails when active label changes
  useEffect(() => {
    if (!activeLabel) { setEmails([]); return }
    setLoadingEmails(true)
    setEmails([])
    setNextPageToken(null)
    setExpanded(null)
    fetch('/api/gmail-by-label?label_id=' + encodeURIComponent(activeLabel.id) + '&max_results=50')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setEmails(d.emails || [])
          setNextPageToken(d.nextPageToken || null)
        }
        setLoadingEmails(false)
      })
      .catch(() => setLoadingEmails(false))
  }, [activeLabel])

  const loadMore = () => {
    if (!nextPageToken || !activeLabel || loadingEmails) return
    setLoadingEmails(true)
    fetch('/api/gmail-by-label?label_id=' + encodeURIComponent(activeLabel.id) +
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

  // Current lodges for selected tour
  const currentLodges = selectedTour ? (lodgesByTour[selectedTour.key] || []) : []

  return (
    <div>
      <h1 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>Lodge correspondence</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
        Browse emails by tour and lodge from Gmail
      </p>

      {/* Source toggle */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 14, width: 'fit-content', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '0.5px solid var(--border-default)' }}>
        {[
          { key: 'inbox', label: 'Inbox labels' },
          { key: 'lodgeBookings', label: 'Lodge Bookings labels' },
        ].map(g => (
          <button
            key={g.key}
            onClick={() => { setLabelSource(g.key); setSelectedTour(null); setSelectedLodge(null) }}
            style={{
              padding: '6px 16px', fontSize: 12, fontWeight: 500, border: 'none',
              cursor: 'pointer',
              background: labelSource === g.key ? 'var(--blue-mid)' : 'var(--bg-secondary)',
              color: labelSource === g.key ? '#fff' : 'var(--text-secondary)',
            }}
          >{g.label}</button>
        ))}
      </div>

      {/* Tour buttons - horizontal scroll */}
      {loadingLabels ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>Loading labels...</div>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {tours.map(t => {
            const isSelected = selectedTour && selectedTour.key === t.key
            const lodgeCount = (lodgesByTour[t.key] || []).length
            return (
              <button
                key={t.key}
                onClick={() => {
                  if (isSelected) { setSelectedTour(null); setSelectedLodge(null) }
                  else { setSelectedTour(t); setSelectedLodge(null) }
                }}
                className={'filter-btn' + (isSelected ? ' active' : '')}
                style={{ fontSize: 12 }}
              >
                {tourDisplayName(t.key)}
                {lodgeCount > 0 && (
                  <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.6 }}>{lodgeCount}</span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Lodge sub-filter buttons */}
      {selectedTour && currentLodges.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          <button
            className={'filter-btn' + (!selectedLodge ? ' active' : '')}
            onClick={() => setSelectedLodge(null)}
            style={{ fontSize: 11 }}
          >All lodges</button>
          {currentLodges.map(l => (
            <button
              key={l.id}
              className={'filter-btn' + (selectedLodge && selectedLodge.id === l.id ? ' active' : '')}
              onClick={() => setSelectedLodge(selectedLodge && selectedLodge.id === l.id ? null : l)}
              style={{ fontSize: 11 }}
            >
              {l.lodgeName}
            </button>
          ))}
        </div>
      )}

      {/* No tour selected state */}
      {!selectedTour && !loadingLabels && (
        <div className="panel" style={{ marginTop: 8 }}>
          <div className="panel-body" style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Select a tour above to browse correspondence
          </div>
        </div>
      )}

      {/* Email list when tour is selected */}
      {selectedTour && (
        <>
          {/* Header with direction tabs + search */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-default)' }}>
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
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search subject, sender..."
              style={{
                width: 280, fontSize: 12, padding: '6px 10px',
                border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-md)',
                outline: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Email rows */}
          <div className="panel">
            <div className="panel-body" style={{ padding: 0 }}>
              {loadingEmails && emails.length === 0 ? (
                <div style={{ padding: 20, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                  Loading emails from Gmail...
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ padding: 20, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                  {emails.length === 0
                    ? (selectedTour.label ? 'No emails in this label' : 'Select a lodge to view emails')
                    : 'No emails match this filter'}
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
                          padding: '9px 14px', cursor: 'pointer', fontSize: 12,
                          background: isExpanded ? 'var(--bg-secondary)' : 'transparent',
                        }}
                      >
                        <span style={{
                          fontWeight: 600, fontSize: 10, width: 40, flexShrink: 0, textAlign: 'center',
                          padding: '2px 0', borderRadius: 3,
                          background: isOut ? 'var(--blue-bg)' : 'var(--green-bg)',
                          color: isOut ? 'var(--blue-text)' : 'var(--green-text)',
                        }}>
                          {isOut ? 'OUT' : 'IN'}
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
                          <span style={{
                            fontSize: 10, flexShrink: 0, color: 'var(--text-muted)',
                            background: 'var(--bg-secondary)', padding: '1px 5px', borderRadius: 3,
                          }}>
                            {em.attachments.length} file{em.attachments.length !== 1 ? 's' : ''}
                          </span>
                        )}
                        <span style={{ color: 'var(--text-hint)', fontSize: 11, flexShrink: 0, width: 72, textAlign: 'right' }}>
                          {fmtDate(em.date)}
                        </span>
                      </div>

                      {isExpanded && (
                        <div style={{ padding: '4px 14px 14px 62px', background: 'var(--bg-secondary)' }}>
                          <div style={{ display: 'flex', gap: 16, marginBottom: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                            <span><strong>From:</strong> {em.from || '—'}</span>
                            <span><strong>To:</strong> {em.to || '—'}</span>
                          </div>
                          <div style={{
                            fontSize: 12, lineHeight: 1.7, color: 'var(--text-primary)',
                            whiteSpace: 'pre-wrap', maxHeight: 500, overflowY: 'auto',
                            background: 'var(--bg-primary)', padding: '12px 14px',
                            borderRadius: 'var(--radius-md)', border: '0.5px solid var(--border-light)',
                          }}>
                            {em.body || em.snippet || '(no content)'}
                          </div>
                          {em.attachments && em.attachments.length > 0 && (
                            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
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
                {loadingEmails ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
