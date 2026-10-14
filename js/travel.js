// Flights between bodies, either time-compressed ("cinematic") or at the real speed times a multiplier.
import * as THREE from 'three';
import { lookQuaternion } from './controls.js';

const _look = new THREE.Quaternion();
const _end = new THREE.Vector3();
const _dir = new THREE.Vector3();

// Exponential distance profile: leaves the origin and approaches the target on a log scale,
// so a flight from Earth orbit to Neptune still shows both planets receding and growing.
function logProfile(lam, A, B) {
  if (lam <= 0.5) {
    const K = 0.5 / A;
    if (K <= 1.05) return lam;
    return (0.5 * (Math.pow(K, 2 * lam) - 1)) / (K - 1);
  }
  const K = 0.5 / B;
  if (K <= 1.05) return lam;
  return 1 - (0.5 * (Math.pow(K, 2 * (1 - lam)) - 1)) / (K - 1);
}

// Portrait screens are narrow, so park further away to keep the whole body in view.
let viewScale = 1;
export function setViewScale(k) { viewScale = k; }

export function arrivalDistance(body) {
  const d = body.data;
  const base = body.maxRadius * (d.view || (body.kind === 'moon' ? 3.4 : 3.2)) * viewScale;
  return body.ringOuter && body.data.rings === 'saturn' ? Math.max(base, body.ringOuter * 2.4 * viewScale) : base;
}

export class Travel {
  constructor() {
    this.active = false;
  }

  start({ fromPos, fromQuat, origin, target, sun, speed, warp }) {
    this.active = true;
    this.target = target;
    this.speed = speed; // km/s
    this.warp = warp; // 0 = cinematic
    this.startPos = fromPos.clone();
    this.startQuat = fromQuat.clone();
    this.arriveDist = arrivalDistance(target);

    if (target.approach) {
      // galaxies and nebulae choose their own best viewpoint
      this.offsetDir = target.approach(fromPos);
    } else {
      // Approach from the sunlit side, a little above the orbital plane.
      const toStart = fromPos.clone().sub(target.pos).normalize();
      const toSun = target === sun ? toStart.clone() : sun.pos.clone().sub(target.pos).normalize();
      const dir = toStart.multiplyScalar(0.45).addScaledVector(toSun, 0.8).add(new THREE.Vector3(0, 0.22, 0));
      if (target.rings && target.data.rings === 'saturn') {
        dir.addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(target.quat), 0.35);
      }
      this.offsetDir = dir.normalize();
    }

    _end.copy(target.pos).addScaledVector(this.offsetDir, this.arriveDist);
    this.D0 = _end.distanceTo(this.startPos);
    this.realDuration = this.D0 / speed;
    const departScale = origin ? Math.max(this.startPos.distanceTo(origin.pos) - origin.radius * 0.6, origin.radius * 0.4) : this.D0 * 0.002;
    this.A = THREE.MathUtils.clamp(departScale / this.D0, 1e-18, 0.5);
    this.B = THREE.MathUtils.clamp(this.arriveDist / this.D0, 1e-18, 0.5);
    this.animDuration = warp === 0
      ? THREE.MathUtils.clamp(2.6 + 1.15 * Math.log10(Math.max(this.D0, 1000) / 1000), 3.5, 13)
      : this.realDuration / warp;
    this.elapsed = 0;
    this.traveled = 0;
    this.progress = 0;
    this.pos = this.startPos.clone();
    this.quat = this.startQuat.clone();
    this.streak = 0;
    this.travelDir = _end.clone().sub(this.startPos).normalize();
  }

  abort() { this.active = false; }

  update(dt) {
    this.elapsed += dt;
    _end.copy(this.target.pos).addScaledVector(this.offsetDir, this.arriveDist);
    const span = _dir.copy(_end).sub(this.startPos);
    const D = span.length();
    let f, done = false;
    if (this.warp === 0) {
      const s = Math.min(1, this.elapsed / this.animDuration);
      const lam = 0.5 - 0.5 * Math.cos(Math.PI * s);
      f = logProfile(lam, this.A, this.B);
      if (s >= 1) { f = 1; done = true; }
      this.traveled = f * this.D0;
      const sf = this.speed >= 299792 ? 1 : this.speed >= 2900 ? 0.45 : 0;
      this.streak = sf * Math.pow(Math.sin(Math.PI * s), 0.6);
    } else {
      this.traveled += this.speed * this.warp * dt;
      f = Math.min(1, this.traveled / Math.max(D, 1e-9));
      if (f >= 1) done = true;
      const v = this.speed * this.warp;
      this.streak = THREE.MathUtils.clamp(Math.log10(v / 2000) / 3, 0, 1) * THREE.MathUtils.smoothstep(this.elapsed, 0, 1.5);
    }
    this.progress = f;
    this.pos.copy(this.startPos).addScaledVector(span, f);
    this.travelDir.copy(span).normalize();

    lookQuaternion(this.pos, this.target.pos, _look, this.target.up);
    const turn = this.warp === 0 ? Math.min(1.4, this.animDuration * 0.18) : 1.5;
    const k = THREE.MathUtils.smoothstep(this.elapsed, 0, turn);
    this.quat.copy(this.startQuat).slerp(_look, k);

    const remainingKm = Math.max(0, (1 - f) * D);
    this.remainingKm = remainingKm;
    this.shipElapsed = this.traveled / this.speed;
    this.shipRemaining = remainingKm / this.speed;
    if (done) this.active = false;
    return done;
  }
}
