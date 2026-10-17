// Builds and updates every body: meshes, materials, rings, atmospheres, orbits and distant markers.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { BODIES, RINGS } from './data.js';
import * as S from './shaders.js';
import {
  planetPosition, planetOrbitPoints, moonGeocentric, equatorFrame, bodyQuaternion, lockedQuaternion,
  solveKepler, latLonToLocal, DEG,
} from './ephemeris.js';

const STYLE_IDS = {
  textured: 1, lunar: 1, gas: 2, clouds: 3, earth: 4, rocky: 10, wispy: 10, iapetus: 10, miranda: 10,
  europa: 11, io: 12, ganymede: 13, callisto: 14, titan: 15, enceladus: 16, triton: 17, pluto: 18, charon: 19,
};

const EARTH_MOON_RATIO = 0.0121505856; // Moon mass / (Earth + Moon mass)

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
}

// Small deterministic value noise for shaping irregular moons.
function hash3(x, y, z, s) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + s * 19.19) * 43758.5453;
  return h - Math.floor(h);
}
function vnoise(x, y, z, s) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  let r = 0;
  for (let k = 0; k < 8; k++) {
    const dx = k & 1, dy = (k >> 1) & 1, dz = (k >> 2) & 1;
    const wt = (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
    r += wt * hash3(xi + dx, yi + dy, zi + dz, s);
  }
  return r * 2 - 1;
}

function lumpyGeometry(seed, amount, detail = 5) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  const dents = [];
  for (let i = 0; i < 7; i++) {
    const d = new THREE.Vector3(hash3(i, 1, 2, seed) - 0.5, hash3(i, 3, 4, seed) - 0.5, hash3(i, 5, 6, seed) - 0.5).normalize();
    dents.push([d, 0.25 + 0.35 * hash3(i, 7, 8, seed)]);
  }
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let n = 0, a = 1, f = 1.3;
    for (let o = 0; o < 4; o++) { n += a * vnoise(v.x * f, v.y * f, v.z * f, seed * 10 + o); a *= 0.5; f *= 2.1; }
    let r = 1 + amount * n;
    for (const [d, rad] of dents) {
      const ang = Math.acos(Math.min(1, Math.max(-1, v.dot(d)))) / rad;
      if (ang < 1.3) r -= amount * 0.5 * (ang < 1 ? (1 - ang * ang) : 0) - amount * 0.12 * Math.exp(-((ang - 1) ** 2) * 20);
    }
    v.multiplyScalar(r);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

const GEO = {
  planet: new THREE.SphereGeometry(1, 192, 96),
  moon: new THREE.SphereGeometry(1, 112, 56),
  small: new THREE.SphereGeometry(1, 48, 24),
  shell: new THREE.SphereGeometry(1, 128, 64),
};

export class SolarSystem {
  constructor(scene, textures, shared) {
    this.scene = scene;
    this.textures = textures;
    this.shared = shared; // uniforms shared by all surface materials
    this.bodies = [];
    this.byId = {};
    this.orbitLines = [];
    this.glareFade = 1; // the Sun's glare dims as the ship leaves the Solar System
    this.tmp = new THREE.Vector3();
    this._moonGeo = new THREE.Vector3();

    for (const data of BODIES) this.bodies.push(this.createBody(data));
    for (const b of this.bodies) {
      this.byId[b.id] = b;
    }
    for (const b of this.bodies) {
      if (b.data.parent) {
        b.parent = this.byId[b.data.parent];
        b.parent.children.push(b);
      }
    }
    for (const b of this.bodies) this.setupOrbit(b);
    for (const b of this.bodies) this.setupOccluders(b);
    this.createMarkers();
  }

  // ---------------------------------------------------------------- construction
  createBody(data) {
    const b = {
      id: data.id, name: data.name, kind: data.kind, data,
      radius: data.radius,
      maxRadius: data.shape ? Math.max(...data.shape) : data.radius,
      pos: new THREE.Vector3(), quat: new THREE.Quaternion(),
      rel: new THREE.Vector3(), viewPos: new THREE.Vector3(),
      screen: { x: 0, y: 0, r: 0, visible: false, behind: true },
      children: [], parent: null, occluders: [],
      group: new THREE.Group(), materials: [], hiRes: false,
      seed: hashString(data.id) * 100,
    };
    b.group.name = data.id;
    this.scene.add(b.group);
    if (data.pole) b.frame = equatorFrame(data.pole[0], data.pole[1]);

    if (data.kind === 'star') this.buildSun(b);
    else this.buildSurface(b);
    if (data.atmosphere) this.buildAtmosphere(b);
    if (data.rings) this.buildRings(b);
    return b;
  }

  textureNames(b, key) {
    return b.data.tex && b.data.tex[key] ? b.data.tex[key] : null;
  }

  async assignTexture(material, uniformName, name, b) {
    const tex = await this.textures.load(name);
    const old = material.uniforms[uniformName].value;
    material.uniforms[uniformName].value = tex;
    // free the smaller map's GPU memory; three.js re-uploads it if anything still uses it
    if (old && old !== tex && old !== this.textures.placeholder) old.dispose();
    if (uniformName === 'uMap' && material.uniforms.uMapW) material.uniforms.uMapW.value = tex.image.width;
    return tex;
  }

  initialTextureJobs() {
    const jobs = [];
    for (const b of this.bodies) {
      for (const job of b.texJobs || []) jobs.push(this.assignTexture(job.mat, job.uniform, job.names[0], b));
    }
    return jobs;
  }

  // Swap in the sharper versions once the camera gets close.
  upgradeTextures(b) {
    if (b.hiRes || !b.texJobs) return;
    b.hiRes = true;
    for (const job of b.texJobs) {
      const hi = this.textures.best(job.names.slice(1));
      if (hi) this.assignTexture(job.mat, job.uniform, hi, b).catch(() => {});
    }
  }

  makeSurfaceMaterial(b, style) {
    const d = b.data;
    const defines = { STYLE: STYLE_IDS[style] ?? 10, LAMBERT_MIX: style === 'lunar' ? '0.12' : '0.7' };
    if (style === 'wispy') defines.WISPY = '';
    if (style === 'iapetus') defines.IAPETUS = '';
    if (style === 'miranda') defines.MIRANDA = '';
    if (style === 'earth') defines.EARTH = '';
    if (d.hexagon) defines.HEXAGON = '';
    const big = d.bigCrater;
    const uniforms = {
      uSunV: this.shared.uSunV, uSunCol: this.shared.uSunCol, uTime: this.shared.uTime, uSunR: this.shared.uSunR,
      uRadius: { value: d.radius },
      uRelief: { value: d.relief ?? (d.lumpy ? 0.06 * d.radius : 0.004 * d.radius) },
      uSeed: { value: b.seed },
      uColA: { value: new THREE.Color(d.colA || d.color) },
      uColB: { value: new THREE.Color(d.colB || d.color).multiplyScalar(d.colB ? 1 : 1.15) },
      uCraterDensity: { value: Math.min(0.9, 0.42 * (d.craters ?? 1)) },
      uBigDir: { value: big ? latLonToLocal(big[0], big[1]) : new THREE.Vector3(1, 0, 0) },
      uBigR: { value: big ? big[2] * DEG : 0 },
      uBigRing: { value: big ? big[3] : 0 },
      uMapW: { value: 2048 },
      uBright: { value: d.bright ?? 1 },
      uMap: { value: this.textures.placeholder },
      uOcc: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
      uOccN: { value: 0 },
    };
    if (style === 'earth') {
      Object.assign(uniforms, {
        uNight: { value: this.textures.placeholder }, uSpec: { value: this.textures.placeholder },
        uNormal: { value: this.textures.placeholder }, uClouds: { value: this.textures.placeholder },
        uCloudShift: { value: 0 },
      });
    }
    if (d.rings === 'saturn') {
      defines.RING_SHADOW = '';
      Object.assign(uniforms, this.ringUniforms(d.rings), {
        uRingNormalV: { value: new THREE.Vector3() }, uCenterV: { value: new THREE.Vector3() },
      });
    }
    return new THREE.ShaderMaterial({
      vertexShader: S.SURFACE_VERT, fragmentShader: S.SURFACE_FRAG, uniforms, defines,
    });
  }

  ringUniforms(key) {
    const r = RINGS[key];
    const bands = [];
    for (let i = 0; i < 12; i++) {
      const bd = r.bands[i];
      bands.push(bd ? new THREE.Vector4(bd[0], bd[1], bd[2], bd[3]) : new THREE.Vector4());
    }
    return { uBands: { value: bands }, uBandN: { value: r.bands.length }, uRingNoise: { value: r.noise } };
  }

  buildSurface(b) {
    const d = b.data;
    const style = d.style || (d.tex?.map ? (d.id === 'mars' ? 'textured' : 'lunar') : 'rocky');
    const mat = this.makeSurfaceMaterial(b, style);
    let geo;
    if (d.lumpy) geo = lumpyGeometry(b.seed, d.lumpy, d.shape || d.radius > 60 ? 6 : 5);
    else geo = d.kind === 'moon' && d.radius < 300 ? GEO.small : (d.kind === 'moon' ? GEO.moon : GEO.planet);
    const mesh = new THREE.Mesh(geo, mat);
    if (d.shape) mesh.scale.set(d.shape[0], d.shape[1], d.shape[2]);
    else mesh.scale.set(d.radius, d.polar || d.radius, d.radius);
    mesh.frustumCulled = false;
    b.group.add(mesh);
    b.mesh = mesh;
    b.surface = mat;
    b.materials.push(mat);
    b.texJobs = [];
    if (d.tex?.map) b.texJobs.push({ mat, uniform: 'uMap', names: d.tex.map });
    if (style === 'earth') {
      b.texJobs.push({ mat, uniform: 'uNight', names: d.tex.night });
      b.texJobs.push({ mat, uniform: 'uSpec', names: d.tex.spec });
      b.texJobs.push({ mat, uniform: 'uNormal', names: d.tex.normal });
      b.texJobs.push({ mat, uniform: 'uClouds', names: d.tex.clouds });
      this.buildClouds(b);
    }
  }

  buildClouds(b) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: S.SURFACE_VERT, fragmentShader: S.CLOUDS_FRAG, transparent: true, depthWrite: false,
      uniforms: {
        uSunV: this.shared.uSunV, uSunCol: this.shared.uSunCol, uSunR: this.shared.uSunR,
        uMap: { value: this.textures.placeholder }, uShift: { value: 0 }, uMapW: { value: 2048 },
        uOcc: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
        uOccN: { value: 0 },
      },
    });
    const mesh = new THREE.Mesh(GEO.planet, mat);
    const r = b.data.radius * 1.0016;
    mesh.scale.set(r, (b.data.polar || b.data.radius) * 1.0016, r);
    mesh.renderOrder = 1;
    mesh.frustumCulled = false;
    b.group.add(mesh);
    b.clouds = mesh;
    b.materials.push(mat);
    b.texJobs.push({ mat, uniform: 'uMap', names: b.data.tex.clouds });
  }

  buildSun(b) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: S.SURFACE_VERT, fragmentShader: S.SUN_FRAG,
      uniforms: { uMap: { value: this.textures.placeholder }, uMapW: { value: 2048 }, uTime: this.shared.uTime, uIntensity: { value: 0.8 } },
    });
    const mesh = new THREE.Mesh(GEO.planet, mat);
    mesh.scale.setScalar(b.radius);
    mesh.frustumCulled = false;
    b.group.add(mesh);
    b.mesh = mesh;
    b.surface = mat;
    b.texJobs = [{ mat, uniform: 'uMap', names: b.data.tex.map }];

    // Corona and glare, sized in pixels so the Sun stays dazzling from Neptune.
    const quad = new THREE.PlaneGeometry(2, 2);
    this.glare = new THREE.Mesh(quad, new THREE.ShaderMaterial({
      vertexShader: S.GLARE_VERT, fragmentShader: S.GLARE_FRAG,
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uCenterV: { value: new THREE.Vector3() }, uSizeWorld: { value: b.radius * 2.6 }, uMinPx: { value: 160 },
        uViewport: { value: new THREE.Vector2(1, 1) }, uFovScale: { value: 1 }, uIntensity: { value: 1 }, uCorona: { value: 0 }, uTime: this.shared.uTime,
      },
    }));
    this.glare.frustumCulled = false;
    this.glare.renderOrder = 100;
    this.scene.add(this.glare);
  }

  buildAtmosphere(b) {
    const a = b.data.atmosphere;
    const mat = new THREE.ShaderMaterial({
      vertexShader: S.ATMO_VERT, fragmentShader: S.ATMO_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
      uniforms: {
        uCamL: { value: new THREE.Vector3() }, uSunL: { value: new THREE.Vector3() },
        uInner: { value: 1 / (1 + a.thickness) }, uColor: { value: new THREE.Vector3(...a.color) },
        uMie: { value: a.mie ?? 0.3 }, uIntensity: { value: a.intensity ?? 1 }, uScaleH: { value: a.scale ?? 0.22 },
        uInside: { value: 0 }, uSunVis: { value: 1 },
      },
    });
    const mesh = new THREE.Mesh(GEO.shell, mat);
    const ra = b.data.radius * (1 + a.thickness);
    mesh.scale.set(ra, (b.data.polar || b.data.radius) * (1 + a.thickness), ra);
    mesh.renderOrder = 2;
    mesh.frustumCulled = false;
    b.group.add(mesh);
    b.atmo = mesh;
  }

  buildRings(b) {
    const r = RINGS[b.data.rings];
    const inner = r.bands[0][0], outer = r.bands[r.bands.length - 1][1];
    const geo = new THREE.RingGeometry(inner * 0.995, outer * 1.005, 512, 6);
    const mat = new THREE.ShaderMaterial({
      vertexShader: S.RING_VERT, fragmentShader: S.RING_FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: {
        uSunV: this.shared.uSunV, uSunCol: this.shared.uSunCol,
        uCenterV: { value: new THREE.Vector3() }, uNormalV: { value: new THREE.Vector3() },
        uPlanetR: { value: b.data.radius }, uPlanetFlat: { value: (b.data.polar || b.data.radius) / b.data.radius },
        uColA: { value: new THREE.Vector3(...r.colA) }, uColB: { value: new THREE.Vector3(...r.colB) },
        uBright: { value: r.brightness },
        ...this.ringUniforms(b.data.rings),
      },
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2; // ring plane → equatorial plane (local XZ)
    mesh.renderOrder = 3;
    mesh.frustumCulled = false;
    b.group.add(mesh);
    b.rings = mesh;
    b.ringOuter = outer;
  }

  setupOrbit(b) {
    const d = b.data;
    if (d.kind !== 'moon' || d.orbit === 'luna') return;
    const parent = b.parent;
    let pole, node, ahead;
    if (d.irregular) {
      pole = new THREE.Vector3(0, 1, 0); node = new THREE.Vector3(1, 0, 0); ahead = new THREE.Vector3(0, 0, -1);
    } else {
      const f = parent.frame || equatorFrame(0, 90);
      pole = f.pole; node = f.node; ahead = f.ahead;
    }
    const Om = hashString(d.id + 'node') * Math.PI * 2;
    const inc = (d.inc || 0) * DEG;
    const n = node.clone().multiplyScalar(Math.cos(Om)).addScaledVector(ahead, Math.sin(Om));
    const m = new THREE.Vector3().crossVectors(pole, n);
    const U = n;
    const V = m.clone().multiplyScalar(Math.cos(inc)).addScaledVector(pole, Math.sin(inc));
    b.orbitU = U; b.orbitV = V;
    b.orbitN = new THREE.Vector3().crossVectors(U, V).normalize();
    b.phase0 = hashString(d.id + 'phase') * Math.PI * 2;
  }

  setupOccluders(b) {
    if (b.kind === 'star') return;
    if (b.kind === 'moon') {
      b.occluders = [b.parent];
      return;
    }
    b.occluders = b.children
      .filter((m) => m.radius > 150)
      .sort((x, y) => y.radius - x.radius)
      .slice(0, 4);
  }

  createMarkers() {
    const n = this.bodies.length;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n), 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(n), 1));
    const c = new THREE.Color();
    this.bodies.forEach((b, i) => {
      c.set(b.data.color);
      geo.attributes.aColor.setXYZ(i, c.r, c.g, c.b);
    });
    this.markers = new THREE.Points(geo, new THREE.ShaderMaterial({
      vertexShader: S.MARKER_VERT, fragmentShader: S.MARKER_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uDpr: { value: Math.min(window.devicePixelRatio, 2) } },
    }));
    this.markers.frustumCulled = false;
    this.markers.renderOrder = 5;
    this.scene.add(this.markers);
  }

  buildOrbitLines(jd) {
    for (const l of this.orbitLines) { this.scene.remove(l.line); l.line.geometry.dispose(); }
    this.orbitLines = [];
    for (const b of this.bodies) {
      let pts, ref, radius;
      if (b.kind === 'planet' || b.kind === 'dwarf') {
        pts = planetOrbitPoints(b.id, jd, 1440);
        ref = null;
        radius = pts[0].length();
      } else if (b.kind === 'moon') {
        pts = [];
        const seg = 360;
        if (b.data.orbit === 'luna') {
          const p0 = moonGeocentric(jd, new THREE.Vector3());
          const p1 = moonGeocentric(jd + 0.5, new THREE.Vector3());
          const N = new THREE.Vector3().crossVectors(p0, p1).normalize();
          const U = p0.clone().normalize();
          const V = new THREE.Vector3().crossVectors(N, U);
          for (let i = 0; i <= seg; i++) {
            const a = (i / seg) * Math.PI * 2;
            pts.push(U.clone().multiplyScalar(Math.cos(a) * 384400).addScaledVector(V, Math.sin(a) * 384400));
          }
        } else {
          const e = b.data.e || 0;
          for (let i = 0; i <= seg; i++) {
            const E = (i / seg) * Math.PI * 2;
            const x = b.data.a * (Math.cos(E) - e), y = b.data.a * Math.sqrt(1 - e * e) * Math.sin(E);
            pts.push(b.orbitU.clone().multiplyScalar(x).addScaledVector(b.orbitV, y));
          }
        }
        ref = b.parent;
        radius = b.data.a;
      } else continue;
      // Positions relative to the reference body, stored as Float32 offsets.
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.ShaderMaterial({
        vertexShader: S.ORBIT_VERT, fragmentShader: S.ORBIT_FRAG, transparent: true, depthWrite: false,
        uniforms: { uColor: { value: new THREE.Color(b.data.color) }, uOpacity: { value: 0.35 }, uFadeNear: { value: 1 } },
      });
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      line.renderOrder = 4;
      this.scene.add(line);
      this.orbitLines.push({ body: b, line, ref, radius });
    }
    this.orbitJd = jd;
  }

  // ---------------------------------------------------------------- per-frame update
  update(jd) {
    const d = jd - 2451545.0;
    const sun = this.byId.sun;
    sun.pos.set(0, 0, 0);
    bodyQuaternion(sun.frame, sun.data.W[0] + sun.data.W[1] * d, sun.quat);

    for (const b of this.bodies) {
      if (b.kind !== 'planet' && b.kind !== 'dwarf') continue;
      planetPosition(b.id, jd, b.pos);
      bodyQuaternion(b.frame, b.data.W[0] + b.data.W[1] * d, b.quat);
    }
    // Earth–Moon barycentre → Earth and Moon
    const earth = this.byId.earth, moon = this.byId.moon;
    moonGeocentric(jd, this._moonGeo);
    earth.pos.addScaledVector(this._moonGeo, -EARTH_MOON_RATIO);
    moon.pos.copy(earth.pos).add(this._moonGeo);
    if (!moon.frame) moon.frame = equatorFrame(269.9949, 66.5392);
    this.tmp.copy(earth.pos).sub(moon.pos).normalize();
    lockedQuaternion(this.tmp, moon.frame.pole, moon.quat);

    for (const b of this.bodies) {
      if (b.kind !== 'moon' || b.data.orbit === 'luna') continue;
      const md = b.data;
      const M = b.phase0 + (2 * Math.PI * d) / md.period;
      let r = md.a, nu = M;
      if (md.e) {
        const Mn = Math.atan2(Math.sin(M), Math.cos(M));
        const E = solveKepler(Mn, md.e);
        r = md.a * (1 - md.e * Math.cos(E));
        nu = 2 * Math.atan2(Math.sqrt(1 + md.e) * Math.sin(E / 2), Math.sqrt(1 - md.e) * Math.cos(E / 2));
      }
      b.pos.copy(b.parent.pos)
        .addScaledVector(b.orbitU, r * Math.cos(nu))
        .addScaledVector(b.orbitV, r * Math.sin(nu));
      if (md.spin) {
        b.quat.setFromAxisAngle(b.orbitN, (2 * Math.PI * d) / md.spin);
      } else {
        this.tmp.copy(b.parent.pos).sub(b.pos).normalize();
        lockedQuaternion(this.tmp, b.orbitN, b.quat);
      }
    }
    // Pluto is tidally locked to Charon.
    const pluto = this.byId.pluto, charon = this.byId.charon;
    this.tmp.copy(charon.pos).sub(pluto.pos).normalize();
    lockedQuaternion(this.tmp, pluto.frame.pole, pluto.quat);
  }

  // Place everything relative to the camera and refresh view-space uniforms.
  updateRender(camPos, camera, viewport, focusBody, systemBody) {
    const view = camera.matrixWorldInverse;
    const sun = this.byId.sun;
    const v4 = new THREE.Vector3();
    for (const b of this.bodies) {
      b.rel.copy(b.pos).sub(camPos);
      b.group.position.copy(b.rel);
      b.group.quaternion.copy(b.quat);
      b.viewPos.copy(b.rel).applyMatrix4(view);
    }
    this.shared.uSunV.value.copy(sun.viewPos);

    const fovScale = 2 * Math.tan((camera.fov * DEG) / 2);
    const pxPerRad = viewport.y / fovScale;
    for (const b of this.bodies) {
      b.group.updateMatrixWorld(true);
      // occluders for eclipses
      if (b.surface && b.surface.uniforms.uOcc) {
        const occ = b.occluders;
        const arr = b.surface.uniforms.uOcc.value;
        for (let i = 0; i < occ.length; i++) arr[i].set(occ[i].viewPos.x, occ[i].viewPos.y, occ[i].viewPos.z, occ[i].radius);
        b.surface.uniforms.uOccN.value = occ.length;
        if (b.clouds) {
          const ca = b.clouds.material.uniforms.uOcc.value;
          for (let i = 0; i < occ.length; i++) ca[i].copy(arr[i]);
          b.clouds.material.uniforms.uOccN.value = occ.length;
        }
      }
      if (b.rings) {
        const nrm = v4.set(0, 1, 0).applyQuaternion(b.quat).transformDirection(view);
        const ru = b.rings.material.uniforms;
        ru.uCenterV.value.copy(b.viewPos);
        ru.uNormalV.value.copy(nrm);
        if (b.surface.uniforms.uRingNormalV) {
          b.surface.uniforms.uRingNormalV.value.copy(nrm);
          b.surface.uniforms.uCenterV.value.copy(b.viewPos);
        }
      }
      if (b.atmo) {
        const au = b.atmo.material.uniforms;
        b.atmo.updateMatrixWorld(true);
        const inv = new THREE.Matrix4().copy(b.atmo.matrixWorld).invert();
        au.uCamL.value.set(0, 0, 0).applyMatrix4(inv);
        au.uSunL.value.copy(sun.rel).applyMatrix4(inv).normalize();
        const inside = au.uCamL.value.length() < 1.0;
        au.uInside.value = inside ? 1 : 0;
        b.atmo.material.side = inside ? THREE.BackSide : THREE.FrontSide;
      }
      // projected size for labels and markers
      const dist = b.rel.length();
      const sc = b.screen;
      sc.dist = dist;
      sc.behind = b.viewPos.z > 0;
      const angR = Math.asin(Math.min(1, b.maxRadius / Math.max(dist, b.maxRadius)));
      sc.r = angR * pxPerRad;
      if (!sc.behind) {
        sc.x = (b.viewPos.x / -b.viewPos.z) * pxPerRad + (viewport.cx ?? viewport.x / 2);
        sc.y = (-b.viewPos.y / -b.viewPos.z) * pxPerRad + (viewport.cy ?? viewport.y / 2);
      }
      sc.onScreen = !sc.behind && sc.x > -sc.r - 50 && sc.x < viewport.x + sc.r + 50 && sc.y > -sc.r - 50 && sc.y < viewport.y + sc.r + 50;
    }

    // Distant-body markers
    const geo = this.markers.geometry;
    const pa = geo.attributes.position, sa = geo.attributes.aSize, aa = geo.attributes.aAlpha;
    this.bodies.forEach((b, i) => {
      const sc = b.screen;
      const toward = v4.copy(b.rel).normalize();
      const p = this.tmp.copy(b.rel).addScaledVector(toward, -b.maxRadius * 1.2);
      pa.setXYZ(i, p.x, p.y, p.z);
      let size = b.kind === 'planet' ? 5 : b.kind === 'dwarf' ? 4 : b.kind === 'star' ? 0 : 3;
      let alpha = 1 - THREE.MathUtils.smoothstep(sc.r, 1.5, 4);
      if (b.kind === 'moon') {
        const par = b.parent.screen;
        const sep = Math.hypot(sc.x - par.x, sc.y - par.y);
        alpha *= THREE.MathUtils.smoothstep(sep, par.r + 4, par.r + 14);
        if (systemBody !== b.parent && systemBody !== b && b.parent.screen.r < 1.5) alpha *= 0.0;
      }
      sa.setX(i, size);
      aa.setX(i, sc.behind ? 0 : alpha);
    });
    pa.needsUpdate = true; sa.needsUpdate = true; aa.needsUpdate = true;

    // Solar glare
    if (this.glare) {
      const gu = this.glare.material.uniforms;
      gu.uCenterV.value.copy(sun.viewPos);
      gu.uViewport.value.set(viewport.x, viewport.y);
      gu.uFovScale.value = fovScale;
      gu.uIntensity.value = this.sunVisibility(camPos) * this.glareFade;
      // during a total (or nearly total) eclipse the corona shows around the hidden Sun
      gu.uCorona.value = this.eclipser ? THREE.MathUtils.smoothstep(1 - gu.uIntensity.value, 0.85, 0.995) * this.glareFade : 0;
      this.glare.visible = sun.viewPos.z < 0 && (gu.uIntensity.value > 0.001 || gu.uCorona.value > 0.001);
    }

    // Orbits: planetary orbits fade out while you are close to a world
    const focusDist = focusBody ? focusBody.rel.length() : 1e9;
    const closeness = focusBody ? Math.log10(focusDist / Math.max(focusBody.radius, 1)) : 9;
    const planetFade = THREE.MathUtils.smoothstep(closeness, 1.6, 3.2);
    for (const o of this.orbitLines) {
      const b = o.body;
      if (o.ref) o.line.position.copy(o.ref.rel);
      else o.line.position.copy(sun.rel);
      const u = o.line.material.uniforms;
      u.uFadeNear.value = Math.min(focusDist * 4, o.radius * 0.06);
      let op = (b === focusBody || b === systemBody ? 0.55 : 0.28) * planetFade;
      if (b.kind === 'moon') {
        const inSystem = systemBody && (b.parent === systemBody);
        op = inSystem ? (b === focusBody ? 0.5 : b.radius < 150 ? 0.1 : 0.22) : 0;
        if (b.data.irregular && inSystem) op *= 0.6;
      }
      o.line.visible = op > 0 && this.showOrbits;
      u.uOpacity.value = op;
    }
  }

  // Fraction of the solar disc not hidden by a planet or moon (for the glare).
  sunVisibility(camPos) {
    const sun = this.byId.sun;
    const toSun = this.tmp.copy(sun.pos).sub(camPos);
    const dS = toSun.length();
    if (dS < sun.radius) return 0;
    toSun.divideScalar(dS);
    const aS = Math.asin(sun.radius / dS);
    let vis = 1;
    this.eclipser = null;
    const o = new THREE.Vector3();
    for (const b of this.bodies) {
      if (b === sun) continue;
      o.copy(b.pos).sub(camPos);
      const dO = o.length();
      if (dO > dS || dO < b.radius) continue;
      const aO = Math.asin(Math.min(1, b.radius / dO));
      const sep = Math.acos(Math.min(1, Math.max(-1, o.dot(toSun) / dO)));
      if (sep >= aS + aO) continue;
      const rmin = Math.abs(aS - aO), rmax = aS + aO;
      const full = Math.min(1, (aO * aO) / (aS * aS));
      const t = THREE.MathUtils.clamp((sep - rmin) / (rmax - rmin), 0, 1);
      const v = 1 - full * (1 - t * t * (3 - 2 * t));
      if (v < 0.98 && (!this.eclipser || v < this.eclipserVis)) { this.eclipser = b; this.eclipserVis = v; }
      vis *= v;
    }
    return vis;
  }

  // World-space position of a lat/lon point on a body's surface.
  surfacePoint(b, lat, lon, out = new THREE.Vector3()) {
    latLonToLocal(lat, lon, out);
    const s = b.mesh.scale;
    out.set(out.x * s.x, out.y * s.y, out.z * s.z).applyQuaternion(b.quat).add(b.pos);
    return out;
  }
}
