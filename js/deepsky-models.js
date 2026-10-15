// Procedural 3D models of galaxies, nebulae and star clusters.
//
// Each model is a cloud of soft particles in the object's own frame, measured in units of its radius, in
// three layers: glowing gas and unresolved starlight (added together), dust (which multiplies down
// whatever was drawn behind it, so dark lanes and pillars stand out in silhouette) and crisp stars.
// Nebula colours follow the emission lines that tint real nebulae: hydrogen-alpha rose red, doubly
// ionised oxygen teal, nitrogen and sulphur deep red and orange, and blue starlight scattered by dust.
//
// Frames. Disc galaxies: the disc lies in the local x–z plane with its north pole along +y.
// Everything else: as seen from Earth, +x to the right (west on the sky), +y up (north), +z towards Earth.
// ctx.fromSky(east, north, toward) converts a sky offset (in radii) to the model frame.

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

export const COL = {
  ha: [1.0, 0.2, 0.36], // hydrogen-alpha with some H-beta: the rose red of star-forming clouds
  haDeep: [0.85, 0.08, 0.14],
  nii: [1.0, 0.12, 0.1], // ionised nitrogen
  sii: [1.0, 0.45, 0.16], // ionised sulphur
  oiii: [0.14, 0.88, 0.78], // doubly ionised oxygen
  heii: [0.42, 0.56, 1.0], // ionised helium
  refl: [0.36, 0.56, 1.0], // starlight scattered by dust
  sync: [0.55, 0.7, 1.0], // synchrotron light from fast electrons
  old: [1.0, 0.8, 0.55], // old red giants
  disc: [1.0, 0.9, 0.78],
  young: [0.6, 0.74, 1.0], // young blue stars
  white: [1, 1, 1],
};
const DUST = [0.6, 0.68, 0.8]; // fraction of light absorbed: more blue than red, so dust also reddens
const STAR_TEMPS = [[0.62, 0.72, 1.0], [0.8, 0.86, 1.0], [1.0, 0.98, 0.96], [1.0, 0.9, 0.74], [1.0, 0.77, 0.52], [1.0, 0.62, 0.42]];

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- random numbers and noise
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash3(i, j, k, s) {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(k | 0, 1274126177) ^ Math.imul(s | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h & 0xffffff) / 0x7fffff - 1;
}

// Smooth value noise in [-1, 1].
export function noise3(x, y, z, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const a = hash3(xi, yi, zi, s), b = hash3(xi + 1, yi, zi, s), c = hash3(xi, yi + 1, zi, s), d = hash3(xi + 1, yi + 1, zi, s);
  const e = hash3(xi, yi, zi + 1, s), f = hash3(xi + 1, yi, zi + 1, s), g = hash3(xi, yi + 1, zi + 1, s), h = hash3(xi + 1, yi + 1, zi + 1, s);
  const x1 = a + (b - a) * u, x2 = c + (d - c) * u, x3 = e + (f - e) * u, x4 = g + (h - g) * u;
  const y1 = x1 + (x2 - x1) * v, y2 = x3 + (x4 - x3) * v;
  return y1 + (y2 - y1) * w;
}

export function fbm(x, y, z, oct = 4, s = 0) {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += amp * noise3(x * f, y * f, z * f, s + o * 17);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

// Thin bright ridges where the noise crosses zero: filaments and wisps.
function ridge(x, y, z, oct = 4, s = 0) {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    const n = 1 - Math.abs(noise3(x * f, y * f, z * f, s + o * 31));
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5;
    f *= 2.07;
  }
  return sum / norm;
}

// ---------------------------------------------------------------- particle builder
export class Model {
  // k: how densely gas and dust are sampled. Structure (knot positions, filament paths, stars) comes from
  // the main random stream; the many particles that fill it in come from a second stream inside gas()
  // blocks, so a model built with k = 8 has the same structure as one built with k = 1, just 8 times as
  // many (and 8 times fainter) gas particles.
  constructor(seed, ctx, k = 1) {
    this.main = mulberry(seed);
    this.sample = mulberry(seed ^ 0x5bd1e995);
    this.rnd = this.main;
    this.ctx = ctx;
    this.k = k;
    this.w = 1;
    this.layers = { glow: [], dust: [], star: [] };
  }

  // Runs fn with the sampling stream and gas weight 1/k; loops inside size themselves with n().
  gas(fn) {
    const rnd = this.rnd, w = this.w;
    this.rnd = this.sample;
    this.w = 1 / this.k;
    try { fn(); } finally { this.rnd = rnd; this.w = w; }
  }

  n(count) { return Math.round(count * this.k); }

  r() { return this.rnd(); }
  u(a, b) { return a + (b - a) * this.rnd(); }
  g() {
    const u = Math.max(this.rnd(), 1e-9), v = this.rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  }
  dir() {
    const z = 2 * this.rnd() - 1, a = TAU * this.rnd(), s = Math.sqrt(1 - z * z);
    return [s * Math.cos(a), s * Math.sin(a), z];
  }
  pick(list) { return list[Math.floor(this.rnd() * list.length)]; }
  jitter(c, k = 0.08) {
    const j = 1 + (this.rnd() - 0.5) * k;
    return [c[0] * j * (1 + (this.rnd() - 0.5) * k), c[1] * j, c[2] * j * (1 + (this.rnd() - 0.5) * k)];
  }
  starColor(cool = 0.5) {
    // cool: 0 = all hot blue stars, 1 = mostly cool red ones
    const t = clamp01(cool + this.g() * 0.22) * (STAR_TEMPS.length - 1);
    const i = Math.min(STAR_TEMPS.length - 2, Math.floor(t));
    return mix(STAR_TEMPS[i], STAR_TEMPS[i + 1], t - i);
  }

  // Glow: emission, a = peak brightness. Dust: a = peak absorption, stored as optical depth so that many
  // faint particles add up to the same darkness as a few dense ones. Stars: point sprites.
  glow(x, y, z, c, size, a) { this.layers.glow.push(x, y, z, c[0], c[1], c[2], size, a * this.w); }
  dust(x, y, z, c, size, a) {
    const tau = -Math.log(1 - Math.min(0.97, 0.693 * a));
    this.layers.dust.push(x, y, z, c[0], c[1], c[2], size, tau * this.w);
  }
  star(x, y, z, c, size, a) { this.layers.star.push(x, y, z, c[0], c[1], c[2], size, a); }

  // Rejection-sample n points from density(x, y, z) in [0, 1] inside a box of half-sizes (bx, by, bz).
  volume(n, bx, by, bz, density, emit, cx = 0, cy = 0, cz = 0) {
    let got = 0;
    this.gas(() => {
      const N = this.n(n);
      for (let tries = 0; got < N && tries < N * 60; tries++) {
        const x = cx + (2 * this.rnd() - 1) * bx, y = cy + (2 * this.rnd() - 1) * by, z = cz + (2 * this.rnd() - 1) * bz;
        const d = density(x, y, z);
        if (d > 0 && this.rnd() < d) { emit(x, y, z, d); got++; }
      }
    });
    return got;
  }

  // Shuffled typed arrays per layer, so any prefix is a fair sample (used for level of detail).
  build() {
    const out = {};
    for (const [name, arr] of Object.entries(this.layers)) {
      const n = arr.length / 8;
      const order = new Uint32Array(n);
      const rnd = mulberry(0x9e3779b9 ^ n);
      for (let i = 0; i < n; i++) order[i] = i;
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const t = order[i]; order[i] = order[j]; order[j] = t;
      }
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n);
      for (let k = 0; k < n; k++) {
        const s = order[k] * 8;
        pos[k * 3] = arr[s]; pos[k * 3 + 1] = arr[s + 1]; pos[k * 3 + 2] = arr[s + 2];
        col[k * 3] = arr[s + 3]; col[k * 3 + 1] = arr[s + 4]; col[k * 3 + 2] = arr[s + 5];
        size[k] = arr[s + 6]; alpha[k] = arr[s + 7];
      }
      out[name] = { count: n, pos, col, size, alpha };
    }
    return out;
  }
}

// ---------------------------------------------------------------- shared shapes
// Hernquist profile radius (scale a), the light distribution of bulges and elliptical galaxies.
function hernquist(m, a, rmax) {
  for (let i = 0; i < 50; i++) {
    const s = Math.sqrt(m.r());
    const r = (a * s) / (1 - s + 1e-9);
    if (r < rmax) return r;
  }
  return a;
}

// Plummer profile radius, for star clusters.
function plummer(m, a, rmax) {
  for (let i = 0; i < 50; i++) {
    const u = Math.max(m.r(), 1e-6);
    const r = a / Math.sqrt(Math.pow(u, -2 / 3) - 1);
    if (r < rmax) return r;
  }
  return a;
}

// Radius from an exponential disc (surface density e^(-r/scale)), cut at rmax.
function expDisc(m, scale, rmax) {
  for (let i = 0; i < 50; i++) {
    const r = -scale * Math.log(Math.max(m.r() * m.r(), 1e-12));
    if (r < rmax) return r;
  }
  return Math.min(scale, rmax * 0.5);
}

function ellipsoid(m, o) {
  const p = Object.assign({ a: 0.1, rmax: 1, q: 0.85, q2: 1, n: 16000, nStars: 5000, col: COL.old, c: [0, 0, 0], scale: 1,
    bright: 1, sizeK: 0.3, cool: 0.62, starSize: 0.0008 }, o);
  const k = p.scale;
  m.gas(() => { for (let i = 0; i < m.n(p.n); i++) {
    const r = hernquist(m, p.a, p.rmax);
    const [dx, dy, dz] = m.dir();
    const col = m.jitter(mix(p.col, COL.disc, smooth(p.rmax * 0.5, 0, r) * 0.25), 0.1);
    m.glow(p.c[0] + dx * r * k, p.c[1] + dy * r * p.q * k, p.c[2] + dz * r * p.q2 * k, col,
      Math.min(0.018 + p.sizeK * r, 0.2) * k, 0.3 * p.bright);
  } });
  for (let i = 0; i < p.nStars; i++) {
    const r = hernquist(m, p.a * 1.3, p.rmax);
    const [dx, dy, dz] = m.dir();
    m.star(p.c[0] + dx * r * k, p.c[1] + dy * r * p.q * k, p.c[2] + dz * r * p.q2 * k, m.starColor(p.cool), p.starSize * k, 0.45 * p.bright);
  }
}

// A spiral galaxy in the local x–z plane. Arms are logarithmic spirals; wind = -1 makes them trail
// for a disc turning from +x towards +z. armW and dustR are radial widths and offsets, in radii.
function spiral(m, o) {
  const p = Object.assign({
    arms: 2, pitch: 14, phase: 0, r0: 0.12, wind: 1, rmax: 1, armExt: 1,
    bulge: 0.1, bulgeQ: 0.75, bulgeK: 1, bar: 0, barAngle: 0, barQ: 0.32,
    scale: 0.3, thick: 0.02, armW: 0.04, flocc: 0,
    nBulge: 5000, nBase: 5000, nDisc: 7000, nArm: 13000, nStars: 9000, nDust: 9000, nHii: 1600,
    colBulge: COL.old, colDisc: COL.disc, colArm: COL.young, armBright: 1, discBright: 1, dustR: 0.025, dustK: 1,
    ring: 0, ringW: 0.04, ringK: 1, seed: 1,
  }, o);
  const k = p.wind / Math.tan(p.pitch * DEG);
  const armAt = (j, r) => p.phase + (j * TAU) / p.arms + k * Math.log(Math.max(r, p.r0) / p.r0);
  const floccAt = (r, j) => (p.flocc && j < p.arms ? p.flocc * 0.5 * fbm(r * 2.2 + j * 7.1, j * 3.3, 0.5, 2, p.seed) : 0);
  // flocculent galaxies: short arm fragments at random angles, each covering a band of radii
  const frags = [];
  for (let f = 0; f < Math.round(p.flocc * 26); f++) {
    const ra = p.r0 + m.r() * 0.7;
    frags.push({ phase: m.r() * TAU, ra, rb: ra + 0.12 + m.r() * 0.22 });
  }
  const armR = () => p.r0 * 0.9 + expDisc(m, p.scale * 0.85, p.rmax * p.armExt - p.r0 * 0.9);
  // a point on arm j at radius r, pushed dr off its centre line; tw tapers the arm's far end (and both
  // ends of a fragment) so arms fade out rather than stop
  let tw = 1;
  const rEnd = p.rmax * p.armExt;
  const onArm = (j, r, dr, y) => {
    if (j >= p.arms) {
      const f = frags[j - p.arms];
      const u = (r * 7.3) % 1;
      tw = Math.sqrt(Math.sin(Math.PI * u));
      r = f.ra + u * (f.rb - f.ra);
      const th = f.phase + k * Math.log(r / p.r0);
      const rr = Math.max(0.004, r + dr);
      return [rr * Math.cos(th), y, rr * Math.sin(th)];
    }
    tw = smooth(rEnd, rEnd * 0.72, r);
    const th = armAt(j, r) + floccAt(r, j);
    const rr = Math.max(0.004, r + dr);
    return [rr * Math.cos(th), y, rr * Math.sin(th)];
  };
  const arm = () => (frags.length && m.r() < 0.55 ? p.arms + Math.floor(m.r() * frags.length) : Math.floor(m.r() * p.arms));
  const barCos = Math.cos(p.barAngle), barSin = Math.sin(p.barAngle);

  // bulge
  m.gas(() => { for (let i = 0; i < m.n(p.nBulge); i++) {
    const r = hernquist(m, p.bulge * 0.45, p.bulge * 3.5);
    const [dx, dy, dz] = m.dir();
    m.glow(dx * r, dy * r * p.bulgeQ, dz * r, m.jitter(p.colBulge, 0.1), Math.min(0.015 + 0.3 * r, 0.1), 0.42 * p.bulgeK);
  } });
  // bar
  if (p.bar) {
    m.gas(() => { for (let i = 0; i < m.n(p.nBulge * 0.6); i++) {
      const t = (m.r() + m.r() + m.r()) / 1.5 - 1;
      const x = t * p.bar, z = m.g() * p.bar * p.barQ * 0.45 * (1 - 0.5 * Math.abs(t)), y = m.g() * p.thick * 1.5;
      m.glow(x * barCos - z * barSin, y, x * barSin + z * barCos, m.jitter(mix(p.colBulge, p.colDisc, 0.3), 0.1), 0.035 + 0.02 * m.r(), 0.4 * p.bulgeK);
    } });
  }
  // the smooth starlight of the disc, in big soft sprites
  m.gas(() => { for (let i = 0; i < m.n(p.nBase); i++) {
    const r = expDisc(m, p.scale, p.rmax);
    const th = m.r() * TAU;
    const col = m.jitter(mix(p.colDisc, p.colArm, smooth(0.2, 1.0, r) * 0.45), 0.08);
    m.glow(r * Math.cos(th), m.g() * p.thick * 2, r * Math.sin(th), col, 0.07 + 0.08 * r, 0.14 * p.discBright);
  } });
  // older disc stars, loosely following the arms
  m.gas(() => { for (let i = 0; i < m.n(p.nDisc); i++) {
    const r = expDisc(m, p.scale, p.rmax);
    let pt;
    tw = 1;
    if (m.r() < 0.5) pt = onArm(arm(), r, m.g() * p.armW * 3, m.g() * p.thick * (0.7 + r));
    else { const th = m.r() * TAU; pt = [r * Math.cos(th), m.g() * p.thick * (0.7 + r), r * Math.sin(th)]; }
    const col = m.jitter(mix(p.colDisc, p.colArm, smooth(0.25, 1.0, r) * 0.4), 0.1);
    m.glow(...pt, col, 0.025 + 0.03 * r + 0.015 * m.r(), 0.3 * p.discBright * tw);
  } });
  // young arms
  m.gas(() => { for (let i = 0; i < m.n(p.nArm); i++) {
    const r = armR();
    const pt = onArm(arm(), r, m.g() * p.armW * (0.5 + r), m.g() * p.thick * 0.55);
    const col = m.jitter(mix(p.colDisc, p.colArm, 0.45 + 0.5 * smooth(0.05, 0.7, r)), 0.12);
    m.glow(...pt, col, 0.014 + 0.024 * m.r() + 0.012 * r, 0.48 * p.armBright * tw);
  } });
  // star-forming ring
  if (p.ring) {
    m.gas(() => { for (let i = 0; i < m.n(p.nArm * 0.4 * p.ringK); i++) {
      const th = m.r() * TAU;
      const r = p.ring + m.g() * p.ringW * (1 + 0.6 * fbm(Math.cos(th) * 3, Math.sin(th) * 3, 0, 2, p.seed + 5));
      m.glow(r * Math.cos(th), m.g() * p.thick * 0.5, r * Math.sin(th), m.jitter(mix(p.colDisc, p.colArm, 0.75), 0.12),
        0.014 + 0.02 * m.r(), 0.48 * p.armBright);
    } });
  }
  // H II regions: pink knots strung along the arms (and the ring)
  const knots = Math.round(p.nHii / 9);
  for (let c = 0; c < knots; c++) {
    let cx, cy, cz;
    if (p.ring && m.r() < 0.4) {
      const r = p.ring + m.g() * p.ringW * 0.6, th = m.r() * TAU;
      [cx, cy, cz] = [r * Math.cos(th), m.g() * p.thick * 0.3, r * Math.sin(th)];
    } else {
      [cx, cy, cz] = onArm(arm(), armR(), p.armW * 0.3 + m.g() * p.armW * 0.5, m.g() * p.thick * 0.3);
      if (m.r() > tw) continue;
    }
    const sz = 0.005 + 0.011 * m.r() * m.r();
    m.gas(() => { for (let q = 0; q < m.n(9); q++) {
      m.glow(cx + m.g() * sz, cy + m.g() * sz * 0.5, cz + m.g() * sz, m.jitter(mix(COL.ha, COL.white, 0.12 * m.r()), 0.15),
        0.006 + 0.01 * m.r(), 2.2);
    } });
    if (m.r() < 0.5) m.star(cx, cy, cz, COL.young, 0.0014, 1.0);
  }
  // dust lanes on the inner edge of each arm
  m.gas(() => { for (let i = 0; i < m.n(p.nDust); i++) {
    let pt;
    if (p.ring && m.r() < 0.4 * p.ringK) {
      const r = p.ring - p.ringW * 0.4 + m.g() * p.ringW * 0.45, th = m.r() * TAU;
      pt = [r * Math.cos(th), m.g() * p.thick * 0.3, r * Math.sin(th)];
    } else {
      const r = Math.max(p.bulge * 0.8, armR());
      pt = onArm(arm(), r, -p.dustR + m.g() * p.armW * 0.35, m.g() * p.thick * 0.3);
      if (m.r() > tw) continue;
    }
    m.dust(...pt, DUST, 0.02 + 0.024 * m.r(), 0.3 * p.dustK);
  } });
  // resolved stars
  for (let i = 0; i < p.nStars; i++) {
    const t = m.r();
    if (t < 0.2) {
      const r = hernquist(m, p.bulge * 0.6, p.bulge * 3);
      const [dx, dy, dz] = m.dir();
      m.star(dx * r, dy * r * p.bulgeQ, dz * r, m.starColor(0.7), 0.0009, 0.3);
    } else if (t < 0.6) {
      const pt = onArm(arm(), armR(), m.g() * p.armW, m.g() * p.thick * 0.5);
      m.star(...pt, m.starColor(0.15), 0.0011, 0.45 * tw);
    } else {
      const r = expDisc(m, p.scale, p.rmax), th = m.r() * TAU;
      m.star(r * Math.cos(th), m.g() * p.thick, r * Math.sin(th), m.starColor(0.5), 0.0009, 0.25);
    }
  }
  return { armAt, k, onArm };
}

// Globular clusters around a galaxy: tiny unresolved points.
function globulars(m, n, a, rmax, c = [0, 0, 0], k = 1) {
  for (let i = 0; i < n; i++) {
    const r = hernquist(m, a, rmax);
    const [dx, dy, dz] = m.dir();
    m.star(c[0] + dx * r * k, c[1] + dy * r * k, c[2] + dz * r * k, m.jitter([1.0, 0.88, 0.7], 0.1), 0.0012, 0.35 + 0.3 * m.r());
  }
}

// A tube of particles along a list of points (jets, filaments).
function strand(m, pts, layer, col, width, size, alpha, per = 6) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const al = typeof alpha === 'function' ? alpha(a) : alpha;
    m.gas(() => { for (let q = 0; q < m.n(per); q++) {
      const t = m.r();
      const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t;
      m[layer](x + m.g() * width, y + m.g() * width, z + m.g() * width, col, size * (0.7 + 0.6 * m.r()), al);
    } });
  }
}

// A blob of particles with a gaussian profile.
function blob(m, layer, c, s, n, col, size, alpha, sq = [1, 1, 1]) {
  m.gas(() => { for (let i = 0; i < m.n(n); i++) {
    m[layer](c[0] + m.g() * s * sq[0], c[1] + m.g() * s * sq[1], c[2] + m.g() * s * sq[2], typeof col === 'function' ? col() : col, size * (0.7 + 0.6 * m.r()), alpha);
  } });
}

// Stars scattered through and around a nebula, most of them faint, as in any photograph of one.
function fieldStars(m, n, R = 1.25) {
  for (let i = 0; i < n; i++) {
    const [dx, dy, dz] = m.dir();
    const r = R * Math.cbrt(m.r());
    const L = Math.pow(m.r(), 4);
    m.star(dx * r, dy * r, dz * r, m.starColor(0.3 + 0.45 * m.r()), 0.0035, 0.1 + 1.5 * L);
  }
}

// ---------------------------------------------------------------- galaxies
const MODELS = {};

MODELS.andromeda = (m) => {
  spiral(m, {
    arms: 2, pitch: 8, r0: 0.14, phase: 0.6, wind: -1, bulge: 0.09, bulgeQ: 0.72, bulgeK: 0.85, scale: 0.3, thick: 0.012,
    armW: 0.028, dustR: 0.02, ring: 0.43, ringW: 0.035, nBulge: 6500, nBase: 6000, nDisc: 8000, nArm: 12000, nHii: 1600,
    nDust: 13000, dustK: 1.15, armBright: 0.85, seed: 3,
  });
  // M32 (compact elliptical, in front) and M110 (diffuse dwarf elliptical, behind)
  const c32 = m.ctx.fromSky(0.03, -0.23, 0.12), c110 = m.ctx.fromSky(-0.2, 0.27, -0.2);
  m.ctx.companions.m32 = c32;
  m.ctx.companions.m110 = c110;
  ellipsoid(m, { a: 0.006, rmax: 0.04, q: 0.85, n: 1800, nStars: 400, c: c32, bright: 1.6, sizeK: 0.4 });
  ellipsoid(m, { a: 0.05, rmax: 0.16, q: 0.55, n: 2500, nStars: 700, c: c110, bright: 0.45, sizeK: 0.5 });
  globulars(m, 450, 0.25, 1.4);
};

MODELS.triangulum = (m) => {
  spiral(m, {
    arms: 2, pitch: 27, r0: 0.06, phase: 1.2, wind: -1, bulge: 0.025, bulgeQ: 0.8, bulgeK: 0.8, scale: 0.3, thick: 0.018,
    armW: 0.06, dustR: 0.03, flocc: 1.0, nBulge: 1200, nBase: 6000, nDisc: 8000, nArm: 15000, nHii: 3200, nDust: 8000,
    armBright: 1.0, colBulge: mix(COL.old, COL.disc, 0.4), seed: 7,
  });
  // NGC 604: a giant H II region in the north-eastern arm
  const c = m.ctx.onDisc(m.ctx.fromSky(0.22, 0.22, 0));
  m.gas(() => { for (let i = 0; i < m.n(900); i++) {
    const r = Math.abs(m.g()) * 0.02;
    const [dx, dy, dz] = m.dir();
    m.glow(c[0] + dx * r, c[1] + dy * r * 0.6, c[2] + dz * r, m.jitter(mix(COL.ha, COL.white, 0.2 * m.r()), 0.15), 0.004 + 0.008 * m.r(), 1.1);
  } });
  for (let i = 0; i < 40; i++) m.star(c[0] + m.g() * 0.006, c[1] + m.g() * 0.004, c[2] + m.g() * 0.006, COL.young, 0.004, 1.2);
};

MODELS.whirlpool = (m) => {
  const comp = m.ctx.fromSky(0.0, 1.06, -0.22);
  m.ctx.companions.ngc5195 = comp;
  // aim the end of one arm at the companion
  const thC = Math.atan2(comp[2], comp[0]);
  const pitch = 19, r0 = 0.12, wind = -1;
  const k = wind / Math.tan(pitch * DEG);
  const phase = thC - k * Math.log(0.95 / r0);
  spiral(m, {
    arms: 2, pitch, r0, phase, wind, bulge: 0.07, bulgeQ: 0.8, bulgeK: 0.8, scale: 0.34, thick: 0.016, armW: 0.04,
    dustR: 0.03, armExt: 1.1, nBulge: 4500, nBase: 5000, nDisc: 7000, nArm: 16000, nHii: 2600, nDust: 13000, dustK: 1.35,
    armBright: 1.05, seed: 11,
  });
  // the bridge of stars reaching the companion
  m.gas(() => { for (let i = 0; i < m.n(2200); i++) {
    const t = m.r();
    const r = 0.95 + t * 0.15;
    const th = phase + k * Math.log(r / r0) + m.g() * 0.05;
    const p = [r * Math.cos(th), m.g() * 0.02, r * Math.sin(th)];
    const tt = t * t;
    const q = [p[0] + (comp[0] - p[0]) * tt, p[1] + (comp[1] - p[1]) * tt, p[2] + (comp[2] - p[2]) * tt];
    m.glow(q[0] + m.g() * 0.03, q[1] + m.g() * 0.02, q[2] + m.g() * 0.03, m.jitter(mix(COL.disc, COL.young, 0.4), 0.1), 0.025 + 0.02 * m.r(), 0.3);
  } });
  // NGC 5195: a disturbed, dusty, yellowish lenticular
  ellipsoid(m, { a: 0.045, rmax: 0.28, q: 0.75, n: 4500, nStars: 1000, c: comp, bright: 1.1, sizeK: 0.35 });
  m.gas(() => { for (let i = 0; i < m.n(1800); i++) {
    const t = m.u(-1, 1);
    m.dust(comp[0] + t * 0.16 + m.g() * 0.03, comp[1] + m.g() * 0.035 + t * 0.05, comp[2] + m.g() * 0.05, DUST, 0.02 + 0.02 * m.r(), 0.35);
  } });
};

MODELS.sombrero = (m) => {
  // a vast bulge and halo
  ellipsoid(m, { a: 0.11, rmax: 0.95, q: 0.7, n: 16000, nStars: 3500, bright: 1.0, sizeK: 0.32, col: mix(COL.old, COL.white, 0.25) });
  // thin disc of stars, brightest just inside the dust ring
  m.gas(() => { for (let i = 0; i < m.n(9000); i++) {
    const r = 0.2 + Math.abs(m.g()) * 0.25 + m.r() * 0.6;
    if (r > 1) continue;
    const th = m.r() * TAU;
    m.glow(r * Math.cos(th), m.g() * 0.012, r * Math.sin(th), m.jitter(mix(COL.disc, COL.old, 0.3), 0.08), 0.02 + 0.02 * m.r(), 0.4);
  } });
  // the dust ring, the hat's brim
  m.gas(() => { for (let i = 0; i < m.n(18000); i++) {
    const th = m.r() * TAU;
    const r = 0.78 + m.g() * 0.06 + 0.025 * fbm(Math.cos(th) * 4, Math.sin(th) * 4, 0, 3, 21);
    m.dust(r * Math.cos(th), m.g() * 0.009, r * Math.sin(th), DUST, 0.014 + 0.016 * m.r(), 0.5);
  } });
  m.gas(() => { for (let i = 0; i < m.n(3000); i++) {
    const th = m.r() * TAU, r = 0.92 + m.g() * 0.04;
    m.glow(r * Math.cos(th), m.g() * 0.008, r * Math.sin(th), m.jitter(mix(COL.young, COL.disc, 0.3), 0.1), 0.014, 0.3);
  } });
  globulars(m, 1600, 0.3, 1.5);
};

MODELS.cigar = (m) => {
  // an edge-on disc of mottled starlight with a blazing core
  m.gas(() => { for (let i = 0; i < m.n(26000); i++) {
    const r = expDisc(m, 0.2, 1);
    const th = m.r() * TAU;
    const x = r * Math.cos(th), z = r * Math.sin(th), y = m.g() * (0.04 + 0.06 * (1 - r));
    const core = Math.exp(-r / 0.07);
    m.glow(x, y, z, m.jitter(mix(mix(COL.disc, COL.young, 0.3), COL.white, core), 0.1), 0.02 + 0.035 * r, 0.5 + 0.5 * core);
  } });
  // patchy dust across the disc
  m.gas(() => { for (let i = 0; i < m.n(16000); i++) {
    const r = expDisc(m, 0.35, 0.95), th = m.r() * TAU;
    const x = r * Math.cos(th), z = r * Math.sin(th), y = m.g() * 0.035;
    const n = fbm(x * 5, y * 9, z * 5, 4, 41);
    if (m.r() > smooth(-0.1, 0.25, n)) continue;
    m.dust(x, y, z, DUST, 0.02 + 0.02 * m.r(), 0.45);
  } });
  // super star clusters in the core
  for (let i = 0; i < 400; i++) m.star(m.g() * 0.05, m.g() * 0.015, m.g() * 0.05, COL.young, 0.004, 1.0);
  // the superwind: red hydrogen filaments streaming out of both faces
  for (let f = 0; f < 260; f++) {
    const side = m.r() < 0.5 ? 1 : -1;
    const base = [m.g() * 0.08, 0, m.g() * 0.05];
    const ang = m.g() * 0.3, az = m.r() * TAU;
    const dir = [Math.sin(ang) * Math.cos(az), side * Math.cos(ang), Math.sin(ang) * Math.sin(az)];
    const len = 0.2 + m.r() * 0.5;
    const pts = [];
    for (let s = 0; s <= 12; s++) {
      const t = (s / 12) * len;
      const w = 1 + t * 1.8;
      pts.push([base[0] + dir[0] * t * w + 0.03 * noise3(f, s * 0.4, 1, 5), base[1] + dir[1] * t, base[2] + dir[2] * t * w + 0.03 * noise3(f, s * 0.4, 2, 5)]);
    }
    const col = m.r() < 0.75 ? COL.ha : mix(COL.ha, COL.sii, 0.5);
    strand(m, pts, 'glow', col, 0.008, 0.018, (a) => 0.5 * smooth(0.75, 0.05, Math.abs(a[1])), 8);
  }
};

MODELS.m87 = (m) => {
  ellipsoid(m, { a: 0.075, rmax: 1, q: 0.94, q2: 0.94, n: 22000, nStars: 5000, bright: 0.8, sizeK: 0.34, col: mix(COL.old, COL.white, 0.2) });
  globulars(m, 4000, 0.3, 1.3);
  // the jet, pointing to position angle 290°: a beaded line of blue synchrotron light
  const dir = m.ctx.skyDir(290);
  const L = 0.076;
  const knots = [[0, 2.5], [0.02, 1.2], [0.12, 0.5], [0.25, 0.8], [0.42, 0.7], [0.6, 1.0], [0.78, 0.8], [0.92, 0.9], [1.0, 0.6]];
  m.gas(() => { for (let i = 0; i < m.n(3000); i++) {
    const t = m.r();
    let w = 0.25;
    for (const [kt, kb] of knots) w += kb * Math.exp(-((t - kt) ** 2) / 0.0012);
    if (m.r() * 3 > w) continue;
    const spread = 0.0012 + t * 0.003;
    m.glow(dir[0] * t * L + m.g() * spread, dir[1] * t * L + m.g() * spread, dir[2] * t * L + m.g() * spread,
      m.jitter(COL.sync, 0.1), 0.002 + 0.002 * m.r(), 1.0);
  } });
  m.star(0, 0, 0, [1, 0.95, 0.85], 0.004, 1.5);
};

MODELS.centaurusA = (m) => {
  ellipsoid(m, { a: 0.12, rmax: 1, q: 0.82, n: 18000, nStars: 4000, bright: 0.85, sizeK: 0.32, col: mix(COL.old, COL.white, 0.2) });
  // the remains of a swallowed spiral: a warped, dusty disc seen nearly edge-on along position angle 115°
  const ax = m.ctx.skyDir(115), up = m.ctx.skyDir(25), tw = m.ctx.toward;
  const at = (s, h, d) => [ax[0] * s + up[0] * h + tw[0] * d, ax[1] * s + up[1] * h + tw[1] * d, ax[2] * s + up[2] * h + tw[2] * d];
  m.gas(() => { for (let i = 0; i < m.n(24000); i++) {
    const r = 0.04 + Math.pow(m.r(), 0.75) * 0.52, th = m.r() * TAU;
    const warp = 0.3 * r * Math.sin(th + r * 4);
    const s = r * Math.cos(th), d = r * Math.sin(th);
    const h = d * (0.3 + warp) + m.g() * 0.02;
    const n = fbm(s * 7, h * 7, d * 7, 3, 51);
    if (m.r() > 0.45 + n) continue;
    m.dust(...at(s, h, d), DUST, 0.02 + 0.024 * m.r(), 0.3);
    if (i % 3 === 0) {
      const edge = m.r() < 0.5 ? 1 : -1;
      const p = at(s, h + edge * 0.03, d);
      if (m.r() < 0.7) m.glow(...p, m.jitter(COL.young, 0.15), 0.008 + 0.008 * m.r(), 0.8);
      else m.glow(...p, m.jitter(COL.ha, 0.1), 0.006 + 0.005 * m.r(), 1.2);
    }
  } });
  m.star(0, 0, 0, [1, 0.92, 0.8], 0.003, 1.3);
};

MODELS.lmc = (m) => {
  const seed = 17;
  // off-centre bar of old stars
  const bc = [0.05, 0, -0.03];
  m.gas(() => { for (let i = 0; i < m.n(7000); i++) {
    const t = (m.r() + m.r() + m.r()) / 1.5 - 1;
    m.glow(bc[0] + t * 0.36, m.g() * 0.02, bc[2] + m.g() * 0.07 * (1 - 0.4 * Math.abs(t)), m.jitter(mix(COL.old, COL.disc, 0.5), 0.1), 0.035 + 0.035 * m.r(), 0.16);
  } });
  // patchy disc, and a single arm wrapping round the north
  m.gas(() => { for (let i = 0; i < m.n(34000); i++) {
    let r = expDisc(m, 0.32, 1), th = m.r() * TAU;
    if (m.r() < 0.3) { th = 0.4 + m.r() * Math.PI * 1.2; r = 0.5 + m.g() * 0.06; }
    const x = r * Math.cos(th), z = r * Math.sin(th);
    const n = fbm(x * 3, z * 3, 0, 4, seed);
    if (m.r() > 0.3 + n * 1.2) continue;
    const big = m.r() < 0.4;
    m.glow(x, m.g() * 0.03, z, m.jitter(mix(COL.disc, COL.young, 0.45 + 0.35 * m.r()), 0.12), big ? 0.06 + 0.04 * m.r() : 0.02 + 0.02 * m.r(), big ? 0.12 : 0.4);
  } });
  // star-forming clouds everywhere
  for (let c = 0; c < 160; c++) {
    const r = Math.sqrt(m.r()) * 0.85, th = m.r() * TAU;
    const cx = r * Math.cos(th), cz = r * Math.sin(th), s = 0.006 + 0.014 * m.r();
    blob(m, 'glow', [cx, 0, cz], s, 12, () => m.jitter(COL.ha, 0.12), 0.006, 0.9, [1, 0.5, 1]);
  }
  // the Tarantula Nebula, with its central cluster R136
  const t = m.ctx.onDisc(m.ctx.fromSky(0.235, 0.117, 0));
  m.ctx.marks.tarantula = t;
  m.gas(() => { for (let i = 0; i < m.n(4500); i++) {
    const r = Math.pow(m.r(), 1.4) * 0.065;
    const [dx, dy, dz] = m.dir();
    const n = ridge(dx * 3 + r * 40, dy * 3, dz * 3 + r * 40, 3, 23);
    if (m.r() > 0.3 + n) continue;
    const col = r < 0.012 ? mix(COL.oiii, COL.white, 0.4) : r < 0.028 ? mix(COL.ha, COL.white, 0.15) : COL.ha;
    m.glow(t[0] + dx * r, t[1] + dy * r * 0.7, t[2] + dz * r, m.jitter(col, 0.12), 0.003 + 0.004 * m.r(), 1.0);
  } });
  for (let i = 0; i < 120; i++) m.star(t[0] + m.g() * 0.002, t[1] + m.g() * 0.0015, t[2] + m.g() * 0.002, COL.young, 0.003, 1.3);
  // SN 1987A
  const sn = m.ctx.onDisc(m.ctx.fromSky(0.185, 0.087, 0));
  m.star(sn[0], sn[1], sn[2], [0.9, 0.6, 0.6], 0.003, 1.2);
  // dust and resolved stars
  m.gas(() => { for (let i = 0; i < m.n(8000); i++) {
    const r = expDisc(m, 0.35, 0.95), th = m.r() * TAU;
    const x = r * Math.cos(th), z = r * Math.sin(th);
    if (m.r() > smooth(0.05, 0.3, fbm(x * 4, 0, z * 4, 4, seed + 3))) continue;
    m.dust(x, m.g() * 0.015, z, DUST, 0.015 + 0.02 * m.r(), 0.28);
  } });
  for (let i = 0; i < 7000; i++) {
    const r = expDisc(m, 0.3, 1), th = m.r() * TAU;
    m.star(r * Math.cos(th), m.g() * 0.03, r * Math.sin(th), m.starColor(0.4), 0.003, 0.55);
  }
};

MODELS.milkyWay = (m) => {
  // Local frame: +x from the centre towards the Sun, +y the north galactic pole, +z the direction the
  // Sun is moving (galactic longitude 90°). The Sun sits 26,670 light-years out, at x = 0.533.
  const sun = 0.5334;
  const pitch = 12, r0 = 0.16, wind = -1;
  const k = wind / Math.tan(pitch * DEG);
  const phase = -k * Math.log(0.44 / r0); // an arm (Sagittarius–Carina) passes 0.44 out, inside the Sun
  spiral(m, {
    arms: 4, pitch, r0, phase, wind, bulge: 0.06, bulgeQ: 0.6, bulgeK: 0.75, bar: 0.17, barAngle: 27 * DEG, barQ: 0.35,
    scale: 0.3, thick: 0.012, armW: 0.03, dustR: 0.022, nBulge: 5000, nBase: 6000, nDisc: 9000, nArm: 16000, nHii: 2400,
    nDust: 13000, armBright: 0.95, seed: 29,
  });
  // the Orion Spur, the short arm the Sun lives in
  m.gas(() => { for (let i = 0; i < m.n(2500); i++) {
    const s = m.u(-0.28, 0.32);
    const r = sun * Math.exp(s * 0.21) + m.g() * 0.012;
    const th = s * 0.95;
    const y = m.g() * 0.006;
    if (i % 3 === 0) m.dust(r * Math.cos(th) - 0.012, y, r * Math.sin(th), DUST, 0.012, 0.2);
    else m.glow(r * Math.cos(th), y, r * Math.sin(th), m.jitter(mix(COL.disc, COL.young, 0.6), 0.1), 0.012 + 0.014 * m.r(), 0.35);
  } });
  globulars(m, 500, 0.25, 1.4);
  m.star(0, 0, 0, [1, 0.85, 0.6], 0.004, 1.0);
};

// ---------------------------------------------------------------- nebulae
MODELS.orion = (m) => {
  const bay = [-0.17, 0.22];
  const bayMask = (x, y) => smooth(0.04, 0.16, Math.hypot((x - bay[0]) * 1.1, (y - bay[1]) * 0.8));
  const zs = (rho) => -0.28 + 0.45 * rho * rho;
  // the glowing wall of the cavity: a bowl opening towards us, carved by the Trapezium stars
  m.gas(() => { for (let i = 0; i < m.n(46000); i++) {
    const rho = m.r() < 0.45 ? -0.2 * Math.log(Math.max(m.r(), 1e-9)) : Math.sqrt(m.r()) * 0.95;
    if (rho > 1) continue;
    const a = m.r() * TAU;
    const x = rho * Math.cos(a), y = (rho * Math.sin(a)) / 1.05;
    const h = 0.03 + 0.1 * rho;
    const z = zs(rho) + m.g() * h * 0.6;
    const n = fbm(x * 3.2, y * 3.2, z * 3.2, 5, 1);
    const wings = (0.6 + 0.4 * Math.cos(2 * a + 0.9)) * (0.55 + 0.45 * smooth(0.4, -0.6, Math.sin(a)));
    const w = (0.2 + 0.8 * smooth(-0.4, 0.35, n)) * bayMask(x, y) * (rho < 0.22 ? 1 : wings) * smooth(1.0, 0.55, rho);
    if (m.r() > w) continue;
    let col = mix(mix(COL.white, COL.oiii, 0.45), COL.ha, smooth(0.05, 0.3, rho));
    col = mix(col, COL.haDeep, smooth(0.45, 0.95, rho) * 0.6);
    if (rho > 0.5 && fbm(x * 2, y * 2, 5, 2, 9) > 0.12) col = mix(col, [0.62, 0.35, 0.95], 0.3);
    const big = m.r() < 0.4;
    m.glow(x, y, z, m.jitter(col, 0.08), big ? 0.05 + 0.07 * rho : 0.012 + 0.03 * rho, big ? 0.16 : 0.42);
  } });
  // the Huygens region: the bright heart round the Trapezium
  m.gas(() => { for (let i = 0; i < m.n(7000); i++) {
    const x = m.g() * 0.11, y = m.g() * 0.1 - 0.02;
    const rho = Math.hypot(x, y);
    if (m.r() > bayMask(x, y)) continue;
    const col = mix(mix(COL.white, COL.oiii, 0.5), COL.ha, smooth(0.04, 0.2, rho));
    m.glow(x, y, zs(rho) + m.g() * 0.03, m.jitter(col, 0.08), 0.02 + 0.03 * m.r(), 0.15);
  } });
  // the Orion Bar: a bright ionisation front south-east of the Trapezium
  m.gas(() => { for (let i = 0; i < m.n(2500); i++) {
    const t = m.u(-1, 1);
    const x = -0.16 - 0.12 * t + m.g() * 0.02, y = -0.16 + 0.12 * t + m.g() * 0.02;
    m.glow(x, y, -0.08 + m.g() * 0.02, m.jitter(mix(COL.ha, COL.sii, 0.35), 0.1), 0.015 + 0.01 * m.r(), 0.3 * (1 - 0.6 * Math.abs(t)));
  } });
  // M43, a small round nebula just north
  m.gas(() => { for (let i = 0; i < m.n(2500); i++) {
    const r = Math.pow(m.r(), 0.8) * 0.1;
    const [dx, dy, dz] = m.dir();
    m.glow(-0.05 + dx * r, 0.43 + dy * r, -0.12 + dz * r * 0.6, m.jitter(mix(COL.ha, COL.white, 0.15 * (1 - r / 0.1)), 0.1), 0.015 + 0.02 * m.r(), 0.35);
  } });
  m.star(-0.05, 0.43, -0.1, COL.young, 0.006, 1.6);
  // dust: the dark bay, the lane dividing M42 from M43, and wisps over the outskirts
  blob(m, 'dust', [bay[0], bay[1] + 0.03, 0.12], 0.06, 3000, DUST, 0.03, 0.45, [1.1, 0.8, 0.6]);
  m.gas(() => { for (let i = 0; i < m.n(2500); i++) {
    const x = m.u(-0.35, 0.25);
    m.dust(x, 0.33 + 0.08 * Math.sin(x * 6) + m.g() * 0.025, 0.05 + m.g() * 0.04, DUST, 0.025 + 0.015 * m.r(), 0.4);
  } });
  m.gas(() => { for (let i = 0; i < m.n(14000); i++) {
    const rho = 0.35 + m.r() * 0.65, a = m.r() * TAU;
    const x = rho * Math.cos(a), y = rho * Math.sin(a), z = zs(rho) + 0.05 + m.g() * 0.06;
    if (m.r() > smooth(0.62, 0.85, ridge(x * 2.5, y * 2.5, z * 2.5, 4, 3))) continue;
    m.dust(x, y, z, DUST, 0.03 + 0.03 * m.r(), 0.35);
  } });
  // the Trapezium and the young cluster around it
  for (const [x, y, b] of [[0.0, 0.004, 2.6], [0.006, -0.002, 1.9], [-0.004, -0.004, 1.8], [-0.007, 0.003, 1.5]]) {
    m.star(x, y, 0.05, [0.75, 0.82, 1.0], 0.012, b);
  }
  m.star(-0.1, -0.15, 0.04, COL.young, 0.01, 1.6); // theta-2 Orionis
  for (let i = 0; i < 1200; i++) {
    const r = plummer(m, 0.08, 0.6);
    const [dx, dy, dz] = m.dir();
    m.star(dx * r, dy * r, 0.05 + dz * r * 0.5, m.starColor(0.65), 0.003, 0.15 + 0.3 * m.r());
  }
  fieldStars(m, 3000);
};

// A pillar of dense gas: dark inside, glowing where the starlight hits it.
function pillar(m, base, toward, len, w0, w1, light) {
  const d = [toward[0] - base[0], toward[1] - base[1], toward[2] - base[2]];
  const dl = Math.hypot(...d);
  const ax = [d[0] / dl, d[1] / dl, d[2] / dl];
  const side = Math.abs(ax[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = [ax[1] * side[2] - ax[2] * side[1], ax[2] * side[0] - ax[0] * side[2], ax[0] * side[1] - ax[1] * side[0]];
  const ul = Math.hypot(...u);
  u[0] /= ul; u[1] /= ul; u[2] /= ul;
  const v = [ax[1] * u[2] - ax[2] * u[1], ax[2] * u[0] - ax[0] * u[2], ax[0] * u[1] - ax[1] * u[0]];
  // as many particles across a thin pillar as a thick one, so all are equally opaque
  const n = Math.round(len * 300000 * (w0 + w1) * Math.min(60, (0.045 / ((w0 + w1) / 2)) ** 2));
  m.gas(() => { for (let i = 0; i < m.n(n); i++) {
    const t = Math.pow(m.r(), 0.9);
    const bend = 0.3 * w0 * Math.sin(t * 3 + base[0] * 10);
    let w = w0 + (w1 - w0) * t;
    if (t > 0.86) w *= 1.25; // a knobbly head
    const a = m.r() * TAU;
    const rr = w * Math.sqrt(m.r()) * (1 + 0.35 * noise3(t * 6, Math.cos(a) * 2, Math.sin(a) * 2, 51));
    const ca = Math.cos(a), sa = Math.sin(a);
    const p = [
      base[0] + ax[0] * t * len + (u[0] * ca + v[0] * sa) * rr + u[0] * bend,
      base[1] + ax[1] * t * len + (u[1] * ca + v[1] * sa) * rr + u[1] * bend,
      base[2] + ax[2] * t * len + (u[2] * ca + v[2] * sa) * rr + u[2] * bend,
    ];
    m.dust(...p, DUST, w * 0.22, 0.9);
  } });
  // the ionisation front: a bright, thin skin just outside the dust where the starlight hits. The pillars
  // point almost at their stars, so it is brightest on the rounded heads, with a thinner edge down the
  // side that faces the stars a little.
  const la = light[0] * ax[0] + light[1] * ax[1] + light[2] * ax[2];
  const lat = [light[0] - ax[0] * la, light[1] - ax[1] * la, light[2] - ax[2] * la];
  const latL = Math.hypot(...lat) || 1;
  const skin = m.jitter(mix(mix(COL.ha, COL.sii, 0.4), COL.white, 0.3), 0.05);
  m.gas(() => { for (let i = 0; i < m.n(Math.round(n * 0.5)); i++) {
    if (m.r() < 0.35) {
      // the head
      const [dx, dy, dz] = m.dir();
      const up = dx * ax[0] + dy * ax[1] + dz * ax[2];
      if (up < 0.15) continue;
      const lit = dx * light[0] + dy * light[1] + dz * light[2];
      const rc = w1 * 1.25 * (1 + 0.3 * noise3(dx * 2, dy * 2, dz * 2, 52)) * (1.04 + 0.12 * m.r());
      const bend = 0.3 * w0 * Math.sin(3 + base[0] * 10);
      const tip = [base[0] + ax[0] * len * 0.93 + u[0] * bend, base[1] + ax[1] * len * 0.93 + u[1] * bend, base[2] + ax[2] * len * 0.93 + u[2] * bend];
      m.glow(tip[0] + dx * rc, tip[1] + dy * rc, tip[2] + dz * rc, m.jitter(skin, 0.1), w1 * 0.1, 24 * (0.4 + 0.6 * Math.max(0, lit)) * smooth(0.15, 0.5, up));
      continue;
    }
    const t = Math.pow(m.r(), 0.7);
    const bend = 0.3 * w0 * Math.sin(t * 3 + base[0] * 10);
    let w = w0 + (w1 - w0) * t;
    if (t > 0.86) w *= 1.25;
    const a = m.r() * TAU;
    const ca = Math.cos(a), sa = Math.sin(a);
    const sx = (u[0] * ca + v[0] * sa), sy = (u[1] * ca + v[1] * sa), sz = (u[2] * ca + v[2] * sa);
    const facing = (sx * lat[0] + sy * lat[1] + sz * lat[2]) / latL;
    if (facing < 0.25) continue;
    const rs = w * (1 + 0.35 * noise3(t * 6, ca * 2, sa * 2, 51)) * (1.05 + 0.1 * m.r());
    m.glow(base[0] + ax[0] * t * len + sx * rs + u[0] * bend, base[1] + ax[1] * t * len + sy * rs + u[1] * bend, base[2] + ax[2] * t * len + sz * rs + u[2] * bend,
      m.jitter(skin, 0.1), w * 0.08, 14 * Math.pow(facing, 1.5) * (0.3 + 1.2 * t * t));
  } });
}

MODELS.eagle = (m) => {
  const cl = [0.22, 0.28, 0.05];
  // a bubble of glowing hydrogen around the cluster's cavity
  m.gas(() => { for (let i = 0; i < m.n(40000); i++) {
    const [dx, dy, dz] = m.dir();
    const r = 0.25 + 0.75 * Math.pow(m.r(), 0.7);
    const x = 0.03 + dx * r, y = 0.05 + dy * r * 0.88, z = dz * r * 0.6;
    const n = fbm(x * 2.6, y * 2.6, z * 2.6, 5, 61);
    const fil = ridge(x * 3.5, y * 3.5, z * 3.5, 4, 62);
    const wall = Math.exp(-((r - 0.52) ** 2) / 0.045) + 0.2;
    const w = wall * (0.08 + 0.92 * smooth(-0.3, 0.35, n) * smooth(0.35, 0.8, fil)) * smooth(1.0, 0.75, r);
    if (m.r() > w) continue;
    const col = mix(mix(COL.oiii, COL.ha, 0.6), mix(COL.ha, COL.haDeep, 0.45), smooth(0.25, 0.7, r));
    const big = m.r() < 0.4;
    m.glow(x, y, z, m.jitter(col, 0.08), big ? 0.07 + 0.05 * r : 0.02 + 0.03 * r, big ? 0.14 : 0.4);
  } });
  // a bright sheet of gas behind the pillars, so they stand out in silhouette
  m.gas(() => { for (let i = 0; i < m.n(9000); i++) {
    const x = -0.05 + m.g() * 0.16, y = -0.24 + m.g() * 0.13, z = -0.14 + m.g() * 0.05;
    m.glow(x, y, z, m.jitter(mix(COL.ha, mix(COL.oiii, COL.white, 0.4), 0.25 * m.r()), 0.08), 0.03 + 0.03 * m.r(), 0.22);
  } });
  // dark clouds: the "eagle" below the cluster, from which the pillars rise
  m.gas(() => { for (let i = 0; i < m.n(12000); i++) {
    const x = -0.06 + m.g() * 0.22, y = -0.5 + m.g() * 0.11 + 0.25 * (x + 0.06) * (x + 0.06), z = m.g() * 0.07;
    const n = fbm(x * 6, y * 6, z * 6, 4, 63);
    if (m.r() > smooth(-0.25, 0.25, n)) continue;
    m.dust(x, y, z, DUST, 0.02 + 0.02 * m.r(), 0.45);
    if (m.r() < 0.12 && y > -0.48) m.glow(x, y + 0.02, z, mix(COL.ha, COL.sii, 0.4), 0.02, 0.35);
  } });
  // the Pillars of Creation and the Spire, all pointing at the cluster that lights them
  const lightFrom = (b) => { const d = [cl[0] - b[0], cl[1] - b[1], cl[2] - b[2]]; const l = Math.hypot(...d); return d.map((v) => v / l); };
  const pillars = [[[-0.14, -0.4, 0.0], 0.17, 0.05, 0.028], [[-0.04, -0.41, -0.02], 0.12, 0.042, 0.022], [[0.05, -0.4, 0.02], 0.08, 0.034, 0.019]];
  for (const [b, len, w0, w1] of pillars) pillar(m, b, [cl[0] - 0.12, cl[1], cl[2]], len, w0, w1, lightFrom(b));
  pillar(m, [-0.42, 0.24, -0.05], cl, 0.25, 0.04, 0.014, lightFrom([-0.42, 0.24, -0.05]));
  // NGC 6611
  for (let i = 0; i < 500; i++) {
    const r = plummer(m, 0.05, 0.35);
    const [dx, dy, dz] = m.dir();
    m.star(cl[0] + dx * r, cl[1] + dy * r, cl[2] + dz * r, m.starColor(0.25), 0.004, 0.15 + 0.45 * m.r());
  }
  for (let i = 0; i < 8; i++) m.star(cl[0] + m.g() * 0.04, cl[1] + m.g() * 0.04, cl[2] + m.g() * 0.04, [0.7, 0.8, 1], 0.01, 1.6);
  fieldStars(m, 3500);
};

MODELS.lagoon = (m) => {
  const hg = [0.27, -0.02, 0.03];
  const lane = (y) => -0.05 + 0.07 * Math.sin(y * 4 + 0.5);
  m.gas(() => { for (let i = 0; i < m.n(46000); i++) {
    const [dx, dy, dz] = m.dir();
    const r = Math.pow(m.r(), 0.6);
    const x = dx * r, y = dy * r * 0.5, z = dz * r * 0.45;
    const n = fbm(x * 3, y * 4, z * 4, 5, 71);
    let w = (0.15 + 0.85 * smooth(-0.35, 0.3, n)) * smooth(1, 0.55, r) * (x > 0 ? 1 : 0.65);
    w *= 0.2 + 0.8 * smooth(0.02, 0.09, Math.abs(x - lane(y)));
    if (m.r() > w) continue;
    let col = mix(COL.ha, COL.haDeep, smooth(0.5, 1.0, Math.abs(x)) * 0.5);
    if (Math.abs(x + 0.15) < 0.15 && fbm(x * 5, y * 5, z * 5, 2, 7) > 0.1) col = mix(col, COL.oiii, 0.22);
    const big = m.r() < 0.4;
    m.glow(x, y, z, m.jitter(col, 0.08), big ? 0.06 + 0.04 * r : 0.018 + 0.02 * r, big ? 0.13 : 0.38);
  } });
  // the Hourglass: the bright heart round Herschel 36
  m.gas(() => { for (let i = 0; i < m.n(5000); i++) {
    const r = Math.abs(m.g()) * 0.035;
    const [dx, dy, dz] = m.dir();
    const pinch = 0.45 + 0.55 * Math.abs(dy);
    m.glow(hg[0] + dx * r * pinch, hg[1] + dy * r * 1.3, hg[2] + dz * r * pinch, m.jitter(mix(mix(COL.white, COL.sii, 0.3), COL.ha, smooth(0, 0.05, r)), 0.1),
      0.006 + 0.008 * m.r(), 0.7);
  } });
  // the lagoon: a winding lane of dust in front of the glow
  m.gas(() => { for (let i = 0; i < m.n(7000); i++) {
    const y = m.u(-0.45, 0.45);
    m.dust(lane(y) + m.g() * 0.035, y, 0.12 + m.g() * 0.05, DUST, 0.03 + 0.02 * m.r(), 0.42);
  } });
  // Bok globules: small dark knots near the bright part
  for (let b = 0; b < 16; b++) {
    const c = [m.u(0.05, 0.6), m.u(-0.22, 0.22), m.u(0.05, 0.2)], s = m.u(0.005, 0.014);
    blob(m, 'dust', c, s, 140, DUST, s * 1.4, 0.55);
  }
  // Herschel 36, 9 Sagittarii and the cluster NGC 6530
  m.star(...hg, [0.75, 0.82, 1.0], 0.01, 2.4);
  m.star(-0.12, 0.08, 0.06, [0.75, 0.82, 1.0], 0.01, 2.0);
  for (let i = 0; i < 450; i++) {
    const r = plummer(m, 0.06, 0.3);
    const [dx, dy, dz] = m.dir();
    m.star(-0.38 + dx * r, dy * r, 0.05 + dz * r, m.starColor(0.3), 0.005, 0.4 + 0.8 * m.r());
  }
  fieldStars(m, 3500);
};

MODELS.carina = (m) => {
  const eta = [0, 0, 0], tr14 = [0.17, 0.17, 0.02];
  // the dark V-shaped lane
  const vDist = (x, y) => {
    const arm = (ax, ay) => { const t = clamp01((x * ax + (y + 0.08) * ay) / (ax * ax + ay * ay)); return Math.hypot(x - ax * t, y + 0.08 - ay * t); };
    return Math.min(arm(-0.55, -0.5), arm(0.5, -0.55));
  };
  m.gas(() => { for (let i = 0; i < m.n(50000); i++) {
    const [dx, dy, dz] = m.dir();
    const r = Math.pow(m.r(), 0.65);
    const x = dx * r, y = dy * r * 0.95, z = dz * r * 0.7;
    const n = fbm(x * 3, y * 3, z * 3, 5, 81);
    const core = Math.exp(-(r * r) / 0.05) + 0.7 * Math.exp(-(Math.hypot(x - tr14[0], y - tr14[1], z) ** 2) / 0.02);
    let w = (0.12 + 0.88 * smooth(-0.3, 0.3, n)) * (smooth(1, 0.55, r) * 0.8 + core);
    w *= 0.25 + 0.75 * smooth(0.02, 0.1, vDist(x, y));
    if (m.r() > w) continue;
    const rc = Math.min(Math.hypot(x, y, z), Math.hypot(x - tr14[0], y - tr14[1], z) * 1.2);
    let col = mix(mix(COL.heii, COL.oiii, 0.5), COL.ha, smooth(0.08, 0.35, rc));
    col = mix(col, COL.sii, smooth(0.45, 0.95, rc) * 0.45);
    const big = m.r() < 0.4;
    m.glow(x, y, z, m.jitter(col, 0.08), big ? 0.06 + 0.04 * r : 0.015 + 0.025 * r, big ? 0.13 : 0.38);
  } });
  // dust: the V, plus dark filaments and pillars round the edges
  m.gas(() => { for (let i = 0; i < m.n(11000); i++) {
    const t = m.r(), left = m.r() < 0.5;
    const ax = left ? -0.55 : 0.5, ay = left ? -0.5 : -0.55;
    const wob = 0.06 * fbm(t * 4, left ? 1 : 5, 0, 3, 85);
    const w = (0.02 + 0.04 * t) * (0.6 + 0.8 * Math.abs(fbm(t * 6, left ? 2 : 7, 1, 2, 86)) * 2);
    if (m.r() > 0.35 + 0.65 * smooth(-0.3, 0.2, fbm(t * 9, left ? 3 : 8, 2, 3, 87))) continue;
    m.dust(ax * t - ay * wob + m.g() * w, -0.08 + ay * t + ax * wob + m.g() * w, 0.08 + m.g() * 0.06, DUST, 0.025 + 0.025 * m.r(), 0.5);
  } });
  m.gas(() => { for (let i = 0; i < m.n(20000); i++) {
    const [dx, dy, dz] = m.dir();
    const r = 0.35 + 0.65 * m.r();
    const x = dx * r, y = dy * r, z = dz * r * 0.5;
    if (m.r() > smooth(0.6, 0.85, ridge(x * 3, y * 3, z * 3, 4, 83))) continue;
    m.dust(x, y, z, DUST, 0.025 + 0.02 * m.r(), 0.42);
  } });
  // Mystic Mountain, and the Keyhole beside Eta Carinae
  pillar(m, [0.1, -0.385, 0], [0.05, 0.0, 0], 0.035, 0.008, 0.004, [0, 1, 0]);
  // the Keyhole: a dark cloud with a rounded head and a narrow stem, clumpy at every scale
  const kh = [-0.03, 0.045, 0.03];
  m.gas(() => { for (let i = 0; i < m.n(5000); i++) {
    let x, y;
    if (m.r() < 0.55) { const a = m.r() * TAU, r = 0.011 * Math.sqrt(m.r()); x = Math.cos(a) * r * 1.15; y = 0.006 + Math.sin(a) * r; }
    else { const t = m.r(); y = 0.003 - t * 0.026; x = (m.r() - 0.5) * 2 * (0.009 * (1 - t) + 0.0025) + 0.004 * Math.sin(t * 5); }
    const z = m.g() * 0.004;
    const n = fbm(x * 260, y * 260, z * 260, 4, 88);
    if (m.r() > smooth(-0.4, 0.3, n)) continue;
    m.dust(kh[0] + x, kh[1] + y, kh[2] + z, DUST, 0.002 + 0.003 * m.r(), 0.4 + 0.4 * smooth(-0.1, 0.4, n));
    // its edges lit by Eta Carinae
    if (m.r() < 0.12) m.glow(kh[0] + x * 1.15, kh[1] + y * 1.1, kh[2] + z, m.jitter(mix(COL.ha, COL.white, 0.35), 0.1), 0.0015, 5);
  } });
  // Eta Carinae and the Homunculus: two lobes along position angle 310°
  const axis = [-Math.sin(310 * DEG), Math.cos(310 * DEG), 0];
  m.gas(() => { for (let i = 0; i < m.n(1600); i++) {
    const side = m.r() < 0.5 ? 1 : -1;
    const [dx, dy, dz] = m.dir();
    const R = 0.0011;
    const c = [axis[0] * R * side, axis[1] * R * side, 0];
    m.glow(c[0] + dx * R * 0.85, c[1] + dy * R * 0.85, c[2] + dz * R * 0.85, m.jitter([1, 0.55, 0.35], 0.12), 0.0003, 0.9);
  } });
  m.star(...eta, [1, 0.9, 0.75], 0.01, 3);
  // Trumpler 14 and Trumpler 16
  for (const [c, n] of [[tr14, 500], [[-0.02, -0.03, 0], 500]]) {
    for (let i = 0; i < n; i++) {
      const r = plummer(m, 0.025, 0.2);
      const [dx, dy, dz] = m.dir();
      m.star(c[0] + dx * r, c[1] + dy * r, c[2] + dz * r, m.starColor(0.25), 0.003, 0.4 + 0.8 * m.r());
    }
  }
  fieldStars(m, 5000);
};

MODELS.crab = (m) => {
  // semi-axes: long along local y (turned to position angle 125° on the sky)
  const A = [0.68, 1.0, 0.68];
  // blue synchrotron glow filling the inside
  m.gas(() => { for (let i = 0; i < m.n(16000); i++) {
    const [dx, dy, dz] = m.dir();
    const s = Math.cbrt(m.r()) * 0.85;
    const x = dx * A[0] * s, y = dy * A[1] * s, z = dz * A[2] * s;
    const w = (1 - (s / 0.85) ** 2) * (0.2 + 0.8 * smooth(-0.4, 0.4, fbm(x * 4, y * 4, z * 4, 4, 91)));
    if (m.r() > w) continue;
    m.glow(x, y, z, m.jitter(mix(COL.sync, COL.white, 0.25), 0.1), 0.05 + 0.05 * m.r(), 0.2);
  } });
  // the cage of filaments
  for (let f = 0; f < 300; f++) {
    let [x, y, z] = m.dir();
    const s0 = 0.55 + 0.45 * Math.sqrt(m.r());
    x *= A[0] * s0; y *= A[1] * s0; z *= A[2] * s0;
    let [dx, dy, dz] = m.dir();
    const pts = [];
    const steps = 14 + Math.floor(m.r() * 26);
    for (let s = 0; s < steps; s++) {
      pts.push([x, y, z]);
      dx += 0.5 * noise3(x * 6, y * 6, z * 6, f); dy += 0.5 * noise3(x * 6 + 9, y * 6, z * 6, f); dz += 0.5 * noise3(x * 6, y * 6 + 9, z * 6, f);
      // stay near the shell: remove most of the outward part of the step
      const nl = Math.hypot(x / A[0], y / A[1], z / A[2]) + 1e-6;
      const nx = x / A[0] / nl, ny = y / A[1] / nl, nz = z / A[2] / nl;
      const dd = dx * nx + dy * ny + dz * nz;
      dx -= nx * dd * 0.8; dy -= ny * dd * 0.8; dz -= nz * dd * 0.8;
      const l = Math.hypot(dx, dy, dz) + 1e-9;
      x += (dx / l) * 0.025; y += (dy / l) * 0.025; z += (dz / l) * 0.025;
    }
    const hue = m.r();
    const col = hue < 0.55 ? mix(COL.sii, COL.nii, m.r()) : hue < 0.85 ? mix(COL.ha, COL.sii, 0.5) : [1.0, 0.82, 0.45];
    strand(m, pts, 'glow', col, 0.008, 0.022, 0.7, 6);
  }
  // the pulsar and its wind: a small ring and jets
  m.star(0, 0, 0, [0.9, 0.95, 1], 0.012, 3);
  m.gas(() => { for (let i = 0; i < m.n(900); i++) {
    const a = m.r() * TAU, r = 0.05 + m.g() * 0.006;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    m.glow(x, z * 0.4, z, m.jitter(mix(COL.sync, COL.white, 0.5), 0.1), 0.008, 0.6);
  } });
  m.gas(() => { for (let i = 0; i < m.n(300); i++) {
    const t = m.u(-0.09, 0.09);
    m.glow(m.g() * 0.004, t, -t * 0.4 + m.g() * 0.004, COL.sync, 0.006, 0.6);
  } });
  fieldStars(m, 1800);
};

MODELS.ring = (m) => {
  // A thick ring (the waist of a barrel-shaped shell) whose axis is tipped 30° from our line of sight.
  // Inside it glows blue and teal (helium and oxygen near the hot star), outside yellow, then red.
  const tilt = 30 * DEG;
  const ax = [0, Math.sin(tilt), Math.cos(tilt)];
  const ex = [1, 0, 0];
  const ey = [0, Math.cos(tilt), -Math.sin(tilt)];
  const toWorld = (lx, ly, lz) => [lx * ex[0] + ly * ey[0] + lz * ax[0], lx * ex[1] + ly * ey[1] + lz * ax[1], lx * ex[2] + ly * ey[2] + lz * ax[2]];
  const gold = [0.95, 0.78, 0.5];
  const grad = (t) => (t < 0.35 ? mix(COL.heii, COL.oiii, t / 0.35) : t < 0.58 ? mix(COL.oiii, gold, (t - 0.35) / 0.23)
    : mix(gold, COL.nii, Math.min(1, (t - 0.58) / 0.22)));
  m.gas(() => { for (let i = 0; i < m.n(46000); i++) {
    const a = m.r() * TAU;
    const t = clamp01(0.5 + m.g() * 0.2);
    const rr = (0.4 + 0.4 * t) * (1 + 0.07 * fbm(Math.cos(a) * 3, Math.sin(a) * 3, t * 2, 3, 101)) * (1 + 0.1 * Math.cos(2 * a));
    const h = m.g() * (0.12 + 0.2 * t); // the barrel flares a little towards its outer edge
    const p = toWorld(Math.cos(a) * rr, Math.sin(a) * rr, h);
    const tex = 0.55 + 0.45 * smooth(-0.3, 0.3, fbm(p[0] * 9, p[1] * 9, p[2] * 9, 3, 103));
    m.glow(...p, m.jitter(grad(t), 0.06), 0.014 + 0.016 * m.r(), 0.62 * (0.4 + 0.6 * smooth(0.15, 0.6, t)) * tex);
  } });
  // faint caps of the barrel, and pale blue gas inside
  m.gas(() => { for (let i = 0; i < m.n(6000); i++) {
    const [dx, dy, dz] = m.dir();
    const s = 0.6 + 0.1 * m.r();
    m.glow(...toWorld(dx * s, dy * s, dz * s * 1.4), m.jitter(mix(COL.oiii, COL.heii, 0.5), 0.08), 0.03 + 0.02 * m.r(), 0.06);
  } });
  m.gas(() => { for (let i = 0; i < m.n(5000); i++) {
    const r = Math.sqrt(m.r()) * 0.42, a = m.r() * TAU;
    m.glow(...toWorld(Math.cos(a) * r, Math.sin(a) * r, m.g() * 0.2), m.jitter(mix(COL.heii, COL.oiii, 0.35), 0.08), 0.04 + 0.02 * m.r(), 0.2);
  } });
  // dark knots on the inner edge, and the faint outer halo of loops
  for (let i = 0; i < 3000; i++) {
    const a = m.r() * TAU, r = 0.4 + 0.08 * m.r();
    m.dust(...toWorld(Math.cos(a) * r, Math.sin(a) * r, m.g() * 0.08), DUST, 0.007, 0.35);
  }
  m.gas(() => { for (let i = 0; i < m.n(7000); i++) {
    const a = m.r() * TAU;
    const petal = 0.86 + 0.12 * Math.abs(Math.sin(a * 5)) + m.g() * 0.025;
    m.glow(Math.cos(a) * petal, Math.sin(a) * petal, m.g() * 0.25, m.jitter(mix(COL.nii, COL.ha, 0.4), 0.1), 0.025 + 0.02 * m.r(), 0.03);
  } });
  m.star(0, 0, 0, [0.85, 0.9, 1], 0.004, 1.2);
  fieldStars(m, 1200);
};

MODELS.helix = (m) => {
  // inner disc ring, nearly face-on, and an outer ring tipped well over
  const ring = (n, r0, r1, tilt, rot, colIn, colOut, alpha) => {
    const ct = Math.cos(tilt), st = Math.sin(tilt), cr = Math.cos(rot), sr = Math.sin(rot);
    m.gas(() => { for (let i = 0; i < m.n(n); i++) {
      const a = m.r() * TAU;
      const t = clamp01(0.45 + m.g() * 0.25);
      const r = (r0 + (r1 - r0) * t) * (1 + 0.1 * fbm(Math.cos(a) * 3, Math.sin(a) * 3, r0 * 7, 3, 111));
      let x = Math.cos(a) * r, y = Math.sin(a) * r, z = m.g() * 0.04;
      [y, z] = [y * ct - z * st, y * st + z * ct];
      [x, y] = [x * cr - y * sr, x * sr + y * cr];
      m.glow(x, y, z, m.jitter(mix(colIn, colOut, t), 0.1), 0.016 + 0.022 * m.r(), alpha);
    } });
  };
  ring(26000, 0.28, 0.62, 15 * DEG, 0, mix([1.0, 0.72, 0.32], COL.ha, 0.35), COL.haDeep, 0.38);
  ring(14000, 0.62, 0.98, 62 * DEG, 25 * DEG, COL.ha, COL.haDeep, 0.28);
  // the teal heart
  m.gas(() => { for (let i = 0; i < m.n(10000); i++) {
    const r = Math.sqrt(m.r()) * 0.38;
    const a = m.r() * TAU;
    m.glow(Math.cos(a) * r, Math.sin(a) * r, m.g() * 0.08, m.jitter(mix(COL.oiii, COL.heii, 0.45 * (1 - r / 0.38)), 0.08), 0.035 + 0.02 * m.r(), 0.18);
  } });
  // cometary knots: red heads with faint tails pointing away from the star (each one a fixed structure,
  // so detailed bakes sharpen them rather than adding more)
  for (let i = 0; i < 1500; i++) {
    const a = m.r() * TAU, r = 0.28 + Math.pow(m.r(), 1.5) * 0.3;
    const x = Math.cos(a) * r, y = Math.sin(a) * r, z = m.g() * 0.05;
    const s = 0.7 + 0.6 * m.r();
    m.dust(x, y, z, DUST, 0.009 * s, 0.8);
    m.glow(x - Math.cos(a) * 0.005 * s, y - Math.sin(a) * 0.005 * s, z, mix(COL.ha, COL.white, 0.3), 0.009 * s, 2.2);
    for (let t = 1; t <= 5; t++) m.glow(x + Math.cos(a) * 0.009 * t * s, y + Math.sin(a) * 0.009 * t * s, z, COL.ha, 0.01 * s, 0.7 / t);
  }
  m.star(0, 0, 0, [0.85, 0.9, 1], 0.006, 1.6);
  fieldStars(m, 2000);
};

// Point-in-polygon and distance to the outline, for the Horsehead's silhouette.
function insidePoly(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function polyDist(poly, x, y) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i];
    const dx = bx - ax, dy = by - ay;
    const t = clamp01(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy));
    best = Math.min(best, Math.hypot(x - ax - dx * t, y - ay - dy * t));
  }
  return best;
}

MODELS.horsehead = (m) => {
  // Drawn as the familiar picture: the dark cloud below, glowing IC 434 above, lit from the top by
  // Sigma Orionis. The catalogue entry turns it on the sky so the light comes from the west.
  const S = 1.45;
  const head = [
    [-0.1, -0.32], [-0.085, -0.16], [-0.1, -0.04], [-0.13, 0.05], [-0.14, 0.15], [-0.115, 0.22], [-0.1, 0.3], [-0.075, 0.235],
    [-0.045, 0.285], [-0.02, 0.215], [0.05, 0.18], [0.12, 0.115], [0.18, 0.04], [0.225, -0.015], [0.235, -0.06], [0.21, -0.095],
    [0.16, -0.095], [0.11, -0.075], [0.07, -0.085], [0.045, -0.13], [0.035, -0.2], [0.05, -0.32],
  ].map(([x, y]) => [x * S, y * S + 0.06]);
  const edge = (x) => -0.3 + 0.07 * fbm(x * 4, 0, 0, 3, 121) + 0.04 * Math.sin(x * 2.5);
  // IC 434: a glowing curtain behind, brighter towards the star, streaked by its light
  m.gas(() => { for (let i = 0; i < m.n(42000); i++) {
    const x = m.u(-1, 1), y = m.u(-0.4, 1), z = -0.32 + m.g() * 0.08;
    const streak = 0.4 + 0.6 * smooth(-0.3, 0.3, fbm(x * 14, y * 1.1, z * 4, 4, 123));
    const w = smooth(-0.4, 0.55, y) * streak * smooth(1.05, 0.5, Math.hypot(x * 0.95, (y - 0.25) * 1.15));
    if (m.r() > w) continue;
    const big = m.r() < 0.6;
    m.glow(x, y, z, m.jitter(mix(COL.ha, COL.haDeep, 0.3 * m.r()), 0.06), big ? 0.07 + 0.03 * m.r() : 0.02 + 0.015 * m.r(), big ? 0.12 : 0.3);
  } });
  // the dark cloud L1630, with a bright rim where the light grazes its top
  m.gas(() => { for (let i = 0; i < m.n(16000); i++) {
    const x = m.u(-1, 1), y = edge(x) - Math.abs(m.g()) * 0.38, z = m.g() * 0.12;
    if (m.r() > smooth(1.05, 0.6, Math.hypot(x, (y + 0.3) * 0.9))) continue;
    m.dust(x, y, z, DUST, 0.05 + 0.03 * m.r(), 0.8);
  } });
  m.gas(() => { for (let i = 0; i < m.n(4000); i++) {
    const x = m.u(-1, 1);
    m.glow(x, edge(x) + 0.01 + Math.abs(m.g()) * 0.012, m.g() * 0.08, mix(COL.ha, COL.sii, 0.3), 0.014, 0.45 * smooth(1, 0.7, Math.abs(x)));
  } });
  // the head and neck, in silhouette, rimmed with light along the top
  m.volume(26000, 0.36, 0.5, 0.1, (x, y, z) => {
    if (!insidePoly(head, x, y)) return 0;
    const d = polyDist(head, x, y);
    const n = fbm(x * 12, y * 12, z * 12, 3, 125);
    return smooth(-0.004, 0.02, d + 0.01 * n) * Math.exp(-(z * z) / 0.005);
  }, (x, y, z) => m.dust(x, y, z, DUST, 0.014 + 0.01 * m.r(), 0.95), 0, 0.08, 0);
  m.gas(() => { for (let i = 0; i < m.n(6000); i++) {
    const k = Math.floor(m.r() * head.length);
    const [ax, ay] = head[k], [bx, by] = head[(k + 1) % head.length];
    const t = m.r();
    const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
    // the outline runs clockwise, so this normal points out of the head
    const nx = -(by - ay), ny = bx - ax;
    const nl = Math.hypot(nx, ny);
    if (ny / nl < 0.2 || y < edge(x) + 0.02) continue; // only edges facing the light
    m.glow(x + (nx / nl) * 0.008, y + (ny / nl) * 0.008, m.g() * 0.03, mix(COL.ha, COL.sii, 0.35), 0.01, 0.75 * (0.35 + 0.65 * smooth(-0.4, 0.4, fbm(x * 9, y * 9, 0, 3, 126))));
  } });
  // NGC 2023: a blue reflection nebula round a bright young star, in front of the dark cloud
  m.gas(() => { for (let i = 0; i < m.n(3000); i++) {
    const r = Math.abs(m.g()) * 0.09;
    const [dx, dy, dz] = m.dir();
    m.glow(-0.55 + dx * r, -0.6 + dy * r, 0.22 + dz * r, m.jitter(COL.refl, 0.1), 0.025 + 0.025 * m.r(), 0.3);
  } });
  m.star(-0.55, -0.6, 0.22, [0.8, 0.86, 1], 0.012, 2.2);
  for (let i = 0; i < 500; i++) m.star(m.u(-1, 1), m.u(-1, 1), m.u(-0.2, 0.4), m.starColor(0.5), 0.004, 0.25 + 0.6 * m.r());
  fieldStars(m, 2500);
};

MODELS.veil = (m) => {
  // filaments of a supernova shock: thin sheets on a sphere, brightest where we see them edge-on
  const arcs = [[0.85, -0.1, 0.22, 70], [-0.85, -0.05, 0.22, 70], [-0.15, 0.6, 0.45, 30], [0.3, 0.75, 0.3, 20], [0.0, -0.8, 0.3, 25]];
  const limb = (p) => { const l = Math.hypot(...p); const z = Math.abs(p[2]) / l; return 0.15 + 2.2 * (1 - z) ** 3; };
  for (let f = 0; f < 280; f++) {
    let c;
    if (f < 250) {
      const a = arcs[Math.min(arcs.length - 1, Math.floor(m.r() * m.r() * arcs.length * 1.4))];
      c = [a[0] + m.g() * a[2], a[1] + m.g() * a[2], 0];
      const l = Math.hypot(c[0], c[1]);
      if (l > 0.98) { c[0] *= 0.98 / l; c[1] *= 0.98 / l; }
      c[2] = Math.sqrt(Math.max(0, 1 - c[0] * c[0] - c[1] * c[1])) * (m.r() < 0.6 ? 1 : -1);
    } else c = m.dir();
    let p = c.slice();
    let t = m.dir();
    const pts = [];
    const steps = 25 + Math.floor(m.r() * 45);
    for (let s = 0; s < steps; s++) {
      const R = 0.9 + 0.08 * fbm(p[0] * 3, p[1] * 3, p[2] * 3, 3, 131);
      const l = Math.hypot(...p);
      pts.push([(p[0] / l) * R, (p[1] / l) * R, (p[2] / l) * R]);
      t = [t[0] + 0.35 * noise3(p[0] * 5, p[1] * 5, p[2] * 5, f), t[1] + 0.35 * noise3(p[0] * 5 + 7, p[1] * 5, p[2] * 5, f), t[2] + 0.35 * noise3(p[0] * 5, p[1] * 5 + 7, p[2] * 5, f)];
      const d = (t[0] * p[0] + t[1] * p[1] + t[2] * p[2]) / (l * l);
      t = [t[0] - p[0] * d, t[1] - p[1] * d, t[2] - p[2] * d];
      const tl = Math.hypot(...t) + 1e-9;
      p = [p[0] + (t[0] / tl) * 0.018, p[1] + (t[1] / tl) * 0.018, p[2] + (t[2] / tl) * 0.018];
    }
    const mixO = m.r();
    const bright = f < 250 ? 1 : 0.4;
    // hydrogen on the inside of the sheet, oxygen just outside it
    strand(m, pts, 'glow', mix(COL.ha, COL.haDeep, 0.25), 0.004, 0.013, (q) => 0.4 * bright * (0.35 + 0.65 * (1 - mixO)) * limb(q), 6);
    strand(m, pts.map(([x, y, z]) => [x * 1.014, y * 1.014, z * 1.014]), 'glow', COL.oiii, 0.005, 0.014,
      (q) => 0.38 * bright * (0.35 + 0.65 * mixO) * limb(q), 6);
  }
  // a faint glow over the whole bubble
  m.gas(() => { for (let i = 0; i < m.n(6000); i++) {
    const [x, y, z] = m.dir();
    const r = 0.75 + 0.2 * m.r();
    m.glow(x * r, y * r, z * r, m.jitter(mix(COL.ha, COL.oiii, m.r()), 0.1), 0.07, 0.035);
  } });
  m.star(0.82, -0.12, 0.15, [1, 0.85, 0.6], 0.01, 1.8); // 52 Cygni, in front of the Witch's Broom
  for (let i = 0; i < 700; i++) m.star(m.u(-1.1, 1.1), m.u(-1.1, 1.1), m.u(-1, 1), m.starColor(0.5), 0.004, 0.2 + 0.6 * m.r());
  fieldStars(m, 3500);
};

// ---------------------------------------------------------------- star clusters
const PLEIADES = [
  ['Alcyone', 56.8711, 24.1051, 2.87], ['Atlas', 57.2904, 24.0534, 3.62], ['Electra', 56.2189, 24.1133, 3.70],
  ['Maia', 56.4567, 24.3678, 3.87], ['Merope', 56.5817, 23.9483, 4.18], ['Taygeta', 56.3021, 24.4672, 4.30],
  ['Pleione', 57.2967, 24.1367, 5.05], ['Celaeno', 56.2008, 24.2894, 5.45], ['Asterope', 56.4767, 24.5544, 5.76],
];

MODELS.pleiades = (m, entry) => {
  const k = (entry.dist * DEG) / entry.radius; // degrees on the sky → radii
  const cosd = Math.cos(entry.dec * DEG);
  const stars = {};
  for (const [name, ra, dec, mag] of PLEIADES) {
    const x = -(ra - entry.ra) * cosd * k, y = (dec - entry.dec) * k, z = m.g() * 0.08;
    stars[name] = [x, y, z];
    m.star(x, y, z, [0.68, 0.78, 1.0], 0.012, 3.2 * Math.pow(10, -0.4 * (mag - 2.87)) + 0.6);
  }
  m.ctx.stars = stars;
  // the blue reflection nebula: haze round the bright stars, streaked along one direction
  const streak = [Math.cos(-0.6), Math.sin(-0.6)];
  for (const [name, n, s, dy] of [['Merope', 9000, 0.12, -0.05], ['Maia', 5500, 0.09, 0], ['Electra', 4500, 0.08, 0], ['Alcyone', 5000, 0.09, 0], ['Taygeta', 3000, 0.07, 0], ['Atlas', 2500, 0.06, 0]]) {
    const c = stars[name];
    m.gas(() => { for (let i = 0; i < m.n(n); i++) {
      const a = m.g() * s * 1.5, b = m.g() * s * 0.8;
      const x = c[0] + a * streak[0] - b * streak[1], y = c[1] + dy + a * streak[1] + b * streak[0];
      const z = c[2] + m.g() * s * 0.5;
      const wisp = ridge((x * streak[1] - y * streak[0]) * 14, (x * streak[0] + y * streak[1]) * 2, z * 4, 3, 141);
      if (m.r() < 0.3) m.glow(x, y, z, m.jitter(COL.refl, 0.06), 0.04 + 0.03 * m.r(), 0.045);
      else if (m.r() < smooth(0.45, 0.9, wisp)) m.glow(x, y, z, m.jitter(COL.refl, 0.08), 0.008 + 0.01 * m.r(), 0.4);
    } });
  }
  for (let i = 0; i < 1100; i++) {
    const r = plummer(m, 0.25, 2.0);
    const [dx, dy, dz] = m.dir();
    const cool = Math.pow(m.r(), 0.5);
    m.star(dx * r, dy * r, dz * r, m.starColor(0.1 + cool * 0.8), 0.004, 0.25 + (1 - cool) * 1.2);
  }
};

MODELS.omegaCen = (m) => {
  m.gas(() => { for (let i = 0; i < m.n(16000); i++) {
    const r = plummer(m, 0.14, 1);
    const [dx, dy, dz] = m.dir();
    m.glow(dx * r, dy * r * 0.93, dz * r, m.jitter(mix(COL.old, COL.disc, 0.3), 0.08), 0.03 + 0.08 * r, 0.13);
  } });
  for (let i = 0; i < 45000; i++) {
    const r = plummer(m, 0.15, 1);
    const [dx, dy, dz] = m.dir();
    const t = m.r();
    const col = t < 0.03 ? COL.young : t < 0.12 ? [1, 0.62, 0.4] : m.starColor(0.62);
    m.star(dx * r, dy * r * 0.93, dz * r, col, 0.003, t < 0.12 ? 1.2 : 0.6);
  }
};

// Builds the particle layers for one catalogue entry.
export function buildModel(entry, ctx, k = 1) {
  const fn = MODELS[entry.model];
  if (!fn) throw new Error(`No model for ${entry.id}`);
  let seed = 0;
  for (let i = 0; i < entry.id.length; i++) seed = Math.imul(seed ^ entry.id.charCodeAt(i), 16777619) + 7;
  const m = new Model(seed, ctx, k);
  fn(m, entry);
  return m.build();
}
