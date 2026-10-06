// Truck model library. Every truck with a src/models/<id>.js mesh (and its textures in public/models) is picked up at
// build time, loaded on demand, cached as a template, and cloned per truck (geometry, materials and textures are
// shared between clones). Each model is rigged once on load: its wheels are split into their own meshes (see rig.js).
// The format (scripts/model-writer.mjs) is plain web files, a JS module and JPEGs, for hosts that accept no 3D model
// formats; it rebuilds exactly the mesh and PBR material GLTFLoader made from the original glTF models.
import * as THREE from 'three';
import { rigTruck } from './rig.js';
import { TRUCK_PARTS } from './truckfx.js';

const MESHES = {};
for (const [path, load] of Object.entries(import.meta.glob('../models/*.js'))) MESHES[path.split('/').pop().replace(/\.js$/, '')] = load;
const texLoader = new THREE.TextureLoader();

const bytes = (b64) => { const s = atob(b64), a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a.buffer; };
/** decode a quantized mesh module into a float geometry */
function geometryOf(m) {
  const qP = new Uint16Array(bytes(m.position)), qN = new Int16Array(bytes(m.normal)), qU = new Uint16Array(bytes(m.uv));
  const P = new Float32Array(qP.length), N = new Float32Array(qN.length), U = new Float32Array(qU.length), b = m.box, ub = m.uvBox;
  for (let i = 0; i < P.length; i++) { const k = i % 3; P[i] = b[k] + (qP[i] / 65535) * (b[k + 3] - b[k]); N[i] = qN[i] / 32767; }
  for (let i = 0; i < U.length; i++) { const k = i % 2; U[i] = ub[k] + (qU[i] / 65535) * (ub[k + 2] - ub[k]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  g.setIndex(new THREE.BufferAttribute(m.index === 'u16' ? new Uint16Array(bytes(m.indices)) : new Uint32Array(bytes(m.indices)), 1));
  g.computeBoundingSphere();
  return g;
}
/** the truck's PBR material, set up as GLTFLoader would: glTF UVs (no flipY), derivative tangents (normalScale.y -1) */
function materialOf(id, maps) {
  const tex = (key, srgb) => {
    if (!maps.includes(key)) return null;
    const t = texLoader.load(`${import.meta.env.BASE_URL}models/${id}_${key}.jpg`);
    t.flipY = false; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t;
  };
  const mr = tex('mr', false);
  return new THREE.MeshStandardMaterial({ name: id, map: tex('base', true), normalMap: tex('normal', false), normalScale: new THREE.Vector2(1, -1),
    roughnessMap: mr, metalnessMap: mr, roughness: 1, metalness: mr ? 1 : 0 });
}
async function loadModel(id) {
  const m = (await MESHES[id]()).default, scene = new THREE.Group();
  scene.add(new THREE.Mesh(geometryOf(m), materialOf(id, m.maps)));
  return scene;
}

const templates = new Map(), pending = new Map(), listeners = new Set();

export const hasTruckModel = (id) => id in MESHES;
export const truckModelIds = () => Object.keys(MESHES);

/** Resolves with the template scene, or null if the truck has no model or it failed to load. */
export function loadTruckModel(id) {
  if (!MESHES[id]) return Promise.resolve(null);
  if (templates.has(id)) return Promise.resolve(templates.get(id).scene);
  if (!pending.has(id)) {
    pending.set(id, loadModel(id).then((scene) => {
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
