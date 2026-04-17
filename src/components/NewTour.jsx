import React, { useState } from 'react'

export default function NewTour({ onCreate, onCancel }) {
  const [name, setName] = useState('')
  const [departureDate, setDepartureDate] = useState('')
  const [tourType, setTourType] = useState('FoSA 20')
  const [saving, setSaving] = useState(false)

  const canSubmit = name.trim() && departureDate && !saving

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSaving(true)
    try {
      await onCreate({ name: name.trim(), departure_date: departureDate, tour_type: tourType })
      // onCreate navigates to itinerary view on success — no further action needed
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
          <label style={labelStyle}>Departure date</label>
          <input
            type="date"
            value={departureDate}
            onChange={e => setDepartureDate(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Tour type</label>
          <select
            value={tourType}
            onChange={e => setTourType(e.target.value)}
            style={inputStyle}
          >
            <option value="FoSA 20">FoSA 20</option>
            <option value="FoSA 15">FoSA 15</option>
            <option value="Edge 14">Edge 14</option>
            <option value="Edge 12">Edge 12</option>
            <option value="Custom">Custom</option>
          </select>
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
