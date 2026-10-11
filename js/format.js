import { AU_KM, C_KMS } from './ephemeris.js';

const n0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function fmtDistance(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 100) return `${km.toFixed(1)} km`;
  if (km < 1e6) return `${n0.format(km)} km`;
  if (km < 1e9) return `${(km / 1e6).toFixed(km < 1e7 ? 2 : 1)} million km`;
  return `${(km / 1e9).toFixed(2)} billion km`;
}

export function fmtCompact(km) {
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
