// Deep-sky objects: galaxies, nebulae and star clusters as 3D particle models at their real positions,
// distances and sizes, in a scene of their own measured in light-years.
//
// Positions are kept in kilometres from the Sun in 64-bit JavaScript numbers, like everything else, and
// converted to light-years relative to the camera each frame, so the GPU only ever sees small numbers.
import * as THREE from 'three';
import { DSO, LY_KM } from './deepsky-data.js';
import { buildModel } from './deepsky-models.js';
import { raDecToScene, sceneToGalacticMatrix, DEG } from './ephemeris.js';
import * as S from './shaders.js';

// Overall brightness of each layer (the models' own alphas set the balance within one object).
const GAIN = { glow: 0.16, star: 0.7, dust: 1.0 };
const PER_OBJECT = {
  milkyway: 0.9, andromeda: 1.0, triangulum: 1.1, whirlpool: 1.1, sombrero: 0.65, cigar: 1.1, m87: 0.6, centaurusa: 0.75, lmc: 1.5,
  orion: 1.8, eagle: 1.4, lagoon: 1.2, carina: 1.7, crab: 1.0, ring: 1.3, helix: 1.0, horsehead: 1.2, veil: 1.7, pleiades: 1.2, omegacen: 1.0,
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

export class DeepSky {
  constructor(renderer) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 1e-7, 1e10);
    this.objects = [];
    this.byId = {};
    this.enabled = true;
    this.queue = [];
    const gl = renderer.getContext();
    const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
    this.maxPoint = range ? range[1] : 256;
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.uniforms = {
      uPx: { value: 1000 },
      uMinPx: { value: 1.2 * dpr },
      uMaxPx: { value: Math.min(this.maxPoint, 512) },
      uCapPx: { value: 6 * dpr },
    };

    const G = sceneToGalacticMatrix().elements; // column-major; row i is galactic axis i in scene space
    this.galactic = {
      toCentre: new THREE.Vector3(G[0], G[3], G[6]),
      l90: new THREE.Vector3(G[1], G[4], G[7]),
      pole: new THREE.Vector3(G[2], G[5], G[8]),
    };

    for (const entry of DSO) this.add(entry);

    // The Sun as a single star, for when the planets are far behind.
    const sunGeo = new THREE.BufferGeometry();
    sunGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    sunGeo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array([1, 0.9, 0.72]), 3));
    sunGeo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array([4 * dpr]), 1));
    sunGeo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array([1]), 1));
    this.sunMat = this.material('star', { uScale: { value: 1 }, uGain: { value: 0 } }, { FIXED: '' });
    this.sun = new THREE.Points(sunGeo, this.sunMat);
    this.sun.frustumCulled = false;
    this.sun.renderOrder = 9;
    this.scene.add(this.sun);
    this.sunScreen = { x: 0, y: 0, onScreen: false };
  }

  material(layer, own, defines = {}) {
    const dust = layer === 'dust';
    const mat = new THREE.ShaderMaterial({
      vertexShader: S.DSO_VERT, fragmentShader: S.DSO_FRAG,
      uniforms: { ...this.uniforms, ...own },
      defines: { ...(layer === 'star' ? { STAR: '' } : {}), ...(dust ? { DUST: '' } : {}), ...defines },
      transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    });
    if (dust) {
      mat.blending = THREE.CustomBlending;
      mat.blendEquation = THREE.AddEquation;
      mat.blendSrc = THREE.ZeroFactor;
      mat.blendDst = THREE.OneMinusSrcColorFactor;
    } else mat.blending = THREE.AdditiveBlending;
    return mat;
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
      children: [], parent: null, disc: false, built: false, layers: null, bright: PER_OBJECT[entry.id] ?? 1,
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
    this.objects.push(o);
    this.byId[o.id] = o;
    this.queue.push(o);
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
      skyDir: (paDeg) => fromSky(Math.sin(paDeg * DEG), Math.cos(paDeg * DEG), 0),
      // where a point seen at that spot on the sky meets the disc plane
      onDisc: (v) => {
        if (!o.disc || Math.abs(toward[1]) < 1e-3) return v;
        const k = -v[1] / toward[1];
        return [v[0] + k * toward[0], 0, v[2] + k * toward[2]];
      },
      companions: {}, marks: {}, stars: {},
    };
  }

  // Builds one model per call, so the work is spread over several frames.
  buildNext(prefer) {
    let o = prefer && !prefer.built && prefer.deep ? prefer : null;
    if (!o) {
      while (this.queue.length && this.queue[0].built) this.queue.shift();
      o = this.queue.shift();
    }
    if (!o) return false;
    this.build(o);
    return true;
  }

  build(o) {
    if (o.built) return;
    const ctx = this.ctxFor(o);
    const layers = buildModel(o.data, ctx);
    o.ctx = ctx;
    o.layers = {};
    o.uScale = { value: o.radiusLy };
    for (const name of ['glow', 'dust', 'star']) {
      const L = layers[name];
      if (!L.count) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(L.pos, 3));
      geo.setAttribute('aColor', new THREE.BufferAttribute(L.col, 3));
      geo.setAttribute('aSize', new THREE.BufferAttribute(L.size, 1));
      geo.setAttribute('aAlpha', new THREE.BufferAttribute(L.alpha, 1));
      geo.computeBoundingSphere();
      const gain = { value: 0 };
      const pts = new THREE.Points(geo, this.material(name, { uScale: o.uScale, uGain: gain }));
      pts.renderOrder = name === 'glow' ? 1 : name === 'dust' ? 2 : 3;
      o.group.add(pts);
      o.layers[name] = { points: pts, count: L.count, gain };
    }
    // features that depend on the model (companions, named stars, marks)
    for (const f of o.data.features || []) {
      if (f.companion) f.p = ctx.companions[f.companion];
      else if (f.star) f.p = ctx.stars[f.star];
      else if (f.sky) f.p = f.disc ? ctx.onDisc(ctx.fromSky(f.sky[0], f.sky[1], 0)) : ctx.fromSky(f.sky[0], f.sky[1], 0);
      else if (f.sun) f.p = this.localOf(o, new THREE.Vector3(0, 0, 0));
    }
    o.built = true;
  }

  get allBuilt() { return this.objects.every((o) => o.built); }

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

  // Positions relative to the camera, screen projections, level of detail and fades.
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
    // the largest a gas sprite may grow before it fades out: flying through a nebula, the nearest wisps
    // vanish instead of fogging the whole view (and costing the GPU a full-screen sprite each)
    this.uniforms.uMaxPx.value = Math.min(this.maxPoint, viewport.y * 0.35);
    _q.copy(camQuat).invert();

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
      const wanted = this.enabled || o === opt.focus || o === opt.target;
      const show = o.built && wanted && fade > 0.003 && (sc.onScreen || sc.inside);
      o.group.visible = show;
      if (!show) continue;
      o.group.position.copy(o.rel).divideScalar(LY_KM);
      o.group.quaternion.copy(o.quat);
      o.group.scale.setScalar(o.radiusLy);
      // level of detail: small on screen means fewer, brighter particles
      const frac = sc.inside ? 1 : THREE.MathUtils.clamp(Math.pow(sc.r / 200, 1.2), 0.02, 1);
      for (const [name, L] of Object.entries(o.layers)) {
        const n = Math.min(L.count, Math.max(400, Math.round(L.count * frac)));
        L.points.geometry.setDrawRange(0, n);
        const lod = L.count / n;
        L.gain.value = name === 'dust' ? Math.min(1, fade * Math.sqrt(lod)) : GAIN[name] * o.bright * fade * lod;
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
}
