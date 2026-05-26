import React, { useState, useEffect } from 'react'
import { getAllTemplates } from '../utils/templates'

// Tour types. daysOffset = days to add to departure date to get end date.
// A 21-day tour starts on day 1 and ends on day 21 = departure + 20 days.
// null = no auto-fill (Custom)
const TOUR_TYPES = [
  { value: 'FoSA 21', daysOffset: 20 },
  { value: 'FoSA 20', daysOffset: 19 },
  { value: 'FoSA 15', daysOffset: 14 },
  { value: 'Edge 14', daysOffset: 13 },
  { value: 'Edge 12', daysOffset: 11 },
  { value: 'Custom',  daysOffset: null },
]

// Add `days` to a YYYY-MM-DD string and return YYYY-MM-DD
// Uses UTC throughout to avoid timezone off-by-one
function addDays(dateStr, days) {
  if (!dateStr || days == null) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return ''
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

export default function NewTour({ onCreate, onCancel, initialTemplate }) {
  const [name, setName] = useState('')
  const [departureDate, setDepartureDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [endDateEdited, setEndDateEdited] = useState(false)
  const [tourType, setTourType] = useState(() => {
    if (!initialTemplate) return ''
    const tpl = getAllTemplates()[initialTemplate]
    return (tpl && tpl.tour_type) ? tpl.tour_type : ''
  })
  const [saving, setSaving] = useState(false)

  // Auto-fill end date from departure + tour type, unless user has manually edited it
  useEffect(() => {
    if (endDateEdited) return
    const t = TOUR_TYPES.find(x => x.value === tourType)
    if (!t || t.daysOffset == null || !departureDate) return
    const auto = addDays(departureDate, t.daysOffset)
    if (auto) setEndDate(auto)
  }, [departureDate, tourType, endDateEdited])

  const canSubmit = name.trim() && departureDate && tourType && !saving

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSaving(true)
    try {
      // Store template key so ItineraryEditor auto-applies it after creation
      if (initialTemplate) {
        try { localStorage.setItem('rds_pending_template', initialTemplate) } catch(e) {}
      }
      await onCreate({
        name: name.trim(),
        departure_date: departureDate,
        end_date: endDate || null,
        tour_type: tourType,
      })
    } catch (err) {
      alert('Error creating tour: ' + (err.message || err))
      setSaving(false)
    }
  }

  const inputStyle = {
    width: '100%', fontSize: 14, padding: '8px 10px',
    border: '0.5px solid var(--border-default)', borderRadius: 6,
    outline: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)',
    fontFamily: 'inherit',
  }

  const labelStyle = {
    display: 'block', fontSize: 12, fontWeight: 500,
    color: 'var(--text-muted)', marginBottom: 6,
  }

  return (
    <div style={{ maxWidth: 520 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>New tour</h1>
        {initialTemplate && (() => {
          const tpl = getAllTemplates()[initialTemplate]
          return tpl ? (
            <div style={{ fontSize: 13, color: 'var(--blue-text)', background: 'var(--blue-bg)', border: '0.5px solid var(--blue-mid)', borderRadius: 4, padding: '4px 10px', display: 'inline-block', marginBottom: 8 }}>
              Template: {tpl.name}
            </div>
          ) : null
        })()}
        <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Create a local draft. It won't be written to Zoho until you push the itinerary.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={labelStyle}>Tour name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. FoSA Sep 27"
            style={inputStyle}
            autoFocus
          />
        </div>

        <div>
          <label style={labelStyle}>Tour type</label>
          <select
            value={tourType}
            onChange={e => setTourType(e.target.value)}
            style={inputStyle}
          >
            <option value="" disabled>Select tour type…</option>
            {TOUR_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.value}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Departure date</label>
            <input
              type="date"
              value={departureDate}
              onChange={e => setDepartureDate(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>
              End date
              {!endDateEdited && endDate && tourType && tourType !== 'Custom' && (
                <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>
                  (auto)
                </span>
              )}
            </label>
            <input
              type="date"
              value={endDate}
              onChange={e => { setEndDate(e.target.value); setEndDateEdited(true) }}
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 28 }}>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{
            fontSize: 13, padding: '8px 16px', fontWeight: 500,
            border: 'none', borderRadius: 6, cursor: canSubmit ? 'pointer' : 'not-allowed',
            background: 'var(--blue-mid)', color: '#fff',
            opacity: canSubmit ? 1 : 0.5,
          }}
        >
          {saving ? 'Creating...' : 'Create tour'}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          style={{
            fontSize: 13, padding: '8px 16px', fontWeight: 500,
            border: '0.5px solid var(--border-default)', borderRadius: 6,
            cursor: saving ? 'not-allowed' : 'pointer',
            background: 'var(--bg-primary)', color: 'var(--text-primary)',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
