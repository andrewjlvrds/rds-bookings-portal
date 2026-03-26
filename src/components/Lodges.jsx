import React, { useState, useMemo } from 'react'

export default function Lodges({ lodges }) {
  const [search, setSearch] = useState('')
  const [expandedCountry, setExpandedCountry] = useState(null)

  // Group by country
  const grouped = useMemo(() => {
    const byCountry = {}
    ;(lodges || []).forEach(l => {
      const country = l.country || 'Unknown'
      if (!byCountry[country]) byCountry[country] = []
      byCountry[country].push(l)
    })
    // Sort lodges within each country
    Object.keys(byCountry).forEach(c => {
      byCountry[c].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    })
    return byCountry
  }, [lodges])

  const countries = useMemo(() => {
    return Object.keys(grouped).sort((a, b) => {
      if (a === 'Unknown') return 1
      if (b === 'Unknown') return -1
      return a.localeCompare(b)
    })
  }, [grouped])

  // Filter by search
  const filteredCountries = useMemo(() => {
    if (!search.trim()) return countries
    const q = search.toLowerCase()
    return countries.filter(c => {
      if (c.toLowerCase().includes(q)) return true
      return grouped[c].some(l =>
        (l.name || '').toLowerCase().includes(q) ||
        (l.email || '').toLowerCase().includes(q) ||
        (l.contact || '').toLowerCase().includes(q)
      )
    })
  }, [countries, grouped, search])

  const filteredLodges = (country) => {
    if (!search.trim()) return grouped[country]
    const q = search.toLowerCase()
    if (country.toLowerCase().includes(q)) return grouped[country]
    return grouped[country].filter(l =>
      (l.name || '').toLowerCase().includes(q) ||
      (l.email || '').toLowerCase().includes(q) ||
      (l.contact || '').toLowerCase().includes(q)
    )
  }

  const totalLodges = (lodges || []).length

  return (
    <div>
      <h1 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>Lodges</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
        {totalLodges} lodges across {countries.length} countries
      </p>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search lodges, countries, emails..."
        style={{
          width: '100%', maxWidth: 400, fontSize: 13, padding: '8px 12px',
          border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-md)',
          outline: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)',
          marginBottom: 20,
        }}
      />

      {/* Country groups */}
      {filteredCountries.map(country => {
        const lodgeList = filteredLodges(country)
        if (lodgeList.length === 0) return null
        const isExpanded = expandedCountry === country || search.trim().length > 0

        return (
          <div key={country} style={{ marginBottom: 8 }}>
            <button
              onClick={() => setExpandedCountry(expandedCountry === country ? null : country)}
              style={{
                display: 'flex', width: '100%', textAlign: 'left',
                padding: '10px 14px', background: 'var(--bg-secondary)',
                border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-md)',
                cursor: 'pointer', alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              <span style={{ fontWeight: 500, fontSize: 14 }}>
                {country}
                <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
                  {lodgeList.length} lodge{lodgeList.length !== 1 ? 's' : ''}
                </span>
              </span>
              <span style={{
                fontSize: 10, color: 'var(--text-muted)', transition: 'transform 0.15s',
                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
              }}>▾</span>
            </button>

            {isExpanded && (
              <div style={{ border: '0.5px solid var(--border-default)', borderTop: 'none', borderRadius: '0 0 var(--radius-md) var(--radius-md)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '8px 14px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, borderBottom: '0.5px solid var(--border-light)' }}>Lodge</th>
                      <th style={{ textAlign: 'left', padding: '8px 14px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, borderBottom: '0.5px solid var(--border-light)' }}>Email</th>
                      <th style={{ textAlign: 'left', padding: '8px 14px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, borderBottom: '0.5px solid var(--border-light)', width: 100 }}>Contact</th>
                      <th style={{ textAlign: 'left', padding: '8px 14px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, borderBottom: '0.5px solid var(--border-light)', width: 60 }}>Ccy</th>
                      <th style={{ textAlign: 'left', padding: '8px 14px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, borderBottom: '0.5px solid var(--border-light)', width: 80 }}>STO</th>
                      <th style={{ textAlign: 'left', padding: '8px 14px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, borderBottom: '0.5px solid var(--border-light)', width: 100 }}>Guide rooms</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lodgeList.map(l => (
                      <tr key={l.id} style={{ borderBottom: '0.5px solid var(--border-light)' }}>
                        <td style={{ padding: '8px 14px', fontSize: 13, fontWeight: 500 }}>
                          {l.name}
                          {l.status && l.status !== 'Active' && (
                            <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>{l.status}</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 14px', fontSize: 12 }}>
                          {l.email ? (
                            <a href={'mailto:' + l.email} style={{ color: 'var(--blue-text)' }}>{l.email}</a>
                          ) : '—'}
                          {l.email2 && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              <a href={'mailto:' + l.email2} style={{ color: 'var(--text-muted)' }}>{l.email2}</a>
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>{l.contact || '—'}</td>
                        <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-muted)' }}>{l.currency || '—'}</td>
                        <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-muted)' }}>{l.sto_discount || '—'}</td>
                        <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-muted)' }}>{l.guide_room_policy || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}

      {filteredCountries.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)' }}>
          No lodges match your search.
        </div>
      )}
    </div>
  )
}
