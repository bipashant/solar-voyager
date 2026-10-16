// Texture loading with a 2k first pass and on-demand high-resolution upgrades.
import * as THREE from 'three';
import { textureCap } from './platform.js';

const BASE = 'assets/textures/';
const LINEAR = new Set(['earth_spec_2k', 'earth_normal_2k']);

export class TextureStore {
  constructor(renderer, manager) {
    this.loader = new THREE.TextureLoader(manager);
    this.cache = new Map();
    // mobile devices stop at 4k to stay within their memory (see platform.js)
    this.maxSize = Math.min(renderer.capabilities.maxTextureSize, textureCap);
    this.aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const data = new Uint8Array([128, 128, 128, 255]);
    this.placeholder = new THREE.DataTexture(data, 1, 1);
    this.placeholder.needsUpdate = true;
  }

  // Width in pixels implied by the file name suffix.
  static widthOf(name) {
    const m = name.match(/_(\d)k$/);
    return m ? Number(m[1]) * 1024 : 2048;
  }

  supports(name) {
    return TextureStore.widthOf(name) <= this.maxSize;
  }

  // The sharpest of several sizes this device can take, or null.
  best(names) {
    return names.filter((n) => this.supports(n)).sort((a, b) => TextureStore.widthOf(b) - TextureStore.widthOf(a))[0] || null;
  }

  load(name) {
    if (this.cache.has(name)) return this.cache.get(name);
    const p = new Promise((resolve, reject) => {
      this.loader.load(`${BASE}${name}.jpg`, (tex) => {
        tex.colorSpace = LINEAR.has(name) ? THREE.NoColorSpace : THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.anisotropy = this.aniso;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = true;
        resolve(tex);
      }, undefined, (err) => reject(err));
    });
    this.cache.set(name, p);
    return p;
  }
}
