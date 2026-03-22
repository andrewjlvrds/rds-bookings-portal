import React, { useState, useEffect, Component } from 'react'
import Layout from './components/Layout'
import Dashboard from './components/Dashboard'
import Itinerary from './components/Itinerary'
import ItineraryEditor from './components/ItineraryEditor'
import Payments from './components/Payments'
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [activeTour, setActiveTour] = useState(null)
  const [activeView, setActiveView] = useState('dashboard')
  const [activeBooking, setActiveBooking] = useState(null)

  useEffect(() => {
    fetch(API + '/api/bp-data')
      .then(r => {
        if (!r.ok) throw new Error('API returned ' + r.status)
        return r.json()
      })
      .then(d => {
        console.log('API data loaded:', d.total_tours, 'tours,', d.total_bookings, 'bookings')
        const tourList = d.tours || []
        setTours(tourList)
        const all = []
        tourList.forEach(t => { all.push(...(t.bookings || [])) })
        setAllBookings(all)
        setLoading(false)
      })
      .catch(err => {
        console.error('API error:', err)
        setError(err.message)
        setLoading(false)
      })
  }, [])

  const handleSelectTour = (tour) => {
    setActiveTour(tour)
    setActiveBooking(null)
    setActiveView('itinerary')
  }

  const handleSelectBooking = (bk) => {
    setActiveBooking(bk)
    setActiveView('lodge-detail')
  }

  const handleCreateTour = async ({ name, departure_date, tour_type }) => {
    const response = await fetch(API + '/api/create-tour', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, departure_date, tour_type }),
    })
    if (!response.ok) {
      const err = await response.json()
      throw new Error(err.error || 'Failed to create tour')
    }
    window.location.reload()
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
    window.location.reload()
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
      return (
        <div>
          <button
            onClick={() => { setActiveBooking(null); setActiveView('itinerary') }}
            style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              fontSize: 13, padding: '0 0 12px', cursor: 'pointer',
            }}
          >
            ← Back to {activeTour ? activeTour.name : 'itinerary'}
          </button>
          <div style={{ padding: 20, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', textAlign: 'center', color: 'var(--text-muted)' }}>
            Lodge detail view — coming next
          </div>
        </div>
      )
    }

    if (activeView === 'payments') {
      return <Payments allBookings={allBookings} tours={tours} />
    }

    if (activeTour && activeView === 'edit-itinerary') {
      return (
        <ItineraryEditor
          tour={activeTour}
          onBack={() => setActiveView('itinerary')}
          onSave={() => {
            setActiveView('itinerary')
            // Reload data
            window.location.reload()
          }}
        />
      )
    }

    if (activeTour && activeView === 'itinerary') {
      return (
        <Itinerary
          tour={activeTour}
          onSelectBooking={handleSelectBooking}
          onEditItinerary={() => setActiveView('edit-itinerary')}
          onDeleteTour={() => handleDeleteTour(activeTour.id, activeTour.name)}
        />
      )
    }

    return (
      <Dashboard
        tours={tours}
        allBookings={allBookings}
        onSelectTour={handleSelectTour}
        onSelectView={setActiveView}
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
      >
        {renderContent()}
      </Layout>
    </ErrorBoundary>
  )
}
