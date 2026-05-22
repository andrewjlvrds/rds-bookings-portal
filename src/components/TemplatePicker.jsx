import React, { useState, useMemo } from 'react'
import { LODGE_REPLY_TEMPLATES } from '../utils/emailTemplates'

// Shared template picker for lodge correspondence composers.
// Renders a dropdown above the body textarea. Selecting a template expands
// a small inline form with the fields that template needs. Fields autofill
// from the `context` prop where possible.
//
// Usage:
//   <TemplatePicker
//     context={{ contactName, date, bookingRef, lodgeName, sender, leadGuideName }}
//     onInsert={(generatedBody) => setBody(generatedBody + '\n\n' + body)}
//   />
//
// onInsert receives the generated template body as a string. Insertion logic
// (prepend, replace, etc.) is the parent's responsibility.

export default function TemplatePicker({ context = {}, onInsert }) {
  const [selectedId, setSelectedId] = useState('')
  const selected = useMemo(
    () => LODGE_REPLY_TEMPLATES.find(t => t.id === selectedId),
    [selectedId]
  )

  // Field values, keyed by field key. Initialised from context on selection.
  const [values, setValues] = useState({})

  const handleSelect = (id) => {
    setSelectedId(id)
    if (!id) { setValues({}); return }
    const tpl = LODGE_REPLY_TEMPLATES.find(t => t.id === id)
    if (!tpl) { setValues({}); return }
    // Autofill from context
    const initial = {}
    tpl.fields.forEach(f => {
      if (f.autofillFrom && context[f.autofillFrom] != null) {
        initial[f.key] = context[f.autofillFrom]
      } else if (f.type === 'bool') {
        initial[f.key] = false
      } else {
        initial[f.key] = ''
      }
    })
    setValues(initial)
  }

  const handleFieldChange = (key, value) => {
    setValues(prev => ({ ...prev, [key]: value }))
  }

  const handleInsert = () => {
    if (!selected) return
    // Build opts object the template fn expects.
    const opts = { sender: context.sender || 'Helen' }
    selected.fields.forEach(f => {
      let v = values[f.key]
      if (f.type === 'guests') {
        // Convert newline-separated string into array of names
        v = (v || '').split('\n').map(s => s.trim()).filter(Boolean)
      }
      opts[f.key] = v
    })
    const generated = selected.fn(opts)
    if (typeof onInsert === 'function') onInsert(generated)
    // Reset
    setSelectedId('')
    setValues({})
  }

  const handleCancel = () => {
    setSelectedId('')
    setValues({})
  }

  // Are all required fields filled?
  const canInsert = useMemo(() => {
    if (!selected) return false
    for (const f of selected.fields) {
      if (!f.required) continue
      const v = values[f.key]
      if (f.type === 'guests') {
        const lines = (v || '').split('\n').map(s => s.trim()).filter(Boolean)
        if (lines.length === 0) return false
      } else if (f.type === 'bool') {
        // bool required is unusual but support it
        if (!v) return false
      } else {
        if (!v || !String(v).trim()) return false
      }
    }
    return true
  }, [selected, values])

  const labelStyle = {
    display: 'block',
    fontSize: 11,
    color: 'var(--text-muted)',
    marginBottom: 3,
  }
  const inputStyle = {
    width: '100%',
    fontSize: 12,
    padding: '5px 8px',
    border: '0.5px solid var(--border-default)',
    borderRadius: 3,
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-sans)',
    boxSizing: 'border-box',
    outline: 'none',
  }
  const helpStyle = {
    fontSize: 10,
    color: 'var(--text-muted)',
    marginTop: 2,
    lineHeight: 1.3,
  }

  return (
    <div style={{ marginBottom: 8 }}>
      {/* Dropdown */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          Insert template:
        </label>
        <select
          value={selectedId}
          onChange={e => handleSelect(e.target.value)}
          style={{
            ...inputStyle,
            flex: 1,
            maxWidth: 360,
            cursor: 'pointer',
          }}
        >
          <option value="">— Pick a template —</option>
          {LODGE_REPLY_TEMPLATES.map(t => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Inline form */}
      {selected && (
        <div
          style={{
            marginTop: 8,
            padding: '10px 12px',
            background: 'var(--bg-primary)',
            border: '0.5px solid var(--border-default)',
            borderRadius: 4,
          }}
        >
          <div style={{ display: 'grid', gap: 8 }}>
            {selected.fields.map(f => {
              const val = values[f.key]
              const labelText = f.label + (f.required ? ' *' : '')

              if (f.type === 'textarea') {
                return (
                  <div key={f.key}>
                    <label style={labelStyle}>{labelText}</label>
                    <textarea
                      value={val || ''}
                      onChange={e => handleFieldChange(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      rows={2}
                      style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
                    />
                    {f.helpText && <div style={helpStyle}>{f.helpText}</div>}
                  </div>
                )
              }

              if (f.type === 'rooming') {
                return (
                  <div key={f.key}>
                    <label style={labelStyle}>{labelText}</label>
                    <textarea
                      value={val || ''}
                      onChange={e => handleFieldChange(f.key, e.target.value)}
                      placeholder={f.placeholder || '8 pax in single rooms\nGuest 1\nGuest 2\n\n2 pax sharing a twin room\nGuest A & Guest B\n\n3 tour guides\nLead Guide Name (Lead Guide: Cell Number: +27...)\nSecond Guide'}
                      rows={8}
                      style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5, fontFamily: 'var(--font-mono, monospace)', fontSize: 11 }}
                    />
                    {f.helpText && <div style={helpStyle}>{f.helpText}</div>}
                  </div>
                )
              }

              if (f.type === 'guests') {
                return (
                  <div key={f.key}>
                    <label style={labelStyle}>{labelText}</label>
                    <textarea
                      value={val || ''}
                      onChange={e => handleFieldChange(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      rows={3}
                      style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
                    />
                    {f.helpText && <div style={helpStyle}>{f.helpText}</div>}
                  </div>
                )
              }

              if (f.type === 'bool') {
                return (
                  <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="checkbox"
                      id={'tpl-field-' + f.key}
                      checked={!!val}
                      onChange={e => handleFieldChange(f.key, e.target.checked)}
                    />
                    <label htmlFor={'tpl-field-' + f.key} style={{ fontSize: 12, color: 'var(--text-primary)', cursor: 'pointer' }}>
                      {labelText}
                    </label>
                    {f.helpText && <span style={{ ...helpStyle, marginTop: 0 }}>{f.helpText}</span>}
                  </div>
                )
              }

              // default: text
              return (
                <div key={f.key}>
                  <label style={labelStyle}>{labelText}</label>
                  <input
                    type="text"
                    value={val || ''}
                    onChange={e => handleFieldChange(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    style={inputStyle}
                  />
                  {f.helpText && <div style={helpStyle}>{f.helpText}</div>}
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 10 }}>
            <button
              type="button"
              onClick={handleCancel}
              className="btn btn-sm"
              style={{ fontSize: 11 }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleInsert}
              disabled={!canInsert}
              className="btn btn-primary btn-sm"
              style={{ fontSize: 11, padding: '4px 14px' }}
            >
              Insert
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
