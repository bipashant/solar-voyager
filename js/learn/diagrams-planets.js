// Diagrams for A Tour of the Planets: sunlight with distance, the phases of Venus, a transfer orbit to Mars,
// Jupiter's moons from above and through a telescope, and the tilt of Saturn's rings over its year.
// Built from the same parts as diagrams.js. Not to scale unless noted.
import { el, card, slider, player, readouts, segmented, defs, sphere, DEG } from './diagrams.js';

const TAU = Math.PI * 2;
const AU_KM = 149597870.7;
const fmtNum = (v, d = 0) => v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
const row = (root) => { const r = document.createElement('div'); r.className = 'dg-row'; root.append(r); return r; };

// Kepler's equation for an ellipse: mean anomaly -> true anomaly and radius (in units of a).
function kepler(M, e) {
  let E = M;
  for (let k = 0; k < 8; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
  return { nu, r: 1 - e * Math.cos(E) };
}

// ================================================================ Our star: sunlight with distance
const WORLDS = [['Mercury', 0.387], ['Venus', 0.723], ['Earth', 1], ['Mars', 1.524], ['Jupiter', 5.203], ['Saturn', 9.537], ['Uranus', 19.19], ['Neptune', 30.07], ['Pluto', 39.5]];

function sunlight(root) {
  const svg = card(root, 'The Sun from further away', 'Move out from the Sun. Watch how big it looks, and how much light lands on one square metre.', 720, 300);
  defs(svg);
  // the sky, with the Sun at its true size relative to the view from Earth
  el('text', { x: 150, y: 24, 'text-anchor': 'middle', 'font-size': 13, fill: '#8e9cb2' }, svg, 'The Sun in your sky');
  el('circle', { cx: 150, cy: 158, r: 118, fill: '#05080f', stroke: 'rgba(147,214,255,0.2)' }, svg);
  el('circle', { cx: 150, cy: 158, r: 40, fill: 'none', stroke: 'rgba(147,214,255,0.45)', 'stroke-dasharray': '3 4' }, svg);
  el('text', { x: 150, y: 112, 'text-anchor': 'middle', 'font-size': 11, fill: '#5d8fb2' }, svg, 'from Earth');
  const glow = el('circle', { cx: 150, cy: 158, fill: 'url(#dg-sunglow)' }, svg);
  const disc = el('circle', { cx: 150, cy: 158, fill: 'url(#dg-sun)' }, svg);
  // one square metre of solar panel, lit as brightly as it would be there
  el('text', { x: 520, y: 24, 'text-anchor': 'middle', 'font-size': 13, fill: '#8e9cb2' }, svg, 'Sunlight on 1 m² of solar panel');
  el('rect', { x: 400, y: 50, width: 240, height: 170, rx: 10, fill: '#0b1120', stroke: 'rgba(156,184,222,0.25)' }, svg);
  const panel = el('rect', { x: 400, y: 50, width: 240, height: 170, rx: 10, fill: '#ffcf6e' }, svg);
  for (let k = 1; k < 4; k++) el('line', { x1: 400 + k * 60, y1: 50, x2: 400 + k * 60, y2: 220, stroke: 'rgba(5,8,15,0.35)', 'stroke-width': 2 }, svg);
  for (let k = 1; k < 3; k++) el('line', { x1: 400, y1: 50 + k * 56.7, x2: 640, y2: 50 + k * 56.7, stroke: 'rgba(5,8,15,0.35)', 'stroke-width': 2 }, svg);
  const watts = el('text', { x: 520, y: 256, 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 700, fill: '#ffcf6e' }, svg);
  const vs = el('text', { x: 520, y: 280, 'text-anchor': 'middle', 'font-size': 12.5, fill: '#8e9cb2' }, svg);

  const d = slider(root, { label: 'Distance from the Sun', min: -0.524, max: 1.654, step: 0.002, value: 0, format: (v) => `${(10 ** v).toFixed(10 ** v < 2 ? 2 : 1)} AU` });
  const jump = row(root);
  segmented(jump, WORLDS.map(([n]) => [n, n]), 'Earth', (k) => { d.set(Math.log10(WORLDS.find(([n]) => n === k)[1])); draw(); });
  const show = readouts(root, ['Sun looks', 'Sunlight', 'Light takes']);
  const draw = () => {
    const au = 10 ** d.value;
    const r = 40 / au;
    disc.setAttribute('r', Math.max(1.2, Math.min(r, 116)).toFixed(2));
    glow.setAttribute('r', Math.max(10, Math.min(r * 2.6, 118)).toFixed(1));
    const f = 1 / (au * au);
    panel.setAttribute('opacity', Math.max(0.015, Math.min(1, f ** 0.45)).toFixed(3)); // eyes see brightness on a curve, so this is gentler than the numbers
    const w = 1361 * f;
    watts.textContent = `${w < 10 ? w.toFixed(1) : fmtNum(w)} watts`;
    vs.textContent = au < 0.98 ? `${f.toFixed(1)} times what Earth gets` : au < 1.02 ? 'what Earth gets (above the air)' : `1/${fmtNum(1 / f)} of what Earth gets`;
    const deg = (2 * Math.atan(695700 / (au * AU_KM))) / DEG;
    show('Sun looks', deg > 0.1 ? `${deg.toFixed(2)}° wide` : `${(deg * 60).toFixed(1)} arcmin wide`);
    show('Sunlight', `${(f * 100).toFixed(f < 0.1 ? 2 : f < 1 ? 1 : 0)}% of Earth’s`);
    const s = au * 499.005;
    show('Light takes', s < 3600 ? `${(s / 60).toFixed(1)} min` : `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`);
    for (const b of jump.querySelectorAll('button')) b.setAttribute('aria-pressed', String(Math.abs(Math.log10(WORLDS.find(([n]) => n === b.dataset.k)[1]) - d.value) < 0.004));
  };
  d.input.addEventListener('input', draw);
  draw();
}

// ================================================================ Mercury and Venus: the phases of Venus
function venusPhases(root) {
  const svg = card(root, 'Venus and Earth, from above', 'Press play or drag the slider through one 584-day lap. Watch how big Venus looks, and how much of its lit side faces us.', 720, 340);
  defs(svg);
  const cx = 190, cy = 170, RE = 130, RV = RE * 0.723;
  el('circle', { cx, cy, r: RE, fill: 'none', stroke: 'rgba(107,155,255,0.4)', 'stroke-dasharray': '4 6' }, svg);
  el('circle', { cx, cy, r: RV, fill: 'none', stroke: 'rgba(232,207,154,0.45)', 'stroke-dasharray': '4 6' }, svg);
  el('circle', { cx, cy, r: 30, fill: 'url(#dg-sunglow)' }, svg);
  el('circle', { cx, cy, r: 13, fill: 'url(#dg-sun)' }, svg);
  const sight = el('line', { stroke: 'rgba(147,214,255,0.55)', 'stroke-width': 1.5, 'stroke-dasharray': '4 4' }, svg);
  const toSun = el('line', { stroke: 'rgba(255,207,110,0.35)', 'stroke-width': 1.2 }, svg);
  const earth = el('circle', { r: 8, fill: 'url(#dg-earth)' }, svg);
  const venusG = el('g', {}, svg);
  const venus = sphere(venusG, { r: 8, fill: '#f1dcaa', theta: 0, alpha: Math.PI / 2 });
  const eLabel = el('text', { 'font-size': 11, fill: '#8e9cb2', 'text-anchor': 'middle' }, svg, 'Earth');
  const vLabel = el('text', { 'font-size': 11, fill: '#d9c08a', 'text-anchor': 'middle' }, svg, 'Venus');
  // through the telescope
  const view = el('g', { transform: 'translate(560 160)' }, svg);
  el('text', { x: 0, y: -132, 'text-anchor': 'middle', 'font-size': 13, fill: '#8e9cb2' }, view, 'Through a small telescope');
  el('circle', { r: 118, fill: '#05080f', stroke: 'rgba(147,214,255,0.2)' }, view);
  const seenG = el('g', {}, view);
  const name = el('text', { x: 0, y: 146, 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 700, fill: '#e8eef7' }, view);
  let seen = null, seenR = 0;

  const t = slider(root, { label: 'Days since Venus was behind the Sun', min: 0, max: 584, step: 1, value: 220, format: (v) => `day ${v}` });
  const show = readouts(root, ['Distance from Earth', 'Lit side facing us', 'Looks', 'In the sky']);
  const draw = () => {
    const days = t.value;
    const aE = (TAU * days) / 365.256 - Math.PI / 2; // start with Earth at the bottom
    const aV = aE + Math.PI + TAU * days * (1 / 224.701 - 1 / 365.256);
    const ex = Math.cos(aE), ey = Math.sin(aE), vx = 0.723 * Math.cos(aV), vy = 0.723 * Math.sin(aV);
    // (north up, so the planets go round anticlockwise; screen y runs down)
    earth.setAttribute('cx', cx + ex * RE); earth.setAttribute('cy', cy - ey * RE);
    venusG.setAttribute('transform', `translate(${cx + vx * RE} ${cy - vy * RE})`);
    eLabel.setAttribute('x', cx + ex * (RE + 20)); eLabel.setAttribute('y', cy - ey * (RE + 20) + 4);
    vLabel.setAttribute('x', cx + vx * (RV - 22)); vLabel.setAttribute('y', cy - vy * (RV - 22) + 4);
    sight.setAttribute('x1', cx + ex * RE); sight.setAttribute('y1', cy - ey * RE); sight.setAttribute('x2', cx + vx * RE); sight.setAttribute('y2', cy - vy * RE);
    toSun.setAttribute('x1', cx + ex * RE); toSun.setAttribute('y1', cy - ey * RE); toSun.setAttribute('x2', cx); toSun.setAttribute('y2', cy);
    // in the top view Venus is always lit on the Sun's side
    venus.update(Math.atan2(vy, -vx), Math.PI / 2);
    // seen from Earth: phase angle at Venus between the Sun and Earth, and the size from the distance
    const dx = ex - vx, dy = ey - vy, dist = Math.hypot(dx, dy);
    const alpha = Math.acos(Math.max(-1, Math.min(1, (-vx * dx - vy * dy) / (0.723 * dist))));
    const arcsec = (206265 * 12104) / (dist * AU_KM);
    // east of the Sun (evening) when Venus is anticlockwise of the Sun as seen from Earth
    const cross = (-ex) * (vy - ey) - (-ey) * (vx - ex);
    const evening = cross > 0;
    const r = Math.max(4, arcsec * 1.7);
    if (!seen || Math.abs(r - seenR) > 0.4) { seenG.innerHTML = ''; seen = sphere(seenG, { r, fill: '#f1dcaa', dark: '#0d1018', theta: 0, alpha }); seenR = r; }
    seen.update(evening ? 0 : Math.PI, alpha);
    const lit = (1 + Math.cos(alpha)) / 2;
    const phase = lit > 0.97 ? 'Almost full' : lit > 0.55 ? 'Gibbous' : lit > 0.45 ? 'Half lit' : lit > 0.03 ? 'Crescent' : 'Lost in the Sun’s glare';
    name.textContent = phase;
    show('Distance from Earth', `${fmtNum(dist * AU_KM / 1e6)} million km`);
    show('Lit side facing us', `${Math.round(lit * 100)}%`);
    show('Looks', `${arcsec.toFixed(0)} arcsec wide`);
    const elong = Math.acos(Math.max(-1, Math.min(1, (-ex * -dx + -ey * -dy) / dist))) / DEG;
    show('In the sky', elong < 8 ? 'Too close to the Sun' : evening ? 'Evening star, after sunset' : 'Morning star, before dawn');
  };
  t.input.addEventListener('input', draw);
  player(t.row, (dt) => { t.set((t.value + dt * 40) % 584); draw(); });
  draw();
}

// ================================================================ Mars: a transfer orbit
function marsTransfer(root) {
  const svg = card(root, 'Launch to Mars', 'Pick how far ahead of Earth Mars should be when you launch, then press Launch. The rocket coasts for 259 days.', 720, 360);
  defs(svg);
  const cx = 250, cy = 180, k = 105; // px per AU
  const R1 = 1, R2 = 1.524, a = (R1 + R2) / 2, e = (R2 - R1) / (R2 + R1);
  const T = 365.256 * a ** 1.5, HALF = T / 2;
  el('circle', { cx, cy, r: R1 * k, fill: 'none', stroke: 'rgba(107,155,255,0.4)', 'stroke-dasharray': '4 6' }, svg);
  el('circle', { cx, cy, r: R2 * k, fill: 'none', stroke: 'rgba(217,119,75,0.45)', 'stroke-dasharray': '4 6' }, svg);
  el('circle', { cx, cy, r: 30, fill: 'url(#dg-sunglow)' }, svg);
  el('circle', { cx, cy, r: 12, fill: 'url(#dg-sun)' }, svg);
  // the transfer orbit: perihelion at Earth's launch spot (to the right), aphelion at Mars's orbit (to the left)
  const pts = [];
  for (let j = 0; j <= 60; j++) { const nu = (Math.PI * j) / 60; const r = (a * (1 - e * e)) / (1 + e * Math.cos(nu)); pts.push(`${(cx + r * k * Math.cos(nu)).toFixed(1)},${(cy - r * k * Math.sin(nu)).toFixed(1)}`); }
  el('polyline', { points: pts.join(' '), fill: 'none', stroke: 'rgba(126,224,161,0.55)', 'stroke-width': 2, 'stroke-dasharray': '2 5' }, svg);
  const marsStart = el('circle', { r: 6, fill: 'none', stroke: 'rgba(217,119,75,0.6)', 'stroke-dasharray': '2 2' }, svg);
  const wedge = el('path', { fill: 'rgba(217,119,75,0.12)', stroke: 'none' }, svg);
  const earth = el('circle', { r: 7, fill: 'url(#dg-earth)' }, svg);
  const mars = el('circle', { r: 6, fill: '#d9774b' }, svg);
  const ship = el('circle', { r: 4.5, fill: '#7ee0a1' }, svg);
  const trail = el('polyline', { fill: 'none', stroke: '#7ee0a1', 'stroke-width': 2.5 }, svg);
  const verdict = el('text', { x: 500, y: 150, 'font-size': 20, 'font-weight': 700, fill: '#e8eef7' }, svg);
  const detail = el('text', { x: 500, y: 176, 'font-size': 13, fill: '#8e9cb2' }, svg);
  const detail2 = el('text', { x: 500, y: 194, 'font-size': 13, fill: '#8e9cb2' }, svg);
  el('text', { x: cx, y: 350, 'text-anchor': 'middle', 'font-size': 11, fill: '#5d6a80' }, svg, 'Orbits drawn as circles. Distances to scale; planets enlarged.');

  const lead = slider(root, { label: 'Mars ahead of Earth at launch', min: 0, max: 100, step: 1, value: 20, format: (v) => `${v}°` });
  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'qz-next';
  go.style.marginTop = '0';
  go.textContent = 'Launch';
  lead.row.append(go);
  const show = readouts(root, ['Trip time', 'Rocket travels', 'At arrival, Mars is']);
  let day = 0, flying = false, raf = 0, last = 0, path = [];
  const at = (ang, r) => [cx + r * k * Math.cos(ang), cy - r * k * Math.sin(ang)];
  const draw = () => {
    const phi = lead.value * DEG;
    const ms = at(phi, R2);
    marsStart.setAttribute('cx', ms[0]); marsStart.setAttribute('cy', ms[1]);
    const [x1, y1] = at(0, R2);
    wedge.setAttribute('d', `M${cx} ${cy}L${x1} ${y1}A${R2 * k} ${R2 * k} 0 0 0 ${ms[0]} ${ms[1]}Z`);
    const E = at((TAU * day) / 365.256, R1), M = at(phi + (TAU * day) / 686.98, R2);
    earth.setAttribute('cx', E[0]); earth.setAttribute('cy', E[1]);
    mars.setAttribute('cx', M[0]); mars.setAttribute('cy', M[1]);
    const { nu, r } = kepler((TAU * Math.min(day, HALF)) / T, e);
    const S = at(nu, a * r);
    ship.setAttribute('cx', S[0]); ship.setAttribute('cy', S[1]);
    ship.style.display = day > 0 ? '' : 'none';
    trail.setAttribute('points', path.map((p) => p.join(',')).join(' '));
    show('Trip time', `${Math.round(HALF)} days`);
    show('Rocket travels', 'about 590 million km');
    if (day >= HALF) {
      const miss = phi + (TAU * HALF) / 686.98 - Math.PI; // how far Mars is from the meeting point (radians)
      const km = 2 * R2 * Math.abs(Math.sin(miss / 2)) * AU_KM;
      const hit = km < 6e6;
      verdict.textContent = hit ? 'You reached Mars!' : 'Missed it.';
      verdict.setAttribute('fill', hit ? '#7ee0a1' : '#ff7a66');
      detail.textContent = hit ? 'Mars arrived at the same spot as you.' : miss > 0 ? 'Mars got there before you and moved on.' : 'Mars hadn’t got there yet.';
      detail2.textContent = hit ? 'That’s why launches wait for this lineup.' : `It was ${fmtNum(km / 1e6)} million km away.`;
      show('At arrival, Mars is', hit ? 'right there' : `${fmtNum(km / 1e6)} million km off`);
    } else {
      verdict.textContent = day > 0 ? `Day ${Math.round(day)}` : '';
      verdict.setAttribute('fill', '#e8eef7');
      detail.textContent = day > 0 ? 'Coasting. No engine needed.' : '';
      detail2.textContent = '';
      show('At arrival, Mars is', '…');
    }
  };
  const stop = () => { flying = false; cancelAnimationFrame(raf); go.textContent = 'Launch again'; };
  go.addEventListener('click', () => {
    day = 0; path = []; flying = true; go.textContent = 'Flying…';
    last = performance.now();
    const loop = (now) => {
      if (!flying) return;
      day = Math.min(HALF, day + ((now - last) / 1000) * 70);
      last = now;
      const { nu, r } = kepler((TAU * day) / T, e);
      path.push(at(nu, a * r));
      draw();
      if (day >= HALF) { stop(); return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  });
  lead.input.addEventListener('input', () => { if (flying) stop(); day = 0; path = []; go.textContent = 'Launch'; draw(); });
  draw();
}

// ================================================================ Jupiter: the moons from above and from Earth
const GALILEAN = [['Io', 5.9, 1.769, '#e8c25a', 1.1], ['Europa', 9.4, 3.551, '#c9b79c', 3.0], ['Ganymede', 15.0, 7.155, '#a59a8a', 4.6], ['Callisto', 26.3, 16.689, '#7c7368', 0.4]];

function galileoMoons(root) {
  const svg = card(root, 'Jupiter’s moons, two ways', 'Top: from above. Bottom: from Earth, the way Galileo saw them, as dots in a line. Drag through the nights.', 720, 400);
  defs(svg);
  const cx = 360, cy = 128, s = 4.1; // px per Jupiter radius
  const RJ = 1;
  for (const [, r] of GALILEAN) el('circle', { cx, cy, r: r * s, fill: 'none', stroke: 'rgba(156,184,222,0.18)', 'stroke-dasharray': '3 5' }, svg);
  el('circle', { cx, cy, r: RJ * s * 2.2, fill: '#d8b48c' }, svg); // Jupiter drawn a little big so it shows
  el('text', { x: cx, y: 250, 'text-anchor': 'middle', 'font-size': 11, fill: '#5d8fb2' }, svg, '▼ Earth is this way, far off the bottom');
  const tops = GALILEAN.map(([n, , , c]) => ({ dot: el('circle', { r: 5, fill: c }, svg), text: el('text', { 'font-size': 11, fill: '#8e9cb2', 'text-anchor': 'middle' }, svg, n) }));
  // the telescope strip
  el('rect', { x: 20, y: 280, width: 680, height: 74, rx: 37, fill: '#05080f', stroke: 'rgba(147,214,255,0.2)' }, svg);
  el('text', { x: 360, y: 274, 'text-anchor': 'middle', 'font-size': 12, fill: '#8e9cb2' }, svg, 'Through the telescope');
  const sx = 12.4; // px per Jupiter radius in the strip
  el('circle', { cx, cy: 317, r: sx, fill: '#d8b48c' }, svg);
  const strip = GALILEAN.map(([, , , c]) => el('circle', { r: 3.4, fill: c }, svg));
  const stripText = GALILEAN.map(([n]) => el('text', { 'font-size': 10.5, fill: '#8e9cb2', 'text-anchor': 'middle' }, svg, n[0]));
  const note = el('text', { x: 360, y: 384, 'text-anchor': 'middle', 'font-size': 12.5, fill: '#c9d3e1' }, svg);
  const t = slider(root, { label: 'Time', min: 0, max: 30, step: 0.05, value: 0, format: (v) => `night ${Math.floor(v) + 1}, ${String(Math.round((v % 1) * 24) % 24).padStart(2, '0')}:00` });
  const draw = () => {
    const hidden = [], front = [];
    GALILEAN.forEach(([n, r, P, , a0], i) => {
      const a = a0 + (TAU * t.value) / P;
      const x = r * Math.cos(a), z = r * Math.sin(a); // z > 0: beyond Jupiter, away from Earth
      tops[i].dot.setAttribute('cx', cx + x * s); tops[i].dot.setAttribute('cy', cy - z * s);
      tops[i].text.setAttribute('x', cx + x * s); tops[i].text.setAttribute('y', cy - z * s - 9);
      const behind = z > 0 && Math.abs(x) < 1;
      strip[i].setAttribute('cx', cx + x * sx); strip[i].setAttribute('cy', 317);
      strip[i].style.display = behind ? 'none' : '';
      stripText[i].setAttribute('x', cx + x * sx); stripText[i].setAttribute('y', 340);
      stripText[i].style.display = behind ? 'none' : '';
      if (behind) hidden.push(n); else if (z < 0 && Math.abs(x) < 1) front.push(n);
    });
    const left = 4 - hidden.length;
    note.textContent = hidden.length ? `${hidden.join(' and ')} ${hidden.length > 1 ? 'are' : 'is'} hidden behind Jupiter, so you’d only count ${left}.` : front.length ? `${front.join(' and ')} ${front.length > 1 ? 'are' : 'is'} crossing in front of Jupiter.` : 'All four moons in view.';
  };
  t.input.addEventListener('input', draw);
  player(t.row, (dt) => { t.set((t.value + dt * 0.5) % 30); draw(); });
  draw();
}

// ================================================================ Rings and sideways worlds: Saturn's ring tilt
// Saturn's heliocentric longitude from a simple ellipse (perihelion Nov 2032), and the ring tilt seen from
// the Sun: the rings are edge-on when Saturn crosses longitude 353.6° (2025) or 173.6° (2009, 2038).
function saturnLon(year) {
  const { nu } = kepler((TAU * (year - 2032.91)) / 29.457, 0.0565);
  return nu + 92.43 * DEG;
}

function ringTilt(root) {
  const svg = card(root, 'Saturn’s rings over its 29-year year', 'The rings stay tilted the same way in space. As Saturn goes round the Sun, we see them from above, edge-on, then from below.', 720, 330);
  defs(svg);
  const cx = 170, cy = 165, R = 120;
  el('circle', { cx, cy, r: R, fill: 'none', stroke: 'rgba(227,207,156,0.4)', 'stroke-dasharray': '4 6' }, svg);
  el('circle', { cx, cy, r: 9, fill: 'none', stroke: 'rgba(107,155,255,0.6)' }, svg); // Earth's orbit, tiny at this scale
  el('circle', { cx, cy, r: 5, fill: 'url(#dg-sun)' }, svg);
  el('text', { x: cx, y: cy + 24, 'text-anchor': 'middle', 'font-size': 10.5, fill: '#8e9cb2' }, svg, 'Sun and Earth');
  for (const [yr, lab] of [[2009.6, '2009 and 2038'], [2025.35, '2025']]) { // 2038 lands where 2009 did, one Saturn year on
    const L = saturnLon(yr);
    el('circle', { cx: cx + R * Math.cos(L), cy: cy - R * Math.sin(L), r: 3, fill: '#ff7a66' }, svg);
    el('text', { x: cx + (R - 44) * Math.cos(L), y: cy - (R - 44) * Math.sin(L) + 4, 'text-anchor': 'middle', 'font-size': 10.5, fill: '#ff9d8c' }, svg, lab); // inside the orbit, clear of the card's edge
  }
  el('text', { x: cx, y: 316, 'text-anchor': 'middle', 'font-size': 11, fill: '#5d6a80' }, svg, 'Red dots: rings edge-on from Earth');
  const sat = el('g', {}, svg);
  el('ellipse', { rx: 13, ry: 4, fill: 'none', stroke: '#e3cf9c', 'stroke-width': 2, transform: 'rotate(-28)' }, sat);
  el('circle', { r: 6, fill: '#e3cf9c' }, sat);
  // Saturn seen from Earth
  const vx = 520, vy = 160;
  el('text', { x: vx, y: 26, 'text-anchor': 'middle', 'font-size': 13, fill: '#8e9cb2' }, svg, 'Saturn from Earth');
  const back = el('path', { fill: 'none', stroke: '#d9c595', 'stroke-width': 16, opacity: 0.85 }, svg);
  el('circle', { cx: vx, cy: vy, r: 52, fill: '#e3cf9c' }, svg);
  el('ellipse', { cx: vx, cy: vy - 18, rx: 50, ry: 7, fill: 'rgba(180,150,100,0.35)' }, svg);
  el('ellipse', { cx: vx, cy: vy + 16, rx: 50, ry: 6, fill: 'rgba(180,150,100,0.3)' }, svg);
  const front = el('path', { fill: 'none', stroke: '#efdcb0', 'stroke-width': 16, opacity: 0.95 }, svg);
  const label = el('text', { x: vx, y: 290, 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 700, fill: '#e8eef7' }, svg);
  const y = slider(root, { label: 'Year', min: 2010, max: 2040, step: 0.05, value: 2017.8, format: (v) => String(Math.floor(v)) });
  const show = readouts(root, ['Ring tilt towards us', 'We see', 'Next edge-on']);
  const ringArc = (B, near) => {
    const rx = 118, ry = Math.max(0.5, rx * Math.abs(Math.sin(B * DEG)));
    // the near half of the rings hangs below the planet when we look from above (B > 0)
    const lower = B >= 0 ? near : !near;
    return `M${vx - rx} ${vy}A${rx} ${ry} 0 0 ${lower ? 0 : 1} ${vx + rx} ${vy}`;
  };
  const draw = () => {
    const L = saturnLon(y.value);
    sat.setAttribute('transform', `translate(${cx + R * Math.cos(L)} ${cy - R * Math.sin(L)})`);
    const B = -Math.asin(Math.sin(26.73 * DEG) * Math.sin(L - 353.6 * DEG)) / DEG;
    back.setAttribute('d', ringArc(B, false));
    front.setAttribute('d', ringArc(B, true));
    const w = (2 + 14 * Math.abs(Math.sin(B * DEG)) / Math.sin(26.73 * DEG)).toFixed(1); // edge-on, the rings are a hairline
    back.setAttribute('stroke-width', w); front.setAttribute('stroke-width', w);
    const flat = Math.abs(B) < 1.2;
    label.textContent = flat ? 'Edge-on: the rings almost vanish' : B > 0 ? 'Looking down on the north side' : 'Looking up at the south side';
    show('Ring tilt towards us', `${Math.abs(B).toFixed(1)}°`);
    show('We see', flat ? 'a thin line' : B > 0 ? 'the north face' : 'the south face');
    show('Next edge-on', y.value < 2025.2 ? 'March 2025' : y.value < 2038.8 ? 'around 2039' : 'around 2054');
  };
  y.input.addEventListener('input', draw);
  player(y.row, (dt) => { y.set(y.value + dt * 1.5 > 2040 ? 2010 : y.value + dt * 1.5); draw(); });
  draw();
}

export const DIAGRAMS = { sunlight, venusPhases, marsTransfer, galileoMoons, ringTilt };
