// GLSL for every body type. All lighting is done in view space (camera at the origin),
// using the logarithmic depth buffer so that metres and light-hours can share one scene.

export const NOISE = /* glsl */`
vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
vec3 hash33(vec3 p3){
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}
float noise1(float x){
  float i = floor(x); float f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(hash11(i), hash11(i + 1.0), u) * 2.0 - 1.0;
}
// Band-limited fBm: octaves smaller than ~2 pixels fade out, so detail appears as you zoom in
// without shimmering. px = size of one pixel in the same units as p.
float fbmAA(vec3 p, float f0, int oct, float px, float gain){
  float s = 0.0, a = 1.0, f = f0;
  for (int i = 0; i < 16; i++){
    if (i >= oct) break;
    float w = 1.0 - smoothstep(0.18, 0.45, f * px);
    if (w <= 0.0) break;
    s += a * w * snoise(p * f + float(i) * 7.31);
    a *= gain; f *= 2.0;
  }
  return s;
}
vec2 voronoi(vec3 x){
  vec3 i = floor(x), f = fract(x);
  float md = 8.0, id = 0.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int k = -1; k <= 1; k++){
    vec3 g = vec3(float(k), float(y), float(z));
    vec3 o = hash33(i + g);
    vec3 r = g + o - f;
    float d = dot(r, r);
    if (d < md){ md = d; id = o.x; }
  }
  return vec2(sqrt(md), id);
}
// One octave of bowl-shaped craters with raised rims.
float craterCell(vec3 x, float density, out float rim){
  vec3 i = floor(x), f = fract(x);
  float h = 0.0; rim = 0.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int k = -1; k <= 1; k++){
    vec3 g = vec3(float(k), float(y), float(z));
    vec3 o = hash33(i + g);
    if (o.z > density) continue;
    vec3 c = g + 0.15 + 0.7 * o - f;
    float rad = 0.16 + 0.32 * fract(o.x * 13.7 + o.y * 7.1);
    float d = length(c) / rad;
    if (d > 1.7) continue;
    float bowl = d < 1.0 ? (d * d - 1.0) : 0.0;
    float rh = exp(-(d - 1.0) * (d - 1.0) * 12.0) * 0.3;
    h += bowl * 0.75 + rh;
    rim = max(rim, (1.0 - smoothstep(0.2, 1.6, d)) * 0.35 * (1.0 - smoothstep(0.0, 1.0, o.y)));
  }
  return h;
}
float craters(vec3 p, float f0, int oct, float px, float density, out float fresh){
  float h = 0.0, f = f0, amp = 1.0; fresh = 0.0;
  for (int i = 0; i < 8; i++){
    if (i >= oct) break;
    float w = 1.0 - smoothstep(0.12, 0.35, f * px);
    if (w <= 0.0) break;
    float rim;
    h += amp * w * craterCell(p * f + float(i) * 17.3, density, rim);
    fresh += w * rim * amp;
    amp *= 0.5; f *= 2.13;
  }
  return h;
}
`;

const SPHERE_UV = /* glsl */`
vec2 sphereUV(vec3 p){
  float lon = atan(-p.z, p.x);
  float lat = asin(clamp(p.y, -1.0, 1.0));
  return vec2(0.5 + lon / (2.0 * PI), 0.5 + lat / PI);
}
// Equirectangular lookup without the mip seam at longitude ±180°.
vec4 texSphere(sampler2D t, vec2 uv){
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  dx.x -= floor(dx.x + 0.5);
  dy.x -= floor(dy.x + 0.5);
  return textureGrad(t, uv, dx, dy);
}
`;

const ECLIPSE = /* glsl */`
uniform vec4 uOcc[4];
uniform int uOccN;
uniform float uSunR;
// Fraction of the solar disc visible from P (view space), given up to 4 occluding spheres.
float eclipse(vec3 P, vec3 S){
  vec3 toS = S - P; float dS = length(toS); vec3 ds = toS / dS;
  float aS = asin(clamp(uSunR / dS, 0.0, 1.0));
  float vis = 1.0;
  for (int i = 0; i < 4; i++){
    if (i >= uOccN) break;
    vec3 toO = uOcc[i].xyz - P; float dO = length(toO);
    if (dO >= dS || dO < uOcc[i].w * 1.001) continue;
    vec3 dO3 = toO / dO;
    float aO = asin(clamp(uOcc[i].w / dO, 0.0, 1.0));
    float sep = atan(length(cross(dO3, ds)), dot(dO3, ds));
    float rmax = aS + aO;
    if (sep >= rmax) continue;
    float rmin = abs(aS - aO);
    float full = min(1.0, (aO * aO) / (aS * aS));
    vis *= 1.0 - full * (1.0 - smoothstep(rmin, rmax, sep));
  }
  return vis;
}
`;

export const RING_FUNCS = /* glsl */`
uniform vec4 uBands[12];
uniform int uBandN;
uniform float uRingNoise;
float ringlets(float r, float aa){
  float v = 0.0, amp = 0.5, f = 1.0 / 900.0;
  for (int i = 0; i < 11; i++){
    float w = 1.0 - smoothstep(0.25, 0.5, f * aa);
    if (w <= 0.0) break;
    v += amp * w * noise1(r * f + float(i) * 31.7);
    amp *= 0.66; f *= 2.17;
  }
  return v;
}
float ringDensity(float r, float aa, out float cmix){
  float op = 0.0; cmix = 0.0; float ws = 0.0;
  float e = max(aa, 8.0);
  for (int i = 0; i < 12; i++){
    if (i >= uBandN) break;
    vec4 b = uBands[i];
    float m = smoothstep(b.x - e, b.x + e, r) * (1.0 - smoothstep(b.y - e, b.y + e, r));
    op = max(op, m * b.z);
    cmix += m * b.w; ws += m;
  }
  cmix = ws > 0.001 ? cmix / ws : 0.0;
  op *= clamp(1.0 + uRingNoise * ringlets(r, aa) * 1.5, 0.05, 1.7);
  return clamp(op, 0.0, 1.0);
}
`;

const PERTURB = /* glsl */`
vec3 perturbNormal(vec3 pos, vec3 n, float h){
  vec3 sx = dFdx(pos), sy = dFdy(pos);
  vec2 dh = vec2(dFdx(h), dFdy(h));
  vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
  return normalize(abs(det) * n - grad);
}
`;

// ---------------------------------------------------------------- surface
export const SURFACE_VERT = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vObj;
varying vec3 vNormalV;
varying vec3 vPosV;
varying vec3 vEastV;
void main(){
  vObj = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vPosV = mv.xyz;
  vNormalV = normalize(normalMatrix * normal);
  vec3 east = vec3(position.z, 0.0, -position.x);
  vEastV = mat3(modelViewMatrix) * (east + vec3(0.0, 0.0, 1e-6));
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}
`;

export const SURFACE_FRAG = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uSunV;
uniform vec3 uSunCol;
uniform float uTime;
uniform float uRadius;
uniform float uRelief;
uniform float uSeed;
uniform vec3 uColA;
uniform vec3 uColB;
uniform float uCraterDensity;
uniform vec3 uBigDir;
uniform float uBigR;
uniform float uBigRing;
uniform float uMapW;
uniform float uBright;
uniform sampler2D uMap;
#ifdef EARTH
uniform sampler2D uNight;
uniform sampler2D uSpec;
uniform sampler2D uNormal;
uniform sampler2D uClouds;
uniform float uCloudShift;
#endif
#ifdef RING_SHADOW
uniform vec3 uRingNormalV;
uniform vec3 uCenterV;
#endif
varying vec3 vObj;
varying vec3 vNormalV;
varying vec3 vPosV;
varying vec3 vEastV;
${NOISE}
${SPHERE_UV}
${ECLIPSE}
${PERTURB}
#ifdef RING_SHADOW
${RING_FUNCS}
#endif

float angDist(vec3 a, vec3 b){ return atan(length(cross(a, b)), dot(a, b)); }
vec3 dirLL(float lat, float lon){ lat = radians(lat); lon = radians(lon); return vec3(cos(lat) * cos(lon), sin(lat), -cos(lat) * sin(lon)); }

void main(){
  #include <logdepthbuf_fragment>
  vec3 p = normalize(vObj);
  vec3 Ng = normalize(vNormalV);
  vec3 V = normalize(-vPosV);
  vec3 L = normalize(uSunV - vPosV);
  float px = length(fwidth(vObj));
  vec2 uv = sphereUV(p);
  vec3 albedo = uColA;
  float h = 0.0;          // relief in km
  vec3 emit = vec3(0.0);
  float lambertMix = 1.0; // 1 = Lambert (cloudy worlds), 0 = Lommel–Seeliger (dusty airless worlds)
  float limb = 0.0;       // extra limb darkening for gas giants
  vec3 N = Ng;
  float fresh;

#if STYLE == 1 // textured rock (Mercury, Mars, Moon)
  albedo = texSphere(uMap, uv).rgb;
  float f0 = uMapW * 0.05;
  float d = fbmAA(p, f0, 12, px, 0.52);
  albedo *= 1.0 + 0.10 * d;
  float c = craters(p + uSeed, f0 * 0.7, 6, px, uCraterDensity, fresh);
  albedo *= 1.0 + 0.18 * fresh;
  // amplitude tied to wavelength keeps slopes realistic at every zoom level
  h = (d * 0.25 + c * 0.5) * (uRadius / f0) * 0.1 * uRelief;
  lambertMix = LAMBERT_MIX;
#elif STYLE == 2 // gas and ice giants
  vec2 uvg = uv;
  float s = 3.0;
  vec3 q = vec3(p.x, p.y * s, p.z);
  // gentle zonal flow plus sub-texel eddies that only resolve when you zoom in
  float w = fbmAA(q + vec3(uTime * 0.0004, 0.0, 0.0), uMapW * 0.03, 4, px * s, 0.55);
  vec3 pe = p + vec3(0.0, 0.0, uTime * 0.0002);
  vec2 eddy = vec2(fbmAA(pe + 3.1, uMapW * 0.03, 7, px, 0.6), fbmAA(pe + 7.7, uMapW * 0.03, 7, px, 0.6));
  uvg += (vec2(w * 2.0, w * 0.5) + eddy * vec2(3.0, 1.6)) / uMapW;
  albedo = texSphere(uMap, uvg).rgb;
  float d = fbmAA(q * 1.3 - vec3(0.0, 0.0, uTime * 0.0003), uMapW * 0.08, 9, px * s * 1.3, 0.62);
  albedo *= 1.0 + 0.11 * d;
  limb = 0.35;
  #ifdef HEXAGON
  float latd = degrees(asin(p.y));
  if (latd > 66.0){
    float ang = atan(-p.z, p.x) + uSeed;
    float rr = 90.0 - latd;
    float k = mod(ang, PI / 3.0) - PI / 6.0;
    float hexR = 12.5 * 0.866 / cos(k);
    float edge = exp(-pow((rr - hexR) / 1.1, 2.0));
    float inside = smoothstep(hexR + 0.8, hexR - 0.8, rr);
    albedo = mix(albedo, albedo * vec3(0.78, 0.86, 1.0), inside * 0.55);
    albedo = mix(albedo, vec3(0.86, 0.8, 0.66), edge * 0.45);
    float vort = smoothstep(3.5, 0.0, rr + 0.6 * snoise(p * 300.0));
    albedo = mix(albedo, vec3(0.30, 0.28, 0.30), vort * 0.75);
    float swirl = snoise(vec3(rr * 1.5, sin(ang * 3.0), cos(ang * 3.0)) + uTime * 0.001);
    albedo *= 1.0 + 0.06 * swirl * inside;
  }
  #endif
#elif STYLE == 3 // Venus cloud deck
  albedo = texSphere(uMap, uv).rgb;
  float d = fbmAA(vec3(p.x, p.y * 2.0, p.z), uMapW * 0.05, 7, px * 2.0, 0.6);
  albedo *= 1.0 + 0.06 * d;
  limb = 0.15;
#elif STYLE == 4 // Earth
  vec3 dayC = texSphere(uMap, uv).rgb;
  float ocean = texSphere(uSpec, uv).r;
  vec3 nm = texSphere(uNormal, uv).xyz * 2.0 - 1.0;
  vec3 T = normalize(vEastV - Ng * dot(vEastV, Ng));
  vec3 B = cross(Ng, T);
  float land = 1.0 - ocean;
  N = normalize(T * nm.x * 1.6 * land + B * nm.y * 1.6 * land + Ng * nm.z);
  float d = fbmAA(p, uMapW * 0.05, 12, px, 0.5);
  dayC *= 1.0 + 0.08 * d * land;
  h = d * (uRadius / (uMapW * 0.05)) * 0.05 * uRelief * land;
  float cl = texSphere(uClouds, uv + vec2(uCloudShift, 0.0)).r;
  albedo = dayC * (1.0 - 0.5 * cl);
  float NgL0 = dot(Ng, L);
  vec3 night = texSphere(uNight, uv).rgb;
  float dark = 1.0 - smoothstep(-0.2, 0.05, NgL0);
  emit = night * night * vec3(1.0, 0.82, 0.55) * 2.2 * dark * (1.0 - 0.85 * cl);
  vec3 H = normalize(L + V);
  float glint = pow(max(dot(Ng, H), 0.0), 90.0) * ocean * (1.0 - cl);
  float fres = pow(1.0 - max(dot(Ng, V), 0.0), 5.0);
  emit += uSunCol * (glint * 0.9 + fres * 0.04 * ocean) * smoothstep(-0.02, 0.1, NgL0);
#elif STYLE == 10 // generic cratered rock / ice (procedural)
  float n = fbmAA(p * 1.0 + uSeed, 1.6, 7, px, 0.5);
  albedo = mix(uColA, uColB, smoothstep(-0.55, 0.55, n));
  float c = craters(p + uSeed, 3.0, 7, px, uCraterDensity, fresh);
  albedo *= 1.0 + 0.35 * fresh;
  h = (c * 0.6 + n * 0.25) * uRelief;
  lambertMix = 0.25;
  #ifdef WISPY
  float trail = smoothstep(0.1, 0.6, -p.z);
  float lines = 0.0; float f = 2.5;
  for (int i = 0; i < 5; i++){
    float ww = 1.0 - smoothstep(0.03, 0.08, f * px);
    vec3 qq = p * f + 0.5 * vec3(snoise(p * f * 0.4 + 3.0), snoise(p * f * 0.4 + 7.0), snoise(p * f * 0.4 + 11.0));
    lines = max(lines, ww * smoothstep(0.9, 0.99, 1.0 - abs(snoise(qq))));
    f *= 2.0;
  }
  albedo = mix(albedo, vec3(0.97, 0.97, 0.98), lines * trail * 0.85);
  #endif
  #ifdef IAPETUS
  float lead = p.z + 0.22 * fbmAA(p * 2.0 + uSeed, 2.0, 6, px, 0.55);
  float darkMask = smoothstep(0.0, 0.18, lead) * (1.0 - smoothstep(0.72, 0.92, abs(p.y)));
  albedo = mix(albedo, uColB, darkMask);
  h += exp(-p.y * p.y * 3000.0) * smoothstep(-0.2, 0.3, p.z) * uRelief * 3.0;
  #endif
  #ifdef MIRANDA
  for (int i = 0; i < 3; i++){
    vec3 cdir = normalize(hash33(vec3(float(i) * 3.1 + uSeed)) * 2.0 - 1.0);
    float ad = angDist(p, cdir);
    float m = smoothstep(0.75, 0.6, ad + 0.08 * snoise(p * 6.0 + float(i)));
    float grooves = 0.5 + 0.5 * sin(ad * 90.0 + snoise(p * 9.0) * 2.0);
    albedo = mix(albedo, mix(uColA * 0.85, uColB * 1.05, grooves), m * 0.8);
    h += m * grooves * uRelief * 0.4;
  }
  #endif
#elif STYLE == 11 // Europa
  float n = fbmAA(p + uSeed, 2.0, 6, px, 0.5);
  albedo = mix(vec3(0.86, 0.82, 0.74), vec3(0.70, 0.56, 0.43), smoothstep(-0.1, 0.9, n));
  float lines = 0.0; float f = 2.5;
  for (int i = 0; i < 7; i++){
    float ww = 1.0 - smoothstep(0.025, 0.07, f * px);
    if (ww <= 0.0) break;
    vec3 qq = p * f + 0.45 * vec3(snoise(p * f * 0.5 + 3.0), snoise(p * f * 0.5 + 7.0), snoise(p * f * 0.5 + 11.0));
    lines = max(lines, ww * smoothstep(0.93, 0.995, 1.0 - abs(snoise(qq))) * (1.0 - 0.07 * float(i)));
    f *= 2.0;
  }
  albedo = mix(albedo, vec3(0.50, 0.30, 0.18), lines * 0.8);
  float c = craters(p + uSeed, 6.0, 5, px, 0.12, fresh);
  h = (lines * 0.5 + c * 0.3) * uRelief;
  lambertMix = 0.6;
#elif STYLE == 12 // Io
  float n1 = fbmAA(p + uSeed, 2.0, 7, px, 0.55);
  float n2 = fbmAA(p * 1.7 + uSeed + 5.0, 3.0, 6, px, 0.5);
  albedo = mix(vec3(0.92, 0.83, 0.38), vec3(0.93, 0.91, 0.80), smoothstep(0.15, 0.7, n1));
  albedo = mix(albedo, vec3(0.84, 0.52, 0.20), smoothstep(0.3, 0.85, n2) * 0.8);
  albedo = mix(albedo, vec3(0.50, 0.36, 0.24), smoothstep(0.55, 0.92, abs(p.y)) * 0.65);
  vec2 vr = voronoi(p * 7.0 + uSeed);
  float spot = smoothstep(0.13, 0.05, vr.x + 0.04 * snoise(p * 40.0));
  float ring = exp(-pow((vr.x - 0.28) / 0.06, 2.0)) * step(0.7, vr.y);
  albedo = mix(albedo, vec3(0.62, 0.22, 0.10), ring * 0.6);
  albedo = mix(albedo, vec3(0.10, 0.07, 0.05), spot);
  vec2 vr2 = voronoi(p * 19.0 + uSeed * 2.0);
  albedo = mix(albedo, vec3(0.16, 0.10, 0.06), smoothstep(0.08, 0.03, vr2.x) * step(0.5, vr2.y) * (1.0 - smoothstep(0.1, 0.3, 19.0 * px)));
  h = n1 * 0.4 * uRelief;
  lambertMix = 0.5;
#elif STYLE == 13 // Ganymede
  float n = fbmAA(p + uSeed, 1.6, 7, px, 0.55);
  float bright = smoothstep(-0.05, 0.25, n);
  albedo = mix(vec3(0.36, 0.32, 0.27), vec3(0.6, 0.57, 0.52), bright);
  vec3 gdir = normalize(vec3(snoise(p * 1.5), snoise(p * 1.5 + 4.0), snoise(p * 1.5 + 8.0)) + vec3(0.3, 0.2, 0.1));
  float gr = sin(dot(p, gdir) * 140.0 + snoise(p * 6.0) * 5.0) * (0.5 + 0.5 * snoise(p * 9.0));
  albedo *= 1.0 + 0.045 * gr * bright * (1.0 - smoothstep(0.2, 0.5, 25.0 * px));
  float c = craters(p + uSeed, 4.0, 6, px, 0.45, fresh);
  albedo = mix(albedo, vec3(0.85, 0.84, 0.82), fresh * 0.8);
  albedo = mix(albedo, vec3(0.80, 0.80, 0.82), smoothstep(0.72, 0.95, abs(p.y)) * 0.5);
  h = (c * 0.6 + gr * bright * 0.1) * uRelief;
  lambertMix = 0.35;
#elif STYLE == 14 // Callisto
  float n = fbmAA(p + uSeed, 2.0, 7, px, 0.5);
  albedo = mix(vec3(0.24, 0.21, 0.18), vec3(0.36, 0.32, 0.27), smoothstep(-0.5, 0.5, n));
  float c = craters(p + uSeed, 5.0, 7, px, 0.75, fresh);
  albedo = mix(albedo, vec3(0.70, 0.68, 0.64), clamp(fresh * 1.5, 0.0, 1.0));
  float vd = angDist(p, dirLL(15.0, -56.0));
  albedo = mix(albedo, vec3(0.55, 0.52, 0.48), smoothstep(0.35, 0.0, vd) * 0.6);
  albedo *= 1.0 + 0.12 * (0.5 + 0.5 * sin(vd * 60.0)) * smoothstep(0.9, 0.3, vd);
  h = c * 0.7 * uRelief;
  lambertMix = 0.25;
#elif STYLE == 15 // Titan
  float n = fbmAA(p + uSeed, 2.0, 6, px, 0.5);
  albedo = mix(vec3(0.80, 0.50, 0.20), vec3(0.62, 0.38, 0.14), smoothstep(-0.3, 0.6, n) * 0.4);
  albedo *= 0.96 + 0.04 * sin(p.y * 14.0);
#elif STYLE == 16 // Enceladus
  float n = fbmAA(p + uSeed, 2.0, 6, px, 0.5);
  albedo = vec3(0.95, 0.96, 0.97) * (0.95 + 0.05 * n);
  float c = craters(p + uSeed, 4.0, 6, px, 0.5 * smoothstep(-0.2, 0.3, p.y), fresh);
  vec2 q2 = p.xz;
  float sp = smoothstep(-0.88, -0.95, p.y);
  float st = abs(fract((q2.x * 0.8 + q2.y * 0.6 + 0.04 * snoise(p * 30.0)) * 13.0) - 0.5);
  float stripe = smoothstep(0.09, 0.0, st) * sp * step(abs(q2.x * 0.6 - q2.y * 0.8), 0.22);
  albedo = mix(albedo, vec3(0.55, 0.72, 0.84), stripe * 0.7);
  h = (c * 0.5 - stripe * 0.3) * uRelief;
  lambertMix = 0.7;
#elif STYLE == 17 // Triton
  float cap = smoothstep(0.05, -0.30, p.y + 0.18 * snoise(p * 3.0 + uSeed));
  vec2 vr = voronoi(p * 22.0 + uSeed);
  float dimple = smoothstep(0.0, 0.55, vr.x);
  vec3 north = vec3(0.66, 0.64, 0.58) * (0.82 + 0.18 * dimple);
  vec3 capC = vec3(0.93, 0.84, 0.80);
  float streak = smoothstep(0.55, 0.9, snoise(vec3(p.x * 28.0, p.y * 3.0, p.z * 28.0) + uSeed)) * cap;
  albedo = mix(north, capC, cap);
  albedo = mix(albedo, vec3(0.38, 0.30, 0.27), streak * 0.55);
  h = (dimple * (1.0 - cap) * 0.5) * uRelief;
  lambertMix = 0.6;
#elif STYLE == 18 // Pluto
  float n = fbmAA(p + uSeed, 2.0, 7, px, 0.55);
  albedo = mix(vec3(0.76, 0.60, 0.45), vec3(0.88, 0.80, 0.70), smoothstep(-0.2, 0.6, n));
  float e1 = angDist(p, dirLL(25.0, 175.0)) + 0.06 * snoise(p * 5.0);
  float e2 = angDist(p, dirLL(2.0, -150.0)) + 0.07 * snoise(p * 5.0 + 3.0);
  float heart = max(smoothstep(0.45, 0.38, e1), smoothstep(0.40, 0.32, e2));
  vec2 cells = voronoi(p * 30.0);
  float cellEdge = smoothstep(0.02, 0.10, abs(cells.x - 0.5) + 0.0) * smoothstep(0.45, 0.30, e1);
  vec3 heartC = vec3(0.96, 0.92, 0.86) * (0.95 + 0.05 * cellEdge);
  albedo = mix(albedo, heartC, heart);
  float lat = degrees(asin(p.y));
  float lon = degrees(atan(-p.z, p.x));
  float cth = smoothstep(22.0, 12.0, abs(lat + 8.0 + 6.0 * snoise(p * 4.0))) * smoothstep(5.0, 30.0, lon) * smoothstep(165.0, 140.0, lon);
  albedo = mix(albedo, vec3(0.33, 0.17, 0.10), cth * (1.0 - heart) * 0.9);
  albedo = mix(albedo, vec3(0.70, 0.64, 0.58), smoothstep(55.0, 75.0, lat) * 0.6);
  float c = craters(p + uSeed, 6.0, 6, px, 0.35, fresh);
  h = (c * (1.0 - heart) * 0.6 + n * 0.2) * uRelief;
  lambertMix = 0.6;
#elif STYLE == 19 // Charon
  float n = fbmAA(p + uSeed, 2.0, 7, px, 0.5);
  albedo = mix(vec3(0.52, 0.50, 0.48), vec3(0.66, 0.64, 0.62), smoothstep(-0.4, 0.5, n));
  float mordor = smoothstep(55.0, 70.0, degrees(asin(p.y)) + 6.0 * snoise(p * 5.0));
  albedo = mix(albedo, vec3(0.42, 0.27, 0.19), mordor * 0.85);
  float chasm = smoothstep(0.86, 0.97, 1.0 - abs(snoise(vec3(p.x * 4.0, p.y * 9.0, p.z * 4.0)))) * smoothstep(0.35, 0.0, abs(p.y - 0.05)) * (1.0 - smoothstep(0.03, 0.1, 9.0 * px));
  albedo *= 1.0 - 0.3 * chasm;
  float c = craters(p + uSeed, 5.0, 6, px, 0.5, fresh);
  albedo *= 1.0 + 0.3 * fresh;
  h = (c * 0.6 - chasm * 0.4) * uRelief;
  lambertMix = 0.4;
#endif

  // a single giant impact basin (Herschel, Odysseus, Stickney) or a bright ring (Wunda)
  if (uBigR > 0.0){
    float bc = angDist(p, uBigDir) / uBigR;
    if (uBigRing > 0.5){
      albedo = mix(albedo, vec3(0.86, 0.84, 0.8), exp(-pow((bc - 1.0) / 0.22, 2.0)) * 0.85);
    } else {
      float bowl = bc < 1.0 ? (bc * bc - 1.0) : 0.0;
      float rim = exp(-(bc - 1.0) * (bc - 1.0) * 18.0) * 0.35;
      float peak = exp(-bc * bc * 60.0) * 0.45;
      h += (bowl * 0.8 + rim + peak) * uRelief * 4.0;
      albedo *= 1.0 - 0.08 * smoothstep(1.0, 0.0, bc);
    }
  }

  if (uRelief > 0.0) N = perturbNormal(vPosV, N, h);
  albedo *= uBright;

  float NgL = dot(Ng, L);
  float mu0 = max(dot(N, L), 0.0);
  float mu = max(dot(N, V), 0.0);
  float ls = 2.0 * mu0 / (mu0 + max(dot(Ng, V), 0.0) + 1e-3);
  float diffuse = mix(ls * 0.5, mu0, lambertMix);
  diffuse *= smoothstep(-0.04, 0.06, NgL);
  diffuse *= 1.0 - limb * (1.0 - pow(max(dot(Ng, V), 0.0), 0.6));
  float shadow = eclipse(vPosV, uSunV);
#ifdef RING_SHADOW
  {
    float dn = dot(L, uRingNormalV);
    if (abs(dn) > 1e-4){
      float t = dot(uCenterV - vPosV, uRingNormalV) / dn;
      if (t > 0.0){
        vec3 hit = vPosV + L * t;
        float rr = length(hit - uCenterV);
        float cm;
        float op = ringDensity(rr, max(px * uRadius * 4.0, 50.0), cm);
        shadow *= 1.0 - op * 0.92;
      }
    }
  }
#endif
  vec3 col = albedo * uSunCol * diffuse * shadow + albedo * 0.003 + emit;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------- clouds (Earth)
export const CLOUDS_FRAG = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uSunV;
uniform vec3 uSunCol;
uniform sampler2D uMap;
uniform float uShift;
uniform float uMapW;
varying vec3 vObj;
varying vec3 vNormalV;
varying vec3 vPosV;
varying vec3 vEastV;
${NOISE}
${SPHERE_UV}
${ECLIPSE}
void main(){
  #include <logdepthbuf_fragment>
  vec3 p = normalize(vObj);
  vec3 N = normalize(vNormalV);
  vec3 L = normalize(uSunV - vPosV);
  float px = length(fwidth(vObj));
  vec2 uv = sphereUV(p) + vec2(uShift, 0.0);
  float c = texSphere(uMap, uv).r;
  float d = fbmAA(p, uMapW * 0.06, 9, px, 0.55);
  c = clamp(c * (1.0 + 0.5 * d) - 0.03, 0.0, 1.0);
  float NdL = dot(N, L);
  float lit = smoothstep(-0.08, 0.25, NdL) * (0.35 + 0.65 * max(NdL, 0.0));
  float shadow = eclipse(vPosV, uSunV);
  vec3 sunset = mix(vec3(1.0, 0.55, 0.3), vec3(1.0), smoothstep(0.0, 0.3, NdL));
  vec3 col = vec3(0.97) * uSunCol * sunset * lit * shadow + 0.002;
  gl_FragColor = vec4(col, c * 0.95);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------- Sun
export const SUN_FRAG = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uMap;
uniform float uMapW;
uniform float uTime;
uniform float uIntensity;
varying vec3 vObj;
varying vec3 vNormalV;
varying vec3 vPosV;
varying vec3 vEastV;
${NOISE}
${SPHERE_UV}
void main(){
  #include <logdepthbuf_fragment>
  vec3 p = normalize(vObj);
  vec3 N = normalize(vNormalV);
  vec3 V = normalize(-vPosV);
  float mu = max(dot(N, V), 0.0);
  float px = length(fwidth(vObj));
  vec3 base = texSphere(uMap, sphereUV(p)).rgb;
  float lum = dot(base, vec3(0.3, 0.55, 0.15));
  float t = uTime * 0.02;
  vec3 q = p + vec3(t, -t * 0.6, t * 0.35);
  float g = fbmAA(q, 30.0, 10, px, 0.6);
  vec2 cell = voronoi(p * 900.0 + vec3(0.0, uTime * 0.05, 0.0));
  float gran = mix(1.0, 0.75 + 0.5 * smoothstep(0.0, 0.7, cell.x), 1.0 - smoothstep(0.2, 0.45, 900.0 * px));
  vec3 col = vec3(1.0, 0.70, 0.36) * (0.45 + 1.3 * lum) * (1.0 + 0.22 * g) * (2.0 - gran);
  float ld = 1.0 - 0.6 * (1.0 - mu) - 0.2 * (1.0 - mu) * (1.0 - mu);
  col *= ld;
  col = mix(col * vec3(1.0, 0.72, 0.5), col, mu);
  gl_FragColor = vec4(col * uIntensity, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------- atmosphere
export const ATMO_VERT = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vObj;
void main(){
  vObj = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;

export const ATMO_FRAG = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uCamL;
uniform vec3 uSunL;
uniform float uInner;
uniform vec3 uColor;
uniform float uMie;
uniform float uIntensity;
uniform float uScaleH;
uniform float uInside;
uniform float uSunVis;
varying vec3 vObj;
vec2 rsph(vec3 ro, vec3 rd, float r){
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r * r;
  float h = b * b - c;
  if (h < 0.0) return vec2(-1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}
void main(){
  #include <logdepthbuf_fragment>
  vec3 rd = normalize(vObj - uCamL);
  vec3 ro; float tEnd;
  if (uInside > 0.5){
    ro = uCamL; tEnd = length(vObj - uCamL);
  } else {
    ro = normalize(vObj);
    tEnd = max(rsph(ro, rd, 1.0).y, 0.0);
  }
  vec2 tp = rsph(ro, rd, uInner);
  if (tp.x > 0.0) tEnd = min(tEnd, tp.x);
  if (tEnd <= 0.0) discard;
  float H = uScaleH * (1.0 - uInner);
  const int N = 14;
  float ds = tEnd / float(N);
  vec3 sum = vec3(0.0);
  for (int i = 0; i < N; i++){
    vec3 pos = ro + rd * (ds * (float(i) + 0.5));
    float r = length(pos);
    float dens = exp(-max(r - uInner, 0.0) / H);
    vec3 n = pos / r;
    float cs = dot(n, uSunL);
    float lit = smoothstep(-0.16, 0.12, cs);
    float tau = dens * H / max(cs + 0.18, 0.025) / (1.0 - uInner) * 6.0;
    vec3 tr = exp(-tau * (uColor * 1.3 + 0.1));
    sum += dens * lit * tr * ds;
  }
  float mu = dot(rd, uSunL);
  float phaseR = 0.75 * (1.0 + mu * mu);
  float g = 0.72;
  float phaseM = (1.0 - g * g) / (4.0 * PI * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  vec3 col = sum / (1.0 - uInner) * uIntensity * (uColor * phaseR * 0.35 + uMie * phaseM * vec3(1.0, 0.95, 0.9) * 0.6);
  col = 1.0 - exp(-col);
  gl_FragColor = vec4(col * uSunVis, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------- rings
export const RING_VERT = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vLocal;
varying vec3 vPosV;
void main(){
  vLocal = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vPosV = mv.xyz;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}
`;

export const RING_FRAG = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uSunV;
uniform vec3 uSunCol;
uniform vec3 uCenterV;
uniform vec3 uNormalV;
uniform float uPlanetR;
uniform float uPlanetFlat;
uniform vec3 uColA;
uniform vec3 uColB;
uniform float uBright;
varying vec3 vLocal;
varying vec3 vPosV;
${NOISE}
${RING_FUNCS}
void main(){
  #include <logdepthbuf_fragment>
  float r = length(vLocal.xy);
  float aa = fwidth(r);
  float cm;
  float op = ringDensity(r, aa, cm);
  if (op < 0.003) discard;
  vec3 base = mix(uColA, uColB, cm);
  base *= 0.92 + 0.16 * noise1(r / 2100.0 + 4.0);
  vec3 L = normalize(uSunV - vPosV);
  vec3 V = normalize(-vPosV);
  float ln = dot(uNormalV, L), vn = dot(uNormalV, V);
  float mu0 = abs(ln), mu = abs(vn);
  float ls = 2.0 * mu0 / (mu0 + mu + 1e-3);
  float phase = dot(-L, V);
  float lit;
  if (ln * vn > 0.0){
    lit = ls * 0.95 * (0.65 + 0.35 * smoothstep(0.0, 0.12, mu0));
  } else {
    lit = ls * (1.0 - op) * 0.9 * (0.4 + 1.6 * pow(max(phase, 0.0), 6.0)) * smoothstep(0.0, 0.08, mu0);
  }
  // planet shadow on the rings
  vec3 rel = vPosV - uCenterV;
  float t = -dot(rel, L);
  float shadow = 1.0;
  if (t > 0.0){
    vec3 closest = rel + L * t;
    vec3 rn = uNormalV * dot(closest, uNormalV);
    vec3 c2 = closest - rn + rn / uPlanetFlat;
    float d = length(c2);
    shadow = smoothstep(uPlanetR * 0.985, uPlanetR * 1.015, d);
  }
  vec3 col = base * uSunCol * lit * shadow * uBright;
  gl_FragColor = vec4(col, op);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------- sky
export const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

export const SKY_FRAG = /* glsl */`
#include <common>
uniform sampler2D uMilky;
uniform mat3 uGal;
uniform float uBright;
varying vec3 vDir;
void main(){
  vec3 g = normalize(uGal * normalize(vDir));
  float l = atan(g.y, g.x);
  float b = asin(clamp(g.z, -1.0, 1.0));
  vec2 uv = vec2(fract(0.5 - l / (2.0 * PI)), 0.5 - b / PI);
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  dx.x -= floor(dx.x + 0.5);
  dy.x -= floor(dy.x + 0.5);
  vec3 c = textureGrad(uMilky, uv, dx, dy).rgb;
  c = pow(c, vec3(0.92)) * uBright;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`;

export const STAR_VERT = /* glsl */`
attribute float aSize;
attribute vec3 aColor;
uniform float uScale;
varying vec3 vColor;
void main(){
  vColor = aColor;
  gl_PointSize = aSize * uScale;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

export const STAR_FRAG = /* glsl */`
uniform float uBright;
varying vec3 vColor;
void main(){
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  float a = exp(-r2 * 5.0) * 0.8 + exp(-r2 * 40.0);
  gl_FragColor = vec4(vColor * a * uBright, 1.0);
}
`;

export const LINE_SKY_VERT = /* glsl */`
void main(){
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

export const LINE_SKY_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uOpacity;
void main(){ gl_FragColor = vec4(uColor, uOpacity); }
`;

// ---------------------------------------------------------------- orbit lines
export const ORBIT_VERT = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
varying float vDist;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}
`;

export const ORBIT_FRAG = /* glsl */`
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor;
uniform float uOpacity;
uniform float uFadeNear;
varying float vDist;
void main(){
  #include <logdepthbuf_fragment>
  float a = uOpacity * smoothstep(uFadeNear * 0.25, uFadeNear, vDist);
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, a);
}
`;

// ---------------------------------------------------------------- point markers for distant bodies
export const MARKER_VERT = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aSize;
attribute vec3 aColor;
attribute float aAlpha;
uniform float uDpr;
varying vec3 vColor;
varying float vAlpha;
void main(){
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uDpr;
  #include <logdepthbuf_vertex>
}
`;

export const MARKER_FRAG = /* glsl */`
#include <logdepthbuf_pars_fragment>
varying vec3 vColor;
varying float vAlpha;
void main(){
  #include <logdepthbuf_fragment>
  if (vAlpha < 0.01) discard;
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  float a = (exp(-r2 * 3.0) - 0.05) * vAlpha;
  gl_FragColor = vec4(vColor, a);
}
`;

// ---------------------------------------------------------------- solar glare
export const GLARE_VERT = /* glsl */`
uniform vec3 uCenterV;
uniform float uSizeWorld;
uniform float uMinPx;
uniform vec2 uViewport;
uniform float uFovScale;
varying vec2 vUv;
varying float vDiscFrac;
void main(){
  vec4 clip = projectionMatrix * vec4(uCenterV, 1.0);
  float pxPerWorld = uViewport.y / (uFovScale * max(-uCenterV.z, 1e-3));
  float sizePx = max(uSizeWorld * pxPerWorld, uMinPx);
  vDiscFrac = (uSizeWorld / 2.6) * pxPerWorld / sizePx;
  vec2 off = position.xy * sizePx / uViewport * 2.0 * clip.w;
  gl_Position = vec4(clip.xy + off, clip.w * 0.0, clip.w);
  vUv = position.xy;
}
`;

export const GLARE_FRAG = /* glsl */`
uniform float uIntensity;
uniform float uTime;
varying vec2 vUv;
varying float vDiscFrac;
void main(){
  float r = length(vUv);
  if (r > 1.0) discard;
  float ang = atan(vUv.y, vUv.x);
  float nearSun = smoothstep(0.03, 0.15, vDiscFrac);
  float rd = max(r - vDiscFrac, 0.0) / max(1.0 - vDiscFrac, 1e-3);
  float corona = exp(-rd * 9.0) * 0.7 + exp(-rd * 3.2) * 0.16;
  float rays = 0.5 + 0.5 * sin(ang * 23.0 + sin(ang * 7.0) * 2.0 + uTime * 0.02);
  corona *= 0.8 + 0.4 * rays * exp(-rd * 2.5);
  float spikes = (pow(abs(cos(ang * 2.0 + 0.4)), 260.0) + pow(abs(cos(ang * 3.0 + 1.1)), 500.0) * 0.5) * exp(-rd * 4.0) * (1.0 - nearSun);
  float halo = exp(-r * r * 14.0) * 0.5 * (1.0 - nearSun);
  float core = smoothstep(0.07, 0.0, r) * (1.0 - nearSun);
  vec3 col = vec3(1.0, 0.8, 0.55) * corona * mix(1.0, 0.75, nearSun) + vec3(1.0, 0.95, 0.88) * (spikes * 0.8 + core * 3.0 + halo);
  col *= uIntensity * smoothstep(1.0, 0.75, r);
  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------------------------------------------------------------- warp streaks
export const STREAK_VERT = /* glsl */`
attribute float aEnd;
uniform float uPhase;
uniform float uLen;
uniform float uDepth;
varying float vFade;
void main(){
  vec3 p = position;
  float z = mod(p.z + uPhase, uDepth) - uDepth * 0.5;
  z += aEnd * uLen;
  vec4 mv = modelViewMatrix * vec4(p.x, p.y, z, 1.0);
  vFade = (1.0 - aEnd) * smoothstep(uDepth * 0.5, uDepth * 0.2, abs(z));
  gl_Position = projectionMatrix * mv;
}
`;

export const STREAK_FRAG = /* glsl */`
uniform float uOpacity;
varying float vFade;
void main(){
  gl_FragColor = vec4(vec3(0.75, 0.86, 1.0) * vFade * uOpacity, 1.0);
}
`;
