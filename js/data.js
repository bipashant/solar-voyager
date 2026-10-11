// Physical and orbital data for the Sun, planets, Pluto and their known major moons.
// Radii in km, orbital radii (a) in km, periods in days, angles in degrees.
// Moon inclinations are relative to the parent's equator, except for irregular moons
// (irregular: true) whose orbits are referenced to the ecliptic.

export const SPEEDS = [
  { id: 'walk', label: 'Walking pace', short: 'walking', kms: 5 / 3600 },
  { id: 'car', label: 'Highway car · 100 km/h', short: 'car', kms: 100 / 3600 },
  { id: 'sound', label: 'Speed of sound · Mach 1', short: 'sound speed', kms: 0.343 },
  { id: 'concorde', label: 'Concorde · Mach 2', short: 'Mach 2', kms: 0.6 },
  { id: 'iss', label: 'ISS orbital speed', short: 'ISS speed', kms: 7.66 },
  { id: 'voyager', label: 'Voyager 1 · 17 km/s', short: 'Voyager 1', kms: 17.0 },
  { id: 'parker', label: 'Parker Solar Probe · 192 km/s', short: 'Parker Probe', kms: 191.7 },
  { id: 'pct', label: '1% of light speed', short: '1% light', kms: 2997.92458 },
  { id: 'light', label: 'Speed of light', short: 'light speed', kms: 299792.458 },
  { id: 'warp', label: 'Warp drive · 1,000× light (sci-fi)', short: 'warp', kms: 299792458 },
];

export const TRAVEL_MODES = [
  { id: 'cinematic', label: 'Cinematic', warp: 0 },
  { id: 'x1', label: 'Real time', warp: 1 },
  { id: 'x100', label: 'Real time ×100', warp: 100 },
  { id: 'x10k', label: 'Real time ×10,000', warp: 1e4 },
  { id: 'x1m', label: 'Real time ×1 million', warp: 1e6 },
];

export const TIME_RATES = [
  { id: 'pause', label: 'Paused', rate: 0 },
  { id: 'real', label: 'Real time', rate: 1 },
  { id: 'min', label: '1 min / s', rate: 60 },
  { id: 'hour', label: '1 hour / s', rate: 3600 },
  { id: 'day', label: '1 day / s', rate: 86400 },
  { id: 'week', label: '1 week / s', rate: 604800 },
  { id: 'month', label: '1 month / s', rate: 2629800 },
  { id: 'year', label: '1 year / s', rate: 31557600 },
];

// Ring systems: [inner km, outer km, opacity, colour mix 0..1]
export const RINGS = {
  saturn: {
    colA: [0.78, 0.69, 0.56], colB: [0.93, 0.86, 0.72], noise: 0.55, brightness: 1.0,
    bands: [
      [66900, 74510, 0.015, 0.0], // D ring
      [74658, 91975, 0.12, 0.05], // C ring
      [91975, 99000, 0.62, 0.65], // inner B ring
      [99000, 117507, 0.95, 1.0], // B ring core
      [117507, 122053, 0.06, 0.15], // Cassini Division
      [122053, 133423, 0.55, 0.62], // A ring (inside the Encke Gap)
      [133745, 136485, 0.5, 0.6], // A ring outer edge
      [136527, 136775, 0.45, 0.6],
      [140130, 140230, 0.45, 0.9], // F ring
      [166000, 175000, 0.006, 0.4], // G ring
    ],
  },
  uranus: {
    colA: [0.36, 0.36, 0.38], colB: [0.55, 0.55, 0.58], noise: 0.2, brightness: 0.8,
    bands: [
      [41817, 41857, 0.35, 0.3], [42214, 42254, 0.35, 0.3], [42551, 42591, 0.35, 0.3],
      [44698, 44738, 0.4, 0.4], [45641, 45681, 0.4, 0.4], [47166, 47186, 0.25, 0.3],
      [47617, 47637, 0.4, 0.4], [48290, 48310, 0.4, 0.4], [50014, 50034, 0.2, 0.3],
      [51120, 51180, 0.8, 1.0], // epsilon ring
    ],
  },
  neptune: {
    colA: [0.42, 0.40, 0.40], colB: [0.6, 0.58, 0.56], noise: 0.4, brightness: 0.8,
    bands: [
      [40900, 42900, 0.015, 0.2], // Galle
      [53150, 53250, 0.12, 0.6], // Le Verrier
      [53250, 57200, 0.012, 0.3], // Lassell
      [57150, 57250, 0.06, 0.5], // Arago
      [62900, 62965, 0.2, 0.8], // Adams
    ],
  },
  jupiter: {
    colA: [0.55, 0.45, 0.38], colB: [0.7, 0.6, 0.5], noise: 0.3, brightness: 1.2,
    bands: [
      [92000, 122500, 0.004, 0.2], // halo
      [122500, 129000, 0.03, 0.8], // main ring
      [129000, 182000, 0.003, 0.4], // Amalthea gossamer
    ],
  },
};

const E = (n) => n.toLocaleString('en-US');

export const BODIES = [
  {
    id: 'sun', name: 'Sun', kind: 'star', radius: 695700, color: '#ffcf6e',
    tex: { map: ['sun_2k', 'sun_4k'] }, pole: [286.13, 63.87], W: [84.176, 14.1844], view: 4.5,
    subtitle: 'G-type main-sequence star',
    facts: [['Diameter', '1,391,400 km'], ['Mass', '333,000 Earths'], ['Surface', '≈ 5,500 °C'],
      ['Core', '≈ 15 million °C'], ['Rotation', '25 days (equator) to 35 days (poles)'], ['Age', '4.6 billion years']],
    blurb: 'Holds 99.86% of all the mass in the Solar System. Sunlight takes about 8 minutes 20 seconds to reach Earth.',
  },
  {
    id: 'mercury', name: 'Mercury', kind: 'planet', order: 1, radius: 2439.7, color: '#a9a19a',
    tex: { map: ['mercury_2k', 'mercury_4k'] }, pole: [281.0103, 61.4155], W: [329.5988, 6.1385108],
    relief: 1.0, view: 3.2, subtitle: 'Rocky planet · 1st from the Sun',
    facts: [['Diameter', '4,879 km'], ['Mass', '0.055 Earths'], ['Gravity', '3.7 m/s² (0.38 g)'],
      ['Solar day', '176 Earth days'], ['Year', '88 Earth days'], ['Temperature', '−173 °C to 427 °C'], ['Moons', '0']],
    blurb: 'One day on Mercury, sunrise to sunrise, lasts two Mercury years. With no atmosphere to hold heat, its nights drop to −173 °C.',
  },
  {
    id: 'venus', name: 'Venus', kind: 'planet', order: 2, radius: 6051.8, color: '#e8cf9a',
    tex: { map: ['venus_2k', 'venus_4k'] }, pole: [272.76, 67.16], W: [160.20, -1.4813688],
    style: 'clouds', view: 3.2, bright: 0.72, subtitle: 'Rocky planet · 2nd from the Sun',
    atmosphere: { color: [1.0, 0.82, 0.5], thickness: 0.03, intensity: 1.0, mie: 0.6 },
    facts: [['Diameter', '12,104 km'], ['Mass', '0.815 Earths'], ['Gravity', '8.87 m/s²'],
      ['Rotation', '243 days (backwards)'], ['Year', '225 Earth days'], ['Surface', '464 °C, 92 bar'], ['Moons', '0']],
    blurb: 'Its day is longer than its year, and it spins backwards, so the Sun rises in the west. Sulfuric-acid clouds trap enough heat to melt lead.',
  },
  {
    id: 'earth', name: 'Earth', kind: 'planet', order: 3, radius: 6378.137, polar: 6356.752, color: '#6b9bff',
    tex: { map: ['earth_day_2k', 'earth_day_8k'], night: ['earth_night_2k', 'earth_night_4k'],
      clouds: ['earth_clouds_2k', 'earth_clouds_4k'], spec: ['earth_spec_2k'], normal: ['earth_normal_2k'] },
    pole: [0, 90], W: [190.147, 360.9856235], style: 'earth', relief: 1.0, view: 3.4, bright: 0.88,
    subtitle: 'Rocky planet · 3rd from the Sun',
    atmosphere: { color: [0.28, 0.55, 1.0], thickness: 0.022, intensity: 1.1, mie: 0.3 },
    facts: [['Diameter', '12,742 km'], ['Mass', '5.97 × 10²⁴ kg'], ['Gravity', '9.81 m/s²'],
      ['Day', '23 h 56 min'], ['Year', '365.26 days'], ['Mean temp.', '15 °C'], ['Moons', '1']],
    blurb: 'The only world known to host life; 71% of its surface is ocean. The day and night sides shown here match the real time.',
    features: [
      { name: 'Mount Everest', lat: 27.99, lon: 86.93 }, { name: 'Sahara', lat: 23, lon: 13 },
      { name: 'Amazon rainforest', lat: -3.5, lon: -62 }, { name: 'Great Barrier Reef', lat: -18.3, lon: 147.7 },
      { name: 'Pacific Ocean', lat: 5, lon: -150 }, { name: 'Antarctica', lat: -82, lon: 30 },
    ],
  },
  {
    id: 'moon', name: 'Moon', kind: 'moon', parent: 'earth', radius: 1737.4, color: '#c8c4bc',
    tex: { map: ['moon_2k', 'moon_4k'] }, orbit: 'luna', a: 384400, period: 27.321661, relief: 1.0,
    style: 'lunar', view: 3.2, subtitle: 'Moon of Earth',
    facts: [['Diameter', '3,475 km'], ['Gravity', '1.62 m/s² (0.17 g)'], ['Orbit', '27.3 days'],
      ['Distance', '384,400 km avg.'], ['Temperature', '−173 °C to 127 °C']],
    blurb: 'It always shows Earth the same face. Twelve people walked on its surface between 1969 and 1972.',
    features: [
      { name: 'Apollo 11 · Sea of Tranquility', lat: 0.674, lon: 23.47 }, { name: 'Tycho crater', lat: -43.3, lon: -11.2 },
      { name: 'Copernicus crater', lat: 9.6, lon: -20.1 }, { name: 'Mare Imbrium', lat: 32.8, lon: -15.6 },
      { name: 'Mare Crisium', lat: 17, lon: 59.1 }, { name: 'Oceanus Procellarum', lat: 18.4, lon: -57.4 },
      { name: 'South Pole–Aitken basin', lat: -53, lon: 169 },
    ],
  },
  {
    id: 'mars', name: 'Mars', kind: 'planet', order: 4, radius: 3396.2, polar: 3376.2, color: '#d9774b',
    tex: { map: ['mars_2k', 'mars_4k'] }, pole: [317.68143, 52.88650], W: [176.630, 350.89198226],
    relief: 0.9, view: 3.2, bright: 0.85, subtitle: 'Rocky planet · 4th from the Sun',
    atmosphere: { color: [0.95, 0.62, 0.42], thickness: 0.02, intensity: 0.45, mie: 0.5 },
    facts: [['Diameter', '6,779 km'], ['Mass', '0.107 Earths'], ['Gravity', '3.72 m/s²'],
      ['Day', '24 h 37 min'], ['Year', '687 Earth days'], ['Mean temp.', '−63 °C'], ['Moons', '2']],
    blurb: 'Home to Olympus Mons, a volcano about 22 km tall, and Valles Marineris, a canyon system roughly as long as the United States is wide.',
    features: [
      { name: 'Olympus Mons', lat: 18.65, lon: -133.8 }, { name: 'Valles Marineris', lat: -13.9, lon: -59.2 },
      { name: 'Hellas Planitia', lat: -42.4, lon: 70.5 }, { name: 'Syrtis Major', lat: 8.4, lon: 69.5 },
      { name: 'Gale crater · Curiosity', lat: -5.4, lon: 137.8 }, { name: 'Jezero crater · Perseverance', lat: 18.4, lon: 77.5 },
      { name: 'North polar ice cap', lat: 86, lon: 0 },
    ],
  },
  {
    id: 'phobos', name: 'Phobos', kind: 'moon', parent: 'mars', radius: 11.27, shape: [13.0, 9.1, 11.4], lumpy: 0.14,
    a: 9376, period: 0.31891, inc: 1.09, e: 0.0151, color: '#7a6e64', colA: '#5c534b', colB: '#82766a',
    bigCrater: [-1, -49, 22, 0],
    facts: [['Size', '27 × 22 × 18 km'], ['Orbit', '7 h 39 min'], ['Distance', '9,376 km from Mars']],
    blurb: 'Orbits Mars three times a day and is slowly spiralling inward. In about 50 million years it will break apart or crash.',
  },
  {
    id: 'deimos', name: 'Deimos', kind: 'moon', parent: 'mars', radius: 6.2, shape: [7.8, 5.1, 6.0], lumpy: 0.1,
    a: 23463, period: 1.263, inc: 0.93, color: '#958a7d', colA: '#7d7266', colB: '#a3988b', craters: 0.5,
    facts: [['Size', '15 × 12 × 11 km'], ['Orbit', '30.3 hours'], ['Distance', '23,463 km from Mars']],
    blurb: 'Mars’s smaller moon is smoothed by a deep blanket of dust. From the Martian surface it looks like a bright star.',
  },
  {
    id: 'jupiter', name: 'Jupiter', kind: 'planet', order: 5, radius: 71492, polar: 66854, color: '#d8b48c',
    tex: { map: ['jupiter_2k', 'jupiter_4k'] }, pole: [268.056595, 64.495303], W: [284.95, 870.5360000],
    style: 'gas', rings: 'jupiter', view: 3.2, bright: 0.6, subtitle: 'Gas giant · 5th from the Sun',
    atmosphere: { color: [0.7, 0.75, 0.9], thickness: 0.012, intensity: 0.5, mie: 0.4 },
    facts: [['Diameter', '139,820 km'], ['Mass', '318 Earths'], ['Gravity', '24.8 m/s²'],
      ['Day', '9 h 56 min'], ['Year', '11.86 years'], ['Cloud tops', '−110 °C'], ['Known moons', '95+']],
    blurb: 'The Great Red Spot is a storm wider than Earth that has raged for at least 150 years. Jupiter spins so fast that it bulges 7% at the equator.',
    features: [
      { name: 'Great Red Spot', lat: -20.5, lon: -49 }, { name: 'North Equatorial Belt', lat: 14, lon: -10 },
      { name: 'South Equatorial Belt', lat: -11, lon: 60 }, { name: 'Equatorial Zone', lat: 2, lon: 120 },
      { name: 'North polar region', lat: 70, lon: 0 },
    ],
  },
  {
    id: 'metis', name: 'Metis', kind: 'moon', parent: 'jupiter', radius: 21.5, shape: [30, 17, 20], lumpy: 0.15,
    a: 128000, period: 0.294779, inc: 0.06, color: '#7a6a5c', colA: '#6e5e52', colB: '#8a7a6c',
  },
  {
    id: 'adrastea', name: 'Adrastea', kind: 'moon', parent: 'jupiter', radius: 8.2, shape: [10, 7, 8], lumpy: 0.15,
    a: 129000, period: 0.29826, inc: 0.03, color: '#7a6a5c', colA: '#6e5e52', colB: '#8a7a6c',
  },
  {
    id: 'amalthea', name: 'Amalthea', kind: 'moon', parent: 'jupiter', radius: 83.5, shape: [125, 64, 73], lumpy: 0.12,
    a: 181366, period: 0.498179, inc: 0.37, color: '#b05b3b', colA: '#8f3f27', colB: '#c47a52',
    blurb: 'One of the reddest objects in the Solar System, and so porous it may be a loose rubble pile.',
  },
  {
    id: 'thebe', name: 'Thebe', kind: 'moon', parent: 'jupiter', radius: 49.3, shape: [58, 42, 49], lumpy: 0.13,
    a: 221889, period: 0.6745, inc: 1.08, color: '#8a7564', colA: '#7a6458', colB: '#9a8676',
  },
  {
    id: 'io', name: 'Io', kind: 'moon', parent: 'jupiter', radius: 1821.6, a: 421700, period: 1.769138, inc: 0.04,
    color: '#e6cf62', style: 'io', relief: 2, bright: 0.8,
    facts: [['Diameter', '3,643 km'], ['Orbit', '1.77 days'], ['Distance', '421,700 km from Jupiter'], ['Active volcanoes', '400+']],
    blurb: 'The most volcanically active world known. Tides from Jupiter knead its interior and power more than 400 active volcanoes.',
  },
  {
    id: 'europa', name: 'Europa', kind: 'moon', parent: 'jupiter', radius: 1560.8, a: 671034, period: 3.551181, inc: 0.47,
    color: '#d9ccb4', style: 'europa', relief: 0.6, bright: 0.85,
    facts: [['Diameter', '3,122 km'], ['Orbit', '3.55 days'], ['Distance', '671,000 km from Jupiter'], ['Ice shell', '15–25 km thick']],
    blurb: 'Beneath its cracked ice shell lies a global salty ocean holding about twice as much water as all of Earth’s oceans.',
  },
  {
    id: 'ganymede', name: 'Ganymede', kind: 'moon', parent: 'jupiter', radius: 2634.1, a: 1070412, period: 7.154553, inc: 0.2,
    color: '#a39784', style: 'ganymede', relief: 2,
    facts: [['Diameter', '5,268 km'], ['Orbit', '7.15 days'], ['Distance', '1.07 million km from Jupiter']],
    blurb: 'The largest moon in the Solar System, bigger than Mercury, and the only moon known to generate its own magnetic field.',
  },
  {
    id: 'callisto', name: 'Callisto', kind: 'moon', parent: 'jupiter', radius: 2410.3, a: 1882709, period: 16.689018, inc: 0.19,
    color: '#6d6153', style: 'callisto', relief: 2.5,
    facts: [['Diameter', '4,821 km'], ['Orbit', '16.7 days'], ['Distance', '1.88 million km from Jupiter']],
    blurb: 'One of the most heavily cratered surfaces known. It has barely changed in four billion years.',
  },
  { id: 'leda', name: 'Leda', kind: 'moon', parent: 'jupiter', radius: 10, a: 11165000, period: 240.92, inc: 27.5, irregular: true, lumpy: 0.12, color: '#8a8072' },
  { id: 'himalia', name: 'Himalia', kind: 'moon', parent: 'jupiter', radius: 70, shape: [75, 60, 65], lumpy: 0.1, a: 11461000, period: 250.56, inc: 27.5, irregular: true, color: '#8a8072' },
  { id: 'lysithea', name: 'Lysithea', kind: 'moon', parent: 'jupiter', radius: 21, a: 11717000, period: 259.2, inc: 28.3, irregular: true, lumpy: 0.12, color: '#8a8072' },
  { id: 'elara', name: 'Elara', kind: 'moon', parent: 'jupiter', radius: 43, a: 11741000, period: 259.64, inc: 26.6, irregular: true, lumpy: 0.1, color: '#8a8072' },
  { id: 'ananke', name: 'Ananke', kind: 'moon', parent: 'jupiter', radius: 14.5, a: 21276000, period: 629.8, inc: 148.9, irregular: true, lumpy: 0.12, color: '#7d756b' },
  { id: 'carme', name: 'Carme', kind: 'moon', parent: 'jupiter', radius: 23, a: 23404000, period: 702.3, inc: 164.9, irregular: true, lumpy: 0.12, color: '#8a7466' },
  { id: 'pasiphae', name: 'Pasiphae', kind: 'moon', parent: 'jupiter', radius: 30, a: 23624000, period: 743.6, inc: 151.4, irregular: true, lumpy: 0.12, color: '#7d756b' },
  { id: 'sinope', name: 'Sinope', kind: 'moon', parent: 'jupiter', radius: 19, a: 23939000, period: 758.9, inc: 158.1, irregular: true, lumpy: 0.12, color: '#8a7466' },
  {
    id: 'saturn', name: 'Saturn', kind: 'planet', order: 6, radius: 60268, polar: 54364, color: '#e3cf9c',
    tex: { map: ['saturn_2k', 'saturn_4k'] }, pole: [40.589, 83.537], W: [38.90, 810.7939024],
    style: 'gas', hexagon: true, rings: 'saturn', view: 6.5, bright: 0.6, subtitle: 'Gas giant · 6th from the Sun',
    atmosphere: { color: [0.9, 0.85, 0.7], thickness: 0.012, intensity: 0.45, mie: 0.4 },
    facts: [['Diameter', '116,460 km'], ['Mass', '95 Earths'], ['Gravity', '10.4 m/s²'],
      ['Day', '10 h 33 min'], ['Year', '29.4 years'], ['Cloud tops', '−140 °C'], ['Known moons', '274']],
    blurb: 'The main rings span about 280,000 km but are mostly only about 10 m thick. Saturn is less dense than water, and a six-sided jet stream circles its north pole.',
    features: [{ name: 'Hexagon jet stream', lat: 77, lon: 0 }, { name: 'North polar vortex', lat: 89.5, lon: 0 }],
    ringFeatures: [
      { name: 'C ring', r: 83000 }, { name: 'B ring', r: 105000 }, { name: 'Cassini Division', r: 119800 },
      { name: 'A ring', r: 127500 }, { name: 'Encke Gap', r: 133590 }, { name: 'F ring', r: 140180 },
    ],
  },
  { id: 'pan', name: 'Pan', kind: 'moon', parent: 'saturn', radius: 14.1, shape: [17.2, 10.4, 15.4], lumpy: 0.08, a: 133584, period: 0.575, color: '#c9bfae', colA: '#b9ae9e', colB: '#d6ccbc' },
  { id: 'daphnis', name: 'Daphnis', kind: 'moon', parent: 'saturn', radius: 3.8, shape: [4.3, 3.2, 4.1], lumpy: 0.1, a: 136505, period: 0.594, color: '#c9bfae', colA: '#b9ae9e', colB: '#d6ccbc' },
  { id: 'atlas', name: 'Atlas', kind: 'moon', parent: 'saturn', radius: 15.1, shape: [20.4, 9.4, 17.7], lumpy: 0.08, a: 137670, period: 0.6019, color: '#c9bfae', colA: '#b9ae9e', colB: '#d6ccbc' },
  { id: 'prometheus', name: 'Prometheus', kind: 'moon', parent: 'saturn', radius: 43.1, shape: [68, 30, 40], lumpy: 0.12, a: 139380, period: 0.613, color: '#c2b8a8', colA: '#b0a594', colB: '#d0c6b6' },
  { id: 'pandora', name: 'Pandora', kind: 'moon', parent: 'saturn', radius: 40.7, shape: [52, 32, 41], lumpy: 0.12, a: 141720, period: 0.6285, color: '#c2b8a8', colA: '#b0a594', colB: '#d0c6b6' },
  { id: 'epimetheus', name: 'Epimetheus', kind: 'moon', parent: 'saturn', radius: 58.1, shape: [65, 53, 57], lumpy: 0.11, a: 151422, period: 0.6942, color: '#c2b8a8', colA: '#ada290', colB: '#cfc5b5' },
  { id: 'janus', name: 'Janus', kind: 'moon', parent: 'saturn', radius: 89.5, shape: [101, 76, 93], lumpy: 0.1, a: 151472, period: 0.6945, color: '#c2b8a8', colA: '#ada290', colB: '#cfc5b5' },
  {
    id: 'mimas', name: 'Mimas', kind: 'moon', parent: 'saturn', radius: 198.2, a: 185539, period: 0.942422, inc: 1.57,
    color: '#c9c4bc', colA: '#b5b0a8', colB: '#d8d4cd', relief: 4, bright: 0.82, bigCrater: [0, -112, 21, 0],
    facts: [['Diameter', '396 km'], ['Orbit', '22.6 hours'], ['Herschel crater', '139 km wide']],
    blurb: 'Its giant Herschel crater, a third of the moon’s width, gives it a famous likeness to the Death Star.',
    features: [{ name: 'Herschel crater', lat: 0, lon: -112 }],
  },
  {
    id: 'enceladus', name: 'Enceladus', kind: 'moon', parent: 'saturn', radius: 252.1, a: 237948, period: 1.370218, inc: 0.01,
    color: '#f1f4f7', style: 'enceladus', relief: 1, bright: 0.7,
    facts: [['Diameter', '504 km'], ['Orbit', '1.37 days'], ['Albedo', '≈ 0.99, the brightest surface known']],
    blurb: 'Geysers at its south pole spray water ice from a hidden ocean, feeding Saturn’s faint E ring.',
    features: [{ name: 'Tiger stripes', lat: -82, lon: 0 }],
  },
  {
    id: 'tethys', name: 'Tethys', kind: 'moon', parent: 'saturn', radius: 531.1, a: 294619, period: 1.887802, inc: 1.09,
    color: '#e3ded6', colA: '#d3cec6', colB: '#efebe5', relief: 3, bright: 0.82, bigCrater: [30, -130, 24, 0],
    facts: [['Diameter', '1,062 km'], ['Orbit', '1.89 days'], ['Odysseus crater', '445 km wide']],
    blurb: 'Made almost entirely of water ice. Its Odysseus crater spans 445 km, two-fifths of the moon’s width.',
    features: [{ name: 'Odysseus crater', lat: 30, lon: -130 }],
  },
  {
    id: 'dione', name: 'Dione', kind: 'moon', parent: 'saturn', radius: 561.4, a: 377396, period: 2.736915, inc: 0.03,
    color: '#d8d4ce', colA: '#c9c4bd', colB: '#ebe8e3', style: 'wispy', relief: 3, bright: 0.82,
    facts: [['Diameter', '1,123 km'], ['Orbit', '2.74 days']],
    blurb: 'Bright ice cliffs hundreds of kilometres long streak across its trailing hemisphere.',
  },
  {
    id: 'rhea', name: 'Rhea', kind: 'moon', parent: 'saturn', radius: 763.8, a: 527108, period: 4.518212, inc: 0.35,
    color: '#cec8bf', colA: '#bfb8ae', colB: '#e2ddd6', style: 'wispy', relief: 3, bright: 0.82,
    facts: [['Diameter', '1,527 km'], ['Orbit', '4.52 days']],
    blurb: 'Saturn’s second-largest moon, a cold, cratered ball of ice and rock.',
  },
  {
    id: 'titan', name: 'Titan', kind: 'moon', parent: 'saturn', radius: 2574.7, a: 1221870, period: 15.945421, inc: 0.35,
    color: '#d9a650', style: 'titan', relief: 0, view: 3.6, bright: 0.8,
    atmosphere: { color: [0.9, 0.55, 0.22], thickness: 0.14, intensity: 0.5, mie: 0.5, scale: 0.35 },
    facts: [['Diameter', '5,150 km'], ['Orbit', '15.9 days'], ['Surface pressure', '1.5 bar'], ['Surface', '−179 °C']],
    blurb: 'Its air is thicker than Earth’s, and it has lakes of liquid methane and ethane. NASA’s Dragonfly rotorcraft is due to arrive in 2034.',
  },
  {
    id: 'hyperion', name: 'Hyperion', kind: 'moon', parent: 'saturn', radius: 135, shape: [180, 103, 133], lumpy: 0.2,
    a: 1481010, period: 21.276609, inc: 0.43, e: 0.123, spin: 13, color: '#b09a80', colA: '#8f7c66', colB: '#c9b9a2', craters: 1.6,
    blurb: 'A sponge-like moon that tumbles chaotically, so its rotation cannot be predicted.',
  },
  {
    id: 'iapetus', name: 'Iapetus', kind: 'moon', parent: 'saturn', radius: 734.5, a: 3560820, period: 79.3215, inc: 15.47,
    color: '#a69c8e', colA: '#d8d0c4', colB: '#2e241b', style: 'iapetus', relief: 3,
    facts: [['Diameter', '1,469 km'], ['Orbit', '79.3 days']],
    blurb: 'Two-toned: its leading hemisphere is as dark as coal while the trailing side is as bright as snow.',
    features: [{ name: 'Cassini Regio (dark side)', lat: 0, lon: -90 }],
  },
  {
    id: 'phoebe', name: 'Phoebe', kind: 'moon', parent: 'saturn', radius: 106.5, shape: [109, 102, 109], lumpy: 0.08,
    a: 12947780, period: 550.31, inc: 175.3, irregular: true, spin: 0.386, color: '#56504a', colA: '#433d38', colB: '#625b54',
    blurb: 'A captured world that orbits backwards, probably a refugee from the outer Solar System.',
  },
  {
    id: 'uranus', name: 'Uranus', kind: 'planet', order: 7, radius: 25559, polar: 24973, color: '#9fd8e0',
    tex: { map: ['uranus_2k'] }, pole: [257.311, -15.175], W: [203.81, -501.1600928], style: 'gas', rings: 'uranus', bright: 0.6,
    view: 4.0, subtitle: 'Ice giant · 7th from the Sun',
    atmosphere: { color: [0.55, 0.85, 0.95], thickness: 0.02, intensity: 0.7, mie: 0.3 },
    facts: [['Diameter', '50,724 km'], ['Mass', '14.5 Earths'], ['Gravity', '8.69 m/s²'],
      ['Day', '17 h 14 min (backwards)'], ['Year', '84 years'], ['Temperature', '−195 °C'], ['Known moons', '29']],
    blurb: 'Tipped over by 98°, Uranus rolls around the Sun on its side, so each pole gets about 42 years of continuous daylight.',
  },
  { id: 'cordelia', name: 'Cordelia', kind: 'moon', parent: 'uranus', radius: 20, lumpy: 0.12, a: 49770, period: 0.335034, inc: 0.08, color: '#666260' },
  { id: 'ophelia', name: 'Ophelia', kind: 'moon', parent: 'uranus', radius: 21, lumpy: 0.12, a: 53790, period: 0.3764, inc: 0.1, color: '#666260' },
  { id: 'bianca', name: 'Bianca', kind: 'moon', parent: 'uranus', radius: 25.7, lumpy: 0.12, a: 59170, period: 0.434579, inc: 0.19, color: '#666260' },
  { id: 'cressida', name: 'Cressida', kind: 'moon', parent: 'uranus', radius: 39.8, lumpy: 0.1, a: 61780, period: 0.46357, inc: 0.01, color: '#666260' },
  { id: 'desdemona', name: 'Desdemona', kind: 'moon', parent: 'uranus', radius: 32, lumpy: 0.1, a: 62680, period: 0.47365, inc: 0.11, color: '#666260' },
  { id: 'juliet', name: 'Juliet', kind: 'moon', parent: 'uranus', radius: 46.8, lumpy: 0.1, a: 64350, period: 0.493066, inc: 0.07, color: '#666260' },
  { id: 'portia', name: 'Portia', kind: 'moon', parent: 'uranus', radius: 67.6, lumpy: 0.08, a: 66090, period: 0.513196, inc: 0.06, color: '#666260' },
  { id: 'rosalind', name: 'Rosalind', kind: 'moon', parent: 'uranus', radius: 36, lumpy: 0.1, a: 69940, period: 0.55846, inc: 0.28, color: '#666260' },
  { id: 'belinda', name: 'Belinda', kind: 'moon', parent: 'uranus', radius: 40.3, lumpy: 0.1, a: 75260, period: 0.623527, inc: 0.03, color: '#666260' },
  { id: 'puck', name: 'Puck', kind: 'moon', parent: 'uranus', radius: 81, lumpy: 0.06, a: 86010, period: 0.761833, inc: 0.32, color: '#6d6865' },
  {
    id: 'miranda', name: 'Miranda', kind: 'moon', parent: 'uranus', radius: 235.8, a: 129390, period: 1.413479, inc: 4.34,
    color: '#b8b3ad', colA: '#a39e98', colB: '#cdc9c3', style: 'miranda', relief: 4,
    blurb: 'A patchwork world. Its cliff Verona Rupes drops about 20 km, perhaps the tallest cliff in the Solar System.',
  },
  {
    id: 'ariel', name: 'Ariel', kind: 'moon', parent: 'uranus', radius: 578.9, a: 191020, period: 2.520379, inc: 0.26,
    color: '#c8c2ba', colA: '#b3ada5', colB: '#dcd7d0', relief: 3, craters: 0.7,
    blurb: 'The brightest of Uranus’s large moons, cut by long rift valleys.',
  },
  {
    id: 'umbriel', name: 'Umbriel', kind: 'moon', parent: 'uranus', radius: 584.7, a: 266000, period: 4.144177, inc: 0.13,
    color: '#6a6560', colA: '#5a5550', colB: '#76706a', relief: 3, bigCrater: [-10, 86, 6, 1],
    blurb: 'The darkest of Uranus’s large moons, marked by a mysterious bright ring called Wunda.',
    features: [{ name: 'Wunda', lat: -10, lon: 86 }],
  },
  {
    id: 'titania', name: 'Titania', kind: 'moon', parent: 'uranus', radius: 788.4, a: 435910, period: 8.705872, inc: 0.34,
    color: '#b4a89b', colA: '#a3978a', colB: '#c4b8ab', relief: 3,
    blurb: 'Uranus’s largest moon, scarred by canyons up to 1,500 km long.',
  },
  {
    id: 'oberon', name: 'Oberon', kind: 'moon', parent: 'uranus', radius: 761.4, a: 583520, period: 13.463239, inc: 0.06,
    color: '#a29384', colA: '#8f8071', colB: '#b3a597', relief: 3, craters: 1.3,
    blurb: 'The outermost large moon of Uranus: old, dark and heavily cratered.',
  },
  { id: 'sycorax', name: 'Sycorax', kind: 'moon', parent: 'uranus', radius: 75, lumpy: 0.08, a: 12179000, period: 1288.3, inc: 159.4, irregular: true, color: '#9c7a66' },
  {
    id: 'neptune', name: 'Neptune', kind: 'planet', order: 8, radius: 24764, polar: 24341, color: '#5b7ff0',
    tex: { map: ['neptune_2k'] }, pole: [299.36, 43.46], W: [249.978, 541.1397757], style: 'gas', rings: 'neptune', bright: 0.8,
    view: 3.6, subtitle: 'Ice giant · 8th from the Sun',
    atmosphere: { color: [0.35, 0.55, 1.0], thickness: 0.02, intensity: 0.75, mie: 0.3 },
    facts: [['Diameter', '49,244 km'], ['Mass', '17.1 Earths'], ['Gravity', '11.2 m/s²'],
      ['Day', '16 h 6 min'], ['Year', '164.8 years'], ['Temperature', '−200 °C'], ['Known moons', '16']],
    blurb: 'Winds here reach 2,100 km/h, the fastest measured on any planet. It was predicted by mathematics before anyone saw it through a telescope.',
  },
  { id: 'naiad', name: 'Naiad', kind: 'moon', parent: 'neptune', radius: 33, shape: [48, 26, 30], lumpy: 0.1, a: 48227, period: 0.294396, inc: 4.69, color: '#5f5955' },
  { id: 'thalassa', name: 'Thalassa', kind: 'moon', parent: 'neptune', radius: 41, shape: [54, 26, 50], lumpy: 0.1, a: 50074, period: 0.311485, inc: 0.14, color: '#5f5955' },
  { id: 'despina', name: 'Despina', kind: 'moon', parent: 'neptune', radius: 75, shape: [90, 64, 74], lumpy: 0.1, a: 52526, period: 0.334655, inc: 0.07, color: '#5f5955' },
  { id: 'galatea', name: 'Galatea', kind: 'moon', parent: 'neptune', radius: 88, shape: [102, 72, 92], lumpy: 0.1, a: 61953, period: 0.428745, inc: 0.05, color: '#5f5955' },
  { id: 'larissa', name: 'Larissa', kind: 'moon', parent: 'neptune', radius: 97, shape: [108, 84, 102], lumpy: 0.1, a: 73548, period: 0.554654, inc: 0.2, color: '#5f5955' },
  { id: 'hippocamp', name: 'Hippocamp', kind: 'moon', parent: 'neptune', radius: 17, lumpy: 0.12, a: 105283, period: 0.95, inc: 0.06, color: '#5f5955' },
  {
    id: 'proteus', name: 'Proteus', kind: 'moon', parent: 'neptune', radius: 210, shape: [218, 201, 208], lumpy: 0.09,
    a: 117647, period: 1.122315, inc: 0.52, color: '#5c5652', colA: '#4f4945', colB: '#6b6460',
    blurb: 'Nearly as large as a body can be without its own gravity pulling it into a sphere.',
  },
  {
    id: 'triton', name: 'Triton', kind: 'moon', parent: 'neptune', radius: 1353.4, a: 354759, period: 5.876854, inc: 156.885,
    color: '#d9c3b8', style: 'triton', relief: 1.5, bright: 0.72,
    atmosphere: { color: [0.5, 0.65, 1.0], thickness: 0.02, intensity: 0.15, mie: 0.2 },
    facts: [['Diameter', '2,707 km'], ['Orbit', '5.88 days (backwards)'], ['Surface', '−235 °C']],
    blurb: 'It orbits backwards, so it was probably captured from the Kuiper Belt. Voyager 2 saw nitrogen geysers erupting here in 1989.',
    features: [{ name: 'South polar cap', lat: -45, lon: 30 }],
  },
  {
    id: 'nereid', name: 'Nereid', kind: 'moon', parent: 'neptune', radius: 170, lumpy: 0.05, a: 5513818, period: 360.13, e: 0.7507,
    inc: 7.09, irregular: true, spin: 0.48, color: '#8f8a85',
    blurb: 'One of the most eccentric orbits of any moon: it swings between 1.4 and 9.7 million km from Neptune.',
  },
  {
    id: 'pluto', name: 'Pluto', kind: 'dwarf', order: 9, radius: 1188.3, color: '#d7b99a', style: 'pluto', relief: 2, bright: 0.78,
    pole: [132.993, -6.163], W: [302.695, 56.3625225], view: 3.4, subtitle: 'Dwarf planet · Kuiper Belt',
    atmosphere: { color: [0.4, 0.6, 1.0], thickness: 0.035, intensity: 0.35, mie: 0.2 },
    facts: [['Diameter', '2,377 km'], ['Mass', '0.0022 Earths'], ['Gravity', '0.62 m/s²'],
      ['Day', '6.4 days (backwards)'], ['Year', '248 years'], ['Temperature', '−229 °C'], ['Moons', '5']],
    blurb: 'Its bright heart, Tombaugh Regio, holds a glacier of frozen nitrogen. Pluto and Charon are tidally locked: each always shows the other the same face.',
    features: [{ name: 'Tombaugh Regio (the heart)', lat: 15, lon: 178 }, { name: 'Sputnik Planitia', lat: 20, lon: 175 },
      { name: 'Cthulhu Macula', lat: -10, lon: 105 }],
  },
  {
    id: 'charon', name: 'Charon', kind: 'moon', parent: 'pluto', radius: 606, a: 19591, period: 6.387221, inc: 0.0,
    color: '#a39d97', style: 'charon', relief: 2.5, bright: 0.85,
    facts: [['Diameter', '1,212 km'], ['Orbit', '6.39 days'], ['Distance', '19,591 km from Pluto']],
    blurb: 'Half Pluto’s size, so the pair orbit a point in space between them. Its reddish north pole is nicknamed Mordor Macula.',
    features: [{ name: 'Mordor Macula', lat: 85, lon: 0 }],
  },
  { id: 'styx', name: 'Styx', kind: 'moon', parent: 'pluto', radius: 6, shape: [8, 4, 5], lumpy: 0.1, a: 42656, period: 20.16155, color: '#bdbdbd' },
  { id: 'nix', name: 'Nix', kind: 'moon', parent: 'pluto', radius: 19, shape: [25, 16.5, 17.5], lumpy: 0.1, a: 48694, period: 24.85463, color: '#d2d2d2', colA: '#c2c2c2', colB: '#dedede' },
  { id: 'kerberos', name: 'Kerberos', kind: 'moon', parent: 'pluto', radius: 6, shape: [9.5, 4.5, 5], lumpy: 0.1, a: 57783, period: 32.16756, color: '#c4c4c4' },
  { id: 'hydra', name: 'Hydra', kind: 'moon', parent: 'pluto', radius: 19, shape: [25.5, 16, 18.5], lumpy: 0.1, a: 64738, period: 38.20177, color: '#d6d6d6', colA: '#c8c8c8', colB: '#e2e2e2' },
];

// Fill in defaults and short facts for small moons.
for (const b of BODIES) {
  if (b.kind !== 'moon') continue;
  b.subtitle ||= `Moon of ${BODIES.find((p) => p.id === b.parent).name}`;
  const size = b.shape ? b.shape.map((s) => Math.round(s * 2)).join(' × ') + ' km' : `${E(Math.round(b.radius * 2))} km`;
  b.facts ||= [[b.shape ? 'Size' : 'Diameter', size], ['Orbit', formatPeriod(b.period)], ['Distance', `${E(b.a)} km from ${BODIES.find((p) => p.id === b.parent).name}`]];
  if (b.irregular) b.facts.push(['Orbit type', b.inc > 90 ? 'Irregular, backwards' : 'Irregular, captured']);
  b.blurb ||= `A small ${b.irregular ? 'captured ' : ''}moon of ${BODIES.find((p) => p.id === b.parent).name}, about ${E(Math.round(b.radius * 2))} km across.`;
}

function formatPeriod(days) {
  if (days < 1) return `${(days * 24).toFixed(1)} hours`;
  if (days < 400) return `${days.toFixed(days < 10 ? 2 : 1)} days`;
  return `${(days / 365.25).toFixed(1)} years`;
}

export const BODY_BY_ID = Object.fromEntries(BODIES.map((b) => [b.id, b]));
