import React, { useState } from 'react'

export default function GettingStarted({ onSelectView }) {
  const [expanded, setExpanded] = useState(null)

  const toggle = (id) => setExpanded(expanded === id ? null : id)

  return (
    <div style={{ maxWidth: 800 }}>
      <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4 }}>Welcome to RDS Lodge Bookings</h1>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.6 }}>
        This portal manages the full lodge booking workflow for Ride Down South tours — from building itineraries to sending enquiries, tracking payments, and managing correspondence.
      </p>

      {/* Quick links */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 32 }}>
        <QuickLink
          title="Dashboard"
          desc="Tour overview, payment alerts, needs attention"
          onClick={() => onSelectView('dashboard')}
        />
        <QuickLink
          title="Payments"
          desc="Track deposits, due dates, mark as paid"
          onClick={() => onSelectView('payments')}
        />
        <QuickLink
          title="Create a tour"
          desc="Add a new tour and build its itinerary"
          onClick={() => onSelectView('dashboard')}
        />
        <QuickLink
          title="Correspondence"
          desc="Browse lodge emails by tour, AI summaries"
          onClick={() => onSelectView('correspondence')}
        />
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 500, marginBottom: 14 }}>How it works</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 32 }}>
        <StepCard
          num="1"
          title="Create a tour"
          expanded={expanded === 1}
          onClick={() => toggle(1)}
          body={`Click the + button next to "New tours" in the sidebar. Give it a name (e.g. "FoSA Sep 27"), a departure date, and a tour type.

The tour starts as a local draft until you push it to Zoho CRM.`}
        />
        <StepCard
          num="2"
          title="Build the itinerary"
          expanded={expanded === 2}
          onClick={() => toggle(2)}
          body={`Click "Edit itinerary" on the tour page. You can:
• Start from a template (FoSA 20-day, EoA 14-day, or custom)
• Load existing bookings from Zoho
• Build from scratch — add nights manually

Each night has: day number, date, route, km, lodge name, backup lodge, meals, and notes. The portal auto-matches lodge names against the Lodges directory for email addresses and contact info.`}
        />
        <StepCard
          num="3"
          title="Send enquiries"
          expanded={expanded === 3}
          onClick={() => toggle(3)}
          body={`When lodges are marked "Ready to Send", click "Mark all ready" to prepare them, then use the enquiry preview to review and send emails.

Emails go from bookings@ridedownsouth.com via Gmail API. Each email includes the RDS booking reference and requests the lodge to quote it in replies. You can toggle the sender between Andrew Vaughan and Helen Baker.

Namibian lodges automatically get the Foreign Tour Operator number (FOR01225) in the footer.`}
        />
        <StepCard
          num="4"
          title="Track responses & correspondence"
          expanded={expanded === 4}
          onClick={() => toggle(4)}
          body={`The Correspondence tab lets you browse all lodge emails organised by tour and lodge.

How it works:
• When you send an enquiry, the portal auto-creates Gmail labels: TourName/LodgeName (e.g. "FoSA Apr 27/Hohewarte")
• When lodges reply, poll-gmail matches the reply to the booking and labels it under the same tour/lodge
• Tour buttons are colour-coded by year: blue = 2026, purple = 2027, amber = 2028
• Click a tour to see its lodges, click a lodge to filter to that conversation

AI features:
• Claude AI parses lodge replies to extract availability, rates, deposit amounts, payment due dates, and cancellation terms — these are written back to Zoho automatically
• Click "Summarise" on any lodge conversation to get an AI-generated summary of the full email thread — booking status, key terms, and next actions needed

You can also check for replies from individual booking detail views using "Check for replies".`}
        />
        <StepCard
          num="5"
          title="Manage payments"
          expanded={expanded === 5}
          onClick={() => toggle(5)}
          body={`The Payments tab shows all deposit and balance payments across tours, sorted by urgency.

• Overdue payments are highlighted in red
• "Due soon" shows payments due within 7 days
• Click "Paid" to mark a payment as done — this writes the paid date and amount to Zoho and updates the booking status

The AI parser also detects payment confirmation emails from lodges and auto-fills paid dates.`}
        />
        <StepCard
          num="6"
          title="Lodge detail view"
          expanded={expanded === 6}
          onClick={() => toggle(6)}
          body={`Click "View" on any booking to see the full lodge detail — booking info, tour details, payment schedule (all 4 slots), pax info, excursion details, notes, and the full email thread.

You can:
• Edit any field inline (click a value to edit)
• Search Gmail for existing correspondence with that lodge
• Link relevant emails to the booking
• Reply directly from the portal
• Change booking status`}
        />
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 500, marginBottom: 14 }}>Key concepts</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 32 }}>
        <InfoCard
          title="Local drafts vs Zoho"
          expanded={expanded === 'drafts'}
          onClick={() => toggle('drafts')}
          body={`Tours and itineraries are saved locally in your browser first. Nothing touches Zoho until you explicitly "Push to Zoho". This means you can experiment freely without affecting live data.

Draft tours show an orange "draft" badge. Once pushed, they become full Zoho records.`}
        />
        <InfoCard
          title="RDS booking references"
          expanded={expanded === 'refs'}
          onClick={() => toggle('refs')}
          body={`Each booking gets a reference like RDS-FoSA-Mar26-CanyonVillage-26/04/03. This is included in all outgoing emails and used to match incoming replies to the right booking.`}
        />
        <InfoCard
          title="Lodge directory"
          expanded={expanded === 'lodges'}
          onClick={() => toggle('lodges')}
          body={`The portal pulls lodge info (email, contact, country, currency, STO discount, guide room policy) from the Lodges module in Zoho. When you type a lodge name in the itinerary editor, it fuzzy-matches against this directory to find email addresses for enquiries.`}
        />
        <InfoCard
          title="AI email parsing"
          expanded={expanded === 'ai'}
          onClick={() => toggle('ai')}
          body={`Lodge replies are parsed by Claude AI to extract structured data — availability, rates, payment terms, cancellation policy. Only medium-to-high confidence extractions are written to Zoho automatically. Low-confidence items are flagged for manual review.

The AI also detects payment confirmations (receipts) and auto-fills the paid date and amount on the correct payment slot.

In the Correspondence tab, you can click "Summarise" on any lodge conversation to get a full thread summary — booking status, rates quoted, deposit terms, and what action is needed next.`}
        />
        <InfoCard
          title="Gmail labels & correspondence"
          expanded={expanded === 'gmail'}
          onClick={() => toggle('gmail')}
          body={`The portal organises all lodge emails using Gmail labels in a TourName/LodgeName structure (e.g. "FoSA Apr 27/Hohewarte"). Labels are created automatically when enquiries are sent, and incoming replies are matched and labelled under the same tour/lodge.

The Correspondence tab shows all tours as filter buttons with year-colour coding. Click a tour to see its lodge sub-labels, and click a lodge to view just that conversation. Legacy labels from the old INBOX/ structure are also visible.

This means you can browse correspondence both in the portal and directly in Gmail — the labels work the same way in both.`}
        />
        <InfoCard
          title="50-field limit"
          expanded={expanded === 'fields'}
          onClick={() => toggle('fields')}
          body={`Zoho CRM has a 50-field limit per API request. The portal carefully manages which fields are fetched to stay within this limit. If you add custom fields in Zoho, you may need to swap out less-used fields in the code.`}
        />
      </div>

      <div style={{ padding: 20, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text-primary)' }}>Need help?</strong> This portal is built and maintained by Andrew. Reach out if something isn't working or if you need a new feature. The codebase is at github.com/andrewjlvrds/rds-bookings-portal.
      </div>
    </div>
  )
}

function QuickLink({ title, desc, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', textAlign: 'left', padding: '14px 16px',
        border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-primary)', cursor: 'pointer', transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--blue-mid)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)' }}
    >
      <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{desc}</div>
    </button>
  )
}

function StepCard({ num, title, expanded, onClick, body }) {
  return (
    <div style={{
      border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-md)',
      overflow: 'hidden', background: 'var(--bg-primary)',
    }}>
      <button
        onClick={onClick}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, width: '100%',
          textAlign: 'left', padding: '12px 16px', background: 'transparent',
          border: 'none', cursor: 'pointer',
        }}
      >
        <span style={{
          width: 28, height: 28, borderRadius: '50%', background: 'var(--blue-bg)',
          color: 'var(--blue-text)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 600, flexShrink: 0,
        }}>{num}</span>
        <span style={{ fontWeight: 500, fontSize: 14, flex: 1 }}>{title}</span>
        <span style={{
          fontSize: 10, color: 'var(--text-muted)', transition: 'transform 0.15s',
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
        }}>▾</span>
      </button>
      {expanded && (
        <div style={{
          padding: '0 16px 14px 56px', fontSize: 13, lineHeight: 1.7,
          color: 'var(--text-secondary)', whiteSpace: 'pre-line',
        }}>
          {body}
        </div>
      )}
    </div>
  )
}

function InfoCard({ title, expanded, onClick, body }) {
  return (
    <div style={{
      border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-md)',
      overflow: 'hidden', background: 'var(--bg-primary)',
    }}>
      <button
        onClick={onClick}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, width: '100%',
          textAlign: 'left', padding: '12px 16px', background: 'transparent',
          border: 'none', cursor: 'pointer',
        }}
      >
        <span style={{ fontWeight: 500, fontSize: 14, flex: 1 }}>{title}</span>
        <span style={{
          fontSize: 10, color: 'var(--text-muted)', transition: 'transform 0.15s',
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
        }}>▾</span>
      </button>
      {expanded && (
        <div style={{
          padding: '0 16px 14px 16px', fontSize: 13, lineHeight: 1.7,
          color: 'var(--text-secondary)', whiteSpace: 'pre-line',
        }}>
          {body}
        </div>
      )}
    </div>
  )
}
