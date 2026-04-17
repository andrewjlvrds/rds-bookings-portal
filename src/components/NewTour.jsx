import React, { useState, useEffect } from 'react'

// Tour types. nights = end date offset from departure.
// null = no auto-fill (Custom)
const TOUR_TYPES = [
  { value: 'FoSA 21', nights: 20 },
  { value: 'FoSA 20', nights: 19 },
  { value: 'FoSA 15', nights: 14 },
  { value: 'Edge 14', nights: 13 },
  { value: 'Edge 12', nights: 11 },
  { value: 'Custom',  nights: null },
]

// Add `nights` days to a YYYY-MM-DD string and return YYYY-MM-DD
function addDays(dateStr, nights) {
  if (!dateStr || nights == null) return ''
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return ''
  d.setDate(d.getDate() + nights)
  return d.toISOString().slice(0, 10)
}

export default function NewTour({ onCreate, onCancel }) {
  const [name, setName] = useState('')
  const [departureDate, setDepartureDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [endDateEdited, setEndDateEdited] = useState(false)
  const [tourType, setTourType] = useState('')
  const [saving, setSaving] = useState(false)

  // Auto-fill end date from departure + tour type, unless user has manually edited it
  useEffect(() => {
    if (endDateEdited) return
    const t = TOUR_TYPES.find(x => x.value === tourType)
    if (!t || t.nights == null || !departureDate) return
    const auto = addDays(departureDate, t.nights)
    if (auto) setEndDate(auto)
  }, [departureDate, tourType, endDateEdited])

  const canSubmit = name.trim() && departureDate && tourType && !saving

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSaving(true)
    try {
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
