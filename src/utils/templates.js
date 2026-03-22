// Tour itinerary templates with ranked lodge preferences
// Updated March 2026

export const TEMPLATES = {
  'fosa-20': {
    name: 'Feast of Southern Africa (20-day)',
    code: 'FoSA',
    tour_type: 'FoSA 20',
    nights: [
      { day: 1, route: 'Arrive Cape Town', region: 'Cape Town', meals: 'BB', km: 0,
        lodges: ['City Lodge', 'Onomo Hotel Waterfront'] },
      { day: 2, route: 'Cape Town to Tulbagh', region: 'Western Cape', meals: 'BB', km: 120,
        lodges: ['Tulbagh Hotel'],
        notes: 'Cape Dutch Quarters for guides and guest overflow' },
      { day: 3, route: 'Tulbagh to Papkuilsfontein', region: 'Northern Cape', meals: 'BB', km: 320,
        lodges: ['Papkuilsfontein'] },
      { day: 4, route: 'Papkuilsfontein to Springbok', region: 'Northern Cape', meals: 'BB', km: 280,
        lodges: ['Springbok Inn'] },
      { day: 5, route: 'Springbok to Fish River Canyon', region: 'Namibia', meals: 'BB', km: 350,
        lodges: ['Canyon Village', 'Canyon Roadhouse', 'Canyon Lodge'] },
      { day: 6, route: 'Fish River Canyon to Luderitz', region: 'Namibia', meals: 'BB', km: 423,
        lodges: ['Luderitz Nest Hotel'],
        notes: 'Tranquility Guesthouse for guides, Obelix if necessary',
        alt_route: { route: 'Fish River Canyon to Aus', lodges: ['Klein Aus Vista Desert Horse Inn', 'Bahnhof Hotel'] } },
      { day: 7, route: 'Luderitz to Helmeringhausen', region: 'Namibia', meals: 'DBB', km: 233,
        lodges: ['Helmeringhausen', 'AT Kronenhof Lodge'] },
      { day: 8, route: 'Helmeringhausen to Sesriem', region: 'Namibia', meals: 'DBB', km: 280,
        lodges: ['Desert Camp', 'Desert Quiver Camp', 'Elegant Desert Lodge', 'Little Sossus', 'Desert Homestead'],
        notes: 'Alt split: 1 night Sesriem then Rostock Ritz or Corona nearby' },
      { day: 9, route: 'Sesriem / Sossusvlei (rest day)', region: 'Namibia', meals: 'DBB', km: 0,
        lodges: ['Desert Camp', 'Desert Quiver Camp', 'Elegant Desert Lodge', 'Little Sossus', 'Desert Homestead'],
        notes: 'Same lodge as Day 8, or Rostock Ritz / Corona if splitting' },
      { day: 10, route: 'Sesriem to Swakopmund', region: 'Namibia', meals: 'BB', km: 395,
        lodges: ['Desert Sands', 'Delight Hotel Swakopmund'] },
      { day: 11, route: 'Swakopmund Rest Day', region: 'Namibia', meals: 'BB', km: 0,
        lodges: ['Desert Sands', 'Delight Hotel Swakopmund'] },
      { day: 12, route: 'Swakopmund to Spitzkoppe', region: 'Namibia', meals: 'BB', km: 180,
        lodges: ['Spitzkoppe Tented Camp', 'Spitzkoppe Cabin Camp', 'Spitzkoppen Lodge'] },
      { day: 13, route: 'Spitzkoppe to Omaruru area', region: 'Namibia', meals: 'DBB', km: 217,
        lodges: ['Omaruru Game Lodge', 'Okonjima Plains Camp', 'Mount Etjo', 'Waterberg Guest Farm'] },
      { day: 14, route: 'Omaruru area to Windhoek', region: 'Namibia', meals: 'BB', km: 197,
        lodges: ['Arebbusch'] },
      { day: 15, route: 'Windhoek to Ghanzi', region: 'Botswana', meals: 'BB', km: 280,
        lodges: ['Kalahari Arms', 'Zebra Kalahari Lodge', 'Camelthorn Kalahari Lodge'] },
      { day: 16, route: 'Ghanzi to Okavango', region: 'Botswana', meals: 'BB', km: 350,
        lodges: ['Shakawe River Lodge', 'Askiesbos', 'Drotskys'] },
      { day: 17, route: 'Okavango Rest Day', region: 'Botswana', meals: 'BB', km: 0,
        lodges: ['Shakawe River Lodge', 'Askiesbos', 'Drotskys'] },
      { day: 18, route: 'Okavango to Katima Mulilo', region: 'Namibia', meals: 'BB', km: 320,
        lodges: ['Zambezi Mubala Lodge', 'Caprivi Mutoya', 'Caprivi River Lodge'] },
      { day: 19, route: 'Katima Mulilo to Victoria Falls', region: 'Zimbabwe', meals: 'BB', km: 200,
        lodges: ['Shearwater Explorers Village', 'Livingstone Lodge', '528 Victoria Falls', 'Elephant Hills Lodge Vic Falls'] },
      { day: 20, route: 'Victoria Falls (rest day)', region: 'Zimbabwe', meals: 'BB', km: 0,
        lodges: ['Shearwater Explorers Village', 'Livingstone Lodge', '528 Victoria Falls', 'Elephant Hills Lodge Vic Falls'] },
    ]
  },

  'eoa-14': {
    name: 'Edge of Africa (14-day)',
    code: 'EoA',
    tour_type: 'Edge 14',
    nights: [
      { day: 1, route: 'Arrive Cape Town', region: 'Cape Town', meals: 'BB', km: 0,
        lodges: ['City Lodge', 'Onomo Hotel Waterfront'] },
      { day: 2, route: 'Cape Town to Swellendam', region: 'Western Cape', meals: 'BB', km: 380,
        lodges: ['Aan de Eike', 'Aan de Eike Budget', 'Aan de Eike Family'] },
      { day: 3, route: 'Swellendam to Swartberg', region: 'Western Cape', meals: 'BB', km: 225,
        lodges: ['Swartberg Manor'] },
      { day: 4, route: 'Swartberg to Plettenberg Bay', region: 'Garden Route', meals: 'BB', km: 200,
        lodges: ['Tsitsikamma Lodge & Spa', 'Tenikwa Wildlife Center Addo'] },
      { day: 5, route: 'Plettenberg Bay to Addo', region: 'Eastern Cape', meals: 'BB', km: 300,
        lodges: ['Elephant House', 'Barefoot Addo Elephant Lodge', 'Dung Beetle River Lodge Addo', 'Stellenhof Country Estate (Addo)', 'Tenikwa Wildlife Center Addo'] },
      { day: 6, route: 'Addo to Graaff-Reinet', region: 'Karoo', meals: 'BB', km: 295,
        lodges: ['Drostdy Hotel'] },
      { day: 7, route: 'Graaff-Reinet to Barkly Pass', region: 'Eastern Cape', meals: 'BB', km: 435,
        lodges: ['Mountain Shadows'] },
      { day: 8, route: 'Barkly Pass to Himeville', region: 'KwaZulu-Natal', meals: 'BB', km: 340,
        lodges: ['Karmichael Farm'] },
      { day: 9, route: 'Sani Pass (rest day)', region: 'KwaZulu-Natal', meals: 'BB', km: 0,
        lodges: ['Karmichael Farm'] },
      { day: 10, route: 'Himeville to Clarens', region: 'Free State', meals: 'BB', km: 400,
        lodges: ['Mont d\'Or (Classic)'] },
      { day: 11, route: 'Clarens to Dullstroom', region: 'Mpumalanga', meals: 'BB', km: 460,
        lodges: ['Cinzaco'] },
      { day: 12, route: 'Dullstroom to Hazyview (Panorama Route)', region: 'Mpumalanga', meals: 'BB', km: 200,
        lodges: ['Chestnut Lodge (Standard)'] },
      { day: 13, route: 'Kruger Safari (rest day)', region: 'Mpumalanga', meals: 'BB', km: 0,
        lodges: ['Chestnut Lodge (Standard)'] },
      { day: 14, route: 'Depart / Transfer to JHB', region: 'Mpumalanga', meals: '', km: 0,
        lodges: [] },
    ]
  },
}

// Generate dates for a template based on departure date
export function generateDates(template, departureDate) {
  const dep = new Date(departureDate)

  return template.nights.map((night, idx) => {
    const date = new Date(dep)
    date.setDate(date.getDate() + night.day - 1)

    return {
      ...night,
      lodge: night.lodges[0] || '',
      backup: night.lodges[1] || '',
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
