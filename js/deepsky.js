// Deep-sky objects: galaxies, nebulae and star clusters as 3D models at their real positions, distances and
// sizes, in a scene of their own measured in light-years.
//
// Positions are kept in kilometres from the Sun in 64-bit JavaScript numbers, like everything else, and
// converted to light-years relative to the camera each frame, so the GPU only ever sees small numbers.
//
// Gas and dust are volumes: a background worker builds each model and bakes it into a 3D texture
// (js/deepsky-bake.js), first a small one for every object, then a detailed one for whatever you are
// visiting or heading to. They are ray-marched into an off-screen HDR target at a resolution that adapts
// to the frame rate, and composited over the sky. Stars stay as crisp points, dimmed by the dust in front.
import * as THREE from 'three';
import { DSO, LY_KM } from './deepsky-data.js';
import { raDecToScene, sceneToGalacticMatrix, DEG } from './ephemeris.js';
import * as S from './shaders.js';

const STAR_GAIN = 0.7;
const EM_GAIN = 0.16;
const EXT_RGB = new THREE.Vector3(0.6, 0.68, 0.8).divideScalar(0.693); // dust dims blue more than red
const LO_BUDGET = 160000;
const HI_MAX = 3; // detailed volumes kept on the GPU at once
const HI_PARTICLES = 500000; // gas particles to sample for a detailed bake
const DET_K = 3; // a close-up region samples this many times more densely again

// How each object is drawn: emission gain, log-normal turbulence of gas and dust (0 = smooth), domain warp
// (radii), filamentary vs billowy, and the scale of the fine structure (noise tiles per radius).
const KIND_LOOK = {
  galaxy: { em: 1, detail: 0.2, dustDetail: 0.4, warp: 0.008, ridge: 0.1, freq: 1.6 },
  nebula: { em: 1, detail: 0.8, dustDetail: 0.9, warp: 0.025, ridge: 0.25, freq: 0.7 },
  cluster: { em: 1, detail: 0.35, dustDetail: 0.5, warp: 0.02, ridge: 0.2, freq: 0.6 },
};
const LOOK = {
  milkyway: { em: 0.9 }, andromeda: { em: 0.95 }, triangulum: { em: 1.1 }, whirlpool: { em: 1.1 },
  sombrero: { em: 0.6, detail: 0.2 }, cigar: { em: 1.1 }, m87: { em: 0.55, detail: 0.05 }, centaurusa: { em: 0.7, detail: 0.2 },
  lmc: { em: 1.5, detail: 0.5 },
  orion: { em: 3.2 }, eagle: { em: 2.6 }, lagoon: { em: 2.4 }, carina: { em: 3.0 },
  crab: { em: 1.5, ridge: 0.55, detail: 0.7 }, ring: { em: 1.8, detail: 0.5, ridge: 0.15 }, helix: { em: 1.8, detail: 0.55, ridge: 0.25 },
  horsehead: { em: 2.2, detail: 0.35, ridge: 0 }, veil: { em: 2.6, ridge: 0.7, detail: 0.9, warp: 0.015 }, pleiades: { em: 1.6, ridge: 0.5 }, omegacen: { em: 1.0, detail: 0.1 },
};

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

function skyBasis(raDeg, decDeg) {
  const r = raDecToScene(raDeg, decDeg, new THREE.Vector3());
  const pole = raDecToScene(0, 90, new THREE.Vector3());
  const east = new THREE.Vector3().crossVectors(pole, r).normalize();
  const north = new THREE.Vector3().crossVectors(r, east).normalize();
  return { r, east, north };
}

function volumeTexture(dims, data, mips = false) {
  const tex = new THREE.Data3DTexture(data, dims[0], dims[1], dims[2]);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  // mip levels let the shader skip empty space and blur distant objects instead of aliasing them
  tex.generateMipmaps = mips;
  tex.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

export class DeepSky {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 1e-7, 1e10);
    this.objects = [];
    this.byId = {};
    this.enabled = true;
    this.jobs = [];
    this.busy = false;
    this.listeners = [];
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.uniforms = {
      uPx: { value: 1000 },
      uMinPx: { value: 1.2 * dpr },
      uCapPx: { value: 6 * dpr },
    };
    const small = Math.min(window.screen?.width || 1920, window.screen?.height || 1080) < 700 || (navigator.deviceMemory || 8) <= 4;
    this.hiBudget = small ? 2.0e6 : 4.0e6;
    this.detBudget = small ? 1.2e6 : 2.4e6;
    // pixels ray-marched per frame, adjusted to the frame rate
    this.volPixels = small ? 0.5e6 : 0.9e6;
    this.fixedPixels = 0;
    this.frameMs = 16;

    const G = sceneToGalacticMatrix().elements; // column-major; row i is galactic axis i in scene space
    this.galactic = {
      toCentre: new THREE.Vector3(G[0], G[3], G[6]),
      l90: new THREE.Vector3(G[1], G[4], G[7]),
      pole: new THREE.Vector3(G[2], G[5], G[8]),
    };

    // shared by every volume until the real ones arrive
    this.emptyVol = volumeTexture([1, 1, 1], new Uint8Array(4));
    this.noise = { value: volumeTexture([1, 1, 1], new Uint8Array([128, 128, 128, 128])) };
    this.unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5);

    for (const entry of DSO) this.add(entry);

    // The Sun as a single star, for when the planets are far behind.
    const sunGeo = new THREE.BufferGeometry();
    sunGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    sunGeo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array([1, 0.9, 0.72]), 3));
    sunGeo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array([4 * dpr]), 1));
    sunGeo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array([1]), 1));
    this.sunMat = this.starMaterial({ uScale: { value: 1 }, uGain: { value: 0 } }, { FIXED: '' });
    this.sun = new THREE.Points(sunGeo, this.sunMat);
    this.sun.frustumCulled = false;
    this.sun.renderOrder = 9;
    this.scene.add(this.sun);
    this.sunScreen = { x: 0, y: 0, onScreen: false };

    // off-screen volume pass, HDR where the GPU can blend into half floats
    const ext = renderer.extensions;
    const half = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
    this.rt = new THREE.WebGLRenderTarget(4, 4, {
      type: half ? THREE.HalfFloatType : THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false,
      generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, // the top mip is the frame's average, for auto exposure
    });
    this.compMat = new THREE.ShaderMaterial({
      vertexShader: S.VOL_COMPOSITE_VERT, fragmentShader: S.VOL_COMPOSITE_FRAG,
      uniforms: { uTex: { value: this.rt.texture }, uExposure: { value: 1.25 }, uAuto: { value: 1 } },
      transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.SrcAlphaFactor,
    });
    this.compScene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compMat);
    quad.frustumCulled = false;
    this.compScene.add(quad);
    this.compCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._size = new THREE.Vector2();

    try {
      this.worker = new Worker(new URL('./deepsky-worker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e) => this.onResult(e.data);
      this.worker.onerror = (e) => {
        console.warn('Deep-sky worker failed, building on the main thread', e.message);
        this.worker = null;
        this.busy = false;
        if (this.current) this.jobs.unshift(this.current);
        this.pump();
      };
    } catch (err) {
      this.worker = null;
    }
  }

  starMaterial(own, defines = {}) {
    return new THREE.ShaderMaterial({
      vertexShader: S.DSO_STAR_VERT, fragmentShader: S.DSO_STAR_FRAG,
      uniforms: { ...this.uniforms, ...own },
      defines,
      transparent: true, depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
    });
  }

  add(entry) {
    const R = entry.radius * LY_KM;
    const o = {
      id: entry.id, name: entry.name, kind: entry.kind, deep: true, data: entry,
      radius: R, maxRadius: R, coreRadius: R * 0.004, minAlt: R * 0.004, maxAlt: R * 90,
      radiusLy: entry.radius,
      pos: new THREE.Vector3(), quat: new THREE.Quaternion(), rel: new THREE.Vector3(), viewPos: new THREE.Vector3(),
      axes: { x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3() },
      screen: { x: 0, y: 0, r: 0, dist: 0, behind: true, onScreen: false },
      children: [], parent: null, disc: false, built: false,
      look: { ...KIND_LOOK[entry.kind], ...LOOK[entry.id] },
      vol: { lo: null, hi: null, det: null, hiPending: false, loPending: false, detPending: false, hiUsed: 0 },
    };
    const sky = skyBasis(entry.ra, entry.dec);
    const { x, y, z } = o.axes;
    if (entry.id === 'milkyway') {
      // from the centre towards the Sun, the north galactic pole, and the way the Sun is moving
      const g = this.galactic;
      x.copy(g.toCentre).negate();
      y.copy(g.pole);
      z.copy(g.l90);
      o.pos.copy(g.toCentre).multiplyScalar(entry.dist * LY_KM);
      o.disc = true;
    } else {
      o.pos.copy(sky.r).multiplyScalar(entry.dist * LY_KM);
      const pa = (entry.orient?.pa ?? 0) * DEG;
      if (entry.orient?.incl !== undefined) {
        // disc galaxy: x along the major axis on the sky, y the disc's pole, tipped by the inclination
        const inc = entry.orient.incl * DEG;
        x.copy(sky.north).multiplyScalar(Math.cos(pa)).addScaledVector(sky.east, Math.sin(pa));
        const minor = new THREE.Vector3().copy(sky.north).multiplyScalar(-Math.sin(pa)).addScaledVector(sky.east, Math.cos(pa));
        y.copy(sky.r).multiplyScalar(-Math.cos(inc)).addScaledVector(minor, Math.sin(inc)).normalize();
        z.crossVectors(x, y);
        o.disc = true;
      } else {
        // as seen from Earth: x to the right (west), y up (north), z towards us; then turned by pa
        y.copy(sky.north).multiplyScalar(Math.cos(pa)).addScaledVector(sky.east, Math.sin(pa));
        x.copy(sky.east).multiplyScalar(-Math.cos(pa)).addScaledVector(sky.north, Math.sin(pa));
        z.copy(sky.r).negate();
      }
    }
    o.quat.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    o.frameQuat = o.quat; // the camera orbits and frames the view in the object's own frame
    o.up = y;
    o.approach = (fromPos) => this.approachDir(o, fromPos);
    o.sky = sky;
    o.group = new THREE.Group();
    o.group.visible = false;
    o.group.name = entry.id;
    this.scene.add(o.group);

    // the volume: a box drawn from the inside out, ray-marched in the group's frame (radii)
    const L = o.look;
    o.u = {
      uVol: { value: this.emptyVol }, uNoise: this.noise, uDet: { value: this.emptyVol },
      uBoxMin: { value: new THREE.Vector3(-1, -1, -1) }, uBoxSize: { value: new THREE.Vector3(2, 2, 2) },
      uDetMin: { value: new THREE.Vector3() }, uDetSize: { value: new THREE.Vector3(1, 1, 1) }, uDetVoxel: { value: 0.01 }, uHasDet: { value: 0 },
      uCam: { value: new THREE.Vector3() }, uVoxel: { value: 0.05 },
      uEm: { value: 0 }, uExt: { value: 0 }, uDetEm: { value: 0 }, uDetExt: { value: 0 },
      uPix: { value: 0.002 }, uGrow: { value: 0.008 }, uMaxIter: { value: 64 }, uDustKnee: { value: 0 },
      uDetail: { value: L.detail }, uDustDetail: { value: L.dustDetail }, uWarp: { value: L.warp },
      uNoiseFreq: { value: L.freq }, uRidge: { value: L.ridge }, uExtRGB: { value: EXT_RGB },
    };
    o.volMesh = new THREE.Mesh(this.unitBox, new THREE.ShaderMaterial({
      vertexShader: S.VOL_VERT, fragmentShader: S.VOL_FRAG, uniforms: o.u,
      side: THREE.BackSide, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
      // emission adds, and everything behind is dimmed by this volume's transmittance (alpha)
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.SrcAlphaFactor,
      blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.SrcAlphaFactor,
    }));
    o.volMesh.frustumCulled = false;
    o.volMesh.layers.set(1);
    o.volMesh.visible = false;
    o.group.add(o.volMesh);
    o.uScale = { value: o.radiusLy };
    o.starGain = { value: 0 };

    this.objects.push(o);
    this.byId[o.id] = o;
    return o;
  }

  // Local model coordinates (in radii) of a sky offset (in radii): east, north, towards Earth.
  ctxFor(o) {
    const { x, y, z } = o.axes, s = o.sky;
    const fromSky = (e, n, t) => {
      _v.set(0, 0, 0).addScaledVector(s.east, e).addScaledVector(s.north, n).addScaledVector(s.r, -t);
      return [_v.dot(x), _v.dot(y), _v.dot(z)];
    };
    const toward = fromSky(0, 0, 1);
    return {
      fromSky,
      toward,
      // where a point seen at that spot on the sky meets the disc plane
      onDisc: (v) => {
        if (!o.disc || Math.abs(toward[1]) < 1e-3) return v;
        const k = -v[1] / toward[1];
        return [v[0] + k * toward[0], 0, v[2] + k * toward[2]];
      },
    };
  }

  // ---------------------------------------------------------------- background builds
  // Small volumes for everything (and the noise texture) first; detailed ones on demand.
  start() {
    if (this.started) return;
    this.started = true;
    this.jobs.push({ type: 'noise', size: 64 });
    for (const o of this.objects) this.requestLo(o);
  }

  job(o, quality, k, budget) {
    const a = o.axes, s = o.sky;
    const arr = (v) => [v.x, v.y, v.z];
    return {
      type: 'model', id: o.id, quality, k, budget, wantStars: quality === 'lo',
      axes: { x: arr(a.x), y: arr(a.y), z: arr(a.z) }, sky: { r: arr(s.r), east: arr(s.east), north: arr(s.north) }, disc: o.disc,
    };
  }

  requestLo(o, urgent = false) {
    if (o.vol.lo || o.vol.loPending) return;
    o.vol.loPending = true;
    const j = this.job(o, 'lo', 1, LO_BUDGET);
    if (urgent) this.jobs.unshift(j); else this.jobs.push(j);
    this.pump();
  }

  requestHi(o) {
    if (o.vol.hi || o.vol.hiPending) return;
    if (!o.vol.lo) { this.requestLo(o, true); o.vol.wantHi = true; return; }
    o.vol.hiPending = true;
    const k = THREE.MathUtils.clamp(Math.round(HI_PARTICLES / Math.max(o.vol.gas || 1, 1)), 2, 12);
    o.vol.hiK = k;
    // straight after any job in progress, ahead of the small ones still waiting
    this.jobs.unshift(this.job(o, 'hi', k, this.hiBudget));
    this.pump();
  }

  // A close-up: the region around what you are looking at, baked several times finer than the whole.
  requestDetail(o, center, half) {
    const v = o.vol;
    if (!v.hi) return;
    const want = { center: center.slice(), half };
    const same = (r) => r && Math.hypot(r.center[0] - center[0], r.center[1] - center[1], r.center[2] - center[2]) < r.half * 0.35
      && half / r.half < 1.6 && r.half / half < 1.6;
    if (same(v.det?.want) || same(v.detPending)) return;
    if (v.detPending) { v.detNext = want; return; }
    v.detPending = want;
    const k = THREE.MathUtils.clamp(Math.round((v.hiK || 6) * DET_K), 6, 36);
    const region = { min: center.map((c) => c - half), max: center.map((c) => c + half) };
    this.jobs.unshift({ ...this.job(o, 'det', k, this.detBudget), region });
    this.pump();
  }

  pump() {
    if (this.busy || !this.jobs.length) return;
    const j = this.jobs.shift();
    this.busy = true;
    this.current = j;
    if (this.worker) {
      this.worker.postMessage(j);
    } else {
      // no worker: build on the main thread, one job per tick
      import('./deepsky-bake.js').then(({ handleJob }) => setTimeout(() => this.onResult(handleJob(j).result), 0));
    }
  }

  onResult(r) {
    this.busy = false;
    this.current = null;
    if (r.type === 'noise') {
      const tex = volumeTexture([r.size, r.size, r.size], r.data);
      tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
      this.noise.value = tex;
    } else if (r.type === 'error') {
      console.warn('Deep-sky build failed', r.id, r.message);
      const o = this.byId[r.id];
      if (o) {
        o.vol.hiPending = false;
        o.vol.loPending = false;
        o.vol.failed = true;
        for (const fn of this.listeners) fn(o, 'error');
      }
    } else {
      const o = this.byId[r.id];
      if (r.stars) this.setStars(o, r.stars, r.ctx);
      const v = { ...r.vol, tex: volumeTexture(r.vol.dims, r.vol.data, r.quality !== 'det') };
      if (r.quality === 'det') {
        if (o.vol.det) o.vol.det.tex.dispose();
        v.want = o.vol.detPending;
        o.vol.det = o.vol.hi ? v : null;
        o.vol.detPending = false;
        if (o.vol.detNext) { const n = o.vol.detNext; o.vol.detNext = null; this.requestDetail(o, n.center, n.half); }
      } else if (r.quality === 'lo') {
        o.vol.lo = v;
        o.vol.loPending = false;
        o.vol.gas = r.gas;
        if (o.vol.wantHi) { o.vol.wantHi = false; this.requestHi(o); }
      } else {
        if (o.vol.hi) o.vol.hi.tex.dispose();
        o.vol.hi = v;
        o.vol.hiPending = false;
        o.vol.hiUsed = performance.now();
        this.evict();
      }
      this.useVolume(o);
      for (const fn of this.listeners) fn(o, r.quality, r.ms);
    }
    this.pump();
  }

  // Keep only a few detailed volumes, dropping the ones looked at least recently.
  evict() {
    const his = this.objects.filter((o) => o.vol.hi).sort((a, b) => b.vol.hiUsed - a.vol.hiUsed);
    for (const o of his.slice(HI_MAX)) {
      o.vol.hi.tex.dispose();
      o.vol.hi = null;
      this.dropDetail(o);
      this.useVolume(o);
    }
  }

  dropDetail(o) {
    if (o.vol.det) { o.vol.det.tex.dispose(); o.vol.det = null; }
    o.vol.detNext = null;
  }

  useVolume(o) {
    const v = o.vol.hi || o.vol.lo;
    if (!v) return;
    o.vmeta = v;
    const u = o.u;
    u.uVol.value = v.tex;
    u.uBoxMin.value.fromArray(v.boxMin);
    u.uBoxSize.value.fromArray(v.boxSize);
    u.uVoxel.value = v.voxel;
    const d = o.vol.det;
    u.uHasDet.value = d ? 1 : 0;
    if (d) {
      u.uDet.value = d.tex;
      u.uDetMin.value.fromArray(d.boxMin);
      u.uDetSize.value.fromArray(d.boxSize);
      u.uDetVoxel.value = d.voxel;
    } else u.uDet.value = this.emptyVol;
  }

  setStars(o, L, ctx) {
    if (L.count) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(L.pos, 3));
      geo.setAttribute('aColor', new THREE.BufferAttribute(L.col, 3));
      geo.setAttribute('aSize', new THREE.BufferAttribute(L.size, 1));
      geo.setAttribute('aAlpha', new THREE.BufferAttribute(L.alpha, 1));
      const u = o.u;
      const mat = this.starMaterial({
        uScale: o.uScale, uGain: o.starGain,
        uVol: u.uVol, uBoxMin: u.uBoxMin, uBoxSize: u.uBoxSize, uCam: u.uCam, uExt: u.uExt, uExtRGB: u.uExtRGB,
      }, { ATTEN: '' });
      o.stars = new THREE.Points(geo, mat);
      o.stars.frustumCulled = false;
      o.stars.renderOrder = 3;
      o.starCount = L.count;
      o.group.add(o.stars);
    }
    // features that depend on the model (companions, named stars, marks)
    const c = this.ctxFor(o);
    for (const f of o.data.features || []) {
      if (f.companion) f.p = ctx.companions[f.companion];
      else if (f.star) f.p = ctx.stars[f.star];
      else if (f.sky) f.p = f.disc ? c.onDisc(c.fromSky(f.sky[0], f.sky[1], 0)) : c.fromSky(f.sky[0], f.sky[1], 0);
      else if (f.sun) f.p = this.localOf(o, new THREE.Vector3(0, 0, 0));
    }
    o.built = true;
  }

  // Asks for the detailed volume of an object you are heading to.
  build(o) { this.requestHi(o); }

  // Resolves once an object's volume of the given quality has been drawn (for screenshots and tests).
  whenReady(o, quality = 'hi') {
    const ok = () => (quality === 'hi' ? o.vol.hi : o.vol.lo || o.vol.hi);
    if (ok()) return Promise.resolve();
    if (quality === 'hi') this.requestHi(o); else this.requestLo(o, true);
    return new Promise((resolve) => this.listeners.push((x) => (ok() || x.vol.failed) && resolve()));
  }

  get allBuilt() { return this.objects.every((o) => o.vol.lo); }

  setEnabled(on) { this.enabled = on; }

  // World position (km) of a point given in the object's frame (radii).
  worldOf(o, p, out = new THREE.Vector3()) {
    const { x, y, z } = o.axes;
    return out.copy(o.pos).addScaledVector(x, p[0] * o.radius).addScaledVector(y, p[1] * o.radius).addScaledVector(z, p[2] * o.radius);
  }

  localOf(o, w) {
    _v.copy(w).sub(o.pos).divideScalar(o.radius);
    return [_v.dot(o.axes.x), _v.dot(o.axes.y), _v.dot(o.axes.z)];
  }

  // Where a flight to this object parks, as a unit vector from its centre.
  approachDir(o, fromPos, out = new THREE.Vector3()) {
    const v = o.data.viewDir || [0.3, 0.2, 1];
    const { x, y, z } = o.axes;
    let vy = v[1];
    if (o.disc) {
      // come in on the face of the disc that looks towards where we start from
      _v.copy(fromPos).sub(o.pos);
      if (_v.dot(y) < 0) vy = -vy;
    }
    return out.set(0, 0, 0).addScaledVector(x, v[0]).addScaledVector(y, vy).addScaledVector(z, v[2]).normalize();
  }

  // ---------------------------------------------------------------- per frame
  // Positions relative to the camera, screen projections, which volumes to draw and in how much detail.
  update(camPos, camQuat, viewport, fovDeg, opt) {
    const cam = this.camera;
    cam.position.set(0, 0, 0);
    cam.quaternion.copy(camQuat);
    if (cam.fov !== fovDeg || cam.aspect !== viewport.x / viewport.y) {
      cam.fov = fovDeg;
      cam.aspect = viewport.x / viewport.y;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
    const pxPerRad = viewport.y / (2 * Math.tan((fovDeg * DEG) / 2));
    this.uniforms.uPx.value = pxPerRad;
    // angle covered by one pixel of the volume pass
    const volScale = Math.min(1, Math.sqrt((this.fixedPixels || this.volPixels) / (viewport.x * viewport.y * Math.min(window.devicePixelRatio, 2) ** 2)));
    this.pixAngle = (2 * Math.tan((fovDeg * DEG) / 2)) / (viewport.y * Math.min(window.devicePixelRatio, 2) * volScale);
    _q.copy(camQuat).invert();
    const now = performance.now();
    this.anyVolume = false;

    for (const o of this.objects) {
      o.rel.copy(o.pos).sub(camPos);
      o.viewPos.copy(o.rel).applyQuaternion(_q);
      const sc = o.screen;
      const dist = o.rel.length();
      sc.dist = dist;
      sc.behind = o.viewPos.z > 0;
      sc.inside = dist < o.radius;
      sc.r = Math.asin(Math.min(1, o.radius / Math.max(dist, o.radius))) * pxPerRad;
      if (!sc.behind) {
        sc.x = (o.viewPos.x / -o.viewPos.z) * pxPerRad + viewport.x / 2;
        sc.y = (-o.viewPos.y / -o.viewPos.z) * pxPerRad + viewport.y / 2;
      }
      sc.onScreen = !sc.behind && sc.x > -sc.r - 50 && sc.x < viewport.x + sc.r + 50 && sc.y > -sc.r - 50 && sc.y < viewport.y + sc.r + 50;

      const fade = o.id === 'milkyway' ? opt.mwFade : 1;
      o.fade = fade;
      const key = o === opt.focus || o === opt.target;
      const wanted = this.enabled || key;
      const show = (o.built || o.vmeta) && wanted && fade > 0.003 && (sc.onScreen || sc.inside);
      o.group.visible = show;
      // the detailed volume for what you are visiting, heading to, or close to
      if ((key || (show && sc.r > 220)) && fade > 0.3) {
        o.vol.hiUsed = now;
        if (this.started) this.requestHi(o);
      }
      if (!show) continue;
      o.group.position.copy(o.rel).divideScalar(LY_KM);
      o.group.quaternion.copy(o.quat);
      o.group.scale.setScalar(o.radiusLy);
      // the camera in the object's frame, in radii
      _v.copy(o.rel).negate().applyQuaternion(_q.copy(o.quat).invert()).divideScalar(o.radius);
      _q.copy(camQuat).invert();
      o.u.uCam.value.copy(_v);
      o.u.uPix.value = this.pixAngle;
      o.u.uGrow.value = this.pixAngle * 4;
      const v = o.vmeta;
      o.volMesh.visible = !!v;
      if (v) {
        this.anyVolume = true;
        const g = EM_GAIN * o.look.em * fade;
        o.u.uEm.value = v.emScale * g;
        o.u.uExt.value = v.extScale * fade;
        o.u.uDustKnee.value = v.extScale * (o.kind === 'nebula' ? 0.004 : 0.0005);
        const d = o.vol.det;
        if (d) { o.u.uDetEm.value = d.emScale * g; o.u.uDetExt.value = d.extScale * fade; }
        // fewer steps for objects that are small on screen
        o.u.uMaxIter.value = sc.inside || sc.r > 300 ? 640 : THREE.MathUtils.clamp(sc.r * 1.2, 24, 640);
        o.volMesh.renderOrder = -Math.log(dist + 1); // farthest first
        // close to the point you are orbiting: bake that region in more detail
        if (o === opt.focus && opt.look && o.vol.hi) {
          const pl = this.localOf(o, opt.look);
          const c = o.u.uCam.value;
          const camD = Math.hypot(c.x - pl[0], c.y - pl[1], c.z - pl[2]);
          if (camD < 1.1) this.requestDetail(o, pl, THREE.MathUtils.clamp(camD * 0.55, 0.05, 0.4));
          else if (camD > 1.8 && o.vol.det) { this.dropDetail(o); this.useVolume(o); }
        }
      } else o.u.uExt.value = 0;
      if (o.stars) {
        // level of detail: small on screen means fewer, brighter stars
        const frac = sc.inside ? 1 : THREE.MathUtils.clamp(Math.pow(sc.r / 200, 1.2), 0.02, 1);
        const n = Math.min(o.starCount, Math.max(200, Math.round(o.starCount * frac)));
        o.stars.geometry.setDrawRange(0, n);
        o.starGain.value = STAR_GAIN * o.look.em * fade * (o.starCount / n);
      }
    }

    // the Sun, once the planets are out of sight
    const su = this.sun.geometry.attributes.position;
    _v.copy(camPos).negate().divideScalar(LY_KM);
    su.setXYZ(0, _v.x, _v.y, _v.z);
    su.needsUpdate = true;
    this.sunMat.uniforms.uGain.value = opt.sunStar;
    this.sun.visible = opt.sunStar > 0.01;
    _v.applyQuaternion(_q);
    const ss = this.sunScreen;
    ss.onScreen = _v.z < 0 && opt.sunStar > 0.3;
    if (_v.z < 0) {
      ss.x = (_v.x / -_v.z) * pxPerRad + viewport.x / 2;
      ss.y = (-_v.y / -_v.z) * pxPerRad + viewport.y / 2;
      ss.onScreen = ss.onScreen && ss.x > -20 && ss.x < viewport.x + 20 && ss.y > -20 && ss.y < viewport.y + 20;
    }
  }

  // Frame time, to adapt how many pixels the volumes are ray-marched at.
  setFrameTime(dt) {
    this.frameMs += (dt * 1000 - this.frameMs) * 0.05;
    if (!this.anyVolume || this.fixedPixels) return;
    if (this.frameMs > 24) this.volPixels = Math.max(0.2e6, this.volPixels * 0.97);
    else if (this.frameMs < 17) this.volPixels = Math.min(2.2e6, this.volPixels * 1.01);
  }

  // Volumes into the off-screen target, composited over what is already drawn; then the stars.
  render(renderer) {
    if (this.anyVolume) {
      renderer.getDrawingBufferSize(this._size);
      const W = this._size.x, H = this._size.y;
      const px = this.fixedPixels || this.volPixels;
      const s = Math.min(1, Math.sqrt(px / (W * H)));
      const w = Math.max(1, Math.round(W * s)), h = Math.max(1, Math.round(H * s));
      if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);
      renderer.setRenderTarget(this.rt);
      renderer.setClearColor(0x000000, 1);
      renderer.clear(true, false, false);
      this.camera.layers.set(1);
      renderer.render(this.scene, this.camera);
      renderer.setRenderTarget(null);
      renderer.render(this.compScene, this.compCam);
    }
    this.camera.layers.set(0);
    renderer.render(this.scene, this.camera);
  }
}
