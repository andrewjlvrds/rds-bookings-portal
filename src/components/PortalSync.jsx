import React, { useState, useEffect } from 'react'

export default function PortalSync({ tour }) {
  const [data, setData] = useState(null)
  const [overrides, setOverrides] = useState({}) // { [day]: { value, saving } }
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
              <col style={{ width: 50 }} />
              <col style={{ width: '25%' }} />
              <col style={{ width: '30%' }} />
              <col style={{ width: '30%' }} />
              <col style={{ width: 80 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Day</th>
                <th>Route</th>
                <th>Zoho (source)</th>
                <th>Portal (current)</th>
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
                    <td style={{
                      color: mismatch && !noZoho ? 'var(--amber-text)' : 'var(--text-primary)',
                      fontWeight: mismatch && !noZoho ? 500 : 400,
                    }}>
                      {row.supabase_lodge || (
                        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Empty</span>
                      )}
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
                      {row.supabase_id && (() => {
                        const ov = overrides[row.day] || {}
                        return (
                          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                            <input
                              type="text"
                              placeholder="Override..."
                              value={ov.value || ''}
                              onChange={e => setOverrides(prev => ({ ...prev, [row.day]: { ...prev[row.day], value: e.target.value } }))}
                              onKeyDown={e => e.key === 'Enter' && handleOverride(row.day, row.supabase_id, ov.value || '')}
                              style={{ fontSize: 11, padding: '2px 6px', border: '0.5px solid var(--border-default)', borderRadius: 4, background: 'var(--bg-primary)', color: 'var(--text-primary)', width: 120, outline: 'none' }}
                            />
                            <button
                              className="btn btn-sm"
                              onClick={() => handleOverride(row.day, row.supabase_id, ov.value || '')}
                              disabled={ov.saving || !ov.value}
                              style={{ fontSize: 10, whiteSpace: 'nowrap' }}
                            >{ov.saving ? '...' : '↑'}</button>
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
