import React, { useState, useEffect, Component } from 'react'
import Layout from './components/Layout'
import Dashboard from './components/Dashboard'
import Itinerary from './components/Itinerary'
import ItineraryEditor from './components/ItineraryEditor'
import EnquiryPreview from './components/EnquiryPreview'
import Payments from './components/Payments'
import LodgeDetail from './components/LodgeDetail'
import GettingStarted from './components/GettingStarted'
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
  const [activeView, setActiveView] = useState('dashboard')
  const [activeBooking, setActiveBooking] = useState(null)

  // Refresh data from API without losing current view
  const refreshData = (keepTourId) => {
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
          if (freshTour) setActiveTour(freshTour)
        }
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

  // Local draft tours stored in localStorage
  const LOCAL_TOURS_KEY = 'rds_local_tours'
  const getLocalTours = () => {
    try { return JSON.parse(localStorage.getItem(LOCAL_TOURS_KEY) || '[]') } catch (e) { return [] }
  }
  const saveLocalTours = (list) => localStorage.setItem(LOCAL_TOURS_KEY, JSON.stringify(list))

  const handleCreateTour = async ({ name, departure_date, tour_type }) => {
    // Save locally — no Zoho write yet
    const localTour = {
      id: 'local_' + Date.now(),
      name: name,
      departure_date: departure_date,
      start_date: departure_date,
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
    setActiveView('itinerary')
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
      return (
        <LodgeDetail
          booking={activeBooking}
          tour={activeTour}
          lodges={lodges}
          onBack={() => { setActiveBooking(null); setActiveView('itinerary') }}
          onRefresh={() => refreshData(activeTour ? activeTour.id : null)}
        />
      )
    }

    if (activeView === 'payments') {
      return <Payments allBookings={allBookings} tours={tours} onSelectBooking={handleSelectBooking} onRefresh={() => refreshData()} />
    }

    if (activeView === 'getting-started') {
      return <GettingStarted onSelectView={setActiveView} />
    }

    if (activeTour && activeView === 'enquiry-preview') {
      return (
        <EnquiryPreview
          tour={activeTour}
          lodges={lodges}
          onBack={() => setActiveView('itinerary')}
          onRefresh={() => refreshData(activeTour.id)}
        />
      )
    }

    if (activeTour && activeView === 'edit-itinerary') {
      return (
        <ItineraryEditor
          tour={activeTour}
          lodges={lodges}
          onBack={() => setActiveView('itinerary')}
          onSave={() => {
            setActiveView('itinerary')
            refreshData(activeTour.id)
          }}
        />
      )
    }

    if (activeTour && activeView === 'itinerary') {
      return (
        <Itinerary
          tour={activeTour}
          lodges={lodges}
          onSelectBooking={handleSelectBooking}
          onEditItinerary={() => setActiveView('edit-itinerary')}
          onDeleteTour={() => handleDeleteTour(activeTour.id, activeTour.name)}
          onEnquireReady={() => setActiveView('enquiry-preview')}
          onRefresh={() => refreshData(activeTour.id)}
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
