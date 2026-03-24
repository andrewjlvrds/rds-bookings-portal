import React, { useState, useMemo, useEffect } from 'react'
import { TEMPLATES, generateDates, generateRdsRef, getAllTemplates, saveCustomTemplate, deleteCustomTemplate } from '../utils/templates'
import { fmtDate, fmtDateFull } from '../utils/helpers'

export default function ItineraryEditor({ tour, lodges, onBack, onSave }) {
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [pushed, setPushed] = useState(false)
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateCode, setTemplateCode] = useState('')
  const [templateRefresh, setTemplateRefresh] = useState(0)

  // All templates (built-in + custom)
  const allTemplates = useMemo(() => getAllTemplates(), [templateRefresh])

  // Draft key for localStorage
  const draftKey = 'itinerary_draft_' + tour.id

  // Load initial state: draft from localStorage, or empty
  const [nights, setNights] = useState(() => {
    try {
      const draft = localStorage.getItem(draftKey)
      if (draft) return JSON.parse(draft)
    } catch (e) {}
    return []
  })

  // Track whether we have unsaved local changes
  const [dirty, setDirty] = useState(false)

  // Auto-save draft to localStorage whenever nights change
  useEffect(() => {
    if (nights.length > 0) {
      localStorage.setItem(draftKey, JSON.stringify(nights))
    }
  }, [nights, draftKey])

  // Build lodge list for fuzzy matching
  const lodgeList = useMemo(() => {
    return (lodges || []).filter(l => l.name).map(l => ({
      ...l,
      _lower: l.name.toLowerCase().trim(),
      _words: l.name.toLowerCase().trim().split(/\s+/),
    }))
  }, [lodges])

  // Fuzzy lodge lookup — tries exact match first, then substring, then word overlap
  const getLodgeStatus = (lodgeName) => {
    if (!lodgeName) return { found: false, hasEmail: false }
    const q = lodgeName.toLowerCase().trim()
    if (!q) return { found: false, hasEmail: false }

    // 1. Exact match
    let match = lodgeList.find(l => l._lower === q)

    // 2. One contains the other (either direction)
    if (!match) match = lodgeList.find(l => l._lower.includes(q) || q.includes(l._lower))

    // 3. Word overlap — at least 2 words in common, or all query words found
    if (!match) {
      const qWords = q.split(/\s+/).filter(w => w.length > 2)
      if (qWords.length > 0) {
        let best = null, bestScore = 0
        for (const l of lodgeList) {
          const hits = qWords.filter(w => l._lower.includes(w)).length
          const score = hits / Math.max(qWords.length, l._words.length)
          if (hits >= 2 && score > bestScore) {
            best = l
            bestScore = score
          }
        }
        if (best) match = best
      }
    }

    if (!match) return { found: false, hasEmail: false }
    return {
      found: true,
      hasEmail: !!match.email,
      email: match.email || '',
      contact: match.contact || '',
      id: match.id,
      matchedName: match.name,
    }
  }

  // If tour already has bookings, load them as the starting point
  const existingBookings = (tour.bookings || []).length

  // Departure date from tour
  const departureDate = tour.departure_date || ''

  // Load existing bookings from Zoho into the editor
  const handleLoadExisting = () => {
    const bookings = (tour.bookings || []).slice().sort((a, b) => {
      const dA = a.Check_in_Date || a['Check-in'] || ''
      const dB = b.Check_in_Date || b['Check-in'] || ''
      return dA.localeCompare(dB)
    })

    const loaded = bookings.map((bk, i) => {
      const dayDesc = bk.Day_Description || bk['Day Description'] || ''
      const nightMatch = dayDesc.match(/Day\s*(\d+)/)
      const dayNum = nightMatch ? parseInt(nightMatch[1]) : i + 1
      const routeMatch = dayDesc.match(/Day\s*\d+:\s*(.+)/)
      const route = routeMatch ? routeMatch[1] : dayDesc

      const lodge = (bk.Lodge_Name || bk.Name || '').split(' - ')[0]
      const checkIn = bk.Check_in_Date || bk['Check-in'] || ''

      return {
        id: bk.id || bk['Record Id'] || 'existing_' + i,
        zoho_id: bk.id || bk['Record Id'] || '',
        day: dayNum,
        night_number: i + 1,
        date: checkIn,
        route: route,
        lodge: lodge,
        backup: '',
        meals: bk.Meals || bk['Meals'] || 'BB',
        km: '',
        region: '',
        lodges: [],
      }
    })

    setNights(loaded)
    setDirty(false)
    setPushed(false)
  }

  // Start with a blank itinerary (one empty night)
  const handleStartBlank = () => {
    const dep = new Date(departureDate)
    setNights([{
      id: 'new_0',
      day: 1,
      night_number: 1,
      date: dep.toISOString().split('T')[0],
      route: '',
      lodge: '',
      backup: '',
      meals: 'BB',
      region: '',
      lodges: [],
    }])
    setDirty(true)
    setPushed(false)
  }

  // Apply a template
  const handleApplyTemplate = (templateKey) => {
    const template = allTemplates[templateKey]
    if (!template || !departureDate) return

    setSelectedTemplate(templateKey)
    const generated = generateDates(template, departureDate)
    setNights(generated.map((n, i) => ({
      ...n,
      id: 'new_' + i,
      lodge: n.lodge,
      backup: n.backup || '',
      meals: n.meals || 'BB',
      editing: false,
    })))
    setDirty(true)
    setPushed(false)
  }

  // Edit a night's lodge
  const updateNight = (idx, field, value) => {
    setNights(prev => prev.map((n, i) => i === idx ? { ...n, [field]: value } : n))
    setDirty(true)
    setPushed(false)
  }

  // Add a night after index — shifts all subsequent dates forward
  const addNightAfter = (idx) => {
    const prev = nights[idx]

    const newNight = {
      id: 'new_' + Date.now(),
      day: prev.day + 1,
      night_number: prev.night_number + 1,
      date: '', // will be set below
      route: '',
      lodge: '',
      backup: '',
      meals: 'BB',
      region: prev.region,
      lodges: [], // no preferences — free text
      editing: true,
    }

    const updated = [...nights]
    updated.splice(idx + 1, 0, newNight)

    // Recalculate all dates from departure date
    const dep = new Date(departureDate)
    updated.forEach((n, i) => {
      n.night_number = i + 1
      n.day = i + 1
      const d = new Date(dep)
      d.setDate(d.getDate() + i)
      n.date = d.toISOString().split('T')[0]
    })

    setNights(updated)
    setDirty(true)
    setPushed(false)
  }

  // Remove a night — shifts all subsequent dates back
  const removeNight = (idx) => {
    const updated = nights.filter((_, i) => i !== idx)

    // Recalculate all dates from departure date
    const dep = new Date(departureDate)
    updated.forEach((n, i) => {
      n.night_number = i + 1
      n.day = i + 1
      const d = new Date(dep)
      d.setDate(d.getDate() + i)
      n.date = d.toISOString().split('T')[0]
    })

    setNights(updated)
    setDirty(true)
    setPushed(false)
  }

  // Clear draft from localStorage
  const handleClear = () => {
    setNights([])
    localStorage.removeItem(draftKey)
    setDirty(false)
    setPushed(false)
  }

  // Push to Zoho (create lodge bookings) — the big commit
  const handlePushToZoho = async () => {
    if (!tour.id || tour.id === 'unassigned') return
    if (!confirm('Push ' + nights.length + ' nights to Zoho? This will create lodge bookings.')) return
    setPushing(true)

    try {
      const response = await fetch('/api/create-itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tour_id: tour.id,
          tour_name: tour.name,
          departure_date: departureDate,
          nights: nights.map(n => ({
            date: n.date,
            route: n.route,
            lodge: n.lodge,
            backup: n.backup,
            meals: n.meals,
            region: n.region,
            day: n.day,
            km: n.km || '',
            pre_tour: n.pre_tour || false,
          })),
        }),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Failed to save')
      }

      const result = await response.json()
      setPushed(true)
      localStorage.removeItem(draftKey)
      if (onSave) onSave(result)
    } catch (err) {
      alert('Error pushing to Zoho: ' + err.message)
    } finally {
      setPushing(false)
    }
  }

  // Save current itinerary as a reusable template
  const handleSaveAsTemplate = () => {
    if (!templateName.trim()) return
    const key = 'custom-' + templateName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const template = {
      name: templateName.trim(),
      code: templateCode.trim() || templateName.trim().split(' ')[0],
      tour_type: templateCode.trim() || '',
      custom: true,
      nights: nights.map(n => ({
        day: n.day,
        route: n.route || '',
        region: n.region || '',
        meals: n.meals || 'BB',
        km: n.km || '',
        notes: n.notes || '',
        lodges: [n.lodge, n.backup].filter(Boolean),
      })),
    }
    saveCustomTemplate(key, template)
    setShowSaveTemplate(false)
    setTemplateName('')
    setTemplateCode('')
    setTemplateRefresh(prev => prev + 1)
  }

  // Delete a custom template
  const handleDeleteTemplate = (key) => {
    if (!confirm('Delete template "' + allTemplates[key].name + '"?')) return
    deleteCustomTemplate(key)
    setTemplateRefresh(prev => prev + 1)
  }

  // Download as CSV (opens in Excel)
  const handleDownloadExcel = () => {
    const headers = ['Night', 'Date', 'Route', 'Km', 'Lodge', 'Backup', 'Meals']
    const rows = nights.map(n => [
      n.pre_tour ? 'Pre' : n.day,
      n.date,
      n.route || '',
      n.km || '',
      n.lodge || '',
      n.backup || '',
      n.meals || '',
    ])
    const totalKm = nights.reduce((sum, n) => sum + (parseInt(n.km) || 0), 0)
    rows.push(['', '', 'TOTAL', totalKm + ' km', '', '', ''])

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(','))
      .join('\n')

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = (tour.name || 'itinerary').replace(/\s+/g, '_') + '_itinerary.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Download as printable PDF (opens print dialog)
  const handleDownloadPDF = () => {
    const totalKm = nights.reduce((sum, n) => sum + (parseInt(n.km) || 0), 0)
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>${tour.name} — Itinerary</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #222; padding: 20px; }
  h1 { font-size: 16px; font-weight: 600; margin-bottom: 2px; }
  .sub { font-size: 11px; color: #666; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { text-align: left; font-size: 10px; font-weight: 600; color: #666; text-transform: uppercase;
       letter-spacing: 0.5px; padding: 6px 8px; border-bottom: 1.5px solid #333; }
  td { padding: 7px 8px; border-bottom: 0.5px solid #ddd; vertical-align: top; }
  tr:last-child td { border-bottom: 1.5px solid #333; }
  .night { font-weight: 500; width: 40px; }
  .date { width: 70px; color: #555; }
  .route { }
  .km { width: 50px; color: #888; text-align: right; }
  .lodge { font-weight: 500; }
  .backup { color: #888; font-size: 10px; }
  .meals { width: 40px; color: #888; }
  .notes { font-size: 9px; color: #888; margin-top: 2px; }
  .total { font-weight: 600; background: #f5f5f5; }
  .footer { margin-top: 14px; font-size: 9px; color: #999; }
  @media print { body { padding: 0; } }
</style>
</head><body>
<h1>${tour.name}</h1>
<div class="sub">Departure: ${departureDate ? fmtDateFull(departureDate) : 'TBC'}${tour.tour_type ? ' · ' + tour.tour_type : ''}</div>
<table>
<thead><tr><th>Night</th><th>Date</th><th>Route</th><th>Km</th><th>Lodge</th><th>Meals</th></tr></thead>
<tbody>
${nights.map(n => `<tr>
  <td class="night">${n.pre_tour ? 'Pre' : n.day}</td>
  <td class="date">${fmtDate(n.date)}</td>
  <td class="route">${n.route || ''}${n.notes ? '<div class="notes">' + n.notes + '</div>' : ''}</td>
  <td class="km">${n.km || ''}</td>
  <td><div class="lodge">${n.lodge || ''}</div>${n.backup ? '<div class="backup">Backup: ' + n.backup + '</div>' : ''}</td>
  <td class="meals">${n.meals || ''}</td>
</tr>`).join('')}
<tr class="total"><td></td><td></td><td>Total</td><td class="km">${totalKm} km</td><td></td><td></td></tr>
</tbody></table>
<div class="footer">Ride Down South · ${tour.name} · Generated ${new Date().toLocaleDateString()}</div>
</body></html>`

    const win = window.open('', '_blank')
    win.document.write(html)
    win.document.close()
    setTimeout(() => win.print(), 300)
  }

  return (
    <div>
      <button
        onClick={onBack}
        style={{
          background: 'none', border: 'none', color: 'var(--text-muted)',
          fontSize: 13, padding: '0 0 12px', cursor: 'pointer',
        }}
      >
        ← Back to {tour.name}
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 500 }}>
            {nights.length > 0 ? 'Edit itinerary' : 'Create itinerary'} — {tour.name}
          </h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            Departure: {departureDate ? fmtDateFull(departureDate) : 'Not set in Zoho'}
            {tour.tour_type ? ' · ' + tour.tour_type : ''}
          </div>
        </div>
        {nights.length > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {dirty && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Draft auto-saved</span>}
            <button className="btn" onClick={() => setShowSaveTemplate(!showSaveTemplate)} title="Save as reusable template">
              {showSaveTemplate ? '× Template' : '💾 Template'}
            </button>
            <button className="btn" onClick={handleDownloadExcel} title="Download as CSV (Excel)">↓ Excel</button>
            <button className="btn" onClick={handleDownloadPDF} title="Print / Save as PDF">↓ PDF</button>
            <button className="btn" onClick={handleClear}>Clear</button>
            <button
              className="btn btn-primary"
              onClick={handlePushToZoho}
              disabled={pushing || pushed || !departureDate}
            >
              {pushing ? 'Pushing...' : pushed ? 'Pushed to Zoho' : 'Push to Zoho (' + nights.length + ' nights)'}
            </button>
          </div>
        )}
      </div>

      {/* Save as template form */}
      {showSaveTemplate && nights.length > 0 && (
        <div style={{
          padding: 16, marginBottom: 16,
          border: '0.5px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-secondary)',
          display: 'flex', gap: 8, alignItems: 'center',
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Save as template:</span>
          <input
            type="text"
            value={templateName}
            onChange={e => setTemplateName(e.target.value)}
            placeholder="Template name (e.g. Western Cape 10-day)"
            style={{
              flex: 1, fontSize: 12, padding: '5px 8px',
              border: '0.5px solid var(--border-default)', borderRadius: 4,
              outline: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)',
            }}
            autoFocus
          />
          <input
            type="text"
            value={templateCode}
            onChange={e => setTemplateCode(e.target.value)}
            placeholder="Code (e.g. WC10)"
            style={{
              width: 100, fontSize: 12, padding: '5px 8px',
              border: '0.5px solid var(--border-default)', borderRadius: 4,
              outline: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)',
            }}
          />
          <button
            className="btn btn-primary"
            onClick={handleSaveAsTemplate}
            disabled={!templateName.trim()}
            style={{ fontSize: 12, padding: '5px 12px', whiteSpace: 'nowrap' }}
          >
            Save template
          </button>
        </div>
      )}

      {/* No departure date warning */}
      {!departureDate && (
        <div style={{
          padding: 16, background: 'var(--amber-bg)', borderRadius: 'var(--radius-lg)',
          color: 'var(--amber-text)', fontSize: 13, marginBottom: 16,
        }}>
          This tour has no Departure Date set in Zoho. Set it there first, then come back to build the itinerary.
        </div>
      )}

      {/* Existing bookings warning */}
      {existingBookings > 0 && nights.length === 0 && (
        <div style={{
          padding: 16, background: 'var(--blue-bg)', borderRadius: 'var(--radius-lg)',
          color: 'var(--blue-text)', fontSize: 13, marginBottom: 16,
        }}>
          This tour has {existingBookings} lodge booking{existingBookings > 1 ? 's' : ''} in Zoho.
        </div>
      )}

      {/* Template selection */}
      {nights.length === 0 && departureDate && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 500, marginBottom: 10 }}>Choose how to start</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {existingBookings > 0 && (
              <button
                onClick={handleLoadExisting}
                style={{
                  display: 'block',
                  textAlign: 'left',
                  padding: 16,
                  border: '1.5px solid var(--blue-mid)',
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--blue-bg)',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s',
                }}
              >
                <div style={{ fontWeight: 500, marginBottom: 4, color: 'var(--blue-text)' }}>Edit existing itinerary</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Load {existingBookings} bookings from Zoho
                </div>
              </button>
            )}
            {Object.entries(allTemplates).map(([key, tmpl]) => (
              <div key={key} style={{ position: 'relative' }}>
                <button
                  onClick={() => handleApplyTemplate(key)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: 16,
                    border: tmpl.custom ? '0.5px solid var(--green-border, var(--border-default))' : '0.5px solid var(--border-default)',
                    borderRadius: 'var(--radius-lg)',
                    background: 'var(--bg-primary)',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--blue-mid)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)' }}
                >
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>
                    {tmpl.name}
                    {tmpl.custom && <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>custom</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {tmpl.nights.length} nights{tmpl.code ? ' · ' + tmpl.code : ''}
                  </div>
                </button>
                {tmpl.custom && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(key) }}
                    title="Delete template"
                    style={{
                      position: 'absolute', top: 8, right: 8,
                      background: 'none', border: 'none', fontSize: 12,
                      color: 'var(--text-muted)', cursor: 'pointer', padding: '2px 6px',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--red-text)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
                  >×</button>
                )}
              </div>
            ))}
            <button
              onClick={handleStartBlank}
              style={{
                display: 'block',
                textAlign: 'left',
                padding: 16,
                border: '0.5px dashed var(--border-default)',
                borderRadius: 'var(--radius-lg)',
                background: 'transparent',
                cursor: 'pointer',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--blue-mid)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)' }}
            >
              <div style={{ fontWeight: 500, marginBottom: 4 }}>Start from scratch</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Blank itinerary — add nights manually
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Itinerary table */}
      {nights.length > 0 && (
        <div className="table-wrap">
          <table style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 50 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: '25%' }} />
              <col style={{ width: '25%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: 60 }} />
              <col style={{ width: 80 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Night</th>
                <th>Date</th>
                <th>Route</th>
                <th>Lodge</th>
                <th>Backup</th>
                <th>Meals</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {nights.map((n, i) => (
                <tr key={n.id} style={n.pre_tour ? { opacity: 0.6 } : {}}>
                  <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                    {n.pre_tour ? 'Pre' : n.day}
                  </td>
                  <td style={{ fontSize: 12 }}>{fmtDate(n.date)}</td>
                  <td>
                    <input
                      type="text"
                      value={n.route}
                      onChange={e => updateNight(i, 'route', e.target.value)}
                      style={{
                        width: '100%', border: 'none', background: 'transparent',
                        fontSize: 13, padding: '2px 0', outline: 'none',
                        color: 'var(--text-primary)',
                      }}
                      placeholder="Route description"
                    />
                    <input
                      type="text"
                      value={n.km || ''}
                      onChange={e => updateNight(i, 'km', e.target.value)}
                      style={{
                        width: 80, border: 'none', background: 'transparent',
                        fontSize: 11, padding: '1px 0', outline: 'none',
                        color: 'var(--text-muted)',
                      }}
                      placeholder="km"
                    />
                  </td>
                  <td>
                    {(n.lodges || []).length > 0 ? (
                      <div>
                        <select
                          value={(n.lodges || []).includes(n.lodge) ? n.lodge : '__custom'}
                          onChange={e => {
                            if (e.target.value === '__custom') return
                            updateNight(i, 'lodge', e.target.value)
                          }}
                          style={{
                            width: '100%', border: 'none', background: 'transparent',
                            fontSize: 13, fontWeight: 500, padding: '2px 0', outline: 'none',
                            color: 'var(--text-primary)', cursor: 'pointer',
                          }}
                        >
                          {(n.lodges || []).map(l => (
                            <option key={l} value={l}>{l}</option>
                          ))}
                          <option value="__custom">Other (type below)</option>
                          <option value="">— none —</option>
                        </select>
                        {!(n.lodges || []).includes(n.lodge) && n.lodge && (
                          <input
                            type="text"
                            value={n.lodge}
                            onChange={e => updateNight(i, 'lodge', e.target.value)}
                            style={{
                              width: '100%', border: '0.5px solid var(--border-default)',
                              borderRadius: 4, fontSize: 12, padding: '3px 6px', outline: 'none',
                              color: 'var(--text-primary)', marginTop: 2,
                            }}
                            placeholder="Type lodge name"
                            autoFocus
                          />
                        )}
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={n.lodge}
                        onChange={e => updateNight(i, 'lodge', e.target.value)}
                        style={{
                          width: '100%', border: 'none', background: 'transparent',
                          fontSize: 13, fontWeight: 500, padding: '2px 0', outline: 'none',
                          color: 'var(--text-primary)',
                        }}
                        placeholder="Type lodge name"
                      />
                    )}
                    {n.notes && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{n.notes}</div>
                    )}
                    {n.lodge && (() => {
                      const ls = getLodgeStatus(n.lodge)
                      const fuzzyNote = ls.found && ls.matchedName && ls.matchedName.toLowerCase() !== n.lodge.toLowerCase().trim()
                        ? ' (matched: ' + ls.matchedName + ')'
                        : ''
                      if (!ls.found) return (
                        <div style={{ fontSize: 10, color: 'var(--red-text)', marginTop: 2 }}>
                          Not in Zoho — add to Lodges module
                        </div>
                      )
                      if (!ls.hasEmail) return (
                        <div style={{ fontSize: 10, color: 'var(--amber-text)', marginTop: 2 }}>
                          No email on file{fuzzyNote}
                        </div>
                      )
                      return (
                        <div style={{ fontSize: 10, color: 'var(--green-text)', marginTop: 2 }}>
                          {ls.email}{ls.contact ? ' · ' + ls.contact : ''}{fuzzyNote}
                        </div>
                      )
                    })()}
                  </td>
                  <td>
                    {(n.lodges || []).length > 1 ? (
                      <select
                        value={n.backup || ''}
                        onChange={e => updateNight(i, 'backup', e.target.value)}
                        style={{
                          width: '100%', border: 'none', background: 'transparent',
                          fontSize: 12, padding: '2px 0', outline: 'none',
                          color: 'var(--text-muted)', cursor: 'pointer',
                        }}
                      >
                        <option value="">— none —</option>
                        {(n.lodges || []).filter(l => l !== n.lodge).map(l => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={n.backup || ''}
                        onChange={e => updateNight(i, 'backup', e.target.value)}
                        style={{
                          width: '100%', border: 'none', background: 'transparent',
                          fontSize: 12, padding: '2px 0', outline: 'none',
                          color: 'var(--text-muted)',
                        }}
                        placeholder="Backup lodge"
                      />
                    )}
                  </td>
                  <td>
                    <select
                      value={n.meals}
                      onChange={e => updateNight(i, 'meals', e.target.value)}
                      style={{
                        border: 'none', background: 'transparent',
                        fontSize: 12, color: 'var(--text-secondary)', outline: 'none',
                      }}
                    >
                      <option value="BB">BB</option>
                      <option value="DBB">DBB</option>
                      <option value="HB">HB</option>
                      <option value="FB">FB</option>
                      <option value="SC">SC</option>
                      <option value="RO">RO</option>
                    </select>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        onClick={() => addNightAfter(i)}
                        title="Add night after"
                        style={{
                          background: 'none', border: '0.5px solid var(--border-default)',
                          borderRadius: 4, fontSize: 11, padding: '2px 6px', cursor: 'pointer',
                          color: 'var(--text-muted)',
                        }}
                      >+</button>
                      <button
                        onClick={() => removeNight(i)}
                        title="Remove night"
                        style={{
                          background: 'none', border: '0.5px solid var(--border-default)',
                          borderRadius: 4, fontSize: 11, padding: '2px 6px', cursor: 'pointer',
                          color: 'var(--red-text)',
                        }}
                      >×</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary */}
      {nights.length > 0 && (() => {
        const withLodge = nights.filter(n => n.lodge)
        const connected = withLodge.filter(n => getLodgeStatus(n.lodge).hasEmail).length
        const noMatch = withLodge.filter(n => !getLodgeStatus(n.lodge).found).length
        const noEmail = withLodge.filter(n => getLodgeStatus(n.lodge).found && !getLodgeStatus(n.lodge).hasEmail).length

        return (
          <div style={{
            display: 'flex', gap: 16, marginTop: 16,
            padding: '12px 16px', background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--text-muted)',
          }}>
            <span>{nights.length} nights</span>
            <span>{new Set(nights.map(n => n.lodge).filter(Boolean)).size} unique lodges</span>
            <span style={{ color: connected > 0 ? 'var(--green-text)' : undefined }}>{connected} connected</span>
            {noMatch > 0 && <span style={{ color: 'var(--red-text)' }}>{noMatch} not in Zoho</span>}
            {noEmail > 0 && <span style={{ color: 'var(--amber-text)' }}>{noEmail} no email</span>}
            {nights.filter(n => !n.lodge).length > 0 && <span>{nights.filter(n => !n.lodge).length} unassigned</span>}
          </div>
        )
      })()}
    </div>
  )
}
