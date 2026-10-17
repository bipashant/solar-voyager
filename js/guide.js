// Guided tour: shows each control by doing it for real (an animated finger or pointer drags, pinches and
// taps while the camera actually moves, a destination is actually chosen and the ship actually flies),
// then asks you to try it and moves on when you do. Runs once on first launch; replay it from Help or View.
import { haptic, isTouch } from './platform.js';
import { fmtDuration } from './format.js';

const DONE_KEY = 'solarVoyager.tourDone';
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const $ = (id) => document.getElementById(id);

// "the Moon", "the Sun", but "Jupiter"
const the = (b, cap = false) => (['moon', 'sun'].includes(b.id) ? `${cap ? 'The' : 'the'} ${b.name}` : b.name);

function remember() { try { localStorage.setItem(DONE_KEY, '1'); } catch { /* private mode */ } }
function seen() { try { return localStorage.getItem(DONE_KEY) === '1'; } catch { return false; } }

export class Guide {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.token = 0;
    this.step = 0;
    $('guide-next').addEventListener('click', () => this.next());
    $('guide-back').addEventListener('click', () => this.go(this.step - 1));
    $('guide-close').addEventListener('click', () => this.stop());
    $('guide-skip').addEventListener('click', () => this.stop());
    $('guide-doit').addEventListener('click', () => this.steps[this.step].doIt?.());
    window.addEventListener('resize', () => { if (this.active) this.place(); });
  }

  // ---------------------------------------------------------------- the steps
  get steps() {
    const app = this.app, { state, rig, travel } = app;
    const sheet = document.body.classList.contains('has-sheet');
    const engageSel = sheet ? '#sheet-fly' : !$('dock').hidden ? '#dock-go' : '#engage';
    const engageName = engageSel === '#engage' ? 'Engage' : engageSel === '#sheet-fly' ? 'Fly' : 'the amber arrow';
    return this._steps ||= [
      {
        title: 'Welcome aboard',
        text: 'A one-minute tour of the controls. Everything you’ll see is the real app, live: real positions, real scale.',
        next: 'Start the tour', skip: true,
      },
      {
        title: 'Look around',
        text: isTouch ? 'Drag with one finger to fly around the world you’re visiting.' : 'Click and drag to fly around the world you’re visiting.',
        tryText: isTouch ? 'Your turn: drag anywhere on the screen.' : 'Your turn: drag anywhere.',
        demo: () => this.demoDrag(),
        hint: () => this.hintDrag(),
        start: () => { this.base = { yaw: rig.tYaw, pitch: rig.tPitch }; },
        done: () => Math.abs(rig.tYaw - this.base.yaw) + Math.abs(rig.tPitch - this.base.pitch) > 0.45,
        praise: 'That’s it. You can look anywhere.',
      },
      {
        title: 'Zoom in and out',
        text: isTouch ? 'Pinch with two fingers to zoom, from deep space right down to the clouds.'
          : 'Scroll to zoom, from deep space right down to the clouds. The + and − buttons work too.',
        tryText: isTouch ? 'Your turn: pinch to zoom.' : 'Your turn: scroll to zoom.',
        demo: () => (isTouch ? this.demoPinch() : this.demoScroll()),
        hint: () => (isTouch ? this.hintPinch() : this.hintScroll()),
        start: () => { this.base = { alt: rig.tLogAlt }; },
        done: () => Math.abs(rig.tLogAlt - this.base.alt) > 0.5,
        praise: `Every step zooms by the same ratio, so a few ${isTouch ? 'pinches' : 'scrolls'} cross a billion kilometres.`,
      },
      {
        title: 'Choose where to go',
        text: 'Tap any planet, moon or name to make it your destination.',
        demo: () => this.demoPick(),
      },
      {
        title: 'Engage',
        text: `Press ${engageName} to fly there at ${state.speed.short}. The trip is time-lapsed, and the ship clock shows how long it really takes.`,
        tryText: `Your turn: press ${engageName}.`,
        target: engageSel,
        hint: () => this.hintTap(engageSel),
        doIt: () => app.engage(),
        doItLabel: 'Fly for me',
        done: () => this.flew && !travel.active,
        praise: () => `Welcome to ${the(state.focus)}. The real trip took ${this.tripTime}.`,
        watch: () => { if (travel.active) { this.flew = true; this.tripTime = fmtDuration(travel.realDuration); } },
      },
      {
        title: 'Layers',
        text: 'View switches layers on and off: orbits, constellations, 3D galaxies, even spacetime curvature.',
        target: '#btn-layers',
        demo: () => this.demoView(),
        leave: () => app.ui.setMenu(false),
      },
      {
        title: 'You’re ready',
        text: document.body.classList.contains('has-sheet')
          ? 'Pull the panel at the bottom up for search, every world, speeds and details. The eye hides everything for a clear view. Replay this tour from Layers.'
          : 'The eye hides every control for a clear view, and Poster makes a print of the sky on any date. Replay this tour any time from Help.',
        target: '#btn-hide-ui',
        next: 'Start exploring',
      },
    ];
  }

  // ---------------------------------------------------------------- lifecycle
  maybeStart() {
    if (seen() || location.hash === '#poster' || location.hash.includes('at=')) return false; // not over a shared view
    setTimeout(() => this.start(), 900);
    return true;
  }

  start() {
    const ui = this.app.ui;
    if (this.app.travel.active) return;
    ui.setChromeHidden(false);
    ui.setMenu(false);
    ui.showHelp(false);
    this._steps = null; // rebuild with the current layout (console or dock) and speed
    this.active = true;
    $('guide').hidden = false;
    document.body.classList.add('touring');
    this.go(0);
    this.loop();
  }

  stop() {
    if (!this.active) return;
    this.steps[this.step]?.leave?.();
    this.active = false;
    this.token++;
    remember();
    $('guide').hidden = true;
    document.body.classList.remove('touring');
    this.dots(0);
  }

  next() {
    if (this.step >= this.steps.length - 1) { haptic('arrive'); this.stop(); return; }
    this.go(this.step + 1);
  }

  async go(i) {
    const steps = this.steps;
    if (i < 0 || i >= steps.length) return;
    steps[this.step]?.leave?.();
    this.step = i;
    const token = ++this.token;
    const s = steps[i];
    this.succeeded = false;
    this.flew = false;
    haptic('tap');
    $('guide-step').textContent = i === 0 ? 'Guided tour' : `${i} of ${steps.length - 1}`;
    $('guide-title').textContent = s.title;
    $('guide-text').textContent = s.text;
    $('guide-try').textContent = '';
    $('guide-try').className = 'guide-try';
    $('guide-next').textContent = s.next || 'Next';
    $('guide-back').hidden = i === 0;
    $('guide-skip').hidden = !s.skip;
    $('guide-doit').hidden = true;
    $('guide-doit').textContent = s.doItLabel || 'Do it for me';
    this.dots(0);
    this.place();
    // show it for real first, then hand over
    if (s.demo) await s.demo();
    if (token !== this.token) return;
    s.start?.();
    if (s.tryText) {
      $('guide-try').textContent = s.tryText;
      $('guide-try').classList.add('waiting');
      if (s.doIt) $('guide-doit').hidden = false;
      if (s.hint) s.hint();
    }
  }

  // Each frame: follow the highlighted control, and notice when you've done what the step asked.
  loop() {
    if (!this.active) return;
    const s = this.steps[this.step];
    this.place();
    s.watch?.();
    if (s.done && !this.succeeded && $('guide-try').classList.contains('waiting') && s.done()) {
      this.succeeded = true;
      this.token++; // stop the hint animation
      this.dots(0);
      haptic('saved');
      const t = $('guide-try');
      t.textContent = typeof s.praise === 'function' ? s.praise() : s.praise;
      t.className = 'guide-try ok';
      $('guide-doit').hidden = true;
      const at = this.step;
      setTimeout(() => { if (this.active && this.step === at) this.next(); }, 1800);
    }
    requestAnimationFrame(() => this.loop());
  }

  // Spotlight the step's control and keep the card clear of it.
  place() {
    const s = this.steps[this.step];
    const spot = $('guide-spot');
    const el = s?.target && document.querySelector(s.target);
    const r = el && el.getClientRects().length ? el.getBoundingClientRect() : null;
    spot.hidden = !r;
    if (r) {
      const pad = 6;
      Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    }
    // the card sits at the top, or at the bottom when the highlighted control is up there
    const card = $('guide-card');
    // (phones keep it at the top: the bottom sheet and the Layers sheet live down there)
    const phone = document.body.classList.contains('has-sheet');
    card.classList.toggle('low', !phone && ((!!r && r.top < window.innerHeight * 0.3) || this.app.travel.active));
  }

  // ---------------------------------------------------------------- animation helpers
  anim(ms, fn) {
    const token = this.token;
    return new Promise((resolve) => {
      const t0 = performance.now();
      const tick = (now) => {
        if (token !== this.token || !this.active) { resolve(false); return; }
        const k = Math.min(1, (now - t0) / ms);
        fn(k);
        if (k < 1) requestAnimationFrame(tick); else resolve(true);
      };
      requestAnimationFrame(tick);
    });
  }

  wait(ms) { return this.anim(ms, () => {}); }

  // Up to two fake touches (or a pointer), at screen positions in CSS pixels.
  dots(n, a = {}, b = {}, opts = {}) {
    const els = [$('guide-touch-a'), $('guide-touch-b')];
    els.forEach((e, i) => {
      const p = i === 0 ? a : b;
      const on = i < n;
      e.hidden = !on;
      if (on) {
        e.style.transform = `translate(${p.x}px, ${p.y}px) scale(${opts.pressed === false ? 1.15 : 1})`;
        e.style.opacity = opts.alpha ?? 1;
      }
    });
    $('guide-touch-a').classList.toggle('pointer', !isTouch && n === 1);
  }

  tap(i = 0) {
    const e = i === 0 ? $('guide-touch-a') : $('guide-touch-b');
    e.classList.remove('tapping');
    void e.offsetWidth; // restart the ripple
    e.classList.add('tapping');
  }

  centre() { return { x: window.innerWidth / 2, y: window.innerHeight * 0.52 }; }

  // ---------------------------------------------------------------- demos (they really move the camera)
  async demoDrag() {
    const { rig } = this.app;
    const c = this.centre();
    const from = { x: c.x - 90, y: c.y + 40 }, to = { x: c.x + 90, y: c.y };
    const yaw0 = rig.tYaw, pitch0 = rig.tPitch;
    this.dots(1, from, {}, { pressed: false, alpha: 0 });
    await this.anim(300, (k) => this.dots(1, from, {}, { pressed: false, alpha: k }));
    await this.anim(1500, (k) => {
      const e = ease(k);
      this.dots(1, { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e });
      rig.tYaw = yaw0 - 1.1 * e;
      rig.tPitch = Math.min(1.4, pitch0 + 0.18 * e);
    });
    await this.anim(250, (k) => this.dots(1, to, {}, { pressed: false, alpha: 1 - k }));
    this.dots(0);
    await this.wait(250);
  }

  async hintDrag() {
    const c = this.centre();
    while (this.active) {
      const from = { x: c.x - 70, y: c.y + 30 }, to = { x: c.x + 70, y: c.y + 10 };
      if (!await this.anim(1400, (k) => {
        const e = ease(k);
        const alpha = Math.min(1, k * 5, (1 - k) * 5) * 0.55;
        this.dots(1, { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e }, {}, { alpha });
      })) return;
      if (!await this.wait(700)) return;
    }
  }

  async demoPinch() {
    const { rig } = this.app;
    const c = this.centre();
    const alt0 = rig.tLogAlt;
    const pos = (s) => [{ x: c.x - s * 0.7, y: c.y + s * 0.7 }, { x: c.x + s * 0.7, y: c.y - s * 0.7 }];
    await this.anim(250, (k) => this.dots(2, ...pos(30), { alpha: k }));
    await this.anim(1300, (k) => { const e = ease(k); this.dots(2, ...pos(30 + 90 * e)); rig.tLogAlt = alt0 - 1.3 * e; });
    await this.wait(400);
    await this.anim(1300, (k) => { const e = ease(k); this.dots(2, ...pos(120 - 90 * e)); rig.tLogAlt = alt0 - 1.3 + 1.3 * e; });
    await this.anim(250, (k) => this.dots(2, ...pos(30), { alpha: 1 - k }));
    this.dots(0);
  }

  async hintPinch() {
    const c = this.centre();
    const pos = (s) => [{ x: c.x - s * 0.7, y: c.y + s * 0.7 }, { x: c.x + s * 0.7, y: c.y - s * 0.7 }];
    while (this.active) {
      if (!await this.anim(1300, (k) => {
        const alpha = Math.min(1, k * 5, (1 - k) * 5) * 0.55;
        this.dots(2, ...pos(30 + 80 * ease(k)), { alpha });
      })) return;
      if (!await this.wait(600)) return;
    }
  }

  async demoScroll() {
    const { rig } = this.app;
    const wheel = $('guide-wheel');
    const alt0 = rig.tLogAlt;
    wheel.hidden = false;
    wheel.classList.add('up');
    await this.anim(1300, (k) => { rig.tLogAlt = alt0 - 1.3 * ease(k); });
    await this.wait(300);
    wheel.classList.replace('up', 'down');
    await this.anim(1300, (k) => { rig.tLogAlt = alt0 - 1.3 + 1.3 * ease(k); });
    wheel.classList.remove('down');
    wheel.hidden = true;
  }

  async hintScroll() {
    const wheel = $('guide-wheel');
    wheel.hidden = false;
    wheel.classList.add('up', 'faint');
    const token = this.token;
    while (this.active && token === this.token) { if (!await this.wait(400)) break; }
    wheel.classList.remove('up', 'faint');
    wheel.hidden = true;
  }

  // Swing the camera so a nearby world is in view, point at it and tap it: it really becomes the destination.
  async demoPick() {
    const { state, system, rig } = this.app;
    const f = state.focus;
    let t = f.kind === 'moon' ? f.parent : f.kind === 'star' ? system.byId.earth
      : f.children?.slice().sort((a, b) => b.radius - a.radius)[0] || system.byId.sun;
    if (!t || t.deep) t = system.byId.earth === f ? system.byId.moon : system.byId.earth;
    // camera on the far side of the focus and a little below, so the target shows just under it,
    // clear of the card at the top and the console at the bottom
    const toT = t.pos.clone().sub(f.pos).normalize();
    const up = rig.up();
    const u = up.clone().addScaledVector(toT, -up.dot(toT));
    if (u.lengthSq() < 1e-6) u.set(1, 0, 0); else u.normalize();
    const dir = toT.clone().multiplyScalar(-Math.cos(0.2)).addScaledVector(u, -Math.sin(0.2)).normalize();
    rig.lookAtDirection(dir, f.maxRadius / Math.sin(0.1) - f.maxRadius);
    await this.wait(1600);
    const sc = t.screen;
    const target = () => ({ x: sc.onScreen ? sc.x : this.centre().x, y: sc.onScreen ? sc.y : this.centre().y - 120 });
    const start = { x: window.innerWidth / 2, y: window.innerHeight * 0.8 };
    await this.anim(300, (k) => this.dots(1, start, {}, { pressed: false, alpha: k }));
    await this.anim(1000, (k) => {
      const p = target(), e = ease(k);
      this.dots(1, { x: start.x + (p.x - start.x) * e, y: start.y + (p.y - start.y) * e }, {}, { pressed: false });
    });
    this.tap();
    this.dots(1, target());
    this.app.setDestination(t.id, { fromSelect: true });
    haptic('tap');
    $('guide-try').textContent = `${the(t, true)} is now your destination.`;
    $('guide-try').className = 'guide-try ok';
    await this.anim(900, () => this.dots(1, target()));
    await this.anim(250, (k) => this.dots(1, target(), {}, { alpha: 1 - k }));
    this.dots(0);
  }

  async hintTap(sel) {
    while (this.active) {
      const el = document.querySelector(sel);
      const r = el?.getBoundingClientRect();
      if (!r || !r.width) { if (!await this.wait(300)) return; continue; }
      const p = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      if (!await this.anim(250, (k) => this.dots(1, p, {}, { pressed: false, alpha: k * 0.8 }))) return;
      this.tap();
      if (!await this.anim(700, () => this.dots(1, p, {}, { alpha: 0.8 }))) return;
      if (!await this.anim(250, (k) => this.dots(1, p, {}, { alpha: 0.8 * (1 - k) }))) return;
      if (!await this.wait(900)) return;
    }
  }

  async demoView() {
    const el = $('btn-layers');
    const r = el.getBoundingClientRect();
    const p = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const start = { x: window.innerWidth * 0.6, y: window.innerHeight * 0.45 };
    await this.anim(250, (k) => this.dots(1, start, {}, { pressed: false, alpha: k }));
    await this.anim(800, (k) => { const e = ease(k); this.dots(1, { x: start.x + (p.x - start.x) * e, y: start.y + (p.y - start.y) * e }, {}, { pressed: false }); });
    this.tap();
    this.app.ui.setMenu(true);
    await this.anim(250, (k) => this.dots(1, p, {}, { alpha: 1 - k }));
    this.dots(0);
  }
}
