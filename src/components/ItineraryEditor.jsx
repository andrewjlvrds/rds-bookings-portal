import React, { useState, useMemo, useEffect } from 'react'
import { TEMPLATES, generateDates, generateRdsRef, getAllTemplates, saveCustomTemplate, deleteCustomTemplate } from '../utils/templates'
import { fmtDate, fmtDateFull } from '../utils/helpers'

export default function ItineraryEditor({ tour, lodges, onBack, onSave, onUpdateTour }) {
  // Cancelled Zoho bookings are preserved as an audit trail but must never be
  // loaded back into the editor — otherwise removing a night and re-opening
  // the editor reverts to the original list.
  const activeBookings = (tour.bookings || []).filter(bk => {
    const s = (bk.Status || bk['Status'] || '').toString().trim().toLowerCase()
    return s !== 'cancelled'
  })

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
    // Build a set of active Zoho booking IDs to validate any saved draft against
    const activeIds = new Set(
      activeBookings.map(bk => String(bk.id || bk['Record Id'] || '')).filter(Boolean)
    )

    try {
      const draft = localStorage.getItem(draftKey)
      if (draft) {
        const parsed = JSON.parse(draft)
        if (parsed && parsed.length > 0) {
          // Reject the draft if any row points at a Zoho booking that is no
          // longer active (cancelled or deleted). That means Zoho has moved on
          // since this draft was written and the draft should be rebuilt.
          const hasStaleRef = parsed.some(n => n.zoho_id && !activeIds.has(String(n.zoho_id)))
          if (!hasStaleRef) return parsed
          try { localStorage.removeItem(draftKey) } catch (e) {}
        }
      }
    } catch (e) {}

    // If tour has existing bookings, auto-load them
    const bookings = activeBookings.slice().sort((a, b) => {
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

  // PDF field options
  const [pdfOptions, setPdfOptions] = useState({ km: true, route_notes: true, meals: true, excursion: true, alt: true })
  const [showPdfOptions, setShowPdfOptions] = useState(false)

  // Auto-save draft to localStorage whenever nights change
  useEffect(() => {
    if (nights.length > 0) {
      localStorage.setItem(draftKey, JSON.stringify(nights))
    }
  }, [nights, draftKey])

  // Auto-apply pending template on mount (set when user clicks "Use template" in Tour Planner)
  useEffect(() => {
    try {
      const pending = localStorage.getItem('rds_pending_template')
      if (!pending || !departureDate) return
      const template = allTemplates[pending]
      if (!template) return
      localStorage.removeItem('rds_pending_template')
      // Only auto-apply if itinerary is empty (fresh draft)
      if (nights.length > 1) return
      handleApplyTemplate(pending)
    } catch(e) {}
  }, []) // mount only

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
  const existingBookings = activeBookings.length

  // Departure date from tour
  const departureDate = tour.departure_date || ''

  // Load existing bookings from Zoho into the editor
  const handleLoadExisting = () => {
    const bookings = activeBookings.slice().sort((a, b) => {
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

  const updateAlt = (idx, field, value) => {
    setNights(prev => prev.map((n, i) => i === idx ? { ...n, alt: { ...(n.alt || {}), [field]: value } } : n))
    setDirty(true)
    setPushed(false)
  }

  const addAlt = (idx) => {
    setNights(prev => prev.map((n, i) => i === idx ? { ...n, alt: { route: '', km: '', route_notes: '', lodge: '' } } : n))
    setDirty(true)
  }

  const removeAlt = (idx) => {
    setNights(prev => prev.map((n, i) => i === idx ? { ...n, alt: undefined } : n))
    setDirty(true)
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

  // Sync to Zoho — creates new nights, cancels orphaned/swapped bookings
  //
  // Categorisation per Zoho booking and per draft night:
  // 1. Zoho booking whose id appears in no draft night   → cancel (row was deleted)
  // 2. Zoho booking whose id matches a draft night but
  //    the lodge name differs                             → cancel (per swap rule)
  // 3. Draft night with no zoho_id                        → create
  // 4. Draft night with zoho_id, same lodge, but other
  //    Zoho-backed fields have changed                    → update in place
  // 5. Draft night with zoho_id, identical                → unchanged, skip
  //
  // A draft night whose zoho_id points at a cancelled row also counts as "create"
  // because the original will be marked Cancelled in Zoho.
  const syncPlan = (() => {
    const zohoBookings = activeBookings
    const zohoById = new Map()
    zohoBookings.forEach(bk => {
      const id = bk.id || bk['Record Id']
      if (id) zohoById.set(String(id), bk)
    })

    const normLodge = (s) => (s || '').trim().toLowerCase()
    const zohoLodgeName = (bk) => {
      const raw = bk.Lodge_Name || bk['Lodge Name'] || bk.Name || ''
      if (raw && typeof raw === 'object') return raw.name || ''
      return (raw || '').split(' - ')[0]
    }

    // Build the Day_Description string the way create-itinerary.js does, so
    // we can compare draft vs Zoho consistently.
    const buildDayDesc = (n) => {
      const prefix = n.pre_tour ? 'Pre tour' : 'Day ' + String(n.day || '').padStart(2, '0')
      return prefix + (n.route ? ': ' + n.route : '')
    }

    const toCreate = []          // draft nights to create in Zoho
    const toCancel = []          // zoho bookings to mark Cancelled
    const toUpdate = []          // { id, fields: { ... } } — in-place PUT
    const unchanged = []
    const draftIdsReferenced = new Set()

    nights.forEach(n => {
      if (!n.zoho_id) {
        toCreate.push({ night: n, reason: 'new' })
        return
      }
      draftIdsReferenced.add(String(n.zoho_id))
      const bk = zohoById.get(String(n.zoho_id))
      if (!bk) {
        // zoho_id points at a row that no longer exists → treat as create
        toCreate.push({ night: n, reason: 'new' })
        return
      }
      const draftLodge = normLodge(n.lodge)
      const zohoLodge = normLodge(zohoLodgeName(bk))
      if (draftLodge && zohoLodge && draftLodge !== zohoLodge) {
        // Lodge swap — cancel old, create new
        toCancel.push({ booking: bk, reason: 'lodge_changed' })
        toCreate.push({ night: n, reason: 'swap' })
        return
      }

      // Same lodge — check for in-place edits to other Zoho-backed fields.
      const diff = {}
      const diffSummary = []

      // Day_Description (composed from day + route + pre_tour)
      const draftDayDesc = buildDayDesc(n)
      const zohoDayDesc = bk.Day_Description || bk['Day Description'] || ''
      if (draftDayDesc && draftDayDesc !== zohoDayDesc) {
        diff.Day_Description = draftDayDesc
        diffSummary.push('route/day')
      }

      // Meals
      const draftMeals = (n.meals || '').trim()
      const zohoMeals = (bk.Meals || '').trim()
      if (draftMeals && draftMeals !== zohoMeals) {
        diff.Meals = draftMeals
        diffSummary.push('meals')
      }

      // Check-in / Check-out date (rare single-row shift — batch shift has
      // its own endpoint). Only sync if the date actually changed.
      const draftDate = (n.date || '').trim()
      const zohoDate = (bk.Check_in_Date || bk['Check-in'] || '').trim()
      if (draftDate && draftDate !== zohoDate) {
        diff.Check_in_Date = draftDate
        try {
          const co = new Date(draftDate)
          co.setDate(co.getDate() + 1)
          diff.Check_out_Date = co.toISOString().split('T')[0]
        } catch (e) {}
        diffSummary.push('date')
      }

      // Excursion
      const draftExc = (n.excursion || '').trim()
      const zohoExc = (bk.Excursion || '').trim()
      if (draftExc !== zohoExc) {
        diff.Excursion = draftExc
        diffSummary.push('excursion')
      }
      const draftExcDate = (n.excursion_date || '').trim()
      const zohoExcDate = (bk.Excursion_Date || '').trim()
      if (draftExcDate !== zohoExcDate && (draftExcDate || zohoExcDate)) {
        diff.Excursion_Date = draftExcDate
        // Flag under the same 'excursion' label if it's not already there
        if (!diffSummary.includes('excursion')) diffSummary.push('excursion date')
      }

      if (Object.keys(diff).length > 0) {
        toUpdate.push({
          id: n.zoho_id,
          fields: diff,
          summary: diffSummary,
          night: n,
          booking: bk,
        })
      } else {
        unchanged.push({ booking: bk })
      }
    })

    // Zoho bookings with no matching draft row → cancel
    zohoBookings.forEach(bk => {
      const id = String(bk.id || bk['Record Id'] || '')
      if (!id) return
      if (!draftIdsReferenced.has(id)) {
        toCancel.push({ booking: bk, reason: 'removed' })
      }
    })

    return { toCreate, toCancel, toUpdate, unchanged }
  })()

  const newNights = syncPlan.toCreate.map(c => c.night)
  const cancelBookings = syncPlan.toCancel
  const updateBookings = syncPlan.toUpdate
  const hasChanges = newNights.length > 0 || cancelBookings.length > 0 || updateBookings.length > 0

  const buildConfirmMessage = () => {
    const lines = []
    if (newNights.length) {
      lines.push(newNights.length + ' night' + (newNights.length !== 1 ? 's' : '') + ' to create:')
      syncPlan.toCreate.forEach(c => {
        const tag = c.reason === 'swap' ? ' (lodge swap)' : ''
        lines.push('  + ' + (c.night.date || '?') + ' — ' + (c.night.lodge || 'TBD') + tag)
      })
    }
    if (updateBookings.length) {
      if (lines.length) lines.push('')
      lines.push(updateBookings.length + ' booking' + (updateBookings.length !== 1 ? 's' : '') + ' to update:')
      updateBookings.forEach(u => {
        const bk = u.booking
        const lodge = (bk.Lodge_Name && typeof bk.Lodge_Name === 'object' ? bk.Lodge_Name.name : bk.Lodge_Name) || (bk.Name || '').split(' - ')[0] || 'TBD'
        const date = u.night.date || bk.Check_in_Date || ''
        lines.push('  ~ ' + date + ' — ' + lodge + ' (' + u.summary.join(', ') + ')')
      })
    }
    if (cancelBookings.length) {
      if (lines.length) lines.push('')
      lines.push(cancelBookings.length + ' booking' + (cancelBookings.length !== 1 ? 's' : '') + ' to mark Cancelled:')
      cancelBookings.forEach(c => {
        const bk = c.booking
        const lodge = (bk.Lodge_Name && typeof bk.Lodge_Name === 'object' ? bk.Lodge_Name.name : bk.Lodge_Name) || (bk.Name || '').split(' - ')[0] || 'TBD'
        const date = bk.Check_in_Date || bk['Check-in'] || ''
        const tag = c.reason === 'lodge_changed' ? ' (lodge changed)' : ' (night removed)'
        lines.push('  − ' + date + ' — ' + lodge + tag)
      })
    }
    lines.push('')
    lines.push(syncPlan.unchanged.length + ' unchanged.')
    lines.push('')
    lines.push('Continue?')
    return lines.join('\n')
  }

  const handlePushToZoho = async () => {
    if (!hasChanges) {
      alert('Draft matches Zoho. Nothing to sync.')
      return
    }
    if (!confirm(buildConfirmMessage())) return
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
            end_date: tour.end_date || null,
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

      // 1. Cancel orphaned / swapped bookings first (reuses /api/update-bookings).
      // Also prefix Day_Description with "Z " so cancelled rows drop to the
      // bottom when Zoho views sort alphabetically by Day Description. This
      // matches the existing Z-prefix convention (see isActiveBooking).
      let cancelledCount = 0
      if (cancelBookings.length) {
        const cancelRecords = cancelBookings
          .map(c => {
            const bk = c.booking
            const id = bk.id || bk['Record Id']
            if (!id) return null
            const rec = { id: id, Status: 'Cancelled' }
            const currentDesc = bk.Day_Description || bk['Day Description'] || ''
            if (currentDesc && !/^z\s/i.test(currentDesc)) {
              rec.Day_Description = 'Z ' + currentDesc
            }
            return rec
          })
          .filter(Boolean)
        if (cancelRecords.length) {
          const cancelRes = await fetch('/api/update-bookings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ records: cancelRecords }),
          })
          if (!cancelRes.ok) {
            const err = await cancelRes.json().catch(() => ({}))
            throw new Error('Failed to cancel bookings: ' + (err.error || cancelRes.statusText))
          }
          const cancelResult = await cancelRes.json()
          cancelledCount = cancelResult.updated || 0
        }
      }

      // 2. In-place field updates (per-row PUTs via records param)
      let updatedCount = 0
      if (updateBookings.length) {
        const records = updateBookings.map(u => Object.assign({ id: u.id }, u.fields))
        const updateRes = await fetch('/api/update-bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ records: records }),
        })
        if (!updateRes.ok) {
          const err = await updateRes.json().catch(() => ({}))
          throw new Error('Failed to update bookings: ' + (err.error || updateRes.statusText))
        }
        const updateResult = await updateRes.json()
        updatedCount = updateResult.updated || 0
      }

      // 3. Create any new nights
      let createdCount = 0
      let result = null
      if (newNights.length) {
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
          throw new Error(err.error || 'Failed to create new nights')
        }

        result = await response.json()
        createdCount = result.created || 0
      }

      setPushed(true)
      localStorage.removeItem(draftKey)

      const summary = [
        createdCount ? (createdCount + ' created') : '',
        updatedCount ? (updatedCount + ' updated') : '',
        cancelledCount ? (cancelledCount + ' cancelled') : '',
      ].filter(Boolean).join(', ')
      if (summary) alert('Sync complete: ' + summary + '.')

      // Return the Zoho tour id so the parent can switch activeTour to the new record
      if (onSave) onSave({ ...(result || {}), tour_id: tourId, was_local: isLocalTour, cancelled: cancelledCount, updated: updatedCount })
    } catch (err) {
      alert('Error syncing to Zoho: ' + err.message)
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
  const handleDownloadPDF = (opts) => {
    const o = opts || pdfOptions
    // Filter out cancelled/Z-prefixed nights
    const activeNights = nights.filter(n => {
      const name = (n.id || n.name || '').toLowerCase()
      const lodge = (n.lodge || '').toLowerCase()
      const status = (n.status || '').toLowerCase()
      return !lodge.startsWith('z ') && status !== 'cancelled' && !name.startsWith('z')
    })
    const totalKm = activeNights.reduce((sum, n) => sum + (parseInt(n.km) || 0), 0)
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
  .alt-route { font-size: 9px; color: #92400E; margin-top: 4px; padding-top: 3px; border-top: 1px dashed #ddd; }
  .alt-lodge { font-size: 9px; color: #92400E; margin-top: 2px; }
  .total { font-weight: 600; background: #f5f5f5; }
  .footer { margin-top: 14px; font-size: 9px; color: #999; }
  @media print { body { padding: 0; } }
</style>
</head><body>
<h1>${tour.name}</h1>
<div class="sub">Departure: ${departureDate ? fmtDateFull(departureDate) : 'TBC'}${tour.tour_type ? ' · ' + tour.tour_type : ''}</div>
<table>
<thead><tr><th>Day</th><th>Date</th><th>Route</th>${o.km ? '<th>Km</th>' : ''}<th>Lodge</th>${o.meals ? '<th>Meals</th>' : ''}</tr></thead>
<tbody>
${activeNights.map(n => `<tr>
  <td class="night">${n.pre_tour ? 'Pre' : n.day}</td>
  <td class="date">${fmtDate(n.date)}</td>
  <td class="route">${n.route || ''}${o.km && n.km ? '<div class="notes">' + n.km + ' km</div>' : ''}${o.route_notes && n.route_notes ? '<div class="route-notes">' + n.route_notes + '</div>' : ''}${n.notes ? '<div class="notes">' + n.notes + '</div>' : ''}${o.excursion && n.excursion ? '<div class="notes">Excursion: ' + n.excursion + '</div>' : ''}${o.alt && n.alt ? '<div class="alt-route"><strong>Alt:</strong> ' + (n.alt.route || '') + (o.km && n.alt.km ? ' · ' + n.alt.km + ' km' : '') + (o.route_notes && n.alt.route_notes ? '<br><em>' + n.alt.route_notes + '</em>' : '') + '</div>' : ''}</td>
  ${o.km ? '<td class="km">' + (n.km || '') + '</td>' : ''}
  <td><div class="lodge">${n.lodge || ''}</div>${o.alt && n.alt && n.alt.lodge ? '<div class="alt-lodge"><strong>Alt:</strong> ' + n.alt.lodge + '</div>' : ''}${n.backup ? '<div class="backup">Backup: ' + n.backup + '</div>' : ''}</td>
  ${o.meals ? '<td class="meals">' + (n.meals || '') + '</td>' : ''}
</tr>`).join('')}
<tr class="total"><td></td><td></td><td>Total${o.km ? ': ' + totalKm + ' km' : ''}</td>${o.km ? '<td class="km"></td>' : ''}<td></td>${o.meals ? '<td></td>' : ''}</tr>
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
  .alt-route { font-size: 10px; color: #92400E; margin-top: 5px; padding-top: 4px; border-top: 1px dashed #ddd; line-height: 1.4; }
  .alt-lodge { font-size: 10px; color: #92400E; margin-top: 3px; }
  .alt-label { font-weight: 600; }
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
          ${n.alt ? '<div class="alt-route"><span class="alt-label">Alt:</span> ' + (n.alt.route || '') + (n.alt.km ? ' · ' + n.alt.km + ' km' : '') + (n.alt.route_notes ? '<br><em>' + n.alt.route_notes.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</em>' : '') + '</div>' : ''}
        </td>
        <td class="lodge-col">${n.lodge || '—'}${n.alt && n.alt.lodge ? '<div class="alt-lodge"><span class="alt-label">Alt:</span> ' + n.alt.lodge + '</div>' : ''}</td>
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
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
            Departure:
            <input
              type="date"
              value={departureDate}
              onChange={e => {
                const newDate = e.target.value
                if (!newDate) return
                // Shift all night dates relative to new departure
                setNights(prev => prev.map((n, i) => {
                  const d = new Date(newDate)
                  d.setDate(d.getDate() + i)
                  return { ...n, date: d.toISOString().slice(0, 10) }
                }))
                // Auto-calc end date from nights count
                const endD = new Date(newDate)
                endD.setDate(endD.getDate() + Math.max(0, nights.length - 1))
                const endDate = endD.toISOString().slice(0, 10)
                // Update tour in App and persist to localStorage/Zoho for local drafts
                if (onUpdateTour) onUpdateTour({ departure_date: newDate, end_date: endDate })
                // For local drafts, also update via api
                if (tour.id && String(tour.id).startsWith('local_')) {
                  fetch('/api/update-tour', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: tour.id, departure_date: newDate, end_date: endDate }),
                  }).catch(() => {})
                }
                setDirty(true)
              }}
              style={{
                fontSize: 13, border: 'none', borderBottom: '0.5px solid var(--border-default)',
                background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer',
                padding: '0 2px', outline: 'none',
              }}
            />
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
            <div style={{ position: 'relative' }}>
              <button
                className="btn"
                onClick={() => setShowPdfOptions(v => !v)}
                title="Print / Save as PDF"
              >↓ PDF</button>
              {showPdfOptions && (
                <div style={{
                  position: 'absolute', top: '110%', left: 0, zIndex: 100,
                  background: 'var(--bg-primary)', border: '0.5px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)', padding: '10px 14px', minWidth: 180,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Include fields</div>
                  {[
                    { key: 'km', label: 'Distance (km)' },
                    { key: 'route_notes', label: 'Route notes' },
                    { key: 'meals', label: 'Meals' },
                    { key: 'excursion', label: 'Excursions' },
                    { key: 'alt', label: 'Alt routes' },
                  ].map(({ key, label }) => (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 6, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={pdfOptions[key]}
                        onChange={e => setPdfOptions(prev => ({ ...prev, [key]: e.target.checked }))}
                      />
                      {label}
                    </label>
                  ))}
                  <button
                    onClick={() => { setShowPdfOptions(false); handleDownloadPDF() }}
                    className="btn btn-primary"
                    style={{ width: '100%', marginTop: 8, fontSize: 11 }}
                  >Generate PDF</button>
                </div>
              )}
            </div>
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
              {pushing
                ? 'Syncing...'
                : pushed
                  ? 'Synced to Zoho'
                  : !hasChanges
                    ? 'All in Zoho'
                    : (cancelBookings.length > 0 || updateBookings.length > 0)
                      ? 'Sync to Zoho (+' + newNights.length + ' / ~' + updateBookings.length + ' / −' + cancelBookings.length + ')'
                      : newNights.length === nights.length
                        ? 'Push to Zoho (' + nights.length + ' nights)'
                        : 'Push ' + newNights.length + ' new night' + (newNights.length !== 1 ? 's' : '') + ' to Zoho'
              }
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
              <col style={{ width: '23%' }} />
              <col style={{ width: '23%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: 80 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Day</th>
                <th>Date</th>
                <th>Route</th>
                <th>Alt route</th>
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
                  {/* Alt route column */}
                  <td style={{ verticalAlign: 'top', padding: '8px 6px' }}>
                    {n.alt ? (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                          <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--amber-text, #92400E)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Alt</span>
                          <button onClick={() => removeAlt(i)} style={{ background: 'none', border: 'none', fontSize: 10, color: 'var(--text-muted)', cursor: 'pointer', marginLeft: 'auto' }}>×</button>
                        </div>
                        <input
                          type="text"
                          value={n.alt.route || ''}
                          onChange={e => updateAlt(i, 'route', e.target.value)}
                          style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 11, padding: '1px 0', outline: 'none', color: 'var(--text-primary)' }}
                          placeholder="Alt route"
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                          <input
                            type="text"
                            value={n.alt.km || ''}
                            onChange={e => updateAlt(i, 'km', e.target.value.replace(/[^0-9/.]/g, ''))}
                            style={{ width: 40, border: 'none', background: 'transparent', fontSize: 11, padding: '1px 0', outline: 'none', color: 'var(--text-muted)', textAlign: 'right' }}
                            placeholder="—"
                          />
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 2 }}>km</span>
                        </div>
                        <input
                          type="text"
                          value={n.alt.route_notes || ''}
                          onChange={e => updateAlt(i, 'route_notes', e.target.value)}
                          style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 10, padding: '1px 0', outline: 'none', color: 'var(--text-muted)', fontStyle: 'italic' }}
                          placeholder="Alt route notes"
                        />
                        <input
                          type="text"
                          value={n.alt.lodge || ''}
                          onChange={e => updateAlt(i, 'lodge', e.target.value)}
                          style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 11, padding: '3px 0', outline: 'none', color: 'var(--amber-text, #92400E)', marginTop: 4, borderTop: '0.5px dashed var(--border-light)' }}
                          placeholder="Alt lodge"
                        />
                      </div>
                    ) : (
                      <button
                        onClick={() => addAlt(i)}
                        style={{ background: 'none', border: 'none', fontSize: 9, color: 'var(--amber-text, #92400E)', cursor: 'pointer', padding: '2px 0', opacity: 0.7 }}
                      >+ Alt route</button>
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
