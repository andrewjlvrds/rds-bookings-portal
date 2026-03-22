import React, { useState, useEffect } from 'react'
import Layout from './components/Layout'
import Dashboard from './components/Dashboard'
import Itinerary from './components/Itinerary'
import Payments from './components/Payments'
import './styles/global.css'

const API = ''

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
      .then(r => r.json())
      .then(d => {
        const tourList = d.tours || []
        setTours(tourList)
        const all = []
        tourList.forEach(t => { all.push(...(t.bookings || [])) })
        setAllBookings(all)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  const handleSelectTour = (tour) => {
    setActiveTour(tour)
    setActiveBooking(null)
  }

  const handleSelectBooking = (bk) => {
    setActiveBooking(bk)
    setActiveView('lodge-detail')
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
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--red-text)' }}>
          Error loading data: {error}
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

    if (activeTour && activeView === 'itinerary') {
      return <Itinerary tour={activeTour} onSelectBooking={handleSelectBooking} />
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
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" />
      <Layout
        tours={tours}
        activeTour={activeTour}
        onSelectTour={handleSelectTour}
        activeView={activeView}
        onSelectView={setActiveView}
      >
        {renderContent()}
      </Layout>
    </>
  )
}
