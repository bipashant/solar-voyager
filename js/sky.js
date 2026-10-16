// Background sky: Milky Way panorama in galactic coordinates, bright stars and constellation figures.
import * as THREE from 'three';
import { STARS, STAR_BY_NAME, CONSTELLATIONS, NAMED_STARS } from './stars.js';
import { raDecToScene, sceneToGalacticMatrix } from './ephemeris.js';
import * as S from './shaders.js';

const R_SKY = 100;
const MAX_LENS = 6;

export function bvToColor(bv) {
  const stops = [
    [-0.4, [0.61, 0.70, 1.0]], [0.0, [0.79, 0.85, 1.0]], [0.3, [0.97, 0.97, 1.0]], [0.6, [1.0, 0.96, 0.91]],
    [0.9, [1.0, 0.89, 0.77]], [1.2, [1.0, 0.82, 0.63]], [1.5, [1.0, 0.75, 0.48]], [2.0, [1.0, 0.6, 0.3]],
  ];
  if (bv <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (bv <= stops[i][0]) {
      const [b0, c0] = stops[i - 1], [b1, c1] = stops[i];
      const t = (bv - b0) / (b1 - b0);
      return c0.map((c, k) => c + (c1[k] - c) * t);
    }
  }
  return stops[stops.length - 1][1];
}

export class Sky {
  constructor(textures) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    this.textures = textures;
    // Gravitational lenses, filled in by Spacetime while curvature is shown.
    this.lens = {
      uLens: { value: Array.from({ length: MAX_LENS }, () => new THREE.Vector4()) },
      uLensS: { value: new Array(MAX_LENS).fill(0) },
      uLensN: { value: 0 },
    };

    this.milkyMat = new THREE.ShaderMaterial({
      vertexShader: S.SKY_VERT, fragmentShader: S.SKY_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: false,
      toneMapped: false,
      uniforms: { uMilky: { value: textures.placeholder }, uGal: { value: sceneToGalacticMatrix() }, uBright: { value: 1.25 }, ...this.lens },
    });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(R_SKY, 96, 48), this.milkyMat);
    sphere.renderOrder = 0;
    this.scene.add(sphere);

    // Bright stars
    const n = STARS.length;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
    const v = new THREE.Vector3();
    STARS.forEach((s, i) => {
      raDecToScene(s.ra, s.dec, v).multiplyScalar(R_SKY * 0.95);
      s.dir = v.clone().normalize();
      pos.set([v.x, v.y, v.z], i * 3);
      col.set(bvToColor(s.bv), i * 3);
      size[i] = THREE.MathUtils.clamp(6.2 - 1.45 * s.mag, 1.6, 10);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    this.starMat = new THREE.ShaderMaterial({
      vertexShader: S.STAR_VERT, fragmentShader: S.STAR_FRAG, transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
      uniforms: { uScale: { value: Math.min(window.devicePixelRatio, 2) }, uBright: { value: 1.0 }, ...this.lens },
    });
    const stars = new THREE.Points(geo, this.starMat);
    stars.renderOrder = 2;
    stars.frustumCulled = false;
    this.scene.add(stars);
    // Each lens also makes a faint second image of every star, on the far side inside its Einstein ring.
    const innerMat = this.starMat.clone();
    innerMat.uniforms = this.starMat.uniforms;
    innerMat.defines = { LENS_MINUS: '' };
    this.innerStars = new THREE.Points(geo, innerMat);
    this.innerStars.renderOrder = 2;
    this.innerStars.frustumCulled = false;
    this.innerStars.visible = false;
    this.scene.add(this.innerStars);

    // Constellation figures
    const seg = [];
    this.constellationAnchors = [];
    for (const c of CONSTELLATIONS) {
      const centroid = new THREE.Vector3();
      const used = new Set();
      for (const line of c.lines) {
        for (let i = 0; i < line.length - 1; i++) {
          const a = STAR_BY_NAME[line[i]], b = STAR_BY_NAME[line[i + 1]];
          if (!a || !b) { console.warn('Missing star', line[i], line[i + 1]); continue; }
          // shorten each segment slightly so lines don't run into the stars
          const pa = a.dir.clone(), pb = b.dir.clone();
          const ang = pa.angleTo(pb);
          const trim = Math.min(0.18, 0.012 / Math.max(ang, 1e-4));
          const qa = pa.clone().lerp(pb, trim).normalize().multiplyScalar(R_SKY * 0.94);
          const qb = pb.clone().lerp(pa, trim).normalize().multiplyScalar(R_SKY * 0.94);
          seg.push(qa.x, qa.y, qa.z, qb.x, qb.y, qb.z);
          used.add(a.name); used.add(b.name);
        }
      }
      for (const name of used) centroid.add(STAR_BY_NAME[name].dir);
      this.constellationAnchors.push({ name: c.name, dir: centroid.normalize() });
    }
    const lgeo = new THREE.BufferGeometry();
    lgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(seg), 3));
    this.lineMat = new THREE.ShaderMaterial({
      vertexShader: S.LINE_SKY_VERT, fragmentShader: S.LINE_SKY_FRAG, transparent: true, depthTest: false, depthWrite: false,
      toneMapped: false,
      uniforms: { uColor: { value: new THREE.Color(0.55, 0.72, 1.0) }, uOpacity: { value: 0.32 }, ...this.lens },
    });
    this.lines = new THREE.LineSegments(lgeo, this.lineMat);
    this.lines.renderOrder = 1;
    this.lines.frustumCulled = false;
    this.scene.add(this.lines);

    this.namedStars = NAMED_STARS.map((name) => STAR_BY_NAME[name]).filter(Boolean);
    this.starFade = 1;
    this.milkyFade = 1;
  }

  async loadMilkyWay() {
    const lo = await this.textures.load('milkyway_2k');
    this.milkyMat.uniforms.uMilky.value = lo;
    return lo;
  }

  async upgradeMilkyWay() {
    const name = this.textures.best(['milkyway_4k', 'milkyway_8k']);
    if (!name) return;
    const hi = await this.textures.load(name);
    const old = this.milkyMat.uniforms.uMilky.value;
    this.milkyMat.uniforms.uMilky.value = hi;
    if (old && old !== hi && old !== this.textures.placeholder) old.dispose();
  }

  setConstellations(on) { this.lines.visible = on; }

  // Fade the sky as seen from the Sun as the ship travels away from it: the bright stars and their
  // constellation figures are our neighbours, gone within a few hundred light-years; the Milky Way panorama
  // is our galaxy seen from inside, replaced by the 3D Milky Way once we are tens of thousands out.
  setDistance(ly) {
    const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    this.starFade = 1 - smooth(Math.log10(30), Math.log10(600), Math.log10(Math.max(ly, 1e-6)));
    this.milkyFade = 1 - smooth(6000, 50000, ly);
    this.milkyMat.uniforms.uBright.value = 1.25 * this.milkyFade;
    this.starMat.uniforms.uBright.value = this.starFade;
    this.lineMat.uniforms.uOpacity.value = 0.32 * this.starFade;
  }

  // The whole background: Milky Way, stars and constellation figures.
  setVisible(on) { this.scene.visible = on; }

  sync(mainCamera) {
    this.camera.quaternion.copy(mainCamera.quaternion);
    this.camera.fov = mainCamera.fov;
    this.camera.aspect = mainCamera.aspect;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.innerStars.visible = this.lens.uLensN.value > 0;
  }

  // Where a star at true direction dir appears through the lenses (its outer image), as in STAR_VERT.
  lensed(dir, out) {
    out.copy(dir);
    const L = this.lens;
    for (let i = 0; i < L.uLensN.value; i++) {
      const l = L.uLens.value[i];
      const c = out.x * l.x + out.y * l.y + out.z * l.z;
      const tx = out.x - l.x * c, ty = out.y - l.y * c, tz = out.z - l.z * c;
      const st = Math.hypot(tx, ty, tz);
      if (st < 1e-9) continue;
      const b = Math.atan2(st, c);
      const th = Math.min(0.5 * (b + Math.sqrt(b * b + 4 * l.w * l.w)), Math.PI);
      const cs = Math.cos(th), sn = Math.sin(th) / st;
      out.set(l.x * cs + tx * sn, l.y * cs + ty * sn, l.z * cs + tz * sn);
    }
    return out;
  }

  // Screen position of a sky direction, or null when behind the camera.
  project(dir, viewport, out) {
    const v = (this.lens.uLensN.value ? this.lensed(dir, out) : out.copy(dir))
      .multiplyScalar(R_SKY).applyMatrix4(this.camera.matrixWorldInverse);
    if (v.z >= 0) return null;
    const pxPerRad = viewport.y / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    return { x: (v.x / -v.z) * pxPerRad + viewport.x / 2, y: (-v.y / -v.z) * pxPerRad + viewport.y / 2 };
  }
}
