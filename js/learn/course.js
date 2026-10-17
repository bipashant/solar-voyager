// The courses: their lessons in order, and how they're sold. Lesson pages live in lessons/, the index is learn.html.
// Lesson ids are unique across every course (progress and narration are filed under them).

export const COURSES = [
  {
    id: 'how-the-sky-works',
    title: 'How the Sky Works',
    tagline: 'Six lessons on the things you can see from your own back garden: day and night, the seasons, the Moon, eclipses, the planets and the sheer size of it all.',
    ages: 'Ages 7 to 16',
    color: '#ffb547',
    lessons: [
      {
        id: 'day-night', file: 'day-and-night.html', title: 'Day and night', color: '#ffb547',
        question: 'Why does the Sun rise and set?', grades: 'Ages 7–11', minutes: 15,
        blurb: 'Watch Earth spin in sunlight, see city lights switch on at dusk, and find out why it’s night somewhere right now.',
        big: 'Earth’s rotation makes the Sun rise, set, and give us day/night', fits: 'NGSS 1-ESS1-1 · England Y5 Earth and space',
      },
      {
        id: 'seasons', file: 'seasons.html', title: 'The seasons', color: '#7ee0a1',
        question: 'Why is summer hot and winter cold?', grades: 'Ages 9–14', minutes: 20,
        blurb: 'It isn’t how close we are to the Sun. Follow Earth’s tilted axis around a whole year and see the midnight Sun.',
        big: 'Earth’s tilted axis, not its distance from the Sun, causes the seasons', fits: 'NGSS 5-ESS1-2, MS-ESS1-1 · England Y5–Y6',
      },
      {
        id: 'moon-phases', file: 'moon-phases.html', title: 'Phases of the Moon', color: '#c9d6ff',
        question: 'Why does the Moon change shape?', grades: 'Ages 8–14', minutes: 20,
        blurb: 'Ride along with the Moon for a month and see why half of it is always lit, even when we see a sliver.',
        big: 'Phases come from the geometry of Sun, Earth and Moon over a month', fits: 'NGSS 1-ESS1-1, MS-ESS1-1 · England Y5',
      },
      {
        id: 'eclipses', file: 'eclipses.html', title: 'How eclipses happen', color: '#ff7a66',
        question: 'How can the Moon hide the Sun?', grades: 'Ages 10–16', minutes: 25,
        blurb: 'Stand in the Moon’s shadow on 8 April 2024, watch a blood moon, and learn why eclipses don’t happen every month.',
        big: 'Shadows, orbital tilt and why eclipse seasons come twice a year', fits: 'NGSS MS-ESS1-1 · England KS3',
      },
      {
        id: 'planet-race', file: 'planet-race.html', title: 'The planet race', color: '#c7b4ff',
        question: 'Why do some planets have longer years?', grades: 'Ages 11–18', minutes: 20,
        blurb: 'Speed time up to a month per second and watch the planets race. Discover Kepler’s rule for how fast worlds orbit.',
        big: 'Orbital period grows with distance (an intuition for Kepler’s third law)', fits: 'NGSS MS-ESS1-2, 3 · England KS3 Earth and space',
      },
      {
        id: 'how-far', file: 'how-far.html', title: 'How far is far?', color: '#6fe3ff',
        question: 'How big is the Solar System, really?', grades: 'Ages 9–18', minutes: 20,
        blurb: 'Ride a beam of light from Earth to the Moon, the Sun and Neptune, and build a scale model you could walk.',
        big: 'Scales of the Solar System and the speed of light', fits: 'NGSS 5-ESS1-1, MS-ESS1-3 · England Y5',
      },
    ],
  },
  {
    id: 'tour-of-the-planets',
    title: 'A Tour of the Planets',
    tagline: 'Five lessons, one world at a time. Start at the Sun, work outwards, and watch each planet do the thing it’s famous for.',
    ages: 'Ages 9 to 16',
    color: '#e0835a',
    lessons: [
      {
        id: 'sun', file: 'our-star.html', title: 'Our star', color: '#ffd36e',
        question: 'What is the Sun, and how big is it really?', grades: 'Ages 9 to 14', minutes: 20,
        blurb: 'Watch the Sun turn on its axis, then see how big it looks from Mercury, from Earth and from out past Neptune.',
        big: 'The Sun is a star: its size, its spin, and why sunlight fades with distance', fits: 'NGSS 5-ESS1-1, MS-ESS1-2 · England Y5, KS3',
      },
      {
        id: 'inner', file: 'mercury-and-venus.html', title: 'Mercury and Venus', color: '#e8cf9a',
        question: 'Why does Venus change shape in a telescope?', grades: 'Ages 10 to 16', minutes: 20,
        blurb: 'Track Venus for a year and a half as it swells into a thin crescent, the clue that convinced Galileo the Earth goes round the Sun.',
        big: 'Phases of Venus as evidence for a Sun-centred system; rotation versus orbit', fits: 'NGSS MS-ESS1-2, HS-ESS1-4 · England KS3',
      },
      {
        id: 'mars', file: 'mars.html', title: 'Mars, up close', color: '#e0835a',
        question: 'What is Mars like, and when can we go?', grades: 'Ages 9 to 16', minutes: 20,
        blurb: 'Fly over the biggest volcano in the Solar System, watch Phobos race round, and see why rockets to Mars leave every 26 months.',
        big: 'Surface features of another planet; orbits set when spacecraft can launch', fits: 'NGSS MS-ESS1-3, MS-ETS1-1 · England KS3',
      },
      {
        id: 'jupiter', file: 'jupiter.html', title: 'Jupiter and its moons', color: '#d8b48c',
        question: 'What did Galileo see that changed everything?', grades: 'Ages 9 to 16', minutes: 20,
        blurb: 'See the four moons Galileo found in 1610 swing back and forth, then watch a moon’s shadow slide across Jupiter’s clouds.',
        big: 'Moons orbiting another planet; how observations overturned an old model', fits: 'NGSS MS-ESS1-2, MS-ESS1-3 · England KS3',
      },
      {
        id: 'giants', file: 'rings-and-ice-giants.html', title: 'Rings and sideways worlds', color: '#9fd8e0',
        question: 'Why do Saturn’s rings sometimes disappear?', grades: 'Ages 10 to 16', minutes: 25,
        blurb: 'Watch Saturn’s rings close to a thin line in 2025 and open again, then meet Uranus, the planet that rolls round the Sun on its side.',
        big: 'Axial tilt seen from outside; ring systems; seasons on other planets', fits: 'NGSS MS-ESS1-2, MS-ESS1-3 · England KS3',
      },
    ],
  },
  {
    id: 'gravity-stars-galaxies',
    title: 'Gravity, Stars and Galaxies',
    tagline: 'Five lessons for older explorers. What holds it all together, why the night sky changes, where stars come from, and how far out it goes.',
    ages: 'Ages 11 to 18',
    color: '#b4a0ff',
    lessons: [
      {
        id: 'gravity', file: 'gravity.html', title: 'Falling around the Sun', color: '#b4a0ff',
        question: 'Why don’t the planets fall into the Sun?', grades: 'Ages 11 to 18', minutes: 25,
        blurb: 'Switch on the gravity grid and see the dent the Sun makes in space. Then fire Newton’s cannon and find the speed that never lands.',
        big: 'Gravity and orbital motion; a first look at curved spacetime', fits: 'NGSS MS-ESS1-2, HS-PS2-4, HS-ESS1-4 · England KS3, KS4',
      },
      {
        id: 'one-face', file: 'one-face.html', title: 'The Moon’s hidden side', color: '#c9d6ff',
        question: 'Why do we only ever see one side of the Moon?', grades: 'Ages 10 to 16', minutes: 20,
        blurb: 'The Moon does spin, just very slowly. Follow it for a month from above and from Earth, then meet Pluto and Charon, who are locked face to face.',
        big: 'Rotation and revolution; tidal locking; tides', fits: 'NGSS MS-ESS1-1, HS-ESS1-4 · England KS3',
      },
      {
        id: 'star-calendar', file: 'stars-through-the-year.html', title: 'Stars through the year', color: '#93d6ff',
        question: 'Why do we see different stars in winter and summer?', grades: 'Ages 10 to 16', minutes: 20,
        blurb: 'Watch the Sun drift through the zodiac over a year, and see why Orion belongs to December nights and Scorpius to June.',
        big: 'Earth’s orbit changes which stars are in the night sky; the ecliptic and zodiac', fits: 'NGSS 5-ESS1-2, MS-ESS1-1 · England Y5, KS3',
      },
      {
        id: 'star-life', file: 'life-of-a-star.html', title: 'The life of a star', color: '#ff8fb0',
        question: 'Where do stars come from, and how do they end?', grades: 'Ages 11 to 18', minutes: 25,
        blurb: 'Visit the Orion Nebula where stars are being born, the young Pleiades, and the glowing wrecks that dead stars leave behind.',
        big: 'Star formation, the life cycle of stars by mass, and the elements they make', fits: 'NGSS HS-ESS1-1, HS-ESS1-3 · England KS4 Physics',
      },
      {
        id: 'galaxies', file: 'galaxies.html', title: 'Our galaxy and beyond', color: '#e9d7b0',
        question: 'Where are we in the universe?', grades: 'Ages 11 to 18', minutes: 25,
        blurb: 'Back away from the Sun until the whole Milky Way fits in the frame, then visit Andromeda and the giant galaxy whose black hole was photographed.',
        big: 'Galaxies, the Milky Way, and light-travel time as looking back in time', fits: 'NGSS HS-ESS1-2, MS-ESS1-2 · England KS4',
      },
    ],
  },
];

export const LESSONS = COURSES.flatMap((c) => c.lessons);

// Where a lesson sits: its course, its place in that course, and its place in the whole catalogue.
export function findLesson(id) {
  for (const [ci, course] of COURSES.entries()) {
    const index = course.lessons.findIndex((l) => l.id === id);
    if (index >= 0) return { course, courseIndex: ci, lesson: course.lessons[index], index };
  }
  return null;
}

// Access. While PAYWALL is false every lesson is open (development, or a free launch). Turn it on once
// checkout is wired up: lessons not in FREE_LESSONS then show a sign-up card until the visitor has a pass.
export const PAYWALL = false;
export const FREE_LESSONS = ['day-night', 'eclipses', 'sun', 'gravity'];
export const CHECKOUT_URL = ''; // e.g. a Stripe Payment Link; empty shows "coming soon"

// Placeholder pricing to compare a one-time purchase with a subscription. Change freely.
export const PLANS = [
  {
    id: 'free', name: 'Explorer', price: 'Free', per: '', cta: 'Start learning',
    points: ['The first lesson of each course, plus Eclipses', 'The full Solar Voyager app', 'Progress saved on your device'],
  },
  {
    id: 'family', name: 'Family pass', price: '$29', per: 'one time', cta: 'Get the family pass', featured: true,
    points: ['All three courses, all 16 lessons, for good', 'Up to 5 learners on one device', 'New lessons as they’re added'],
  },
  {
    id: 'classroom', name: 'Classroom', price: '$6', per: 'per month', cta: 'Start a classroom',
    points: ['Every course, for a whole class', 'Teacher notes and standards mapping', 'New courses every term'],
  },
];

export const isLocked = (id, hasPass = false) => PAYWALL && !hasPass && !FREE_LESSONS.includes(id);
