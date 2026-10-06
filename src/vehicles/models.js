// Truck model library. Every public/models/<id>.fbx is picked up at build time (vite.config.js), loaded on demand,
// cached as a template, and cloned per truck (geometry, materials and textures are shared between clones). Each model
// is rigged once on load: its wheels are split into their own meshes (see rig.js).
// The FBX files come from scripts/fbx-writer.mjs: one mesh with base colour, normal and metallic-roughness maps
// embedded; FBXLoader hands them over on a Phong material, which is swapped for the PBR material they were made for.
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { rigTruck } from './rig.js';
import { TRUCK_PARTS } from './truckfx.js';

// models/<id>.fbx next to index.html (copied from public/ as is)
const URLS = {};
for (const id of __TRUCK_MODELS__) URLS[id] = `${import.meta.env.BASE_URL}models/${id}.fbx`;
const loader = new FBXLoader();

/** the truck's PBR material from FBXLoader's Phong one (the metallic-roughness map rides in the specular slot) */
function pbrMaterial(phong) {
  const mr = phong.specularMap;
  if (mr) mr.colorSpace = THREE.NoColorSpace; // data, not colour (FBXLoader tags the specular slot sRGB)
  return new THREE.MeshStandardMaterial({ name: phong.name, map: phong.map, normalMap: phong.normalMap, roughnessMap: mr, metalnessMap: mr, roughness: 1, metalness: mr ? 1 : 0 });
}
const templates = new Map(), pending = new Map(), listeners = new Set();

export const hasTruckModel = (id) => id in URLS;
export const truckModelIds = () => Object.keys(URLS);

/** Resolves with the template scene, or null if the truck has no model or it failed to load. */
export function loadTruckModel(id) {
  if (!URLS[id]) return Promise.resolve(null);
  if (templates.has(id)) return Promise.resolve(templates.get(id).scene);
  if (!pending.has(id)) {
    pending.set(id, loader.loadAsync(URLS[id]).then((scene) => {
      scene.traverse((o) => {
        if (!o.isMesh) return;
        const old = o.material; o.material = pbrMaterial(old); old.dispose();
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
