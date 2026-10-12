// Poster studio: "the solar system on the day you were born". Planets sit at their real heliocentric
// directions for the chosen date and are rendered by the 3D engine itself, lit from the Sun; orbits are
// evenly spaced and sizes compressed so everything fits on one sheet.
import { jdFromMs, AU_KM, C_KMS, raDecToScene } from './ephemeris.js';
import { fmtDuration } from './format.js';
import { STARS } from './stars.js';
import { bvToColor } from './sky.js';

const PLANETS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];

// Where the 13 constellations of the ecliptic begin, by ecliptic longitude (J2000, IAU boundaries).
const ZODIAC = [
  ['Pisces', 351.6], ['Aries', 29.1], ['Taurus', 53.5], ['Gemini', 90.4], ['Cancer', 118.2], ['Leo', 138.1],
  ['Virgo', 174.0], ['Libra', 218.0], ['Scorpius', 241.0], ['Ophiuchus', 248.0], ['Sagittarius', 266.3],
  ['Capricornus', 299.7], ['Aquarius', 327.6],
];

// Deep-sky objects worth a label (J2000 RA, Dec in degrees).
const DEEP_SKY = [
  ['Large Magellanic Cloud', 80.89, -69.76], ['Small Magellanic Cloud', 13.19, -72.83],
  ['Galactic Centre', 266.42, -29.01], ['Orion Nebula', 83.82, -5.39], ['Carina Nebula', 161.26, -59.87],
  ['Omega Centauri', 201.70, -47.48], ['Andromeda Galaxy', 10.68, 41.27],
];

// Ecliptic longitude and latitude (radians) of a catalogue direction.
function toEcliptic(raDeg, decDeg) {
  const v = raDecToScene(raDeg, decDeg);
  return { lam: Math.atan2(-v.z, v.x), beta: Math.asin(Math.max(-1, Math.min(1, v.y))) };
}
let skyCatalogue = null;
function catalogue() {
  if (!skyCatalogue) {
    skyCatalogue = {
      stars: STARS.map((st) => ({ ...toEcliptic(st.ra, st.dec), mag: st.mag, color: bvToColor(st.bv) })),
      dso: DEEP_SKY.map(([name, ra, dec]) => ({ name, ...toEcliptic(ra, dec) })),
    };
  }
  return skyCatalogue;
}

// The Milky Way panorama as raw pixels (at most 4096 wide), read once from the loaded sky texture.
let milkyCache = null;
function milkyPixels(app) {
  const img = app.sky.milkyMat.uniforms.uMilky.value?.image;
  if (!img || !(img.width > 64)) return null;
  if (milkyCache && milkyCache.src === img) return milkyCache;
  const w = Math.min(4096, img.width), h = Math.round((w * img.height) / img.width);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, w, h);
  milkyCache = { src: img, w, h, data: x.getImageData(0, 0, w, h).data };
  return milkyCache;
}

export const SIZES = [
  { id: 'print18', label: 'Print · 18 × 24 in (300 dpi)', w: 5400, h: 7200 },
  { id: 'print12', label: 'Print · 12 × 16 in (300 dpi)', w: 3600, h: 4800 },
  { id: 'a3', label: 'Print · A3-ish 3:4 (2480 × 3307)', w: 2480, h: 3307 },
  { id: 'social', label: 'Instagram post · 1080 × 1350', w: 1080, h: 1350 },
  { id: 'phone', label: 'Phone wallpaper · 1290 × 2796', w: 1290, h: 2796 },
];

const THEMES = {
  midnight: {
    bg0: '#0d1730', bg1: '#03050b', ink: '#e9eef7', dim: 'rgba(214,224,240,0.62)', faint: 'rgba(190,205,230,0.22)',
    accent: '#ffb547', star: 'rgba(235,240,255,ALPHA)', night: 'rgba(2,4,10,0.92)', sunGlow: 'rgba(255,190,90,',
    halo: 'rgba(6,10,20,0.85)',
  },
  ivory: {
    bg0: '#f7f1e5', bg1: '#ece2cf', ink: '#1f2533', dim: 'rgba(31,37,51,0.66)', faint: 'rgba(31,37,51,0.2)',
    accent: '#a8741d', star: 'rgba(60,52,40,ALPHA)', night: 'rgba(24,28,40,0.9)', sunGlow: 'rgba(214,150,40,',
    halo: 'rgba(244,237,224,0.9)',
  },
};

// Seeded random, so a date always gets the same starfield.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const eclLon = (p) => ((Math.atan2(-p.z, p.x) * 180) / Math.PI + 360) % 360;

function moonPhase(sys) {
  const sun = sys.byId.sun.pos, earth = sys.byId.earth.pos, moon = sys.byId.moon.pos;
  const toSun = sun.clone().sub(moon).normalize(), toEarth = earth.clone().sub(moon).normalize();
  const lit = (1 + toSun.dot(toEarth)) / 2;
  const elong = (eclLon(moon.clone().sub(earth)) - eclLon(sun.clone().sub(earth)) + 360) % 360;
  const waxing = elong < 180;
  let name;
  if (lit < 0.03) name = 'New Moon';
  else if (lit > 0.97) name = 'Full Moon';
  else if (Math.abs(lit - 0.5) < 0.06) name = waxing ? 'First quarter' : 'Last quarter';
  else name = `${waxing ? 'Waxing' : 'Waning'} ${lit < 0.5 ? 'crescent' : 'gibbous'}`;
  return { lit, name };
}

// Everything the poster needs for one date: real positions, the Moon's phase and a few facts.
export function computeSky(app, ms) {
  const sys = app.system;
  const jd = jdFromMs(ms);
  sys.update(jd);
  const planets = PLANETS.map((id) => {
    const b = sys.byId[id];
    return { id, name: b.name, radius: b.radius, lon: eclLon(b.pos), color: b.data.color };
  });
  const earthSun = sys.byId.earth.pos.length();
  return {
    ms, jd, planets, earthSun, moon: moonPhase(sys),
    milky: milkyPixels(app), gal: app.sky.milkyMat.uniforms.uGal.value.elements,
  };
}

function arcText(ctx, text, cx, cy, r, centreAngle, spacing) {
  // text centred on centreAngle (radians, maths convention), reading clockwise along the top half
  // and counter-clockwise along the bottom so it is never upside down
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width + spacing);
  const total = widths.reduce((a, b) => a + b, 0) - spacing;
  const bottom = Math.sin(centreAngle) < -0.05;
  const dir = bottom ? 1 : -1;
  let a = centreAngle - (dir * total) / 2 / r;
  for (let i = 0; i < chars.length; i++) {
    const w = widths[i];
    const mid = a + (dir * (w - spacing)) / 2 / r;
    ctx.save();
    ctx.translate(cx + r * Math.cos(mid), cy - r * Math.sin(mid));
    ctx.rotate(-mid + (bottom ? -Math.PI / 2 : Math.PI / 2));
    ctx.fillText(chars[i], 0, 0);
    ctx.restore();
    a += (dir * w) / r;
  }
}

function fitText(ctx, text, font, size, maxW) {
  let s = size;
  ctx.font = font(s);
  while (s > 6 && ctx.measureText(text).width > maxW) { s *= 0.94; ctx.font = font(s); }
  return s;
}

// Where the header, chart and footer go; shared by every layer so they line up.
function layout(W, H, opts) {
  const u = W / 100, margin = 7 * u;
  let y = margin + 2.2 * u;
  if (opts.name) y += 8.6 * u + 1.5 * u;
  y += 4.2 * u;
  const chartTop = y + 3 * u;
  const factsH = 13 * u, msgH = opts.message ? 7 * u : 0, footH = 5 * u;
  const chartBottom = H - margin - footH - msgH - factsH;
  const R = Math.min(W - 2 * margin, chartBottom - chartTop) / 2;
  return { u, margin, chartTop, chartBottom, factsH, msgH, footH, cx: W / 2, cy: (chartTop + chartBottom) / 2, R, ringR: R * 0.93 };
}

// Deep sky: the real sky seen looking down on the solar system from above, so the south ecliptic pole
// sits behind the Sun and the ecliptic itself falls on the constellation ring (azimuthal equidistant,
// longitude = the same angle as the planets). Beyond the ring is sky behind the viewer, drawn faded.
const deepCache = new Map();
const skyFade = (d) => (d <= 92 ? 1 : Math.max(0.2, 1 - ((d - 92) / 33) * 0.8));

function deepSkyImage(W, H, L, theme, sky) {
  const s = Math.min(1, (W > 2000 ? 1800 : 820) / W);
  const w = Math.round(W * s), h = Math.round(H * s);
  const key = [w, h, theme, L.cx.toFixed(1), L.cy.toFixed(1), L.ringR.toFixed(1), sky.milky.w].join('|');
  if (deepCache.has(key)) return deepCache.get(key);
  const mw = sky.milky, src = mw.data, M = sky.gal;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h), out = img.data;
  const ivory = theme === 'ivory';
  const cx = L.cx * s, cy = L.cy * s, ringR = L.ringR * s;
  const TAU = Math.PI * 2;
  const px = (x, y) => (y * mw.w + x) * 4;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const dx = i + 0.5 - cx, dy = cy - (j + 0.5);
      const d = (Math.hypot(dx, dy) / ringR) * 90; // degrees from the south ecliptic pole
      if (d >= 179) continue;
      const lam = Math.atan2(dy, dx), beta = ((d - 90) * Math.PI) / 180;
      const cb = Math.cos(beta);
      // ecliptic → scene → galactic, exactly as the 3D sky shader samples the panorama
      const sx = cb * Math.cos(lam), sy = Math.sin(beta), sz = -cb * Math.sin(lam);
      const gx = M[0] * sx + M[3] * sy + M[6] * sz, gy = M[1] * sx + M[4] * sy + M[7] * sz, gz = M[2] * sx + M[5] * sy + M[8] * sz;
      let tu = 0.5 - Math.atan2(gy, gx) / TAU;
      tu -= Math.floor(tu);
      const tv = 0.5 - Math.asin(Math.max(-1, Math.min(1, gz))) / Math.PI;
      const fx = tu * mw.w - 0.5, fy = (1 - tv) * mw.h - 0.5;
      const x0 = Math.floor(fx), y0 = Math.max(0, Math.min(mw.h - 2, Math.floor(fy)));
      const ax = fx - x0, ay = Math.max(0, Math.min(1, fy - y0));
      const xa = ((x0 % mw.w) + mw.w) % mw.w, xb = (xa + 1) % mw.w;
      const p00 = px(xa, y0), p10 = px(xb, y0), p01 = px(xa, y0 + 1), p11 = px(xb, y0 + 1);
      const fade = skyFade(d);
      const o = (j * w + i) * 4;
      let lum = 0;
      for (let k = 0; k < 3; k++) {
        const v = ((src[p00 + k] * (1 - ax) + src[p10 + k] * ax) * (1 - ay) + (src[p01 + k] * (1 - ax) + src[p11 + k] * ax) * ay) / 255;
        const lifted = Math.min(1, (ivory ? 1.6 : 2.2) * Math.pow(v, 0.82)) * fade;
        if (ivory) lum += lifted * (k === 0 ? 0.3 : k === 1 ? 0.59 : 0.11);
        else out[o + k] = lifted * 255;
      }
      if (ivory) {
        // printed like a photographic plate: the Milky Way in ink on paper
        out[o] = 31; out[o + 1] = 37; out[o + 2] = 51;
        out[o + 3] = Math.min(0.78, lum * 1.3) * 255;
      } else {
        out[o + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  if (deepCache.size > 6) deepCache.clear();
  deepCache.set(key, c);
  return c;
}

function drawDeepSky(ctx, W, H, L, T, theme, sky) {
  ctx.save();
  ctx.imageSmoothingQuality = 'high';
  ctx.globalCompositeOperation = theme === 'ivory' ? 'source-over' : 'screen';
  ctx.drawImage(deepSkyImage(W, H, L, theme, sky), 0, 0, W, H);
  ctx.restore();
  const { u } = L;
  const place = (o) => {
    const d = ((o.beta * 180) / Math.PI) + 90;
    const r = (d / 90) * L.ringR;
    return { x: L.cx + r * Math.cos(o.lam), y: L.cy - r * Math.sin(o.lam), d };
  };
  // the brightest catalogue stars, crisp on top, in their real colours
  for (const st of catalogue().stars) {
    const p = place(st);
    if (p.d >= 178 || p.x < 0 || p.x > W || p.y < 0 || p.y > H) continue;
    const fade = skyFade(p.d);
    const r = u * Math.min(0.42, Math.max(0.09, 0.34 - 0.07 * st.mag));
    const [cr, cg, cb] = theme === 'ivory' ? [31 / 255, 37 / 255, 51 / 255] : st.color;
    const rgb = `${Math.round(cr * 255)},${Math.round(cg * 255)},${Math.round(cb * 255)}`;
    if (st.mag < 1.2 && theme !== 'ivory') {
      const gl = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4);
      gl.addColorStop(0, `rgba(${rgb},${(0.35 * fade).toFixed(3)})`); gl.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = gl;
      ctx.beginPath(); ctx.arc(p.x, p.y, r * 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = `rgba(${rgb},${(0.95 * fade).toFixed(3)})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
  }
  // deep-sky objects are marked and labelled later, only where a label fits
  return catalogue().dso.map((o) => ({ name: o.name, ...place(o) }))
    .filter((p) => p.x > L.margin && p.x < W - L.margin && p.y > L.chartTop && p.y < L.chartBottom);
}

// Draws the whole poster at any size. sprites: { id: { canvas, radiusPx } } from app.snapshot().
export function drawPoster(ctx, W, H, opts, sky, sprites) {
  const T = THEMES[opts.theme] || THEMES.midnight;
  const u = W / 100; // layout unit: 1% of the width
  const serif = (s) => `italic 500 ${s}px "Cormorant Garamond", "Iowan Old Style", Georgia, serif`;
  const display = (s) => `600 ${s}px "Chakra Petch", "Segoe UI", system-ui, sans-serif`;
  const mono = (s) => `400 ${s}px "JetBrains Mono", ui-monospace, Menlo, monospace`;
  const body = (s) => `400 ${s}px "Barlow", "Segoe UI", system-ui, sans-serif`;

  const L = layout(W, H, opts);
  const { margin, cx, cy, R, ringR, chartBottom, factsH, msgH, footH } = L;

  // background: the real deep sky, or a quiet decorative starfield
  const g = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, Math.hypot(W, H) * 0.62);
  g.addColorStop(0, T.bg0); g.addColorStop(1, T.bg1);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const deep = opts.deepSky && sky.milky;
  const dsoPlaced = deep ? drawDeepSky(ctx, W, H, L, T, opts.theme, sky) : [];
  if (!deep) {
    const rand = rng(Math.floor(sky.ms / 86400000) * 2654435761);
    const nStars = Math.round((W * H) / (u * u) * 0.09);
    for (let i = 0; i < nStars; i++) {
      const x = rand() * W, y = rand() * H, m = rand();
      const r = u * (0.05 + 0.18 * m * m * m);
      ctx.fillStyle = T.star.replace('ALPHA', (0.15 + 0.6 * m).toFixed(2));
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // header: headline, name, date
  let y = margin + 2.2 * u;
  ctx.fillStyle = T.dim;
  const head = (opts.headline || '').toUpperCase();
  if (head) {
    const hs = fitText(ctx, head, display, 2.2 * u, W - 2 * margin);
    ctx.font = display(hs);
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${(hs * 0.32).toFixed(1)}px`;
    ctx.fillText(head, W / 2, y);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }
  if (opts.name) {
    y += 8.6 * u;
    ctx.fillStyle = T.ink;
    const ns = fitText(ctx, opts.name, serif, 9 * u, W - 2 * margin);
    ctx.font = serif(ns);
    ctx.fillText(opts.name, W / 2, y);
    y += 1.5 * u;
  }
  y += 4.2 * u;
  ctx.fillStyle = T.accent;
  ctx.font = mono(2.1 * u);
  ctx.fillText(opts.dateLabel, W / 2, y);

  // constellations along the ecliptic, as seen from the Sun
  const ringW = R * 0.07;
  ctx.strokeStyle = T.faint;
  ctx.lineWidth = Math.max(1, u * 0.08);
  ctx.beginPath(); ctx.arc(cx, cy, ringR + ringW / 2, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, ringR - ringW / 2, 0, Math.PI * 2); ctx.stroke();
  for (let d = 0; d < 360; d += 5) {
    const a = (d * Math.PI) / 180, len = d % 30 === 0 ? ringW * 0.42 : ringW * 0.2;
    const r0 = ringR - ringW / 2;
    ctx.beginPath();
    ctx.moveTo(cx + r0 * Math.cos(a), cy - r0 * Math.sin(a));
    ctx.lineTo(cx + (r0 + len) * Math.cos(a), cy - (r0 + len) * Math.sin(a));
    ctx.stroke();
  }
  ctx.fillStyle = T.dim;
  ctx.font = display(Math.max(7, ringW * 0.34));
  ctx.textBaseline = 'middle';
  ZODIAC.forEach(([name, start], i) => {
    const end = ZODIAC[(i + 1) % ZODIAC.length][1];
    const span = (end - start + 360) % 360;
    const a0 = (start * Math.PI) / 180;
    ctx.strokeStyle = T.faint;
    ctx.beginPath();
    ctx.moveTo(cx + (ringR - ringW / 2) * Math.cos(a0), cy - (ringR - ringW / 2) * Math.sin(a0));
    ctx.lineTo(cx + (ringR + ringW / 2) * Math.cos(a0), cy - (ringR + ringW / 2) * Math.sin(a0));
    ctx.stroke();
    if (span < 9) return; // Scorpius only grazes the ecliptic; too narrow to label
    const mid = ((start + span / 2) * Math.PI) / 180;
    arcText(ctx, name.toUpperCase(), cx, cy, ringR, mid, ringW * 0.09);
  });
  ctx.textBaseline = 'alphabetic';

  // orbits, evenly spaced
  const list = sky.planets.filter((p) => opts.pluto || p.id !== 'pluto');
  const rIn = R * 0.2, rOut = R * 0.8;
  const step = (rOut - rIn) / Math.max(1, list.length - 1);
  ctx.strokeStyle = T.faint;
  ctx.lineWidth = Math.max(1, u * 0.09);
  list.forEach((p, i) => {
    p.r = rIn + i * step;
    ctx.setLineDash(p.id === 'pluto' ? [u * 0.5, u * 0.5] : []);
    ctx.beginPath(); ctx.arc(cx, cy, p.r, 0, Math.PI * 2); ctx.stroke();
  });
  ctx.setLineDash([]);

  // the Sun
  const sunR = R * 0.085;
  const glow = ctx.createRadialGradient(cx, cy, sunR * 0.6, cx, cy, sunR * 3.4);
  glow.addColorStop(0, `${T.sunGlow}0.55)`); glow.addColorStop(0.35, `${T.sunGlow}0.16)`); glow.addColorStop(1, `${T.sunGlow}0)`);
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(cx, cy, sunR * 3.4, 0, Math.PI * 2); ctx.fill();
  drawSprite(ctx, sprites.sun, cx, cy, sunR, null);

  // planets at their real directions from the Sun
  const sizeOf = (p) => R * 0.022 * Math.min(2.9, Math.max(0.55, (p.radius / 6371) ** 0.42));
  const discs = [{ x: cx, y: cy, r: sunR * 1.3 }];
  for (const p of list) {
    const a = (p.lon * Math.PI) / 180;
    p.x = cx + p.r * Math.cos(a); p.y = cy - p.r * Math.sin(a);
    p.pr = sizeOf(p);
    p.reach = p.pr * (p.id === 'saturn' ? 2.3 : 1.05); // Saturn's rings
    drawSprite(ctx, sprites[p.id], p.x, p.y, p.pr, T.night, p.color);
    discs.push({ x: p.x, y: p.y, r: p.reach });
  }

  // labels: the first spot that clears every planet and earlier label (outward, either side, inward)
  const fs = Math.max(7, R * 0.028);
  ctx.font = display(fs);
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${(R * 0.004).toFixed(1)}px`;
  ctx.textBaseline = 'middle';
  const boxes = [];
  const hits = (bx) => discs.some((d) => d.x + d.r > bx.x0 && d.x - d.r < bx.x1 && d.y + d.r > bx.y0 && d.y - d.r < bx.y1)
    || boxes.some((o) => o.x1 > bx.x0 && o.x0 < bx.x1 && o.y1 > bx.y0 && o.y0 < bx.y1);
  for (const p of list) {
    const text = p.name.toUpperCase();
    const tw = ctx.measureText(text).width, th = fs * 1.1, gap = R * 0.018;
    const ux = (p.x - cx) / p.r, uy = (p.y - cy) / p.r; // outward unit vector
    const tries = [];
    for (const k of [1, 1.6]) {
      const off = p.reach + gap * k;
      tries.push([p.x + ux * (off + Math.abs(ux) * tw / 2 + Math.abs(uy) * th / 2), p.y + uy * (off + Math.abs(uy) * th / 2 + Math.abs(ux) * tw / 2)]);
      tries.push([p.x + off + tw / 2, p.y], [p.x - off - tw / 2, p.y], [p.x, p.y - off - th / 2], [p.x, p.y + off + th / 2]);
    }
    let [lx, ly] = tries[0];
    for (const [tx, ty] of tries) {
      const bx = { x0: tx - tw / 2, x1: tx + tw / 2, y0: ty - th / 2, y1: ty + th / 2 };
      if (!hits(bx)) { lx = tx; ly = ty; break; }
    }
    boxes.push({ x0: lx - tw / 2, x1: lx + tw / 2, y0: ly - th / 2, y1: ly + th / 2 });
    ctx.lineJoin = 'round';
    ctx.lineWidth = fs * 0.32;
    ctx.strokeStyle = T.halo;
    ctx.strokeText(text, lx, ly);
    ctx.fillStyle = T.ink;
    ctx.fillText(text, lx, ly);
  }
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

  // deep-sky labels take whatever space the planets left free
  if (dsoPlaced.length) {
    const ds = Math.max(7, R * 0.03);
    ctx.font = serif(ds);
    ctx.textAlign = 'left';
    for (const o of dsoPlaced) {
      const tw = ctx.measureText(o.name).width, th = ds;
      const lx = o.x + u * 1.1, ly = o.y;
      const bx = { x0: lx, x1: lx + tw, y0: ly - th / 2, y1: ly + th / 2 };
      const ring = { x0: o.x - u * 0.6, x1: o.x + u * 0.6, y0: o.y - u * 0.6, y1: o.y + u * 0.6 };
      if (hits(bx) || hits(ring) || bx.x1 > W - margin) continue;
      boxes.push(bx);
      ctx.strokeStyle = T.dim;
      ctx.lineWidth = Math.max(1, u * 0.09);
      ctx.beginPath(); ctx.arc(o.x, o.y, u * 0.55, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = ds * 0.3;
      ctx.strokeStyle = T.halo;
      ctx.strokeText(o.name, lx, ly);
      ctx.fillStyle = T.dim;
      ctx.fillText(o.name, lx, ly);
    }
    ctx.textAlign = 'center';
  }
  ctx.textBaseline = 'alphabetic';

  // facts
  const fy = chartBottom + 2 * u;
  ctx.strokeStyle = T.faint;
  ctx.lineWidth = Math.max(1, u * 0.08);
  ctx.beginPath(); ctx.moveTo(margin, fy); ctx.lineTo(W - margin, fy); ctx.stroke();
  const cols = [
    ['EARTH TO SUN', `${Math.round(sky.earthSun).toLocaleString('en-US')} km`],
    ['SUNLIGHT TOOK', fmtDuration(sky.earthSun / C_KMS)],
    ['THE MOON', `${sky.moon.name} · ${Math.round(sky.moon.lit * 100)}%`],
    opts.lapsLabel,
  ];
  const colW = (W - 2 * margin) / cols.length;
  cols.forEach(([k, v], i) => {
    const x = margin + colW * (i + 0.5);
    const ty = fy + 5.4 * u;
    ctx.fillStyle = T.dim;
    ctx.font = display(1.25 * u);
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${(0.28 * u).toFixed(1)}px`;
    ctx.fillText(k, x, ty);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.fillStyle = T.ink;
    const moon = i === 2 && sprites.moon;
    const vs = fitText(ctx, v, mono, 1.75 * u, colW - (moon ? 5.5 : 2) * u);
    ctx.font = mono(vs);
    const vw = ctx.measureText(v).width;
    const vx = moon ? x + 1.6 * u : x;
    ctx.fillText(v, vx, ty + 3.4 * u);
    // the Moon as it looked from Earth that night
    if (moon) drawSprite(ctx, sprites.moon, vx - vw / 2 - 1.9 * u, ty + 2.85 * u, 1.25 * u, T.night, '#c8c4bc');
  });

  if (opts.message) {
    ctx.fillStyle = T.ink;
    const ms = fitText(ctx, opts.message, serif, 4 * u, W - 2 * margin);
    ctx.font = serif(ms);
    ctx.fillText(opts.message, W / 2, H - margin - footH - msgH * 0.28);
  }

  ctx.fillStyle = T.dim;
  const foot1 = 'Planet directions are real for this date, from JPL orbital elements. Sizes and distances are not to scale.'
    + (deep ? ' Behind them, the real sky around the south ecliptic pole.' : '');
  const foot2 = `Made with Solar Voyager · planet maps${deep ? ' and Milky Way' : ''} by Solar System Scope (CC BY 4.0), based on NASA imagery`;
  ctx.font = body(fitText(ctx, foot1, body, 1.05 * u, W - 2 * margin));
  ctx.fillText(foot1, W / 2, H - margin - 1.6 * u);
  ctx.font = body(fitText(ctx, foot2, body, 1.05 * u, W - 2 * margin));
  ctx.fillText(foot2, W / 2, H - margin + 0.4 * u);
}

function drawSprite(ctx, s, x, y, r, night, fallback) {
  if (night) {
    ctx.fillStyle = night;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  if (s) {
    const k = r / s.radiusPx, size = s.canvas.width * k;
    ctx.drawImage(s.canvas, x - size / 2, y - size / 2, size, size);
  } else if (fallback) {
    ctx.fillStyle = fallback;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
}

// ---------------------------------------------------------------- studio UI
const $ = (id) => document.getElementById(id);

export class PosterStudio {
  constructor(app) {
    this.app = app;
    this.theme = 'midnight';
    this.sprites = null;
    this.spriteKey = '';
    const sel = $('ps-size');
    for (const s of SIZES) { const o = document.createElement('option'); o.value = s.id; o.textContent = s.label; sel.append(o); }
    const today = new Date();
    $('ps-date').value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const redraw = () => this.schedule();
    for (const id of ['ps-headline', 'ps-name', 'ps-date', 'ps-time', 'ps-message', 'ps-pluto', 'ps-deep']) $(id).addEventListener('input', redraw);
    for (const b of document.querySelectorAll('.ps-theme')) {
      b.addEventListener('click', () => {
        this.theme = b.dataset.theme;
        for (const o of document.querySelectorAll('.ps-theme')) o.setAttribute('aria-checked', String(o === b));
        redraw();
      });
    }
    $('ps-download').addEventListener('click', () => this.download());
    $('ps-3d').addEventListener('click', () => this.openIn3D());
    $('ps-close').addEventListener('click', () => this.close());
    $('poster').addEventListener('click', (e) => { if (e.target.id === 'poster') this.close(); });
    window.addEventListener('resize', () => { if (this.isOpen) this.schedule(); });
  }

  get isOpen() { return !$('poster').hidden; }

  open() {
    $('poster').hidden = false;
    document.body.classList.add('poster-open');
    this.schedule(0);
    setTimeout(() => $('ps-name').focus(), 50);
  }

  close() {
    $('poster').hidden = true;
    document.body.classList.remove('poster-open');
    if (location.hash === '#poster') history.replaceState(null, '', location.pathname + location.search);
  }

  readForm() {
    const date = $('ps-date').value;
    const time = $('ps-time').value;
    let ms = Date.parse(`${date}T${time || '12:00'}`);
    const valid = date && Number.isFinite(ms) && date >= '1800-01-01' && date <= '2050-12-31';
    if (!valid) ms = Date.now();
    const d = new Date(ms);
    let dateLabel = d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (time) dateLabel += ` · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
    const years = (Date.now() - ms) / (365.25 * 86400000);
    const km = Math.abs(years) * 2 * Math.PI * AU_KM;
    const kmLabel = km >= 1e9 ? `${(km / 1e9).toFixed(1)} billion km` : `${Math.round(km / 1e6).toLocaleString('en-US')} million km`;
    const lapsLabel = years >= 0
      ? ['EARTH HAS SINCE FLOWN', `${kmLabel} · ${years.toFixed(1)} laps`]
      : ['EARTH WILL FLY', `${kmLabel} · ${(-years).toFixed(1)} laps`];
    $('ps-date-note').hidden = valid;
    return {
      ms, valid, theme: this.theme, pluto: $('ps-pluto').checked, deepSky: $('ps-deep').checked,
      headline: $('ps-headline').value.trim(), name: $('ps-name').value.trim(), message: $('ps-message').value.trim(),
      dateLabel, lapsLabel, date,
    };
  }

  schedule(delay = 140) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.renderPreview(), delay);
  }

  async fonts() {
    if (this.fontsReady) return;
    await Promise.all([
      document.fonts.load('italic 500 40px "Cormorant Garamond"'),
      document.fonts.load('600 20px "Chakra Petch"'),
      document.fonts.load('400 20px "JetBrains Mono"'),
      document.fonts.load('400 20px "Barlow"'),
    ]).catch(() => {});
    this.fontsReady = true;
  }

  spritesFor(opts, scale) {
    const key = `${opts.ms}|${scale}`;
    if (this.spriteKey === key) return this.sprites;
    const reqs = [{ id: 'sun', px: 160 * scale }, ...PLANETS.map((id) => ({ id, px: (id === 'saturn' ? 150 : 90) * scale })),
      { id: 'moon', px: 90 * scale, from: 'earth' }];
    this.sprites = this.app.snapshot(jdFromMs(opts.ms), reqs);
    this.spriteKey = key;
    return this.sprites;
  }

  async renderPreview() {
    if (!this.isOpen) return;
    await this.fonts();
    const opts = this.readForm();
    const canvas = $('ps-canvas');
    const host = canvas.parentElement, cs = getComputedStyle(host);
    const boxW = host.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const boxH = host.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const ratio = 3 / 4;
    let w = boxW, h = w / ratio;
    if (h > boxH) { h = boxH; w = h * ratio; }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = `${Math.floor(w)}px`;
    canvas.style.height = `${Math.floor(h)}px`;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    const sky = computeSky(this.app, opts.ms);
    const sprites = this.spritesFor(opts, Math.max(1, canvas.width / 900));
    drawPoster(canvas.getContext('2d'), canvas.width, canvas.height, opts, sky, sprites);
  }

  async download() {
    const btn = $('ps-download');
    const opts = this.readForm();
    let size = SIZES.find((s) => s.id === $('ps-size').value) || SIZES[0];
    // iPhones and iPads cap a canvas at about 16.7 million pixels
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    let { w, h } = size;
    if (ios && w * h > 16e6) { const k = Math.sqrt(16e6 / (w * h)); w = Math.floor(w * k); h = Math.floor(h * k); }
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Rendering…';
    await new Promise((r) => setTimeout(r, 30));
    try {
      await this.fonts();
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const sky = computeSky(this.app, opts.ms);
      this.spriteKey = '';
      const sprites = this.spritesFor(opts, Math.max(1, w / 1000));
      drawPoster(c.getContext('2d'), w, h, opts, sky, sprites);
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      if (!blob) throw new Error('canvas too large');
      const slug = (opts.name || 'solar-system').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'solar-system';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${slug}-${opts.date || 'today'}-${size.id}.png`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      $('ps-status').textContent = `Saved ${a.download} (${w.toLocaleString('en-US')} × ${h.toLocaleString('en-US')} px).`;
    } catch (err) {
      console.error(err);
      $('ps-status').textContent = 'This device could not render a poster that large. Try a smaller size.';
    } finally {
      btn.disabled = false;
      btn.textContent = label;
      this.spriteKey = '';
      this.schedule(0);
    }
  }

  openIn3D() {
    const opts = this.readForm();
    this.app.state.simMs = opts.ms;
    this.app.setTimeRate('pause');
    this.close();
    this.app.ui.toast('Time is paused on your date. Zoom out to see the planets where they were; press <b>Now</b> to come back.', 6500);
  }
}
