// Multiple-choice questions, one at a time. A quiz is { title, questions: [{ q, options, answer, why }] }.
// kind: 'predict' is a single "what do you think?" question asked before a scene: no score, just the
// answer and a nudge to go and watch it happen.
import { progress } from './progress.js';

const LETTERS = 'ABCDEF';

export class Quiz {
  constructor(root, quiz, { lesson, id, onStar } = {}) {
    this.root = root;
    this.quiz = quiz;
    this.lesson = lesson;
    this.id = id;
    this.onStar = onStar;
    this.predict = quiz.kind === 'predict';
    this.root.classList.add('qz', this.predict ? 'qz-predict' : 'qz-check');
    this.start();
  }

  start() {
    this.i = 0;
    this.right = 0;
    this.show();
  }

  show() {
    const q = this.quiz.questions[this.i], n = this.quiz.questions.length;
    const head = this.predict
      ? `<div class="qz-head"><span class="qz-tag">Think first</span></div>`
      : `<div class="qz-head"><span class="qz-tag">${this.quiz.title || 'Check your understanding'}</span><span class="qz-count">Question ${this.i + 1} of ${n}</span>
         <div class="qz-dots">${this.quiz.questions.map((_, k) => `<i class="${k < this.i ? 'past' : k === this.i ? 'now' : ''}"></i>`).join('')}</div></div>`;
    this.root.innerHTML = `${head}
      <p class="qz-q">${q.q}</p>
      <div class="qz-options" role="group" aria-label="Answers">${q.options.map((o, k) => `<button type="button" data-k="${k}"><i>${LETTERS[k]}</i><span>${o}</span></button>`).join('')}</div>
      <div class="qz-why" hidden aria-live="polite"></div>`;
    this.root.querySelector('.qz-options').addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]');
      if (b && !this.answered) this.answer(Number(b.dataset.k), b);
    });
    this.answered = false;
  }

  answer(k, btn) {
    const q = this.quiz.questions[this.i];
    this.answered = true;
    const ok = k === q.answer;
    const buttons = [...this.root.querySelectorAll('.qz-options button')];
    buttons.forEach((b, j) => {
      b.disabled = true;
      if (j === q.answer) b.classList.add('right');
    });
    if (!ok) btn.classList.add('wrong');
    if (ok) this.right++;
    const why = this.root.querySelector('.qz-why');
    const last = this.i === this.quiz.questions.length - 1;
    let lead;
    if (this.predict) lead = ok ? 'Good thinking!' : `Not quite. It’s <b>${LETTERS[q.answer]}</b>.`;
    else lead = ok ? pick(['Correct!', 'Spot on!', 'Yes!', 'Exactly right!']) : `Not this time. The answer is <b>${LETTERS[q.answer]}</b>.`;
    why.innerHTML = `<p><b class="${ok ? 'ok' : 'no'}">${lead}</b> ${q.why || ''}</p>${this.predict
      ? (this.quiz.then ? `<p class="qz-then">${this.quiz.then}</p>` : '')
      : `<button type="button" class="qz-next">${last ? 'See my score' : 'Next question'} <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11M11 5l5 5-5 5"/></svg></button>`}`;
    why.hidden = false;
    why.querySelector('.qz-next')?.addEventListener('click', () => (last ? this.finish() : (this.i++, this.show())));
    why.querySelector('.qz-next')?.focus({ preventScroll: true });
  }

  finish() {
    const n = this.quiz.questions.length;
    const before = progress.quiz(this.lesson, this.id)?.score ?? 0;
    progress.setQuiz(this.lesson, this.id, this.right, n);
    if (this.right > before) this.onStar?.('quiz', this.right - before);
    const msg = this.right === n ? 'Perfect score! You’ve really got this.' : this.right >= n * 0.6 ? 'Great work! Check the answers you missed and try again for every star.' : 'Good effort! Rewatch the scenes above, then have another go.';
    this.root.innerHTML = `<div class="qz-head"><span class="qz-tag">${this.quiz.title || 'Check your understanding'}</span></div>
      <div class="qz-result">
        <div class="qz-stars" aria-label="${this.right} of ${n} stars">${Array.from({ length: n }, (_, k) => `<svg viewBox="0 0 24 24" class="${k < this.right ? 'on' : ''}" style="--d:${k * 90}ms" aria-hidden="true"><path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/></svg>`).join('')}</div>
        <p class="qz-score"><b>${this.right}</b> out of <b>${n}</b></p>
        <p>${msg}</p>
        <button type="button" class="qz-again">Try again</button>
      </div>`;
    this.root.querySelector('.qz-again').addEventListener('click', () => this.start());
  }
}

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
