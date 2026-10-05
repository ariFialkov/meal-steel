// Truck model library. Every src/assets/trucks/<id>.glb is picked up at build time, loaded on demand,
// cached as a template, and cloned per truck (geometry, materials and textures are shared between clones). Each model
// is rigged once on load: its wheels are split into their own meshes (see rig.js).
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { rigTruck } from './rig.js';
import { TRUCK_PARTS } from './truckfx.js';

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
  if (templates.has(id)) return Promise.resolve(templates.get(id).scene);
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
      let rig = null;
      try { rig = rigTruck(scene, TRUCK_PARTS[id]); } catch (err) { console.warn(`truck model ${id}: no wheel rig`, err); }
      if (rig) for (const m of [rig.body, ...rig.wheels.map((w) => w.mesh), ...Object.values(rig.parts).map((p) => p.mesh)]) { m.userData.shared = true; m.receiveShadow = true; }
      templates.set(id, { scene, rig });
      for (const fn of listeners) fn(id);
      return scene;
    }).catch((err) => { console.warn(`truck model ${id} failed to load`, err); pending.delete(id); return null; }));
  }
  return pending.get(id);
}

export const loadTruckModels = (ids) => Promise.all(ids.map(loadTruckModel));

/**
 * A fresh clone of a loaded model as { body, wheels: [{ pivot, front, r }], parts: { name: pivot } } (wheels and parts
 * empty when the model could not be rigged), or null if it is not loaded (yet).
 */
export function getTruckModel(id) {
  const t = templates.get(id);
  if (!t) return null;
  if (!t.rig) return { body: t.scene.clone(true), wheels: [], parts: {} };
  const parts = {}; for (const [k, p] of Object.entries(t.rig.parts)) parts[k] = p.pivot.clone(true);
  return { body: t.rig.body.clone(), wheels: t.rig.wheels.map((w) => ({ pivot: w.pivot.clone(true), front: w.front, r: w.r })), parts };
}

/** Called with a truck id whenever a model finishes loading. Returns an unsubscribe function. */
export function onTruckModelLoaded(fn) { listeners.add(fn); return () => listeners.delete(fn); }
