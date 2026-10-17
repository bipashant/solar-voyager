// Floating bar shown when you arrive from the Eclipses & alignments page: the event, its moment, and its
// points of view as tabs (with previous / next), so you can hop between them without going back.
import { EVENTS, KINDS, povLink } from './events-data.js';
import { haptic } from './platform.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class EventBar {
  constructor(app) {
    this.app = app;
    this.el = $('event-bar');
    this.event = null;
    this.v = 0;
    $('evb-close').addEventListener('click', () => this.hide());
    $('evb-prev').addEventListener('click', () => this.go(this.v - 1));
    $('evb-next').addEventListener('click', () => this.go(this.v + 1));
    $('evb-povs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (b) this.go(Number(b.dataset.v));
    });
    window.addEventListener('keydown', (e) => {
      if (!this.event || e.target.closest?.('input, select, textarea')) return;
      if (e.key === '[') this.go(this.v - 1);
      if (e.key === ']') this.go(this.v + 1);
    });
  }

  show(id, v = 0) {
    const ev = EVENTS.find((e) => e.id === id);
    if (!ev) { this.hide(); return; }
    this.event = ev;
    this.v = Math.max(0, Math.min(ev.povs.length - 1, v));
    const k = KINDS[ev.kind];
    this.el.style.setProperty('--c', k.color);
    $('evb-kind').textContent = k.label;
    $('evb-title').textContent = ev.title;
    const t = new Date(ev.time);
    $('evb-time').textContent = t.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    $('evb-povs').innerHTML = ev.povs.map((p, i) => `<button type="button" role="tab" data-v="${i}" title="${esc(p.note)}">${esc(p.label)}</button>`).join('');
    this.el.hidden = false;
    document.body.classList.add('event-open');
    this.sync();
  }

  sync() {
    for (const b of $('evb-povs').children) b.setAttribute('aria-selected', String(Number(b.dataset.v) === this.v));
    $('evb-povs').children[this.v]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    $('evb-prev').disabled = this.v === 0;
    $('evb-next').disabled = this.v === this.event.povs.length - 1;
    $('evb-note').textContent = this.event.povs[this.v].note;
    this.app.viewLink.event = { id: this.event.id, v: this.v };
  }

  go(v) {
    if (!this.event || v < 0 || v >= this.event.povs.length || this.app.travel.active) return;
    haptic('tap');
    this.v = v;
    const link = povLink(this.event.povs[v].p, '', this.event.id, v);
    this.app.viewLink.apply(this.app.viewLink.parse(link));
    this.sync();
  }

  hide() {
    this.event = null;
    this.el.hidden = true;
    document.body.classList.remove('event-open');
    this.app.viewLink.event = null;
  }
}
