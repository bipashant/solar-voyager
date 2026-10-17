// What kind of device and shell the app is running in, and the few native features it uses.
//
// In the iOS app (a Capacitor shell, see github.com/bipashant/solar-voyager-ios) haptics, sharing and
// saving files go through native plugins. On the web they fall back to browser APIs, or do nothing.
const cap = window.Capacitor;
export const isNative = !!cap?.isNativePlatform?.();
const ua = navigator.userAgent;
// iPadOS reports itself as a Mac, so count touch points as well
export const isIOS = isNative ? cap.getPlatform() === 'ios'
  : /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
export const isTouch = matchMedia('(pointer: coarse)').matches;
export const isPhone = Math.min(screen.width, screen.height) < 600;
export const isMobile = isIOS || (isTouch && /Android/.test(ua));

// Phones and tablets share one pool of memory between the CPU and GPU, and iOS ends a web view that uses
// too much. An 8k texture alone takes about 340 MB with its mipmaps, so mobile devices stop at 4k.
export const textureCap = isMobile ? 4096 : Infinity;
export const lowMemory = isPhone || (isMobile && !isIOS) || (navigator.deviceMemory || 8) <= 4;

if (isNative) document.documentElement.classList.add('native-app');
if (isMobile) document.documentElement.classList.add('mobile');
// the app is always full screen; iPhone Safari can't go full screen at all
if (isNative || (!document.fullscreenEnabled && !document.webkitFullscreenEnabled)) document.documentElement.classList.add('no-fullscreen');

// Phones in either orientation get the compact layout (matches the CSS breakpoint).
export const isCompact = () => window.innerWidth < 720 || (window.innerHeight < 500 && isTouch);

const plugins = {};
function plugin(name) {
  if (!isNative || !cap.registerPlugin) return null;
  return (plugins[name] ||= cap.registerPlugin(name));
}

// ---------------------------------------------------------------- haptics
// tap: a light tick for switches and buttons; engage/arrive/warn: heavier events; step: a detent.
const IMPACT = { tap: 'LIGHT', step: 'LIGHT', engage: 'MEDIUM', abort: 'MEDIUM' };
const NOTIFY = { arrive: 'SUCCESS', saved: 'SUCCESS', warn: 'WARNING' };
let lastHaptic = 0;
export function haptic(kind = 'tap') {
  const h = plugin('Haptics');
  if (!h) return;
  const now = performance.now();
  if (kind === 'step' && now - lastHaptic < 60) return; // held buttons repeat fast; don't buzz on every step
  lastHaptic = now;
  const call = NOTIFY[kind] ? h.notification({ type: NOTIFY[kind] }) : h.impact({ style: IMPACT[kind] || 'LIGHT' });
  call?.catch?.(() => {});
}

// ---------------------------------------------------------------- saving images
// iOS has no downloads folder for an app, so images go out through the share sheet, which offers
// Save Image (to Photos), AirDrop, Messages, Mail, Files and Print.
export const canShareFiles = isNative
  || (isTouch && !!navigator.canShare?.({ files: [new File([''], 'x.png', { type: 'image/png' })] }));

function blobToBase64Chunks(blob, chunkBytes) {
  // multiples of 3 bytes encode to whole base64 quads, so the chunks can simply be appended
  const size = chunkBytes - (chunkBytes % 3);
  const out = [];
  for (let i = 0; i < blob.size; i += size) out.push(blob.slice(i, i + size));
  return out.map((b) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  }));
}

// Returns 'shared', 'downloaded' or 'cancelled'.
export async function saveImage(blob, filename, title) {
  if (isNative) {
    const fs = plugin('Filesystem'), share = plugin('Share');
    // write in pieces so a 30 MB print never has to cross the bridge as one giant string
    let first = true;
    for (const p of blobToBase64Chunks(blob, 3 * 1024 * 1024)) {
      const data = await p;
      const opts = { path: filename, data, directory: 'CACHE' };
      if (first) await fs.writeFile(opts); else await fs.appendFile(opts);
      first = false;
    }
    const { uri } = await fs.getUri({ path: filename, directory: 'CACHE' });
    try {
      await share.share({ title, files: [uri] });
      return 'shared';
    } catch (err) {
      if (/cancel/i.test(String(err?.message || err))) return 'cancelled';
      throw err;
    }
  }
  if (canShareFiles) {
    try {
      await navigator.share({ title, files: [new File([blob], filename, { type: blob.type })] });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      // fall through to a download
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'downloaded';
}

// ---------------------------------------------------------------- app lifecycle
// Calls back with the time spent away (ms) whenever the app or tab comes back to the foreground.
export function onResume(fn) {
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt) { fn(Date.now() - hiddenAt); hiddenAt = 0; }
  });
}

// Hides the native launch screen once the first frame is ready (no-op on the web).
export function appReady() {
  plugin('SplashScreen')?.hide({ fadeOutDuration: 250 })?.catch?.(() => {});
}

// ---------------------------------------------------------------- sharing links
// Where shared links point. On the web, this page; in the iOS app (served from capacitor://localhost),
// the public site, so a friend without the app can open the view in a browser.
const PUBLIC_SITE = 'https://voyager-3.vercel.app/';
export const PUBLIC_URL = () => (isNative || !/^https?:/.test(location.protocol) ? PUBLIC_SITE : location.origin + location.pathname);

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back below */ }
  const t = document.createElement('textarea');
  t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
  document.body.append(t); t.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  t.remove();
  return ok;
}

// Returns 'shared', 'copied', 'cancelled' or 'failed'. Phones get the share sheet (which also offers Copy);
// desktops copy to the clipboard.
export async function shareLink(url, title, { copyOnly = false } = {}) {
  if (!copyOnly && isNative) {
    try { await plugin('Share').share({ title, url, dialogTitle: 'Share this view' }); return 'shared'; } catch (err) {
      if (/cancel/i.test(String(err?.message || err))) return 'cancelled';
    }
  }
  if (!copyOnly && isTouch && navigator.share) {
    try { await navigator.share({ title, url }); return 'shared'; } catch (err) { if (err?.name === 'AbortError') return 'cancelled'; }
  }
  return (await copyText(url)) ? 'copied' : 'failed';
}
