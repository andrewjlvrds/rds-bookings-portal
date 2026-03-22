// Tour itinerary templates — definitive lodge sequences
// Based on promotional itineraries at ridedownsouth.wetravel.com
// Cross-referenced with Zoho booking history

export const TEMPLATES = {
  'fosa-20': {
    name: 'Feast of Southern Africa (20-day)',
    code: 'FoSA',
    tour_type: 'FoSA 20',
    nights: [
      { day: 1, route: 'Arrive Cape Town', lodge: 'City Lodge', meals: 'BB', region: 'Cape Town', km: 0 },
      { day: 2, route: 'Cape Town to Tulbagh', lodge: 'Tulbagh Hotel', meals: 'BB', region: 'Western Cape', km: 120, backup: 'Cape Dutch Quarters' },
      { day: 3, route: 'Tulbagh to Papkuilsfontein', lodge: 'Papkuilsfontein', meals: 'BB', region: 'Northern Cape', km: 320 },
      { day: 4, route: 'Papkuilsfontein to Springbok', lodge: 'Springbok Inn', meals: 'BB', region: 'Northern Cape', km: 280 },
      { day: 5, route: 'Springbok to Fish River Canyon', lodge: 'Canyon Village', meals: 'BB', region: 'Namibia', km: 350 },
      { day: 6, route: 'Fish River Canyon to Luderitz', lodge: 'Luderitz Nest Hotel', meals: 'BB', region: 'Namibia', km: 423 },
      { day: 7, route: 'Luderitz to Helmeringhausen', lodge: 'Helmeringhausen', meals: 'DBB', region: 'Namibia', km: 233 },
      { day: 8, route: 'Helmeringhausen to Sesriem', lodge: 'Desert Camp', meals: 'DBB', region: 'Namibia', km: 280 },
      { day: 9, route: 'Sesriem / Sossusvlei (rest day)', lodge: 'Desert Camp', meals: 'DBB', region: 'Namibia', km: 0 },
      { day: 10, route: 'Sesriem to Swakopmund', lodge: 'Desert Sands', meals: 'BB', region: 'Namibia', km: 395 },
      { day: 11, route: 'Swakopmund Rest Day', lodge: 'Desert Sands', meals: 'BB', region: 'Namibia', km: 0 },
      { day: 12, route: 'Swakopmund to Spitzkoppe', lodge: 'Spitzkoppe Tented Camp', meals: 'BB', region: 'Namibia', km: 180 },
      { day: 13, route: 'Spitzkoppe to Mount Etjo', lodge: 'Mount Etjo', meals: 'DBB', region: 'Namibia', km: 217 },
      { day: 14, route: 'Mount Etjo to Windhoek', lodge: 'Arebbusch', meals: 'BB', region: 'Namibia', km: 197 },
      { day: 15, route: 'Windhoek to Ghanzi', lodge: 'Kalahari Arms', meals: 'BB', region: 'Botswana', km: 280 },
      { day: 16, route: 'Ghanzi to Okavango', lodge: 'Shakawe River Lodge', meals: 'BB', region: 'Botswana', km: 350 },
      { day: 17, route: 'Okavango Rest Day', lodge: 'Shakawe River Lodge', meals: 'BB', region: 'Botswana', km: 0 },
      { day: 18, route: 'Okavango to Katima Mulilo', lodge: 'Zambezi Mubala Lodge', meals: 'BB', region: 'Namibia', km: 320 },
      { day: 19, route: 'Katima Mulilo to Victoria Falls', lodge: 'Livingstone Lodge', meals: 'BB', region: 'Zimbabwe', km: 200 },
      { day: 20, route: 'Victoria Falls (rest day)', lodge: 'Livingstone Lodge', meals: 'BB', region: 'Zimbabwe', km: 0 },
    ]
  },

  'eoa-14': {
    name: 'Edge of Africa (14-day)',
    code: 'EoA',
    tour_type: 'Edge 14',
    nights: [
      { day: 1, route: 'Arrive Cape Town', lodge: 'City Lodge', meals: 'BB', region: 'Cape Town', km: 0 },
      { day: 2, route: 'Cape Town to Swellendam', lodge: 'Aan de Eike', meals: 'BB', region: 'Western Cape', km: 380 },
      { day: 3, route: 'Swellendam to Swartberg', lodge: 'Swartberg Country Manor', meals: 'BB', region: 'Western Cape', km: 225 },
      { day: 4, route: 'Swartberg to Plettenberg Bay', lodge: 'Tsitsikamma Lodge', meals: 'BB', region: 'Garden Route', km: 200 },
      { day: 5, route: 'Plettenberg Bay to Addo', lodge: 'Elephant House', meals: 'BB', region: 'Eastern Cape', km: 300 },
      { day: 6, route: 'Addo to Graaff-Reinet', lodge: 'Drostdy Hotel', meals: 'BB', region: 'Karoo', km: 295 },
      { day: 7, route: 'Graaff-Reinet to Barkly Pass', lodge: 'Mountain Shadows Hotel', meals: 'BB', region: 'Eastern Cape', km: 435 },
      { day: 8, route: 'Barkly Pass to Himeville', lodge: 'KarMichael Farm', meals: 'BB', region: 'KwaZulu-Natal', km: 340 },
      { day: 9, route: 'Sani Pass (rest day)', lodge: 'KarMichael Farm', meals: 'BB', region: 'KwaZulu-Natal', km: 0 },
      { day: 10, route: 'Himeville to Clarens', lodge: 'Mont d\'Or Hotel', meals: 'BB', region: 'Free State', km: 400 },
      { day: 11, route: 'Clarens to Dullstroom', lodge: 'Cinzaco Guest House', meals: 'BB', region: 'Mpumalanga', km: 460 },
      { day: 12, route: 'Dullstroom to Hazyview (Panorama Route)', lodge: 'Hippo Hollow', meals: 'BB', region: 'Mpumalanga', km: 200 },
      { day: 13, route: 'Kruger Safari (rest day)', lodge: 'Hippo Hollow', meals: 'BB', region: 'Mpumalanga', km: 0 },
      { day: 14, route: 'Depart / Transfer to JHB', lodge: '', meals: '', region: 'Mpumalanga', km: 0 },
    ]
  },
}

// Generate dates for a template based on departure date
export function generateDates(template, departureDate) {
  const dep = new Date(departureDate)

  return template.nights.map((night, idx) => {
    const date = new Date(dep)
    date.setDate(date.getDate() + night.day - 1) // day 1 = departure date

    return {
      ...night,
      night_number: idx + 1,
      date: date.toISOString().split('T')[0],
    }
  })
}

// Generate RDS reference for a booking
export function generateRdsRef(tourCode, departureDate, nightNum) {
  const d = new Date(departureDate)
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  const monthStr = months[d.getMonth()]
  const yearStr = String(d.getFullYear()).slice(-2)
  const nightStr = String(nightNum).padStart(2, '0')
  return 'RDS-' + tourCode + '-' + monthStr + yearStr + '-N' + nightStr
}
