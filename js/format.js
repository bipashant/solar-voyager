import { AU_KM, C_KMS } from './ephemeris.js';

const n0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const LY_KM = 9460730472580.8;
const sig3 = (x) => n0.format(Number(x.toPrecision(3)));

// Interstellar distances in light-years: "1,344 light-years", "2.54 million light-years".
export function fmtLightYears(km) {
  const ly = km / LY_KM;
  if (ly < 10) return `${ly.toFixed(2)} light-years`;
  if (ly < 1e4) return `${n0.format(ly)} light-years`;
  if (ly < 1e6) return `${sig3(ly)} light-years`;
  if (ly < 1e9) return `${(ly / 1e6).toFixed(ly < 1e7 ? 2 : 1)} million light-years`;
  return `${(ly / 1e9).toFixed(2)} billion light-years`;
}

export function fmtDistance(km) {
  if (km >= 1e12) return fmtLightYears(km);
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 100) return `${km.toFixed(1)} km`;
  if (km < 1e6) return `${n0.format(km)} km`;
  if (km < 1e9) return `${(km / 1e6).toFixed(km < 1e7 ? 2 : 1)} million km`;
  return `${(km / 1e9).toFixed(2)} billion km`;
}

export function fmtCompact(km) {
  if (km >= 1e12) {
    const ly = km / LY_KM;
    if (ly < 10) return `${ly.toFixed(2)} ly`;
    if (ly < 1e4) return `${n0.format(ly)} ly`;
    if (ly < 1e6) return `${(ly / 1e3).toFixed(ly < 1e5 ? 1 : 0)}k ly`;
    return `${(ly / 1e6).toFixed(ly < 1e7 ? 2 : 1)}M ly`;
  }
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 1000) return `${km.toFixed(km < 10 ? 1 : 0)} km`;
  if (km < 1e6) return `${(km / 1e3).toFixed(km < 1e4 ? 1 : 0)}k km`;
  if (km < 1e9) return `${(km / 1e6).toFixed(km < 1e7 ? 1 : 0)}M km`;
  return `${(km / 1e9).toFixed(1)}B km`;
}

export function fmtAU(km) {
  const au = km / AU_KM;
  return au < 0.01 ? `${au.toFixed(5)} AU` : `${au.toFixed(au < 10 ? 3 : 2)} AU`;
}

export function fmtDuration(s) {
  if (!isFinite(s)) return '—';
  if (s < 1) return `${Math.max(1, Math.round(s * 1000))} ms`;
  if (s < 60) return `${s.toFixed(s < 10 ? 2 : 1)} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${String(Math.floor(s % 60)).padStart(2, '0')} s`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} min`;
  const d = s / 86400;
  if (d < 365.25) return `${Math.floor(d)} d ${Math.floor((s % 86400) / 3600)} h`;
  const y = d / 365.25;
  if (y < 10) return `${y.toFixed(1)} years`;
  if (y < 1e6) return `${n0.format(y)} years`;
  if (y < 1e9) return `${(y / 1e6).toFixed(1)} million years`;
  return `${(y / 1e9).toFixed(1)} billion years`;
}

export function fmtLightTime(km) {
  return fmtDuration(km / C_KMS);
}

export function fmtSpeed(kms) {
  if (kms < 1) return `${n0.format(kms * 3600)} km/h`;
  if (kms < 10000) return `${kms < 100 ? kms.toFixed(2) : n0.format(kms)} km/s`;
  const c = kms / C_KMS;
  return `${n0.format(kms)} km/s · ${c >= 10 ? n0.format(c) : c.toFixed(c < 0.1 ? 3 : 2)} c`;
}

export function fmtFactor(x) {
  if (x < 1000) return `×${x.toFixed(x < 10 ? 1 : 0)}`;
  if (x < 1e6) return `×${n0.format(x)}`;
  if (x < 1e9) return `×${(x / 1e6).toFixed(1)} million`;
  if (x < 1e12) return `×${(x / 1e9).toFixed(1)} billion`;
  return `×${(x / 1e12).toFixed(1)} trillion`;
}

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

// 3.2 × 10¹¹ style for very large or small numbers.
export function fmtSci(x, digits = 2) {
  if (x === 0 || !isFinite(x)) return String(x);
  const e = Math.floor(Math.log10(Math.abs(x)));
  if (e >= -2 && e < 4) return x.toLocaleString('en-US', { maximumSignificantDigits: digits + 1 });
  const m = x / 10 ** e;
  return `${m.toFixed(digits - 1)} × 10${String(e).replace(/./g, (c) => SUP[c])}`;
}

// Lengths from micrometres up, for Schwarzschild radii.
export function fmtLength(km) {
  if (km >= 10) return fmtDistance(km);
  if (km >= 1) return `${km.toFixed(2)} km`;
  const m = km * 1000;
  if (m >= 1) return `${m.toFixed(m < 10 ? 2 : 1)} m`;
  if (m >= 0.01) return `${(m * 100).toFixed(m < 0.1 ? 2 : 1)} cm`;
  if (m >= 1e-3) return `${(m * 1000).toFixed(2)} mm`;
  if (m >= 1e-6) return `${(m * 1e6).toFixed(m < 1e-5 ? 2 : 1)} µm`;
  return `${(m * 1e9).toFixed(2)} nm`;
}

// Short spans of time, down to femtoseconds.
export function fmtTiny(s) {
  if (s >= 1) return fmtDuration(s);
  const units = [[1e-3, 'ms'], [1e-6, 'µs'], [1e-9, 'ns'], [1e-12, 'ps'], [1e-15, 'fs']];
  for (const [u, name] of units) {
    if (s >= u) { const v = s / u; return `${v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0)} ${name}`; }
  }
  return `${fmtSci(s / 1e-15)} fs`;
}

// Small angles in arcseconds, milliarcseconds or microarcseconds.
export function fmtArc(rad) {
  const as = rad * 206264.806;
  if (as >= 60) return `${(as / 60).toFixed(1)}′`;
  if (as >= 1) return `${as.toFixed(2)}″`;
  if (as >= 1e-3) return `${(as * 1e3).toFixed(as < 0.01 ? 2 : 1)} mas`;
  if (as >= 1e-6) return `${(as * 1e6).toFixed(as < 1e-5 ? 2 : 1)} µas`;
  return `${fmtSci(as * 1e6)} µas`;
}
