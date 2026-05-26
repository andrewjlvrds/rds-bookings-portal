import React, { useState, useEffect, Component } from 'react'
import Layout from './components/Layout'
import Dashboard from './components/Dashboard'
import ItineraryEditor from './components/ItineraryEditor'
import EnquiryPreview from './components/EnquiryPreview'
import Payments from './components/Payments'
import LodgeDetail from './components/LodgeDetail'
import TourPanel from './components/TourPanel'
import GettingStarted from './components/GettingStarted'
import Lodges from './components/Lodges'
import Transfers from './components/Transfers'
import Guests from './components/Guests'
import GuestDashboard from './components/GuestDashboard'
import GuestTourPanel from './components/GuestTourPanel'
import PlannerDashboard from './components/PlannerDashboard'
import NewTour from './components/NewTour'
import Inbox from './components/Inbox'
import ActivityLog from './components/ActivityLog'
import GmailImport from './components/GmailImport'
import './styles/global.css'

const API = ''

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    console.error('Portal error:', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
          <h2 style={{ color: '#A32D2D', marginBottom: 8 }}>Something went wrong</h2>
          <pre style={{ fontSize: 13, color: '#5F5E5A', whiteSpace: 'pre-wrap' }}>
            {this.state.error && this.state.error.toString()}
          </pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: 16, padding: '8px 16px', cursor: 'pointer' }}>
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const [tours, setTours] = useState([])
  const [allBookings, setAllBookings] = useState([])
  const [lodges, setLodges] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [activeTour, setActiveTour] = useState(null)
  const [activeView, setActiveView] = useState('lodge-dashboard')
  const [activeBooking, setActiveBooking] = useState(null)
  // When a user opens LodgeDetail from inside the TourPanel, remember which
  // tab they came from so the Back button returns them there.
  const [returnToTourTab, setReturnToTourTab] = useState('itinerary')
  // Track where Helen navigated to LodgeDetail FROM — Inbox or Tour panel.
  // Drives the Back button label and destination.
  const [lodgeDetailOrigin, setLodgeDetailOrigin] = useState('tour-panel')
  // When she opens LodgeDetail by clicking a specific email (e.g. from
  // Inbox), pass the email ID through so LodgeDetail can auto-expand
  // and scroll to that email instead of dropping her on a list of 13.
  const [focusEmailId, setFocusEmailId] = useState(null)

  // Shared (Helen + Andrew) email read-state. Loaded from /api/email-read-state
  // on mount. Map of { emailId: readAtISO }. Mutations write through to the
  // server but optimistically update local state first.
  const [readState, setReadState] = useState({})

  // Inbox data — held at App level so navigating away and back
  // doesn't refetch every time. Also refreshed proactively after
  // any mark-read action so the sidebar badge stays accurate.
  // Also fetches activity-log waiting entries (for Replies received tab).
  const [inboxData, setInboxData] = useState(null)
  const [inboxReadyToMarkDone, setInboxReadyToMarkDone] = useState([])
  const [inboxFetchedAt, setInboxFetchedAt] = useState(0)
  const [inboxLoading, setInboxLoading] = useState(false)
  const [inboxError, setInboxError] = useState(null)

  // Sidebar badge reads directly from inboxData.stats — that way
  // optimistic updates in the Inbox component (e.g. dismiss) propagate
  // to the badge without an extra refetch.
  const inboxStats = inboxData?.stats || { unread: 0, unmatched: 0, tour_bucket: 0 }
  const [unreadCounts, setUnreadCounts] = useState(null) // { [bookingId]: number }

  const fetchInboxStats = (force) => {
    // Skip refetch if we already have fresh data, unless force=true
    if (!force && inboxFetchedAt && Date.now() - inboxFetchedAt < 30000) return Promise.resolve()
    setInboxLoading(true)
    setInboxError(null)
    return Promise.all([
      fetch(API + '/api/inbox').then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load inbox'))),
      fetch(API + '/api/activity-log?status=waiting').then(r => r.ok ? r.json() : { entries: [] }),
    ])
      .then(([inboxResp, logResp]) => {
        setInboxData(inboxResp)
        setInboxReadyToMarkDone((logResp.entries || []).filter(e => e.reply_received_at))
        setInboxFetchedAt(Date.now())
        setInboxLoading(false)
      })
      .catch(err => {
        setInboxError(err.message)
        setInboxLoading(false)
      })
  }

  // Explicit "Mark done / Mark replied" — clears unread count for a booking.
  // Not triggered automatically on open — user must click.
  const markBookingDone = (bookingId) => {
    if (!bookingId) return
    try {
      localStorage.setItem('rds_last_read_' + bookingId, new Date().toISOString())
    } catch (e) {}
    setUnreadCounts(prev => prev ? { ...prev, [bookingId]: 0 } : prev)
  }

  const markRead = (emailId) => {
    if (!emailId) return
    setReadState(prev => ({ ...prev, [emailId]: new Date().toISOString() }))
    // Optimistically update inbox stats too — the badge in the sidebar
    // and the count in the Inbox header reflect this immediately.
    // The Inbox component handles row removal via onLocalUpdate.
    fetch('/api/email-read-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email_id: emailId, read: true }),
    })
      .catch(err => console.error('markRead failed:', err))
    // No force-refetch here — the optimistic local update is the source
    // of truth until the next natural inbox load. Re-fetching here can
    // race with the optimistic update and re-introduce just-dismissed
    // emails because of blob CDN propagation delay.
  }

  const markManyRead = (emailIds) => {
    if (!Array.isArray(emailIds) || emailIds.length === 0) return
    const stamp = new Date().toISOString()
    setReadState(prev => {
      const next = { ...prev }
      emailIds.forEach(id => { if (id) next[id] = stamp })
      return next
    })
    fetch('/api/email-read-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email_ids: emailIds }),
    })
      .catch(err => console.error('markManyRead failed:', err))
    // Same reasoning as markRead — no force-refetch.
  }

  // Refresh data from API without losing current view
  // Fetch blob-based unread counts for all bookings
  const fetchUnreadCounts = async (bookings) => {
    if (!bookings || !bookings.length) return
    const lastReadAt = {}
    bookings.forEach(b => {
      const id = b.id || b['Record Id']
      if (!id) return
      try {
        const stored = localStorage.getItem('rds_last_read_' + id)
        if (stored) lastReadAt[id] = stored
      } catch (e) {}
    })
    try {
      const ids = bookings.map(b => b.id || b['Record Id']).filter(Boolean)
      const r = await fetch('/api/unread-counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_ids: ids, last_read_at: lastReadAt }),
      })
      const d = await r.json()
      if (d.counts) setUnreadCounts(d.counts)
    } catch (e) {
      console.error('unread-counts fetch failed:', e)
    }
  }

  const refreshData = (keepTourId, retriesLeft = 3) => {
    fetch(API + '/api/bp-data')
      .then(r => {
        if (!r.ok) throw new Error('API returned ' + r.status)
        return r.json()
      })
      .then(d => {
        const tourList = d.tours || []

        // Merge local draft tours
        const localTours = getLocalTours()
        const zohoIds = new Set(tourList.map(t => t.id))
        localTours.forEach(lt => {
          if (!zohoIds.has(lt.id)) tourList.push(lt)
        })

        setTours(tourList)
        setLodges(d.lodges || [])
        const all = []
        tourList.forEach(t => { all.push(...(t.bookings || [])) })
        setAllBookings(all)

        if (keepTourId) {
          const freshTour = tourList.find(t => t.id === keepTourId)
          if (freshTour) {
            setActiveTour(freshTour)
          } else if (retriesLeft > 0) {
            // Newly-created Zoho records can take a moment to become queryable.
            // Retry once or twice before giving up.
            setTimeout(() => refreshData(keepTourId, retriesLeft - 1), 1500)
          }
        }

        // Fetch blob-based unread counts after bookings loaded
        fetchUnreadCounts(all)
      })
      .catch(err => console.error('Refresh error:', err))
  }

  useEffect(() => {
    fetch(API + '/api/bp-data')
      .then(r => {
        if (!r.ok) throw new Error('API returned ' + r.status)
        return r.json()
      })
      .then(d => {
        console.log('API data loaded:', d.total_tours, 'tours,', d.total_bookings, 'bookings,', (d.lodges || []).length, 'lodges')
        const tourList = d.tours || []

        // Merge local draft tours (not yet in Zoho)
        const localTours = getLocalTours()
        const zohoIds = new Set(tourList.map(t => t.id))
        localTours.forEach(lt => {
          if (!zohoIds.has(lt.id)) tourList.push(lt)
        })

        setTours(tourList)
        setLodges(d.lodges || [])
        const all = []
        tourList.forEach(t => { all.push(...(t.bookings || [])) })
        setAllBookings(all)
        setLoading(false)
        fetchUnreadCounts(all)
      })
      .catch(err => {
        console.error('API error:', err)
        setError(err.message)
        setLoading(false)
      })

    // Read-state runs in parallel — don't gate the rest of the UI on it.
    fetch(API + '/api/email-read-state')
      .then(r => r.ok ? r.json() : { state: {} })
      .then(d => setReadState(d.state || {}))
      .catch(err => console.error('Read-state load failed:', err))

    // Inbox stats — small payload, refreshed on portal open and after
    // any mark-read action.
    fetchInboxStats()
  }, [])

  const handleSelectTour = (tour) => {
    setActiveTour(tour)
    setActiveBooking(null)
    // Layout handles routing to tour-panel vs guest-tour based on section
    // This is the fallback for programmatic calls
    setActiveView('tour-panel')
  }

  const [focusTab, setFocusTab] = useState(null)

  const handleSelectBooking = (bk, fromTab, opts) => {
    setActiveBooking(bk)
    if (fromTab) setReturnToTourTab(fromTab)
    if (opts && opts.origin) setLodgeDetailOrigin(opts.origin)
    else setLodgeDetailOrigin('tour-panel')
    setFocusEmailId(opts && opts.focusEmailId ? opts.focusEmailId : null)
    setFocusTab(opts && opts.focusTab ? opts.focusTab : null)
    setActiveView('lodge-detail')
    // Do NOT auto-mark as read on open — user must explicitly mark done
  }

  // Refresh unread counts every 10 minutes (in sync with poll-gmail cron)
  useEffect(() => {
    if (!allBookings.length) return
    const interval = setInterval(() => fetchUnreadCounts(allBookings), 10 * 60 * 1000)
    return () => clearInterval(interval)
  }, [allBookings])

  // Local draft tours stored in localStorage
  const LOCAL_TOURS_KEY = 'rds_local_tours'
  const getLocalTours = () => {
    try { return JSON.parse(localStorage.getItem(LOCAL_TOURS_KEY) || '[]') } catch (e) { return [] }
  }
  const saveLocalTours = (list) => localStorage.setItem(LOCAL_TOURS_KEY, JSON.stringify(list))

  const handleCreateTour = async ({ name, departure_date, end_date, tour_type }) => {
    // Save locally — no Zoho write yet
    const localTour = {
      id: 'local_' + Date.now(),
      name: name,
      departure_date: departure_date,
      start_date: departure_date,
      end_date: end_date || null,
      tour_type: tour_type,
      tour_status: 'Draft',
      local: true,
      bookings: [],
      guide_rooms: 3,
      pax_single: 8,
      pax_twin: 2,
      pax_double: 1,
      num_riders: 12,
      max_guests: 12,
    }
    const localTours = getLocalTours()
    localTours.push(localTour)
    saveLocalTours(localTours)

    // Add to state immediately
    setTours(prev => [...prev, localTour])
    setActiveTour(localTour)
    setActiveView('tour-panel')
  }

  const handleDeleteTour = async (tourId, tourName) => {
    if (!confirm('Delete "' + tourName + '"? This removes the tour from Zoho. Lodge bookings linked to this tour will become unassigned.')) return
    const response = await fetch(API + '/api/delete-tour?id=' + tourId, { method: 'DELETE' })
    if (!response.ok) {
      const err = await response.json()
      alert('Error: ' + (err.error || 'Failed to delete'))
      return
    }
    setActiveTour(null)
    setActiveView('dashboard')
    refreshData()
  }

  const renderContent = () => {
    if (loading) {
      return (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading bookings...
        </div>
      )
    }

    if (error) {
      return (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ color: 'var(--red-text)', marginBottom: 8 }}>Error loading data: {error}</div>
          <button className="btn" onClick={() => window.location.reload()}>Retry</button>
        </div>
      )
    }

    if (activeView === 'lodge-detail' && activeBooking) {
      const backToInbox = lodgeDetailOrigin === 'inbox'
      const backLabel = backToInbox ? 'Back to inbox' : ('Back to ' + (activeTour ? activeTour.name : 'itinerary'))
      return (
        <LodgeDetail
          booking={activeBooking}
          tour={activeTour}
          tours={tours}
          lodges={lodges}
          onBack={() => {
            setActiveBooking(null)
            setFocusEmailId(null)
            setActiveView(backToInbox ? 'inbox' : 'tour-panel')
          }}
          backLabel={backLabel}
          focusEmailId={focusEmailId}
          focusTab={focusTab}
          onRefresh={() => refreshData(activeTour ? activeTour.id : null)}
          readState={readState}
          onMarkRead={markRead}
          onMarkBookingDone={markBookingDone}
        />
      )
    }

    if (activeView === 'inbox') {
      return (
        <Inbox
          tours={tours}
          allBookings={allBookings}
          lodges={lodges}
          data={inboxData}
          readyToMarkDone={inboxReadyToMarkDone}
          loading={inboxLoading}
          error={inboxError}
          onRefresh={() => fetchInboxStats(true)}
          ensureFresh={() => fetchInboxStats(false)}
          onLocalUpdate={(updater) => setInboxData(prev => prev ? updater(prev) : prev)}
          onLocalReadyDoneUpdate={(updater) => setInboxReadyToMarkDone(updater)}
          onSelectBooking={(bk, emailId) => handleSelectBooking(bk, 'correspondence', { origin: 'inbox', focusEmailId: emailId })}
          onMarkRead={markRead}
          onMarkManyRead={markManyRead}
        />
      )
    }

    if (activeView === 'activity-log') {
      return (
        <ActivityLog
          tours={tours}
          allBookings={allBookings}
          onSelectBooking={(bk) => handleSelectBooking(bk, 'correspondence')}
        />
      )
    }

    if (activeView === 'gmail-import') {
      return <GmailImport tours={tours} />
    }

    if (activeView === 'payments') {
      return <Payments allBookings={allBookings} tours={tours} onSelectBooking={handleSelectBooking} onRefresh={() => refreshData()} />
    }

    if (activeView === 'lodge-dashboard') {
      return (
        <Dashboard
          tours={tours}
          allBookings={allBookings}
          onSelectTour={(tour) => { setActiveTour(tour); setActiveView('tour-panel') }}
          onSelectView={setActiveView}
          onSelectBooking={handleSelectBooking}
        />
      )
    }

    if (activeView === 'getting-started') {
      return <GettingStarted onSelectView={setActiveView} />
    }

    if (activeView === 'lodges') {
      return <Lodges lodges={lodges} onRefresh={() => refreshData()} />
    }

    if (activeView === 'transfers') {
      return <Transfers tours={tours} />
    }

    if (activeView === 'guest-dashboard' || activeView === 'guests') {
      return (
        <GuestDashboard tours={tours} onSelectView={setActiveView} onSelectTour={(tour) => { setActiveTour(tour); setActiveView('guest-tour') }} />
      )
    }

    if (activeTour && activeView === 'guest-tour') {
      return <GuestTourPanel tour={activeTour} tours={tours} />
    }

    if (activeView === 'guest-excursions') {
      return <Guests tours={tours} subView="excursions" />
    }

    if (activeView === 'guest-accommodation') {
      return <Guests tours={tours} subView="accommodation" />
    }

    if (activeView === 'guest-payments') {
      return <Guests tours={tours} subView="payments" />
    }

    if (activeView === 'guest-bikes') {
      return <Guests tours={tours} subView="bikes" />
    }

    if (activeView === 'guest-info') {
      return <Guests tours={tours} subView="info" />
    }

    if (activeTour && activeView === 'enquiry-preview') {
      return (
        <EnquiryPreview
          tour={activeTour}
          lodges={lodges}
          onBack={() => setActiveView('tour-panel')}
          onRefresh={() => refreshData(activeTour.id)}
        />
      )
    }

    if (activeTour && activeView === 'edit-itinerary') {
      return (
        <ItineraryEditor
          tour={activeTour}
          lodges={lodges}
          onBack={() => setActiveView('tour-panel')}
          onUpdateTour={(updates) => setActiveTour(prev => ({ ...prev, ...updates }))}
          onSave={(result) => {
            // If this was a local tour that just got pushed to Zoho, the id has changed.
            // Refresh against the new Zoho id so activeTour reflects the real record.
            const freshId = (result && result.tour_id) || activeTour.id
            setActiveView('tour-panel')
            refreshData(freshId)
          }}
        />
      )
    }

    if (activeTour && activeView === 'tour-panel') {
      return (
        <TourPanel
          tour={activeTour}
          lodges={lodges}
          tours={tours}
          initialTab={returnToTourTab}
          onSelectBooking={handleSelectBooking}
          onEditItinerary={() => setActiveView('edit-itinerary')}
          onDeleteTour={() => handleDeleteTour(activeTour.id, activeTour.name)}
          onEnquireReady={() => setActiveView('enquiry-preview')}
          onRefresh={() => refreshData(activeTour.id)}
          onBack={() => { setActiveTour(null); setActiveView('dashboard') }}
        />
      )
    }

    // Legacy itinerary route — keep for back-compat but also render inside TourPanel
    if (activeTour && activeView === 'itinerary') {
      return (
        <TourPanel
          tour={activeTour}
          lodges={lodges}
          tours={tours}
          initialTab="itinerary"
          onSelectBooking={handleSelectBooking}
          onEditItinerary={() => setActiveView('edit-itinerary')}
          onDeleteTour={() => handleDeleteTour(activeTour.id, activeTour.name)}
          onBack={() => { setActiveTour(null); setActiveView('dashboard') }}
          onEnquireReady={() => setActiveView('enquiry-preview')}
          onRefresh={() => refreshData(activeTour.id)}
        />
      )
    }

    if (activeView === 'new-tour') {
      const pendingTemplate = (() => { try { return localStorage.getItem('rds_pending_template') || '' } catch(e) { return '' } })()
      return (
        <NewTour
          onCreate={handleCreateTour}
          onCancel={() => { try { localStorage.removeItem('rds_pending_template') } catch(e) {} setActiveView('dashboard') }}
          initialTemplate={pendingTemplate}
        />
      )
    }

    return (
      <PlannerDashboard
        tours={tours}
        onSelectTour={(tour) => { setActiveTour(tour); setActiveView('itinerary') }}
        onSelectView={setActiveView}
        onSelectTemplate={(key) => {
          try { localStorage.setItem('rds_pending_template', key) } catch(e) {}
          setActiveView('new-tour')
        }}
      />
    )
  }

  return (
    <ErrorBoundary>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" />
      <Layout
        tours={tours}
        activeTour={activeTour}
        onSelectTour={handleSelectTour}
        activeView={activeView}
        onSelectView={setActiveView}
        onCreateTour={handleCreateTour}
        inboxStats={inboxStats}
        unreadCounts={unreadCounts}
      >
        {renderContent()}
      </Layout>
    </ErrorBoundary>
  )
}
