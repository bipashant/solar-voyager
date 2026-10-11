// Camera rig: orbit around the focused body (drag), altitude-based zoom (wheel / pinch),
// free look (right-drag or Shift-drag) and tap / double-tap picking.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _v = new THREE.Vector3();
const MAX_ALT = 3e10; // km above the focused body

export class CameraRig {
  constructor(dom) {
    this.dom = dom;
    this.focus = null;
    this.yaw = 0.6; this.pitch = 0.25; this.logAlt = Math.log(20000);
    this.tYaw = this.yaw; this.tPitch = this.pitch; this.tLogAlt = this.logAlt;
    this.lookYaw = 0; this.lookPitch = 0; this.tLookYaw = 0; this.tLookPitch = 0;
    this.enabled = true;
    this.zoomHold = 0; // +1 zooming in, -1 zooming out (held buttons)
    this.onTap = null;
    this.onDoubleTap = null;
    this.onInteract = null;
    this.pointers = new Map();
    this.keys = new Set();
    this.bind();
  }

  bind() {
    const el = this.dom;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), look: e.button === 2 || e.shiftKey });
      if (this.pointers.size === 2) this.pinch = this.pinchDistance();
    });
    el.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (!this.enabled) return;
      if (this.pointers.size === 2) {
        const d = this.pinchDistance();
        if (this.pinch) this.tLogAlt -= Math.log(d / this.pinch) * 1.6;
        this.pinch = d;
        this.clampAlt();
        this.onInteract?.();
        return;
      }
      if (p.look) {
        this.tLookYaw = THREE.MathUtils.clamp(this.tLookYaw + dx * 0.0035, -2.6, 2.6);
        this.tLookPitch = THREE.MathUtils.clamp(this.tLookPitch + dy * 0.0035, -1.3, 1.3);
      } else {
        const k = 0.0055 * this.rotateScale();
        this.tYaw -= dx * k;
        this.tPitch = THREE.MathUtils.clamp(this.tPitch + dy * k, -1.55, 1.55);
      }
      this.onInteract?.();
    });
    const end = (e) => {
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (!p) return;
      const moved = Math.hypot(e.clientX - p.sx, e.clientY - p.sy);
      if (moved < 6 && performance.now() - p.t < 450 && e.type === 'pointerup') {
        const now = performance.now();
        if (this.lastTap && now - this.lastTap.t < 320 && Math.hypot(e.clientX - this.lastTap.x, e.clientY - this.lastTap.y) < 20) {
          this.onDoubleTap?.(e.clientX, e.clientY);
          this.lastTap = null;
        } else {
          this.lastTap = { t: now, x: e.clientX, y: e.clientY };
          this.onTap?.(e.clientX, e.clientY);
        }
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (!this.enabled) return;
      const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
      this.tLogAlt += THREE.MathUtils.clamp(e.deltaY * unit, -400, 400) * 0.0016;
      this.clampAlt();
      this.onInteract?.();
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('input, select, textarea')) return;
      this.keys.add(e.key);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key));
    window.addEventListener('blur', () => this.keys.clear());
  }

  pinchDistance() {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  // Slow the orbit rate down when hugging a surface.
  rotateScale() {
    if (!this.focus) return 1;
    const alt = Math.exp(this.tLogAlt);
    return THREE.MathUtils.clamp((alt / this.focus.maxRadius) * 1.2 + 0.015, 0.015, 1);
  }

  minAlt() { return this.focus ? Math.max(this.focus.maxRadius * 0.0006, 0.03) : 1; }
  clampAlt() {
    this.tLogAlt = THREE.MathUtils.clamp(this.tLogAlt, Math.log(this.minAlt()), Math.log(MAX_ALT));
  }

  // On-screen zoom control: one step is a factor of about 1.6 in altitude.
  zoomStep(dir) {
    if (!this.enabled) return;
    this.tLogAlt -= dir * 0.48;
    this.clampAlt();
    this.onInteract?.();
  }

  // 0 = farthest out, 1 = skimming the surface (log scale).
  zoomFraction() {
    const lo = Math.log(this.minAlt()), hi = Math.log(MAX_ALT);
    return THREE.MathUtils.clamp((hi - this.tLogAlt) / (hi - lo), 0, 1);
  }

  setZoomFraction(f) {
    if (!this.enabled) return;
    const lo = Math.log(this.minAlt()), hi = Math.log(MAX_ALT);
    this.tLogAlt = hi - THREE.MathUtils.clamp(f, 0, 1) * (hi - lo);
    this.clampAlt();
    this.onInteract?.();
  }

  altitude() { return Math.exp(this.logAlt); }

  distance() { return (this.focus ? this.focus.maxRadius : 0) + Math.exp(this.logAlt); }

  // Adopt the camera position reached by a flight (or any external move) without a jump.
  syncFrom(body, camPos, camQuat) {
    this.focus = body;
    _v.copy(camPos).sub(body.pos);
    const dist = _v.length();
    this.yaw = this.tYaw = Math.atan2(_v.x, _v.z);
    this.pitch = this.tPitch = Math.asin(THREE.MathUtils.clamp(_v.y / dist, -1, 1));
    this.logAlt = this.tLogAlt = Math.log(Math.max(dist - body.maxRadius, this.minAlt()));
    this.lookYaw = this.tLookYaw = 0;
    this.lookPitch = this.tLookPitch = 0;
  }

  // Swing the camera so it sits above a world-space direction from the focus centre.
  lookAtDirection(dir, alt) {
    let yaw = Math.atan2(dir.x, dir.z);
    while (yaw - this.tYaw > Math.PI) yaw -= Math.PI * 2;
    while (yaw - this.tYaw < -Math.PI) yaw += Math.PI * 2;
    this.tYaw = yaw;
    this.tPitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)), -1.55, 1.55);
    if (alt !== undefined) this.tLogAlt = Math.log(Math.max(alt, this.minAlt()));
    this.tLookYaw = 0; this.tLookPitch = 0;
  }

  resetLook() { this.tLookYaw = 0; this.tLookPitch = 0; }

  update(dt, outPos, outQuat) {
    if (this.enabled) {
      const k = this.keys;
      const rs = this.rotateScale() * 1.6 * dt;
      if (k.has('ArrowLeft') || k.has('a')) this.tYaw -= rs;
      if (k.has('ArrowRight') || k.has('d')) this.tYaw += rs;
      if (k.has('ArrowUp')) this.tPitch = Math.min(1.55, this.tPitch + rs);
      if (k.has('ArrowDown')) this.tPitch = Math.max(-1.55, this.tPitch - rs);
      if (k.has('w') || k.has('+') || k.has('=')) { this.tLogAlt -= 1.4 * dt; this.clampAlt(); }
      if (k.has('s') || k.has('-') || k.has('_')) { this.tLogAlt += 1.4 * dt; this.clampAlt(); }
      if (this.zoomHold) { this.tLogAlt -= this.zoomHold * 1.6 * dt; this.clampAlt(); }
    }
    const a = 1 - Math.exp(-dt * 9);
    this.yaw += (this.tYaw - this.yaw) * a;
    this.pitch += (this.tPitch - this.pitch) * a;
    this.logAlt += (this.tLogAlt - this.logAlt) * (1 - Math.exp(-dt * 7));
    this.lookYaw += (this.tLookYaw - this.lookYaw) * a;
    this.lookPitch += (this.tLookPitch - this.lookPitch) * a;

    const f = this.focus.pos;
    const dist = this.distance();
    const cp = Math.cos(this.pitch);
    outPos.set(f.x + dist * cp * Math.sin(this.yaw), f.y + dist * Math.sin(this.pitch), f.z + dist * cp * Math.cos(this.yaw));
    lookQuaternion(outPos, f, outQuat);
    _e.set(this.lookPitch, this.lookYaw, 0, 'YXZ');
    _q.setFromEuler(_e);
    outQuat.multiply(_q);
  }
}

// Quaternion that points a camera at `target` from `eye`, keeping ecliptic north up.
export function lookQuaternion(eye, target, out) {
  _v.copy(eye).sub(target);
  // Work with a unit offset to stay precise at planetary distances.
  _m.lookAt(_v.normalize(), new THREE.Vector3(0, 0, 0), Math.abs(_v.y) > 0.9999 ? new THREE.Vector3(0, 0, -1) : UP);
  return out.setFromRotationMatrix(_m);
}
