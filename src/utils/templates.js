// Tour itinerary templates with ranked lodge preferences
// Updated March 2026

export const TEMPLATES = {
  'fosa-21': {
    name: 'Feast of Southern Africa (21-day)',
    code: 'FoSA',
    tour_type: 'FoSA 21',
    // Route copied from FoSA Mar 27 lodge bookings (Zoho, pulled 2026-08-04).
    // Swellendam night 2, Aus with rest day (replaces Luderitz + Helmeringhausen legs).
    nights: [
      { day: 1, route: 'Arrive Cape Town', region: 'Cape Town', meals: 'BB', km: 0,
        lodges: ['City Lodge', 'Onomo Hotel Waterfront'] },
      { day: 2, route: 'Cape Town to Swellendam', region: 'Western Cape', meals: 'BB', km: 230,
        lodges: ['Aan de Eike', 'Aan de Eike Budget', 'Aan de Eike Family'] },
      { day: 3, route: 'Swellendam to Tulbagh', region: 'Western Cape', meals: 'BB', km: 210,
        lodges: ['Tulbagh Hotel'],
        notes: 'Cape Dutch Quarters for guides and guest overflow' },
      { day: 4, route: 'Tulbagh to Papkuilsfontein', region: 'Northern Cape', meals: 'BB', km: 320,
        lodges: ['Papkuilsfontein'] },
      { day: 5, route: 'Papkuilsfontein to Springbok', region: 'Northern Cape', meals: 'BB', km: 280,
        lodges: ['Springbok Inn'] },
      { day: 6, route: 'Springbok to Fish River Canyon', region: 'Namibia', meals: 'BB', km: 350,
        lodges: ['Canyon Village', 'Canyon Roadhouse', 'Canyon Lodge'] },
      { day: 7, route: 'Fish River Canyon to Aus', region: 'Namibia', meals: 'BB', km: 215,
        lodges: ['Klein Aus Vista Desert Horse Inn', 'Bahnhof Hotel'] },
      { day: 8, route: 'Aus rest day', region: 'Namibia', meals: 'BB', km: 0,
        lodges: ['Klein Aus Vista Desert Horse Inn', 'Bahnhof Hotel'],
        notes: 'Same lodge as Day 7. Wild horses / Luderitz day ride optional' },
      { day: 9, route: 'Aus to Sesriem', region: 'Namibia', meals: 'DBB', km: 250,
        lodges: ['Elegant Desert Lodge', 'Desert Camp', 'Desert Quiver Camp', 'Little Sossus', 'Desert Homestead'] },
      { day: 10, route: 'Sossusvlei (rest day)', region: 'Namibia', meals: 'DBB', km: 0,
        lodges: ['Elegant Desert Lodge', 'Desert Camp', 'Desert Quiver Camp', 'Little Sossus', 'Desert Homestead'],
        notes: 'Same lodge as Day 9. Sossusvlei excursion' },
      { day: 11, route: 'Sesriem to Swakopmund', region: 'Namibia', meals: 'BB', km: 395,
        lodges: ['Desert Sands', 'Delight Hotel Swakopmund'] },
      { day: 12, route: 'Swakopmund Rest Day', region: 'Namibia', meals: 'BB', km: 0,
        lodges: ['Desert Sands', 'Delight Hotel Swakopmund'],
        notes: 'Sandwich Harbour excursion (Namibia Dreams)' },
      { day: 13, route: 'Swakopmund to Spitzkoppe', region: 'Namibia', meals: 'BB', km: 180,
        lodges: ['Spitzkoppe Tented Camp', 'Spitzkoppe Cabin Camp', 'Spitzkoppen Lodge'] },
      { day: 14, route: 'Spitzkoppe to Omaruru area', region: 'Namibia', meals: 'DBB', km: 217,
        lodges: ['Omaruru Game Lodge', 'Okonjima Plains Camp', 'Mount Etjo', 'Waterberg Guest Farm'],
        notes: 'Game drive excursion at lodge' },
      { day: 15, route: 'Omaruru area to Windhoek', region: 'Namibia', meals: 'BB', km: 197,
        lodges: ['Arebbusch'] },
      { day: 16, route: 'Windhoek to Ghanzi', region: 'Botswana', meals: 'BB', km: 280,
        lodges: ['Kalahari Arms', 'Zebra Kalahari Lodge', 'Camelthorn Kalahari Lodge'] },
      { day: 17, route: 'Ghanzi to Okavango', region: 'Botswana', meals: 'BB', km: 350,
        lodges: ['Shakawe River Lodge', 'Askiesbos', 'Drotskys'] },
      { day: 18, route: 'Okavango Rest Day', region: 'Botswana', meals: 'BB', km: 0,
        lodges: ['Shakawe River Lodge', 'Askiesbos', 'Drotskys'] },
      { day: 19, route: 'Okavango to Katima Mulilo', region: 'Namibia', meals: 'BB', km: 320,
        lodges: ['Zambezi Mubala Lodge', 'Caprivi Mutoya', 'Caprivi River Lodge'] },
      { day: 20, route: 'Katima Mulilo to Victoria Falls', region: 'Zimbabwe', meals: 'BB', km: 200,
        lodges: ['Shearwater Explorers Village', 'Livingstone Lodge', '528 Victoria Falls', 'Elephant Hills Lodge Vic Falls'],
        notes: 'Pure Africa Zambezi cruise excursion' },
      { day: 21, route: 'Victoria Falls (rest day, depart next morning)', region: 'Zimbabwe', meals: 'BB', km: 0,
        lodges: ['Shearwater Explorers Village', 'Livingstone Lodge', '528 Victoria Falls', 'Elephant Hills Lodge Vic Falls'] },
    ]
  },

  'edge-21': {
    name: 'Edge of Africa (21-day)',
    code: 'EoA',
    tour_type: 'Edge 21',
    // Route copied from Edge Jan 27 lodge bookings (Zoho, pulled 2026-08-04).
    // TBD lodges in the booked data filled from prior Edge canon where it exists, else left empty.
    nights: [
      { day: 1, route: 'Arrive Cape Town', region: 'Cape Town', meals: 'BB', km: 0,
        lodges: ['City Lodge', 'Onomo Hotel Waterfront'] },
      { day: 2, route: 'Cape Town to Swellendam', region: 'Western Cape', meals: 'BB', km: 380,
        lodges: ['Aan de Eike', 'Aan de Eike Budget', 'Aan de Eike Family'] },
      { day: 3, route: 'Swellendam to Cederberg', region: 'Western Cape', meals: 'BB', km: 210,
        lodges: ['Cape Dutch Quarters'],
        notes: 'Booked lodge is Cape Dutch Quarters (Tulbagh) — title/lodge mismatch carried from Edge Jan 27' },
      { day: 4, route: 'Cederberg to Papkuilsfontein', region: 'Northern Cape', meals: 'BB', km: 320,
        lodges: ['Papkuilsfontein'] },
      { day: 5, route: 'Papkuilsfontein to Matjiesfontein', region: 'Karoo', meals: 'BB', km: 330,
        lodges: ['Lord Milner Hotel'] },
      { day: 6, route: 'Matjiesfontein to Swartberg', region: 'Karoo', meals: 'BB', km: 200,
        lodges: ['Swartberg Manor'] },
      { day: 7, route: 'Swartberg to Prince Albert', region: 'Karoo', meals: 'BB', km: 100,
        lodges: ['Karoo View Cottages'] },
      { day: 8, route: 'Prince Albert to Baviaanskloof', region: 'Eastern Cape', meals: 'BB', km: 250,
        lodges: [] },
      { day: 9, route: 'Baviaanskloof to Jeffreys Bay', region: 'Eastern Cape', meals: 'BB', km: 200,
        lodges: ['African Perfection'] },
      { day: 10, route: 'Jeffreys Bay Rest Day', region: 'Eastern Cape', meals: 'BB', km: 0,
        lodges: ['African Perfection'],
        notes: 'Same lodge as Day 9 (booked TBD on Edge Jan 27)' },
      { day: 11, route: 'Jeffreys Bay to Addo', region: 'Eastern Cape', meals: 'BB', km: 150,
        lodges: ['Elephant House', 'Barefoot Addo Elephant Lodge', 'Dung Beetle River Lodge Addo', 'Stellenhof Country Estate (Addo)', 'Tenikwa Wildlife Center Addo'] },
      { day: 12, route: 'Addo to Graaff-Reinet', region: 'Karoo', meals: 'BB', km: 295,
        lodges: ['Drostdy Hotel'] },
      { day: 13, route: 'Graaff-Reinet to Barkly Pass', region: 'Eastern Cape', meals: 'BB', km: 435,
        lodges: ['Mountain Shadows'] },
      { day: 14, route: 'Barkly Pass to Himeville', region: 'KwaZulu-Natal', meals: 'BB', km: 340,
        lodges: ['District Road', 'Karmichael Farm'] },
      { day: 15, route: 'Himeville to Lesotho', region: 'Lesotho', meals: 'BB', km: 250,
        lodges: ['Maliba Lodge'] },
      { day: 16, route: 'Lesotho to Clarens', region: 'Free State', meals: 'BB', km: 200,
        lodges: ['Mont d\'Or (Classic)'] },
      { day: 17, route: 'Clarens to Dundee', region: 'KwaZulu-Natal', meals: 'BB', km: 250,
        lodges: [] },
      { day: 18, route: 'Dundee to Piggs Peak', region: 'Eswatini', meals: 'BB', km: 300,
        lodges: ['Phophonyane Lodge'] },
      { day: 19, route: 'Piggs Peak to Hazyview', region: 'Mpumalanga', meals: 'BB', km: 180,
        lodges: ['Chestnut Lodge (Standard)'] },
      { day: 20, route: 'Kruger Safari (rest day)', region: 'Mpumalanga', meals: 'BB', km: 0,
        lodges: ['Chestnut Lodge (Standard)'] },
      { day: 21, route: 'Depart / Transfer to JHB', region: 'Mpumalanga', meals: '', km: 0,
        lodges: [] },
    ]
  },

  'sst-14': {
    name: 'Southern Sweep (14-day)',
    code: 'SST',
    tour_type: 'SST 14',
    // Route copied from SST Feb 27 lodge bookings (Zoho, pulled 2026-08-04). Hazyview to Cape Town.
    nights: [
      { day: 1, route: 'Arrive Hazyview', region: 'Mpumalanga', meals: 'BB', km: 0,
        lodges: ['Chestnut Lodge (Standard)'] },
      { day: 2, route: 'Kruger Safari (poss. warm up ride)', region: 'Mpumalanga', meals: 'BB', km: 0,
        lodges: ['Chestnut Lodge (Standard)'] },
      { day: 3, route: 'Hazyview to Dullstroom', region: 'Mpumalanga', meals: 'BB', km: 200,
        lodges: ['Cinzaco'] },
      { day: 4, route: 'Dullstroom to Clarens', region: 'Free State', meals: 'BB', km: 460,
        lodges: ['Mont d\'Or (Classic)'] },
      { day: 5, route: 'Clarens to Himeville', region: 'KwaZulu-Natal', meals: 'BB', km: 400,
        lodges: ['Karmichael Farm'] },
      { day: 6, route: 'Sani Pass (rest day)', region: 'KwaZulu-Natal', meals: 'BB', km: 0,
        lodges: ['Karmichael Farm'] },
      { day: 7, route: 'Himeville to Barkly Pass', region: 'Eastern Cape', meals: 'BB', km: 340,
        lodges: ['Mountain Shadows'] },
      { day: 8, route: 'Barkly Pass to Graaff-Reinet', region: 'Karoo', meals: 'BB', km: 435,
        lodges: ['Drostdy Hotel'] },
      { day: 9, route: 'Graaff-Reinet to Addo', region: 'Eastern Cape', meals: 'BB', km: 295,
        lodges: ['Chrislin African Lodge', 'Elephant House', 'Barefoot Addo Elephant Lodge'] },
      { day: 10, route: 'Addo to Plettenberg Bay', region: 'Garden Route', meals: 'BB', km: 300,
        lodges: ['Tsitsikamma Lodge & Spa'] },
      { day: 11, route: 'Plettenberg Bay to Swartberg', region: 'Karoo', meals: 'BB', km: 200,
        lodges: ['Swartberg Manor'] },
      { day: 12, route: 'Swartberg to Swellendam', region: 'Western Cape', meals: 'BB', km: 225,
        lodges: ['Aan de Eike', 'Aan de Eike Budget', 'Aan de Eike Family'] },
      { day: 13, route: 'Swellendam to Cape Town', region: 'Cape Town', meals: 'BB', km: 230,
        lodges: ['City Lodge', 'Onomo Hotel Waterfront'] },
      { day: 14, route: 'Depart Cape Town', region: 'Cape Town', meals: '', km: 0,
        lodges: [] },
    ]
  },

  'bon-17': {
    name: 'Best of Namibia (17-day)',
    code: 'BoN',
    tour_type: 'BoN 17',
    // Route settled by Andrew 2026-08-04 (HQ chat + his My Maps). 3,173 km total.
    // Kanaan is the day-7 default; Helmeringhausen is the alternative by availability / rider ability.
    nights: [
      { day: 1, route: 'Arrive Windhoek', region: 'Namibia', meals: 'D', km: 0,
        lodges: ['Hohewarte Guest Farm'] },
      { day: 2, route: 'Windhoek to the Kalahari', region: 'Namibia', meals: 'BD', km: 210,
        lodges: ['Suricate Tented Lodge'] },
      { day: 3, route: 'Kalahari to Quivertree Forest, via Gochas and Koes', region: 'Namibia', meals: 'BD', km: 422,
        lodges: ['Quivertree Forest Rest Camp'] },
      { day: 4, route: 'Quivertree to Fish River Canyon, incl. FRC viewpoint', region: 'Namibia', meals: 'BD', km: 195,
        lodges: ['Canyon Village', 'Canyon Roadhouse', 'Canyon Lodge'] },
      { day: 5, route: 'Fish River Canyon to Aus', region: 'Namibia', meals: 'BD', km: 298,
        lodges: ['Klein Aus Vista Desert Horse Inn', 'Bahnhof Hotel'] },
      { day: 6, route: 'Aus to Luderitz (late departure after lunch)', region: 'Namibia', meals: 'BD', km: 125,
        lodges: ['Luderitz Nest Hotel'] },
      { day: 7, route: 'Luderitz to Kanaan, via Kolmanskop', region: 'Namibia', meals: 'BD', km: 255,
        lodges: ['Kanaan Desert Retreat', 'Helmeringhausen Hotel'],
        notes: 'Kanaan default; Helmeringhausen alternative by availability / guest riding ability' },
      { day: 8, route: 'Kanaan to Sesriem', region: 'Namibia', meals: 'BD', km: 225,
        lodges: ['Desert Quiver Camp'] },
      { day: 9, route: 'Sesriem to Rostock (Sossusvlei & Deadvlei morning)', region: 'Namibia', meals: 'BD', km: 135,
        lodges: ['Rostock Ritz Desert Lodge'] },
      { day: 10, route: 'Rostock to Swakopmund', region: 'Namibia', meals: 'BD', km: 225,
        lodges: ['Desert Sands', 'Delight Hotel Swakopmund'] },
      { day: 11, route: 'Swakopmund Rest Day', region: 'Namibia', meals: 'BD', km: 0,
        lodges: ['Desert Sands', 'Delight Hotel Swakopmund'],
        notes: 'Sandwich Harbour excursion' },
      { day: 12, route: 'Swakopmund to Spitzkoppe, via Henties Bay and the Zeila wreck', region: 'Namibia', meals: 'BD', km: 180,
        lodges: ['Spitzkoppe Tented Camp', 'Spitzkoppe Cabin Camp', 'Spitzkoppen Lodge'] },
      { day: 13, route: 'Spitzkoppe to Twyfelfontein', region: 'Namibia', meals: 'BD', km: 233,
        lodges: ['Twyfelfontein Adventure Camp'] },
      { day: 14, route: 'Twyfelfontein to Vingerklip', region: 'Namibia', meals: 'BD', km: 172,
        lodges: ['Vingerklip Lodge'] },
      { day: 15, route: 'Vingerklip to Okonjima', region: 'Namibia', meals: 'BD', km: 235,
        lodges: ['Okonjima Plains Camp', 'Omaruru Game Lodge', 'Mount Etjo'],
        notes: 'Okonjima default; Omaruru and Mount Etjo alternatives' },
      { day: 16, route: 'Okonjima to Windhoek', region: 'Namibia', meals: 'BD', km: 263,
        lodges: ['Hohewarte Guest Farm'] },
      { day: 17, route: 'Depart Windhoek (WDH)', region: 'Namibia', meals: 'B', km: 0,
        lodges: [] },
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
export function generateRdsRef(tourCode, departureDate, lodgeName, checkInDate) {
  const d = new Date(departureDate)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const monthStr = months[d.getMonth()]
  const yearStr = String(d.getFullYear()).slice(-2)
  const lodgeShort = (lodgeName || 'TBD').replace(/[^a-zA-Z0-9]/g, '')
  const ci = new Date(checkInDate)
  const ciStr = String(ci.getFullYear()).slice(-2) + '/' +
    String(ci.getMonth() + 1).padStart(2, '0') + '/' +
    String(ci.getDate()).padStart(2, '0')
  return 'RDS-' + tourCode + '-' + monthStr + yearStr + '-' + lodgeShort + '-' + ciStr
}

// Custom template storage (localStorage)
const CUSTOM_TEMPLATES_KEY = 'rds_custom_templates'

export function getCustomTemplates() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_TEMPLATES_KEY) || '{}')
  } catch (e) { return {} }
}

export function saveCustomTemplate(key, template) {
  const all = getCustomTemplates()
  all[key] = template
  localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(all))
}

export function deleteCustomTemplate(key) {
  const all = getCustomTemplates()
  delete all[key]
  localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(all))
}

export function getAllTemplates() {
  return { ...TEMPLATES, ...getCustomTemplates() }
}
