// Astronomy helpers: time, planetary positions, body orientation and frame conversions.
//
// Scene frame: 1 unit = 1 km, origin at the Sun.
//   scene.x = ecliptic x (towards the March equinox)
//   scene.y = ecliptic north
//   scene.z = -ecliptic y
import * as THREE from 'three';

export const AU_KM = 149597870.7;
export const C_KMS = 299792.458;
export const DEG = Math.PI / 180;

const EPS = 23.4392911 * DEG; // obliquity of the ecliptic (J2000)
const cosE = Math.cos(EPS);
const sinE = Math.sin(EPS);

export const jdFromMs = (ms) => ms / 86400000 + 2440587.5;
export const daysSinceJ2000 = (jd) => jd - 2451545.0;

// JPL "Keplerian Elements for Approximate Positions of the Major Planets" (valid 1800–2050).
// [a (AU), e, I (deg), L (deg), longitude of perihelion (deg), longitude of ascending node (deg)]
// followed by the rates per Julian century.
const PLANET_ELEMENTS = {
  mercury: [[0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593],
    [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
  venus: [[0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255],
    [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418]],
  earth: [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
    [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0]],
  mars: [[1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
  jupiter: [[5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
  saturn: [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
  uranus: [[19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503],
    [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]],
  neptune: [[30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
    [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]],
  pluto: [[39.48211675, 0.24882730, 17.14001206, 238.92903833, 224.06891629, 110.30393684],
    [-0.00031596, 0.00005170, 0.00004818, 145.20780515, -0.04062942, -0.01183482]],
};

export function solveKepler(M, e) {
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 30; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  return E;
}

function elementsAt(id, jd) {
  const [el, rt] = PLANET_ELEMENTS[id];
  const T = (jd - 2451545.0) / 36525;
  const a = el[0] + rt[0] * T;
  const e = el[1] + rt[1] * T;
  const I = (el[2] + rt[2] * T) * DEG;
  const L = el[3] + rt[3] * T;
  const wbar = el[4] + rt[4] * T;
  const node = el[5] + rt[5] * T;
  let M = (L - wbar) * DEG;
  M = Math.atan2(Math.sin(M), Math.cos(M));
  return { a, e, I, w: (wbar - node) * DEG, O: node * DEG, M };
}

function orbitToScene(el, E, out) {
  const { a, e, I, w, O } = el;
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O);
  const cI = Math.cos(I), sI = Math.sin(I);
  const x = (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp;
  const y = (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp;
  const z = (sw * sI) * xp + (cw * sI) * yp;
  return out.set(x * AU_KM, z * AU_KM, -y * AU_KM);
}

export const hasPlanetElements = (id) => id in PLANET_ELEMENTS;

// Heliocentric position (km, scene frame). For Earth this is the Earth–Moon barycentre.
export function planetPosition(id, jd, out) {
  const el = elementsAt(id, jd);
  return orbitToScene(el, solveKepler(el.M, el.e), out);
}

export function planetOrbitPoints(id, jd, segments = 720) {
  const el = elementsAt(id, jd);
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const E = (i / segments) * Math.PI * 2;
    pts.push(orbitToScene(el, E, new THREE.Vector3()));
  }
  return pts;
}

// Low-precision geocentric Moon position (about 0.3° accuracy), km in the scene frame.
export function moonGeocentric(jd, out) {
  const d = jd - 2451545.0;
  const L = 218.316 + 13.176396 * d;
  const M = (134.963 + 13.064993 * d) * DEG;
  const F = (93.272 + 13.229350 * d) * DEG;
  const D = (297.850 + 12.190749 * d) * DEG;
  const Ms = (357.529 + 0.98560028 * d) * DEG;
  const lon = (L + 6.289 * Math.sin(M) + 1.274 * Math.sin(2 * D - M) + 0.658 * Math.sin(2 * D)
    - 0.186 * Math.sin(Ms) - 0.114 * Math.sin(2 * F)) * DEG;
  const lat = (5.128 * Math.sin(F) + 0.281 * Math.sin(M + F) + 0.278 * Math.sin(M - F)) * DEG;
  const dist = 385001 - 20905 * Math.cos(M) - 3699 * Math.cos(2 * D - M) - 2956 * Math.cos(2 * D);
  const x = dist * Math.cos(lat) * Math.cos(lon);
  const y = dist * Math.cos(lat) * Math.sin(lon);
  const z = dist * Math.sin(lat);
  return out.set(x, z, -y);
}

// Equatorial (ICRF) vector → scene frame
export function equToScene(x, y, z, out) {
  const ey = y * cosE + z * sinE;
  const ez = -y * sinE + z * cosE;
  return out.set(x, ez, -ey);
}

export function raDecToScene(raDeg, decDeg, out = new THREE.Vector3()) {
  const a = raDeg * DEG, d = decDeg * DEG;
  return equToScene(Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d), out);
}

// Equatorial frame of a body from its IAU pole. Returns scene-frame unit vectors:
// pole (north), node (where the body's equator crosses the Earth's equator) and node×pole.
export function equatorFrame(poleRA, poleDec) {
  const a = poleRA * DEG, d = poleDec * DEG;
  const P = [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
  const Q = [-Math.sin(a), Math.cos(a), 0];
  const PxQ = [P[1] * Q[2] - P[2] * Q[1], P[2] * Q[0] - P[0] * Q[2], P[0] * Q[1] - P[1] * Q[0]];
  return {
    pole: equToScene(P[0], P[1], P[2], new THREE.Vector3()),
    node: equToScene(Q[0], Q[1], Q[2], new THREE.Vector3()),
    ahead: equToScene(PxQ[0], PxQ[1], PxQ[2], new THREE.Vector3()), // 90° east of the node along the equator
  };
}

const _m4 = new THREE.Matrix4();
const _M = new THREE.Vector3();
const _Z = new THREE.Vector3();

// Orientation of a body: local +Y = north pole, local +X = prime meridian (longitude 0),
// local −Z = longitude 90° E. W is the IAU prime-meridian angle in degrees.
export function bodyQuaternion(frame, Wdeg, out) {
  const W = Wdeg * DEG;
  _M.copy(frame.node).multiplyScalar(Math.cos(W)).addScaledVector(frame.ahead, Math.sin(W));
  _Z.crossVectors(_M, frame.pole); // M × P = −east
  _m4.makeBasis(_M, frame.pole, _Z);
  return out.setFromRotationMatrix(_m4);
}

// Orientation for a body tidally locked to `towards` (unit vector to the parent),
// with `normal` as its spin axis.
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
export function lockedQuaternion(towards, normal, out) {
  _y.copy(normal).normalize();
  _x.copy(towards).addScaledVector(_y, -towards.dot(_y)).normalize();
  _z.crossVectors(_x, _y);
  _m4.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m4);
}

// Matrix taking scene directions to galactic directions (for the Milky Way panorama).
export function sceneToGalacticMatrix() {
  const G = [
    [-0.0548755604, -0.8734370902, -0.4838350155],
    [0.4941094279, -0.4448296300, 0.7469822445],
    [-0.8676661490, -0.1980763734, 0.4559837762],
  ];
  const cols = [];
  for (const s of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
    // scene → ecliptic
    const ex = s[0], ey = -s[2], ez = s[1];
    // ecliptic → equatorial
    const qx = ex, qy = ey * cosE - ez * sinE, qz = ey * sinE + ez * cosE;
    cols.push(G.map((r) => r[0] * qx + r[1] * qy + r[2] * qz));
  }
  const m = new THREE.Matrix3();
  m.set(
    cols[0][0], cols[1][0], cols[2][0],
    cols[0][1], cols[1][1], cols[2][1],
    cols[0][2], cols[1][2], cols[2][2],
  );
  return m;
}

// Lat/lon on a body (deg) → local unit vector, matching the texture convention above.
export function latLonToLocal(lat, lon, out = new THREE.Vector3()) {
  const la = lat * DEG, lo = lon * DEG;
  return out.set(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
}
