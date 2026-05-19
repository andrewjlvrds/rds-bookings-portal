import React, { useState } from 'react'

export default function GmailImport({ tours }) {
  const [scanResult, setScanResult] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMode, setImportMode] = useState('dry_run') // 'dry_run' | 'live'
  const [filterTour, setFilterTour] = useState('')

  const handleScan = async () => {
    setScanning(true)
    setScanResult(null)
    try {
      const r = await fetch('/api/scan-unlabelled?max=200')
      const d = await r.json()
      setScanResult(d)
    } catch (e) {
      setScanResult({ error: e.message })
    } finally {
      setScanning(false)
    }
  }

  const handleImport = async () => {
    if (importMode === 'live' && !confirm(
      'This will import emails from Gmail labels into the portal. Continue?'
    )) return
    setImporting(true)
    setImportResult(null)
    try {
      const body = { dry_run: importMode === 'dry_run' }
      if (filterTour) body.tour_name = filterTour
      const r = await fetch('/api/import-gmail-labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      setImportResult(d)
    } catch (e) {
      setImportResult({ error: e.message })
    } finally {
      setImporting(false)
    }
  }

  const panelStyle = {
    background: 'var(--bg-primary)', border: '0.5px solid var(--border-default)',
    borderRadius: 'var(--radius-md)', marginBottom: 20,
  }
  const headStyle = {
    padding: '12px 16px', borderBottom: '0.5px solid var(--border-light)',
    fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  }
  const bodyStyle = { padding: '16px' }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 0 40px' }}>
      <h1 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>Gmail import</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
        Import historical emails from Gmail labels into the portal, and scan for unlabelled inbox messages.
      </p>

      {/* Label import */}
      <div style={panelStyle}>
        <div style={headStyle}>
          <span>Import from Gmail labels</span>
        </div>
        <div style={bodyStyle}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
            Fetches all emails from tour/lodge Gmail labels and stores them in the portal.
            Skips emails already stored. Low-confidence lodge matches are flagged for review, not imported.
          </p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            <select
              value={filterTour}
              onChange={e => setFilterTour(e.target.value)}
              style={{ fontSize: 12, padding: '4px 8px', border: '0.5px solid var(--border-default)', borderRadius: 3 }}
            >
              <option value="">All tours</option>
              {(tours || []).map(t => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
              <input type="radio" value="dry_run" checked={importMode === 'dry_run'} onChange={() => setImportMode('dry_run')} />
              Dry run (preview only)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
              <input type="radio" value="live" checked={importMode === 'live'} onChange={() => setImportMode('live')} />
              Live import
            </label>
            <button
              onClick={handleImport}
              disabled={importing}
              style={{
                fontSize: 12, padding: '5px 14px', borderRadius: 3, border: 'none',
                background: importMode === 'live' ? 'var(--blue-mid)' : 'var(--bg-secondary)',
                color: importMode === 'live' ? '#fff' : 'var(--text-primary)',
                cursor: 'pointer', fontWeight: 500,
              }}
            >{importing ? 'Running…' : importMode === 'dry_run' ? 'Preview' : 'Import'}</button>
          </div>

          {importResult && (
            <div>
              {importResult.error && (
                <div style={{ color: 'var(--red-text)', fontSize: 12, marginBottom: 12 }}>Error: {importResult.error}</div>
              )}
              {!importResult.error && (
                <>
                  <div style={{ display: 'flex', gap: 20, marginBottom: 16, fontSize: 13 }}>
                    <span><strong>{importResult.imported}</strong> {importResult.dry_run ? 'would be imported' : 'imported'}</span>
                    <span><strong>{importResult.skipped_existing}</strong> already stored</span>
                    {importResult.low_confidence?.length > 0 && (
                      <span style={{ color: 'var(--amber-text, #92400E)' }}>
                        <strong>{importResult.low_confidence.length}</strong> low confidence (skipped)
                      </span>
                    )}
                    {importResult.unmatched_labels?.length > 0 && (
                      <span style={{ color: 'var(--text-muted)' }}>
                        <strong>{importResult.unmatched_labels.length}</strong> unmatched labels
                      </span>
                    )}
                  </div>

                  {importResult.low_confidence?.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--amber-text, #92400E)', marginBottom: 6 }}>
                        ⚠ Low confidence matches — not imported, review needed:
                      </div>
                      {importResult.low_confidence.map((lc, i) => (
                        <div key={i} style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '3px 0', borderBottom: '0.5px solid var(--border-light)' }}>
                          <span style={{ color: 'var(--text-primary)' }}>{lc.label}</span>
                          {' → '}
                          <span style={{ color: 'var(--text-muted)' }}>{lc.matched_to || 'no match'}</span>
                          <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontSize: 10 }}>{lc.tour}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {importResult.unmatched_labels?.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                        Unmatched labels (no booking found):
                      </div>
                      {importResult.unmatched_labels.map((ul, i) => (
                        <div key={i} style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 0' }}>
                          {ul.label} <span style={{ fontSize: 10 }}>({ul.tour})</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {importResult.tours_processed?.map((t, i) => (
                    <details key={i} style={{ marginBottom: 4 }}>
                      <summary style={{ fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px 0' }}>
                        {t.tour} — {t.lodges.reduce((s, l) => s + l.imported, 0)} emails across {t.lodges.length} lodges
                      </summary>
                      <div style={{ paddingLeft: 12, marginTop: 4 }}>
                        {t.lodges.map((l, j) => (
                          <div key={j} style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 0' }}>
                            {l.lodge}: {l.imported} imported, {l.skipped} skipped
                            {l.confidence === 'medium' && <span style={{ marginLeft: 6, color: 'var(--amber-text, #92400E)' }}>medium confidence</span>}
                          </div>
                        ))}
                      </div>
                    </details>
                  ))}

                  {importResult.errors?.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 12, color: 'var(--red-text)', marginBottom: 4 }}>Errors:</div>
                      {importResult.errors.map((e, i) => (
                        <div key={i} style={{ fontSize: 11, color: 'var(--text-muted)' }}>{e}</div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Unlabelled scan */}
      <div style={panelStyle}>
        <div style={headStyle}>
          <span>Scan unlabelled inbox</span>
          <button
            onClick={handleScan}
            disabled={scanning}
            style={{ fontSize: 12, padding: '4px 12px', borderRadius: 3, border: '0.5px solid var(--border-default)', background: 'var(--bg-primary)', cursor: 'pointer', color: 'var(--text-secondary)' }}
          >{scanning ? 'Scanning…' : 'Scan inbox'}</button>
        </div>
        <div style={bodyStyle}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
            Finds emails in the inbox that don't have any tour label. Read-only — use this to spot anything that needs manual labelling in Gmail.
          </p>

          {scanResult && (
            <div>
              {scanResult.error && (
                <div style={{ color: 'var(--red-text)', fontSize: 12 }}>Error: {scanResult.error}</div>
              )}
              {!scanResult.error && (
                <>
                  <div style={{ fontSize: 13, marginBottom: 12, display: 'flex', gap: 20 }}>
                    <span><strong>{scanResult.unlabelled_count}</strong> unlabelled</span>
                    <span style={{ color: 'var(--text-muted)' }}><strong>{scanResult.already_labelled_count}</strong> already labelled</span>
                    <span style={{ color: 'var(--text-muted)' }}>{scanResult.total_scanned} scanned</span>
                    {scanResult.truncated && <span style={{ color: 'var(--amber-text, #92400E)' }}>results truncated</span>}
                  </div>

                  {scanResult.unlabelled?.length === 0 && (
                    <div style={{ color: 'var(--green-text)', fontSize: 13 }}>✓ All inbox emails are labelled</div>
                  )}

                  {scanResult.unlabelled?.map((em, i) => (
                    <div key={i} style={{ padding: '8px 0', borderBottom: '0.5px solid var(--border-light)', fontSize: 12 }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                        <span style={{ fontWeight: 500, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {em.subject || '(no subject)'}
                        </span>
                        <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 11 }}>
                          {em.date ? new Date(em.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : ''}
                        </span>
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>
                        {(em.from || '').split('<')[0].trim() || em.from}
                        {em.labels?.length > 0 && (
                          <span style={{ marginLeft: 8, color: 'var(--text-hint, var(--text-muted))' }}>
                            [{em.labels.join(', ')}]
                          </span>
                        )}
                      </div>
                      {em.snippet && (
                        <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2, fontStyle: 'italic' }}>
                          {em.snippet.slice(0, 120)}
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
