import React, { useState } from 'react'
import { getStatus, fmtDate } from '../utils/helpers'
import { generateSubject, generateEnquiryEmail } from '../utils/emailTemplates'

export default function EnquiryPreview({ tour, onBack }) {
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState({})
  const [excluded, setExcluded] = useState({})

  const bookings = (tour.bookings || [])
    .filter(b => { const s = getStatus(b); return s === 'Ready to send' || s === 'Ready to Send' })
    .sort((a, b) => (a.Check_in_Date || '').localeCompare(b.Check_in_Date || ''))

  // Group bookings by lodge (same lodge, consecutive nights = one email)
  const lodgeGroups = []
  let current = null

  bookings.forEach(bk => {
    const lodge = bk.Lodge_Name || bk.Name || ''
    const email = bk.Email || bk.Lodge_Email || ''

    if (current && current.lodge === lodge) {
      current.bookings.push(bk)
    } else {
      current = {
        lodge,
        email,
        bookings: [bk],
        contactName: bk.Contact_Name || '',
        isReturning: false, // TODO: check lodge history
      }
      lodgeGroups.push(current)
    }
  })

  const toggleExclude = (idx) => {
    setExcluded(prev => ({ ...prev, [idx]: !prev[idx] }))
  }

  const activeGroups = lodgeGroups.filter((_, i) => !excluded[i])

  const handleSendAll = async () => {
    if (!activeGroups.length) return
    setSending(true)

    for (let i = 0; i < lodgeGroups.length; i++) {
      if (excluded[i]) continue
      const group = lodgeGroups[i]

      const subject = generateSubject(group.bookings[0], tour.name)
      const body = generateEnquiryEmail(
        group.bookings, tour.name, group.lodge,
        { contactName: group.contactName, isReturning: group.isReturning, tourConfig: { pax_single: tour.pax_single, pax_twin: tour.pax_twin, pax_double: tour.pax_double, guide_rooms: tour.guide_rooms } }
      )

      try {
        const res = await fetch('/api/send-enquiry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: group.email,
            subject,
            body,
            booking_ids: group.bookings.map(b => b.id || b['Record Id']).filter(Boolean),
            tour_name: tour.name,
            lodge_name: group.lodge,
          }),
        })

        if (res.ok) {
          setSent(prev => ({ ...prev, [i]: 'sent' }))
        } else {
          const err = await res.json()
          setSent(prev => ({ ...prev, [i]: 'error: ' + (err.error || 'failed') }))
        }
      } catch (err) {
        setSent(prev => ({ ...prev, [i]: 'error: ' + err.message }))
      }

      // Delay between sends
      if (i < lodgeGroups.length - 1) {
        await new Promise(r => setTimeout(r, 1000))
      }
    }

    setSending(false)
  }

  const allSent = activeGroups.length > 0 &&
    lodgeGroups.every((_, i) => excluded[i] || sent[i] === 'sent')

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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 500 }}>Review enquiries — {tour.name}</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            {activeGroups.length} email{activeGroups.length !== 1 ? 's' : ''} to send · {bookings.length} bookings
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {allSent ? (
            <button className="btn btn-primary" onClick={onBack}>Done</button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={handleSendAll}
              disabled={sending || !activeGroups.length}
            >
              {sending ? 'Sending...' : 'Send ' + activeGroups.length + ' email' + (activeGroups.length !== 1 ? 's' : '')}
            </button>
          )}
        </div>
      </div>

      {lodgeGroups.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)' }}>
          No bookings marked as "Ready to send". Go back and click "Mark all ready" first.
        </div>
      )}

      {lodgeGroups.map((group, i) => {
        const subject = generateSubject(group.bookings[0], tour.name)
        const body = generateEnquiryEmail(
          group.bookings, tour.name, group.lodge,
          { contactName: group.contactName, isReturning: group.isReturning, tourConfig: { pax_single: tour.pax_single, pax_twin: tour.pax_twin, pax_double: tour.pax_double, guide_rooms: tour.guide_rooms } }
        )
        const isExcluded = excluded[i]
        const status = sent[i]

        return (
          <div
            key={i}
            style={{
              border: '0.5px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              marginBottom: 12,
              opacity: isExcluded ? 0.4 : 1,
              background: status === 'sent' ? 'var(--green-bg)' : 'var(--bg-primary)',
            }}
          >
            {/* Email header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 16px',
              borderBottom: '0.5px solid var(--border-default)',
            }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{group.lodge}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  To: {group.email || 'No email on file'}
                  {' · '}{group.bookings.length} night{group.bookings.length > 1 ? 's' : ''}
                  {' · '}{fmtDate(group.bookings[0].Check_in_Date)} – {fmtDate(group.bookings[group.bookings.length - 1].Check_out_Date)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {status === 'sent' && (
                  <span style={{ fontSize: 12, color: 'var(--green-text)', fontWeight: 500 }}>Sent</span>
                )}
                {status && status.startsWith('error') && (
                  <span style={{ fontSize: 12, color: 'var(--red-text)' }}>{status}</span>
                )}
                {!status && (
                  <button
                    onClick={() => toggleExclude(i)}
                    style={{
                      background: 'none', border: 'none', fontSize: 12,
                      color: 'var(--text-muted)', cursor: 'pointer',
                    }}
                  >
                    {isExcluded ? 'Include' : 'Skip'}
                  </button>
                )}
              </div>
            </div>

            {/* Email preview */}
            {!isExcluded && (
              <div style={{ padding: '12px 16px' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Subject: {subject}
                </div>
                <pre style={{
                  fontSize: 12, lineHeight: 1.6, color: 'var(--text-primary)',
                  whiteSpace: 'pre-wrap', fontFamily: 'var(--font-sans)',
                  margin: 0, padding: '8px 0',
                }}>
                  {body}
                </pre>
              </div>
            )}

            {/* No email warning */}
            {!group.email && !isExcluded && (
              <div style={{
                padding: '8px 16px 12px', fontSize: 12, color: 'var(--amber-text)',
              }}>
                No email address found for this lodge. Add one in Zoho before sending.
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
