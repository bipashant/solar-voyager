// Solar Voyager: wires the renderer, the simulated Solar System, the camera rig, flights and UI together.
import * as THREE from 'three';
import { SolarSystem } from './bodies.js';
import { Sky } from './sky.js';
import { DeepSky } from './deepsky.js';
import { LY_KM } from './deepsky-data.js';
import { Spacetime } from './spacetime.js';
import { CameraRig } from './controls.js';
import { Travel, arrivalDistance, setViewScale } from './travel.js';
import { TextureStore } from './textures.js';
import { UI } from './ui.js';
import { PosterStudio } from './poster.js';
import { SPEEDS, TRAVEL_MODES, TIME_RATES } from './data.js';
import { jdFromMs, DEG } from './ephemeris.js';
import { fmtDuration } from './format.js';
import * as S from './shaders.js';

const canvas = document.getElementById('view');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
} catch (err) {
  document.getElementById('loader-text').textContent = 'This browser could not start WebGL 2, which the 3D view needs. Try a recent Chrome, Edge, Firefox or Safari.';
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.autoClear = false;

const scene = new THREE.Scene();
const fxScene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 1e-3, 1e13);
const viewport = new THREE.Vector2(1, 1);

const shared = {
  uSunV: { value: new THREE.Vector3() },
  uSunCol: { value: new THREE.Color(1.0, 0.96, 0.9).multiplyScalar(1.3) },
  uTime: { value: 0 },
  uSunR: { value: 695700 },
};

const manager = new THREE.LoadingManager();
const textures = new TextureStore(renderer, manager);
const system = new SolarSystem(scene, textures, shared);
system.showOrbits = true;
const sky = new Sky(textures);
const deep = new DeepSky(renderer);
const spacetime = new Spacetime(system, scene, sky);
const rig = new CameraRig(canvas);
const travel = new Travel();

const camPos = new THREE.Vector3();
const camQuat = new THREE.Quaternion();

// ---------------------------------------------------------------- warp streaks
const streaks = (() => {
  const n = 700, pos = [], end = [];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.25 + Math.pow(Math.random(), 0.7) * 5;
    const z = (Math.random() - 0.5) * 60;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    pos.push(x, y, z, x, y, z);
    end.push(0, 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aEnd', new THREE.Float32BufferAttribute(end, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: S.STREAK_VERT, fragmentShader: S.STREAK_FRAG, transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uPhase: { value: 0 }, uLen: { value: 2 }, uDepth: { value: 60 }, uOpacity: { value: 0 } },
  });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  fxScene.add(lines);
  return lines;
})();

// ---------------------------------------------------------------- app state
const state = {
  simMs: Date.now(),
  timeRate: TIME_RATES.find((r) => r.id === 'real'),
  lastRate: TIME_RATES.find((r) => r.id === 'hour'),
  focus: system.byId.earth,
  destination: system.byId.jupiter,
  speed: SPEEDS.find((s) => s.id === 'light'),
  mode: TRAVEL_MODES[0],
};

// Beyond about 2,000 AU the planets are lost in the Sun's glow, so the Solar System is not drawn at all
// and the Sun becomes a single star in the deep-sky scene.
const SOLAR_HIDE_KM = 3e11;
const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);

const app = {
  state, system, sky, spacetime, travel, rig, camPos, deepSky: deep,
  solarVisible: true,

  // A body of the Solar System or a deep-sky object, by id.
  lookup(id) { return system.byId[id] || deep.byId[id]; },

  systemBody() {
    const b = travel.active ? travel.target : state.focus;
    if (!b || b.deep) return null;
    if (b.kind === 'moon') return b.parent;
    if (b.kind === 'star') return null;
    return b;
  },

  setDestination(id, opts = {}) {
    if (travel.active) return;
    const b = app.lookup(id);
    if (!b) return;
    if (b.deep) deep.build(b);
    state.destination = b;
    ui.syncSelects();
    ui.showInfo(b, b === state.focus ? 'Current location' : 'Destination');
    ui.refreshTrip(true);
    if (!opts.fromSelect && b !== state.focus) {
      ui.toast(`Destination set: <b>${b.name}</b>. Press Engage to fly there.`, 2600);
    }
  },

  tripDistance(b) {
    // galaxies and nebulae park at a chosen viewpoint (for the Milky Way, far outside it)
    if (b.approach) return b.pos.clone().addScaledVector(b.approach(camPos), arrivalDistance(b)).distanceTo(camPos);
    return Math.max(0, b.pos.distanceTo(camPos) - arrivalDistance(b));
  },

  engage() {
    const target = state.destination;
    if (travel.active || target === state.focus) return;
    travel.start({
      fromPos: camPos, fromQuat: camQuat, origin: state.focus, target, sun: system.byId.sun,
      speed: state.speed.kms, warp: state.mode.warp,
    });
    rig.enabled = false;
    if (window.innerWidth < 720) document.getElementById('info').classList.add('collapsed');
    ui.showFlight(true, target);
    ui.refreshTrip(true);
    ui.buildFeatureLabels();
  },

  abort() {
    if (!travel.active) return;
    travel.abort();
    // Stay where we are, orbiting whichever body is nearest relative to its size.
    let best = state.focus, bestScore = Infinity;
    for (const b of [...system.bodies, ...deep.objects]) {
      const d = b.pos.distanceTo(camPos);
      if (b.deep && d < b.radius && b.kind === 'galaxy') continue; // not "near" a galaxy we are inside
      const s = d / Math.max(b.radius, 1) / (b.kind === 'moon' || b.deep ? 1 : 3);
      if (s < bestScore) { bestScore = s; best = b; }
    }
    if (best.deep) deep.build(best);
    arrive(best, true);
  },

  setTimeRate(id) {
    const r = TIME_RATES.find((x) => x.id === id);
    if (!r) return;
    if (r.rate === 0 && state.timeRate.rate !== 0) state.lastRate = state.timeRate;
    state.timeRate = r;
    ui.syncSelects();
  },

  resetTime() {
    state.simMs = Date.now();
    app.setTimeRate('real');
    ui.toast('Clock reset to the current date and time.', 2000);
  },

  lookAtFeature(body, f) {
    if (body !== state.focus) {
      app.setDestination(body.id);
      ui.toast(`Fly to <b>${body.name}</b> first to see ${f.name}.`, 2600);
      return;
    }
    if (body.deep) {
      if (!f.p) return;
      // orbit the feature itself, coming in from the side we are already looking from
      const w = deep.worldOf(body, f.p);
      rig.setPivot(w.clone().sub(body.pos));
      const dir = camPos.clone().sub(w);
      if (dir.lengthSq() < 1) dir.set(0, 0, 1);
      rig.lookAtDirection(dir.normalize(), (f.view ?? 0.3) * body.radius);
      ui.toast(`Looking at <b>${f.name}</b>. Press <b>R</b> to look at the whole of ${body.name} again.`, 3200);
      return;
    }
    const dir = new THREE.Vector3();
    if (f.ring) {
      const pole = new THREE.Vector3(0, 1, 0).applyQuaternion(body.quat);
      const sunDir = system.byId.sun.pos.clone().sub(body.pos).normalize();
      dir.copy(sunDir).addScaledVector(pole, -sunDir.dot(pole)).normalize().addScaledVector(pole, 0.6).normalize();
      rig.lookAtDirection(dir, f.r * 1.1);
    } else {
      system.surfacePoint(body, f.lat, f.lon, dir).sub(body.pos).normalize();
      rig.lookAtDirection(dir, body.maxRadius * 0.9);
      const sunDir = system.byId.sun.pos.clone().sub(body.pos).normalize();
      if (dir.dot(sunDir) < -0.05 && body.kind !== 'star') {
        ui.toast(`It is night over <b>${f.name}</b> right now. Speed up the clock (top left) to watch it rotate into daylight.`, 5200);
        return;
      }
    }
    ui.toast(`Looking at <b>${f.name}</b>`, 1800);
  },

  // Debug helper: arrive at a body instantly (window.solarVoyager.jumpTo('saturn')).
  jumpTo(id) {
    const b = app.lookup(id);
    if (!b || travel.active) return;
    if (b.deep) deep.build(b);
    travel.start({ fromPos: camPos, fromQuat: camQuat, origin: state.focus, target: b, sun: system.byId.sun, speed: state.speed.kms, warp: 0 });
    travel.elapsed = travel.animDuration;
    travel.update(0);
    camPos.copy(travel.pos);
    camQuat.copy(travel.quat);
    state.destination = b;
    arrive(b, false, true);
  },

  projectWorld(p, vp) {
    const v = p.clone().sub(camPos).applyMatrix4(camera.matrixWorldInverse);
    if (v.z >= 0) return null;
    const k = vp.y / (2 * Math.tan((camera.fov * DEG) / 2));
    return { x: (v.x / -v.z) * k + vp.x / 2, y: (-v.y / -v.z) * k + vp.y / 2 };
  },
};

const ui = new UI(app);
app.ui = ui;
ui.ensureBodyLabels(system.bodies);
ui.ensureDeepLabels(deep.objects);
ui.syncSelects();

function arrive(body, aborted = false, quiet = false) {
  state.focus = body;
  rig.syncFrom(body, camPos, camQuat);
  rig.enabled = true;
  ui.showFlight(false);
  if (state.destination === body) {
    // suggest a next stop: the largest moon, or the next planet out
    const next = body.children.slice().sort((a, b) => b.radius - a.radius)[0];
    if (next) state.destination = next;
  }
  ui.syncSelects();
  ui.showInfo(body, 'Current location');
  ui.buildFeatureLabels();
  ui.refreshTrip(true);
  const vis = body.kind === 'star' || body.deep ? 1 : system.sunVisibility(body.pos);
  const shade = vis < 0.1 && system.eclipser
    ? ` ${body.name} is in ${system.eclipser.name}’s shadow right now; speed up the clock to watch it return to sunlight.` : '';
  if (quiet) { if (shade) ui.toast(shade.trim(), 6000); return; }
  if (!aborted) {
    const real = travel.realDuration;
    ui.toast(`Arrived at <b>${body.name}</b> · ${fmtDuration(real)} at ${state.speed.short}.${shade}`, shade ? 7000 : 5200);
  } else {
    ui.toast(`Flight aborted. Holding position near <b>${body.name}</b>.`, 3000);
  }
}

// ---------------------------------------------------------------- picking
function pick(x, y) {
  let best = null, bestScore = Infinity;
  const sys = app.systemBody();
  for (const b of app.solarVisible ? system.bodies : []) {
    const sc = b.screen;
    if (!sc.onScreen) continue;
    if (b.kind === 'moon' && sys !== b.parent && state.focus !== b && sc.r < 4) continue;
    const d = Math.hypot(sc.x - x, sc.y - y);
    const hitR = Math.max(sc.r, 14);
    if (d > hitR) continue;
    // inside a disc: prefer the nearest body; otherwise the closest on screen
    const score = d < sc.r ? sc.dist * 1e-12 : 1 + d;
    if (score < bestScore) { bestScore = score; best = b; }
  }
  if (best) return best;
  // then galaxies and nebulae: the one whose centre is nearest, relative to its size on screen
  for (const o of deep.objects) {
    const sc = o.screen;
    if (!sc.onScreen || sc.inside || (!o.group.visible && o !== state.focus)) continue;
    const d = Math.hypot(sc.x - x, sc.y - y);
    const hitR = Math.max(sc.r * 0.85, 16);
    if (d > hitR) continue;
    const score = d / hitR;
    if (score < bestScore) { bestScore = score; best = o; }
  }
  return best;
}

rig.onTap = (x, y) => {
  const b = pick(x, y);
  if (b) {
    if (b === state.focus) ui.showInfo(b, 'Current location');
    else app.setDestination(b.id);
  } else if (window.innerWidth < 720) {
    ui.closePeeks(); // on a phone, tapping empty space puts the panels away again
  }
};
rig.onDoubleTap = (x, y) => {
  const b = pick(x, y);
  if (b && b !== state.focus) { app.setDestination(b.id); app.engage(); } else rig.resetLook();
};

window.addEventListener('keydown', (e) => {
  if (poster.isOpen) { if (e.key === 'Escape') poster.close(); return; }
  if (e.target.closest && e.target.closest('input, select, textarea')) return;
  if (e.key === 'Escape') {
    if (!document.getElementById('help').hidden) ui.showHelp(false);
    else if (ui.menuOpen) ui.setMenu(false);
    else if (travel.active) app.abort();
    else ui.closePeeks();
  } else if (e.key === ' ') {
    e.preventDefault();
    app.setTimeRate(state.timeRate.rate === 0 ? state.lastRate.id : 'pause');
  } else if (e.key === 'r' || e.key === 'R') rig.resetLook();
  else if (e.key === 'g' || e.key === 'G') ui.setToggle('curvature', !ui.toggles.curvature);
  else if (e.key === 'b' || e.key === 'B') ui.setToggle('deepsky', !ui.toggles.deepsky);
  else if (e.key === 'n' || e.key === 'N') ui.setToggle('dso', !ui.toggles.dso);
  else if (e.key === 'h' || e.key === 'H') ui.setChromeHidden(!ui.uiHidden);
  else if (e.key === 'p' || e.key === 'P') poster.open();
  else if (e.key === 'Enter' && e.target === document.body) app.engage();
});

// ---------------------------------------------------------------- sizing
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < 720 ? 62 : 50;
  camera.updateProjectionMatrix();
  viewport.set(w, h);
  const halfV = (camera.fov * DEG) / 2;
  const halfH = Math.atan(Math.tan(halfV) * camera.aspect);
  setViewScale(Math.max(1, Math.tan(25 * DEG) / Math.tan(Math.min(halfV, halfH))));
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- body snapshots (for posters)
// Renders single bodies with the real materials and lighting for a given date, one at a time, into
// the corner of the WebGL canvas, and copies each into a 2D canvas before the frame ends. Black space
// is keyed out to transparency. The next animation frame restores the live view.
const _snapM = new THREE.Matrix4();
const _snapUp = new THREE.Vector3(0, 0, -1); // ecliptic +y: "up" on a top-down chart
app.snapshot = (jd, requests) => {
  system.update(jd);
  const hidden = [system.markers, system.glare, spacetime.mesh, ...system.orbitLines.map((o) => o.line)];
  const was = hidden.map((o) => o && o.visible);
  hidden.forEach((o) => { if (o) o.visible = false; });
  const groupVis = system.bodies.map((b) => b.group.visible);
  const pr = renderer.getPixelRatio();
  const maxPx = Math.min(1024, canvas.width, canvas.height);
  const half = 9 * DEG;
  camera.fov = half * 2 / DEG;
  camera.aspect = 1;
  camera.updateProjectionMatrix();
  renderer.setScissorTest(true);
  const out = {};
  const eye = new THREE.Vector3(), dir = new THREE.Vector3();
  for (const req of requests) {
    const b = system.byId[req.id];
    const size = Math.max(16, Math.min(maxPx, Math.round(req.px)));
    for (const o of system.bodies) o.group.visible = o === b;
    const atmo = b.data.atmosphere ? 1 + b.data.atmosphere.thickness : 1;
    const extent = (b.data.rings === 'saturn' ? b.ringOuter : b.maxRadius * atmo) * 1.03;
    let dist;
    if (req.from) {
      // as seen from another body's centre, e.g. the Moon's phase from Earth
      eye.copy(system.byId[req.from].pos);
      dist = eye.distanceTo(b.pos);
      camera.fov = (2 * Math.asin(Math.min(1, extent / dist))) / DEG;
      camera.updateProjectionMatrix();
    } else {
      // from above the ecliptic, leaning a little sunward so more of the day side shows
      dir.set(0, 1, 0);
      if (b.kind !== 'star') dir.add(system.byId.sun.pos.clone().sub(b.pos).setY(0).normalize().multiplyScalar(0.5));
      dir.normalize();
      dist = extent / Math.sin(half);
      eye.copy(b.pos).addScaledVector(dir, dist);
      if (camera.fov !== half * 2 / DEG) { camera.fov = half * 2 / DEG; camera.updateProjectionMatrix(); }
    }
    _snapM.lookAt(eye, b.pos, req.from ? new THREE.Vector3(0, 1, 0) : _snapUp);
    camera.position.set(0, 0, 0);
    camera.quaternion.setFromRotationMatrix(_snapM);
    camera.updateMatrixWorld();
    system.updateRender(eye, camera, new THREE.Vector2(size, size), b, null);
    hidden.forEach((o) => { if (o) o.visible = false; }); // updateRender turns the glare and orbits back on
    renderer.setViewport(0, 0, size / pr, size / pr);
    renderer.setScissor(0, 0, size / pr, size / pr);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(scene, camera);

    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, 0, canvas.height - size, size, size, 0, 0, size, size);
    const img = ctx.getImageData(0, 0, size, size), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const m = Math.max(d[i], d[i + 1], d[i + 2]);
      const a = Math.min(1, m / 38);
      if (a < 1) {
        if (a === 0) { d[i + 3] = 0; continue; }
        d[i] = Math.min(255, d[i] / a); d[i + 1] = Math.min(255, d[i + 1] / a); d[i + 2] = Math.min(255, d[i + 2] / a);
      }
      d[i + 3] = Math.round(a * 255);
    }
    ctx.putImageData(img, 0, 0);
    const angR = Math.asin(Math.min(1, b.maxRadius / dist));
    const halfFov = (camera.fov * DEG) / 2;
    out[req.id] = { canvas: c, radiusPx: (size / 2) * (Math.tan(angR) / Math.tan(halfFov)) };
  }
  renderer.setScissorTest(false);
  system.bodies.forEach((b, i) => { b.group.visible = groupVis[i]; });
  hidden.forEach((o, i) => { if (o) o.visible = was[i]; });
  resize();
  return out;
};

// ---------------------------------------------------------------- start position: Earth, three-quarter lit
system.update(jdFromMs(state.simMs));
{
  const earth = system.byId.earth;
  const toSun = system.byId.sun.pos.clone().sub(earth.pos).normalize();
  const dir = toSun.applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.75);
  dir.y += 0.25;
  dir.normalize();
  camPos.copy(earth.pos).addScaledVector(dir, arrivalDistance(earth) * 1.05);
  rig.syncFrom(earth, camPos, camQuat);
}
system.buildOrbitLines(jdFromMs(state.simMs));
ui.showInfo(state.focus, 'Current location');

// ---------------------------------------------------------------- poster studio
const poster = new PosterStudio(app);
app.openPoster = () => poster.open();

// ---------------------------------------------------------------- loading
manager.onProgress = (url, loaded, total) => ui.setLoader(loaded / Math.max(total, 1));
const jobs = [...system.initialTextureJobs(), sky.loadMilkyWay()];
Promise.allSettled(jobs).then((results) => {
  const failed = results.filter((r) => r.status === 'rejected').length;
  ui.hideLoader();
  ui.loaded = true;
  if (failed) ui.toast(`${failed} map${failed > 1 ? 's' : ''} failed to load; those worlds use generated surfaces.`, 5000);
  else ui.toast(ui.toggles.console
    ? 'Pick a destination and speed below, then press <b>Engage</b>.'
    : 'Tap a world to choose it, then the <b>arrow</b> below to fly there. <b>View</b> brings back the rest.', 5000);
  if (location.hash === '#poster') poster.open(); // shareable link straight to the studio
  sky.upgradeMilkyWay().catch(() => {});
  system.upgradeTextures(state.focus);
});

// ---------------------------------------------------------------- frame loop
let last = performance.now();
const tmpDir = new THREE.Vector3();
const lookPoint = new THREE.Vector3();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  state.simMs += dt * 1000 * state.timeRate.rate;
  const jd = jdFromMs(state.simMs);
  shared.uTime.value += dt;
  system.update(jd);
  if (Math.abs(jd - system.orbitJd) > 3650) system.buildOrbitLines(jd);

  if (travel.active) {
    const done = travel.update(dt);
    camPos.copy(travel.pos);
    camQuat.copy(travel.quat);
    ui.updateFlight(travel);
    if (done) arrive(travel.target);
  } else {
    rig.update(dt, camPos, camQuat);
  }

  camera.position.set(0, 0, 0);
  camera.quaternion.copy(camQuat);
  camera.updateMatrixWorld();
  const here = travel.active ? travel.target : state.focus;
  const dSun = camPos.length();
  const dLy = dSun / LY_KM;
  app.solarVisible = dSun < SOLAR_HIDE_KM;
  system.glareFade = 1 - smooth(3e10, SOLAR_HIDE_KM, dSun);
  system.updateRender(camPos, camera, viewport, here && !here.deep ? here : null, app.systemBody());
  spacetime.update(dt, camPos, app.solarVisible && here && !here.deep ? here : null);
  sky.setDistance(dLy);
  deep.update(camPos, camQuat, viewport, camera.fov, {
    focus: state.focus, target: travel.active ? travel.target : state.destination,
    mwFade: smooth(6000, 50000, dLy), sunStar: smooth(1e11, SOLAR_HIDE_KM, dSun),
    // the point the camera orbits, for close-up detail
    look: !travel.active && state.focus.deep ? lookPoint.copy(state.focus.pos).add(rig.pivot) : null,
  });
  // the deep-sky models are built and baked in the background once the planets have loaded
  if (ui.loaded) deep.start();
  deep.setFrameTime(dt);

  const earth = system.byId.earth;
  if (earth.surface.uniforms.uCloudShift) {
    const shift = ((state.simMs / 86400000) * 0.004) % 1;
    earth.surface.uniforms.uCloudShift.value = shift;
    earth.clouds.material.uniforms.uShift.value = shift;
  }

  for (const b of [state.focus, travel.active ? travel.target : state.destination]) {
    if (b && !b.deep && b.screen.r > 260) system.upgradeTextures(b);
  }

  // warp streaks
  const sm = streaks.material.uniforms;
  const streakTarget = travel.active ? travel.streak : 0;
  sm.uOpacity.value += (streakTarget - sm.uOpacity.value) * (1 - Math.exp(-dt * 5));
  streaks.visible = sm.uOpacity.value > 0.01;
  if (streaks.visible) {
    sm.uPhase.value += dt * (20 + 90 * sm.uOpacity.value);
    sm.uLen.value = 1 + 9 * sm.uOpacity.value;
    tmpDir.copy(travel.active ? travel.travelDir : tmpDir.set(0, 0, -1).applyQuaternion(camQuat));
    streaks.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), tmpDir.normalize());
  }

  sky.sync(camera);
  renderer.clear();
  if (sky.scene.visible) renderer.render(sky.scene, sky.camera);
  deep.render(renderer);
  renderer.clearDepth();
  if (app.solarVisible) renderer.render(scene, camera);
  if (streaks.visible) renderer.render(fxScene, camera);

  ui.updateLabels(viewport);
  ui.updateZoom();
  ui.updateDock(false);
  ui.refreshLive(false);
  ui.refreshTrip(false);
  ui.updateClock(state.simMs);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Exposed for debugging from the console.
window.solarVoyager = app;
