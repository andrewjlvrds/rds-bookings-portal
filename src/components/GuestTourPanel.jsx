import React from 'react'
import Guests from './Guests'
import { fmtDateFull } from '../utils/helpers'

/*
 * GuestTourPanel — per-tour guest view.
 *
 * Category tabs (Transfers, Excursions, Accommodation, Payments, Bikes,
 * Guest Info) were removed because the Guests component doesn't currently
 * slice by subView — it just retitles the page, so every category tab
 * rendered an identical list. Rebuild once we've designed what each
 * category view should actually show.
 */
export default function GuestTourPanel({ tour, tours }) {
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 18, fontWeight: 500, letterSpacing: -0.2 }}>{tour.name}</h1>
        {tour.departure_date && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            Departs {fmtDateFull(tour.departure_date)}
            {tour.end_date ? '  ·  returns ' + fmtDateFull(tour.end_date) : ''}
          </div>
        )}
      </div>
      <Guests tours={tours} filterTour={tour.name} />
    </div>
  )
}
