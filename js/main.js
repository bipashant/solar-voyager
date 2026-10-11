// Solar Voyager: wires the renderer, the simulated Solar System, the camera rig, flights and UI together.
import * as THREE from 'three';
import { SolarSystem } from './bodies.js';
import { Sky } from './sky.js';
import { CameraRig } from './controls.js';
import { Travel, arrivalDistance, setViewScale } from './travel.js';
import { TextureStore } from './textures.js';
import { UI } from './ui.js';
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

const app = {
  state, system, sky, travel, rig, camPos,

  systemBody() {
    const b = travel.active ? travel.target : state.focus;
    if (!b) return null;
    if (b.kind === 'moon') return b.parent;
    if (b.kind === 'star') return null;
    return b;
  },

  setDestination(id, opts = {}) {
    if (travel.active) return;
    const b = system.byId[id];
    if (!b) return;
    state.destination = b;
    ui.syncSelects();
    ui.showInfo(b, b === state.focus ? 'Current location' : 'Destination');
    ui.refreshTrip(true);
    if (!opts.fromSelect && b !== state.focus) {
      ui.toast(`Destination set: <b>${b.name}</b>. Press Engage to fly there.`, 2600);
    }
  },

  tripDistance(b) {
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
    for (const b of system.bodies) {
      const s = b.pos.distanceTo(camPos) / Math.max(b.radius, 1) / (b.kind === 'moon' ? 1 : 3);
      if (s < bestScore) { bestScore = s; best = b; }
    }
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
    const b = system.byId[id];
    if (!b || travel.active) return;
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
ui.ensureBodyLabels(system.bodies);
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
  const vis = body.kind === 'star' ? 1 : system.sunVisibility(body.pos);
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
  for (const b of system.bodies) {
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
  return best;
}

rig.onTap = (x, y) => {
  const b = pick(x, y);
  if (b) {
    if (b === state.focus) ui.showInfo(b, 'Current location');
    else app.setDestination(b.id);
  }
};
rig.onDoubleTap = (x, y) => {
  const b = pick(x, y);
  if (b && b !== state.focus) { app.setDestination(b.id); app.engage(); } else rig.resetLook();
};

window.addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input, select, textarea')) return;
  if (e.key === 'Escape') {
    if (!document.getElementById('help').hidden) ui.showHelp(false);
    else app.abort();
  } else if (e.key === ' ') {
    e.preventDefault();
    app.setTimeRate(state.timeRate.rate === 0 ? state.lastRate.id : 'pause');
  } else if (e.key === 'r' || e.key === 'R') rig.resetLook();
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

// ---------------------------------------------------------------- loading
manager.onProgress = (url, loaded, total) => ui.setLoader(loaded / Math.max(total, 1));
const jobs = [...system.initialTextureJobs(), sky.loadMilkyWay()];
Promise.allSettled(jobs).then((results) => {
  const failed = results.filter((r) => r.status === 'rejected').length;
  ui.hideLoader();
  if (failed) ui.toast(`${failed} map${failed > 1 ? 's' : ''} failed to load; those worlds use generated surfaces.`, 5000);
  else ui.toast('Pick a destination and speed below, then press <b>Engage</b>.', 4500);
  sky.upgradeMilkyWay().catch(() => {});
  system.upgradeTextures(state.focus);
});

// ---------------------------------------------------------------- frame loop
let last = performance.now();
const tmpDir = new THREE.Vector3();
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
  system.updateRender(camPos, camera, viewport, travel.active ? travel.target : state.focus, app.systemBody());

  const earth = system.byId.earth;
  if (earth.surface.uniforms.uCloudShift) {
    const shift = ((state.simMs / 86400000) * 0.004) % 1;
    earth.surface.uniforms.uCloudShift.value = shift;
    earth.clouds.material.uniforms.uShift.value = shift;
  }

  for (const b of [state.focus, travel.active ? travel.target : state.destination]) {
    if (b && b.screen.r > 260) system.upgradeTextures(b);
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
  renderer.render(sky.scene, sky.camera);
  renderer.clearDepth();
  renderer.render(scene, camera);
  if (streaks.visible) renderer.render(fxScene, camera);

  ui.updateLabels(viewport);
  ui.updateZoom();
  ui.refreshLive(false);
  ui.refreshTrip(false);
  ui.updateClock(state.simMs);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Exposed for debugging from the console.
window.solarVoyager = app;
