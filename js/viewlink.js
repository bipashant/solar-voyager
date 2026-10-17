// Shareable views, the way Google Maps does it: the address bar always holds the current view, so copying
// it (or pressing Share) gives a friend exactly what you are looking at.
//
//   #at=saturn&alt=412000&yaw=-31.4&pitch=18.2&time=2025-03-14T21:05Z&rate=pause&to=titan&on=curvature
//
//   at        the world you're orbiting           alt    height above it, km
//   yaw,pitch where you are around it, degrees    look   free-look offset "yaw,pitch", when you've looked away
//   time      simulated date (UTC), when it isn't "now"; rate  clock speed, when it isn't real time
//   to        destination; speed, mode  ship speed and flight clock, when not the defaults
//   on, off   display layers switched away from their defaults
//
// The address is rewritten (history.replaceState, so no back-button spam) a few times a second at most,
// and only when something changed. Panels and sound are personal, so they are left out.
import { SPEEDS, TRAVEL_MODES, TIME_RATES } from './data.js';
import { PUBLIC_URL, shareLink, saveImage, haptic } from './platform.js';

const DEG = 180 / Math.PI;
const PERSONAL = new Set(['info', 'console', 'clock', 'zoom', 'sound']);
const $ = (id) => document.getElementById(id);
const round = (v, d = 1) => Number(v.toFixed(d));
const sig = (v, n = 4) => Number(v.toPrecision(n));
const the = (b) => (['moon', 'sun'].includes(b.id) ? `the ${b.name}` : b.name);

export class ViewLink {
  constructor(app, hooks) {
    this.app = app;
    this.hooks = hooks; // { applyCamera(body, yaw, pitch, alt, look), capture(cb) }
    this.defaults = { ...app.ui.toggles };
    this.last = '';
    this.lastWrite = 0;
    this.applying = false;
    window.addEventListener('hashchange', () => {
      const p = this.parse(location.hash);
      if (p && this.encode() !== location.hash.slice(1)) this.apply(p);
    });
    this.bindUI();
  }

  // ---------------------------------------------------------------- state <-> text
  encode() {
    const { state, rig, ui } = this.app;
    const q = new URLSearchParams();
    q.set('at', state.focus.id);
    q.set('alt', String(sig(Math.exp(rig.tLogAlt))));
    let yaw = (rig.tYaw * DEG) % 360;
    if (yaw > 180) yaw -= 360; else if (yaw < -180) yaw += 360;
    q.set('yaw', String(round(yaw)));
    q.set('pitch', String(round(rig.tPitch * DEG)));
    if (Math.abs(rig.tLookYaw) + Math.abs(rig.tLookPitch) > 0.01) q.set('look', `${round(rig.tLookYaw * DEG)},${round(rig.tLookPitch * DEG)}`);
    const rate = state.timeRate.id;
    if (Math.abs(state.simMs - Date.now()) > 120000 || rate !== 'real') {
      q.set('time', new Date(Math.round(state.simMs / 60000) * 60000).toISOString().replace(':00.000Z', 'Z'));
    }
    if (rate !== 'real') q.set('rate', rate);
    if (state.destination && state.destination !== state.focus) q.set('to', state.destination.id);
    if (state.speed.id !== 'light') q.set('speed', state.speed.id);
    if (state.mode.id !== TRAVEL_MODES[0].id) q.set('mode', state.mode.id);
    const on = [], off = [];
    for (const [k, v] of Object.entries(ui.toggles)) {
      if (PERSONAL.has(k) || v === this.defaults[k]) continue;
      (v ? on : off).push(k);
    }
    if (on.length) q.set('on', on.join(','));
    if (off.length) q.set('off', off.join(','));
    return q.toString().replace(/%2C/g, ',').replace(/%3A/g, ':');
  }

  parse(hash) {
    const h = (hash || '').replace(/^#/, '');
    if (!h.includes('at=')) return null;
    const q = new URLSearchParams(h);
    const num = (k) => (q.has(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : null);
    const look = (q.get('look') || '').split(',').map(Number);
    return {
      at: q.get('at'), alt: num('alt'), yaw: num('yaw'), pitch: num('pitch'),
      look: look.length === 2 && look.every(Number.isFinite) ? look : null,
      time: q.get('time'), rate: q.get('rate'), to: q.get('to'), speed: q.get('speed'), mode: q.get('mode'),
      on: (q.get('on') || '').split(',').filter(Boolean), off: (q.get('off') || '').split(',').filter(Boolean),
    };
  }

  // ---------------------------------------------------------------- applying a shared view
  apply(p) {
    const app = this.app, { state, ui } = app;
    const body = app.lookup(p.at);
    if (!body) return false;
    this.applying = true;
    if (app.travel.active) app.travel.abort();
    // time first: it decides where every world is
    const t = p.time ? Date.parse(p.time.replace(/Z?$/, 'Z')) : NaN;
    state.simMs = Number.isFinite(t) ? t : Date.now();
    const rate = TIME_RATES.find((r) => r.id === p.rate);
    app.setTimeRate(rate ? rate.id : 'real');
    const speed = SPEEDS.find((s) => s.id === p.speed);
    if (speed) state.speed = speed;
    const mode = TRAVEL_MODES.find((m) => m.id === p.mode);
    if (mode) state.mode = mode;
    for (const k of p.on) if (k in ui.toggles && !PERSONAL.has(k)) ui.setToggle(k, true);
    for (const k of p.off) if (k in ui.toggles && !PERSONAL.has(k)) ui.setToggle(k, false);
    this.hooks.applyCamera(body, p);
    const to = p.to && app.lookup(p.to);
    state.destination = to || body;
    ui.syncSelects();
    ui.showInfo(body, 'Current location');
    ui.buildFeatureLabels();
    ui.refreshTrip(true);
    this.applying = false;
    this.last = this.encode();
    return true;
  }

  // Called every frame: keep the address bar in step with the view (at most ~3 times a second).
  tick(now) {
    if (this.applying || this.app.travel.active || now - this.lastWrite < 350) return;
    if (location.hash === '#poster') return; // the poster studio owns the hash while it's open
    this.lastWrite = now;
    const s = this.encode();
    if (s === this.last) return;
    this.last = s;
    try { history.replaceState(null, '', `#${s}`); } catch { /* sandboxed */ }
  }

  url() { return `${PUBLIC_URL()}#${this.encode()}`; }

  // ---------------------------------------------------------------- share menu
  bindUI() {
    const btn = $('btn-share'), menu = $('share-menu');
    const open = (on) => {
      menu.hidden = !on;
      btn.setAttribute('aria-expanded', String(on));
      if (on) this.app.ui.setMenu(false);
    };
    btn.addEventListener('click', (e) => { e.stopPropagation(); haptic('tap'); open(menu.hidden); });
    document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target) && e.target !== btn && !btn.contains(e.target)) open(false); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) open(false); });
    $('share-link').addEventListener('click', async () => { open(false); await this.shareView(); });
    $('share-copy').addEventListener('click', async () => { open(false); await this.copyView(); });
    $('share-image').addEventListener('click', () => { open(false); this.saveView(); });
  }

  title() { return `${the(this.app.state.focus)[0].toUpperCase()}${the(this.app.state.focus).slice(1)} · Solar Voyager`; }

  async shareView() {
    const how = await shareLink(this.url(), this.title());
    if (how === 'copied') this.app.ui.toast('Link copied. Paste it anywhere to share this exact view.', 3200);
    if (how !== 'cancelled') haptic('saved');
  }

  async copyView() {
    const how = await shareLink(this.url(), this.title(), { copyOnly: true });
    this.app.ui.toast(how === 'copied' ? 'Link copied. Paste it anywhere to share this exact view.' : 'Couldn’t copy the link on this device.', 3200);
    if (how === 'copied') haptic('saved');
  }

  // The view as a picture: the 3D scene as rendered, with a small caption in the corner.
  saveView() {
    const app = this.app, focus = app.state.focus;
    this.hooks.capture(async (src) => {
      if (!src) { app.ui.toast('Couldn’t capture the view on this device.', 3000); return; }
      const c = document.createElement('canvas');
      c.width = src.width; c.height = src.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(src, 0, 0);
      const u = c.width / 100;
      const date = new Date(app.state.simMs).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
      ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = u * 0.6;
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = 'rgba(255,181,71,0.95)';
      ctx.font = `600 ${Math.max(11, u * 1.6)}px "Chakra Petch", system-ui, sans-serif`;
      const pad = Math.max(14, u * 2.4);
      ctx.fillText('SOLAR VOYAGER', pad, c.height - pad - Math.max(13, u * 1.9));
      ctx.fillStyle = 'rgba(232,238,247,0.92)';
      ctx.font = `500 ${Math.max(12, u * 1.7)}px "Barlow", system-ui, sans-serif`;
      ctx.fillText(`${focus.name} · ${date}`, pad, c.height - pad);
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      if (!blob) { app.ui.toast('Couldn’t save the image on this device.', 3000); return; }
      const slug = focus.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const how = await saveImage(blob, `solar-voyager-${slug}-${new Date(app.state.simMs).toISOString().slice(0, 10)}.png`, this.title());
      if (how === 'downloaded') app.ui.toast(`Saved a picture of ${the(focus)}.`, 2600);
      if (how !== 'cancelled') haptic('saved');
    });
  }
}
