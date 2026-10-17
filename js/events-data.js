// Notable eclipses, alignments and transits between 1999 and 2027, with the moment of greatest eclipse or
// closest approach (UTC) and a few points of view for each. A point of view is a link into the main app
// (see viewlink.js): the world to orbit, a pov rule and a height, worked out from the real positions then.

const KM_AU = 149597870.7;

function solarEclipse(at) {
  return [
    { label: 'Shadow on Earth', note: 'The Moon’s shadow racing across the day side', p: { at: 'earth', pov: 'from:moon', alt: 52000, time: at } },
    { label: 'Moon covers the Sun', note: 'From the path of totality: the Moon’s dark disc and the corona', p: { at: 'moon', pov: 'behind:sun', time: at } },
    { label: 'Lined up', note: 'Earth and Moon side-on, in line with the Sun', p: { at: 'earth', pov: 'side:sun', alt: 900000, time: at } },
  ];
}
function lunarEclipse(at) {
  return [
    { label: 'Moon in Earth’s shadow', note: 'Close to the Moon, from the Earth side, as it goes dark', p: { at: 'moon', pov: 'from:earth', alt: 9000, time: at } },
    { label: 'Earth hides the Sun', note: 'Behind Earth, where the Moon is: the Sun hidden, the sky glowing at the edge', p: { at: 'earth', pov: 'behind:sun', alt: 60000, time: at } },
    { label: 'Lined up', note: 'Earth and Moon side-on, in line with the Sun', p: { at: 'earth', pov: 'side:sun', alt: 1100000, time: at } },
  ];
}
const fromEarth = (at, id, label = `${id[0].toUpperCase()}${id.slice(1)} from Earth`, note = 'As you would see it from Earth') => ({ label, note, p: { at: id, pov: 'from:earth', time: at } });
const topDown = (at, au, note = 'The planets where they were, seen from above') => ({ label: 'From above', note, p: { at: 'sun', pov: 'top', alt: au * KM_AU, time: at } });

export const EVENTS = [
  {
    id: 'tse-1999', kind: 'eclipse', title: 'Total solar eclipse over Europe', time: '1999-08-11T11:03Z',
    where: 'Cornwall to France, Germany, Romania, Turkey, Iran and India',
    blurb: 'The last total eclipse of the millennium, watched by more people than any before it. Totality lasted up to 2 min 23 s.',
    povs: solarEclipse('1999-08-11T11:03Z'),
  },
  {
    id: 'mars-2003', kind: 'alignment', title: 'Mars at its closest in 60,000 years', time: '2003-08-27T09:51Z',
    where: 'Anywhere on Earth, all night',
    blurb: 'Mars came within 55.76 million km of Earth, closer than at any time since the Stone Age. It will not be that close again until 2287.',
    povs: [fromEarth('2003-08-27T09:51Z', 'mars'), topDown('2003-08-27T09:51Z', 2.6, 'Earth overtaking Mars on the inside track'), { label: 'Earth from Mars', note: 'Earth and the Moon, seen from Mars', p: { at: 'earth', pov: 'from:mars', time: '2003-08-27T09:51Z' } }],
  },
  {
    id: 'venus-2012', kind: 'transit', title: 'Transit of Venus', time: '2012-06-06T01:29Z',
    where: 'The Pacific, East Asia, Australia, Alaska and western North America',
    blurb: 'Venus crossed the face of the Sun for six hours. Transits come in pairs eight years apart, then not for over a century: the next is in December 2117.',
    povs: [fromEarth('2012-06-06T01:29Z', 'venus', 'Venus against the Sun', 'From Earth, Venus is the black dot on the Sun'), topDown('2012-06-06T01:29Z', 1.6, 'Venus passing exactly between Earth and the Sun')],
  },
  {
    id: 'tse-2017', kind: 'eclipse', title: 'The Great American Eclipse', time: '2017-08-21T18:25Z',
    where: 'Coast to coast across the USA, from Oregon to South Carolina',
    blurb: 'The first total eclipse to cross the whole United States since 1918. Totality lasted up to 2 min 40 s.',
    povs: solarEclipse('2017-08-21T18:25Z'),
  },
  {
    id: 'mercury-2019', kind: 'transit', title: 'Transit of Mercury', time: '2019-11-11T15:20Z',
    where: 'The Americas, Europe, Africa and western Asia',
    blurb: 'Mercury, a dot 1/194 of the Sun’s width, took five and a half hours to cross the solar disc. The next transit is in November 2032.',
    povs: [fromEarth('2019-11-11T15:20Z', 'mercury', 'Mercury against the Sun', 'From Earth, Mercury is a tiny dot on the Sun'), topDown('2019-11-11T15:20Z', 1.4, 'Mercury between Earth and the Sun')],
  },
  {
    id: 'great-2020', kind: 'alignment', title: 'The Great Conjunction', time: '2020-12-21T18:20Z',
    where: 'Low in the south-west after sunset, worldwide',
    blurb: 'Jupiter and Saturn appeared just 0.1° apart, a fifth of the Moon’s width: the closest they had looked since 1623.',
    povs: [fromEarth('2020-12-21T18:20Z', 'jupiter', 'Jupiter and Saturn from Earth', 'Two worlds 730 million km apart, side by side in the sky'), topDown('2020-12-21T18:20Z', 13, 'Earth, Jupiter and Saturn nearly in a line'), { label: 'Saturn behind Jupiter', note: 'From beyond Jupiter, looking out towards Saturn', p: { at: 'jupiter', pov: 'behind:saturn', alt: 2500000, time: '2020-12-21T18:20Z' } }],
  },
  {
    id: 'tle-2022', kind: 'lunar', title: 'Total lunar eclipse (Blood Moon)', time: '2022-11-08T10:59Z',
    where: 'East Asia, Australia, the Pacific and North America',
    blurb: 'The last total lunar eclipse until 2025. Uranus passed close behind the eclipsed Moon at the same time.',
    povs: lunarEclipse('2022-11-08T10:59Z'),
  },
  {
    id: 'vj-2023', kind: 'alignment', title: 'Venus and Jupiter side by side', time: '2023-03-01T18:00Z',
    where: 'In the west after sunset, worldwide',
    blurb: 'The two brightest planets drew within half a degree of each other, close enough to cover with a fingertip.',
    povs: [fromEarth('2023-03-01T18:00Z', 'jupiter', 'Venus and Jupiter from Earth', 'Venus in front, Jupiter 700 million km behind it'), topDown('2023-03-01T18:00Z', 6.5)],
  },
  {
    id: 'tse-2024', kind: 'eclipse', title: 'Total solar eclipse over North America', time: '2024-04-08T18:17Z',
    where: 'Mexico, the USA from Texas to Maine, and eastern Canada',
    blurb: 'Totality lasted up to 4 min 28 s, nearly twice as long as in 2017, and 32 million people lived in its path.',
    povs: solarEclipse('2024-04-08T18:17Z'),
  },
  {
    id: 'parade-2025', kind: 'alignment', title: 'Seven-planet parade', time: '2025-02-28T18:00Z',
    where: 'In the evening sky, worldwide (Uranus and Neptune need binoculars)',
    blurb: 'Every planet from Mercury to Neptune was in the sky after sunset at once, strung along the path of the Sun.',
    povs: [topDown('2025-02-28T18:00Z', 34, 'All seven, on the same side of the Sun as seen from Earth'), fromEarth('2025-02-28T18:00Z', 'jupiter', 'Looking out from Earth', 'Towards Jupiter, with the other planets along the ecliptic')],
  },
  {
    id: 'tle-2025-mar', kind: 'lunar', title: 'Total lunar eclipse', time: '2025-03-14T06:58Z',
    where: 'The Americas, western Europe and western Africa',
    blurb: 'The first total lunar eclipse in over two years, with 65 minutes of totality.',
    povs: lunarEclipse('2025-03-14T06:58Z'),
  },
  {
    id: 'tle-2025-sep', kind: 'lunar', title: 'Total lunar eclipse over Asia', time: '2025-09-07T18:11Z',
    where: 'Asia, Australia, Africa and Europe',
    blurb: 'Seen by more of the world’s population than any lunar eclipse in years, with 82 minutes of totality.',
    povs: lunarEclipse('2025-09-07T18:11Z'),
  },
  {
    id: 'tle-2026', kind: 'lunar', title: 'Total lunar eclipse', time: '2026-03-03T11:33Z',
    where: 'East Asia, Australia, the Pacific and the Americas',
    blurb: 'A 58-minute total eclipse, the last until the end of 2028.',
    povs: lunarEclipse('2026-03-03T11:33Z'),
  },
  {
    id: 'tse-2026', kind: 'eclipse', title: 'Total solar eclipse over Spain', time: '2026-08-12T17:46Z',
    where: 'Greenland, Iceland and northern Spain',
    blurb: 'The first total eclipse visible from mainland Europe since 1999, with the Sun low in the evening sky over Spain.',
    povs: solarEclipse('2026-08-12T17:46Z'),
  },
  {
    id: 'tse-2027', kind: 'eclipse', title: 'Eclipse of the century', time: '2027-08-02T10:07Z',
    where: 'Spain, North Africa, Egypt and Saudi Arabia',
    blurb: 'Totality lasts 6 min 23 s near Luxor, the longest over land between 1991 and 2114.',
    povs: solarEclipse('2027-08-02T10:07Z'),
  },
];

export const KINDS = {
  eclipse: { label: 'Solar eclipse', color: '#ffb547' },
  lunar: { label: 'Lunar eclipse', color: '#ff7a66' },
  alignment: { label: 'Alignment', color: '#93d6ff' },
  transit: { label: 'Transit', color: '#c7b4ff' },
};

// The app link for one point of view: paused on the moment, with the event's destination left alone.
export function povLink(p, base = 'index.html', ev = null, v = 0) {
  const q = new URLSearchParams();
  if (ev) { q.set('ev', ev); q.set('v', String(v)); } // lets the app show the event's viewpoint bar
  q.set('at', p.at);
  q.set('pov', p.pov);
  if (p.alt) q.set('alt', String(Math.round(p.alt)));
  q.set('time', p.time);
  q.set('rate', 'pause');
  return `${base}#${q.toString().replace(/%3A/g, ':')}`;
}
