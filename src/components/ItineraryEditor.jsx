import React, { useState, useMemo, useEffect } from 'react'
import { TEMPLATES, generateDates, generateRdsRef, getAllTemplates, saveCustomTemplate, deleteCustomTemplate } from '../utils/templates'
import { fmtDate, fmtDateFull } from '../utils/helpers'

export default function ItineraryEditor({ tour, lodges, onBack, onSave }) {
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [pushed, setPushed] = useState(false)
  const [expandedNight, setExpandedNight] = useState(null)
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateCode, setTemplateCode] = useState('')
  const [templateRefresh, setTemplateRefresh] = useState(0)

  // All templates (built-in + custom)
  const allTemplates = useMemo(() => getAllTemplates(), [templateRefresh])

  // Draft key for localStorage
  const draftKey = 'itinerary_draft_' + tour.id

  // Load initial state: draft from localStorage, existing bookings, or empty
  const [nights, setNights] = useState(() => {
    try {
      const draft = localStorage.getItem(draftKey)
      if (draft) {
        const parsed = JSON.parse(draft)
        if (parsed && parsed.length > 0) return parsed
      }
    } catch (e) {}

    // If tour has existing bookings, auto-load them
    const bookings = (tour.bookings || []).slice().sort((a, b) => {
      const dA = a.Check_in_Date || a['Check-in'] || ''
      const dB = b.Check_in_Date || b['Check-in'] || ''
      return dA.localeCompare(dB)
    })
    if (bookings.length > 0) {
      return bookings.map((bk, i) => {
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
          km: '',
          route_notes: '',
          lodge: lodge,
          backup: '',
          meals: bk.Meals || '',
          notes: bk.Booking_Notes || '',
        }
      })
    }

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
  // Backup a draft before deleting (keeps for 24hrs)
  const backupDraft = (data) => {
    if (!data || data.length === 0) return
    const backup = {
      data: data,
      deleted_at: Date.now(),
      tour_id: tour.id,
      tour_name: tour.name,
    }
    localStorage.setItem('itinerary_backup_' + tour.id, JSON.stringify(backup))
  }

  // Restore from backup if available
  const getBackup = () => {
    try {
      const raw = localStorage.getItem('itinerary_backup_' + tour.id)
      if (!raw) return null
      const backup = JSON.parse(raw)
      // Expire after 24 hours
      if (Date.now() - backup.deleted_at > 24 * 60 * 60 * 1000) {
        localStorage.removeItem('itinerary_backup_' + tour.id)
        return null
      }
      return backup
    } catch (e) { return null }
  }

  const handleClear = () => {
    backupDraft(nights)
    setNights([])
    localStorage.removeItem(draftKey)
    setDirty(false)
    setPushed(false)
  }

  // Whether this is a local (not-yet-in-Zoho) tour
  const isLocalTour = (tour.id || '').startsWith('local_') || tour.local
  const [zohoTourName, setZohoTourName] = useState(tour.name || '')

  // Push to Zoho (create lodge bookings) — only pushes new nights
  const newNights = nights.filter(n => !n.zoho_id)
  const handlePushToZoho = async () => {
    if (!newNights.length) {
      alert('All nights are already in Zoho. Nothing to push.')
      return
    }
    if (!confirm('Push ' + newNights.length + ' new night' + (newNights.length !== 1 ? 's' : '') + ' to Zoho? (' + (nights.length - newNights.length) + ' existing nights will not be affected)')) return
    setPushing(true)

    try {
      let tourId = tour.id
      let tourName = zohoTourName || tour.name

      // If local tour, create it in Zoho first
      if (isLocalTour) {
        const createRes = await fetch('/api/create-tour', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: tourName,
            departure_date: departureDate,
            tour_type: tour.tour_type || '',
          }),
        })
        if (!createRes.ok) {
          const err = await createRes.json()
          throw new Error('Failed to create tour in Zoho: ' + (err.error || ''))
        }
        const createResult = await createRes.json()
        tourId = createResult.id

        // Remove from local tours list
        try {
          const localTours = JSON.parse(localStorage.getItem('rds_local_tours') || '[]')
          const updated = localTours.filter(t => t.id !== tour.id)
          localStorage.setItem('rds_local_tours', JSON.stringify(updated))
        } catch (e) {}
      }

      // Only create the new bookings (no zoho_id)
      const response = await fetch('/api/create-itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tour_id: tourId,
          tour_name: tourName,
          departure_date: departureDate,
          nights: newNights.map(n => ({
            date: n.date,
            route: n.route,
            lodge: n.lodge,
            backup: n.backup,
            meals: n.meals,
            region: n.region,
            day: n.day,
            km: n.km || '',
            route_notes: n.route_notes || '',
            excursion: n.excursion || '',
            excursion_date: n.excursion_date || '',
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
        route_notes: n.route_notes || '',
        excursion: n.excursion || '',
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
    const headers = ['Day', 'Date', 'Route', 'Km', 'Route Notes', 'Lodge', 'Backup', 'Meals']
    const rows = nights.map(n => [
      n.pre_tour ? 'Pre' : n.day,
      n.date,
      n.route || '',
      n.km ? n.km + ' km' : '',
      n.route_notes || '',
      n.lodge || '',
      n.backup || '',
      n.meals || '',
    ])
    const totalKm = nights.reduce((sum, n) => sum + (parseInt(n.km) || 0), 0)
    rows.push(['', '', 'TOTAL', totalKm + ' km', '', '', '', ''])

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
  .route-notes { font-size: 9px; color: #888; font-style: italic; margin-top: 2px; }
  .total { font-weight: 600; background: #f5f5f5; }
  .footer { margin-top: 14px; font-size: 9px; color: #999; }
  @media print { body { padding: 0; } }
</style>
</head><body>
<h1>${tour.name}</h1>
<div class="sub">Departure: ${departureDate ? fmtDateFull(departureDate) : 'TBC'}${tour.tour_type ? ' · ' + tour.tour_type : ''}</div>
<table>
<thead><tr><th>Day</th><th>Date</th><th>Route</th><th>Km</th><th>Lodge</th><th>Meals</th></tr></thead>
<tbody>
${nights.map(n => `<tr>
  <td class="night">${n.pre_tour ? 'Pre' : n.day}</td>
  <td class="date">${fmtDate(n.date)}</td>
  <td class="route">${n.route || ''}${n.km ? '<div class="notes">' + n.km + ' km</div>' : ''}${n.route_notes ? '<div class="route-notes">' + n.route_notes + '</div>' : ''}${n.notes ? '<div class="notes">' + n.notes + '</div>' : ''}</td>
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

  // Download as client-facing proposal PDF (no internal details)
  const handleClientProposal = () => {
    const totalKm = nights.reduce((sum, n) => sum + (parseInt(n.km) || 0), 0)
    const tourNights = nights.filter(n => !n.pre_tour)
    const totalDays = tourNights.length + 1
    const firstDate = nights.length > 0 ? nights[0].date : departureDate
    const lastNight = nights[nights.length - 1]
    const endDate = lastNight ? (() => { const d = new Date(lastNight.date); d.setDate(d.getDate() + 1); return d })() : null

    const fmtProposalDate = (d) => {
      if (!d) return ''
      const dt = new Date(d)
      const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
      return dt.getDate() + ' ' + months[dt.getMonth()] + ' ' + dt.getFullYear()
    }

    const fmtShortDate = (d) => {
      if (!d) return ''
      const dt = new Date(d)
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
      const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
      return days[dt.getDay()] + ' ' + dt.getDate() + ' ' + months[dt.getMonth()]
    }

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>${tour.name} — Route Proposal</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', -apple-system, sans-serif; font-size: 11px; color: #2a2a2a; }
  
  .cover { padding: 60px 50px 40px; min-height: 160px; }
  .cover h1 { font-size: 28px; font-weight: 600; color: #1a1a1a; letter-spacing: -0.5px; }
  .cover .dates { font-size: 14px; color: #666; margin-top: 8px; font-weight: 400; }
  .cover .summary { font-size: 12px; color: #888; margin-top: 6px; }
  .cover .brand { font-size: 11px; color: #b8860b; font-weight: 500; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 12px; }
  
  .divider { height: 1px; background: #e0d5c1; margin: 0 50px; }
  
  .content { padding: 30px 50px 40px; }
  
  table { width: 100%; border-collapse: collapse; }
  thead th { 
    text-align: left; font-size: 9px; font-weight: 600; color: #999; 
    text-transform: uppercase; letter-spacing: 0.8px; padding: 8px 10px; 
    border-bottom: 1.5px solid #d4c5a9; 
  }
  tbody td { 
    padding: 10px 10px; border-bottom: 0.5px solid #eee; vertical-align: top; 
    font-size: 11px; line-height: 1.5;
  }
  tbody tr:last-child td { border-bottom: 1.5px solid #d4c5a9; }
  
  .day-num { font-weight: 600; color: #b8860b; width: 36px; font-size: 12px; }
  .date-col { width: 80px; color: #888; font-size: 10px; }
  .route-col { }
  .route-name { font-weight: 500; color: #2a2a2a; }
  .route-km { font-size: 10px; color: #999; margin-top: 2px; }
  .route-notes { font-size: 10px; color: #777; font-style: italic; margin-top: 3px; line-height: 1.4; }
  .excursion { font-size: 10px; color: #b8860b; margin-top: 3px; }
  .lodge-col { font-weight: 500; color: #2a2a2a; }
  
  .total-row td { font-weight: 600; background: #faf7f0; color: #666; font-size: 11px; }
  
  .footer { 
    padding: 24px 50px; font-size: 9px; color: #aaa; 
    display: flex; justify-content: space-between; align-items: center;
    border-top: 0.5px solid #eee; margin-top: 20px;
  }
  .footer a { color: #b8860b; text-decoration: none; }
  
  @media print { 
    body { padding: 0; } 
    .cover { padding: 40px 30px 30px; min-height: auto; }
    .divider { margin: 0 30px; }
    .content { padding: 20px 30px 30px; }
    .footer { padding: 16px 30px; }
  }
</style>
</head><body>

<div class="cover">
  <div class="brand">Ride Down South</div>
  <h1>${tour.name}</h1>
  <div class="dates">${fmtProposalDate(firstDate)}${endDate ? ' — ' + fmtProposalDate(endDate) : ''}</div>
  <div class="summary">${totalDays} days · ${nights.length} nights · ${totalKm > 0 ? totalKm.toLocaleString() + ' km' : ''}</div>
</div>

<div class="divider"></div>

<div class="content">
  <table>
    <thead>
      <tr>
        <th>Day</th>
        <th>Date</th>
        <th>Route</th>
        <th>Accommodation</th>
      </tr>
    </thead>
    <tbody>
${nights.map(n => {
  const hasKm = n.km && parseInt(n.km) > 0
  const hasNotes = n.route_notes && n.route_notes.trim()
  const hasExcursion = n.excursion && n.excursion.trim()
  return `      <tr>
        <td class="day-num">${n.pre_tour ? '—' : n.day}</td>
        <td class="date-col">${fmtShortDate(n.date)}</td>
        <td class="route-col">
          <div class="route-name">${n.route || '—'}</div>
          ${hasKm ? '<div class="route-km">' + n.km + ' km</div>' : ''}
          ${hasNotes ? '<div class="route-notes">' + n.route_notes.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>' : ''}
          ${hasExcursion ? '<div class="excursion">★ ' + n.excursion.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>' : ''}
        </td>
        <td class="lodge-col">${n.lodge || '—'}</td>
      </tr>`
}).join('\n')}
      <tr class="total-row">
        <td></td>
        <td></td>
        <td>${totalKm > 0 ? 'Total: ' + totalKm.toLocaleString() + ' km' : ''}</td>
        <td></td>
      </tr>
    </tbody>
  </table>
</div>

<div class="footer">
  <span>Ride Down South · <a href="https://ridedownsouth.com">ridedownsouth.com</a></span>
  <span>Proposal generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
</div>

</body></html>`

    const win = window.open('', '_blank')
    win.document.write(html)
    win.document.close()
    setTimeout(() => win.print(), 300)
  }

  // Copy email-friendly text version to clipboard
  const [copied, setCopied] = useState(false)
  const handleCopyProposal = () => {
    const totalKm = nights.reduce((sum, n) => sum + (parseInt(n.km) || 0), 0)
    const tourNights = nights.filter(n => !n.pre_tour)
    const totalDays = tourNights.length + 1

    const fmtShort = (d) => {
      if (!d) return ''
      const dt = new Date(d)
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
      const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
      return days[dt.getDay()] + ' ' + dt.getDate() + ' ' + months[dt.getMonth()]
    }

    const lines = []
    lines.push(tour.name)
    lines.push(totalDays + ' days · ' + nights.length + ' nights' + (totalKm > 0 ? ' · ' + totalKm.toLocaleString() + ' km' : ''))
    lines.push('')

    nights.forEach(n => {
      const dayLabel = n.pre_tour ? '—' : 'Day ' + n.day
      const km = n.km && parseInt(n.km) > 0 ? ' (' + n.km + ' km)' : ''
      lines.push(dayLabel + '  ' + fmtShort(n.date))
      lines.push((n.route || '—') + km)
      lines.push('Accommodation: ' + (n.lodge || 'TBC'))
      if (n.route_notes && n.route_notes.trim()) lines.push(n.route_notes.trim())
      if (n.excursion && n.excursion.trim()) lines.push('★ ' + n.excursion.trim())
      lines.push('')
    })

    if (totalKm > 0) lines.push('Total distance: ' + totalKm.toLocaleString() + ' km')

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
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
            <button className="btn" onClick={handleClientProposal} title="Client-facing route proposal (no internal details)" style={{ color: 'var(--amber-text, #b8860b)' }}>↓ Proposal</button>
            <button className="btn" onClick={handleCopyProposal} title="Copy route summary to clipboard for email" style={{ color: 'var(--amber-text, #b8860b)' }}>{copied ? '✓ Copied' : '⎘ Copy'}</button>
            <button className="btn" onClick={handleClear}>Clear</button>
            {isLocalTour && (
              <input
                type="text"
                value={zohoTourName}
                onChange={e => setZohoTourName(e.target.value)}
                placeholder="Zoho Tour Name"
                title="Tour name for Zoho"
                style={{
                  fontSize: 12, padding: '5px 8px', width: 160,
                  border: '0.5px solid var(--border-default)', borderRadius: 4,
                  outline: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)',
                }}
              />
            )}
            <button
              className="btn btn-primary"
              onClick={handlePushToZoho}
              disabled={pushing || pushed || !departureDate || (isLocalTour && !zohoTourName.trim())}
            >
              {pushing ? 'Pushing...' : pushed ? 'Pushed to Zoho' : newNights.length === nights.length ? 'Push to Zoho (' + nights.length + ' nights)' : newNights.length > 0 ? 'Push ' + newNights.length + ' new night' + (newNights.length !== 1 ? 's' : '') + ' to Zoho' : 'All in Zoho'}
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
          {/* Undo delete banner */}
          {(() => {
            const backup = getBackup()
            if (!backup) return null
            const hoursAgo = Math.round((Date.now() - backup.deleted_at) / (1000 * 60 * 60))
            return (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 16px', marginBottom: 12,
                background: 'var(--amber-bg)', borderRadius: 'var(--radius-md)',
                fontSize: 12, color: 'var(--amber-text)',
              }}>
                <span>Deleted draft ({backup.data.length} nights, {hoursAgo < 1 ? 'just now' : hoursAgo + 'h ago'})</span>
                <button
                  onClick={() => {
                    setNights(backup.data)
                    setDirty(true)
                    localStorage.removeItem('itinerary_backup_' + tour.id)
                  }}
                  className="btn"
                  style={{ fontSize: 12, padding: '4px 12px' }}
                >Restore</button>
              </div>
            )
          })()}
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
              <col style={{ width: 80 }} />
              <col style={{ width: '30%' }} />
              <col style={{ width: '30%' }} />
              <col style={{ width: 80 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Day</th>
                <th>Date</th>
                <th>Route</th>
                <th>Lodge</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {nights.map((n, i) => (
                <React.Fragment key={n.id}>
                <tr style={n.pre_tour ? { opacity: 0.6 } : {}}>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                      <input
                        type="text"
                        value={n.km || ''}
                        onChange={e => updateNight(i, 'km', e.target.value.replace(/[^0-9/.]/g, ''))}
                        style={{
                          width: 40, border: 'none', background: 'transparent',
                          fontSize: 11, padding: '1px 0', outline: 'none',
                          color: 'var(--text-muted)', textAlign: 'right',
                        }}
                        placeholder="—"
                      />
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 2 }}>km</span>
                    </div>
                    <input
                      type="text"
                      value={n.route_notes || ''}
                      onChange={e => updateNight(i, 'route_notes', e.target.value)}
                      style={{
                        width: '100%', border: 'none', background: 'transparent',
                        fontSize: 10, padding: '1px 0', outline: 'none',
                        color: 'var(--text-muted)', fontStyle: 'italic',
                      }}
                      placeholder="Route notes"
                    />
                    {n.notes && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{n.notes}</div>
                    )}
                    {/* Excursion — toggle with × to remove */}
                    {n.excursion !== undefined && n.excursion !== null ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <span style={{ fontSize: 10, color: 'var(--blue-text)' }}>Excursion:</span>
                        <input
                          type="text"
                          value={n.excursion || ''}
                          onChange={e => updateNight(i, 'excursion', e.target.value)}
                          style={{
                            flex: 1, border: 'none', background: 'transparent',
                            fontSize: 10, padding: '1px 0', outline: 'none',
                            color: 'var(--blue-text)',
                          }}
                          placeholder="e.g. Kruger Safari"
                        />
                        <button
                          onClick={() => { updateNight(i, 'excursion', null); updateNight(i, 'excursion_date', null) }}
                          style={{ background: 'none', border: 'none', fontSize: 10, color: 'var(--text-muted)', cursor: 'pointer' }}
                          title="Remove excursion"
                        >×</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => updateNight(i, 'excursion', '')}
                        style={{
                          background: 'none', border: 'none', fontSize: 9, color: 'var(--text-muted)',
                          cursor: 'pointer', padding: '2px 0', opacity: 0.6,
                        }}
                      >+ Excursion</button>
                    )}
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
                        placeholder="Lodge name"
                      />
                    )}
                    {n.lodge && (() => {
                      const ls = getLodgeStatus(n.lodge)
                      if (!ls.found) return <div style={{ fontSize: 10, color: 'var(--red-text)' }}>Not in Zoho</div>
                      if (!ls.hasEmail) return <div style={{ fontSize: 10, color: 'var(--amber-text)' }}>No email</div>
                      return <div style={{ fontSize: 10, color: 'var(--green-text)' }}>{ls.email}{ls.contact ? ' · ' + ls.contact : ''}</div>
                    })()}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => addNightAfter(i)} title="Add day" style={{
                        background: 'none', border: '0.5px solid var(--border-default)',
                        borderRadius: 4, fontSize: 11, padding: '2px 6px', cursor: 'pointer', color: 'var(--text-muted)',
                      }}>+</button>
                      <button onClick={() => removeNight(i)} title="Remove" style={{
                        background: 'none', border: '0.5px solid var(--border-default)',
                        borderRadius: 4, fontSize: 11, padding: '2px 6px', cursor: 'pointer', color: 'var(--red-text)',
                      }}>×</button>
                    </div>
                  </td>
                </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail panel for expanded night — mirrors LodgeDetail layout */}
      {expandedNight !== null && nights[expandedNight] && (() => {
        const n = nights[expandedNight]
        const i = expandedNight
        const ls = n.lodge ? getLodgeStatus(n.lodge) : { found: false, hasEmail: false }
        const checkOut = (() => { const d = new Date(n.date); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0] })()

        const Field = ({ label, value, field, type }) => (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '0.5px solid var(--border-light, #eee)' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 120 }}>{label}</span>
            {field ? (
              <input type={type || 'text'} value={value || ''} onChange={e => updateNight(i, field, e.target.value)}
                style={{ fontSize: 12, fontWeight: 500, border: 'none', background: 'transparent', outline: 'none', color: 'var(--text-primary)', textAlign: 'right', flex: 1, marginLeft: 8 }}
                placeholder="—" />
            ) : (
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>{value || '—'}</span>
            )}
          </div>
        )

        return (
          <div style={{ border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-primary)', marginBottom: 16, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '0.5px solid var(--border-default)' }}>
              <div>
                <span style={{ fontSize: 15, fontWeight: 500 }}>{n.lodge || 'No lodge assigned'}</span>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Day {n.day}: {n.route || ''} · {fmtDateFull(n.date)} – {fmtDateFull(checkOut)} · 1 night
                </div>
              </div>
              <button onClick={() => setExpandedNight(null)} style={{
                background: 'none', border: 'none', fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer',
              }}>Close ×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
              {/* Left panel — Booking details */}
              <div style={{ padding: 16, borderRight: '0.5px solid var(--border-default)' }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, color: 'var(--text-muted)' }}>Booking details</div>
                <Field label="Lodge" value={n.lodge} />
                <Field label="Backup lodge" value={n.backup} field="backup" />
                <Field label="Contact" value={ls.contact || ''} />
                <Field label="Email" value={ls.email || ''} />
                <Field label="Check-in" value={fmtDateFull(n.date)} />
                <Field label="Check-out" value={fmtDateFull(checkOut)} />
                <Field label="Nights" value="1" />
                <Field label="Meals" value={n.meals} field="meals" />
                <Field label="Km" value={n.km} field="km" />
                <Field label="RDS reference" value="" />
                <Field label="Lodge reference" value={n.lodge_ref || ''} field="lodge_ref" />
                <Field label="Total" value={n.total || ''} field="total" />
                <Field label="Currency" value={n.currency || ''} field="currency" />

                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid var(--border-light, #eee)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Enquiry dates</div>
                  <Field label="Enquiry sent" value={n.enquiry_sent || ''} />
                  <Field label="Last response" value={n.last_response || ''} />
                  <Field label="Follow up" value={n.follow_up || ''} />
                </div>
              </div>

              {/* Right panel — Payments & cancellation */}
              <div style={{ padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, color: 'var(--text-muted)' }}>Payments & cancellation</div>
                <Field label="Total" value={n.total || ''} field="total" />
                <Field label="Deposit" value={n.deposit || ''} field="deposit" />
                <Field label="Deposit due" value={n.deposit_due || ''} field="deposit_due" />
                <Field label="2nd payment" value={n.payment_2 || ''} field="payment_2" />
                <Field label="2nd due" value={n.payment_2_due || ''} field="payment_2_due" />
                <Field label="3rd payment" value={n.payment_3 || ''} field="payment_3" />
                <Field label="3rd due" value={n.payment_3_due || ''} field="payment_3_due" />

                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid var(--border-light, #eee)' }}>
                  <Field label="Free cancel before" value={n.cancel_before || ''} field="cancel_before" />
                  <Field label="Cancel policy" value={n.cancel_policy || ''} field="cancel_policy" />
                </div>

                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid var(--border-light, #eee)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Route</div>
                  <Field label="Km" value={n.km} field="km" />
                  <div style={{ padding: '6px 0' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Route notes</span>
                    <input type="text" value={n.route_notes || ''} onChange={e => updateNight(i, 'route_notes', e.target.value)}
                      placeholder="—" style={{ width: '100%', fontSize: 12, border: 'none', background: 'transparent', outline: 'none', color: 'var(--text-primary)', marginTop: 2 }} />
                  </div>
                  {n.notes && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', padding: '4px 0' }}>{n.notes}</div>}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

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
