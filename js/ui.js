// DOM side of the app: panels, selects, the flight HUD and screen-space labels.
import * as THREE from 'three';
import { BODIES, SPEEDS, TRAVEL_MODES, TIME_RATES } from './data.js';
import { DSO_GROUPS } from './deepsky-data.js';
import { fmtDistance, fmtAU, fmtDuration, fmtLightTime, fmtSpeed, fmtFactor, fmtCompact, fmtSci, fmtLength, fmtTiny, fmtArc } from './format.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

const PARENT_LABEL = { earth: 'Earth', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune', pluto: 'Pluto' };

export class UI {
  constructor(app) {
    this.app = app;
    // Phones start in a calm layout: logo and View at the top, a collapsed Engage dock at the bottom.
    // Everything else is one switch away under View > Panels.
    const wide = window.innerWidth >= 720;
    this.toggles = { orbits: true, labels: true, deepsky: true, dso: true, constellations: false, starnames: false, curvature: false, cockpit: true, info: false, console: wide, clock: wide, zoom: wide };
    this.labelEls = new Map();
    this.featureEls = [];
    this.skyEls = { const: [], names: [] };
    this.deepEls = [];
    this.lastText = 0;
    this.buildSelects();
    this.bindPanels();
    this.bindZoom();
    for (const [k, v] of Object.entries(this.toggles)) this.setToggle(k, v);
  }

  // ---------------------------------------------------------------- controls
  buildSelects() {
    const dest = $('dest');
    const groups = [['Star', (b) => b.kind === 'star'], ['Planets', (b) => b.kind === 'planet'], ['Dwarf planet', (b) => b.kind === 'dwarf']];
    for (const [label, test] of groups) {
      const g = el('optgroup'); g.label = label;
      for (const b of BODIES.filter(test)) { const o = el('option', null, b.name); o.value = b.id; g.append(o); }
      dest.append(g);
    }
    // galaxies, nebulae and star clusters, beyond the Solar System
    for (const [label, kind] of DSO_GROUPS) {
      const g = el('optgroup'); g.label = label;
      for (const b of this.app.deepSky.objects.filter((o) => o.kind === kind)) { const o = el('option', null, b.name); o.value = b.id; g.append(o); }
      dest.append(g);
    }
    for (const [pid, pname] of Object.entries(PARENT_LABEL)) {
      const moons = BODIES.filter((b) => b.parent === pid);
      if (!moons.length) continue;
      const g = el('optgroup'); g.label = `Moons of ${pname}`;
      for (const b of moons) { const o = el('option', null, b.name); o.value = b.id; g.append(o); }
      dest.append(g);
    }
    const speed = $('speed');
    for (const s of SPEEDS) { const o = el('option', null, s.label); o.value = s.id; speed.append(o); }
    const mode = $('mode');
    for (const m of TRAVEL_MODES) { const o = el('option', null, m.label); o.value = m.id; mode.append(o); }
    const rate = $('time-rate');
    for (const r of TIME_RATES) { const o = el('option', null, r.label); o.value = r.id; rate.append(o); }

    dest.addEventListener('change', () => this.app.setDestination(dest.value, { fromSelect: true }));
    speed.addEventListener('change', () => { this.app.state.speed = SPEEDS.find((s) => s.id === speed.value); this.refreshTrip(true); });
    mode.addEventListener('change', () => { this.app.state.mode = TRAVEL_MODES.find((m) => m.id === mode.value); this.refreshTrip(true); });
    rate.addEventListener('change', () => this.app.setTimeRate(rate.value));
    $('time-now').addEventListener('click', () => this.app.resetTime());
    $('engage').addEventListener('click', () => this.app.engage());
    $('abort').addEventListener('click', () => this.app.abort());
  }

  syncSelects() {
    const s = this.app.state;
    $('dest').value = s.destination.id;
    $('speed').value = s.speed.id;
    $('mode').value = s.mode.id;
    $('time-rate').value = s.timeRate.id;
  }

  bindPanels() {
    for (const b of document.querySelectorAll('.tog')) {
      b.addEventListener('click', () => {
        const key = b.dataset.toggle;
        this.setToggle(key, !this.toggles[key]);
      });
    }
    $('info-collapse').addEventListener('click', () => {
      const info = $('info');
      const c = info.classList.toggle('collapsed');
      $('info-collapse').setAttribute('aria-expanded', String(!c));
    });
    $('info-go').addEventListener('click', () => this.app.setDestination(this.inspect.id));

    // The View dropdown stays open while you flip several switches; a tap anywhere else closes it.
    $('btn-layers').addEventListener('click', () => this.setMenu(!$('toggles').classList.contains('open')));
    document.addEventListener('pointerdown', (e) => {
      if (!$('toggles').contains(e.target)) this.setMenu(false);
    });
    $('btn-hide-ui').addEventListener('click', () => this.setChromeHidden(true));
    $('btn-show-ui').addEventListener('click', () => this.setChromeHidden(false));
    // In clear view the dock icons peek at a panel; otherwise they switch the panel itself on or off.
    const panelShown = (which) => (this.uiHidden ? this.peeking(which) : this.toggles[which]);
    const showPanel = (which, on) => (this.uiHidden ? this.setPeek(which, on) : this.setToggle(which, on));
    $('dock-info').addEventListener('click', () => {
      const open = !panelShown('info');
      // details describe whatever the dock is showing: the flight target, the destination, or here
      if (open && this.dockBody && this.dockBody !== this.inspect) {
        this.showInfo(this.dockBody, this.dockBody === this.app.state.focus ? 'Current location' : 'Destination');
      }
      showPanel('info', open);
    });
    $('dock-console').addEventListener('click', () => showPanel('console', !panelShown('console')));
    // A panel's × closes it, which is the same as switching it off under View (or ends a peek in clear view).
    for (const b of document.querySelectorAll('[data-close]')) {
      b.addEventListener('click', () => {
        const which = b.dataset.close;
        if (this.uiHidden && this.peeking(which)) this.setPeek(which, false);
        else this.setToggle(which, false);
      });
    }
    $('dock-go').addEventListener('click', () => this.app.engage());
    $('dock-abort').addEventListener('click', () => this.app.abort());
    // The flight readout is one quiet line; tapping it shows the ship clock and exact figures.
    $('flight-more').addEventListener('click', () => {
      const open = $('flight-details').hidden;
      $('flight-details').hidden = !open;
      $('flight-more').setAttribute('aria-expanded', String(open));
    });
    // Poster, help and full screen sit in the top row on wide screens and inside the View menu on phones.
    const actions = {
      poster: () => this.app.openPoster?.(),
      help: () => this.showHelp(true),
      fullscreen: () => {
        try {
          if (document.fullscreenElement) document.exitFullscreen();
          else document.documentElement.requestFullscreen?.().catch(() => {});
        } catch { /* fullscreen not available */ }
      },
    };
    for (const b of document.querySelectorAll('[data-action]')) {
      b.addEventListener('click', () => { this.setMenu(false); actions[b.dataset.action]?.(); });
    }
    $('help-close').addEventListener('click', () => this.showHelp(false));
    $('help').addEventListener('click', (e) => { if (e.target.id === 'help') this.showHelp(false); });
    if (window.innerWidth < 720) $('info').classList.add('collapsed');
    const setConsoleH = () => document.documentElement.style.setProperty('--console-h', `${$('console').offsetHeight}px`);
    if (window.ResizeObserver) new ResizeObserver(setConsoleH).observe($('console'));
    setConsoleH();
  }

  // ---------------------------------------------------------------- zoom control
  bindZoom() {
    const rig = this.app.rig;
    const hold = (btn, dir) => {
      let timer = null;
      const stop = () => {
        clearTimeout(timer);
        timer = null;
        rig.zoomHold = 0;
        btn.classList.remove('holding');
      };
      btn.addEventListener('pointerdown', (e) => {
        if (btn.disabled) return;
        e.preventDefault();
        btn.setPointerCapture?.(e.pointerId);
        rig.zoomStep(dir);
        // keep zooming smoothly while the button is held down
        timer = setTimeout(() => { rig.zoomHold = dir; btn.classList.add('holding'); }, 260);
      });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(ev, stop);
      // keyboard activation (Enter / Space) arrives as a click with no pointer
      btn.addEventListener('click', (e) => { if (e.detail === 0) rig.zoomStep(dir); });
    };
    hold($('zoom-in'), 1);
    hold($('zoom-out'), -1);
    const slider = $('zoom-slider');
    slider.addEventListener('pointerdown', () => { this.zoomDragging = true; });
    window.addEventListener('pointerup', () => { this.zoomDragging = false; });
    slider.addEventListener('input', () => rig.setZoomFraction(Number(slider.value) / 1000));
    slider.addEventListener('wheel', (e) => {
      e.preventDefault();
      rig.zoomStep(e.deltaY < 0 ? 1 : -1);
    }, { passive: false });
  }

  updateZoom() {
    const rig = this.app.rig;
    const off = !rig.enabled;
    if (off !== this.zoomOff) {
      this.zoomOff = off;
      for (const id of ['zoom-in', 'zoom-out', 'zoom-slider']) $(id).disabled = off;
    }
    const slider = $('zoom-slider');
    if (!this.zoomDragging && document.activeElement !== slider) {
      const v = Math.round(rig.zoomFraction() * 1000);
      if (Number(slider.value) !== v) slider.value = v;
    }
    const now = performance.now();
    if (now - (this.lastZoomText || 0) > 100) {
      this.lastZoomText = now;
      const focus = this.app.state.focus;
      const flying = this.app.travel.active;
      const alt = flying ? this.app.travel.remainingKm
        : Math.max(0, this.app.camPos.distanceTo(focus.pos) - (focus.deep ? 0 : focus.maxRadius));
      $('zoom-alt').textContent = fmtCompact(alt);
      $('zoom-alt').title = flying ? 'Distance left to the destination' : focus.deep ? `Distance from the centre of ${focus.name}` : `Height above ${focus.name}`;
      $('zoom-alt-label').textContent = flying || !focus.deep ? 'Alt' : 'Dist';
    }
  }

  setToggle(key, on) {
    this.toggles[key] = on;
    const b = document.querySelector(`.tog[data-toggle="${key}"]`);
    if (b) b.setAttribute('aria-pressed', String(on));
    if (key === 'cockpit') $('cockpit').classList.toggle('off', !on);
    if (key === 'deepsky' || key === 'constellations') {
      // constellation figures and star names belong to the star field, so they rest while it is hidden
      const sky = this.toggles.deepsky;
      this.app.sky.setVisible(sky);
      this.app.sky.setConstellations(sky && this.toggles.constellations);
      for (const k of ['constellations', 'starnames']) {
        const t = document.querySelector(`.tog[data-toggle="${k}"]`);
        if (!t) continue;
        t.classList.toggle('resting', !sky);
        if (sky) t.removeAttribute('title'); else t.title = 'Turn on Deep sky to see these';
      }
    }
    const count = Object.entries(this.toggles).filter(([k, v]) => v && document.querySelector(`.tog[data-toggle="${k}"]`)).length;
    $('view-count').textContent = count;
    if (key === 'orbits') this.app.system.showOrbits = on;
    if (key === 'dso') this.app.deepSky.setEnabled(on);
    if (key === 'clock' || key === 'zoom') {
      document.body.classList.toggle(`no-${key}`, !on);
      this.panelRects = null;
    }
    if (key === 'info' || key === 'console') {
      document.body.classList.toggle(`no-${key}`, !on);
      if (key === 'info' && on) {
        $('info').classList.remove('collapsed');
        $('info-collapse').setAttribute('aria-expanded', 'true');
      }
      this.syncDock();
    }
    if (key === 'curvature') {
      this.app.spacetime.setEnabled(on);
      $('info-gr').hidden = !on || !!this.inspect?.deep;
      this.refreshGR(true);
      if (on && this.curvatureHinted !== true && this.inspect) {
        this.curvatureHinted = true;
        this.toast('The grid sinks where clocks run slower, and starlight bends around each mass. Both are deepened so you can see them; the real numbers are in the panel.', 6500);
      }
    }
  }

  setMenu(open) {
    if ($('toggles').classList.contains('open') === open) return;
    $('toggles').classList.toggle('open', open);
    $('btn-layers').setAttribute('aria-expanded', String(open));
    this.panelRects = null;
  }

  get menuOpen() { return $('toggles').classList.contains('open'); }

  // Clear view: every panel fades out, leaving the show button and a small dock at the bottom.
  setChromeHidden(on) {
    this.uiHidden = on;
    this.setMenu(false);
    this.closePeeks();
    document.body.classList.toggle('ui-hidden', on);
    $('btn-show-ui').hidden = !on;
    this.syncDock();
    const focused = document.activeElement;
    if (on && focused && focused !== document.body) $('btn-show-ui').focus();
    if (!on && focused === $('btn-show-ui')) $('btn-hide-ui').focus();
  }

  // ---------------------------------------------------------------- clear-view dock
  peeking(which) { return document.body.classList.contains(`peek-${which}`); }

  // Show the details or flight panel above the dock. On narrow screens only one fits, so opening one
  // closes the other.
  setPeek(which, on) {
    const body = document.body;
    if (on && window.innerWidth < 720) body.classList.remove(`peek-${which === 'info' ? 'console' : 'info'}`);
    body.classList.toggle(`peek-${which}`, on);
    if (which === 'info' && on) {
      $('info').classList.remove('collapsed');
      $('info-collapse').setAttribute('aria-expanded', 'true');
    }
    this.syncDock();
  }

  // The dock shows in clear view, and whenever the flight console is closed so Engage stays one tap away.
  syncDock() {
    if (!$('dock')) return;
    $('dock').hidden = !(this.uiHidden || !this.toggles.console);
    const shown = (w) => (this.uiHidden ? this.peeking(w) : this.toggles[w]);
    $('dock-info').setAttribute('aria-pressed', String(shown('info')));
    $('dock-console').setAttribute('aria-pressed', String(shown('console')));
    this.panelRects = null;
    this.updateDock(true);
  }

  closePeeks() {
    const had = this.peeking('info') || this.peeking('console');
    if (had) { this.setPeek('info', false); this.setPeek('console', false); }
    return had;
  }

  // Where you're headed and how long it takes, or how the flight is going.
  updateDock(force) {
    if ($('dock').hidden || !this.app.state) return;
    const now = performance.now();
    if (!force && now - this.lastDock < 200) return;
    this.lastDock = now;
    const { state, travel } = this.app;
    const flying = travel.active;
    const target = flying ? travel.target : state.destination;
    const here = !flying && target === state.focus;
    const body = here ? state.focus : target;
    this.dockBody = body;
    $('dock-name').textContent = body.name;
    $('dock-dot').style.setProperty('--c', body.data.color);
    let sub;
    if (flying) sub = `${fmtDuration(travel.shipRemaining)} left · ${fmtCompact(travel.remainingKm ?? 0)}`;
    else if (here) sub = 'You are here';
    else sub = `${fmtDuration(this.app.tripDistance(target) / state.speed.kms)} at ${state.speed.short}`;
    $('dock-sub').textContent = sub;
    $('dock-progress').hidden = !flying;
    if (flying) $('dock-bar').style.width = `${(travel.progress * 100).toFixed(1)}%`;
    $('dock-go').hidden = flying || here;
    $('dock-go').title = here ? 'Engage' : `Engage: fly to ${target.name}`;
    $('dock-abort').hidden = !flying;
    const label = flying ? 'Flight status' : 'Flight controls';
    $('dock-console').title = label;
    $('dock-console').setAttribute('aria-label', label);
  }

  showHelp(on) { $('help').hidden = !on; if (on) $('help-close').focus(); }

  toast(html, ms = 4200) {
    const t = $('toast');
    t.innerHTML = html;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  setLoader(frac, text) {
    if (!$('loader-fill')) return;
    $('loader-fill').style.width = `${Math.round(frac * 100)}%`;
    if (text) $('loader-text').textContent = text;
  }
  hideLoader() { $('loader').classList.add('done'); setTimeout(() => $('loader').remove(), 1200); }

  // ---------------------------------------------------------------- info panel
  showInfo(body, role) {
    this.inspect = body;
    this.inspectRole = role;
    const d = body.data;
    $('info-role').textContent = role;
    $('info-name').textContent = d.name;
    $('info-sub').textContent = d.subtitle || '';
    $('info-swatch').style.setProperty('--sw', d.color);
    const facts = $('info-facts');
    facts.replaceChildren();
    for (const [k, v] of d.facts || []) { facts.append(el('dt', null, k), el('dd', null, v)); }
    $('info-blurb').textContent = d.blurb || '';

    const feats = [...(d.features || []), ...(d.ringFeatures || []).map((f) => ({ ...f, ring: true }))];
    const fw = $('info-features');
    fw.replaceChildren();
    $('info-features-wrap').hidden = feats.length === 0;
    $('info-features-title').textContent = body.deep ? 'Highlights · tap to look' : 'Surface features · tap to look';
    $('info-gr').hidden = !this.toggles.curvature || !!body.deep;
    for (const f of feats) {
      const c = el('button', 'chip feature', f.name);
      c.type = 'button';
      c.addEventListener('click', () => this.app.lookAtFeature(body, f));
      fw.append(c);
    }
    const moons = body.children.slice().sort((a, b) => b.radius - a.radius);
    const mw = $('info-moons');
    mw.replaceChildren();
    $('info-moons-wrap').hidden = moons.length === 0;
    $('info-moons-title').textContent = `Moons shown · ${moons.length}`;
    for (const m of moons) {
      const c = el('button', 'chip');
      c.type = 'button';
      const dot = el('span', 'dot'); dot.style.setProperty('--c', m.data.color);
      c.append(dot, document.createTextNode(m.name));
      c.addEventListener('click', () => this.app.setDestination(m.id));
      mw.append(c);
    }
    const isDest = this.app.state.destination === body;
    const isHere = this.app.state.focus === body;
    $('info-go').hidden = isDest || isHere;
    $('info-go').textContent = `Set ${d.name} as destination`;
    this.buildFeatureLabels();
    this.refreshLive(true);
  }

  refreshLive(force) {
    const b = this.inspect;
    if (!b) return;
    const now = performance.now();
    if (!force && now - this.lastLive < 250) return;
    this.lastLive = now;
    const live = $('info-live');
    const rows = [];
    if (b.deep) {
      const fromSun = b.pos.length();
      rows.push([b.screen.inside ? 'From its centre' : 'From your ship', fmtDistance(b.rel.length())]);
      rows.push([b.id === 'milkyway' ? 'Sun to its centre' : 'From the Sun', fmtDistance(fromSun)]);
      rows.push(['Light from it left', `${fmtDuration(fromSun / 299792.458)} ago`]);
    } else {
      const fromShip = Math.max(0, b.rel.length() - b.radius);
      rows.push(['From your ship', fmtDistance(fromShip)]);
      if (b.kind !== 'star') {
        const fromSun = b.pos.length();
        rows.push(['From the Sun', `${fmtDistance(fromSun)} · ${fmtAU(fromSun)}`]);
        rows.push(['Sunlight travel time', fmtLightTime(fromSun)]);
      } else {
        rows.push(['Light to Earth', fmtLightTime(this.app.system.byId.earth.pos.length())]);
      }
      if (b.parent && b.kind === 'moon') rows.push([`From ${b.parent.name}`, fmtDistance(b.pos.distanceTo(b.parent.pos))]);
      if (b.kind !== 'star') {
        const vis = this.app.system.sunVisibility(b.pos);
        const by = this.app.system.eclipser;
        if (vis < 0.98 && by) rows.push(['Sunlight', vis < 0.03 ? `Eclipsed by ${by.name}` : `${Math.round(vis * 100)}%, partly behind ${by.name}`]);
      }
    }
    if (live.childElementCount !== rows.length * 2) {
      live.replaceChildren();
      for (const [k] of rows) live.append(el('dt', null, k), el('dd'));
    }
    rows.forEach(([k, v], i) => {
      live.children[i * 2].textContent = k;
      live.children[i * 2 + 1].textContent = v;
    });
    this.refreshGR(force);
  }

  // Real general-relativity numbers for the inspected body, and how the drawing is scaled.
  refreshGR(force) {
    if (!this.toggles.curvature || !this.inspect || this.inspect.deep) return;
    const st = this.app.spacetime;
    const b = this.inspect;
    if (force || this.grBody !== b) {
      this.grBody = b;
      const g = st.describe(b);
      const rows = [
        ['Schwarzschild radius', fmtLength(g.rs)],
        ['Surface clocks lose', `${fmtTiny(g.clock * 31557600)} a year`],
        ['Light bent at the edge', fmtArc(g.bend)],
        ['Escape speed', fmtSpeed(g.escape)],
      ];
      const dl = $('info-gr-rows');
      dl.replaceChildren();
      for (const [k, v] of rows) dl.append(el('dt', null, k), el('dd', null, v));
      $('info-gr-rows').title = `If ${b.name} were squeezed inside its Schwarzschild radius it would be a black hole. Clocks on the surface run slow by ${fmtSci(g.clock)} (${fmtTiny(g.clock)} every second) from ${b.name}'s own gravity, against a clock far away.`;
    }
    const s = st.status();
    const note = $('info-gr-note');
    if (!s) { note.textContent = ''; return; }
    const f = ['sun', 'moon'].includes(s.frame.id) ? `the ${s.frame.name}` : s.frame.name;
    note.textContent = `The grid runs parallel to the ecliptic just beneath ${f}, with each world's well drawn below it. It falls freely with ${f}, so other worlds add only their tides. Every ${fmtDistance(s.kmPerNs)} of depth means clocks lose 1 ns more per second. Starlight bending is exaggerated ${s.lensFactor < 1e12 ? fmtFactor(s.lensFactor) : `×${fmtSci(s.lensFactor)}`}.`;
  }

  // ---------------------------------------------------------------- trip estimate
  refreshTrip(force) {
    if (force) this.updateDock(true);
    const now = performance.now();
    if (!force && now - this.lastTrip < 500) return;
    this.lastTrip = now;
    const { destination, speed, mode, focus } = this.app.state;
    const trip = $('trip');
    const engage = $('engage');
    if (destination === focus && !this.app.travel.active) {
      trip.innerHTML = `You are at <b>${destination.name}</b>. Pick another destination, then press Engage.`;
      engage.disabled = true;
      this.fillCompare(0);
      return;
    }
    engage.disabled = this.app.travel.active;
    const dist = this.app.tripDistance(destination);
    const t = dist / speed.kms;
    let extra = '';
    if (mode.warp === 0) extra = ' <span class="extra">Cinematic mode squeezes the trip into a few seconds; the ship clock shows the real time.</span>';
    else {
      const wall = t / mode.warp;
      extra = mode.warp === 1
        ? ' Flying in real time, you will wait exactly that long.'
        : ` With the ×${mode.warp.toLocaleString('en-US')} time-lapse, you will wait <span class="num">${fmtDuration(wall)}</span>.`;
    }
    trip.innerHTML = `<b>${destination.name}</b> is <span class="num">${fmtDistance(dist)}</span> away. At ${speed.short}: <span class="num">${fmtDuration(t)}</span>.${extra}`;
    this.fillCompare(dist);
  }

  fillCompare(dist) {
    const table = $('compare-table');
    if (!table.rows.length) {
      for (const s of SPEEDS) {
        const tr = table.insertRow();
        tr.dataset.id = s.id;
        tr.insertCell().textContent = s.label;
        tr.insertCell();
        tr.addEventListener('click', () => {
          this.app.state.speed = s;
          $('speed').value = s.id;
          this.refreshTrip(true);
        });
      }
    }
    for (const tr of table.rows) {
      const s = SPEEDS.find((x) => x.id === tr.dataset.id);
      tr.cells[1].textContent = dist > 0 ? fmtDuration(dist / s.kms) : '—';
      tr.classList.toggle('sel', s === this.app.state.speed);
    }
  }

  // ---------------------------------------------------------------- flight HUD
  showFlight(on, target) {
    $('flight').hidden = !on;
    document.body.classList.toggle('flying', on);
    if (on && this.uiHidden && window.innerWidth < 720) this.setPeek('info', false);
    if (target) $('flight-target').textContent = target.name;
    for (const id of ['dest', 'speed', 'mode']) $(id).disabled = on;
  }

  updateFlight(tr) {
    $('flight-bar').style.width = `${(tr.progress * 100).toFixed(2)}%`;
    const now = performance.now();
    if (now - this.lastText < 90) return;
    this.lastText = now;
    $('flight-elapsed').textContent = fmtDuration(tr.shipElapsed);
    $('flight-remaining').textContent = fmtDuration(tr.shipRemaining);
    $('flight-dist').textContent = fmtDistance(tr.remainingKm);
    $('flight-dist-short').textContent = fmtCompact(tr.remainingKm);
    const vel = fmtSpeed(tr.speed);
    $('flight-vel').textContent = vel;
    $('flight-vel-short').textContent = vel.includes('·') ? vel.split('·')[1].trim() : vel; // "1.00 c" beats "299,792 km/s"
    $('flight-compress').textContent = tr.warp === 0
      ? `time-lapse ${fmtFactor(Math.max(1, tr.realDuration / tr.animDuration))}`
      : tr.warp === 1 ? 'real time' : `time-lapse ×${tr.warp.toLocaleString('en-US')}`;
  }

  // Shown in the browser's own time zone and locale; the tooltip gives the UTC equivalent.
  updateClock(ms) {
    const sec = Math.floor(ms / 1000);
    if (sec === this.lastClockSec) return;
    this.lastClockSec = sec;
    const d = new Date(ms);
    if (isNaN(d)) return;
    this.clockFmt ||= {
      date: new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }),
      time: new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' }),
    };
    const parts = this.clockFmt.time.formatToParts(d);
    const zone = parts.find((p) => p.type === 'timeZoneName')?.value || '';
    const time = parts.filter((p) => p.type !== 'timeZoneName').map((p) => p.value).join('').trim();
    $('clock-date').textContent = this.clockFmt.date.format(d);
    $('clock-time').textContent = time;
    $('clock-zone').textContent = zone;
    $('clock').title = `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 19)} UTC`;
  }

  // ---------------------------------------------------------------- labels
  ensureBodyLabels(bodies) {
    const layer = $('labels');
    for (const b of bodies) {
      const e = el('div', `lbl ${b.kind === 'dwarf' ? 'planet' : b.kind}`, b.name);
      e.addEventListener('click', (ev) => { ev.stopPropagation(); this.app.setDestination(b.id); });
      e.addEventListener('dblclick', (ev) => { ev.stopPropagation(); this.app.setDestination(b.id); this.app.engage(); });
      e.style.display = 'none';
      layer.append(e);
      this.labelEls.set(b, { e, w: 0, shown: false });
    }
    const sl = $('sky-labels');
    for (const c of this.app.sky.constellationAnchors) {
      const e = el('div', 'lbl const', c.name); e.style.display = 'none'; sl.append(e);
      this.skyEls.const.push({ e, dir: c.dir });
    }
    for (const s of this.app.sky.namedStars) {
      const e = el('div', 'lbl sname', s.name); e.style.display = 'none'; sl.append(e);
      this.skyEls.names.push({ e, dir: s.dir });
    }
  }

  ensureDeepLabels(objects) {
    const layer = $('labels');
    for (const o of objects) {
      const e = el('div', `lbl dso ${o.kind}`, o.name);
      e.style.setProperty('--c', o.data.color);
      e.addEventListener('click', (ev) => { ev.stopPropagation(); this.app.setDestination(o.id); });
      e.addEventListener('dblclick', (ev) => { ev.stopPropagation(); this.app.setDestination(o.id); this.app.engage(); });
      e.style.display = 'none';
      layer.append(e);
      this.deepEls.push({ o, e, w: 0, shown: false });
    }
    // the Sun, seen as a star from deep space
    const e = el('div', 'lbl star sunfar', 'Sun');
    e.addEventListener('click', (ev) => { ev.stopPropagation(); this.app.setDestination('sun'); });
    e.addEventListener('dblclick', (ev) => { ev.stopPropagation(); this.app.setDestination('sun'); this.app.engage(); });
    e.style.display = 'none';
    layer.append(e);
    this.sunFar = { e, shown: false };
  }

  // Labels of galaxies, nebulae and clusters, fitted into the space the planet labels left.
  updateDeepLabels(viewport, placed) {
    const app = this.app;
    const { focus, destination } = app.state;
    const target = app.travel.active ? app.travel.target : destination;
    const hits = (r) => placed.some((p) => r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1]);
    const discs = app.solarVisible ? app.system.bodies.filter((b) => b.screen.onScreen && b.screen.r > 3) : [];
    const items = [];
    for (const rec of this.deepEls) {
      const { o } = rec;
      const sc = o.screen;
      const key = o === target || o === focus;
      let show = this.toggles.labels && (this.toggles.dso || key) && o.group.visible && sc.onScreen && !sc.inside;
      if (show && sc.r > Math.min(viewport.x, viewport.y) * 0.22) show = false;
      if (show && discs.some((b) => Math.hypot(sc.x - b.screen.x, sc.y - b.screen.y) < b.screen.r * (b.kind === 'star' ? 2 : 1.05))) show = false;
      if (show) items.push({ rec, pri: o === target ? 0 : o === focus ? 1 : 2 - Math.min(1, sc.r / 400) });
      else if (rec.shown) { rec.e.style.display = 'none'; rec.shown = false; }
    }
    items.sort((a, b) => a.pri - b.pri);
    for (const { rec, pri } of items) {
      const sc = rec.o.screen;
      if (!rec.shown) { rec.e.style.display = ''; rec.shown = true; }
      if (!rec.w) rec.w = rec.e.offsetWidth || rec.o.name.length * 7 + 24;
      const x = sc.x + Math.max(sc.r * 0.7, 4) + 2;
      let y = sc.y - 9, rect = null;
      for (const dy of [0, 16, -16]) {
        const r = [x, y + dy, x + rec.w, y + dy + 17];
        if (!hits(r)) { rect = r; y += dy; break; }
      }
      if (!rect) {
        if (pri > 0) { rec.e.style.display = 'none'; rec.shown = false; continue; }
        rect = [x, y, x + rec.w, y + 17];
      }
      placed.push(rect);
      rec.e.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      rec.e.classList.toggle('dest', rec.o === target && rec.o !== focus);
    }
    // the Sun as a star, once the planets are out of sight
    const ss = app.deepSky.sunScreen;
    const sf = this.sunFar;
    // (the Milky Way labels the Sun among its own highlights)
    const showSun = this.toggles.labels && !app.solarVisible && ss.onScreen && !(focus.data.features || []).some((f) => f.sun);
    if (showSun) {
      if (!sf.shown) { sf.e.style.display = ''; sf.shown = true; }
      sf.e.style.transform = `translate3d(${(ss.x + 6).toFixed(1)}px, ${(ss.y - 9).toFixed(1)}px, 0)`;
      sf.e.classList.toggle('dest', target === app.system.byId.sun);
    } else if (sf.shown) { sf.e.style.display = 'none'; sf.shown = false; }
  }

  buildFeatureLabels() {
    for (const f of this.featureEls) f.e.remove();
    this.featureEls = [];
    const b = this.app.state.focus;
    if (!b) return;
    const layer = $('labels');
    for (const f of b.data.features || []) {
      const e = el('div', 'lbl feature', f.name); e.style.display = 'none'; layer.append(e);
      this.featureEls.push({ e, f, ring: false });
    }
    for (const f of b.data.ringFeatures || []) {
      const e = el('div', 'lbl feature', f.name); e.style.display = 'none'; layer.append(e);
      this.featureEls.push({ e, f, ring: true });
    }
    if (b.deep) for (const item of this.featureEls) item.deep = true;
  }

  updateLabels(viewport) {
    const app = this.app;
    const { focus, destination } = app.state;
    const system = app.systemBody();
    const on = this.toggles.labels;
    // labels steer around the HUD panels instead of sliding underneath them
    const now = performance.now();
    if (!this.panelRects || now - this.panelRectsAt > 300) {
      this.panelRectsAt = now;
      const panels = this.uiHidden ? ['#btn-show-ui', '#dock', '#info', '#console', '#flight']
        : ['#zoom', '#info', '#console', '.clock', '.brand', '.toggles', '#tog-group', '#flight', '#dock'];
      this.panelRects = panels
        .map((sel) => document.querySelector(sel))
        .filter((n) => n && !n.hidden && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden')
        .map((n) => { const r = n.getBoundingClientRect(); return [r.left - 4, r.top - 4, r.right + 4, r.bottom + 4]; });
    }
    const placed = [...this.panelRects];
    const items = [];
    const occluders = [focus, system, destination, ...(system ? system.children : [])]
      .filter((o, i, arr) => o && arr.indexOf(o) === i && o.screen.r > 6);
    for (const [b, rec] of this.labelEls) {
      const sc = b.screen;
      let show = on && sc.onScreen && app.solarVisible;
      let pri = b === destination ? 0 : b === focus ? 1 : b.kind === 'star' ? 2 : b.kind === 'planet' ? 3 : b.kind === 'dwarf' ? 4 : 5;
      if (show && b.kind === 'moon') {
        const par = b.parent.screen;
        const sep = Math.hypot(sc.x - par.x, sc.y - par.y);
        const near = system === b.parent || focus === b || destination === b;
        const minor = b.radius < 150 && b !== destination && b !== focus;
        show = near && sep > par.r + 8 && (!minor || sep > par.r * 2.8 + 40 || sc.r > 3);
        if (b === destination || b === focus) show = sep > par.r * 0.6;
        pri += 1 / (b.radius + 1);
      }
      if (show) {
        // hide labels of bodies that sit behind a nearer, larger disc
        for (const o of occluders) {
          if (o === b || o.screen.behind || o.screen.dist > sc.dist) continue;
          if (Math.hypot(sc.x - o.screen.x, sc.y - o.screen.y) < o.screen.r) { show = false; break; }
        }
      }
      if (show && sc.r > Math.min(viewport.y, viewport.x) * 0.22) show = false; // fills the view already
      if (show) items.push({ b, rec, pri });
      else if (rec.shown) { rec.e.style.display = 'none'; rec.shown = false; }
    }
    items.sort((a, b) => a.pri - b.pri);
    for (const it of items) {
      const { b, rec } = it;
      const sc = b.screen;
      if (!rec.shown) { rec.e.style.display = ''; rec.shown = true; }
      if (!rec.w) rec.w = rec.e.offsetWidth || b.name.length * 8 + 30;
      const x = sc.x + Math.max(sc.r, 3) + 2;
      const hits = (r) => placed.some((p) => r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1]);
      let y = sc.y - 9, rect = null;
      for (const dy of [0, 16, -16, 32]) {
        const r = [x, y + dy, x + rec.w, y + dy + 17];
        if (!hits(r)) { rect = r; y += dy; break; }
      }
      if (!rect) {
        if (it.pri > 1) { rec.e.style.display = 'none'; rec.shown = false; continue; }
        rect = [x, y, x + rec.w, y + 17];
      }
      placed.push(rect);
      rec.e.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      rec.e.classList.toggle('dest', b === destination && b !== focus);
    }
    this.updateDeepLabels(viewport, placed);
    this.updateFeatureLabels(viewport);
    this.updateSkyLabels(viewport);
  }

  updateFeatureLabels(viewport) {
    const app = this.app;
    const b = app.state.focus;
    const show = this.toggles.labels && b && (b.screen.r > 150 || b.screen.inside) && !app.travel.active;
    const camPos = app.camPos;
    const p = new THREE.Vector3(), n = new THREE.Vector3(), v = new THREE.Vector3();
    for (const item of this.featureEls) {
      let vis = false;
      if (show) {
        if (item.deep) {
          if (item.f.p) { app.deepSky.worldOf(b, item.f.p, p); vis = true; }
        } else if (item.ring) {
          // place ring labels along the side of the ring facing the camera
          const pole = n.set(0, 1, 0).applyQuaternion(b.quat);
          const toCam = v.copy(camPos).sub(b.pos);
          toCam.addScaledVector(pole, -toCam.dot(pole)).normalize();
          const side = new THREE.Vector3().crossVectors(pole, toCam);
          const dir = toCam.multiplyScalar(Math.cos(0.5)).addScaledVector(side, Math.sin(0.5));
          p.copy(b.pos).addScaledVector(dir, item.f.r);
          vis = true;
        } else {
          app.system.surfacePoint(b, item.f.lat, item.f.lon, p);
          n.copy(p).sub(b.pos).normalize();
          v.copy(camPos).sub(p).normalize();
          vis = n.dot(v) > 0.12;
        }
      }
      if (vis) {
        const s = app.projectWorld(p, viewport);
        if (s) {
          item.e.style.display = '';
          item.e.style.transform = `translate3d(${(s.x - 5).toFixed(1)}px, ${(s.y - 9).toFixed(1)}px, 0)`;
          continue;
        }
      }
      item.e.style.display = 'none';
    }
  }

  updateSkyLabels(viewport) {
    const sky = this.app.sky;
    const v = new THREE.Vector3();
    const solar = this.app.solarVisible;
    const discs = solar ? this.app.system.bodies.filter((b) => b.screen.onScreen && b.screen.r > 3) : [];
    const glare = this.app.system.byId.sun.screen;
    const blocked = (s) => discs.some((b) => Math.hypot(s.x - b.screen.x, s.y - b.screen.y) < b.screen.r * (b.kind === 'star' ? 2.2 : 1.05))
      || (solar && glare.onScreen && Math.hypot(s.x - glare.x, s.y - glare.y) < 70);
    const near = sky.starFade > 0.5; // star names and figures only mean something near home
    const place = (list, on, dx, dy) => {
      for (const it of list) {
        const s = on ? sky.project(it.dir, viewport, v) : null;
        if (s && s.x > -100 && s.x < viewport.x + 100 && s.y > -20 && s.y < viewport.y + 20 && !blocked(s)) {
          it.e.style.display = '';
          it.e.style.transform = `translate3d(${(s.x + dx).toFixed(1)}px, ${(s.y + dy).toFixed(1)}px, 0)`;
        } else it.e.style.display = 'none';
      }
    };
    place(this.skyEls.const, near && this.toggles.deepsky && this.toggles.constellations, -30, -6);
    place(this.skyEls.names, near && this.toggles.deepsky && this.toggles.starnames, 7, -5);
  }
}

