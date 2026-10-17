// Diagrams for Gravity, Stars and Galaxies: Newton's cannon, a Moon that spins at the wrong rate, the zodiac
// around Earth's orbit, a star's life by its mass, and how far back in time you see.
// Built from the same parts as diagrams.js. Not to scale unless noted.
import { el, card, slider, player, readouts, segmented, defs, sphere, DEG } from './diagrams.js';

const TAU = Math.PI * 2;
const fmtNum = (v, d = 0) => v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
const row = (root) => { const r = document.createElement('div'); r.className = 'dg-row'; root.append(r); return r; };
const button = (parent, text) => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'qz-next'; b.style.marginTop = '0'; b.textContent = text;
  parent.append(b);
  return b;
};

// ================================================================ Falling around the Sun: Newton's cannon
const GM = 398600.44, RE = 6371; // Earth, km³/s² and km

function newtonCannon(root) {
  const svg = card(root, 'Newton’s cannon', 'A cannon on a mountain 400 km high, above the air. Set the speed and fire. Faster shots land further away, until one never lands.', 720, 400);
  defs(svg);
  svg.style.overflow = 'hidden'; // long orbits run off the card
  const cx = 330, cy = 215, k = 0.0205; // px per km
  el('circle', { cx, cy, r: RE * k, fill: 'url(#dg-earth)' }, svg);
  el('circle', { cx, cy, r: (RE + 100) * k, fill: 'none', stroke: 'rgba(111,178,255,0.25)', 'stroke-width': 3 }, svg);
  const h = 400, top = cy - (RE + h) * k;
  el('path', { d: `M${cx - 16} ${cy - RE * k + 3}L${cx} ${top}L${cx + 16} ${cy - RE * k + 3}Z`, fill: '#5d6a80' }, svg); // a very tall mountain
  el('rect', { x: cx - 2, y: top - 6, width: 16, height: 6, rx: 2, fill: '#c9d3e1' }, svg);
  const trace = el('polyline', { fill: 'none', stroke: '#ffb547', 'stroke-width': 2.2 }, svg);
  const ghosts = el('g', { opacity: 0.35 }, svg);
  const ball = el('circle', { cx: cx, cy: top - 3, r: 4.5, fill: '#ffcf6e' }, svg);
  const verdict = el('text', { x: 690, y: 40, 'text-anchor': 'end', 'font-size': 18, 'font-weight': 700, fill: '#e8eef7' }, svg);
  const detail = el('text', { x: 690, y: 62, 'text-anchor': 'end', 'font-size': 13, fill: '#8e9cb2' }, svg);
  el('text', { x: 20, y: 390, 'font-size': 11, fill: '#5d6a80' }, svg, 'To scale. Earth 12,742 km wide, the mountain 400 km tall (about where the Space Station flies).');

  const v = slider(root, { label: 'Launch speed', min: 1, max: 12, step: 0.1, value: 5, format: (x) => `${x.toFixed(1)} km/s` });
  const fire = button(v.row, 'Fire');
  const show = readouts(root, ['Speed', 'That’s', 'What happens']);
  let raf = 0;
  const likeness = (s) => s < 7.5 ? `${fmtNum(s * 3600)} km/h, Mach ${Math.round(s / 0.343)}` : s < 7.9 ? 'Space Station speed' : s < 10.6 ? 'faster than the Space Station' : 'about how fast Apollo left Earth for the Moon';
  const static_ = () => { show('Speed', `${v.value.toFixed(1)} km/s`); show('That’s', likeness(v.value)); };
  show('What happens', 'press Fire');
  const shoot = () => {
    cancelAnimationFrame(raf);
    if (trace.getAttribute('points')) { const g = trace.cloneNode(); ghosts.append(g); if (ghosts.children.length > 4) ghosts.firstChild.remove(); }
    let x = 0, y = RE + h, vx = v.value, vy = 0, t = 0, dist = 0;
    const pts = [];
    let last = performance.now(), done = false;
    const step = (dt) => { // velocity Verlet, small steps
      const r3 = Math.hypot(x, y) ** 3;
      const ax = (-GM * x) / r3, ay = (-GM * y) / r3;
      x += vx * dt + 0.5 * ax * dt * dt; y += vy * dt + 0.5 * ay * dt * dt;
      const r3b = Math.hypot(x, y) ** 3;
      vx += 0.5 * (ax + (-GM * x) / r3b) * dt; vy += 0.5 * (ay + (-GM * y) / r3b) * dt;
      t += dt;
    };
    const loop = (now) => {
      const real = Math.min(0.05, (now - last) / 1000);
      last = now;
      for (let n = 0; n < 60 && !done; n++) {
        const px = x, py = y;
        step((real * 1500) / 60); // 25 minutes of flight for each second you watch
        dist += Math.hypot(x - px, y - py);
        const r = Math.hypot(x, y);
        if (r < RE) { done = true; verdict.textContent = 'Crashed'; verdict.setAttribute('fill', '#ff7a66'); detail.textContent = `It came down ${fmtNum(RE * Math.abs(Math.atan2(x, y)))} km away, after ${Math.round(t / 60)} minutes.`; show('What happens', 'falls back to Earth'); }
        else if (r > 40000) { done = true; verdict.textContent = 'Escaped'; verdict.setAttribute('fill', '#c7b4ff'); detail.textContent = 'Too fast for Earth to pull back. Gone for good.'; show('What happens', 'leaves Earth behind'); }
        else if (t > 6 * 3600) { done = true; }
      }
      pts.push(`${(cx + x * k).toFixed(1)},${(cy - y * k).toFixed(1)}`);
      trace.setAttribute('points', pts.join(' '));
      ball.setAttribute('cx', cx + x * k); ball.setAttribute('cy', cy - y * k);
      const r = Math.hypot(x, y);
      if (!done || (r >= RE && r <= 40000)) {
        const E = (vx * vx + vy * vy) / 2 - GM / r;
        if (E < 0 && r > RE) {
          const aAx = -GM / (2 * E), period = TAU * Math.sqrt(aAx ** 3 / GM);
          const peri = aAx * 2 - (RE + h);
          if (peri > RE + 60) { verdict.textContent = 'In orbit!'; verdict.setAttribute('fill', '#7ee0a1'); detail.textContent = `It falls all the way round, every ${Math.round(period / 60)} minutes.`; show('What happens', 'falls round Earth for ever'); }
          else if (!done) { verdict.textContent = 'Falling…'; verdict.setAttribute('fill', '#e8eef7'); detail.textContent = `${fmtNum(dist)} km so far`; }
        }
      }
      if (!done) raf = requestAnimationFrame(loop);
    };
    verdict.textContent = ''; detail.textContent = ''; show('What happens', '…');
    raf = requestAnimationFrame(loop);
  };
  fire.addEventListener('click', shoot);
  v.input.addEventListener('input', static_);
  new IntersectionObserver(([e]) => { if (!e.isIntersecting) cancelAnimationFrame(raf); }).observe(root);
  static_();
}

// ================================================================ The Moon's hidden side: spinning at the wrong rate
function lockedSpin(root) {
  const svg = card(root, 'What if the Moon spun differently?', 'The orange spot marks one place on the Moon. Pick a spin, press play, and watch what Earth would see.', 720, 330);
  defs(svg);
  const cx = 190, cy = 165, R = 120;
  el('circle', { cx, cy, r: R, fill: 'none', stroke: 'rgba(156,184,222,0.25)', 'stroke-dasharray': '4 6' }, svg);
  el('circle', { cx, cy, r: 26, fill: 'url(#dg-earth)' }, svg);
  el('text', { x: cx, y: cy + 44, 'text-anchor': 'middle', 'font-size': 11, fill: '#8e9cb2' }, svg, 'Earth');
  const moon = el('g', {}, svg);
  el('circle', { r: 17, fill: 'url(#dg-moon)' }, moon);
  const spot = el('circle', { r: 5, fill: '#ffb547' }, moon);
  const sight = el('line', { x1: cx, y1: cy, stroke: 'rgba(147,214,255,0.45)', 'stroke-dasharray': '3 4' }, svg);
  // Earth's view
  const vx = 540, vy = 150;
  el('text', { x: vx, y: 24, 'text-anchor': 'middle', 'font-size': 13, fill: '#8e9cb2' }, svg, 'The Moon, seen from Earth');
  el('circle', { cx: vx, cy: vy, r: 96, fill: 'url(#dg-moon)' }, svg);
  for (const [x, y, r] of [[-30, -28, 22], [22, -40, 14], [10, 10, 26], [-38, 30, 12], [40, 34, 10]]) el('circle', { cx: vx + x, cy: vy + y, r, fill: 'rgba(80,78,72,0.28)' }, svg);
  const vspot = el('ellipse', { rx: 18, ry: 18, fill: '#ffb547' }, svg);
  const note = el('text', { x: vx, y: 278, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 700, fill: '#e8eef7' }, svg);
  const sub = el('text', { x: vx, y: 300, 'text-anchor': 'middle', 'font-size': 12.5, fill: '#8e9cb2' }, svg);
  const r1 = row(root);
  let spin = 1, theta = -Math.PI / 2;
  segmented(r1, [['0', 'No spin at all'], ['1', 'One spin per orbit (the real Moon)'], ['2', 'Two spins per orbit']], '1', (key) => { spin = Number(key); draw(); });
  const show = readouts(root, ['Days into the month', 'Spot faces', 'Over a month Earth sees']);
  const draw = () => {
    const mx = cx + R * Math.cos(theta), my = cy - R * Math.sin(theta);
    moon.setAttribute('transform', `translate(${mx.toFixed(1)} ${my.toFixed(1)})`);
    sight.setAttribute('x2', mx); sight.setAttribute('y2', my);
    // the spot starts pointing at Earth; it turns `spin` times for each orbit
    const t0 = -Math.PI / 2;
    const dir = t0 + Math.PI + spin * (theta - t0);
    spot.setAttribute('cx', (11 * Math.cos(dir)).toFixed(1)); spot.setAttribute('cy', (-11 * Math.sin(dir)).toFixed(1));
    const delta = dir - (theta + Math.PI); // the spot's angle away from the Earth-facing direction
    const c = Math.cos(delta), sn = Math.sin(delta);
    const front = c > 0;
    vspot.style.display = front ? '' : 'none';
    vspot.setAttribute('cx', (vx - 80 * sn).toFixed(1)); vspot.setAttribute('cy', vy);
    vspot.setAttribute('rx', (18 * Math.max(0.15, c)).toFixed(1));
    const days = (((theta - t0) / TAU) % 1 + 1) % 1 * 27.3;
    show('Days into the month', days.toFixed(1));
    show('Spot faces', c > 0.95 ? 'straight at Earth' : c > 0 ? 'mostly towards Earth' : c > -0.95 ? 'mostly away' : 'directly away');
    show('Over a month Earth sees', spin === 1 ? 'one face only' : 'every side');
    note.textContent = spin === 1 ? 'Same face, all month long' : front ? 'The spot drifts across…' : '…and round the back';
    sub.textContent = spin === 1 ? 'This is why there’s a far side we never see from here.' : spin === 0 ? 'With no spin, it would show us every side once a month.' : 'Spin twice as fast and the far side comes round too.';
  };
  player(r1, (dt) => { theta += dt * 0.9; draw(); });
  draw();
}

// ================================================================ Stars through the year: the zodiac ring
// The dates the Sun enters each constellation (IAU boundaries) and each astrological sign.
const ZODIAC = [
  ['Sagittarius', '12-18'], ['Capricornus', '01-20'], ['Aquarius', '02-16'], ['Pisces', '03-12'], ['Aries', '04-19'], ['Taurus', '05-14'],
  ['Gemini', '06-21'], ['Cancer', '07-20'], ['Leo', '08-10'], ['Virgo', '09-16'], ['Libra', '10-31'], ['Scorpius', '11-23'], ['Ophiuchus', '11-29'],
];
const SIGNS = [
  ['Capricorn', '12-22'], ['Aquarius', '01-20'], ['Pisces', '02-19'], ['Aries', '03-21'], ['Taurus', '04-20'], ['Gemini', '05-21'],
  ['Cancer', '06-21'], ['Leo', '07-23'], ['Virgo', '08-23'], ['Libra', '09-23'], ['Scorpio', '10-23'], ['Sagittarius', '11-22'],
];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const doy = (mmdd) => { const [m, d] = mmdd.split('-').map(Number); return Math.round((Date.UTC(2025, m - 1, d) - Date.UTC(2025, 0, 1)) / 864e5); };
const sunLon = (day) => ((day - 78.5) / 365.25) * TAU; // 0 at the March equinox
const inTable = (table, day) => {
  const sorted = table.map(([n, d]) => [n, doy(d)]).sort((a, b) => a[1] - b[1]);
  let cur = sorted.at(-1)[0];
  for (const [n, d] of sorted) if (day >= d) cur = n;
  return cur;
};

function zodiacRing(root) {
  const svg = card(root, 'The zodiac around Earth’s orbit', 'Drag through the year. The Sun hides one constellation in its glare; the opposite one is high at midnight.', 720, 400);
  defs(svg);
  const cx = 360, cy = 200, RO = 70, RZ = 170;
  // constellation sectors, at the Sun's longitude on the date it enters each one
  const starts = ZODIAC.map(([n, d]) => [n, doy(d)]).sort((a, b) => a[1] - b[1]);
  const sectors = starts.map(([n, d], i) => {
    const d2 = starts[(i + 1) % starts.length][1] + (i === starts.length - 1 ? 365 : 0);
    const a0 = sunLon(d), a1 = sunLon(d2), mid = (a0 + a1) / 2;
    const p = (a, r) => `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy - r * Math.sin(a)).toFixed(1)}`;
    const path = el('path', { d: `M${p(a0, RZ - 14)}L${p(a0, RZ + 14)}A${RZ + 14} ${RZ + 14} 0 0 0 ${p(a1, RZ + 14)}L${p(a1, RZ - 14)}A${RZ - 14} ${RZ - 14} 0 0 1 ${p(a0, RZ - 14)}Z`, fill: 'rgba(147,214,255,0.06)', stroke: 'rgba(147,214,255,0.25)' }, svg);
    const text = el('text', { x: cx + (RZ + 30) * Math.cos(mid), y: cy - (RZ + 30) * Math.sin(mid) + 4, 'text-anchor': 'middle', 'font-size': n === 'Ophiuchus' ? 10 : 11.5, fill: '#8e9cb2' }, svg, n);
    return { n, path, text };
  });
  el('circle', { cx, cy, r: RO, fill: 'none', stroke: 'rgba(107,155,255,0.45)', 'stroke-dasharray': '4 6' }, svg);
  el('circle', { cx, cy, r: 24, fill: 'url(#dg-sunglow)' }, svg);
  el('circle', { cx, cy, r: 11, fill: 'url(#dg-sun)' }, svg);
  const toSun = el('line', { stroke: 'rgba(255,207,110,0.7)', 'stroke-width': 2, 'stroke-dasharray': '3 4' }, svg);
  const toNight = el('line', { stroke: 'rgba(147,214,255,0.7)', 'stroke-width': 2, 'stroke-dasharray': '3 4' }, svg);
  const earth = el('g', {}, svg);
  sphere(earth, { r: 9, fill: 'url(#dg-earth)', dark: '#0d1830', theta: 0, alpha: Math.PI / 2 });
  const night = el('path', { fill: '#0b1426', opacity: 0.85 }, earth);
  const day = slider(root, { label: 'Date', min: 0, max: 364, step: 1, value: 354, format: (v) => { const d = new Date(Date.UTC(2025, 0, 1 + v)); return `${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`; } });
  const show = readouts(root, ['Hidden behind the Sun', 'High at midnight', 'Horoscope sign for today']);
  const draw = () => {
    const L = sunLon(day.value);
    const ea = L + Math.PI; // Earth is on the far side of the Sun from where the Sun appears
    const ex = cx + RO * Math.cos(ea), ey = cy - RO * Math.sin(ea);
    earth.setAttribute('transform', `translate(${ex.toFixed(1)} ${ey.toFixed(1)})`);
    night.setAttribute('d', `M${(9 * Math.cos(ea + Math.PI / 2)).toFixed(2)} ${(-9 * Math.sin(ea + Math.PI / 2)).toFixed(2)}A9 9 0 0 ${1} ${(9 * Math.cos(ea - Math.PI / 2)).toFixed(2)} ${(-9 * Math.sin(ea - Math.PI / 2)).toFixed(2)}Z`);
    toSun.setAttribute('x1', ex); toSun.setAttribute('y1', ey);
    toSun.setAttribute('x2', cx + (RZ - 16) * Math.cos(L)); toSun.setAttribute('y2', cy - (RZ - 16) * Math.sin(L));
    toNight.setAttribute('x1', ex); toNight.setAttribute('y1', ey);
    toNight.setAttribute('x2', cx + (RZ - 16) * Math.cos(ea)); toNight.setAttribute('y2', cy - (RZ - 16) * Math.sin(ea));
    const behind = inTable(ZODIAC, day.value);
    const mid = inTable(ZODIAC, (day.value + 182) % 365);
    for (const s of sectors) {
      const on = s.n === behind ? 'sun' : s.n === mid ? 'night' : '';
      s.path.setAttribute('fill', on === 'sun' ? 'rgba(255,207,110,0.22)' : on === 'night' ? 'rgba(147,214,255,0.22)' : 'rgba(147,214,255,0.06)');
      s.text.setAttribute('fill', on === 'sun' ? '#ffcf6e' : on === 'night' ? '#93d6ff' : '#8e9cb2');
      s.text.setAttribute('font-weight', on ? 700 : 400);
    }
    show('Hidden behind the Sun', behind);
    show('High at midnight', mid);
    const sign = inTable(SIGNS, day.value);
    show('Horoscope sign for today', sign === behind || (sign === 'Scorpio' && behind === 'Scorpius') || (sign === 'Capricorn' && behind === 'Capricornus') ? sign : `${sign} <small style="color:var(--bad);font:500 12px var(--font-body)">(the Sun is really in ${behind})</small>`);
  };
  day.input.addEventListener('input', draw);
  player(day.row, (dt) => { day.set((day.value + dt * 30) % 365); draw(); });
  draw();
}

// ================================================================ The life of a star
const STARS = {
  small: {
    label: 'Red dwarf', mass: '0.2 Suns', life: 'over a trillion years', end: 'Fades to a white dwarf, very slowly', remnant: 'White dwarf (eventually)', example: 'Proxima Centauri, the nearest star to the Sun',
    stages: [['Gas cloud', '#d06a9a', 34], ['Red dwarf', '#ff7a52', 10], ['White dwarf', '#dfe8ff', 5]], note: 'Red dwarfs burn so slowly that not one has run out yet. The universe isn’t old enough.',
  },
  sun: {
    label: 'Sun-like', mass: '1 Sun', life: 'about 10 billion years', end: 'Swells into a red giant, then puffs off its outer layers', remnant: 'White dwarf inside a planetary nebula', example: 'The Sun, 4.6 billion years in',
    stages: [['Gas cloud', '#d06a9a', 34], ['Yellow star', '#ffd36e', 14], ['Red giant', '#ff8a5c', 30], ['Planetary nebula', '#7fd6c8', 24], ['White dwarf', '#dfe8ff', 5]], note: 'The Ring Nebula and the Helix Nebula are what this looks like near the end. Our Sun has about 5 billion years to go.',
  },
  big: {
    label: 'Massive', mass: '10 Suns', life: 'about 20 million years', end: 'Becomes a red supergiant, then explodes as a supernova', remnant: 'Neutron star', example: 'Spica, in Virgo',
    stages: [['Gas cloud', '#d06a9a', 34], ['Blue-white star', '#bcd4ff', 20], ['Red supergiant', '#ff7a52', 38], ['Supernova', '#fff3c4', 32], ['Neutron star', '#93d6ff', 4]], note: 'The Crab Nebula is the wreck of one of these. Chinese astronomers watched it explode in the year 1054.',
  },
  huge: {
    label: 'Giant', mass: '25 Suns', life: 'about 7 million years', end: 'Collapses and explodes after a very short life', remnant: 'Black hole', example: 'Rigel, in Orion',
    stages: [['Gas cloud', '#d06a9a', 34], ['Blue giant', '#9fc0ff', 26], ['Supergiant', '#ff9a5c', 42], ['Supernova', '#fff3c4', 34], ['Black hole', '#000000', 9]], note: 'The bigger the star, the faster it burns. A star like this lives less than a thousandth as long as the Sun.',
  },
};

function starLife(root) {
  const svg = card(root, 'A star’s life depends on its weight', 'Pick how massive a star is at birth. Everything else, including how it ends, follows from that.', 720, 200);
  const r1 = row(root);
  const show = readouts(root, ['Lifetime', 'How it ends', 'Leaves behind', 'One you can see']);
  const note = document.createElement('p');
  note.className = 'dg-caption';
  root.append(note);
  const draw = (key) => {
    const s = STARS[key];
    svg.innerHTML = '';
    const n = s.stages.length, x0 = 60, x1 = 660;
    el('line', { x1: x0, y1: 90, x2: x1, y2: 90, stroke: 'rgba(156,184,222,0.25)', 'stroke-width': 2, 'stroke-dasharray': '3 6' }, svg);
    s.stages.forEach(([name, color, r], i) => {
      const x = n === 1 ? x0 : x0 + ((x1 - x0) * i) / (n - 1);
      if (name === 'Gas cloud') for (let j = 0; j < 7; j++) el('circle', { cx: x + Math.cos(j * 2.3) * 14, cy: 90 + Math.sin(j * 1.7) * 10, r: 14 + (j % 3) * 4, fill: color, opacity: 0.16 }, svg);
      else if (name === 'Planetary nebula') { el('circle', { cx: x, cy: 90, r, fill: 'none', stroke: color, 'stroke-width': 7, opacity: 0.7 }, svg); el('circle', { cx: x, cy: 90, r: 3, fill: '#fff' }, svg); }
      else if (name === 'Supernova') { for (let j = 0; j < 12; j++) el('line', { x1: x, y1: 90, x2: x + Math.cos((j * TAU) / 12) * r, y2: 90 + Math.sin((j * TAU) / 12) * r, stroke: color, 'stroke-width': 2.4, opacity: 0.8 }, svg); el('circle', { cx: x, cy: 90, r: r * 0.35, fill: color }, svg); }
      else if (name === 'Black hole') { el('circle', { cx: x, cy: 90, r: r + 6, fill: 'none', stroke: '#ffb547', 'stroke-width': 3, opacity: 0.7 }, svg); el('circle', { cx: x, cy: 90, r, fill: '#000', stroke: 'rgba(255,255,255,0.2)' }, svg); }
      else el('circle', { cx: x, cy: 90, r, fill: color, style: `filter: drop-shadow(0 0 ${Math.min(14, r / 2)}px ${color})` }, svg);
      el('text', { x, y: 158, 'text-anchor': 'middle', 'font-size': 12.5, 'font-weight': 600, fill: '#c9d3e1' }, svg, name);
      if (i < n - 1) el('text', { x: x + (x1 - x0) / (n - 1) / 2, y: 95, 'text-anchor': 'middle', 'font-size': 14, fill: '#5d6a80' }, svg, '›');
    });
    el('text', { x: 360, y: 190, 'text-anchor': 'middle', 'font-size': 11, fill: '#5d6a80' }, svg, `Born with ${s.mass}. Sizes not to scale: a red supergiant can be a billion times the volume of the Sun.`);
    show('Lifetime', s.life);
    show('How it ends', s.end);
    show('Leaves behind', s.remnant);
    show('One you can see', s.example);
    note.textContent = s.note;
  };
  segmented(r1, Object.entries(STARS).map(([k, s]) => [k, `${s.label} · ${s.mass}`]), 'sun', draw);
  draw('sun');
}

// ================================================================ Our galaxy and beyond: looking back in time
const YEAR_NOW = new Date().getFullYear();
const LOOK = [
  ['The Moon', 1.3 / 31557600, 'about a second ago. You were reading the line above.'],
  ['The Sun', 499 / 31557600, 'about 8 minutes ago. You may not have started this page.'],
  ['Neptune', 4.1 / 8766, 'about 4 hours ago, earlier today.'],
  ['Proxima Centauri', 4.24, `around ${YEAR_NOW - 4}.`],
  ['The Pleiades', 444, `around ${YEAR_NOW - 444}. Galileo was a teenager, and nobody had a telescope yet.`],
  ['The Orion Nebula', 1344, `around the year ${YEAR_NOW - 1344}. The Tang dynasty ruled China.`],
  ['The middle of the Milky Way', 26670, 'during the last Ice Age, when people painted caves and mammoths roamed Europe.'],
  ['The Large Magellanic Cloud', 163000, 'when our own species, Homo sapiens, was still young, in Africa.'],
  ['The Andromeda Galaxy', 2.537e6, 'when our ancestors were just starting to make stone tools.'],
  ['Messier 87', 53.5e6, 'about 12 million years after the dinosaurs died out.'],
  ['The most distant galaxies seen', 13.4e9, 'before the Sun and Earth existed. Our planet is only 4.5 billion years old.'],
];
const fmtYears = (y) => y < 1 / 365 ? (y * 8766 < 1 ? `${Math.round(y * 31557600)} seconds` : `${(y * 8766).toFixed(1)} hours`) : y < 1e3 ? `${fmtNum(y, y < 10 ? 1 : 0)} years` : y < 1e6 ? `${fmtNum(y)} years` : y < 1e9 ? `${fmtNum(y / 1e6, y < 1e7 ? 1 : 0)} million years` : `${fmtNum(y / 1e9, 1)} billion years`;

function lookback(root) {
  const svg = card(root, 'Every look is a look into the past', 'Light takes time to reach us. Slide outwards and see how old the light is, and what was happening on Earth when it set off.', 720, 150);
  const x0 = 40, x1 = 680, lo = Math.log10(1.3 / 31557600), hi = Math.log10(13.4e9);
  const X = (y) => x0 + ((Math.log10(y) - lo) / (hi - lo)) * (x1 - x0);
  el('line', { x1: x0, y1: 70, x2: x1, y2: 70, stroke: 'rgba(156,184,222,0.35)', 'stroke-width': 2 }, svg);
  const marks = LOOK.map(([n, y], i) => {
    const x = X(y);
    const dot = el('circle', { cx: x, cy: 70, r: 5, fill: '#8e9cb2' }, svg);
    const t = el('text', { x, y: i % 2 ? 100 : 50, 'text-anchor': 'middle', 'font-size': 10.5, fill: '#8e9cb2' }, svg, n.replace(/^The /, ''));
    return { dot, t };
  });
  el('text', { x: x0, y: 140, 'font-size': 11, fill: '#5d6a80' }, svg, 'Nearby');
  el('text', { x: x1, y: 140, 'text-anchor': 'end', 'font-size': 11, fill: '#5d6a80' }, svg, 'Far away (each step is 10 times further)');
  const cursor = el('line', { y1: 40, y2: 100, stroke: '#e9d7b0', 'stroke-width': 3 }, svg);
  const s = slider(root, { label: 'Looking at', min: 0, max: LOOK.length - 1, step: 1, value: 8, format: (v) => LOOK[v][0] });
  const show = readouts(root, ['Distance', 'The light you see left']);
  const note = document.createElement('p');
  note.className = 'dg-caption';
  note.style.fontSize = '16px';
  root.append(note);
  const draw = () => {
    const [n, y, then] = LOOK[s.value];
    cursor.setAttribute('x1', X(y)); cursor.setAttribute('x2', X(y));
    marks.forEach((m, i) => { const on = i === s.value; m.dot.setAttribute('fill', on ? '#e9d7b0' : '#8e9cb2'); m.dot.setAttribute('r', on ? 7 : 5); m.t.setAttribute('fill', on ? '#e9d7b0' : '#8e9cb2'); m.t.setAttribute('font-weight', on ? 700 : 400); });
    show('Distance', y < 1 / 365 ? `${fmtYears(y).replace('seconds', 'light-seconds').replace('hours', 'light-hours')}` : `${fmtYears(y).replace('years', 'light-years')}`);
    show('The light you see left', `${fmtYears(y)} ago`);
    note.innerHTML = `<b>${n}</b>: the light reaching you now set off ${then}`;
  };
  s.input.addEventListener('input', draw);
  draw();
}

export const DIAGRAMS = { newtonCannon, lockedSpin, zodiacRing, starLife, lookback };
