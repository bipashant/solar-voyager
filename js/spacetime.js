// Spacetime curvature: a grid sheet that sinks into each body's gravity well, and starlight bent around masses.
//
// The sheet runs parallel to the ecliptic, just beneath the body whose gravity you are falling with, and
// every world's well is drawn below it as if that world sat on the sheet. Its depth is the Newtonian potential U = GM/r, which in the weak-field limit
// of general relativity is the time part of the metric, g_tt = -(1 - 2U/c²): deeper means clocks run slower.
// Every well's shape and the depth ratios between worlds are real; only the overall depth is stretched,
// because the true dips are around a billionth of the distances on screen.
import * as THREE from 'three';
import { C_KMS } from './ephemeris.js';
import * as S from './shaders.js';

// GM in km³/s² (JPL DE440 and satellite ephemerides). Bodies not listed use their size and 1.3 g/cm³.
const GM = {
  sun: 132712440041.9, mercury: 22031.87, venus: 324858.59, earth: 398600.44, moon: 4902.80,
  mars: 42828.37, phobos: 7.087e-4, deimos: 9.62e-5,
  jupiter: 126686531.9, io: 5959.92, europa: 3202.71, ganymede: 9887.83, callisto: 7179.29,
  amalthea: 0.138, himalia: 0.28, thebe: 0.029, elara: 0.058,
  saturn: 37931206.2, mimas: 2.5026, enceladus: 7.2027, tethys: 41.2067, dione: 73.1146, rhea: 153.9426,
  titan: 8978.1382, hyperion: 0.3713, iapetus: 120.5157, phoebe: 0.5532,
  janus: 0.1265, epimetheus: 0.03513, prometheus: 0.01066, pandora: 0.00924, pan: 3.3e-4, atlas: 3.9e-4, daphnis: 5.2e-6,
  uranus: 5793951.3, miranda: 4.32, ariel: 83.43, umbriel: 85.40, titania: 226.94, oberon: 205.32,
  neptune: 6835099.5, triton: 1428.50, proteus: 2.94, nereid: 2.07,
  pluto: 869.30, charon: 106.10, nix: 0.0030, hydra: 0.0032,
};

export const MAX_WELLS = 34;
export const MAX_LENS = 6;
const RINGS = 480, SEGS = 320;
const C2 = C_KMS * C_KMS;
const NS_U = 1e-9 * C2; // potential that slows clocks by 1 ns per second

// Potential of a uniform ball of radius a (a point mass outside it), and its gradient.
function potential(gm, a, r) {
  return r >= a ? gm / r : (gm * (3 - (r * r) / (a * a))) / (2 * a);
}
function addGradient(out, gm, a, d, r) {
  const k = r >= a ? -gm / (r * r * r) : -gm / (a * a * a);
  return out.addScaledVector(d, k);
}

// Log-polar disc: rings get wider with distance from the point under the camera, so cells stay about
// the same size on screen from metres to light-hours away.
function sheetGeometry() {
  const pos = new Float32Array((RINGS + 1) * (SEGS + 1) * 3);
  let k = 0;
  for (let i = 0; i <= RINGS; i++) {
    for (let j = 0; j <= SEGS; j++) { pos[k++] = i / RINGS; pos[k++] = (j / SEGS) * Math.PI * 2; pos[k++] = 0; }
  }
  const idx = new Uint32Array(RINGS * SEGS * 6);
  k = 0;
  for (let i = 0; i < RINGS; i++) {
    for (let j = 0; j < SEGS; j++) {
      const a = i * (SEGS + 1) + j, b = a + SEGS + 1;
      idx[k++] = a; idx[k++] = b; idx[k++] = a + 1;
      idx[k++] = a + 1; idx[k++] = b; idx[k++] = b + 1;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}

export class Spacetime {
  constructor(system, scene, sky) {
    this.system = system;
    this.sky = sky;
    this.enabled = false;
    for (const b of system.bodies) {
      b.gm = GM[b.id] ?? 2.796e-7 * 1.3 * b.radius ** 3;
      b.rs = (2 * b.gm) / C2; // Schwarzschild radius, km
    }
    this.sun = system.byId.sun;
    // Everything heavy enough to matter at some zoom level; the body you are visiting is added when lighter.
    this.massive = system.bodies.filter((b) => b.gm >= 1).sort((a, b) => b.gm - a.gm);

    this.uniforms = {
      uWell: { value: Array.from({ length: MAX_WELLS }, () => new THREE.Vector4()) },
      uSoft: { value: new Array(MAX_WELLS).fill(1) },
      uWellN: { value: 0 },
      uFoot: { value: new THREE.Vector3() },
      uX0: { value: new THREE.Vector3() },
      uLin: { value: new THREE.Vector4() },
      uRmin: { value: 1 }, uSpan: { value: 10 }, uRmax: { value: 1e6 },
      uExag: { value: 1 }, uDmax: { value: 1 },
      uOffs: { value: Array.from({ length: 16 }, () => new THREE.Vector2()) },
      uBaseExp: { value: 0 },
      uOpacity: { value: 0.6 },
      uSide: { value: 1 }, // 1: sheet below the bodies, wells sink down; -1: above, wells rise up
    };
    this.mesh = new THREE.Mesh(sheetGeometry(), new THREE.ShaderMaterial({
      vertexShader: S.SHEET_VERT, fragmentShader: S.SHEET_FRAG, uniforms: this.uniforms,
      defines: { MAX_WELLS },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
    scene.add(this.mesh);

    this.frame = null;
    this.prev = null;
    this.blend = 1;
    this.side = 1;
    this.fade = 1;
    this.logE = null;
    this.logDmax = null;
    this.logX = null;
    this.wells = [];
    this._lin = { C: 0, G: new THREE.Vector3() };
    this._linPrev = { C: 0, G: new THREE.Vector3() };
    this._d = new THREE.Vector3();
    this._lens = [];
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) {
      this.mesh.visible = false;
      this.sky.lens.uLensN.value = 0;
      this.frame = null;
      this.logE = this.logDmax = this.logX = null;
    }
  }

  // Sphere of influence: inside it a body's own gravity outweighs the tug of the body it orbits.
  soi(b) {
    if (b.kind === 'star') return Infinity;
    const host = b.kind === 'moon' ? b.parent : this.sun;
    return b.pos.distanceTo(host.pos) * Math.pow(b.gm / host.gm, 0.4);
  }

  // The body whose free fall you share: the one you are visiting while you are inside its sphere of
  // influence, otherwise the planet it orbits, otherwise the Sun.
  frameFor(body, camPos) {
    let b = body || this.sun;
    while (b.kind !== 'star' && camPos.distanceTo(b.pos) > Math.max(this.soi(b), b.maxRadius * 4)) {
      b = b.kind === 'moon' ? b.parent : this.sun;
    }
    return b;
  }

  // Potential of every other body near the frame body, to first order: a constant plus a uniform pull.
  // A freely falling frame cannot feel either (the equivalence principle), so both are removed and only
  // the tides of other bodies remain.
  linearPart(f, out) {
    out.C = 0;
    out.G.set(0, 0, 0);
    for (const b of this.wells) {
      if (b === f) continue;
      // measured along the sheet, as in SHEET_VERT
      const d = this._d.set(f.pos.x - b.pos.x, 0, f.pos.z - b.pos.z);
      const r = Math.sqrt(d.x * d.x + d.z * d.z + b.maxRadius * b.maxRadius);
      out.C += potential(b.gm, b._soft, r);
      addGradient(out.G, b.gm, b._soft, d, r);
    }
    return out;
  }

  update(dt, camPos, body) {
    const on = this.enabled && !!body;
    this.mesh.visible = on;
    if (!on) return;
    const u = this.uniforms;

    const f = this.frameFor(body, camPos);
    if (f !== this.frame) {
      this.prev = this.frame;
      this.frame = f;
      this.blend = this.prev ? 0 : 1;
      if (!this.prev) { this.side = camPos.y >= f.pos.y ? 1 : -1; this.fade = 1; }
    }
    this.blend = Math.min(1, this.blend + dt / 1.4);
    const w = THREE.MathUtils.smootherstep(this.blend, 0, 1);
    const p = w < 1 ? this.prev : null;

    // Wells, softened to about 3° on screen (two to three mesh cells) so distant ones never slip
    // between vertices, the same band-limiting the procedural terrain uses.
    const wells = this.massive.slice(0, MAX_WELLS - 2);
    for (const b of [f, p, body]) if (b && !wells.includes(b) && wells.length < MAX_WELLS) wells.push(b);
    this.wells = wells;
    wells.forEach((b, i) => {
      b._soft = Math.max(b.radius, 0.05 * b.pos.distanceTo(camPos));
      const c = this._d.copy(b.pos).sub(camPos);
      u.uWell.value[i].set(c.x, b.maxRadius, c.z, b.gm);
      u.uSoft.value[i] = b._soft;
    });
    u.uWellN.value = wells.length;

    // Remove the frame's uniform pull, blending from the previous frame after a switch.
    const lin = this.linearPart(f, this._lin);
    if (p) {
      const lp = this.linearPart(p, this._linPrev);
      const cp = lp.C + lp.G.dot(this._d.copy(f.pos).sub(p.pos));
      lin.C = cp + (lin.C - cp) * w;
      lin.G.lerpVectors(lp.G, lin.G, w);
    }
    u.uLin.value.set(lin.G.x, lin.G.y, lin.G.z, lin.C);
    u.uX0.value.copy(f.pos).sub(camPos);
    // The sheet runs just beneath the frame body, which sits on it like a ball on a trampoline. Seen from
    // below, it moves to the far side so it never cuts across the planet; the swap hides behind a quick fade.
    const centreY = p ? p.pos.y + (f.pos.y - p.pos.y) * w : f.pos.y;
    const want = (camPos.y - centreY) * this.side < -0.1 * f.maxRadius ? -this.side : this.side;
    if (want !== this.side) {
      this.fade = Math.max(0, this.fade - dt / 0.18);
      if (this.fade === 0) this.side = want;
    } else {
      this.fade = Math.min(1, this.fade + dt / 0.3);
    }
    u.uSide.value = this.side;
    u.uOpacity.value = 0.6 * this.fade;
    const floor = (b) => b.pos.y - this.side * b.maxRadius;
    const planeY = p ? floor(p) + (floor(f) - floor(p)) * w : floor(f);

    // Depth scale: the frame body's well reaches 15% of your distance from it at 30% of that distance.
    const D = Math.max(camPos.distanceTo(f.pos), f.maxRadius * 1.01);
    const rho = Math.max(0.3 * D, 1.2 * f.maxRadius);
    const k = this.logE === null ? 1 : 1 - Math.exp(-dt * 3);
    const ease = (cur, target) => (cur === null ? target : cur + (target - cur) * k);
    this.logE = ease(this.logE, Math.log((0.15 * D * rho) / f.gm));
    this.logDmax = ease(this.logDmax, Math.log(0.5 * D));
    u.uExag.value = Math.exp(this.logE);
    u.uDmax.value = Math.exp(this.logDmax);

    // Mesh extent around the point on the sheet straight below (or above) the camera.
    const h = camPos.y - planeY;
    const base = Math.max(Math.abs(h), 0.02 * D, 1e-3);
    const rmin = 0.04 * base;
    const rmax = Math.max(40 * D, 400 * base);
    u.uFoot.value.set(0, -h, 0);
    u.uRmin.value = rmin;
    u.uSpan.value = Math.log(rmax / rmin + 1);
    u.uRmax.value = rmax;

    // Grid lines are fixed to ecliptic coordinates. Each power-of-ten spacing gets the camera's
    // position modulo that spacing, worked out here in 64-bit so the GPU only sees small numbers.
    const e0 = Math.floor(Math.log10(base)) - 3;
    u.uBaseExp.value = e0;
    const mod = (v, L) => ((v % L) + L) % L;
    for (let i = 0; i < 16; i++) {
      const L = 10 ** (e0 + i);
      u.uOffs.value[i].set(mod(camPos.x, L), mod(camPos.z, L));
    }

    this.updateLensing(dt, camPos, f, D);
  }

  // Gravitational lensing of the background sky. A point mass bends light passing at angle θ by θE²/θ,
  // where θE (the Einstein radius) is √(2·rs / distance) for stars far behind it. Real values are
  // arcseconds at most, so every mass is scaled by the same factor: enough to give the body you are
  // visiting a visible ring just outside its edge.
  updateLensing(dt, camPos, f, D) {
    const angR = Math.asin(Math.min(1, f.maxRadius / D));
    const target = Math.min(1.1 * angR, 0.45);
    const k = this.logX === null ? 1 : 1 - Math.exp(-dt * 3);
    const xT = Math.log((target * target * D) / (2 * f.rs));
    this.logX = this.logX === null ? xT : this.logX + (xT - this.logX) * k;
    const X = Math.exp(this.logX);

    const list = this._lens;
    list.length = 0;
    for (const b of this.wells) {
      const d = b.pos.distanceTo(camPos);
      if (d <= b.radius * 1.001) continue;
      const raw = Math.sqrt((X * 2 * b.rs) / d);
      const theta = raw / (1 + raw / 0.6); // keep it near the small-angle regime the formula assumes
      if (theta < 2e-4) continue;
      list.push({ b, d, theta });
    }
    list.sort((a, b) => b.theta - a.theta);
    const L = this.sky.lens;
    const n = Math.min(MAX_LENS, list.length);
    for (let i = 0; i < n; i++) {
      const { b, d, theta } = list[i];
      const dir = this._d.copy(b.pos).sub(camPos).normalize();
      L.uLens.value[i].set(dir.x, dir.y, dir.z, theta);
      L.uLensS.value[i] = 0.25 * Math.asin(Math.min(1, b.radius / d)) + 1e-5;
    }
    L.uLensN.value = n;
    this.lensFactor = X;
  }

  // Real general-relativity numbers for one body, for the info panel.
  describe(b) {
    const R = b.radius;
    return {
      rs: b.rs,
      clock: b.gm / R / C2, // fractional slowdown of a clock on the surface vs far away
      bend: (4 * b.gm) / (C2 * R), // deflection of starlight grazing the limb, radians
      escape: Math.sqrt((2 * b.gm) / R),
    };
  }

  // How the drawing is scaled right now.
  status() {
    if (!this.frame || this.logE === null) return null;
    return { frame: this.frame, kmPerNs: Math.exp(this.logE) * NS_U, lensFactor: this.lensFactor };
  }
}
