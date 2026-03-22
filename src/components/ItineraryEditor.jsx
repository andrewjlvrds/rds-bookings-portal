import React, { useState, useMemo } from 'react'
import { TEMPLATES, generateDates, generateRdsRef } from '../utils/templates'
import { fmtDate, fmtDateFull } from '../utils/helpers'

export default function ItineraryEditor({ tour, onBack, onSave }) {
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [nights, setNights] = useState([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // If tour already has bookings, load them as the starting point
  const existingBookings = (tour.bookings || []).length

  // Departure date from tour
  const departureDate = tour.departure_date || ''

  // Apply a template
  const handleApplyTemplate = (templateKey) => {
    const template = TEMPLATES[templateKey]
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
    setSaved(false)
  }

  // Edit a night's lodge
  const updateNight = (idx, field, value) => {
    setNights(prev => prev.map((n, i) => i === idx ? { ...n, [field]: value } : n))
    setSaved(false)
  }

  // Remove a night
  const removeNight = (idx) => {
    setNights(prev => prev.filter((_, i) => i !== idx))
    setSaved(false)
  }

  // Add a night after index
  const addNightAfter = (idx) => {
    const prev = nights[idx]
    const newDate = new Date(prev.date)
    newDate.setDate(newDate.getDate() + 1)

    const newNight = {
      id: 'new_' + Date.now(),
      day: prev.day + 1,
      night_number: prev.night_number + 1,
      date: newDate.toISOString().split('T')[0],
      route: '',
      lodge: '',
      backup: '',
      meals: 'BB',
      region: prev.region,
      editing: true,
    }

    const updated = [...nights]
    updated.splice(idx + 1, 0, newNight)
    // Renumber
    updated.forEach((n, i) => { n.night_number = i + 1 })
    setNights(updated)
    setSaved(false)
  }

  // Save to Zoho (create lodge bookings)
  const handleSave = async () => {
    if (!tour.id || tour.id === 'unassigned') return
    setSaving(true)

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
            pre_tour: n.pre_tour || false,
          })),
        }),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Failed to save')
      }

      const result = await response.json()
      setSaved(true)
      if (onSave) onSave(result)
    } catch (err) {
      alert('Error saving itinerary: ' + err.message)
    } finally {
      setSaving(false)
    }
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
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => setNights([])}>Clear</button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || saved || !departureDate}
            >
              {saving ? 'Saving...' : saved ? 'Saved' : 'Save to Zoho (' + nights.length + ' nights)'}
            </button>
          </div>
        )}
      </div>

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
          This tour already has {existingBookings} lodge booking{existingBookings > 1 ? 's' : ''} in Zoho.
          Applying a template will create additional bookings — it won't replace existing ones.
        </div>
      )}

      {/* Template selection */}
      {nights.length === 0 && departureDate && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 500, marginBottom: 10 }}>Choose a template</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {Object.entries(TEMPLATES).map(([key, tmpl]) => (
              <button
                key={key}
                onClick={() => handleApplyTemplate(key)}
                style={{
                  display: 'block',
                  textAlign: 'left',
                  padding: 16,
                  border: '0.5px solid var(--border-default)',
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--bg-primary)',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--blue-mid)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)' }}
              >
                <div style={{ fontWeight: 500, marginBottom: 4 }}>{tmpl.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {tmpl.nights.length} nights · Based on {tmpl.source_tour}
                </div>
              </button>
            ))}
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
                  </td>
                  <td>
                    <select
                      value={n.lodge}
                      onChange={e => updateNight(i, 'lodge', e.target.value)}
                      style={{
                        width: '100%', border: 'none', background: 'transparent',
                        fontSize: 13, fontWeight: 500, padding: '2px 0', outline: 'none',
                        color: 'var(--text-primary)', cursor: 'pointer',
                      }}
                    >
                      {(n.lodges || []).map(l => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                      {n.lodge && !(n.lodges || []).includes(n.lodge) && (
                        <option value={n.lodge}>{n.lodge}</option>
                      )}
                      <option value="">— none —</option>
                    </select>
                    {n.notes && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{n.notes}</div>
                    )}
                  </td>
                  <td>
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
      {nights.length > 0 && (
        <div style={{
          display: 'flex', gap: 16, marginTop: 16,
          padding: '12px 16px', background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--text-muted)',
        }}>
          <span>{nights.length} nights total</span>
          <span>{nights.filter(n => n.pre_tour).length} pre-tour</span>
          <span>{new Set(nights.map(n => n.lodge)).size} unique lodges</span>
          <span>{nights.filter(n => !n.lodge).length} lodges to assign</span>
        </div>
      )}
    </div>
  )
}
