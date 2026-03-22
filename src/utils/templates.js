// Tour itinerary templates extracted from completed tours
// These are the baseline lodge sequences that get cloned for new tours

export const TEMPLATES = {
  'fosa-20': {
    name: 'Feast of Southern Africa (20-day)',
    code: 'fosa-20',
    tour_type: 'FoSA 20',
    total_nights: 22, // Day 01 to Day 22 (excludes pre-tour)
    pre_tour_nights: 3,
    source_tour: 'FoSA Mar 26',
    nights: [
      { day: -1, route: 'Pre tour', lodge: 'City Lodge', meals: 'BB', region: 'Cape Town', pre_tour: true },
      { day: 0, route: 'Pre tour', lodge: 'City Lodge', meals: 'BB', region: 'Cape Town', pre_tour: true },
      { day: 0, route: 'Pre tour', lodge: 'City Lodge', meals: 'BB', region: 'Cape Town', pre_tour: true },
      { day: 1, route: 'Arrive Cape Town', lodge: 'City Lodge', meals: 'BB', region: 'Cape Town' },
      { day: 2, route: 'Cape Town to Tulbagh', lodge: 'Tulbagh Hotel', meals: 'BB', region: 'Western Cape', backup: 'Cape Dutch Quarters' },
      { day: 3, route: 'Tulbagh to Papkuilsfontein', lodge: 'Papkuilsfontein', meals: 'BB', region: 'Northern Cape' },
      { day: 4, route: 'Papkuilsfontein to Springbok', lodge: 'Springbok Inn', meals: 'BB', region: 'Northern Cape' },
      { day: 5, route: 'Springbok to Fish River Canyon', lodge: 'Canyon Village', meals: 'BB', region: 'Namibia' },
      { day: 6, route: 'FRC to Luderitz', lodge: 'Luderitz Nest Hotel', meals: 'BB', region: 'Namibia', km: 423 },
      { day: 7, route: 'Luderitz to Helmeringhausen', lodge: 'Helmeringhausen', meals: 'DBB', region: 'Namibia', km: 233 },
      { day: 8, route: 'Helmeringhausen to Sesriem', lodge: 'Desert Camp', meals: 'DBB', region: 'Namibia' },
      { day: 9, route: 'Sesriem (rest day)', lodge: 'Desert Camp', meals: 'DBB', region: 'Namibia' },
      { day: 10, route: 'Sesriem to Swakopmund', lodge: 'Desert Sands', meals: 'BB', region: 'Namibia', km: 395 },
      { day: 11, route: 'Swakopmund Rest Day', lodge: 'Desert Sands', meals: 'BB', region: 'Namibia' },
      { day: 12, route: 'Swakopmund to Spitzkoppe', lodge: 'Spitzkoppe Tented Camp', meals: 'BB', region: 'Namibia' },
      { day: 13, route: 'Spitzkoppe to Mount Etjo', lodge: 'Mount Etjo', meals: 'DBB', region: 'Namibia', km: 217 },
      { day: 14, route: 'Mount Etjo to Windhoek', lodge: 'Arebbusch', meals: 'BB', region: 'Namibia', km: 197 },
      { day: 15, route: 'Windhoek to Ghanzi', lodge: 'Kalahari Arms', meals: 'BB', region: 'Botswana' },
      { day: 16, route: 'Ghanzi to Okavango', lodge: 'Shakawe River Lodge', meals: 'BB', region: 'Botswana' },
      { day: 17, route: 'Okavango Rest Day', lodge: 'Shakawe River Lodge', meals: 'BB', region: 'Botswana' },
      { day: 18, route: 'Okavango to Katima Mulilo', lodge: 'Zambezi Mubala Lodge', meals: 'BB', region: 'Namibia' },
      { day: 19, route: 'Katima Mulilo to Victoria Falls', lodge: 'Livingstone Lodge', meals: 'BB', region: 'Zimbabwe' },
      { day: 20, route: 'Victoria Falls', lodge: 'Livingstone Lodge', meals: 'BB', region: 'Zimbabwe' },
      { day: 21, route: 'Victoria Falls', lodge: 'Livingstone Lodge', meals: 'BB', region: 'Zimbabwe' },
      { day: 22, route: 'Victoria Falls (depart)', lodge: 'Livingstone Lodge', meals: 'BB', region: 'Zimbabwe' },
    ]
  },
}

// Generate dates for a template based on departure date
export function generateDates(template, departureDate) {
  const dep = new Date(departureDate)
  const preTourStart = template.pre_tour_nights || 0

  return template.nights.map((night, idx) => {
    // Pre-tour nights count backwards from day 1
    const dayOffset = night.pre_tour
      ? night.day - preTourStart  // negative days before departure
      : night.day - 1             // day 1 = departure date

    const date = new Date(dep)
    date.setDate(date.getDate() + dayOffset)

    return {
      ...night,
      night_number: idx + 1,
      date: date.toISOString().split('T')[0],
    }
  })
}

// Generate RDS reference for a booking
export function generateRdsRef(tourCode, departureDate, nightNum) {
  // e.g. RDS-FoSA-MAR27-N04
  const d = new Date(departureDate)
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  const monthStr = months[d.getMonth()]
  const yearStr = String(d.getFullYear()).slice(-2)
  const nightStr = String(nightNum).padStart(2, '0')
  return `RDS-${tourCode.toUpperCase()}-${monthStr}${yearStr}-N${nightStr}`
}
