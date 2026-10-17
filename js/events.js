// Events page: lists EVENTS (js/events-data.js) with local and UTC times, and links each point of view
// into the main app at that exact moment.
import { EVENTS, KINDS, povLink } from './events-data.js';

const list = document.getElementById('ev-list');
const filters = document.getElementById('ev-filters');
const now = Date.now();
const DAY = 86400000;
const ARROW = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11M11 5l5 5-5 5"/></svg>';
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function when(ms) {
  const d = (ms - now) / DAY;
  const a = Math.abs(d);
  const t = a < 1.5 ? (d > 0 ? 'tomorrow' : 'yesterday') : a < 60 ? `${Math.round(a)} days` : a < 730 ? `${Math.round(a / 30.4)} months` : `${Math.round(a / 365.25)} years`;
  return a < 1.5 ? t : d > 0 ? `in ${t}` : `${t} ago`;
}

const ms = (e) => Date.parse(e.time);
const nextId = EVENTS.filter((e) => ms(e) > now).sort((a, b) => ms(a) - ms(b))[0]?.id;
const local = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
const utc = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
const parts = (t) => {
  const d = new Date(t);
  return { d: d.getDate(), m: d.toLocaleDateString(undefined, { month: 'short' }), y: d.getFullYear() };
};

function render(kind) {
  const items = EVENTS.filter((e) => !kind || e.kind === kind);
  list.innerHTML = items.map((e) => {
    const k = KINDS[e.kind], t = ms(e), p = parts(t), future = t > now;
    return `<li class="ev-card${e.id === nextId ? ' next' : ''}" style="--c:${k.color}">
      <div class="ev-date" aria-hidden="true"><span class="d">${p.d}</span><span class="m">${p.m}</span><span class="y">${p.y}</span></div>
      <div class="ev-body">
        <div class="ev-meta"><span class="ev-kind">${k.label}</span><span class="ev-when${future && t - now < 400 * DAY ? ' soon' : ''}">${e.id === nextId ? 'Next up · ' : ''}${when(t)}</span></div>
        <h2>${esc(e.title)}</h2>
        <div class="ev-time">${local.format(new Date(t))} <span>· ${utc.format(new Date(t))} UTC</span></div>
        <p class="ev-blurb">${esc(e.blurb)}</p>
        <p class="ev-where"><span>Where</span> ${esc(e.where)}</p>
        <div class="ev-povs">${e.povs.map((v, i) => `<a class="ev-pov" href="${povLink(v.p, 'index.html', e.id, i)}"><b>${esc(v.label)} ${ARROW}</b><small>${esc(v.note)}</small></a>`).join('')}</div>
      </div>
    </li>`;
  }).join('');
}

const tabs = [['', 'All'], ...Object.entries(KINDS).map(([k, v]) => [k, `${v.label}s`])];
filters.innerHTML = tabs.map(([k, label]) => `<button type="button" data-k="${k}" aria-pressed="${k === ''}" style="--c:${KINDS[k]?.color || '#8e9cb2'}">${k ? '<i></i>' : ''}${label}</button>`).join('');
filters.addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  for (const x of filters.children) x.setAttribute('aria-pressed', String(x === b));
  render(b.dataset.k);
});
render('');
