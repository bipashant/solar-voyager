// What a learner has done, kept in this browser: scenes watched, challenges solved and quiz scores.
// Stars: one per scene watched, one per challenge, one per quiz answer right first time.

const KEY = 'voyagerAcademy.progress.v1';
const listeners = new Set();

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
let data = read();
data.lessons ||= {};

function write() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* private mode: progress lasts the visit */ }
  for (const fn of listeners) fn();
}

const lesson = (id) => (data.lessons[id] ||= { scenes: {}, challenges: {}, quizzes: {} });

export const progress = {
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  visit(id) { data.last = id; lesson(id).seen = true; write(); },
  get last() { return data.last; },

  sceneDone(id, scene) {
    if (lesson(id).scenes[scene]) return false;
    lesson(id).scenes[scene] = true; write(); return true;
  },
  challengeDone(id, ch) {
    if (lesson(id).challenges[ch]) return false;
    lesson(id).challenges[ch] = true; write(); return true;
  },
  isChallengeDone: (id, ch) => !!data.lessons[id]?.challenges[ch],
  isSceneDone: (id, scene) => !!data.lessons[id]?.scenes[scene],

  setQuiz(id, quiz, score, total) {
    const q = lesson(id).quizzes;
    q[quiz] = { score: Math.max(score, q[quiz]?.score ?? 0), total };
    write();
  },
  quiz: (id, quiz) => data.lessons[id]?.quizzes[quiz] || null,

  // Totals for one lesson, given what it contains ({ scenes, challenges, quizzes: { name: total } }).
  summary(id, contents) {
    const l = data.lessons[id] || { scenes: {}, challenges: {}, quizzes: {} };
    const scenes = contents.scenes.filter((s) => l.scenes[s]).length;
    const challenges = contents.challenges.filter((c) => l.challenges[c]).length;
    let quizStars = 0, quizMax = 0, quizzesDone = 0;
    for (const [q, total] of Object.entries(contents.quizzes)) {
      quizMax += total;
      if (l.quizzes?.[q]) { quizStars += l.quizzes[q].score; quizzesDone++; }
    }
    const stars = scenes + challenges + quizStars;
    const max = contents.scenes.length + contents.challenges.length + quizMax;
    const complete = scenes === contents.scenes.length && quizzesDone === Object.keys(contents.quizzes).length;
    return { stars, max, complete, started: !!l.seen || stars > 0 };
  },

  // Each lesson page records what it contains, so the course page can show totals before a visit.
  setContents(id, contents) { lesson(id).contents = contents; write(); },
  contents: (id) => data.lessons[id]?.contents || null,

  reset() { data = { lessons: {} }; write(); },
};
