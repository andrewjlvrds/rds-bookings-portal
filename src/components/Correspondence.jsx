import React, { useState, useEffect, useMemo } from 'react'
import { fmtDate, fmtDateFull } from '../utils/helpers'

export default function Correspondence({ tours, onSelectBooking, allBookings }) {
  const [emails, setEmails] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tourFilter, setTourFilter] = useState('all')
  const [directionFilter, setDirectionFilter] = useState('all')
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    fetch('/api/all-emails')
      .then(r => r.json())
      .then(d => { setEmails(d.emails || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Build booking lookup for linking
  const bookingMap = useMemo(() => {
    const map = {}
    ;(allBookings || []).forEach(bk => {
      const id = bk.id || bk['Record Id']
      if (id) map[id] = bk
    })
    return map
  }, [allBookings])

  // Extract unique tour names from emails (via booking lookup)
  const tourNames = useMemo(() => {
    const names = new Set()
    emails.forEach(em => {
      if (em.booking_id && bookingMap[em.booking_id]) {
        const bk = bookingMap[em.booking_id]
        const tour = bk.Tour
        const tourName = tour ? (typeof tour === 'object' ? tour.name : tour) : ''
        if (tourName) names.add(tourName)
      }
    })
    return Array.from(names).sort()
  }, [emails, bookingMap])

  // Filter emails
  const filtered = useMemo(() => {
    let result = emails

    if (directionFilter !== 'all') {
      result = result.filter(em => em.direction === directionFilter)
    }

    if (tourFilter !== 'all') {
      result = result.filter(em => {
        if (!em.booking_id || !bookingMap[em.booking_id]) return false
        const bk = bookingMap[em.booking_id]
        const tour = bk.Tour
        const tourName = tour ? (typeof tour === 'object' ? tour.name : tour) : ''
        return tourName === tourFilter
      })
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(em =>
        (em.subject || em.email_subject || '').toLowerCase().includes(q) ||
        (em.from || em.email_from || '').toLowerCase().includes(q) ||
        (em.to || em.email_to || '').toLowerCase().includes(q) ||
        (em.body || em.email_content || '').toLowerCase().includes(q)
      )
    }

    return result
  }, [emails, directionFilter, tourFilter, search, bookingMap])

  const handleViewBooking = (em) => {
    if (em.booking_id && bookingMap[em.booking_id] && onSelectBooking) {
      onSelectBooking(bookingMap[em.booking_id])
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>Lodge correspondence</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
        {loading ? 'Loading...' : `${emails.length} emails across all bookings`}
      </p>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {['all', 'inbound', 'outbound'].map(f => (
          <button
            key={f}
            className={'filter-btn' + (directionFilter === f ? ' active' : '')}
            onClick={() => setDirectionFilter(f)}
          >
            {f === 'all' ? 'All' : f === 'inbound' ? 'Received' : 'Sent'}
          </button>
        ))}
        <span style={{ fontSize: 12, color: 'var(--text-hint)', padding: '5px 4px' }}>|</span>
        <button
          className={'filter-btn' + (tourFilter === 'all' ? ' active' : '')}
          onClick={() => setTourFilter('all')}
        >All tours</button>
        {tourNames.map(t => (
          <button
            key={t}
            className={'filter-btn' + (tourFilter === t ? ' active' : '')}
            onClick={() => setTourFilter(tourFilter === t ? 'all' : t)}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search subject, sender, content..."
        style={{
          width: '100%', maxWidth: 400, fontSize: 13, padding: '8px 12px',
          border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-md)',
          outline: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)',
          marginBottom: 16,
        }}
      />

      {/* Results count */}
      {!loading && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Showing {filtered.length} of {emails.length} emails
        </div>
      )}

      {/* Email list */}
      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: 20, fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>Loading emails...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 20, fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
              {emails.length === 0
                ? 'No emails stored yet. Emails are recorded when you send enquiries or poll Gmail for replies from lodge detail views.'
                : 'No emails match this filter'}
            </div>
          ) : (
            filtered.slice(0, 100).map((em) => {
              const isOut = em.direction === 'outbound'
              const isExpanded = expanded === (em.id || em.message_id)
              // Normalize field names — handle both old and new storage formats
              const emFrom = em.from || em.email_from || ''
              const emTo = em.to || em.email_to || ''
              const emSubject = em.subject || em.email_subject || ''
              const emBody = em.body || em.email_content || ''
              const emDate = em.date || em.email_date || ''
              const lodge = em.booking_id && bookingMap[em.booking_id]
                ? (bookingMap[em.booking_id].Lodge_Name || bookingMap[em.booking_id].Name || '').split(' - ')[0]
                : ''
              const bk = em.booking_id ? bookingMap[em.booking_id] : null
              const tourObj = bk && bk.Tour
              const tourName = tourObj ? (typeof tourObj === 'object' ? tourObj.name : tourObj) : ''

              return (
                <div key={em.id || em.message_id} style={{ borderBottom: '0.5px solid var(--border-light)' }}>
                  <div
                    onClick={() => setExpanded(isExpanded ? null : (em.id || em.message_id))}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 14px', cursor: 'pointer', fontSize: 12,
                    }}
                  >
                    <span style={{
                      fontWeight: 500, fontSize: 11, width: 52, flexShrink: 0,
                      color: isOut ? 'var(--blue-text)' : 'var(--green-text)',
                    }}>
                      {isOut ? 'Sent' : 'Received'}
                    </span>
                    <span style={{ color: 'var(--text-muted)', width: 100, flexShrink: 0, fontSize: 11 }}>
                      {tourName || '—'}
                    </span>
                    <span style={{
                      fontWeight: 500, width: 160, flexShrink: 0,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {lodge || (isOut ? 'to lodge' : emFrom.split('<')[0].trim())}
                    </span>
                    <span style={{
                      color: 'var(--text-secondary)', flex: 1,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {emSubject || '(no subject)'}
                    </span>
                    {em.attachments && em.attachments.length > 0 && (
                      <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>
                        {em.attachments.length} file{em.attachments.length > 1 ? 's' : ''}
                      </span>
                    )}
                    <span style={{ color: 'var(--text-hint)', fontSize: 11, flexShrink: 0, width: 70, textAlign: 'right' }}>
                      {fmtDate(emDate)}
                    </span>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: '0 14px 12px 76px' }}>
                      <div style={{ display: 'flex', gap: 12, marginBottom: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                        <span>From: {emFrom || '—'}</span>
                        <span>To: {emTo || '—'}</span>
                      </div>
                      {emSubject && (
                        <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6 }}>{emSubject}</div>
                      )}
                      <div style={{
                        fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)',
                        whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto',
                      }}>
                        {emBody || '(no content)'}
                      </div>
                      {em.attachments && em.attachments.length > 0 && (
                        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                          Attachments: {em.attachments.map(a => a.filename || a).join(', ')}
                        </div>
                      )}
                      {em.ai_summary && (
                        <div style={{
                          marginTop: 6, padding: '4px 8px', background: 'var(--blue-bg)',
                          borderRadius: 'var(--radius-sm)', fontSize: 11, color: 'var(--blue-text)',
                        }}>
                          AI: {em.ai_summary}
                        </div>
                      )}
                      {em.booking_id && bookingMap[em.booking_id] && (
                        <button
                          className="btn btn-sm"
                          style={{ marginTop: 8, fontSize: 11 }}
                          onClick={(e) => { e.stopPropagation(); handleViewBooking(em) }}
                        >
                          View booking
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
          {!loading && filtered.length > 100 && (
            <div style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
              Showing first 100 of {filtered.length} emails. Use filters to narrow down.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
