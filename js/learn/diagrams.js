// Interactive diagrams for the lessons: the ideas a true-scale 3D view can't show at a glance (the Moon's
// phases from above, Earth's tilt around a year, sunlight spreading out, shadow cones, a year of eclipses).
// Each is a function that fills an element: <div data-diagram="phaseDial"></div>. Not to scale unless noted.

const NS = 'http://www.w3.org/2000/svg';
const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>';
const PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 5.5h3v13h-3zM13.5 5.5h3v13h-3z"/></svg>';

function el(tag, attrs = {}, parent = null, text) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  parent?.append(e);
  return e;
}

function card(root, title, hint, w, h) {
  root.classList.add('dg');
  root.innerHTML = `<div class="dg-head"><b>${title}</b><span>${hint}</span></div>`;
  if (!w) return null;
  const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, class: 'dg-art', role: 'img', 'aria-label': title }, root);
  return svg;
}

function slider(root, { label, min, max, step = 1, value, format = (v) => v }) {
  const row = document.createElement('div');
  row.className = 'dg-row';
  row.innerHTML = `<label><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${value}"><output></output></label>`;
  root.append(row);
  const input = row.querySelector('input'), out = row.querySelector('output');
  const s = { row, input, get value() { return Number(input.value); }, set(v) { input.value = v; out.textContent = format(Number(input.value)); } };
  out.textContent = format(value);
  input.addEventListener('input', () => { out.textContent = format(Number(input.value)); });
  return s;
}

// A play button that calls step(dt) every frame while on. Stops when the diagram scrolls away.
function player(row, step) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'sp-btn';
  b.innerHTML = PLAY;
  b.setAttribute('aria-label', 'Play');
  row.prepend(b);
  let on = false, raf = 0, last = 0;
  const loop = (now) => { if (!on) return; step(Math.min(0.1, (now - last) / 1000)); last = now; raf = requestAnimationFrame(loop); };
  const set = (v) => {
    on = v;
    b.innerHTML = on ? PAUSE : PLAY;
    b.setAttribute('aria-label', on ? 'Pause' : 'Play');
    cancelAnimationFrame(raf);
    if (on) { last = performance.now(); raf = requestAnimationFrame(loop); }
  };
  b.addEventListener('click', () => set(!on));
  new IntersectionObserver(([e]) => { if (!e.isIntersecting && on) set(false); }).observe(row);
  return { stop: () => set(false), get on() { return on; } };
}

function readouts(root, keys) {
  const d = document.createElement('div');
  d.className = 'dg-read';
  d.innerHTML = keys.map((k) => `<div><small>${k}</small><b data-k="${k}">—</b></div>`).join('');
  root.append(d);
  return (k, v) => { d.querySelector(`[data-k="${k}"]`).innerHTML = v; };
}

function segmented(parent, options, value, onChange) {
  const g = document.createElement('div');
  g.className = 'dg-seg';
  g.innerHTML = options.map(([k, label]) => `<button type="button" data-k="${k}" aria-pressed="${k === value}">${label}</button>`).join('');
  g.addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]');
    if (!b) return;
    for (const x of g.children) x.setAttribute('aria-pressed', String(x === b));
    onChange(b.dataset.k);
  });
  parent.append(g);
  return g;
}

function defs(svg) {
  const d = el('defs', {}, svg);
  d.innerHTML = `
    <radialGradient id="dg-sun" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff6d8"/><stop offset="0.55" stop-color="#ffcf6e"/><stop offset="1" stop-color="#ff9a3c"/></radialGradient>
    <radialGradient id="dg-sunglow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffcf6e" stop-opacity="0.5"/><stop offset="1" stop-color="#ffcf6e" stop-opacity="0"/></radialGradient>
    <radialGradient id="dg-earth" cx="40%" cy="38%" r="70%"><stop offset="0" stop-color="#6fb2ff"/><stop offset="1" stop-color="#1f4f9e"/></radialGradient>
    <radialGradient id="dg-moon" cx="40%" cy="38%" r="70%"><stop offset="0" stop-color="#f1efe9"/><stop offset="1" stop-color="#a9a49a"/></radialGradient>
    <marker id="dg-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#ffcf6e"/></marker>
    <marker id="dg-arrow-w" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#93d6ff"/></marker>`;
  return d;
}

// The sunlit part of a sphere, seen from the viewer: lit from screen angle theta (radians, SVG coordinates),
// alpha = angle between the Sun and the viewer as seen from the sphere (0 full, 90° half, 180° new).
function litPath(r, alpha) {
  const a = r * Math.abs(Math.cos(alpha));
  if (alpha >= Math.PI - 1e-3) return '';
  const sweep = alpha < Math.PI / 2 ? 1 : 0;
  return `M0 ${-r}A${r} ${r} 0 0 1 0 ${r}A${a.toFixed(2)} ${r} 0 0 ${sweep} 0 ${-r}Z`;
}
function sphere(parent, { r, fill, dark = '#141a26', theta, alpha, glow }) {
  const g = el('g', {}, parent);
  el('circle', { r, fill: dark, stroke: 'rgba(255,255,255,0.12)', 'stroke-width': 1 }, g);
  const lit = el('path', { d: litPath(r, alpha), fill, transform: `rotate(${(theta / DEG).toFixed(2)})` }, g);
  if (glow) g.setAttribute('filter', 'drop-shadow(0 0 6px rgba(255,255,255,0.25))');
  return { g, lit, update(t, a) { lit.setAttribute('d', litPath(r, a)); lit.setAttribute('transform', `rotate(${(t / DEG).toFixed(2)})`); } };
}

function sunRays(svg, x, y0, y1, dir = 1, label = 'Sunlight') {
  const g = el('g', { opacity: 0.85 }, svg);
  for (let y = y0; y <= y1; y += (y1 - y0) / 4) el('line', { x1: x, y1: y, x2: x + dir * 70, y2: y, stroke: '#ffcf6e', 'stroke-width': 2, 'marker-end': 'url(#dg-arrow)', 'stroke-dasharray': '2 6' }, g);
  el('text', { x: x + dir * 35, y: y0 - 10, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 600, fill: '#ffcf6e' }, g, label);
  return g;
}

const fmtTime = (h) => {
  const hh = Math.floor(h) % 24, mm = Math.round((h - Math.floor(h)) * 60) % 60;
  const ap = hh < 12 ? 'am' : 'pm';
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${ap}`;
};
const fmtHours = (h) => `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, '0')} min`;

// ================================================================ Lesson 1: day and night
function dayNight(root) {
  const svg = card(root, 'Earth from above the North Pole', 'Drag the slider, or press play, to spin Earth through one day.', 740, 340);
  defs(svg);
  const cx = 330, cy = 170, R = 104;
  sunRays(svg, 16, 92, 248);
  const earth = el('g', { transform: `translate(${cx} ${cy})` }, svg);
  el('circle', { r: R, fill: 'url(#dg-earth)' }, earth);
  const spin = el('g', {}, earth);
  // stylised continents, seen from above the pole
  for (const [a, w, l] of [[20, 50, 0.55], [95, 70, 0.62], [170, 40, 0.5], [230, 60, 0.6], [300, 45, 0.58]]) {
    const p = [];
    for (let k = 0; k <= 12; k++) {
      const t = (a - w / 2 + (w * k) / 12) * DEG, rr = R * (l + 0.36 * Math.sin((k / 12) * Math.PI) * (0.8 + 0.2 * Math.sin(k * 2.3 + a)));
      p.push(`${(Math.cos(t) * rr).toFixed(1)},${(-Math.sin(t) * rr).toFixed(1)}`);
    }
    for (let k = 12; k >= 0; k--) {
      const t = (a - w / 2 + (w * k) / 12) * DEG, rr = R * (l - 0.08 - 0.1 * Math.sin(k * 1.7 + a));
      p.push(`${(Math.cos(t) * rr).toFixed(1)},${(-Math.sin(t) * rr).toFixed(1)}`);
    }
    el('polygon', { points: p.join(' '), fill: '#3f9b5a', opacity: 0.9 }, spin);
  }
  el('circle', { r: R * 0.2, fill: '#eaf4ff', opacity: 0.85 }, spin); // Arctic ice
  const you = el('g', {}, spin);
  el('line', { x1: -R, y1: 0, x2: -R - 16, y2: 0, stroke: '#ffb547', 'stroke-width': 3, 'stroke-linecap': 'round' }, you);
  el('circle', { cx: -R - 20, cy: 0, r: 6, fill: '#ffb547' }, you);
  el('path', { d: `M0 ${-R}A${R} ${R} 0 0 1 0 ${R}Z`, fill: 'rgba(3,6,18,0.62)' }, earth); // night half (the Sun is to the left)
  el('text', { x: 52, y: -R - 20, 'font-size': 13, fill: '#8e9cb2', 'text-anchor': 'middle' }, earth, 'Night');
  el('text', { x: -52, y: -R - 20, 'font-size': 13, fill: '#ffcf6e', 'text-anchor': 'middle' }, earth, 'Day');
  el('circle', { r: 4, fill: '#fff' }, earth);
  // rotation arrow (counter-clockwise, seen from above the North Pole)
  el('path', { d: `M${R * 0.72} ${-R * 0.3}A${R * 0.78} ${R * 0.78} 0 0 0 ${R * 0.3} ${-R * 0.72}`, fill: 'none', stroke: '#93d6ff', 'stroke-width': 2.5, 'marker-end': 'url(#dg-arrow-w)' }, earth);
  const youLabel = el('text', { 'font-size': 14, 'font-weight': 700, fill: '#ffb547', 'text-anchor': 'middle' }, svg, 'You');
  // the sky over "you": a little horizon picture
  const sky = el('g', { transform: 'translate(612 168)' }, svg);
  el('rect', { x: -95, y: -70, width: 190, height: 82, rx: 12, fill: '#0b1220', stroke: 'rgba(156,184,222,0.25)' }, sky);
  const skyFill = el('rect', { x: -94, y: -69, width: 188, height: 68, rx: 11, fill: '#3d7bd6' }, sky);
  el('rect', { x: -94, y: -2, width: 188, height: 13, fill: '#2c5c35' }, sky);
  const skySun = el('circle', { r: 9, fill: '#ffd36e' }, sky);
  const stars = el('g', { opacity: 0 }, sky);
  for (const [x, y] of [[-70, -55], [-30, -40], [10, -60], [50, -45], [75, -25], [-55, -20], [30, -20]]) el('circle', { cx: x, cy: y, r: 1.4, fill: '#fff' }, stars);
  el('text', { x: 0, y: 30, 'text-anchor': 'middle', 'font-size': 12, fill: '#8e9cb2' }, sky, 'Your sky');
  el('text', { x: -88, y: 8, 'font-size': 10, fill: '#cfe' }, sky, 'E');
  el('text', { x: 80, y: 8, 'font-size': 10, fill: '#cfe' }, sky, 'W');
  const hour = slider(root, { label: 'Your time', min: 0, max: 24, step: 0.25, value: 9, format: fmtTime });
  const show = readouts(root, ['Where you are', 'The Sun for you']);
  const draw = () => {
    const t = hour.value;
    spin.setAttribute('transform', `rotate(${(-(t - 12) * 15).toFixed(2)})`);
    const a = (180 + (t - 12) * 15) * DEG;
    youLabel.setAttribute('x', (cx + Math.cos(a) * (R + 44)).toFixed(1));
    youLabel.setAttribute('y', (cy - Math.sin(a) * (R + 44) + 5).toFixed(1));
    const dayFrac = (t - 6) / 12; // 0 sunrise, 1 sunset
    const up = dayFrac > 0 && dayFrac < 1;
    const alt = Math.sin(clamp(dayFrac, 0, 1) * Math.PI);
    skySun.setAttribute('cx', (-80 + 160 * clamp(dayFrac, 0, 1)).toFixed(1));
    skySun.setAttribute('cy', (-4 - alt * 54).toFixed(1));
    skySun.setAttribute('opacity', up ? 1 : 0);
    const light = clamp(alt * 3, 0, 1);
    skyFill.setAttribute('fill', `rgb(${Math.round(8 + 53 * light + (1 - light) * (up ? 60 : 0))},${Math.round(12 + 111 * light)},${Math.round(30 + 184 * light)})`);
    stars.setAttribute('opacity', up ? 0 : 1);
    const phase = t < 5.5 || t >= 23 ? 'Night (around midnight)' : t < 6.5 ? 'Sunrise' : t < 11 ? 'Morning' : t <= 13 ? 'Midday' : t < 17.5 ? 'Afternoon' : t < 18.5 ? 'Sunset' : 'Evening, after dark';
    show('Where you are', phase);
    show('The Sun for you', up ? (t > 11 && t < 13 ? 'Highest in the sky' : t < 12 ? 'Rising in the east' : 'Sinking in the west') : 'Below the horizon');
  };
  hour.input.addEventListener('input', draw);
  player(hour.row, (dt) => { hour.set((hour.value + dt * 3) % 24); draw(); });
  draw();
}

// ================================================================ Lesson 2: the seasons
const CITIES = [['Sydney', -33.87], ['Kathmandu', 27.7], ['London', 51.5], ['New York', 40.7], ['Nairobi', -1.29], ['Reykjavík', 64.1]];
const declination = (doy) => -23.44 * Math.cos((2 * Math.PI / 365) * (doy + 10));
const dayLength = (lat, dec) => {
  // sunrise is when the Sun's upper limb touches the horizon, about 0.833 degrees below its centre once
  // refraction and the Sun's own width are allowed for - the figure almanacs print
  const la = lat * DEG, de = dec * DEG;
  const c = (Math.sin(-0.833 * DEG) - Math.sin(la) * Math.sin(de)) / (Math.cos(la) * Math.cos(de));
  return c <= -1 ? 24 : c >= 1 ? 0 : (2 * Math.acos(c)) / DEG / 15;
};
const dateOf = (doy) => { const d = new Date(Date.UTC(2025, 0, 1) + (doy - 1) * 864e5); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };

function seasonsOrbit(root) {
  const svg = card(root, 'A year around the Sun', 'Move through the year. Earth’s axis always leans the same way, towards the North Star.', 700, 380);
  defs(svg);
  const cx = 350, cy = 205, RX = 255, RY = 108, beta = Math.asin(RY / RX), eps = 23.44 * DEG;
  el('ellipse', { cx, cy, rx: RX, ry: RY, fill: 'none', stroke: 'rgba(156,184,222,0.35)', 'stroke-dasharray': '5 6' }, svg);
  el('circle', { cx, cy, r: 70, fill: 'url(#dg-sunglow)' }, svg);
  el('circle', { cx, cy, r: 34, fill: 'url(#dg-sun)' }, svg);
  for (const [x, y, name, anchor] of [[cx - RX - 44, cy + 4, 'June', 'end'], [cx, cy + RY + 54, 'September', 'middle'], [cx + RX + 44, cy + 4, 'December', 'start'], [cx, cy - RY - 40, 'March', 'middle']]) {
    el('text', { x, y, 'text-anchor': anchor, 'font-size': 12, fill: '#5d6a80' }, svg, name);
  }
  const earthG = el('g', {}, svg);
  const er = 24;
  const disc = sphere(earthG, { r: er, fill: 'url(#dg-earth)', dark: '#0d1830', theta: 0, alpha: 1 });
  // axis: fixed in space, leaning towards where the Sun is in June
  const ax = Math.sin(eps), ay = -Math.cos(eps) * Math.cos(beta);
  const axL = Math.hypot(ax, ay);
  el('line', { x1: (-ax / axL) * er * 1.7, y1: (-ay / axL) * er * 1.7, x2: (ax / axL) * er * 1.7, y2: (ay / axL) * er * 1.7, stroke: '#93d6ff', 'stroke-width': 2.2, 'stroke-dasharray': '5 4' }, earthG);
  el('text', { x: (ax / axL) * er * 1.95, y: (ay / axL) * er * 1.95 - 2, 'font-size': 12, 'font-weight': 700, fill: '#93d6ff', 'text-anchor': 'middle' }, earthG, 'N');
  const label = el('text', { 'font-size': 13, 'font-weight': 600, fill: '#7ee0a1', 'text-anchor': 'middle' }, svg);
  const day = slider(root, { label: 'Date', min: 1, max: 365, step: 1, value: 172, format: dateOf });
  const ctl = document.createElement('div');
  ctl.className = 'dg-row';
  ctl.innerHTML = `<label><span>Day length in</span><select>${CITIES.map(([n], i) => `<option value="${i}"${n === 'London' ? ' selected' : ''}>${n}</option>`).join('')}</select></label>`;
  root.append(ctl);
  const city = ctl.querySelector('select');
  const show = readouts(root, ['North of the equator', 'South of the equator', 'Sun overhead at', 'Day length', 'Distance to the Sun']);
  const draw = () => {
    const doy = day.value;
    const psi = (2 * Math.PI * (doy - 172)) / 365.25;
    const x = cx - RX * Math.cos(psi), y = cy + RY * Math.sin(psi);
    const k = 1 + 0.16 * Math.sin(psi); // a little bigger in front
    earthG.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${k.toFixed(3)})`);
    // lit half: the Sun's direction against the direction we're looking from
    const cosA = -Math.sin(psi) * Math.cos(beta);
    const theta = Math.atan2(-Math.sin(psi) * Math.sin(beta), Math.cos(psi));
    disc.update(theta, Math.acos(clamp(cosA, -1, 1)));
    const dec = declination(doy);
    const north = dec > 8 ? 'Summer' : dec < -8 ? 'Winter' : doy < 172 ? 'Spring' : 'Autumn';
    const south = { Summer: 'Winter', Winter: 'Summer', Spring: 'Autumn', Autumn: 'Spring' }[north];
    label.textContent = dec > 8 ? 'North leans towards the Sun' : dec < -8 ? 'South leans towards the Sun' : 'Neither half leans to the Sun';
    label.setAttribute('x', x.toFixed(1));
    label.setAttribute('y', (y + (Math.sin(psi) > -0.3 ? 62 : -46)).toFixed(1));
    show('North of the equator', north);
    show('South of the equator', south);
    show('Sun overhead at', `${Math.abs(dec).toFixed(1)}° ${dec >= 0 ? 'N' : 'S'}${Math.abs(dec) > 23.2 ? ` <small>(Tropic of ${dec > 0 ? 'Cancer' : 'Capricorn'})</small>` : Math.abs(dec) < 0.6 ? ' <small>(the equator)</small>' : ''}`);
    const [cname, lat] = CITIES[Number(city.value)];
    const len = dayLength(lat, dec);
    show('Day length', `${len >= 23.99 ? '24 h · midnight Sun' : len <= 0.01 ? '0 h · polar night' : fmtHours(len)} <small>in ${cname}</small>`);
    const r = 149.6 * (1 - 0.0167 * Math.cos((2 * Math.PI * (doy - 4)) / 365.256));
    show('Distance to the Sun', `${r.toFixed(1)} million km${r < 147.4 ? ' <small>(closest!)</small>' : r > 151.8 ? ' <small>(farthest)</small>' : ''}`);
  };
  day.input.addEventListener('input', draw);
  city.addEventListener('change', draw);
  player(day.row, (dt) => { day.set(((day.value + dt * 30 - 1) % 365) + 1); draw(); });
  draw();
}

function sunAngle(root) {
  const svg = card(root, 'Same sunlight, different angle', 'Raise and lower the Sun. The beam carries the same light, but a low Sun spreads it thin.', 640, 300);
  defs(svg);
  const gx = 320, gy = 230, W = 90;
  el('rect', { x: 0, y: gy, width: 640, height: 70, fill: '#1d3324' }, svg);
  el('line', { x1: 0, y1: gy, x2: 640, y2: gy, stroke: '#4c7a55', 'stroke-width': 2 }, svg);
  const beam = el('polygon', { fill: 'rgba(255,207,110,0.22)', stroke: 'rgba(255,207,110,0.6)' }, svg);
  const rays = el('g', {}, svg);
  const patch = el('rect', { y: gy - 3, height: 8, rx: 3, fill: '#ffcf6e' }, svg);
  const sun = el('circle', { r: 20, fill: 'url(#dg-sun)' }, svg);
  const person = el('g', {}, svg);
  el('line', { x1: 0, y1: 0, x2: 0, y2: -34, stroke: '#e8eef7', 'stroke-width': 4, 'stroke-linecap': 'round' }, person);
  el('circle', { cx: 0, cy: -42, r: 8, fill: '#e8eef7' }, person);
  const shadow = el('line', { y1: gy + 1, y2: gy + 1, stroke: 'rgba(0,0,0,0.6)', 'stroke-width': 6, 'stroke-linecap': 'round' }, svg);
  const angle = slider(root, { label: 'Sun height in the sky', min: 10, max: 90, step: 1, value: 62, format: (v) => `${v}°` });
  const pre = document.createElement('div');
  pre.className = 'dg-row';
  root.append(pre);
  segmented(pre, [['62', 'London, June noon'], ['15', 'London, December noon'], ['90', 'Overhead (tropics)']], '62', (k) => { angle.set(Number(k)); draw(); });
  const show = readouts(root, ['Patch of ground lit', 'Sunlight on each m²', 'Your shadow']);
  const draw = () => {
    const h = angle.value * DEG;
    const L = W / Math.sin(h);
    const dx = Math.cos(h), dy = -Math.sin(h);
    const sx = gx - dx * 200, sy = gy + dy * 200; // the Sun, back up the beam
    const ox = -dy * (W / 2), oy = dx * (W / 2);
    beam.setAttribute('points', `${sx + ox},${sy + oy} ${gx + L / 2},${gy} ${gx - L / 2},${gy} ${sx - ox},${sy - oy}`);
    sun.setAttribute('cx', (sx).toFixed(1)); sun.setAttribute('cy', Math.max(24, sy).toFixed(1));
    rays.innerHTML = '';
    for (let k = -1; k <= 1; k++) {
      const bx = gx + (k * L) / 3, x0 = bx - dx * 180, y0 = gy + dy * 180;
      el('line', { x1: x0, y1: y0, x2: bx - dx * 8, y2: gy + dy * 8, stroke: '#ffcf6e', 'stroke-width': 1.6, 'marker-end': 'url(#dg-arrow)', 'stroke-dasharray': '3 5' }, rays);
    }
    patch.setAttribute('x', (gx - L / 2).toFixed(1));
    patch.setAttribute('width', L.toFixed(1));
    patch.setAttribute('opacity', (0.25 + 0.75 * Math.sin(h)).toFixed(2));
    const px = 120;
    person.setAttribute('transform', `translate(${px} ${gy})`);
    const sl = Math.min(500, 42 / Math.tan(h));
    shadow.setAttribute('x1', px); shadow.setAttribute('x2', (px + sl).toFixed(1));
    show('Patch of ground lit', `${(1 / Math.sin(h)).toFixed(2)}× as big as overhead`);
    show('Sunlight on each m²', `${Math.round(Math.sin(h) * 100)}% of overhead`);
    show('Your shadow', `${(1 / Math.tan(h)).toFixed(1)}× your height`);
  };
  angle.input.addEventListener('input', draw);
  draw();
}

// ================================================================ Lesson 3: phases of the Moon
const PHASES = [[0, 'New moon'], [6, 'Waxing crescent'], [84, 'First quarter'], [96, 'Waxing gibbous'], [174, 'Full moon'], [186, 'Waning gibbous'], [264, 'Last quarter'], [276, 'Waning crescent'], [354, 'New moon']];
const phaseName = (E) => { let n = PHASES[0][1]; for (const [a, name] of PHASES) if (E >= a) n = name; return n; };

function phaseDial(root) {
  const svg = card(root, 'The Moon’s month, from above', 'Drag the Moon around Earth (or use the slider). Half of it is always lit. How much of that half faces us?', 720, 380);
  defs(svg);
  const cx = 230, cy = 190, R = 140;
  sunRays(svg, 470, 70, 310, -1, 'Sunlight');
  el('circle', { cx, cy, r: R, fill: 'none', stroke: 'rgba(156,184,222,0.3)', 'stroke-dasharray': '4 6' }, svg);
  const ghosts = el('g', { opacity: 0.35 }, svg);
  for (let k = 0; k < 8; k++) {
    const E = k * 45 * DEG;
    const g = el('g', { transform: `translate(${(cx + R * Math.cos(E)).toFixed(1)} ${(cy - R * Math.sin(E)).toFixed(1)})` }, ghosts);
    sphere(g, { r: 11, fill: '#dcd8cf', theta: 0, alpha: Math.PI / 2 }); // seen from above, always lit on the Sun side
  }
  const earth = el('g', { transform: `translate(${cx} ${cy})` }, svg);
  sphere(earth, { r: 30, fill: 'url(#dg-earth)', dark: '#0d1830', theta: 0, alpha: Math.PI / 2 });
  el('text', { x: 0, y: 50, 'text-anchor': 'middle', 'font-size': 12, fill: '#8e9cb2' }, earth, 'Earth');
  const sight = el('line', { x1: cx, y1: cy, stroke: 'rgba(147,214,255,0.5)', 'stroke-width': 1.5, 'stroke-dasharray': '4 4' }, svg);
  const moon = el('g', { style: 'cursor:grab' }, svg);
  el('circle', { r: 30, fill: 'transparent' }, moon); // a bigger target for fingers
  sphere(moon, { r: 17, fill: 'url(#dg-moon)', theta: 0, alpha: Math.PI / 2, glow: true });
  const facing = el('path', { fill: 'none', stroke: '#93d6ff', 'stroke-width': 2.5, 'stroke-dasharray': '3 3' }, moon); // the half facing Earth
  // the view from Earth
  const view = el('g', { transform: 'translate(585 165)' }, svg);
  el('text', { x: 0, y: -108, 'text-anchor': 'middle', 'font-size': 13, fill: '#8e9cb2' }, view, 'What we see from Earth');
  el('circle', { r: 86, fill: 'rgba(147,214,255,0.04)', stroke: 'rgba(147,214,255,0.25)', 'stroke-dasharray': '3 5' }, view);
  const seen = el('g', {}, view);
  const big = sphere(seen, { r: 74, fill: 'url(#dg-moon)', dark: '#10141d', theta: 0, alpha: 0 });
  const name = el('text', { x: 0, y: 116, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700, fill: '#e8eef7' }, view);
  el('text', { x: 20, y: 372, 'font-size': 12, fill: '#5d6a80' }, svg, 'Blue dashes: the half of the Moon facing Earth. The part that is lit and facing us is what we see.');
  const age = slider(root, { label: 'Days since new moon', min: 0, max: 29.5, step: 0.1, value: 4, format: (v) => `${v.toFixed(1)} days` });
  const row = document.createElement('div');
  row.className = 'dg-row';
  root.append(row);
  let south = false;
  segmented(row, [['n', 'Northern hemisphere'], ['s', 'Southern hemisphere']], 'n', (k) => { south = k === 's'; draw(); });
  const show = readouts(root, ['Phase', 'Lit, as we see it', 'Rises around']);
  const draw = () => {
    const E = (age.value / 29.53) * 360;
    const e = E * DEG;
    const mx = cx + R * Math.cos(e), my = cy - R * Math.sin(e);
    moon.setAttribute('transform', `translate(${mx.toFixed(1)} ${my.toFixed(1)})`);
    sight.setAttribute('x2', mx.toFixed(1)); sight.setAttribute('y2', my.toFixed(1));
    // Earth-facing half: an arc on the side towards Earth
    const toE = Math.atan2(cy - my, cx - mx);
    const a0 = toE - Math.PI / 2, a1 = toE + Math.PI / 2, r = 21;
    facing.setAttribute('d', `M${(Math.cos(a0) * r).toFixed(1)} ${(Math.sin(a0) * r).toFixed(1)}A${r} ${r} 0 0 1 ${(Math.cos(a1) * r).toFixed(1)} ${(Math.sin(a1) * r).toFixed(1)}`);
    const waxing = E <= 180;
    big.update(waxing ? 0 : Math.PI, Math.abs(Math.PI - e) % (2 * Math.PI));
    seen.setAttribute('transform', south ? 'scale(-1 1)' : '');
    const n = phaseName(E);
    name.textContent = n;
    show('Phase', n);
    show('Lit, as we see it', `${Math.round(((1 - Math.cos(e)) / 2) * 100)}%`);
    show('Rises around', fmtTime((6 + (E / 360) * 24) % 24).replace(':00', ''));
  };
  age.input.addEventListener('input', draw);
  // drag the Moon round its orbit
  let dragging = false;
  const toAge = (ev) => {
    const r = svg.getBoundingClientRect(), k = 720 / r.width;
    const x = (ev.clientX - r.left) * k - cx, y = (ev.clientY - r.top) * k - cy;
    const E = ((Math.atan2(-y, x) / DEG) + 360) % 360;
    age.set((E / 360) * 29.53); draw();
  };
  moon.addEventListener('pointerdown', (ev) => { dragging = true; moon.setPointerCapture(ev.pointerId); moon.style.cursor = 'grabbing'; anim.stop(); });
  moon.addEventListener('pointermove', (ev) => { if (dragging) toAge(ev); });
  moon.addEventListener('pointerup', () => { dragging = false; moon.style.cursor = 'grab'; });
  moon.style.touchAction = 'none';
  const anim = player(age.row, (dt) => { age.set((age.value + dt * 3) % 29.5); draw(); });
  draw();
}

// ================================================================ Lesson 4: eclipses
let clipN = 0;
function eclipseCones(root) {
  const svg = card(root, 'Shadows in space', 'Switch between the two kinds of eclipse, then nudge the Moon up or down.', 760, 330);
  const d = defs(svg);
  const clipId = `dg-clip-${++clipN}`;
  const clip = el('clipPath', { id: clipId }, d);
  const clipC = el('circle', {}, clip);
  el('circle', { cx: -40, cy: 165, r: 150, fill: 'url(#dg-sunglow)' }, svg);
  el('circle', { cx: -40, cy: 165, r: 120, fill: 'url(#dg-sun)' }, svg);
  el('text', { x: 18, y: 312, 'font-size': 13, fill: '#ffcf6e', 'font-weight': 600 }, svg, 'Sun');
  const shade = el('g', {}, svg);
  const bodies = el('g', {}, svg);
  const notes = el('g', {}, svg);
  el('text', { x: 750, y: 322, 'text-anchor': 'end', 'font-size': 11, fill: '#5d6a80' }, svg, 'Not to scale: really the Sun is 400 times the Moon’s width, and 400 times farther away');
  let mode = 'solar';
  const row = document.createElement('div');
  row.className = 'dg-row';
  root.append(row);
  segmented(row, [['solar', 'Solar eclipse'], ['lunar', 'Lunar eclipse']], 'solar', (k) => { mode = k; draw(); });
  const off = slider(root, { label: 'Move the Moon', min: -70, max: 70, step: 1, value: 0, format: (v) => (v === 0 ? 'on the line' : v > 0 ? `${v} below` : `${-v} above`) });
  const show = readouts(root, ['What happens', 'Who sees it']);
  const draw = () => {
    const dy = off.value;
    const solar = mode === 'solar';
    const caster = solar ? { x: 360, y: 165 + dy, r: 13 } : { x: 360, y: 165, r: 42 };
    const target = solar ? { x: 640, y: 165, r: 42 } : { x: 640, y: 165 + dy, r: 13 };
    const gap = target.x - caster.x;
    // the dark umbra narrows to a point (just past Earth for the Moon's shadow, far past the Moon for Earth's);
    // the paler penumbra widens out
    const tip = solar ? target.x + 10 : caster.x + gap * 3.7;
    const spread = solar ? 0.24 : 0.045;
    const uAt = (x) => caster.r * Math.max(0, 1 - (x - caster.x) / (tip - caster.x));
    const pAt = (x) => caster.r + (x - caster.x) * spread;
    const X2 = 790;
    shade.innerHTML = ''; bodies.innerHTML = ''; notes.innerHTML = '';
    el('polygon', { points: `${caster.x},${caster.y - caster.r} ${X2},${caster.y - pAt(X2)} ${X2},${caster.y + pAt(X2)} ${caster.x},${caster.y + caster.r}`, fill: 'rgba(130,118,190,0.2)' }, shade);
    el('polygon', { points: `${caster.x},${caster.y - caster.r} ${Math.min(tip, X2)},${caster.y - uAt(Math.min(tip, X2))} ${Math.min(tip, X2)},${caster.y + uAt(Math.min(tip, X2))} ${caster.x},${caster.y + caster.r}`, fill: 'rgba(4,3,14,0.9)', stroke: 'rgba(160,150,220,0.4)' }, shade);
    // sunlight grazing the edges of the shadow-maker
    for (const s of [-1, 1]) {
      el('line', { x1: 40, y1: 165 + s * 95, x2: caster.x, y2: caster.y + s * caster.r, stroke: 'rgba(255,207,110,0.35)', 'stroke-dasharray': '3 6' }, shade);
      el('line', { x1: 40, y1: 165 - s * 95, x2: caster.x, y2: caster.y + s * caster.r, stroke: 'rgba(255,207,110,0.2)', 'stroke-dasharray': '3 6' }, shade);
    }
    const body = (b, moon) => {
      const g = el('g', { transform: `translate(${b.x} ${b.y})` }, bodies);
      el('circle', { r: b.r, fill: moon ? 'url(#dg-moon)' : 'url(#dg-earth)' }, g);
      el('path', { d: `M0 ${-b.r}A${b.r} ${b.r} 0 0 1 0 ${b.r}Z`, fill: 'rgba(3,6,18,0.55)' }, g); // night side, away from the Sun
      el('text', { y: moon ? -b.r - 9 : b.r + 19, 'text-anchor': 'middle', 'font-size': 13, fill: '#e8eef7' }, g, moon ? 'Moon' : 'Earth');
      return g;
    };
    body(caster, solar);
    body(target, !solar);
    // the shadow where it lands on the target
    clipC.setAttribute('cx', target.x); clipC.setAttribute('cy', target.y); clipC.setAttribute('r', target.r);
    const onT = el('g', { 'clip-path': `url(#${clipId})` }, bodies);
    const ux = target.x - target.r * 0.3;
    const u = uAt(ux), p = pAt(ux);
    el('rect', { x: target.x - target.r, y: caster.y - p, width: target.r * 2, height: p * 2, fill: solar ? 'rgba(10,8,30,0.4)' : 'rgba(40,20,40,0.45)' }, onT);
    if (u > 0) el(solar ? 'ellipse' : 'rect', solar ? { cx: target.x - target.r * 0.75, cy: caster.y, rx: 7, ry: Math.max(3, u), fill: 'rgba(0,0,0,0.9)' } : { x: target.x - target.r, y: caster.y - u, width: target.r * 2, height: u * 2, fill: 'rgba(150,40,18,0.82)' }, onT);
    // what the target is inside of
    const reach = (half) => target.y + target.r > caster.y - half && target.y - target.r < caster.y + half;
    const inside = (half) => target.y - target.r > caster.y - half && target.y + target.r < caster.y + half;
    const label = (x, y, t, c) => el('text', { x, y, 'font-size': 12.5, 'font-weight': 600, fill: c, 'text-anchor': 'middle' }, notes, t);
    label(caster.x + (solar ? 140 : 120), caster.y + 4, 'Umbra', '#d9d2ff');
    label(caster.x + (solar ? 150 : 150), caster.y - pAt(caster.x + 150) - 8, 'Penumbra', '#c7b4ff');
    let what, who;
    if (solar) {
      if (u > 0 && reach(u)) { what = 'Total solar eclipse'; who = 'Inside the small umbra, day turns to night. All around it, in the penumbra, people see a partial eclipse.'; }
      else if (reach(p)) { what = 'Partial solar eclipse'; who = 'Only the penumbra touches Earth: the Sun looks like a cookie with a bite out of it.'; }
      else { what = 'No eclipse'; who = 'The shadow misses Earth completely. That’s what happens at most new moons.'; }
    } else if (inside(u)) { what = 'Total lunar eclipse'; who = 'Everyone on Earth’s night side can see the Moon turn a coppery red.'; }
    else if (reach(u)) { what = 'Partial lunar eclipse'; who = 'Part of the Moon dips into the dark umbra.'; }
    else if (reach(p)) { what = 'Penumbral eclipse'; who = 'The Moon only dims a little. Easy to miss!'; }
    else { what = 'No eclipse'; who = 'The Moon passes above or below Earth’s shadow, as it does at most full moons.'; }
    show('What happens', what);
    show('Who sees it', who);
  };
  off.input.addEventListener('input', draw);
  draw();
}

// A year of new moons (or full moons): how far the Moon's shadow passes from Earth's centre, worked out with
// the same ephemeris the 3D view uses. Most months it misses; twice a year, in eclipse season, it doesn't.
async function eclipseYear(root) {
  card(root, 'Eclipse seasons', 'Every new moon of the year, and how far its shadow passes from Earth. Tap a dot for the date.', 0, 0);
  const row = document.createElement('div');
  row.className = 'dg-row';
  root.append(row);
  let year = 2024, kind = 'solar';
  const yearSel = document.createElement('select');
  yearSel.innerHTML = [2024, 2025, 2026, 2027, 2028].map((y) => `<option${y === year ? ' selected' : ''}>${y}</option>`).join('');
  const lab = document.createElement('label');
  lab.innerHTML = '<span>Year</span>';
  lab.style.flex = '0 0 auto';
  lab.append(yearSel);
  row.append(lab);
  segmented(row, [['solar', 'New moons (solar)'], ['lunar', 'Full moons (lunar)']], 'solar', (k) => { kind = k; render(); });
  const W = 720, H = 300, x0 = 74, x1 = 672, y0 = 30, y1 = 260;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'dg-art', role: 'img', 'aria-label': 'Chart of how far the Moon’s shadow misses Earth each month' }, root);
  const tip = document.createElement('p');
  tip.className = 'dg-caption';
  root.append(tip);
  const list = document.createElement('p');
  list.className = 'dg-caption';
  root.append(list);
  let E;
  try { E = await import('../ephemeris.js'); } catch { tip.textContent = 'The chart needs the 3D engine, which didn’t load.'; return; }
  const THREE = await import('three');
  const v = { m: new THREE.Vector3(), e: new THREE.Vector3() };
  const lon = (p) => Math.atan2(-p.z, p.x);
  const at = (jd) => {
    E.moonGeocentric(jd, v.m);
    E.planetPosition('earth', jd, v.e);
    v.e.addScaledVector(v.m, -0.0121505856); // the barycentre to Earth's centre
    return { moon: v.m.clone(), earth: v.e.clone() };
  };
  // moments of new (target 0°) or full (180°) moon in a year, by refining the mean lunation
  const lunations = (yr, target) => {
    const out = [];
    const jdStart = Date.UTC(yr, 0, 1) / 864e5 + 2440587.5, jdEnd = Date.UTC(yr + 1, 0, 1) / 864e5 + 2440587.5;
    let k = Math.floor((jdStart - 2451550.1) / 29.530588861) - 1;
    for (; ; k++) {
      let jd = 2451550.1 + 29.530588861 * k + (target === 180 ? 14.765 : 0);
      for (let i = 0; i < 6; i++) {
        const { moon, earth } = at(jd);
        const sunDir = earth.clone().multiplyScalar(-1);
        let d = ((lon(moon) - lon(sunDir)) / DEG - target) % 360;
        if (d > 180) d -= 360; else if (d < -180) d += 360;
        jd -= d / 12.19;
      }
      if (jd >= jdEnd) break;
      if (jd >= jdStart) out.push(jd);
    }
    return out;
  };
  const RE = 6378.137, RM = 1737.4, RS = 695700;
  // Where the shadow passes, and what kind of eclipse that makes. The Sun sits at the origin, and the
  // Moon's position here is relative to Earth, so the Moon itself is earth + moon.
  const measure = (jd) => {
    const { moon, earth } = at(jd);
    if (kind === 'solar') {
      const M = earth.clone().add(moon);
      const axis = M.clone().normalize();
      const rel = earth.clone().sub(M);
      const t = rel.dot(axis);
      const perp = rel.clone().sub(axis.clone().multiplyScalar(t));
      const x = perp.length();
      const dsm = M.length();
      const umb = RM - (t * (RS - RM)) / dsm; // negative once past the umbra's tip: a ring of fire
      const pen = RM + (t * (RS + RM)) / dsm;
      const type = x < RE + Math.abs(umb) ? (umb > 0 ? 'total' : 'annular') : x < RE + pen ? 'partial' : null;
      return { km: Math.sign(perp.y) * x, type };
    }
    const axis = earth.clone().normalize();
    const d = moon.dot(axis);
    const perp = moon.clone().sub(axis.clone().multiplyScalar(d));
    const x = perp.length();
    const des = earth.length();
    const umb = RE - (d * (RS - RE)) / des; // Earth's umbra out at the Moon's distance
    const pen = RE + (d * (RS + RE)) / des;
    const type = x + RM < umb ? 'total' : x < umb + RM ? 'partial' : x < pen + RM ? 'penumbral' : null;
    return { km: Math.sign(perp.y) * x, type };
  };
  const render = () => {
    const pts = lunations(year, kind === 'solar' ? 0 : 180).map((jd) => ({ jd, ...measure(jd) }));
    svg.innerHTML = '';
    const LIM = 36000;
    const Y = (km) => y0 + ((LIM - clamp(km, -LIM, LIM)) / (2 * LIM)) * (y1 - y0);
    const X = (jd) => { const d = new Date((jd - 2440587.5) * 864e5); const f = (d - Date.UTC(year, 0, 1)) / (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)); return x0 + f * (x1 - x0); };
    // the zone where an eclipse happens: Earth's own size (solar), or Earth's shadow (lunar)
    const full = kind === 'solar' ? RE : 4600 + 1737; // umbra at the Moon's distance, plus the Moon's radius
    const part = kind === 'solar' ? RE + 3500 : 8000 + 1737;
    el('rect', { x: x0, y: Y(part), width: x1 - x0, height: Y(-part) - Y(part), fill: 'rgba(199,180,255,0.08)' }, svg);
    el('rect', { x: x0, y: Y(full), width: x1 - x0, height: Y(-full) - Y(full), fill: 'rgba(255,122,102,0.16)' }, svg);
    el('line', { x1: x0, x2: x1, y1: Y(0), y2: Y(0), stroke: 'rgba(255,207,110,0.6)', 'stroke-dasharray': '6 5' }, svg);
    el('text', { x: x1, y: Y(0) - 6, 'text-anchor': 'end', 'font-size': 11, fill: '#ffcf6e' }, svg, kind === 'solar' ? 'Line from the Sun through Earth’s centre' : 'Middle of Earth’s shadow');
    el('text', { x: x0 + 6, y: Y(full) + 14, 'font-size': 11, fill: '#ff9d8c' }, svg, kind === 'solar' ? 'Hits Earth' : 'Inside the dark umbra');
    for (const km of [-30000, -20000, -10000, 0, 10000, 20000, 30000]) {
      el('text', { x: x0 - 8, y: Y(km) + 4, 'text-anchor': 'end', 'font-size': 10.5, fill: '#5d6a80' }, svg, km === 0 ? '0' : `${km > 0 ? '+' : '−'}${Math.abs(km / 1000)}k km`);
    }
    el('text', { x: 13, y: (y0 + y1) / 2, 'font-size': 11, fill: '#8e9cb2', transform: `rotate(-90 13 ${(y0 + y1) / 2})`, 'text-anchor': 'middle' }, svg, 'Shadow passes above / below');
    MONTHS.forEach((m, i) => el('text', { x: x0 + ((i + 0.5) / 12) * (x1 - x0), y: H - 14, 'text-anchor': 'middle', 'font-size': 11, fill: '#5d6a80' }, svg, m));
    // Earth to scale with the chart's height, for comparison
    el('circle', { cx: x0 - 50, cy: Y(0), r: Math.abs(Y(RE) - Y(0)), fill: 'url(#dg-earth)', opacity: 0.9 }, svg);
    const eclipses = [];
    for (const p of pts) {
      const hit = p.type === 'total' || p.type === 'annular', near = !!p.type;
      const g = el('g', { style: 'cursor:pointer', tabindex: 0 }, svg);
      el('line', { x1: X(p.jd), x2: X(p.jd), y1: Y(0), y2: Y(p.km), stroke: hit ? '#ff7a66' : near ? '#c7b4ff' : 'rgba(156,184,222,0.35)', 'stroke-width': 1.5 }, g);
      el('circle', { cx: X(p.jd), cy: Y(p.km), r: hit ? 9 : 6.5, fill: hit ? '#ff7a66' : near ? '#c7b4ff' : '#d9dee8', stroke: '#03050a', 'stroke-width': 2 }, g);
      // dates in UTC: an eclipse belongs to the day astronomers give it, whatever time zone you read this in
      const ms = (p.jd - 2440587.5) * 864e5;
      const date = new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
      const what = p.type ? `a <b>${p.type}</b> eclipse of the ${kind === 'solar' ? 'Sun' : 'Moon'}` : 'no eclipse at all';
      const say = () => { tip.innerHTML = `<b>${date}</b>: the ${kind === 'solar' ? 'Moon’s shadow passes' : 'Moon passes'} ${Math.round(Math.abs(p.km)).toLocaleString()} km ${p.km > 0 ? 'above' : 'below'} ${kind === 'solar' ? 'Earth’s centre' : 'the middle of Earth’s shadow'}, so there is ${what}.`; };
      g.addEventListener('pointerenter', say); g.addEventListener('click', say); g.addEventListener('focus', say);
      if (p.type) eclipses.push(`${new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })} (${p.type})`);
    }
    tip.innerHTML = 'Tap or hover over a dot to see that month’s near miss.';
    list.innerHTML = eclipses.length ? `<b>Eclipses in ${year}:</b> ${eclipses.join(' · ')}. Notice they come in pairs about six months apart: the <b>eclipse seasons</b>.` : '';
  };
  yearSel.addEventListener('change', () => { year = Number(yearSel.value); render(); });
  render();
}

// ================================================================ Lesson 5: the planet race
const PLANETS = [
  ['Mercury', 0.387, 87.969, 47.4, '#a9a19a'], ['Venus', 0.723, 224.701, 35.0, '#e8cf9a'], ['Earth', 1.0, 365.256, 29.8, '#6b9bff'],
  ['Mars', 1.524, 686.98, 24.1, '#d9774b'], ['Jupiter', 5.203, 4332.59, 13.1, '#d8b48a'], ['Saturn', 9.537, 10759.22, 9.7, '#e3cf9c'],
  ['Uranus', 19.19, 30688.5, 6.8, '#9fd6e0'], ['Neptune', 30.07, 60182, 5.4, '#5b7ff0'],
];

function planetAges(root) {
  card(root, 'Your age on other planets', 'A year is one trip around the Sun. Enter your birthday to see how many trips you’d have made elsewhere.');
  const row = document.createElement('div');
  row.className = 'dg-row';
  const def = new Date(Date.now() - 11.4 * 365.25 * 864e5).toISOString().slice(0, 10);
  row.innerHTML = `<label><span>Your birthday</span><input type="date" value="${def}" max="${new Date().toISOString().slice(0, 10)}" style="width:auto"></label>`;
  root.append(row);
  const input = row.querySelector('input');
  const table = document.createElement('table');
  root.append(table);
  const draw = () => {
    const born = Date.parse(input.value);
    if (!Number.isFinite(born)) return;
    const days = (Date.now() - born) / 864e5;
    const maxAge = days / PLANETS[0][2];
    table.innerHTML = `<thead><tr><th>Planet</th><th>One year is</th><th>Your age there</th><th>Next birthday</th></tr></thead><tbody>${PLANETS.map(([n, , P, , c]) => {
      const age = days / P;
      const next = new Date(born + Math.ceil(age) * P * 864e5);
      const len = P < 730 ? `${Math.round(P)} days` : `${(P / 365.256).toFixed(1)} Earth years`;
      return `<tr style="--c:${c}"><td><i></i>${n}</td><td>${len}</td><td><b>${age < 10 ? age.toFixed(1) : Math.floor(age)}</b> <span class="bar" style="width:${Math.max(2, (age / maxAge) * 100)}%"></span></td><td>${age < 1 && next.getFullYear() > 2100 ? `in ${Math.round((Math.ceil(age) * P - days) / 365.25)} years` : next.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</td></tr>`;
    }).join('')}</tbody>`;
  };
  input.addEventListener('input', draw);
  draw();
}

function keplerLab(root) {
  const svg = card(root, 'Kepler’s pattern', 'Pick a distance from the Sun for an invented planet. Farther out, the path is longer and the planet moves slower.', 700, 300);
  defs(svg);
  const cx = 160, cy = 150;
  el('circle', { cx, cy, r: 16, fill: 'url(#dg-sun)' }, svg);
  const earthOrbit = el('circle', { cx, cy, fill: 'none', stroke: 'rgba(107,155,255,0.5)', 'stroke-dasharray': '4 5' }, svg);
  const newOrbit = el('circle', { cx, cy, fill: 'none', stroke: 'rgba(199,180,255,0.7)', 'stroke-dasharray': '4 5' }, svg);
  const pe = el('circle', { r: 7, fill: '#6b9bff' }, svg);
  const pn = el('circle', { r: 9, fill: '#c7b4ff' }, svg);
  el('text', { x: cx, y: 292, 'text-anchor': 'middle', 'font-size': 11, fill: '#5d6a80' }, svg, 'Distances squeezed to fit');
  // the real planets on the T² = a³ line (log scales)
  const gx0 = 360, gx1 = 680, gy0 = 30, gy1 = 250;
  const LX = (a) => gx0 + ((Math.log10(a) + 0.6) / 2.3) * (gx1 - gx0);
  const LY = (t) => gy1 - ((Math.log10(t) + 0.9) / 3.3) * (gy1 - gy0);
  el('line', { x1: LX(0.25), y1: LY(0.25 ** 1.5), x2: LX(50), y2: LY(50 ** 1.5), stroke: 'rgba(199,180,255,0.5)', 'stroke-width': 2 }, svg);
  for (const [n, a, P, , c] of PLANETS) {
    el('circle', { cx: LX(a), cy: LY(P / 365.256), r: 5.5, fill: c }, svg);
    el('text', { x: LX(a) + 8, y: LY(P / 365.256) + 4, 'font-size': 11, fill: '#8e9cb2' }, svg, n);
  }
  el('line', { x1: gx0, y1: gy1, x2: gx1, y2: gy1, stroke: 'rgba(156,184,222,0.3)' }, svg);
  el('line', { x1: gx0, y1: gy0, x2: gx0, y2: gy1, stroke: 'rgba(156,184,222,0.3)' }, svg);
  el('text', { x: (gx0 + gx1) / 2, y: gy1 + 30, 'text-anchor': 'middle', 'font-size': 11, fill: '#8e9cb2' }, svg, 'Distance from the Sun (AU, log scale)');
  el('text', { x: gx0 - 10, y: gy0 - 10, 'font-size': 11, fill: '#8e9cb2' }, svg, 'Length of year (log scale)');
  const you = el('circle', { r: 8, fill: 'none', stroke: '#c7b4ff', 'stroke-width': 3 }, svg);
  const a = slider(root, { label: 'Distance from the Sun', min: -0.5, max: 1.7, step: 0.01, value: 0.18, format: (v) => `${(10 ** v).toFixed(2)} AU` });
  const show = readouts(root, ['Its year', 'Orbit speed', 'Compared with Earth']);
  const disp = (au) => 12 + 112 * Math.sqrt(Math.log10(au * 4 + 1) / Math.log10(201));
  let te = 0, tn = 0;
  const draw = () => {
    const au = 10 ** a.value, T = au ** 1.5;
    earthOrbit.setAttribute('r', disp(1)); newOrbit.setAttribute('r', disp(au));
    you.setAttribute('cx', LX(au)); you.setAttribute('cy', LY(T));
    show('Its year', T < 2 ? `${Math.round(T * 365.25)} days` : `${T.toFixed(T < 20 ? 1 : 0)} Earth years`);
    show('Orbit speed', `${(29.78 / Math.sqrt(au)).toFixed(1)} km/s`);
    show('Compared with Earth', T < 1 ? `${(1 / T).toFixed(1)} laps for each of Earth’s` : `1 lap for every ${T.toFixed(1)} of Earth’s`);
  };
  const place = () => {
    const au = 10 ** a.value;
    pe.setAttribute('cx', cx + disp(1) * Math.cos(te)); pe.setAttribute('cy', cy - disp(1) * Math.sin(te));
    pn.setAttribute('cx', cx + disp(au) * Math.cos(tn)); pn.setAttribute('cy', cy - disp(au) * Math.sin(tn));
  };
  a.input.addEventListener('input', () => { draw(); place(); });
  player(a.row, (dt) => { te += dt * 1.6; tn += (dt * 1.6) / (10 ** a.value) ** 1.5; place(); });
  draw(); place();
}

// ================================================================ Lesson 6: how far is far?
const SCALE_BODIES = [
  ['Sun', 1392700, 0, '#ffcf6e'], ['Mercury', 4879, 57.9e6, '#a9a19a'], ['Venus', 12104, 108.2e6, '#e8cf9a'], ['Earth', 12742, 149.6e6, '#6b9bff'],
  ['Moon', 3475, 149.6e6, '#c8c4bc', 384400], ['Mars', 6779, 227.9e6, '#d9774b'], ['Jupiter', 139820, 778.5e6, '#d8b48a'], ['Saturn', 116460, 1432e6, '#e3cf9c'],
  ['Uranus', 50724, 2867e6, '#9fd6e0'], ['Neptune', 49244, 4515e6, '#5b7ff0'], ['Proxima Centauri (nearest star)', 214000, 4.0175e13, '#ff9d7a'],
];
const SUN_MODELS = [['60', 'Beach ball (60 cm)'], ['24', 'Basketball (24 cm)'], ['6.7', 'Tennis ball (6.7 cm)'], ['1.6', 'Marble (1.6 cm)']];
const sizeLike = (mm) => (mm < 0.15 ? 'a speck of dust' : mm < 0.6 ? 'a grain of sand' : mm < 1.4 ? 'a pinhead' : mm < 3 ? 'a peppercorn' : mm < 6 ? 'a lentil' : mm < 11 ? 'a pea' : mm < 20 ? 'a marble' : mm < 30 ? 'a grape' : mm < 50 ? 'a ping-pong ball' : mm < 90 ? 'a tennis ball' : mm < 160 ? 'a grapefruit' : mm < 300 ? 'a basketball' : 'a beach ball');
const farLike = (m) => (m < 3 ? 'arm’s reach' : m < 12 ? 'across a room' : m < 30 ? 'across a classroom' : m < 60 ? 'a swimming pool' : m < 130 ? 'a football pitch' : m < 450 ? 'a lap of a running track' : m < 1500 ? 'a 15-minute walk' : m < 8000 ? 'a bike ride' : m < 60000 ? 'across a city' : m < 1e6 ? 'a long car trip' : 'across a continent');
const fmtLen = (mm) => (mm < 10 ? `${mm.toFixed(mm < 1 ? 2 : 1)} mm` : mm < 1000 ? `${(mm / 10).toFixed(1)} cm` : `${(mm / 1000).toFixed(2)} m`);
const fmtDist = (m) => (m < 1 ? `${Math.round(m * 100)} cm` : m < 1000 ? `${m < 10 ? m.toFixed(1) : Math.round(m)} m` : `${(m / 1000).toLocaleString(undefined, { maximumFractionDigits: m < 1e4 ? 1 : 0 })} km`);

function scaleModel(root) {
  card(root, 'Build a scale model', 'Shrink the Sun to something you could hold. Everything else shrinks by the same amount.');
  const row = document.createElement('div');
  row.className = 'dg-row';
  root.append(row);
  let model = 24;
  segmented(row, SUN_MODELS, '24', (k) => { model = Number(k); draw(); });
  const strip = el('svg', { viewBox: '0 0 720 90', class: 'dg-art', role: 'img', 'aria-label': 'The planets’ distances in the model, to scale' }, root);
  const table = document.createElement('table');
  root.append(table);
  const note = document.createElement('p');
  note.className = 'dg-caption';
  root.append(note);
  const draw = () => {
    const k = (model * 10) / 1392700; // mm per km
    table.innerHTML = `<thead><tr><th>In the model</th><th>Size</th><th>About as big as</th><th>Distance from the Sun</th><th>About as far as</th></tr></thead><tbody>${SCALE_BODIES.map(([n, d, a, c, fromEarth]) => {
      const mm = d * k, m = ((fromEarth ?? a) * k) / 1000;
      const where = fromEarth ? `${fmtDist(m)} from Earth` : a ? fmtDist(m) : '—';
      return `<tr style="--c:${c}"><td><i></i>${n}</td><td style="white-space:nowrap">${fmtLen(mm)}</td><td>${sizeLike(mm)}</td><td>${where}</td><td>${a ? farLike(m) : 'right here'}</td></tr>`;
    }).join('')}</tbody>`;
    // a strip with the planets' distances to scale (Proxima would be far off the edge)
    strip.innerHTML = '';
    const nep = 4515e6;
    el('line', { x1: 20, y1: 40, x2: 700, y2: 40, stroke: 'rgba(156,184,222,0.25)' }, strip);
    for (const [n, , a, c, fromEarth] of SCALE_BODIES) {
      if (fromEarth || a > nep * 1.01) continue;
      const x = 20 + (a / nep) * 680;
      el('circle', { cx: x, cy: 40, r: n === 'Sun' ? 7 : 3.5, fill: c }, strip);
      if (['Sun', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'].includes(n)) el('text', { x, y: 24, 'text-anchor': 'middle', 'font-size': 11, fill: '#8e9cb2' }, strip, n);
      if (n === 'Earth') { el('line', { x1: x, y1: 46, x2: x, y2: 60, stroke: 'rgba(156,184,222,0.5)' }, strip); el('text', { x, y: 72, 'text-anchor': 'middle', 'font-size': 11, fill: '#8e9cb2' }, strip, 'Earth'); }
    }
    const prox = (4.0175e13 * k) / 1e6; // km
    note.innerHTML = `The strip shows the planets’ distances to scale. Mercury, Venus, Earth and Mars huddle near the Sun. With the Sun as a ${SUN_MODELS.find(([v]) => Number(v) === model)[1].toLowerCase()}, the nearest star would be <b>${Math.round(prox).toLocaleString()} km</b> away: ${prox > 12000 ? 'farther than the other side of the Earth' : prox > 3000 ? 'a different continent' : 'a long road trip'}.`;
  };
  draw();
}

const LIGHT = PLANETS.map(([n, a, , , c]) => [n, a * 499.005, c]); // seconds for light from the Sun

function lightRace(root) {
  const svg = card(root, 'A flash of light leaves the Sun', 'Press play to race it out to the planets. Distances are to scale, and so is the timing.', 720, 300);
  defs(svg);
  const x0 = 70, x1 = 700, max = LIGHT.at(-1)[1];
  const X = (s) => x0 + (s / max) * (x1 - x0);
  el('circle', { cx: x0 - 30, cy: 150, r: 26, fill: 'url(#dg-sun)' }, svg);
  const rows = LIGHT.map(([n, s, c], i) => {
    const y = 34 + i * 31;
    el('line', { x1: x0, x2: X(s), y1: y, y2: y, stroke: 'rgba(156,184,222,0.18)', 'stroke-width': 8, 'stroke-linecap': 'round' }, svg);
    const fill = el('line', { x1: x0, x2: x0, y1: y, y2: y, stroke: '#fff3c4', 'stroke-width': 8, 'stroke-linecap': 'round', opacity: 0.85 }, svg);
    el('circle', { cx: X(s), cy: y, r: 6, fill: c }, svg);
    const t = el('text', { x: X(s) + (s > max * 0.8 ? -12 : 12), y: y + 4, 'font-size': 12, fill: '#c9d3e1', 'text-anchor': s > max * 0.8 ? 'end' : 'start' }, svg, `${n} · ${s < 3600 ? `${(s / 60).toFixed(1)} min` : `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`}`);
    return { s, fill, t };
  });
  const clock = el('text', { x: 700, y: 292, 'text-anchor': 'end', 'font-size': 14, 'font-weight': 700, fill: '#6fe3ff' }, svg, 'Light has travelled for 0 min');
  const row = document.createElement('div');
  row.className = 'dg-row';
  row.innerHTML = '<span style="font-size:14px;color:var(--ink-dim)">Each second here is 20 minutes for the light</span>';
  root.append(row);
  let t = 0;
  const draw = () => {
    for (const r of rows) {
      r.fill.setAttribute('x2', X(Math.min(t, r.s)).toFixed(1));
      r.t.setAttribute('fill', t >= r.s ? '#fff' : '#8e9cb2');
    }
    clock.textContent = `Light has travelled for ${t < 3600 ? `${Math.floor(t / 60)} min` : `${Math.floor(t / 3600)} h ${Math.floor((t % 3600) / 60)} min`}`;
  };
  const p = player(row, (dt) => { t += dt * 1200; if (t > max + 200) { t = max; draw(); p.stop(); t = 0; return; } draw(); });
  draw();
}

export const DIAGRAMS = { dayNight, seasonsOrbit, sunAngle, phaseDial, eclipseCones, eclipseYear, planetAges, keplerLab, scaleModel, lightRace };

// The building blocks, for the other courses' diagrams (diagrams-planets.js, diagrams-deep.js).
export { el, card, slider, player, readouts, segmented, defs, sphere, litPath, sunRays, DEG, clamp, PLANETS };
