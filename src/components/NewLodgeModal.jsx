import React, { useState } from 'react'

export default function NewLodgeModal({ prefill, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: prefill || '',
    email: '',
    contact_first_name: '',
    country: '',
    lodge_currency: '',
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const r = await fetch('/api/create-lodge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await r.json()
      if (!r.ok || !data.success) { alert('Error: ' + (data.error || 'Unknown')); setSaving(false); return }
      onSaved()
    } catch(e) { alert('Error: ' + e.message); setSaving(false) }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-primary)', borderRadius: 'var(--radius-lg)',
        padding: 24, width: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, marginTop: 0 }}>Add new lodge to Zoho</h2>
        {[
          { key: 'name', label: 'Lodge name *', placeholder: 'e.g. Lord Milner Hotel' },
          { key: 'email', label: 'Email', placeholder: 'reservations@...' },
          { key: 'contact_first_name', label: 'Contact first name', placeholder: 'e.g. Howard' },
          { key: 'country', label: 'Country', placeholder: 'e.g. South Africa' },
          { key: 'lodge_currency', label: 'Currency', placeholder: 'e.g. ZAR' },
        ].map(f => (
          <div key={f.key} style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>{f.label}</label>
            <input
              type="text"
              value={form[f.key]}
              onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
              placeholder={f.placeholder}
              autoFocus={f.key === 'email'}
              style={{
                width: '100%', boxSizing: 'border-box', fontSize: 13,
                padding: '6px 8px', borderRadius: 4,
                border: '0.5px solid var(--border-default)',
                background: 'var(--bg-primary)', color: 'var(--text-primary)',
              }}
            />
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={{ fontSize: 13, padding: '6px 14px', borderRadius: 4, border: '0.5px solid var(--border-default)', background: 'transparent', cursor: 'pointer' }}>Cancel</button>
          <button
            onClick={handleSave}
            disabled={!form.name.trim() || saving}
            style={{ fontSize: 13, padding: '6px 16px', borderRadius: 4, border: 'none', background: 'var(--blue-mid)', color: '#fff', cursor: 'pointer', opacity: (!form.name.trim() || saving) ? 0.6 : 1 }}
          >{saving ? 'Saving…' : 'Add to Zoho'}</button>
        </div>
      </div>
    </div>
  )
}
