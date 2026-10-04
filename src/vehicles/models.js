// Truck model library. Every src/assets/trucks/<id>.glb is picked up at build time, loaded on demand,
// cached as a template, and cloned per truck (geometry, materials and textures are shared between clones).
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const URLS = {};
for (const [path, url] of Object.entries(import.meta.glob('../assets/trucks/*.glb', { query: '?url', import: 'default', eager: true }))) {
  URLS[path.split('/').pop().replace(/\.glb$/, '')] = url;
}
const loader = new GLTFLoader();
const templates = new Map(), pending = new Map(), listeners = new Set();

export const hasTruckModel = (id) => id in URLS;
export const truckModelIds = () => Object.keys(URLS);

/** Resolves with the template scene, or null if the truck has no model or it failed to load. */
export function loadTruckModel(id) {
  if (!URLS[id]) return Promise.resolve(null);
  if (templates.has(id)) return Promise.resolve(templates.get(id));
  if (!pending.has(id)) {
    pending.set(id, loader.loadAsync(URLS[id]).then((gltf) => {
      const scene = gltf.scene;
      scene.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true; o.receiveShadow = true;
        o.userData.shared = true; // owned by the library: Game.dispose must not free it
        const m = o.material;
        m.envMapIntensity = 0.9;
        for (const t of [m.map, m.normalMap, m.metalnessMap, m.roughnessMap]) if (t) t.anisotropy = 4;
      });
      templates.set(id, scene);
      for (const fn of listeners) fn(id);
      return scene;
    }).catch((err) => { console.warn(`truck model ${id} failed to load`, err); pending.delete(id); return null; }));
  }
  return pending.get(id);
}

export const loadTruckModels = (ids) => Promise.all(ids.map(loadTruckModel));

/** A fresh clone of a loaded model, or null if it is not loaded (yet). */
export function getTruckModel(id) { const t = templates.get(id); return t ? t.clone(true) : null; }

/** Called with a truck id whenever a model finishes loading. Returns an unsubscribe function. */
export function onTruckModelLoaded(fn) { listeners.add(fn); return () => listeners.delete(fn); }
