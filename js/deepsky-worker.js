// Background thread that builds the deep-sky models and bakes them into volume textures.
import { handleJob } from './deepsky-bake.js';

self.onmessage = (e) => {
  try {
    const { result, transfer } = handleJob(e.data);
    self.postMessage(result, transfer);
  } catch (err) {
    self.postMessage({ type: 'error', id: e.data.id, quality: e.data.quality, message: String(err && err.stack || err) });
  }
};
