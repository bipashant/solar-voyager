// The course: its lessons in order, and how it's sold. Lesson pages live in lessons/, the index is learn.html.

export const COURSE = {
  id: 'how-the-sky-works',
  title: 'How the Sky Works',
  tagline: 'Six interactive lessons where the real Solar System is your textbook.',
  lessons: [
    {
      id: 'day-night', file: 'day-and-night.html', title: 'Day and night', color: '#ffb547',
      question: 'Why does the Sun rise and set?', grades: 'Ages 7–11', minutes: 15,
      blurb: 'Watch Earth spin in sunlight, see city lights switch on at dusk, and find out why it’s night somewhere right now.',
    },
    {
      id: 'seasons', file: 'seasons.html', title: 'The seasons', color: '#7ee0a1',
      question: 'Why is summer hot and winter cold?', grades: 'Ages 9–14', minutes: 20,
      blurb: 'It isn’t how close we are to the Sun. Follow Earth’s tilted axis around a whole year and see the midnight Sun.',
    },
    {
      id: 'moon-phases', file: 'moon-phases.html', title: 'Phases of the Moon', color: '#c9d6ff',
      question: 'Why does the Moon change shape?', grades: 'Ages 8–14', minutes: 20,
      blurb: 'Ride along with the Moon for a month and see why half of it is always lit, even when we see a sliver.',
    },
    {
      id: 'eclipses', file: 'eclipses.html', title: 'How eclipses happen', color: '#ff7a66',
      question: 'How can the Moon hide the Sun?', grades: 'Ages 10–16', minutes: 25,
      blurb: 'Stand in the Moon’s shadow on 8 April 2024, watch a blood moon, and learn why eclipses don’t happen every month.',
    },
    {
      id: 'planet-race', file: 'planet-race.html', title: 'The planet race', color: '#c7b4ff',
      question: 'Why do some planets have longer years?', grades: 'Ages 11–18', minutes: 20,
      blurb: 'Speed time up to a month per second and watch the planets race. Discover Kepler’s rule for how fast worlds orbit.',
    },
    {
      id: 'how-far', file: 'how-far.html', title: 'How far is far?', color: '#6fe3ff',
      question: 'How big is the Solar System, really?', grades: 'Ages 9–18', minutes: 20,
      blurb: 'Ride a beam of light from Earth to the Moon, the Sun and Neptune, and build a scale model you could walk.',
    },
  ],
};

// Access. While PAYWALL is false every lesson is open (development, or a free launch). Turn it on once
// checkout is wired up: lessons not in FREE_LESSONS then show a sign-up card until the visitor has a pass.
export const PAYWALL = false;
export const FREE_LESSONS = ['day-night', 'eclipses'];
export const CHECKOUT_URL = ''; // e.g. a Stripe Payment Link; empty shows "coming soon"

// Placeholder pricing to compare a one-time purchase with a subscription. Change freely.
export const PLANS = [
  {
    id: 'free', name: 'Explorer', price: 'Free', per: '', cta: 'Start learning',
    points: ['Lesson 1: Day and night', 'Lesson 4: How eclipses happen', 'The full Solar Voyager app'],
  },
  {
    id: 'family', name: 'Family pass', price: '$29', per: 'one time', cta: 'Get the family pass', featured: true,
    points: ['All six lessons, forever', 'Up to 5 learners on one device', 'New lessons in this course as they’re added'],
  },
  {
    id: 'classroom', name: 'Classroom', price: '$6', per: 'per month', cta: 'Start a classroom',
    points: ['Every course, for a whole class', 'Teacher notes and standards mapping', 'New courses every term'],
  },
];

export const lessonIndex = (id) => COURSE.lessons.findIndex((l) => l.id === id);
export const isLocked = (id, hasPass = false) => PAYWALL && !hasPass && !FREE_LESSONS.includes(id);
