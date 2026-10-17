// Embed mode: the app as a live figure inside another page, such as a lesson (see learn.html and
// js/learn/player.js). The view stays fully interactive; the host page can script it like a video.
//
//   index.html?embed=1&ui=clock,zoom,view&layers=orbits,labels#at=earth&pov=from:moon&time=2024-04-08T18:17Z
//
//   ui      the app's own controls to keep: clock, zoom, view (the View menu), info (the details panel),
//           flight (console, flight readout and Engage) and toast (messages). Everything else is hidden.
//   layers  the switches the View menu offers
//   #hash   the starting view, as in shared links (viewlink.js)
//
// The host talks to it with postMessage, and hears back the same way:
//   in   { voyager: 'cmd', type: 'scene', time: { ms, rate }, view, layers: { on, off }, marks }
//        { voyager: 'cmd', type: 'view' | 'time' | 'layers' | 'marks' | 'fly' | 'sleep', ... }
//   out  { voyager: 'evt', type: 'ready' }
//        { voyager: 'evt', type: 'state', ... }      a few times a second: clock, camera, Moon phase, eclipses
//        { voyager: 'evt', type: 'interact', kind }  someone took the controls: camera, time, layer or fly
//
// A view is { at, pov, alt, yaw, pitch, turn, tilt, fov, track, snap }: the world to orbit and where to look from
// (see povTarget in main.js). track keeps re-aiming as things move, so a camera "from:earth" keeps facing
// the Moon all month. fov narrows the view like a telescope (degrees), so a 0.5° Sun can fill the frame. Marks are labels, arrows, axes and rings drawn over the view, pinned to points that
// move with the worlds:
//   'earth'                          a body's centre
//   { body, lat, lon }               a place on its surface, turning with it
//   { body, toward | away: id, r }   out from a body towards (or away from) another, r in its radii (or km)
//   { body, pole: 'N' | 'S', r }     along its spin axis
//   { between: [a, b], f }           part way from one body to another
//   { shadowOf: 'moon', on: 'earth' } where one body's shadow falls on another (or passes closest to it)
import * as THREE from 'three';
import { TIME_RATES, SPEEDS, TRAVEL_MODES } from './data.js';
import { embedConfig } from './platform.js';

const $ = (id) => document.getElementById(id);
const SVG = 'http://www.w3.org/2000/svg';
const DEG = Math.PI / 180;
const TONES = { amber: '#ffb547', ice: '#93d6ff', violet: '#c7b4ff', coral: '#ff7a66', green: '#7ee0a1', white: '#e2e9f3', shadow: '#8f86b8' };
const DIRS = { n: [0, -1], ne: [0.75, -0.66], e: [1, 0], se: [0.75, 0.66], s: [0, 1], sw: [-0.75, 0.66], w: [-1, 0], nw: [-0.75, -0.66] };
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _s = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3(), e: new THREE.Vector3() };

export class Embed {
  constructor(app, hooks) {
    this.app = app;
    this.hooks = hooks; // { place(body, view), aim(body, view), project(world) -> {x, y} | null }
    this.applying = false;
    this.track = null;
    this.marks = [];
    this.lastState = 0;
    this.isReady = false;
    window.addEventListener('resize', () => { for (const m of this.marks) m.box = null; });
    this.trimControls();
    this.buildMarkLayer();
    this.watchInput();
    window.addEventListener('message', (e) => {
      if (e.source !== window.parent || e.data?.voyager !== 'cmd') return;
      this.run(e.data);
    });
  }

  post(type, data = {}) {
    try { window.parent.postMessage({ voyager: 'evt', type, ...data }, '*'); } catch { /* host gone */ }
  }

  ready() {
    this.isReady = true;
    this.post('ready');
  }

  // ---------------------------------------------------------------- only the controls this figure needs
  trimControls() {
    const allowed = new Set(embedConfig.layers);
    for (const t of document.querySelectorAll('.tog[data-toggle]')) t.hidden = !allowed.has(t.dataset.toggle);
    for (const s of document.querySelectorAll('.tog-section')) s.hidden = !s.querySelector('.tog:not([hidden])');
    this.app.ui.setToggle('labels', this.app.ui.toggles.labels); // recount the View badge
  }

  // ---------------------------------------------------------------- noticing when someone takes over
  watchInput() {
    const { app } = this;
    const took = (kind) => {
      if (this.applying) return;
      if (kind === 'camera' || kind === 'fly') this.track = null;
      this.post('interact', { kind });
    };
    app.rig.onInteract = () => took('camera');
    window.addEventListener('keydown', (e) => {
      if (e.target.closest?.('input, select, textarea')) return;
      if (/^(Arrow|[wsad+=_-]$)/.test(e.key)) took('camera');
      if (e.key === ' ') took('time');
    });
    $('time-rate').addEventListener('change', () => took('time'));
    $('time-now').addEventListener('click', () => took('time'));
    for (const t of document.querySelectorAll('.tog[data-toggle]')) t.addEventListener('click', () => took('layer'));
    const engage = app.engage;
    app.engage = () => { const was = app.travel.active; engage(); if (!was && app.travel.active) took('fly'); };
  }

  // ---------------------------------------------------------------- commands
  run(msg) {
    const { app } = this;
    this.applying = true;
    try {
      switch (msg.type) {
        case 'scene':
          if (msg.time) this.setTime(msg.time);
          if (msg.layers) this.setLayers(msg.layers);
          if (msg.view) this.setView(msg.view);
          if (msg.marks) this.setMarks(msg.marks);
          break;
        case 'view': this.setView(msg); break;
        case 'time': this.setTime(msg); break;
        case 'layers': this.setLayers(msg); break;
        case 'marks': this.setMarks(msg.list || []); break;
        case 'fly': this.fly(msg); break;
        case 'sleep': app.sleeping = !!msg.on; break;
        default: break;
      }
    } finally {
      this.applying = false;
    }
    this.lastState = 0; // report the new state straight away
  }

  setTime({ ms, rate }) {
    const { app } = this;
    if (Number.isFinite(ms)) app.state.simMs = ms;
    if (rate !== undefined) {
      const r = TIME_RATES.find((x) => x.id === rate || x.rate === rate);
      if (r) app.setTimeRate(r.id);
    }
    app.system.update(app.jd());
  }

  setLayers({ on = [], off = [] }) {
    const { ui } = this.app;
    for (const k of on) if (k in ui.toggles) ui.setToggle(k, true);
    for (const k of off) if (k in ui.toggles) ui.setToggle(k, false);
  }

  setView(v) {
    const { app } = this;
    const body = (v.at && app.lookup(v.at)) || app.state.focus;
    const snap = app.travel.active || body !== app.state.focus || v.snap;
    app.setFov(v.fov, snap); // a telescope view, or back to the normal one
    if (snap) this.hooks.place(body, v);
    else this.hooks.aim(body, v);
    this.track = v.track && v.pov ? { body, v: { ...v, snap: false } } : null;
  }

  fly({ to, speed, mode }) {
    const { app } = this;
    const s = SPEEDS.find((x) => x.id === speed);
    if (s) app.state.speed = s;
    const m = TRAVEL_MODES.find((x) => x.id === mode);
    if (m) app.state.mode = m;
    if (app.travel.active) app.travel.abort();
    app.setDestination(to, { fromSelect: true });
    app.engage();
  }

  // ---------------------------------------------------------------- every frame
  tick(now) {
    const { app } = this;
    if (this.track && !app.travel.active && app.rig.enabled && app.state.focus === this.track.body) this.hooks.aim(this.track.body, this.track.v);
    this.drawMarks();
    if (this.isReady && now - this.lastState > 150) {
      this.lastState = now;
      this.post('state', this.snapshot());
    }
  }

  // What the host can check a lesson's challenges against.
  snapshot() {
    const { system, state, travel, rig, camPos } = this.app;
    const sun = system.byId.sun, earth = system.byId.earth, moon = system.byId.moon;
    // (its own temporaries: the mark code owns _a.._d and runs in the same frame)
    const toSun = _s.a.copy(sun.pos).sub(moon.pos).normalize();
    const toEarth = _s.b.copy(earth.pos).sub(moon.pos).normalize();
    const lon = (v) => Math.atan2(-v.z, v.x);
    const em = _s.c.copy(moon.pos).sub(earth.pos), es = _s.d.copy(sun.pos).sub(earth.pos);
    const elong = (((lon(em) - lon(es)) / DEG) % 360 + 360) % 360; // 0 new Moon, 90 first quarter, 180 full
    const earthSunKm = es.length();
    const pole = _s.e.set(0, 1, 0).applyQuaternion(earth.quat);
    const sunDecl = Math.asin(THREE.MathUtils.clamp(es.normalize().dot(pole), -1, 1)) / DEG; // where the Sun is overhead
    const lunar = system.sunVisibility(moon.pos);
    const camSun = system.sunVisibility(camPos); // (sunVisibility uses its own scratch vector)
    return {
      simMs: state.simMs, rate: state.timeRate.rate, rateId: state.timeRate.id,
      focus: state.focus.id, dest: state.destination?.id, flying: travel.active, progress: travel.active ? travel.progress : 0,
      alt: rig.altitude(), tracking: !!this.track,
      moon: { illum: (1 + toSun.dot(toEarth)) / 2, elong },
      sunDecl, earthSunKm, solar: this.solarEclipse(), lunar, camSun,
      toggles: { ...this.app.ui.toggles },
    };
  }

  // Is the Moon's shadow on Earth? 'total' or 'annular' where the middle of it lands, 'partial' if only
  // the outer shadow (penumbra) touches, null if it misses.
  solarEclipse() {
    const { system } = this.app;
    const sun = system.byId.sun, moon = system.byId.moon, earth = system.byId.earth;
    const axis = _a.copy(moon.pos).sub(sun.pos);
    const dsm = axis.length();
    axis.divideScalar(dsm);
    const em = _b.copy(earth.pos).sub(moon.pos);
    const t = em.dot(axis);
    if (t <= 0) return null;
    const x = em.addScaledVector(axis, -t).length();
    const pen = moon.radius + (t * (sun.radius + moon.radius)) / dsm;
    const umb = moon.radius - (t * (sun.radius - moon.radius)) / dsm;
    if (x < earth.radius + Math.abs(umb)) return umb > 0 ? 'total' : 'annular';
    return x < earth.radius + pen ? 'partial' : null;
  }

  // ---------------------------------------------------------------- marks
  buildMarkLayer() {
    const layer = document.createElement('div');
    layer.id = 'marks';
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = `<svg><defs>${Object.entries(TONES).map(([k, c]) => `<marker id="mk-head-${k}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${c}"/></marker>`).join('')}</defs></svg>`;
    $('sky-labels').after(layer);
    this.layer = layer;
    this.svg = layer.querySelector('svg');
  }

  setMarks(list) {
    for (const m of this.marks) { m.g?.remove(); m.el?.remove(); }
    this.marks = list.map((spec) => {
      const tone = TONES[spec.tone] ? spec.tone : 'amber';
      const m = { spec, tone, color: TONES[tone] };
      m.g = document.createElementNS(SVG, 'g');
      m.g.setAttribute('class', `mk mk-${spec.type}`);
      m.g.style.setProperty('--mk', m.color);
      this.svg.append(m.g);
      const line = (cls) => { const l = document.createElementNS(SVG, 'line'); l.setAttribute('class', cls); m.g.append(l); return l; };
      if (spec.type === 'arrow') {
        m.line = line('mk-line');
        m.line.setAttribute('marker-end', `url(#mk-head-${tone})`);
        if (spec.dash) m.line.setAttribute('stroke-dasharray', '6 5');
      } else if (spec.type === 'axis') {
        m.line = line('mk-line mk-axis');
      } else if (spec.type === 'ring') {
        m.circle = document.createElementNS(SVG, 'circle');
        m.circle.setAttribute('class', 'mk-ring');
        m.g.append(m.circle);
      } else {
        m.line = line('mk-leader');
        m.dot = document.createElementNS(SVG, 'circle');
        m.dot.setAttribute('class', 'mk-dot');
        m.dot.setAttribute('r', '3.5');
        m.g.append(m.dot);
      }
      const text = spec.text ?? (spec.type === 'axis' ? 'N' : '');
      if (text || spec.missText) {
        m.el = document.createElement('div');
        m.el.className = `mk-label${spec.type === 'axis' ? ' mk-small' : ''}`;
        m.el.style.setProperty('--mk', m.color);
        this.layer.append(m.el);
      }
      m.text = null;
      requestAnimationFrame(() => { m.g.classList.add('in'); m.el?.classList.add('in'); });
      return m;
    });
    this.drawMarks();
  }

  // A point spec (see the top of this file) as a world position, or null if it can't be found.
  resolve(spec, out) {
    const { app } = this;
    const body = (id) => app.lookup(id);
    if (typeof spec === 'string') { const b = body(spec); return b ? { p: out.copy(b.pos), body: b, center: true } : null; }
    if (spec.shadowOf) {
      const caster = body(spec.shadowOf), on = body(spec.on || 'earth'), sun = app.system.byId.sun;
      if (!caster || !on) return null;
      const axis = _a.copy(caster.pos).sub(sun.pos).normalize();
      const rel = _b.copy(on.pos).sub(caster.pos);
      const t = rel.dot(axis);
      const near = _c.copy(caster.pos).addScaledVector(axis, t); // closest point on the shadow's axis
      const x = near.distanceTo(on.pos);
      if (t > 0 && x < on.radius) {
        out.copy(caster.pos).addScaledVector(axis, t - Math.sqrt(on.radius * on.radius - x * x)); // where it lands
        return { p: out, body: on, surface: true };
      }
      // A miss. The shadow's nearest point can be tens of thousands of km away — off the side of the
      // screen — so the mark sits just off the body's edge, in the direction the shadow went past.
      const off = _d.copy(near).sub(on.pos);
      out.copy(on.pos).addScaledVector(off, Math.min(1, (on.radius * 1.5) / Math.max(x, 1)));
      return { p: out, miss: true, missKm: x - on.radius, missUp: off.y >= 0 };
    }
    if (spec.between) {
      const [a, b] = spec.between.map(body);
      return a && b ? { p: out.copy(a.pos).lerp(b.pos, spec.f ?? 0.5) } : null;
    }
    const b = body(spec.body);
    if (!b) return null;
    const R = b.radius;
    const dist = spec.km ?? (spec.r ?? 1) * R;
    if (spec.lat !== undefined) {
      app.system.surfacePoint(b, spec.lat, spec.lon ?? 0, out);
      if (spec.up) out.add(_a.copy(out).sub(b.pos).normalize().multiplyScalar(spec.up));
      return { p: out, body: b, surface: true };
    }
    if (spec.toward || spec.away) {
      const o = body(spec.toward || spec.away);
      if (!o) return null;
      const dir = _a.copy(o.pos).sub(b.pos).normalize().multiplyScalar(spec.away ? -1 : 1);
      return { p: out.copy(b.pos).addScaledVector(dir, dist) };
    }
    if (spec.pole) {
      const dir = _a.set(0, spec.pole === 'S' ? -1 : 1, 0).applyQuaternion(b.quat);
      return { p: out.copy(b.pos).addScaledVector(dir, dist) };
    }
    return { p: out.copy(b.pos), body: b, center: true };
  }

  // Screen position of a resolved point, or null when it's behind the camera or hidden behind a world.
  // Arrows and axes are drawn like a diagram, over everything, so they skip the hiding (occlude = false).
  screenOf(hit, occlude = true) {
    if (!hit?.p) return null;
    const { app } = this;
    const cam = app.camPos;
    if (hit.surface) {
      const n = _a.copy(hit.p).sub(hit.body.pos).normalize();
      if (n.dot(_b.copy(cam).sub(hit.p).normalize()) < 0.05) return null; // on the far side
    }
    if (!occlude) return this.hooks.project(hit.p);
    const seg = _c.copy(hit.p).sub(cam);
    const len = seg.length();
    seg.divideScalar(len);
    for (const b of app.system.bodies) {
      if (b === hit.body || b.screen.r < 1.5 || !b.screen.onScreen) continue;
      const oc = _d.copy(b.pos).sub(cam);
      const t = oc.dot(seg);
      if (t <= 0 || t >= len) continue;
      if (oc.addScaledVector(seg, -t).lengthSq() < b.radius * b.radius * 0.98) return null;
    }
    return this.hooks.project(hit.p);
  }

  drawMarks() {
    if (!this.marks.length) return;
    const w = window.innerWidth, h = window.innerHeight;
    const pA = new THREE.Vector3(), pB = new THREE.Vector3();
    for (const m of this.marks) {
      const s = m.spec;
      let anchor = null, show = true, text = s.text ?? (s.type === 'axis' ? 'N' : '');
      if (s.type === 'arrow' || s.type === 'axis') {
        const ends = s.type === 'axis'
          ? [{ body: s.body, pole: 'S', r: s.r ?? 1.6 }, { body: s.body, pole: 'N', r: s.r ?? 1.6 }]
          : [s.from, s.to];
        const a = this.screenOf(this.resolve(ends[0], pA), false);
        const b = this.screenOf(this.resolve(ends[1], pB), false);
        show = !!(a && b) && Math.hypot(b.x - a.x, b.y - a.y) > 12;
        if (show) {
          set(m.line, { x1: a.x, y1: a.y, x2: b.x, y2: b.y });
          if (s.type === 'axis') anchor = { x: b.x, y: b.y, dir: [b.x - a.x, b.y - a.y] };
          else {
            // beside the middle of the arrow, on its upper side
            let px = -(b.y - a.y), py = b.x - a.x;
            if (py > 0) { px = -px; py = -py; }
            anchor = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, dir: [px, py] };
          }
        }
      } else {
        const hit = this.resolve(s.at, pA);
        // a shadow that misses shows its missText beside the world, or nothing. {km} and {dir} in the
        // text are filled in with how far past the edge it went, and which way.
        if (hit?.miss) {
          text = s.type === 'ring' ? null : s.missText ?? null; // a ring round nothing means nothing
          if (text) {
            text = text.replace('{km}', Math.round(hit.missKm).toLocaleString()).replace('{dir}', hit.missUp ? 'above' : 'below');
          }
        }
        const p = hit && text !== null ? this.screenOf(hit) : null;
        show = !!p && p.x > -40 && p.x < w + 40 && p.y > -40 && p.y < h + 40;
        if (show && s.type === 'ring') {
          const r = Math.max(s.px ?? 16, (hit.center ? hit.body.screen.r : 0) * 1.3 + 6);
          set(m.circle, { cx: p.x, cy: p.y, r });
          anchor = { x: p.x, y: p.y, dir: DIRS[s.dir || 'ne'], gap: r };
        } else if (show) {
          const [dx, dy] = DIRS[s.dir || 'ne'];
          const len = s.len ?? 38;
          const r0 = hit.center ? Math.min(hit.body.screen.r, 60) : 0;
          const ex = p.x + dx * (len + r0), ey = p.y + dy * (len + r0);
          set(m.dot, { cx: p.x, cy: p.y });
          set(m.line, { x1: p.x + dx * r0, y1: p.y + dy * r0, x2: ex, y2: ey });
          anchor = { x: ex, y: ey, dir: [dx, dy], gap: 0 };
        }
      }
      m.g.style.display = show ? '' : 'none';
      if (!m.el) continue;
      m.el.style.display = show ? '' : 'none';
      if (!show) continue;
      if (text !== m.text) { m.text = text; m.el.innerHTML = text; m.box = null; }
      // the label sits off the end of its leader (or beside the arrow), on the side it points to
      let [dx, dy] = norm(anchor.dir);
      // measured once per text change; a zero means the label had not been laid out yet, so try again
      if (!m.box?.h) m.box = { w: m.el.offsetWidth, h: m.el.offsetHeight };
      const bw = m.box.w || 120, bh = m.box.h || 30;
      // flip to the other side rather than run off the edge
      const gap = (anchor.gap ?? 0) + (s.type === 'arrow' ? 10 : s.type === 'axis' ? 8 : 4);
      if (anchor.x + dx * (gap + bw) > w - 8 && anchor.x - dx * (gap + bw) > 8) dx = -dx;
      if (anchor.y + dy * (gap + bh) > h - 8 && anchor.y - dy * (gap + bh) > 8) dy = -dy;
      const x = anchor.x + dx * gap, y = anchor.y + dy * gap;
      const tx = dx > 0.35 ? 0 : dx < -0.35 ? -bw : -bw / 2;
      const ty = dy > 0.35 ? 0 : dy < -0.35 ? -bh : -bh / 2;
      // and if it still pokes out, slide it back inside
      const cx = Math.min(Math.max(x + tx, 8), Math.max(8, w - bw - 8));
      const cy = Math.min(Math.max(y + ty, 8), Math.max(8, h - bh - 8));
      m.el.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`;
    }
  }
}

function set(node, attrs) { for (const k in attrs) node.setAttribute(k, typeof attrs[k] === 'number' ? attrs[k].toFixed(1) : attrs[k]); }
function norm([x, y]) { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; }
