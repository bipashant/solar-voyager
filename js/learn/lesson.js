// Puts a lesson page together: the course bar at the top, its scenes (player.js), questions (quiz.js) and
// diagrams (diagrams.js), stars as you earn them, and the way on to the next lesson.
//
// A lesson page is ordinary HTML with placeholders, plus one call:
//   <figure data-scene="shadow"></figure>  <div data-quiz="check"></div>  <div data-diagram="eclipseCones"></div>
//   initLesson({ id: 'eclipses', scenes: { shadow: {...} }, quizzes: { check: {...} } });
import { COURSE, lessonIndex, isLocked, CHECKOUT_URL } from './course.js';
import { ScenePlayer } from './player.js';
import { Quiz } from './quiz.js';
import { DIAGRAMS } from './diagrams.js';
import { progress } from './progress.js';

const ARROW = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11M11 5l5 5-5 5"/></svg>';
const BACK = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5L7 10l5.5 5.5"/></svg>';
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/></svg>';

export function initLesson({ id, scenes = {}, quizzes = {} }) {
  const i = lessonIndex(id);
  const meta = COURSE.lessons[i];
  document.documentElement.style.setProperty('--accent', meta.color);
  progress.visit(id);

  // what this lesson holds, for its star count (and the course page's)
  const contents = {
    scenes: Object.values(scenes).map((s) => s.id),
    challenges: Object.values(scenes).flatMap((s) => (s.challenges || []).map((c) => `${s.id}.${c.id}`)),
    quizzes: Object.fromEntries(Object.entries(quizzes).filter(([, q]) => q.kind !== 'predict').map(([k, q]) => [k, q.questions.length])),
  };
  progress.setContents(id, contents);

  topBar(meta, i, contents);
  const onStar = (kind, what) => starToast(kind, what);

  for (const el of document.querySelectorAll('[data-scene]')) {
    const s = scenes[el.dataset.scene];
    if (s) new ScenePlayer(el, s, { lesson: id, onStar });
  }
  for (const el of document.querySelectorAll('[data-quiz]')) {
    const q = quizzes[el.dataset.quiz];
    if (q) new Quiz(el, q, { lesson: id, id: el.dataset.quiz, onStar });
  }
  for (const el of document.querySelectorAll('[data-diagram]')) {
    try { DIAGRAMS[el.dataset.diagram]?.(el); } catch (err) { console.warn('diagram', el.dataset.diagram, err); }
  }
  nextUp(i);
  if (isLocked(id)) gate(meta);
}

// ---------------------------------------------------------------- course bar
function topBar(meta, i, contents) {
  const bar = document.createElement('header');
  bar.className = 'l-top';
  bar.innerHTML = `
    <a class="l-course" href="../learn.html">${BACK}<span><small>Course</small>${COURSE.title}</span></a>
    <nav class="l-steps" aria-label="Lessons">${COURSE.lessons.map((l, k) => `<a href="${l.file}" style="--c:${l.color}" class="${k === i ? 'now' : ''}" title="${k + 1}. ${l.title}" aria-label="Lesson ${k + 1}: ${l.title}"${k === i ? ' aria-current="page"' : ''}>${k + 1}</a>`).join('')}</nav>
    <span class="l-stars" title="Stars earned in this lesson">${STAR}<b></b></span>`;
  document.body.prepend(bar);
  const update = () => {
    const s = progress.summary(meta.id, contents);
    bar.querySelector('.l-stars b').textContent = `${s.stars} / ${s.max}`;
    COURSE.lessons.forEach((l, k) => {
      const c = progress.contents(l.id);
      if (c && progress.summary(l.id, c).complete) bar.querySelectorAll('.l-steps a')[k].classList.add('done');
    });
  };
  update();
  progress.onChange(update);
}

function starToast(kind, what) {
  let t = document.querySelector('.l-toast');
  if (!t) { t = document.createElement('div'); t.className = 'l-toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  const n = kind === 'quiz' ? what : 1;
  const text = kind === 'scene' ? `Scene watched: ${what}` : kind === 'challenge' ? 'Challenge complete!' : 'Quiz score saved';
  t.innerHTML = `${STAR}<span><b>+${n} star${n > 1 ? 's' : ''}</b>${text}</span>`;
  t.classList.remove('show');
  void t.offsetWidth;
  t.classList.add('show');
  clearTimeout(t.timer);
  t.timer = setTimeout(() => t.classList.remove('show'), 3600);
}

// ---------------------------------------------------------------- next lesson
function nextUp(i) {
  const slot = document.querySelector('[data-next]');
  if (!slot) return;
  const next = COURSE.lessons[i + 1];
  slot.className = 'l-next';
  slot.innerHTML = next
    ? `<a href="${next.file}" style="--c:${next.color}"><small>Next · Lesson ${i + 2}</small><b>${next.title}</b><span>${next.question}</span>${ARROW}</a>`
    : `<a href="../learn.html" style="--c:var(--accent)"><small>You finished the course</small><b>Back to the course</b><span>See your stars and pick a lesson to replay.</span>${ARROW}</a>`;
}

// ---------------------------------------------------------------- locked lessons (when PAYWALL is on)
function gate(meta) {
  document.body.classList.add('l-locked');
  const g = document.createElement('div');
  g.className = 'l-gate';
  g.innerHTML = `<div class="l-gate-card">
    <span class="l-gate-tag">Course pass</span>
    <h2>Unlock “${meta.title}”</h2>
    <p>This lesson is part of the full course. Get a pass to watch every scene, take on the challenges and earn all the stars.</p>
    <a class="l-gate-go" href="${CHECKOUT_URL || '../learn.html#plans'}">See plans ${ARROW}</a>
    <a class="l-gate-back" href="../learn.html">Back to the course</a>
  </div>`;
  document.body.append(g);
}
