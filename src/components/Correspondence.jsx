import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { fmtDate } from '../utils/helpers'

// Tour name mappings from Gmail label shortNames
const TOUR_NAMES = {
  '30 Mar - 18 Apr': 'FoSA Mar \'26',
  '24 Apr - 13 May': 'FoSA Apr \'26',
  '25 May - 6 June': 'BoN May \'26',
  '2026-06 June': 'June \'26',
  '2026-07 Great Lakes': 'GL Jul \'26',
  '2026-08 August': 'August \'26',
  '2026-09 Sept (11-30) Group A': 'FoSA 9 Sep \'26',
  '2026-09 Sept (9-28) Group B': 'FoSA 11 Sep \'26',
  '2026-10 October': 'FoSA Oct \'26',
}

function tourDisplay(shortName) {
  // Check direct mapping first
  if (TOUR_NAMES[shortName]) return TOUR_NAMES[shortName]
  // Try matching just the part before any /
  const base = shortName.split('/')[0]
  if (TOUR_NAMES[base]) return TOUR_NAMES[base]
  return shortName
}

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
  const [labelSource, setLabelSource] = useState('all')
  const [summary, setSummary] = useState(null)
  const [loadingSummary, setLoadingSummary] = useState(false)

  // Load labels on mount
  useEffect(() => {
    fetch('/api/gmail-labels')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setLabels([
            ...(d.inbox_labels || []),
            ...(d.lodge_booking_labels || []),
            ...(d.tour_labels || []).map(l => ({ ...l, _source: 'tour' })),
          ])
        }
        setLoadingLabels(false)
      })
      .catch(() => setLoadingLabels(false))
  }, [])

  // Parse label hierarchy — merge all sources, skip noise labels
  const { tours, lodgesByTour } = useMemo(() => {
    // Skip known non-tour labels
    const skipLabels = ['google admin', '2025 archive', 'previous 2025 emails', 'lodges general', 'general']

    const tourMap = {}
    const lodgeMap = {}

    labels.forEach(l => {
      // Strip prefix to get the useful part
      let short = l.shortName
      if (l.name.startsWith('INBOX/')) short = l.shortName
      else if (l.name.startsWith('Lodge Bookings/')) short = l.shortName
      else if (l._source === 'tour') short = l.shortName
      else return

      if (skipLabels.includes(short.toLowerCase())) return

      const parts = short.split('/')
      if (parts.length === 1) {
        // Tour-level label — deduplicate by shortName
        if (!tourMap[short]) tourMap[short] = l
        if (!lodgeMap[short]) lodgeMap[short] = []
      } else if (parts.length === 2) {
        const tourPart = parts[0]
        const lodgePart = parts[1]
        if (!lodgeMap[tourPart]) lodgeMap[tourPart] = []
        // Deduplicate lodges by name
        if (!lodgeMap[tourPart].some(x => x.lodgeName === lodgePart)) {
          lodgeMap[tourPart].push({ ...l, lodgeName: lodgePart })
        }
        if (!tourMap[tourPart]) tourMap[tourPart] = null
      }
    })

    // Sort: most recent first
    const tourList = Object.keys(tourMap).sort((a, b) => b.localeCompare(a))
    return { tours: tourList.map(t => ({ key: t, label: tourMap[t] })), lodgesByTour: lodgeMap }
  }, [labels, labelSource])

  // Active label to fetch
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
    setSummary(null)
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

  // Generate AI summary for current lodge emails
  const generateSummary = useCallback(() => {
    if (emails.length === 0 || loadingSummary) return
    setLoadingSummary(true)
    setSummary(null)

    const lodgeName = selectedLodge ? selectedLodge.lodgeName : (selectedTour ? tourDisplay(selectedTour.key) : 'Unknown')
    const tourName = selectedTour ? tourDisplay(selectedTour.key) : ''

    // Build conversation text from emails (chronological)
    const sorted = [...emails].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0))
    const thread = sorted.map(em => {
      const dir = em.direction === 'outbound' ? 'SENT' : 'RECEIVED'
      const from = (em.from || '').split('<')[0].trim()
      const date = em.date ? new Date(em.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
      const body = (em.body || em.snippet || '').substring(0, 1500)
      return `[${dir}] ${date} - From: ${from}\nSubject: ${em.subject || ''}\n${body}`
    }).join('\n\n---\n\n')

    fetch('/api/ai-summarise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lodge: lodgeName,
        tour: tourName,
        thread: thread,
        emailCount: emails.length,
      }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.summary) setSummary(d.summary)
        else setSummary('Could not generate summary.')
        setLoadingSummary(false)
      })
      .catch(() => { setSummary('Error generating summary.'); setLoadingSummary(false) })
  }, [emails, selectedLodge, selectedTour, loadingSummary])

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
  const currentLodges = selectedTour ? (lodgesByTour[selectedTour.key] || []) : []

  return (
    <div>
      <h1 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>Lodge correspondence</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
        Browse emails by tour and lodge from Gmail
      </p>

      {/* Tour buttons with year-colour borders */}
      {loadingLabels ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>Loading labels...</div>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {tours.map(t => {
            const isSelected = selectedTour && selectedTour.key === t.key
            const lodgeCount = (lodgesByTour[t.key] || []).length
            // Determine year for colour coding
            const yearMatch = t.key.match(/(20\d{2})/) || tourDisplay(t.key).match(/'(\d{2})/)
            let yearColor = 'var(--border-default)'
            if (yearMatch) {
              const yr = yearMatch[1].length === 4 ? yearMatch[1] : '20' + yearMatch[1]
              if (yr === '2026') yearColor = '#3b82f6'  // blue
              else if (yr === '2027') yearColor = '#8b5cf6'  // purple
              else if (yr === '2028') yearColor = '#f59e0b'  // amber
              else if (yr === '2025') yearColor = '#9ca3af'  // grey
            }
            return (
              <button
                key={t.key}
                onClick={() => {
                  if (isSelected) { setSelectedTour(null); setSelectedLodge(null); setSummary(null) }
                  else { setSelectedTour(t); setSelectedLodge(null); setSummary(null) }
                }}
                className={'filter-btn' + (isSelected ? ' active' : '')}
                style={{
                  fontSize: 12,
                  borderLeft: isSelected ? undefined : `3px solid ${yearColor}`,
                }}
              >
                {tourDisplay(t.key)}
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
            onClick={() => { setSelectedLodge(null); setSummary(null) }}
            style={{ fontSize: 11 }}
          >All lodges</button>
          {currentLodges.map(l => (
            <button
              key={l.id}
              className={'filter-btn' + (selectedLodge && selectedLodge.id === l.id ? ' active' : '')}
              onClick={() => { setSelectedLodge(selectedLodge && selectedLodge.id === l.id ? null : l); setSummary(null) }}
              style={{ fontSize: 11 }}
            >
              {l.lodgeName}
            </button>
          ))}
        </div>
      )}

      {/* No tour selected */}
      {!selectedTour && !loadingLabels && (
        <div className="panel" style={{ marginTop: 8 }}>
          <div className="panel-body" style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Select a tour above to browse correspondence
          </div>
        </div>
      )}

      {/* Email content when tour selected */}
      {selectedTour && (
        <>
          {/* AI Summary box */}
          {(selectedLodge || selectedTour) && emails.length > 0 && (
            <div style={{
              marginBottom: 14, padding: '10px 14px',
              background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)',
              border: '0.5px solid var(--border-default)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: summary ? 8 : 0 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Conversation summary
                  {selectedLodge && <span style={{ fontWeight: 400 }}> — {selectedLodge.lodgeName}</span>}
                </span>
                <button
                  className="btn btn-sm"
                  onClick={generateSummary}
                  disabled={loadingSummary}
                  style={{ fontSize: 11, padding: '3px 10px' }}
                >
                  {loadingSummary ? 'Summarising...' : summary ? 'Refresh' : 'Summarise'}
                </button>
              </div>
              {loadingSummary && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 0' }}>
                  Analysing {emails.length} email{emails.length !== 1 ? 's' : ''}...
                </div>
              )}
              {summary && !loadingSummary && (
                <div style={{
                  fontSize: 12, lineHeight: 1.7, color: 'var(--text-primary)',
                  whiteSpace: 'pre-wrap',
                }}>
                  {summary}
                </div>
              )}
            </div>
          )}

          {/* Direction tabs + search */}
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
