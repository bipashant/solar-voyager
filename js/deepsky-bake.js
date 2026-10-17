// Bakes a deep-sky model into a 3D volume texture, off the main thread (see deepsky-worker.js).
//
// Every glow and dust particle is a soft gaussian blob. Rather than drawing hundreds of thousands of
// them each frame as sprites (which looks grainy up close), they are splatted once into a 3D grid of
// emission (RGB) and extinction (A) and ray-marched in the shader. Blobs of different sizes go into a
// pyramid of grids, one per octave of size, which are blurred and added back up into the finest grid,
// so a particle's size costs nothing. Values are stored as cube roots in 8 bits, giving a dynamic range
// of about a million to one where it matters, in the faint outskirts.
import { buildModel } from './deepsky-models.js';
import { DSO } from './deepsky-data.js';

const DEG = Math.PI / 180;
const SIGMA = 0.177; // a sprite of size s fades like a gaussian of sigma 0.177 s
const TWO_PI = Math.PI * 2;

// The same sky helpers the main thread uses (DeepSky.ctxFor), from plain arrays.
export function makeCtx(job) {
  const { x, y, z } = job.axes, { r, east, north } = job.sky;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const fromSky = (e, n, t) => {
    const v = [east[0] * e + north[0] * n - r[0] * t, east[1] * e + north[1] * n - r[1] * t, east[2] * e + north[2] * n - r[2] * t];
    return [dot(v, x), dot(v, y), dot(v, z)];
  };
  const toward = fromSky(0, 0, 1);
  return {
    fromSky,
    toward,
    skyDir: (pa) => fromSky(Math.sin(pa * DEG), Math.cos(pa * DEG), 0),
    onDisc: (v) => {
      if (!job.disc || Math.abs(toward[1]) < 1e-3) return v;
      const k = -v[1] / toward[1];
      return [v[0] + k * toward[0], 0, v[2] + k * toward[2]];
    },
    companions: {}, marks: {}, stars: {},
  };
}

// ---------------------------------------------------------------- grid helpers
// Box holding nearly all the gas and dust, padded by each blob's own size.
function bounds(layers, maxR) {
  const lo = [[], [], []], hi = [[], [], []];
  for (const L of [layers.glow, layers.dust]) {
    const step = Math.max(1, Math.floor(L.count / 30000));
    for (let i = 0; i < L.count; i += step) {
      const m = 3 * SIGMA * L.size[i];
      for (let a = 0; a < 3; a++) { lo[a].push(L.pos[i * 3 + a] - m); hi[a].push(L.pos[i * 3 + a] + m); }
    }
  }
  const min = [0, 0, 0], max = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    let mn = Infinity, mx = -Infinity;
    for (const v of lo[a]) if (v < mn) mn = v;
    for (const v of hi[a]) if (v > mx) mx = v;
    min[a] = Math.max(-maxR, mn);
    max[a] = Math.min(maxR, mx);
    if (max[a] - min[a] < 0.02) { const c = (max[a] + min[a]) / 2; min[a] = c - 0.01; max[a] = c + 0.01; }
  }
  return { min, max };
}

class Grid {
  constructor(nx, ny, nz, voxel, min) {
    this.nx = nx; this.ny = ny; this.nz = nz; this.voxel = voxel; this.min = min;
    this.d = new Float32Array(nx * ny * nz * 4);
  }

  // Trilinear deposit of (r, g, b, ext) densities at a point.
  add(x, y, z, r, g, b, e) {
    const v = this.voxel, nx = this.nx, ny = this.ny, nz = this.nz;
    const fx = (x - this.min[0]) / v - 0.5, fy = (y - this.min[1]) / v - 0.5, fz = (z - this.min[2]) / v - 0.5;
    const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
    const tx = fx - ix, ty = fy - iy, tz = fz - iz;
    const d = this.d;
    for (let c = 0; c < 8; c++) {
      const X = ix + (c & 1), Y = iy + ((c >> 1) & 1), Z = iz + ((c >> 2) & 1);
      if (X < 0 || Y < 0 || Z < 0 || X >= nx || Y >= ny || Z >= nz) continue;
      const w = ((c & 1) ? tx : 1 - tx) * ((c & 2) ? ty : 1 - ty) * ((c & 4) ? tz : 1 - tz);
      const k = (X + nx * (Y + ny * Z)) * 4;
      d[k] += r * w; d[k + 1] += g * w; d[k + 2] += b * w; d[k + 3] += e * w;
    }
  }

  // Separable blur, zero outside the grid: wide is [1,4,6,4,1]/16 for the coarse levels; the finest level
  // only gets a light [1,6,1]/8, enough to smooth the splats without halving the resolution.
  blur(wide) {
    const dims = [this.nx, this.ny, this.nz];
    const strides = [4, this.nx * 4, this.nx * this.ny * 4];
    const d = this.d;
    const maxN = Math.max(...dims);
    const line = new Float32Array((maxN + 4) * 4); // two cells of zero padding at each end
    for (let axis = 0; axis < 3; axis++) {
      const n = dims[axis], st = strides[axis];
      const o1 = axis === 0 ? 1 : 0, o2 = axis === 2 ? 1 : 2;
      const n1 = dims[o1], n2 = dims[o2], s1 = strides[o1], s2 = strides[o2];
      line.fill(0);
      for (let b = 0; b < n2; b++) {
        for (let a = 0; a < n1; a++) {
          const base = a * s1 + b * s2;
          for (let i = 0, k = base; i < n; i++, k += st) {
            const j = (i + 2) * 4;
            line[j] = d[k]; line[j + 1] = d[k + 1]; line[j + 2] = d[k + 2]; line[j + 3] = d[k + 3];
          }
          for (let i = 0, k = base; i < n; i++, k += st) {
            const j = (i + 2) * 4;
            for (let ch = 0; ch < 4; ch++) {
              const c = j + ch;
              d[k + ch] = wide
                ? (line[c - 8] + line[c + 8] + 4 * (line[c - 4] + line[c + 4]) + 6 * line[c]) * 0.0625
                : (line[c - 4] + line[c + 4] + 6 * line[c]) * 0.125;
            }
          }
        }
      }
    }
  }

  // Adds a coarser grid (twice the voxel size, same origin), trilinearly interpolated.
  addUpsampled(c) {
    // per axis: the two coarse cells each fine cell lies between, and the weight of the second
    const axis = (n, nc) => {
      const a = new Int32Array(n), b = new Int32Array(n), w = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / 2 - 0.5;
        const fi = Math.floor(f);
        a[i] = Math.min(nc - 1, Math.max(0, fi));
        b[i] = Math.min(nc - 1, Math.max(0, fi + 1));
        w[i] = f - fi;
      }
      return { a, b, w };
    };
    const AX = axis(this.nx, c.nx), AY = axis(this.ny, c.ny), AZ = axis(this.nz, c.nz);
    const cd = c.d, d = this.d, cnx = c.nx, cnxy = c.nx * c.ny;
    let k = 0;
    for (let z = 0; z < this.nz; z++) {
      const z0 = AZ.a[z] * cnxy, z1 = AZ.b[z] * cnxy, tz = AZ.w[z];
      for (let y = 0; y < this.ny; y++) {
        const y0 = AY.a[y] * cnx, y1 = AY.b[y] * cnx, ty = AY.w[y];
        const w00 = (1 - ty) * (1 - tz), w10 = ty * (1 - tz), w01 = (1 - ty) * tz, w11 = ty * tz;
        const r00 = y0 + z0, r10 = y1 + z0, r01 = y0 + z1, r11 = y1 + z1;
        for (let x = 0; x < this.nx; x++, k += 4) {
          const xa = AX.a[x], xb = AX.b[x], tx = AX.w[x], sx = 1 - tx;
          const i000 = (xa + r00) * 4, i100 = (xb + r00) * 4, i010 = (xa + r10) * 4, i110 = (xb + r10) * 4;
          const i001 = (xa + r01) * 4, i101 = (xb + r01) * 4, i011 = (xa + r11) * 4, i111 = (xb + r11) * 4;
          for (let ch = 0; ch < 4; ch++) {
            d[k + ch] += (cd[i000 + ch] * sx + cd[i100 + ch] * tx) * w00 + (cd[i010 + ch] * sx + cd[i110 + ch] * tx) * w10
              + (cd[i001 + ch] * sx + cd[i101 + ch] * tx) * w01 + (cd[i011 + ch] * sx + cd[i111 + ch] * tx) * w11;
          }
        }
      }
    }
  }
}

// High percentile of a channel, ignoring empty voxels.
function scaleOf(d, chans, step) {
  const vals = [];
  for (let k = 0; k < d.length; k += 4 * step) {
    let v = 0;
    for (const c of chans) v = Math.max(v, d[k + c]);
    if (v > 0) vals.push(v);
  }
  if (!vals.length) return 0;
  const a = Float32Array.from(vals).sort();
  const p = a[Math.floor(0.99995 * (a.length - 1))];
  return Math.max(p * 1.15, 1e-12);
}

// Splats a model's glow and dust into a volume of about `budget` voxels, around all of it or just a region.
export function bakeVolume(layers, budget, maxR = 1.6, region = null) {
  const { min, max } = region || bounds(layers, maxR);
  const ext = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const voxel = Math.cbrt((ext[0] * ext[1] * ext[2]) / budget);
  const dims = ext.map((e) => Math.max(6, Math.ceil(e / voxel)));
  // centre the grid on the box, with exactly cubic voxels
  const boxMin = min.map((m, a) => m + ext[a] / 2 - (dims[a] * voxel) / 2);

  // one grid per octave of blob size
  const levels = [];
  for (let l = 0, v = voxel, d = dims.slice(); l < 6; l++, v *= 2) {
    levels.push(new Grid(d[0], d[1], d[2], v, boxMin));
    d = d.map((n) => Math.ceil(n / 2) + 1);
    if (Math.min(...d) < 4) break;
  }
  const L = levels.length;
  for (const [layer, isDust] of [[layers.glow, false], [layers.dust, true]]) {
    const { pos, col, size, alpha, count } = layer;
    for (let i = 0; i < count; i++) {
      const s = Math.max(SIGMA * size[i], 1e-7);
      const l = s <= 1.2 * voxel ? 0 : Math.min(L - 1, Math.max(1, Math.round(Math.log2(s / voxel))));
      const g = levels[l];
      const W = (alpha[i] * TWO_PI * s * s) / (g.voxel * g.voxel * g.voxel);
      if (isDust) g.add(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], 0, 0, 0, W);
      else g.add(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], col[i * 3] * W, col[i * 3 + 1] * W, col[i * 3 + 2] * W, 0);
    }
  }
  for (let l = L - 1; l >= 0; l--) {
    levels[l].blur(l > 0);
    if (l < L - 1) levels[l].addUpsampled(levels[l + 1]);
    if (l < L - 1) levels[l + 1] = null;
  }
  const d = levels[0].d;
  const n = dims[0] * dims[1] * dims[2];
  const step = Math.max(1, Math.floor(n / 400000));
  const emScale = scaleOf(d, [0, 1, 2], step);
  const extScale = scaleOf(d, [3], step);
  const out = new Uint8Array(n * 4);
  const ie = emScale > 0 ? 1 / emScale : 0, ix = extScale > 0 ? 1 / extScale : 0;
  // fade out over the last few voxels so the box never shows as a hard edge
  // (a detail region instead blends into the main volume in the shader)
  const ramp = (nn) => {
    const r = new Float32Array(nn).fill(1);
    if (region) return r;
    for (let i = 0; i < nn; i++) { const e = Math.min(i, nn - 1 - i); const t = Math.min(1, e / 5); r[i] = t * t * (3 - 2 * t); }
    return r;
  };
  const RX = ramp(dims[0]), RY = ramp(dims[1]), RZ = ramp(dims[2]);
  for (let z = 0, k = 0; z < dims[2]; z++) {
    for (let y = 0; y < dims[1]; y++) {
      const wyz = RY[y] * RZ[z];
      for (let x = 0; x < dims[0]; x++, k += 4) {
        const w = RX[x] * wyz;
        out[k] = Math.round(255 * Math.cbrt(Math.min(1, Math.max(0, d[k] * ie * w))));
        out[k + 1] = Math.round(255 * Math.cbrt(Math.min(1, Math.max(0, d[k + 1] * ie * w))));
        out[k + 2] = Math.round(255 * Math.cbrt(Math.min(1, Math.max(0, d[k + 2] * ie * w))));
        out[k + 3] = Math.round(255 * Math.cbrt(Math.min(1, Math.max(0, d[k + 3] * ix * w))));
      }
    }
  }
  return { dims, boxMin, boxSize: dims.map((nn) => nn * voxel), voxel, data: out, emScale, extScale };
}

// ---------------------------------------------------------------- detail noise
// A tiling 3D texture of gradient noise, four octaves in the four channels, for the fine wisps the
// shader adds on top of the baked gas.
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeNoise(N = 64) {
  const P = [4, 7, 13, 24];
  const out = new Uint8Array(N * N * N * 4);
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  for (let c = 0; c < 4; c++) {
    const p = P[c];
    const rnd = mulberry(1013 + c * 7919);
    const g = new Float32Array(p * p * p * 3);
    for (let i = 0; i < p * p * p; i++) {
      const z = 2 * rnd() - 1, a = TWO_PI * rnd(), s = Math.sqrt(1 - z * z);
      g[i * 3] = s * Math.cos(a); g[i * 3 + 1] = s * Math.sin(a); g[i * 3 + 2] = z;
    }
    const grad = (X, Y, Z, dx, dy, dz) => {
      const k = (((X % p) + p) % p + p * ((((Y % p) + p) % p) + p * (((Z % p) + p) % p))) * 3;
      return g[k] * dx + g[k + 1] * dy + g[k + 2] * dz;
    };
    for (let z = 0; z < N; z++) {
      const fz = (z * p) / N, Z = Math.floor(fz), tz = fz - Z, wz = fade(tz);
      for (let y = 0; y < N; y++) {
        const fy = (y * p) / N, Y = Math.floor(fy), ty = fy - Y, wy = fade(ty);
        for (let x = 0; x < N; x++) {
          const fx = (x * p) / N, X = Math.floor(fx), tx = fx - X, wx = fade(tx);
          const n000 = grad(X, Y, Z, tx, ty, tz), n100 = grad(X + 1, Y, Z, tx - 1, ty, tz);
          const n010 = grad(X, Y + 1, Z, tx, ty - 1, tz), n110 = grad(X + 1, Y + 1, Z, tx - 1, ty - 1, tz);
          const n001 = grad(X, Y, Z + 1, tx, ty, tz - 1), n101 = grad(X + 1, Y, Z + 1, tx - 1, ty, tz - 1);
          const n011 = grad(X, Y + 1, Z + 1, tx, ty - 1, tz - 1), n111 = grad(X + 1, Y + 1, Z + 1, tx - 1, ty - 1, tz - 1);
          const nx0 = n000 + (n100 - n000) * wx, nx1 = n010 + (n110 - n010) * wx;
          const nx2 = n001 + (n101 - n001) * wx, nx3 = n011 + (n111 - n011) * wx;
          const v = (nx0 + (nx1 - nx0) * wy) + ((nx2 + (nx3 - nx2) * wy) - (nx0 + (nx1 - nx0) * wy)) * wz;
          out[(x + N * (y + N * z)) * 4 + c] = Math.round(255 * Math.min(1, Math.max(0, 0.5 + v * 0.75)));
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- jobs
// { type: 'noise', size } or { type: 'model', id, k, budget, axes, sky, disc, wantStars }
export function handleJob(job) {
  if (job.type === 'noise') {
    const data = makeNoise(job.size);
    return { result: { type: 'noise', size: job.size, data }, transfer: [data.buffer] };
  }
  const entry = DSO.find((e) => e.id === job.id);
  const ctx = makeCtx(job);
  const t0 = performance.now();
  const layers = buildModel(entry, ctx, job.k);
  const t1 = performance.now();
  const vol = bakeVolume(layers, job.budget, entry.id === 'pleiades' ? 2.0 : 1.6, job.region);
  const t2 = performance.now();
  const result = {
    type: 'model', id: job.id, quality: job.quality, region: job.region, vol,
    gas: layers.glow.count + layers.dust.count, ms: [t1 - t0, t2 - t1],
  };
  const transfer = [vol.data.buffer];
  if (job.wantStars) {
    const s = layers.star;
    result.stars = s;
    result.ctx = { companions: ctx.companions, marks: ctx.marks, stars: ctx.stars };
    transfer.push(s.pos.buffer, s.col.buffer, s.size.buffer, s.alpha.buffer);
  }
  return { result, transfer };
}
