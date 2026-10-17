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
import { Guide } from './guide.js';
import { Sheet } from './sheet.js';
import { Ambience } from './audio.js';
import { ViewLink } from './viewlink.js';
import { EventBar } from './eventbar.js';
import { Embed } from './embed.js';
import { SPEEDS, TRAVEL_MODES, TIME_RATES } from './data.js';
import { jdFromMs, DEG } from './ephemeris.js';
import { fmtDuration } from './format.js';
import * as S from './shaders.js';
import { haptic, onResume, appReady, isMobile, isCompact, embedded } from './platform.js';

const canvas = document.getElementById('view');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
} catch (err) {
  document.getElementById('loader-text').textContent = 'This browser could not start WebGL 2, which the 3D view needs. Try a recent Chrome, Edge, Firefox or Safari.';
  throw err;
}
// Resolution: up to 2× the CSS pixels, lowered while frames run slow (see adaptResolution).
const MAX_PR = Math.min(window.devicePixelRatio, 2);
const MIN_PR = Math.min(MAX_PR, isMobile ? 1.25 : 1);
let pixelRatio = MAX_PR;
let viewShift = 0, viewShiftX = 0; // px the picture is slid up (or right) to clear the phone's sheet
renderer.setPixelRatio(pixelRatio);
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

const audio = new Ambience({ muted: embedded }); // a lesson page full of views shouldn't all play music

const app = {
  audio, state, system, sky, spacetime, travel, rig, camPos, deepSky: deep,
  solarVisible: true,

  // A body of the Solar System or a deep-sky object, by id.
  lookup(id) { return system.byId[id] || deep.byId[id]; },

  jd() { return jdFromMs(state.simMs); },

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
      ui.toast(`Destination set: <b>${b.name}</b>. Press Engage, or double-click it, to fly there.`, 3000);
    }
  },

  // Tapping a world or its label: on phones the sheet header shows it (with Fly) and tucks down.
  pickDestination(id) {
    const phone = !!app.sheet?.mounted;
    app.setDestination(id, { fromSelect: phone });
    if (phone && app.sheet.detent !== 'peek') app.sheet.snap('peek');
  },

  // Zoom 0: the whole Solar System with every planet in view, from wherever you are.
  showSolarSystem() {
    if (travel.active) return;
    const sun = system.byId.sun;
    const frame = () => {
      // ~35 AU reaches Neptune; high above the ecliptic so the orbits open out as ellipses
      const half = Math.tan(Math.min(camera.fov * DEG / 2, Math.atan(Math.tan(camera.fov * DEG / 2) * camera.aspect)));
      rig.tLogAlt = Math.log(Math.min(3e10, (35 * 149597870.7) / half));
      rig.tPitch = 1.05;
      rig.tLookYaw = 0; rig.tLookPitch = 0;
    };
    if (state.focus === sun) { frame(); return; }
    haptic('engage');
    ui.toast('Back out to the <b>Solar System</b>…', 3200);
    pendingOverview = frame;
    state.destination = sun;
    ui.syncSelects();
    app.engage();
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
    haptic('engage');
    audio.engage();
    app.sheet?.snap('peek'); // phones: get the sheet out of the way of the flight
    if (isCompact()) document.getElementById('info').classList.add('collapsed');
    ui.showFlight(true, target);
    ui.refreshTrip(true);
    ui.buildFeatureLabels();
  },

  abort() {
    if (!travel.active) return;
    travel.abort();
    haptic('abort');
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
    return { x: (v.x / -v.z) * k + (vp.cx ?? vp.x / 2), y: (-v.y / -v.z) * k + (vp.cy ?? vp.y / 2) };
  },
};

const ui = new UI(app);
app.ui = ui;
ui.ensureBodyLabels(system.bodies);
ui.ensureDeepLabels(deep.objects);
ui.syncSelects();

let pendingOverview = null; // set while flying back to the Sun to open out to the whole Solar System
function arrive(body, aborted = false, quiet = false) {
  state.focus = body;
  app.sheet?.snap('peek');
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
  if (pendingOverview) {
    const f = pendingOverview;
    pendingOverview = null;
    if (body.id === 'sun' && !aborted) { f(); return; } // the camera then eases out to the full view
  }
  if (quiet) { if (shade) ui.toast(shade.trim(), 6000); return; }
  if (!aborted) {
    haptic('arrive');
    audio.arrive();
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

rig.onZoomOutLimit = () => { if (rig.enabled && !travel.active && state.focus.deep) app.showSolarSystem(); };
rig.onTap = (x, y) => {
  const b = pick(x, y);
  if (b) {
    if (b === state.focus) ui.showInfo(b, 'Current location');
    else app.pickDestination(b.id);
  } else if (isCompact()) {
    ui.closePeeks(); // on a phone, tapping empty space puts the panels away again
  }
  // phones: a tap on the view tucks the sheet down so you can see (and fly to) what you picked
  if (app.sheet?.mounted && app.sheet.detent !== 'peek') app.sheet.snap('peek');
};
rig.onDoubleTap = (x, y) => {
  const b = pick(x, y);
  if (b && b !== state.focus) { app.setDestination(b.id); app.engage(); } else rig.resetLook();
};

window.addEventListener('keydown', (e) => {
  if (poster.isOpen) { if (e.key === 'Escape') poster.close(); return; }
  if (guide.active && e.key === 'Escape') { guide.stop(); return; }
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
  else if (e.key === 'm' || e.key === 'M') ui.setToggle('sound', !ui.toggles.sound);
  else if (e.key === 'b' || e.key === 'B') ui.setToggle('deepsky', !ui.toggles.deepsky);
  else if (e.key === 'n' || e.key === 'N') ui.setToggle('dso', !ui.toggles.dso);
  // clear view and the poster studio belong to the full app, not to a lesson's figure
  else if ((e.key === 'h' || e.key === 'H') && !embedded) ui.setChromeHidden(!ui.uiHidden);
  else if ((e.key === 'p' || e.key === 'P') && !embedded) poster.open();
  else if (e.key === 'Enter' && e.target === document.body) app.engage();
});

// ---------------------------------------------------------------- sizing
// A lesson can narrow the field of view like a telescope (embed.js); it eases there in the frame loop.
let fovTarget = null;
const baseFov = () => (window.innerWidth < 720 ? 62 : 50);
app.setFov = (deg, snap = false) => {
  fovTarget = deg > 0 ? deg : null;
  if (snap) { camera.fov = fovTarget ?? baseFov(); camera.updateProjectionMatrix(); }
};
function easeFov(dt) {
  const want = fovTarget ?? baseFov();
  if (Math.abs(camera.fov - want) < 1e-4) return;
  const k = 1 - Math.exp(-dt * 2.6);
  camera.fov = Math.abs(camera.fov - want) < 0.002 ? want : Math.exp(Math.log(camera.fov) + (Math.log(want) - Math.log(camera.fov)) * k);
  camera.updateProjectionMatrix();
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h, false);
  // point sprites are sized in rendered pixels, so they follow the resolution
  sky.starMat.uniforms.uScale.value = pixelRatio;
  system.markers.material.uniforms.uDpr.value = pixelRatio;
  camera.aspect = w / h;
  camera.fov = fovTarget ?? baseFov();
  camera.updateProjectionMatrix();
  viewport.set(w, h);
  viewport.cy = h / 2 - viewShift;
  viewport.cx = w / 2 + viewShiftX;
  const halfV = (camera.fov * DEG) / 2;
  const halfH = Math.atan(Math.tan(halfV) * camera.aspect);
  setViewScale(Math.max(1, Math.tan(25 * DEG) / Math.tan(Math.min(halfV, halfH))));
}
window.addEventListener('resize', resize);
resize();

// Phones: as the bottom sheet rises, slide the picture up so the world you're looking at stays centred in
// the space above it (as maps apps do). Applied to every camera, and to the screen-position maths via cy.
function applyViewShift() {
  const c = sheet.cover();
  const ty = Math.min(c.bottom / 2, window.innerHeight * 0.28);
  const tx = Math.min(c.left / 2, window.innerWidth * 0.28);
  if (Math.abs(ty - viewShift) < 0.5 && Math.abs(tx - viewShiftX) < 0.5) return;
  viewShift = ty; viewShiftX = tx;
  const w = window.innerWidth, h = window.innerHeight;
  viewport.cy = h / 2 - viewShift;
  viewport.cx = w / 2 + viewShiftX;
  document.documentElement.style.setProperty('--view-shift', `${viewShift.toFixed(1)}px`);
  document.documentElement.style.setProperty('--view-shift-x', `${viewShiftX.toFixed(1)}px`);
  for (const cam of [camera, sky.camera, deep.camera]) {
    if (viewShift > 0.5 || viewShiftX > 0.5) cam.setViewOffset(w, h, -viewShiftX, viewShift, w, h); else cam.clearViewOffset();
  }
}

// Adaptive resolution: if frames take longer than ~22 ms (under 45 fps) for a couple of seconds, render
// fewer pixels; when there is headroom again, step back up. Keeps phones smooth and cool.
const perf = { ms: 16, t: 0, fast: 0 };
function adaptResolution(rawDt) {
  if (rawDt > 0.25) return; // ignore the gap after the app or tab was in the background
  perf.ms += (rawDt * 1000 - perf.ms) * 0.06;
  perf.t += rawDt;
  if (perf.t < 2) return;
  perf.t = 0;
  let next = pixelRatio;
  if (perf.ms > 22 && pixelRatio > MIN_PR) { next = Math.max(MIN_PR, pixelRatio - 0.25); perf.fast = 0; }
  else if (perf.ms < 15) { if (++perf.fast >= 3 && pixelRatio < MAX_PR) { next = Math.min(MAX_PR, pixelRatio + 0.25); perf.fast = 0; } }
  else perf.fast = 0;
  if (next !== pixelRatio) { pixelRatio = next; resize(); }
}

// In real-time mode the clock keeps up while the app is in the background.
onResume((awayMs) => { if (state.timeRate.rate === 1) state.simMs += awayMs; });

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
      if (b.kind !== 'star') {
        const toSun = system.byId.sun.pos.clone().sub(b.pos).normalize();
        // thumbnails look from the Sun's side, so the whole disc is lit; posters lean sunward from above
        if (req.lit) dir.copy(toSun).add(new THREE.Vector3(0, 0.12, 0)); else dir.add(toSun.setY(0).normalize().multiplyScalar(0.5));
      }
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
const sheet = new Sheet(app);
app.sheet = sheet;
ui.syncDock();
const guide = new Guide(app);
app.startTour = () => guide.start();
app.guide = guide;

// ---------------------------------------------------------------- shareable views in the address bar
// Points of view for event links and lessons (see viewlink.js, embed.js), computed from where everything is
// at that moment: the direction from the body's centre to the camera, and the height above it.
//   from:<id>  near <id>, looking back at the body     behind:<id>  past the body, with <id> behind it
//   side:<id>  side-on to the line between them        top          above the ecliptic
//   over:<lat>,<lon>  above a place on the body's surface (it turns with the body)
//   site:<id>,<lat>,<lon>  standing at a place on another world, looking up at the body (an eclipse from Dallas)
// turn (degrees about ecliptic north) and tilt (degrees towards it) swing the camera from there.
const UP = new THREE.Vector3(0, 1, 0);
function povTarget(body, p) {
  const [kind, arg] = p.pov.split(':');
  const other = arg && app.lookup(arg);
  const R = body.coreRadius ?? body.maxRadius;
  const dir = new THREE.Vector3();
  let alt = p.alt > 0 ? p.alt : null;
  if ((kind === 'from' || kind === 'behind' || kind === 'side') && !other) return null;
  if (kind === 'from') {
    // near the other body, looking back at this one (e.g. Jupiter as seen from Earth)
    dir.copy(other.pos).sub(body.pos);
    const d = dir.length();
    dir.normalize();
    alt ??= Math.max(R * 2, d - R - other.maxRadius * 6);
  } else if (kind === 'behind') {
    dir.copy(body.pos).sub(other.pos).normalize(); // the other body sits behind this one
    // a moon seen from its planet's distance: where you'd stand in the path of an eclipse
    alt ??= body.parent ? body.pos.distanceTo(body.parent.pos) - body.parent.radius - R : arrivalDistance(body) - R;
  } else if (kind === 'side') {
    const line = other.pos.clone().sub(body.pos).normalize();
    dir.crossVectors(line, UP).normalize().addScaledVector(UP, p.lift ?? 0.25).normalize();
    alt ??= other.pos.distanceTo(body.pos) * 0.8;
  } else if (kind === 'top') {
    dir.set(0, 1, 0).addScaledVector(new THREE.Vector3(0, 0, 1), 0.08).normalize(); // a hair off vertical
    alt ??= arrivalDistance(body) - R;
  } else if (kind === 'site') {
    const [id, lat, lon] = (arg || '').split(',');
    const world = app.lookup(id);
    if (!world || world.deep || !Number.isFinite(+lat) || !Number.isFinite(+lon)) return null;
    const spot = system.surfacePoint(world, +lat, +lon, new THREE.Vector3());
    spot.addScaledVector(spot.clone().sub(world.pos).normalize(), 2); // eye height: a hilltop, clear of the ground
    dir.copy(spot).sub(body.pos);
    alt = dir.length() - R;
    dir.normalize();
  } else if (kind === 'over') {
    const [lat, lon] = (arg || '').split(',').map(Number);
    if (body.deep || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    system.surfacePoint(body, lat, lon, dir).sub(body.pos).normalize();
    alt ??= arrivalDistance(body) - R;
  } else return null;
  if (p.turn) dir.applyAxisAngle(UP, p.turn * DEG);
  if (p.tilt) {
    const side = new THREE.Vector3().crossVectors(UP, dir);
    if (side.lengthSq() > 1e-8) dir.applyAxisAngle(side.normalize(), -p.tilt * DEG);
  }
  return { dir, alt };
}

// Ease the camera round to a view of the world it's already orbiting (a pov, or yaw / pitch / alt).
function aimView(body, p) {
  if (p.pov) {
    const t = povTarget(body, p);
    if (t) rig.lookAtDirection(t.dir, t.alt);
  } else {
    if (p.yaw != null) {
      let yaw = p.yaw * DEG;
      while (yaw - rig.tYaw > Math.PI) yaw -= Math.PI * 2;
      while (yaw - rig.tYaw < -Math.PI) yaw += Math.PI * 2;
      rig.tYaw = yaw;
    }
    if (p.pitch != null) rig.tPitch = THREE.MathUtils.clamp(p.pitch * DEG, -1.55, 1.55);
    if (p.alt > 0) rig.tLogAlt = Math.log(p.alt);
  }
  rig.clampAlt();
}

// Put the camera straight there, orbiting `body`.
function placeCamera(body, p) {
  system.update(jdFromMs(state.simMs));
  if (body.deep) deep.build(body);
  if (travel.active) travel.abort();
  state.focus = body;
  rig.enabled = true;
  ui.showFlight(false);
  const alt = p.alt > 0 ? p.alt : arrivalDistance(body) - (body.coreRadius ?? body.maxRadius);
  camPos.copy(body.pos).add(new THREE.Vector3(0, 0, alt + body.maxRadius));
  rig.syncFrom(body, camPos, camQuat);
  if (p.yaw != null) rig.yaw = rig.tYaw = p.yaw * DEG;
  if (p.pitch != null) rig.pitch = rig.tPitch = THREE.MathUtils.clamp(p.pitch * DEG, -1.55, 1.55);
  rig.tLogAlt = Math.log(alt);
  rig.clampAlt();
  rig.logAlt = rig.tLogAlt;
  if (p.look) { rig.lookYaw = rig.tLookYaw = p.look[0] * DEG; rig.lookPitch = rig.tLookPitch = p.look[1] * DEG; }
  if (p.pov) {
    aimView(body, p);
    rig.yaw = rig.tYaw; rig.pitch = rig.tPitch; rig.logAlt = rig.tLogAlt;
    rig.lookYaw = rig.tLookYaw = 0; rig.lookPitch = rig.tLookPitch = 0;
  }
  rig.update(0, camPos, camQuat);
  app.sheet?.snap('peek');
}

let pendingCapture = null; // read the canvas right after a frame is drawn (WebGL clears it afterwards)
const viewLink = new ViewLink(app, {
  applyCamera: placeCamera,
  capture(cb) { pendingCapture = cb; },
});
app.viewLink = viewLink;
const eventBar = new EventBar(app);
viewLink.onApply = (p) => { if (p.ev) { if (eventBar.event?.id !== p.ev || eventBar.v !== p.v) eventBar.show(p.ev, p.v); } };
const sharedView = viewLink.parse(location.hash);
if (sharedView && !viewLink.apply(sharedView)) history.replaceState(null, '', location.pathname + location.search);

// Embedded in a lesson page: only the controls it asks for, scripted by the page (see embed.js).
const embed = embedded ? new Embed(app, {
  place: placeCamera,
  aim: aimView,
  project: (p) => app.projectWorld(p, viewport),
}) : null;
app.embed = embed;

// ---------------------------------------------------------------- loading
manager.onProgress = (url, loaded, total) => ui.setLoader(loaded / Math.max(total, 1));
const jobs = [...system.initialTextureJobs(), sky.loadMilkyWay()];
Promise.allSettled(jobs).then((results) => {
  const failed = results.filter((r) => r.status === 'rejected').length;
  ui.hideLoader();
  ui.loaded = true;
  if (embed) { embed.ready(); return; }
  if (failed) ui.toast(`${failed} map${failed > 1 ? 's' : ''} failed to load; those worlds use generated surfaces.`, 5000);
  else if (sharedView?.ev) { /* the event bar says what this is */ }
  else if (sharedView) ui.toast(`Shared view: <b>${state.focus.name}</b>${sharedView.time ? ` on ${new Date(state.simMs).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}.`, 4000);
  else if (!guide.maybeStart()) ui.toast(ui.toggles.console
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
app.thumbs = {};
app.thumbVersion = 0;
const thumbQueue = [];
let thumbsQueued = false;
function makeThumbs(jd) {
  if (!thumbsQueued && ui.loaded && sheet.mounted) { thumbsQueued = true; thumbQueue.push(...system.bodies.map((b) => b.id)); }
  if (!thumbQueue.length || travel.active) return;
  const batch = thumbQueue.splice(0, 8).map((id) => ({ id, px: 128, lit: true }));
  try {
    const out = app.snapshot(jd, batch);
    for (const r of batch) if (out[r.id]) app.thumbs[r.id] = out[r.id].canvas.toDataURL('image/png');
  } catch (err) { console.warn('thumbnails', err); thumbQueue.length = 0; }
  if (!thumbQueue.length || batch.length) app.thumbVersion++;
}

function frame(now) {
  if (app.sleeping) { last = now; requestAnimationFrame(frame); return; } // an embedded view scrolled out of sight
  adaptResolution((now - last) / 1000);
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  state.simMs += dt * 1000 * state.timeRate.rate;
  const jd = jdFromMs(state.simMs);
  makeThumbs(jd);
  audio.update(travel.active ? travel.streak : 0, travel.active ? travel.target : state.focus);
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

  applyViewShift();
  easeFov(dt);
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
  // (an embedded view only bothers if it shows them)
  if (ui.loaded && (!embed || ui.toggles.dso)) deep.start();
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
  if (pendingCapture) { const cb = pendingCapture; pendingCapture = null; try { cb(canvas); } catch (err) { console.warn(err); cb(null); } }
  viewLink.tick(now);
  embed?.tick(now);

  ui.updateLabels(viewport);
  ui.updateZoom();
  ui.updateDock(false);
  sheet.update();
  ui.refreshLive(false);
  ui.refreshTrip(false);
  ui.updateClock(state.simMs);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
appReady(); // the loader is on screen: let the native launch screen go

// Exposed for debugging from the console.
window.solarVoyager = app;
