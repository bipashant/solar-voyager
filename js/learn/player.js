// A lesson scene: the live app in an iframe (see js/embed.js), played like a video.
//
// A scene is a script of beats on a timeline, in seconds. A beat can say a caption, move the camera, set
// the clock and how fast it runs, switch layers and pin marks; the app runs the real simulation in between.
// Viewers can pause, scrub, jump between chapters and have captions read aloud. The view stays live the
// whole time: drag it and the camera is yours (the lesson keeps talking) until you press Guided view;
// touch the clock, or a "Jump to" button, and the lesson waits while you explore.
//
//   {
//     id, title, ui: ['clock', 'zoom'], layers: ['orbits', 'labels'],   // app controls and View switches
//     start: '2024-04-08T16:30Z', view: { at: 'earth', pov: 'from:moon', alt: 30000 },
//     set: { on: [...], off: [...] },                                     // layers at the start
//     beats: [{ t: 0, say, chapter, rate: 'min10', time, view, layers, marks }, ...],
//     end: 40,                                                            // length in seconds
//     presets: [{ label, time, rate, view, marks }],                     // "Jump to" buttons
//     challenges: [{ id, text, check: (state) => bool, yay }],           // checked while exploring
//   }
import { TIME_RATES } from '../data.js';
import { progress } from './progress.js';
import { narrationUrl, spoken } from './narration.js';

const RATE = Object.fromEntries(TIME_RATES.map((r) => [r.id, r.rate]));
const RATE_LABEL = {
  pause: 'Paused', real: 'Real time', min: '1 minute every second', min10: '10 minutes every second',
  hour: '1 hour every second', day: '1 day every second', week: '1 week every second',
  month: '1 month every second', year: '1 year every second',
};
const APP = new URL('../../', import.meta.url).href; // the app, at the site root
const lowMemory = Math.min(screen.width, screen.height) < 600 || (navigator.deviceMemory || 8) <= 4;
const MAX_LIVE = lowMemory ? 2 : 3; // live 3D views at once; the rest wait as covers
const live = new Set();
const players = new Map(); // iframe window -> player
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const NARRATION = new URL('../../audio/narration/', import.meta.url).href; // see tools/narrate.py
const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 5.5h3v13h-3zM13.5 5.5h3v13h-3z"/></svg>',
  replay: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12a7 7 0 1 0 2.1-5" fill="none"/><path d="M4.5 3.5v4.5H9"/></svg>',
  voice: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5h3.5l5 4v-13l-5 4z"/><path class="w" d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none"/></svg>',
  cc: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5.5" width="18" height="13" rx="2.5" fill="none"/><path d="M10.5 10.2a2.4 2.4 0 1 0 0 3.6M16.5 10.2a2.4 2.4 0 1 0 0 3.6" fill="none"/></svg>',
  guide: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.5" fill="none"/><circle cx="12" cy="12" r="2.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" fill="none"/></svg>',
  full: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/></svg>',
};

// ---------------------------------------------------------------- read aloud (shared by every player)
const prefs = {
  get(k, d) { try { const v = localStorage.getItem(`voyagerAcademy.${k}`); return v === null ? d : v === '1'; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`voyagerAcademy.${k}`, v ? '1' : '0'); } catch { /* private mode */ } },
};
// Narration is recorded ahead of time with a neural voice (tools/narrate.py) and streamed as small MP3s,
// which sounds far better than anything the browser can synthesise. The browser's own voice is only the
// fallback, for a caption that hasn't been recorded yet or a recording that won't load.
const voice = {
  on: prefs.get('narrate', false),
  token: 0,       // bumped whenever a new line starts or the voice is stopped, so a late "ended" can't act on a stale line
  current: null,  // { html, audio, paused }
  cache: new Map(),

  clip(lesson, html) {
    const url = narrationUrl(NARRATION, lesson, html);
    let a = this.cache.get(url);
    if (!a) {
      a = new Audio();
      a.preload = 'auto';
      a.src = url;
      this.cache.set(url, a);
      if (this.cache.size > 8) this.cache.delete(this.cache.keys().next().value); // keep memory small
    }
    return a;
  },
  preload(lesson, html) { if (html) this.clip(lesson, html); },

  say(lesson, html, done) {
    this.stop();
    const me = this.token;
    const a = this.clip(lesson, html);
    let finished = false, fellBack = false, timer = 0;
    const end = () => { if (finished || me !== this.token) return; finished = true; clearTimeout(timer); this.current = null; done?.(); };
    // a missing file fails twice over (the load error, and the rejected play()), so only fall back once
    const robot = () => { clearTimeout(timer); if (fellBack || finished || me !== this.token) return; fellBack = true; this.robot(html, end); };
    this.current = { lesson, html, audio: a, paused: false };
    try { a.currentTime = 0; } catch { /* not loaded yet: it starts at the beginning anyway */ }
    a.onended = end;
    a.onerror = robot;
    // a recording that never starts (missing, or a stalled connection) shouldn't leave the lesson waiting on it
    timer = setTimeout(() => { if (a.readyState < 2 || a.currentTime === 0) robot(); }, 6000);
    a.play().catch((err) => { if (err?.name === 'NotAllowedError') end(); else robot(); });
  },

  // Pick up a line that was paused part-way, if that's the one asked for.
  resume(lesson, html) {
    const c = this.current;
    if (!c || !c.paused || c.lesson !== lesson || c.html !== html) return false;
    c.paused = false;
    c.audio.play().catch(() => {});
    return true;
  },
  pause() {
    const c = this.current;
    if (c && !c.paused && !c.audio.ended) { c.paused = true; c.audio.pause(); }
    else if ('speechSynthesis' in window) speechSynthesis.cancel();
  },
  stop() {
    this.token++;
    const c = this.current;
    this.current = null;
    if (c) { c.audio.onended = c.audio.onerror = null; c.audio.pause(); }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  },

  // The browser's own voice, as the fallback.
  pick() {
    const vs = speechSynthesis.getVoices().filter((v) => /^en[-_]/i.test(v.lang));
    const like = ['Samantha', 'Google US English', 'Microsoft Aria Online', 'Microsoft Jenny Online', 'Karen', 'Daniel', 'Google UK English Female'];
    return like.map((n) => vs.find((v) => v.name.startsWith(n))).find(Boolean) || vs.find((v) => v.localService) || vs[0];
  },
  robot(html, end) {
    const text = spoken(html);
    if (!('speechSynthesis' in window)) { end(); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = this.pick() || null;
    u.rate = 0.98; u.pitch = 1.04;
    u.onend = end; u.onerror = end;
    setTimeout(end, 2500 + text.length * 90); // some browsers never send onend
    speechSynthesis.speak(u);
  },
};
if ('speechSynthesis' in window) speechSynthesis.getVoices(); // starts the (async) voice list loading

window.addEventListener('message', (e) => {
  const p = players.get(e.source);
  if (p && e.data?.voyager === 'evt') p.onEvent(e.data);
});

// ---------------------------------------------------------------- the player
export class ScenePlayer {
  constructor(root, scene, { lesson, onStar } = {}) {
    this.root = root;
    this.scene = scene;
    this.lesson = lesson;
    this.onStar = onStar;
    this.beats = [...scene.beats].sort((a, b) => a.t - b.t);
    this.dur = scene.end ?? (this.beats.at(-1)?.t ?? 0) + 6;
    this.chapters = this.beats.filter((b) => b.chapter);
    this.t = 0;
    this.playing = false;
    this.ready = false;
    this.camFree = false;
    this.exploring = false; // the viewer has the clock (or used a Jump to button): the script waits
    this.touched = false;   // challenges only count once the viewer has done something themselves
    this.beat = -1;
    this.lastSeen = 0;
    this.build();
    this.observe();
  }

  // ---------------------------------------------------------------- the timeline, worked out at any moment
  stateAt(t) {
    const s = this.scene;
    let sim = Date.parse(s.start), rate = s.rate || 'pause', at = 0;
    let view = s.view, viewBeat = -1, marks = s.marks || [], caption = '', beat = -1;
    const on = new Set(s.set?.on), off = new Set(s.set?.off);
    this.beats.forEach((b, i) => {
      if (b.t > t) return;
      sim += RATE[rate] * (b.t - at) * 1000;
      at = b.t;
      beat = i;
      if (b.time) sim = Date.parse(b.time);
      if (b.rate) rate = b.rate;
      if (b.view) { view = b.view; viewBeat = i; }
      if (b.marks) marks = b.marks;
      if (b.say !== undefined) caption = b.say;
      for (const k of b.layers?.on || []) { on.add(k); off.delete(k); }
      for (const k of b.layers?.off || []) { off.add(k); on.delete(k); }
    });
    sim += RATE[rate] * (t - at) * 1000;
    return { sim, rate, view, viewBeat, marks, caption, beat, layers: { on: [...on], off: [...off] } };
  }

  // ---------------------------------------------------------------- DOM
  build() {
    const s = this.scene, r = this.root;
    r.classList.add('sp');
    r.innerHTML = `
      <div class="sp-stage">
        <div class="sp-view">
          <div class="sp-cover">
            <button class="sp-load" type="button"><span class="sp-load-icon">${ICON.play}</span><span><b>Load the 3D scene</b><small>${s.title}</small></span></button>
          </div>
          <button class="sp-big" type="button" aria-label="Play the scene" hidden>${ICON.play}</button>
          <div class="sp-note" role="status" hidden></div>
        </div>
        <div class="sp-cap" aria-live="polite"><p></p></div>
      </div>
      <div class="sp-bar">
        <button class="sp-btn sp-play" type="button" aria-label="Play">${ICON.play}</button>
        <div class="sp-track" role="slider" tabindex="0" aria-label="Scene timeline" aria-valuemin="0" aria-valuemax="${Math.round(this.dur)}" aria-valuenow="0">
          <div class="sp-rail"><div class="sp-fill"></div></div>
          ${this.chapters.map((c) => `<i class="sp-tick" style="left:${(c.t / this.dur) * 100}%"></i>`).join('')}
          <div class="sp-thumb"></div>
        </div>
        <span class="sp-time">0:00 / ${fmt(this.dur)}</span>
        <span class="sp-rate" title="How fast time runs in the scene"></span>
        <button class="sp-btn sp-guide" type="button" hidden title="Put the camera back on the lesson's view">${ICON.guide}<span>Guided view</span></button>
        <button class="sp-btn sp-voice" type="button" aria-pressed="${voice.on}" title="Listen: read the captions aloud">${ICON.voice}<span>Listen</span></button>
        <button class="sp-btn sp-cc" type="button" aria-pressed="true" title="Captions">${ICON.cc}</button>
        <button class="sp-btn sp-full" type="button" aria-label="Full screen" title="Full screen">${ICON.full}</button>
      </div>
      ${this.chapters.length > 1 ? `<div class="sp-chapters">${this.chapters.map((c, i) => `<button type="button" data-t="${c.t}"><i>${i + 1}</i>${c.chapter}</button>`).join('')}</div>` : ''}
      ${s.presets?.length ? `<div class="sp-presets"><span>Jump to</span>${s.presets.map((p, i) => `<button type="button" data-p="${i}">${p.label}</button>`).join('')}</div>` : ''}
      ${s.challenges?.length ? `<div class="sp-challenges"><div class="sp-ch-head"><b>Your turn</b><span>Use the controls in the view to…</span></div><ul>${s.challenges.map((c) => `<li data-c="${c.id}">${ICON.star}<span>${c.text}</span></li>`).join('')}</ul></div>` : ''}
    `;
    const q = (sel) => r.querySelector(sel);
    this.el = {
      view: q('.sp-view'), cover: q('.sp-cover'), big: q('.sp-big'), cap: q('.sp-cap p'), capBox: q('.sp-cap'), note: q('.sp-note'),
      play: q('.sp-play'), track: q('.sp-track'), fill: q('.sp-fill'), thumb: q('.sp-thumb'), time: q('.sp-time'), rate: q('.sp-rate'),
      guide: q('.sp-guide'), voice: q('.sp-voice'), cc: q('.sp-cc'), full: q('.sp-full'),
    };
    q('.sp-load').addEventListener('click', () => this.load(true));
    this.el.big.addEventListener('click', () => (this.t >= this.dur - 0.05 ? this.replay() : this.play()));
    this.el.play.addEventListener('click', () => (this.playing ? this.pause() : this.t >= this.dur - 0.05 ? this.replay() : this.play()));
    this.el.guide.addEventListener('click', () => this.guide());
    this.el.voice.addEventListener('click', () => {
      voice.on = !voice.on;
      prefs.set('narrate', voice.on);
      for (const p of players.values()) p.el.voice.setAttribute('aria-pressed', String(voice.on));
      if (voice.on && this.playing && this.lastCaption) this.speak(this.lastCaption);
      else this.silence();
    });
    this.el.cc.addEventListener('click', () => {
      const on = this.el.cc.getAttribute('aria-pressed') !== 'true';
      this.el.cc.setAttribute('aria-pressed', String(on));
      this.root.classList.toggle('no-cc', !on);
    });
    this.el.full.addEventListener('click', () => this.fullscreen());
    r.querySelector('.sp-chapters')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-t]');
      if (b) { this.seek(Number(b.dataset.t) + 0.01, true); if (!this.playing) this.play(); }
    });
    r.querySelector('.sp-presets')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-p]');
      if (b) this.preset(this.scene.presets[Number(b.dataset.p)], b);
    });
    this.bindTrack();
    for (const c of s.challenges || []) if (progress.isChallengeDone(this.lesson, `${s.id}.${c.id}`)) this.markChallenge(c, false);
    this.render(true);
  }

  bindTrack() {
    const tr = this.el.track;
    let drag = false, wasPlaying = false;
    const at = (e) => {
      const r = tr.getBoundingClientRect();
      return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * this.dur;
    };
    tr.addEventListener('pointerdown', (e) => {
      drag = true; wasPlaying = this.playing;
      tr.setPointerCapture(e.pointerId);
      if (this.playing) this.pause(true);
      this.seek(at(e), true);
    });
    tr.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const now = performance.now();
      if (now - (this.lastScrub || 0) < 40) { this.t = at(e); this.render(); return; } // stay smooth; send ~25 a second
      this.lastScrub = now;
      this.seek(at(e), true);
    });
    const end = (e) => { if (!drag) return; drag = false; this.seek(at(e), true); if (wasPlaying) this.play(); };
    tr.addEventListener('pointerup', end);
    tr.addEventListener('pointercancel', end);
    tr.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 10 : 3;
      if (e.key === 'ArrowRight') { this.seek(this.t + step, true); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { this.seek(this.t - step, true); e.preventDefault(); }
      if (e.key === 'Home') { this.seek(0, true); e.preventDefault(); }
      if (e.key === ' ' || e.key === 'k') { if (this.playing) this.pause(); else this.play(); e.preventDefault(); }
    });
  }

  // ---------------------------------------------------------------- the live view: load, sleep, unload
  observe() {
    this.io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        this.visible = e.isIntersecting;
        if (e.isIntersecting) {
          this.lastSeen = performance.now();
          this.load(false);
          this.send({ type: 'sleep', on: false });
        } else {
          if (this.playing) this.pause();
          this.send({ type: 'sleep', on: true });
        }
      }
    }, { rootMargin: '250px 0px' });
    this.io.observe(this.root);
  }

  // Load the iframe: automatically when the scene comes near the screen (if there's room for another live
  // view), or on a tap, which frees room by putting away the view furthest out of sight.
  load(force) {
    if (this.frame) return;
    if (live.size >= MAX_LIVE) {
      const spare = [...live].filter((p) => !p.visible).sort((a, b) => a.lastSeen - b.lastSeen)[0];
      if (spare) spare.unload();
      else if (!force) return;
    }
    const s = this.scene, st = this.stateAt(this.t);
    const q = new URLSearchParams({ embed: '1', ui: (s.ui || ['zoom']).join(','), layers: (s.layers || []).join(',') });
    const h = new URLSearchParams();
    const v = st.view || { at: 'earth' };
    h.set('at', v.at || 'earth');
    if (v.pov) h.set('pov', v.pov);
    if (v.alt) h.set('alt', String(Math.round(v.alt)));
    h.set('time', new Date(st.sim).toISOString().replace('.000Z', 'Z'));
    h.set('rate', 'pause');
    if (st.layers.on.length) h.set('on', st.layers.on.join(','));
    if (st.layers.off.length) h.set('off', st.layers.off.join(','));
    const f = document.createElement('iframe');
    f.className = 'sp-frame';
    f.title = `3D scene: ${s.title}`;
    f.allow = 'fullscreen';
    f.src = `${APP}?${q.toString().replace(/%2C/g, ',')}#${h.toString().replace(/%2C/g, ',').replace(/%3A/g, ':')}`;
    this.el.view.prepend(f);
    this.frame = f;
    players.set(f.contentWindow, this);
    live.add(this);
    this.root.classList.add('loading');
    this.el.cover.hidden = true;
  }

  unload() {
    if (!this.frame) return;
    if (this.playing) this.pause();
    players.delete(this.frame.contentWindow);
    this.frame.remove();
    this.frame = null;
    this.ready = false;
    live.delete(this);
    this.root.classList.remove('ready', 'loading');
    this.el.cover.hidden = false;
    this.el.big.hidden = true;
  }

  send(msg) {
    if (!this.frame || !this.ready) return;
    this.frame.contentWindow.postMessage({ voyager: 'cmd', ...msg }, new URL(APP).origin);
  }

  onEvent(e) {
    if (e.type === 'ready') {
      this.ready = true;
      this.root.classList.remove('loading');
      this.root.classList.add('ready');
      this.el.big.hidden = this.playing;
      this.seek(this.t, true);
      if (!this.visible) this.send({ type: 'sleep', on: true });
    } else if (e.type === 'state') {
      this.state = e;
      this.checkChallenges();
    } else if (e.type === 'interact') {
      this.touched = true;
      if (e.kind === 'camera' || e.kind === 'fly') this.setCamFree(true);
      if (e.kind === 'time' || e.kind === 'fly') this.explore();
    }
  }

  // ---------------------------------------------------------------- playing
  play() {
    if (!this.frame) this.load(true);
    if (this.t >= this.dur - 0.05) this.t = 0;
    this.playing = true;
    this.exploring = false;
    this.ended = false;
    this.el.big.hidden = true;
    this.note(null);
    for (const p of players.values()) if (p !== this && p.playing) p.pause();
    this.apply(this.stateAt(this.t), { time: true, view: !this.camFree, all: true });
    if (voice.on && this.lastCaption && !voice.resume(this.lesson, this.lastCaption)) this.speak(this.lastCaption);
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    const loop = (now) => {
      if (!this.playing) return;
      this.tick(Math.min(0.1, (now - this.last) / 1000));
      this.last = now;
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    this.render();
  }

  pause(quiet = false) {
    this.playing = false;
    this.holding = false;
    cancelAnimationFrame(this.raf);
    voice.pause();
    if (!this.exploring && !quiet) this.send({ type: 'time', ms: this.stateAt(this.t).sim, rate: 'pause' });
    this.render();
  }

  replay() {
    this.setCamFree(false);
    this.seek(0, true);
    this.play();
  }

  tick(dt) {
    if (!this.ready) return; // the clock waits for the view to load
    const next = this.beats[this.beat + 1];
    if (this.holding) return; // waiting for the narrator to finish
    let t = this.t + dt;
    // reading aloud: don't run into the next caption while this one is still being read
    if (voice.on && this.speaking && next && next.say !== undefined && t >= next.t) {
      this.t = next.t - 0.001;
      this.holding = true;
      this.send({ type: 'time', ms: this.stateAt(this.t).sim, rate: 'pause' });
      this.render();
      return;
    }
    if (t >= this.dur) {
      t = this.dur;
      this.t = t;
      this.finish();
      return;
    }
    this.t = t;
    if (next && t >= next.t) this.enterBeat();
    this.render();
  }

  // Crossing into a new beat while playing: send only what it changes, keep the clock in step.
  enterBeat() {
    const st = this.stateAt(this.t);
    const b = this.beats[st.beat];
    this.apply(st, { time: true, view: !!b.view && !this.camFree, layers: !!b.layers, marks: !!b.marks });
  }

  finish() {
    this.playing = false;
    this.ended = true;
    cancelAnimationFrame(this.raf);
    this.send({ type: 'time', ms: this.stateAt(this.dur).sim, rate: 'pause' });
    if (progress.sceneDone(this.lesson, this.scene.id)) this.onStar?.('scene', this.scene.title);
    this.bigButton('replay');
    this.note(this.scene.challenges?.length ? 'Scene complete ★ &nbsp;Now it’s your turn: try the challenges below.' : 'Scene complete ★ &nbsp;Drag, zoom and explore, or replay.', 0);
    this.render();
  }

  // Jump the timeline to t: everything is worked out afresh and sent in one go.
  seek(t, guided = false) {
    this.t = Math.min(this.dur, Math.max(0, t));
    this.ended = false;
    if (guided) this.setCamFree(false);
    this.exploring = false;
    this.note(null);
    this.holding = false;
    const st = this.stateAt(this.t);
    this.beat = -2; // forces the caption to refresh
    this.apply(st, { time: true, view: !this.camFree, layers: true, marks: true, snap: true });
    if (this.bigMode === 'replay') this.bigButton('play');
    this.render(true);
  }

  apply(st, { time = false, view = false, layers = false, marks = false, snap = false, all = false }) {
    const msg = { type: 'scene' };
    if (time) msg.time = { ms: st.sim, rate: this.playing ? st.rate : 'pause' };
    if (view && st.view) msg.view = { ...st.view, snap: snap && st.view.snap !== false };
    if (layers || all) msg.layers = st.layers;
    if (marks || all) msg.marks = st.marks;
    this.send(msg);
    if (st.beat !== this.beat) {
      this.beat = st.beat;
      this.caption(st.caption);
    }
    this.rateNow = this.playing || !time ? st.rate : 'pause';
  }

  // ---------------------------------------------------------------- the viewer takes over
  setCamFree(on) {
    this.camFree = on;
    this.el.guide.hidden = !on;
  }

  guide() {
    this.setCamFree(false);
    const st = this.stateAt(this.t);
    if (!this.exploring) this.send({ type: 'view', ...st.view });
    else this.seek(this.t, true);
  }

  explore() {
    if (this.playing) {
      this.playing = false;
      cancelAnimationFrame(this.raf);
      this.silence();
    }
    this.exploring = true;
    this.note('You’re exploring. Press <b>play</b> to pick the lesson up where it left off.');
    this.render();
  }

  preset(p, btn) {
    if (!this.frame) this.load(true);
    this.touched = true;
    this.explore();
    for (const b of this.root.querySelectorAll('.sp-presets button')) b.classList.toggle('on', b === btn);
    const msg = { type: 'scene' };
    if (p.time) msg.time = { ms: Date.parse(p.time), rate: p.rate || 'pause' };
    else if (p.rate) msg.time = { rate: p.rate };
    if (p.view) { msg.view = p.view; this.setCamFree(true); }
    if (p.layers) msg.layers = p.layers;
    if (p.marks) msg.marks = p.marks;
    this.send(msg);
    if (p.say) this.caption(p.say);
  }

  // ---------------------------------------------------------------- captions, notes, challenges
  caption(html) {
    if (html === this.lastCaption) return;
    this.lastCaption = html;
    const cap = this.el.cap;
    cap.classList.remove('in');
    void cap.offsetWidth;
    cap.innerHTML = html || '';
    cap.classList.add('in');
    this.el.capBox.hidden = !html;
    if (this.playing && voice.on && html) this.speak(html);
  }

  // Stop talking for good (not just paused), and forget that anything was being said.
  silence() {
    this.utter = (this.utter || 0) + 1;
    this.speaking = false;
    voice.stop();
  }

  speak(html) {
    this.speaking = true;
    const me = (this.utter = (this.utter || 0) + 1);
    // the next line is fetched while this one plays, so there's no gap between them
    const next = this.beats.find((b) => b.t > this.t && b.say);
    if (next) voice.preload(this.lesson, next.say);
    voice.say(this.lesson, html, () => {
      if (me !== this.utter) return;
      this.speaking = false;
      if (this.holding) {
        this.holding = false;
        if (this.playing) { this.t = Math.min(this.dur, this.t + 0.002); this.enterBeat(); this.last = performance.now(); }
      }
    });
  }

  note(html, ms = 0) {
    const n = this.el.note;
    clearTimeout(this.noteTimer);
    if (!html) { n.hidden = true; return; }
    n.innerHTML = html;
    n.hidden = false;
    if (ms) this.noteTimer = setTimeout(() => { n.hidden = true; }, ms);
  }

  checkChallenges() {
    const s = this.state;
    if (!s || !this.touched || this.playing) return;
    for (const c of this.scene.challenges || []) {
      const key = `${this.scene.id}.${c.id}`;
      if (progress.isChallengeDone(this.lesson, key)) continue;
      let ok = false;
      try { ok = !!c.check(s); } catch { ok = false; }
      if (!ok) continue;
      progress.challengeDone(this.lesson, key);
      this.markChallenge(c, true);
      this.onStar?.('challenge', c.text);
      this.note(`★ ${c.yay || 'Challenge complete!'}`, 7000);
    }
  }

  markChallenge(c, animate) {
    const li = this.root.querySelector(`[data-c="${c.id}"]`);
    if (!li) return;
    li.classList.add('done');
    if (animate) li.classList.add('pop');
  }

  render(force) {
    const p = this.t / this.dur;
    this.el.fill.style.transform = `scaleX(${p})`;
    this.el.thumb.style.left = `${p * 100}%`;
    const sec = Math.floor(this.t);
    if (force || sec !== this.lastSec) {
      this.lastSec = sec;
      this.el.time.textContent = `${fmt(this.t)} / ${fmt(this.dur)}`;
      this.el.track.setAttribute('aria-valuenow', String(sec));
      this.el.track.setAttribute('aria-valuetext', `${fmt(this.t)} of ${fmt(this.dur)}`);
    }
    const playing = this.playing && !this.holding;
    const btn = this.playing ? 'pause' : this.ended ? 'replay' : 'play';
    if (btn !== this.btnState) {
      this.btnState = btn;
      this.el.play.innerHTML = ICON[btn];
      this.el.play.setAttribute('aria-label', btn[0].toUpperCase() + btn.slice(1));
    }
    const rate = this.exploring ? null : playing ? this.stateAt(this.t).rate : 'pause';
    const label = rate ? RATE_LABEL[rate] : 'You have the controls';
    if (label !== this.rateLabel) {
      this.rateLabel = label;
      this.el.rate.textContent = label;
      this.el.rate.classList.toggle('live', !!rate && rate !== 'pause');
    }
    this.root.classList.toggle('playing', this.playing);
    const chips = this.root.querySelectorAll('.sp-chapters button');
    let cur = -1;
    this.chapters.forEach((c, i) => { if (this.t >= c.t - 0.02) cur = i; });
    chips.forEach((b, i) => b.classList.toggle('on', i === cur));
  }

  bigButton(mode) {
    this.bigMode = mode;
    this.el.big.innerHTML = ICON[mode];
    this.el.big.setAttribute('aria-label', mode === 'replay' ? 'Replay the scene' : 'Play the scene');
    this.el.big.hidden = false;
  }

  fullscreen() {
    const r = this.root;
    const exit = () => r.classList.remove('theater');
    if (document.fullscreenElement === r) { document.exitFullscreen(); return; }
    if (r.classList.contains('theater')) { exit(); return; }
    if (r.requestFullscreen) r.requestFullscreen().catch(() => r.classList.add('theater'));
    else r.classList.add('theater'); // iPhone Safari: fill the window instead
  }
}
