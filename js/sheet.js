// Phones: one bottom sheet holds everything, the way Apple Maps and Google Maps do it.
//
// Collapsed, it shows where you're headed and a Fly button (or the flight in progress). Pulled to half
// height it adds search, every world as a tappable chip, ship speed and flight clock; at full height,
// the details of the selected world, the simulation clock and the poster studio. Drag the handle or
// the header, flick, or tap the header to switch. The existing controls (selects, details, clock) are
// moved into it rather than duplicated, and moved back when the screen gets wide again.
import { fmtDuration, fmtCompact } from './format.js';
import { haptic, embedded } from './platform.js';

const $ = (id) => document.getElementById(id);
const DETENTS = ['peek', 'half', 'full'];
const the = (b) => (['moon', 'sun'].includes(b.id) ? `the ${b.name}` : b.name);

export class Sheet {
  constructor(app) {
    this.app = app;
    this.el = $('sheet');
    this.detent = 'peek';
    this.y = 0; // current translateY in px
    this.mounted = false;
    this.slots = [];
    this.lastHead = 0;
    this.worldKey = '';
    this.bindDrag();
    this.bindContent();
    const mq = matchMedia('(max-width: 720px), (max-height: 500px) and (pointer: coarse)');
    const sync = () => (mq.matches && !embedded ? this.mount() : this.unmount()); // a lesson figure has no sheet
    mq.addEventListener?.('change', sync);
    sync();
    // Re-measure whenever anything that sets the stops changes size: the window, the safe areas iOS reports
    // just after launch, the header once fonts load, or the progress bar appearing during a flight.
    const remeasure = () => { if (this.mounted && !this.dragging) this.snap(this.detent, false); };
    window.addEventListener('resize', remeasure);
    window.visualViewport?.addEventListener('resize', remeasure);
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(remeasure);
      for (const id of ['sheet', 'sheet-head', 'sheet-handle']) ro.observe($(id));
    }
    document.fonts?.ready.then(remeasure);
  }

  // ---------------------------------------------------------------- moving the real controls in and out
  mount() {
    if (this.mounted) return;
    this.mounted = true;
    const move = (node, slot) => {
      if (!node) return;
      const mark = document.createComment(`sheet:${node.id || node.className}`);
      node.parentNode.insertBefore(mark, node);
      this.slots.push([node, mark]);
      $(slot).append(node);
    };
    move($('speed'), 'sheet-speed-slot');
    move($('mode'), 'sheet-mode-slot');
    move($('trip'), 'sheet-trip-slot');
    move(document.querySelector('#info .info-body'), 'sheet-about-slot');
    move($('clock'), 'sheet-time-slot');
    document.body.classList.add('has-sheet');
    this.el.hidden = false;
    this.app.ui?.syncDock();
    this.snap('peek', false);
  }

  unmount() {
    if (!this.mounted) return;
    this.mounted = false;
    for (const [node, mark] of this.slots.reverse()) { mark.parentNode.insertBefore(node, mark); mark.remove(); }
    this.slots = [];
    document.body.classList.remove('has-sheet', 'sheet-full');
    this.el.hidden = true;
    document.documentElement.style.setProperty('--sheet-h', '0px');
  }

  // ---------------------------------------------------------------- detents
  heights() {
    const full = this.el.offsetHeight;
    const peek = $('sheet-handle').offsetHeight + $('sheet-head').offsetHeight + ($('sheet-progress').hidden ? 0 : 4) + this.bottomInset();
    return { peek, half: Math.min(full, Math.max(peek + 160, window.innerHeight * 0.5)), full };
  }

  bottomInset() { return parseFloat(getComputedStyle(this.el).paddingBottom) || 0; }

  snap(detent, animate = true) {
    if (!this.mounted) return;
    const changed = detent !== this.detent;
    this.detent = detent;
    const h = this.heights();
    this.maxY = h.full - h.peek;
    this.el.classList.toggle('animating', animate);
    this.setY(h.full - h[detent]);
    for (const d of DETENTS) this.el.classList.toggle(d, d === detent);
    document.body.classList.toggle('sheet-full', detent === 'full');
    $('sheet-handle').setAttribute('aria-label', detent === 'full' ? 'Collapse' : 'Expand');
    $('sheet-handle').setAttribute('aria-expanded', String(detent !== 'peek'));
    if (detent !== 'full') $('sheet-body').scrollTop = 0;
    if (changed && animate) haptic('step');
  }

  setY(y) {
    this.y = y;
    this.el.style.transform = `translate3d(0, ${y}px, 0)`;
    // collapsed, only the header shows; the rest fades in over the first 70 px of a pull
    const body = $('sheet-body');
    const o = Math.min(1, Math.max(0, ((this.maxY ?? 0) - y) / 70));
    body.style.opacity = o.toFixed(3);
    body.style.visibility = o > 0 ? 'visible' : 'hidden';
  }

  // How much of the screen the sheet covers right now, in CSS px (follows the animation): from the
  // bottom in portrait, from the left in landscape, where the sheet floats beside the view.
  visible() { return this.cover().bottom; }

  cover() {
    if (!this.mounted || this.el.hidden || document.body.classList.contains('ui-hidden')) return { bottom: 0, left: 0 };
    const r = this.el.getBoundingClientRect();
    const up = Math.max(0, window.innerHeight - r.top);
    if (r.width < window.innerWidth * 0.8) return { bottom: 0, left: this.detent === 'peek' ? 0 : r.right * Math.min(1, up / (window.innerHeight * 0.5)) };
    return { bottom: up, left: 0 };
  }

  bindDrag() {
    const sheet = this.el;
    let drag = null;
    const start = (e, fromBody = false) => {
      if (e.button > 0) return;
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: this.y, moved: false, fromBody, samples: [[performance.now(), e.clientY]], target: e.target };
    };
    const move = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dy = e.clientY - drag.y0;
      if (!drag.moved) {
        this.dragging = true;
        const dx = e.clientX - drag.x0;
        if (Math.abs(dy) < 7) { if (Math.abs(dx) > 10) { drag = null; this.dragging = false; } return; } // a sideways swipe scrolls a chip row
        drag.moved = true;
        sheet.classList.remove('animating');
        try { sheet.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
      }
      const h = this.heights();
      const min = 0, max = h.full - h.peek;
      let y = drag.t0 + dy;
      if (y < min) y = min - Math.sqrt(min - y) * 2; // rubber band past the ends
      if (y > max) y = max + Math.sqrt(y - max) * 2;
      this.setY(y);
      drag.samples.push([performance.now(), e.clientY]);
      if (drag.samples.length > 5) drag.samples.shift();
    };
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      this.dragging = false;
      if (!d.moved) {
        if (d.fromBody) return;
        // a tap: the handle cycles, the header opens and closes
        if (d.target.closest('#sheet-handle')) this.snap(this.detent === 'peek' ? 'half' : this.detent === 'half' ? 'full' : 'peek');
        else if (!d.target.closest('button')) this.snap(this.detent === 'peek' ? 'half' : 'peek');
        return;
      }
      const [t1, y1] = d.samples[0], [t2, y2] = d.samples[d.samples.length - 1];
      const v = (y2 - y1) / Math.max(1, t2 - t1); // px per ms, positive = down
      const h = this.heights();
      const projected = this.y + v * 220; // where a flick would carry it
      const best = DETENTS.map((k) => [k, Math.abs(h.full - h[k] - projected)]).sort((a, b) => a[1] - b[1])[0][0];
      this.snap(best);
    };
    for (const id of ['sheet-handle', 'sheet-head']) {
      $(id).addEventListener('pointerdown', (e) => {
        if (e.target.closest('#sheet-fly, #sheet-abort, #sheet-where')) return;
        start(e);
      });
    }
    // Below full height the body doesn't scroll: a vertical drag on it moves the sheet instead.
    $('sheet-body').addEventListener('pointerdown', (e) => {
      if (this.detent === 'full' || e.target.closest('input, select, textarea')) return;
      start(e, true);
    });
    sheet.addEventListener('pointermove', move);
    sheet.addEventListener('pointerup', end);
    sheet.addEventListener('pointercancel', end);
    sheet.addEventListener('transitionend', () => sheet.classList.remove('animating'));

    // At full height the body scrolls; pulling down from the top collapses the sheet again.
    const body = $('sheet-body');
    let pull = null;
    body.addEventListener('touchstart', (e) => {
      pull = this.detent === 'full' && body.scrollTop <= 0 ? { y0: e.touches[0].clientY, t0: this.y, on: false, last: [performance.now(), e.touches[0].clientY] } : null;
    }, { passive: true });
    body.addEventListener('touchmove', (e) => {
      if (!pull) return;
      const dy = e.touches[0].clientY - pull.y0;
      if (!pull.on) {
        if (dy < 8) { if (dy < -4) pull = null; return; }
        pull.on = true;
        sheet.classList.remove('animating');
      }
      e.preventDefault();
      this.setY(pull.t0 + dy);
      pull.v = (e.touches[0].clientY - pull.last[1]) / Math.max(1, performance.now() - pull.last[0]);
      pull.last = [performance.now(), e.touches[0].clientY];
    }, { passive: false });
    body.addEventListener('touchend', () => {
      if (pull?.on) {
        const h = this.heights();
        const y = this.y + (pull.v || 0) * 220;
        this.snap(y > (h.full - h.half) * 0.5 ? (y > h.full - h.half + (h.half - h.peek) * 0.5 ? 'peek' : 'half') : 'full');
      }
      pull = null;
    });
  }

  // ---------------------------------------------------------------- content
  bindContent() {
    const app = this.app;
    $('sheet-fly').addEventListener('click', () => { app.engage(); });
    $('sheet-abort').addEventListener('click', () => app.abort());
    $('sheet-where').addEventListener('click', () => { this.snap('half'); });
    const search = $('sheet-search');
    search.addEventListener('focus', () => this.snap('full'));
    search.addEventListener('input', () => this.renderResults());
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') $('sheet-results').querySelector('button')?.click();
      if (e.key === 'Escape') { search.value = ''; this.renderResults(); search.blur(); }
    });
    $('sheet-search-clear').addEventListener('click', () => { search.value = ''; this.renderResults(); search.focus(); });
    let lastTap = { id: null, t: 0 };
    const pick = (e) => {
      const b = e.target.closest('[data-world]');
      if (!b) return;
      // double-tap a world to fly straight there
      const now = e.timeStamp;
      if (lastTap.id === b.dataset.world && now - lastTap.t < 400) {
        lastTap = { id: null, t: 0 };
        this.snap('peek');
        app.ui.flyTo(b.dataset.world);
        return;
      }
      lastTap = { id: b.dataset.world, t: now };
      haptic('tap');
      app.setDestination(b.dataset.world, { fromSelect: true });
      if (e.currentTarget.id === 'sheet-results') {
        search.value = '';
        this.renderResults();
        search.blur();
        this.snap('peek'); // the header now says where you're going, with Fly
      }
    };
    $('sheet-worlds').addEventListener('click', pick);
    $('sheet-results').addEventListener('click', pick);
  }

  all() {
    const { system, deepSky } = this.app;
    return [...system.bodies, ...(deepSky?.objects || [])];
  }

  // A picture of the world: a render of the real thing for planets and moons (see main.js), painted art in
  // the object's own colour for galaxies, nebulae and clusters.
  art(b, cls = 'sw') {
    const img = this.app.thumbs?.[b.id];
    if (img) return `<span class="${cls} img" style="--img:url('${img}')"></span>`;
    return `<span class="${cls}${b.deep ? ` dso dso-${b.kind}` : ''}" style="--c:${b.data?.color || '#9aa7c7'}"></span>`;
  }

  chip(b) {
    const { state } = this.app;
    const sub = b === state.focus ? '<em>Here</em>' : '';
    return `<button type="button" class="world-chip${b === state.destination && b !== state.focus ? ' sel' : ''}${b === state.focus ? ' here' : ''}" data-world="${b.id}">`
      + `${this.art(b)}<span class="nm">${b.name}</span>${sub}</button>`;
  }

  // Rows of worlds: the planets, the moons of whatever system you're in, and the deep sky.
  renderWorlds() {
    const { system, deepSky, state } = this.app;
    const sys = this.app.systemBody();
    const key = `${sys?.id}|${state.focus.id}|${state.destination.id}|${deepSky?.objects?.length}|${this.app.thumbVersion || 0}`;
    if (key === this.worldKey) return;
    this.worldKey = key;
    const groups = [['Planets', system.bodies.filter((b) => ['star', 'planet', 'dwarf'].includes(b.kind))]];
    if (sys && sys.children.length) groups.push([`Moons of ${sys.name}`, sys.children.slice().sort((a, b) => b.radius - a.radius)]);
    if (deepSky?.objects?.length) groups.push(['Galaxies & nebulae', deepSky.objects]);
    const scrolls = [...$('sheet-worlds').querySelectorAll('.world-row')].map((r) => r.scrollLeft);
    $('sheet-worlds').innerHTML = groups.map(([title, list]) => `<div class="world-group"><div class="eyebrow">${title}</div>`
      + `<div class="world-row">${list.map((b) => this.chip(b)).join('')}</div></div>`).join('');
    $('sheet-worlds').querySelectorAll('.world-row').forEach((r, i) => { r.scrollLeft = scrolls[i] || 0; });
  }

  renderResults() {
    const q = $('sheet-search').value.trim().toLowerCase();
    $('sheet-search-clear').hidden = !q;
    $('sheet-worlds').hidden = !!q;
    const res = $('sheet-results');
    res.hidden = !q;
    if (!q) return;
    const hits = this.all().filter((b) => b.name.toLowerCase().includes(q) || b.parent?.name.toLowerCase().startsWith(q))
      .sort((a, b) => (a.name.toLowerCase().startsWith(q) ? 0 : 1) - (b.name.toLowerCase().startsWith(q) ? 0 : 1))
      .slice(0, 30);
    res.innerHTML = hits.length ? hits.map((b) => {
      const sub = b.data?.subtitle || (b.parent ? `Moon of ${b.parent.name}` : b.kind);
      return `<button type="button" class="result" data-world="${b.id}">${this.art(b)}`
        + `<span class="tx"><b>${b.name}</b><small>${sub}</small></span></button>`;
    }).join('') : `<p class="none">Nothing called “${$('sheet-search').value.trim()}” here yet.</p>`;
  }

  // Header: the flight in progress, where you'd fly to, or where you are.
  update() {
    if (!this.mounted) return;
    const now = performance.now();
    document.documentElement.style.setProperty('--sheet-h', `${Math.round(this.visible())}px`);
    if (now - this.lastHead < 150) return;
    this.lastHead = now;
    const { state, travel } = this.app;
    const flying = travel.active;
    const here = !flying && state.destination === state.focus;
    const b = flying ? travel.target : here ? state.focus : state.destination;
    const sw = $('sheet-swatch');
    const img = this.app.thumbs?.[b.id];
    sw.className = `sheet-swatch${img ? ' img' : b.deep ? ` dso dso-${b.kind}` : ''}`;
    sw.style.setProperty('--c', b.data?.color || '#888');
    if (img) sw.style.setProperty('--img', `url('${img}')`); else sw.style.removeProperty('--img');
    // "You're in Earth" on top; below it where the Fly button leads, or just where you are
    let role, sub;
    const nameEl = $('sheet-name');
    if (flying) {
      role = `En route from ${the(state.focus)}`;
      sub = `${fmtDuration(travel.shipRemaining)} left · ${fmtCompact(travel.remainingKm ?? 0)}`;
      $('sheet-bar').style.width = `${(travel.progress * 100).toFixed(1)}%`;
    } else {
      role = `You’re in ${the(state.focus)}`;
      sub = here ? (b.data?.subtitle || '') : `${fmtDuration(this.app.tripDistance(b) / state.speed.kms)} at ${state.speed.short}`;
    }
    const lead = flying ? 'To ' : here ? '' : 'Fly to ';
    if (nameEl.dataset.k !== `${lead}${b.name}`) {
      nameEl.dataset.k = `${lead}${b.name}`;
      nameEl.replaceChildren();
      if (lead) { const s = document.createElement('span'); s.className = 'lead'; s.textContent = lead; nameEl.append(s); }
      nameEl.append(b.name);
    }
    $('sheet-role').textContent = role;
    $('sheet-sub').textContent = sub;
    const progressWas = $('sheet-progress').hidden;
    $('sheet-progress').hidden = !flying;
    $('sheet-fly').hidden = flying || here;
    $('sheet-fly').setAttribute('aria-label', `Fly to ${the(b)}`);
    $('sheet-abort').hidden = !flying;
    $('sheet-where').hidden = flying || !here;
    if (progressWas !== $('sheet-progress').hidden) this.snap(this.detent, false);
    $('sheet-speed-val').textContent = $('speed').selectedOptions[0]?.textContent || '';
    $('sheet-mode-val').textContent = $('mode').selectedOptions[0]?.textContent || '';
    const inspect = this.app.ui.inspect;
    if (inspect) $('sheet-about-title').textContent = `About ${the(inspect)}`;
    this.renderWorlds();
  }
}

