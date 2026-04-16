import React, { useState, useEffect } from 'react'

export default function PortalSync({ tour }) {
  const [data, setData] = useState(null)
  const [overrides, setOverrides] = useState({}) // { [day]: { value, saving } }
  const [narratives, setNarratives] = useState({}) // { [day]: { editing, value, saving, generating } }
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)
  const [error, setError] = useState(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    setSyncResult(null)
    try {
      const res = await fetch('/api/portal-sync?tour=' + encodeURIComponent(tour.name) + (tour.departure_date ? '&start=' + tour.departure_date : '') + '&t=' + Date.now())
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed to load')
      setData(d)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (tour && tour.name) load()
  }, [tour.name])

  const handleOverride = async (day, supabaseId, value) => {
    if (!value.trim()) return
    setOverrides(prev => ({ ...prev, [day]: { value, saving: true } }))
    try {
      const res = await fetch('/api/portal-sync?tour=' + encodeURIComponent(tour.name) + '&t=' + Date.now(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tour: tour.name, override: { day, supabase_id: supabaseId, lodge: value } }),
      })
      const d = await res.json()
      if (!d.error) {
        setOverrides(prev => ({ ...prev, [day]: { value: '', saving: false } }))
        await load()
      } else {
        setOverrides(prev => ({ ...prev, [day]: { value, saving: false, error: d.error } }))
      }
    } catch(e) {
      setOverrides(prev => ({ ...prev, [day]: { value, saving: false, error: e.message } }))
    }
  }

  const handleNarrativeSave = async (day, supabaseId, value) => {
    setNarratives(prev => ({ ...prev, [day]: { ...prev[day], saving: true } }))
    try {
      await fetch('/api/portal-sync?tour=' + encodeURIComponent(tour.name) + '&t=' + Date.now(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tour: tour.name, override: { day, supabase_id: supabaseId, narrative: value } }),
      })
      setNarratives(prev => ({ ...prev, [day]: { editing: false, saving: false } }))
      await load()
    } catch(e) {
      setNarratives(prev => ({ ...prev, [day]: { ...prev[day], saving: false } }))
    }
  }

  const handleNarrativeGenerate = async (day, supabaseId, dayDescription, tourPrefix) => {
    setNarratives(prev => ({ ...prev, [day]: { ...prev[day], generating: true } }))
    try {
      const r = await fetch('/api/generate-narrative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day_description: dayDescription, tour_prefix: tourPrefix }),
      })
      const d = await r.json()
      if (d.found) {
        setNarratives(prev => ({ ...prev, [day]: { editing: true, value: d.narrative, generating: false } }))
      } else {
        setNarratives(prev => ({ ...prev, [day]: { editing: true, value: '', generating: false } }))
      }
    } catch(e) {
      setNarratives(prev => ({ ...prev, [day]: { generating: false } }))
    }
  }

  const handleSync = async (daysToSync) => {
    setSyncing(true)
    setSyncResult(null)
    setError(null)
    try {
      const res = await fetch('/api/portal-sync?tour=' + encodeURIComponent(tour.name) + (tour.departure_date ? '&start=' + tour.departure_date : ''), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tour: tour.name, days: daysToSync || null }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Sync failed')
      setSyncResult(d)
      await load() // Refresh comparison after sync
    } catch (err) {
      setError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  const mismatches = data ? data.rows.filter(r => !r.match) : []
  const mismatchDays = mismatches.map(r => r.day)

  return (
    <div style={{ marginTop: 24 }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 12,
      }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Portal Sync</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
            Zoho lodge bookings vs rider portal
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {data && data.mismatches > 0 && (
            <button
              className="btn btn-primary"
              onClick={() => handleSync(mismatchDays)}
              disabled={syncing || loading}
              style={{ fontSize: 12, padding: '4px 14px' }}
            >
              {syncing ? 'Syncing...' : 'Sync ' + data.mismatches + ' mismatch' + (data.mismatches !== 1 ? 'es' : '')}
            </button>
          )}
          {data && data.mismatches === 0 && (
            <span style={{
              fontSize: 12, color: 'var(--green-text)',
              background: 'var(--green-bg)', padding: '3px 10px',
              borderRadius: 12, fontWeight: 500,
            }}>✓ Portal in sync</span>
          )}
          <button
            className="btn"
            onClick={load}
            disabled={loading}
            style={{ fontSize: 12, padding: '4px 10px' }}
          >{loading ? 'Loading...' : '↻ Refresh'}</button>
        </div>
      </div>

      {/* Sync result notification */}
      {syncResult && (
        <div style={{
          padding: '8px 14px', marginBottom: 12, borderRadius: 'var(--radius-md)',
          background: 'var(--green-bg)', color: 'var(--green-text)', fontSize: 12,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>
            {syncResult.updated} day{syncResult.updated !== 1 ? 's' : ''} updated in rider portal
          </span>
          <button onClick={() => setSyncResult(null)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'inherit', fontSize: 14,
          }}>×</button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          padding: '8px 14px', marginBottom: 12, borderRadius: 'var(--radius-md)',
          background: 'var(--red-bg)', color: 'var(--red-text)', fontSize: 12,
        }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '16px 0' }}>
          Loading comparison...
        </div>
      )}

      {/* Comparison table */}
      {data && !loading && (
        <div className="table-wrap">
          <table style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 40 }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '38%' }} />
              <col style={{ width: 60 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Day</th>
                <th>Route</th>
                <th>Zoho (source)</th>
                <th>Portal (current)</th>
                <th>Narrative</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map(row => {
                const mismatch = !row.match
                const noZoho = !row.zoho_lodge
                const noSupa = !row.supabase_lodge
                return (
                  <tr
                    key={row.day}
                    style={{
                      background: mismatch
                        ? (noZoho ? 'transparent' : 'rgba(234,88,12,0.04)')
                        : 'transparent',
                    }}
                  >
                    <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>
                      {row.day}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {row.title || '—'}
                    </td>
                    <td style={{ fontWeight: 500 }}>
                      {row.zoho_lodge || (
                        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                          No guest booking
                        </span>
                      )}
                    </td>
                    <td style={{ verticalAlign: 'top' }}>
                      {(() => {
                        const ov = overrides[row.day] || {}
                        if (ov.editing) return (
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <input
                              autoFocus
                              type="text"
                              value={ov.value || ''}
                              onChange={e => setOverrides(prev => ({ ...prev, [row.day]: { ...prev[row.day], value: e.target.value } }))}
                              onKeyDown={e => { if (e.key === 'Enter') handleOverride(row.day, row.supabase_id, ov.value || ''); if (e.key === 'Escape') setOverrides(prev => ({ ...prev, [row.day]: {} })) }}
                              style={{ fontSize: 12, padding: '3px 6px', border: '0.5px solid var(--blue-mid)', borderRadius: 4, background: 'var(--bg-primary)', color: 'var(--text-primary)', width: '100%', outline: 'none' }}
                            />
                            <button className="btn btn-sm btn-primary" style={{ fontSize: 11, whiteSpace: 'nowrap' }} disabled={ov.saving || !ov.value} onClick={() => handleOverride(row.day, row.supabase_id, ov.value || '')}>{ov.saving ? '...' : '↑'}</button>
                            <button className="btn btn-sm" style={{ fontSize: 11 }} onClick={() => setOverrides(prev => ({ ...prev, [row.day]: {} }))}>✕</button>
                          </div>
                        )
                        return (
                          <div
                            onClick={() => row.supabase_id && setOverrides(prev => ({ ...prev, [row.day]: { editing: true, value: row.supabase_lodge || '' } }))}
                            title={row.supabase_id ? 'Click to edit' : ''}
                            style={{
                              color: mismatch && !noZoho ? 'var(--amber-text)' : 'var(--text-primary)',
                              fontWeight: mismatch && !noZoho ? 500 : 400,
                              cursor: row.supabase_id ? 'pointer' : 'default',
                            }}
                          >
                            {row.supabase_lodge || <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Empty</span>}
                          </div>
                        )
                      })()}
                    </td>
                    <td>
                      {mismatch && !noZoho && row.supabase_id && (
                        <button
                          className="btn btn-sm"
                          onClick={() => handleSync([row.day])}
                          disabled={syncing}
                          style={{ fontSize: 11, padding: '2px 8px', whiteSpace: 'nowrap' }}
                        >
                          Sync
                        </button>
                      )}
                      {!mismatch && (
                        <span style={{ fontSize: 12, color: 'var(--green-text)' }}>✓</span>
                      )}
                    </td>
                    {/* Narrative cell */}
                    <td style={{ verticalAlign: 'top' }}>
                      {(() => {
                        const ns = narratives[row.day] || {}
                        const current = row.supabase_narrative || ''
                        if (ns.editing) return (
                          <div>
                            <textarea
                              value={ns.value !== undefined ? ns.value : current}
                              onChange={e => setNarratives(prev => ({ ...prev, [row.day]: { ...prev[row.day], value: e.target.value } }))}
                              rows={5}
                              style={{ width: '100%', fontSize: 12, padding: 6, borderRadius: 4, border: '0.5px solid var(--blue-mid)', background: 'var(--bg-primary)', color: 'var(--text-primary)', resize: 'vertical', outline: 'none', lineHeight: 1.5 }}
                            />
                            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                              <button className="btn btn-sm btn-primary" style={{ fontSize: 10 }} disabled={ns.saving} onClick={() => handleNarrativeSave(row.day, row.supabase_id, ns.value !== undefined ? ns.value : current)}>{ns.saving ? '...' : 'Save'}</button>
                              <button className="btn btn-sm" style={{ fontSize: 10 }} onClick={() => setNarratives(prev => ({ ...prev, [row.day]: { editing: false } }))}>Cancel</button>
                            </div>
                          </div>
                        )
                        return (
                          <div>
                            {current ? (
                              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: 4 }}>{current.slice(0, 60)}{current.length > 60 ? '…' : ''}</div>
                            ) : (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>No narrative</span>
                            )}
                            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                              {row.day_description && <button className="btn btn-sm" style={{ fontSize: 10 }} disabled={ns.generating} onClick={() => handleNarrativeGenerate(row.day, row.supabase_id, row.day_description, row.tour_prefix)}>{ns.generating ? '...' : '✨'}</button>}
                              <button className="btn btn-sm" style={{ fontSize: 10 }} onClick={() => setNarratives(prev => ({ ...prev, [row.day]: { editing: true, value: current } }))}>Edit</button>
                            </div>
                          </div>
                        )
                      })()}
                    </td>

                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {data && data.rows.length === 0 && !loading && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '16px 0' }}>
          No itinerary data found in rider portal for this tour.
        </div>
      )}
    </div>
  )
}
