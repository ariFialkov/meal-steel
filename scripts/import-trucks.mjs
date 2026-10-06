// Import Meshy-style truck exports (FBX + PBR PNGs) into compact game-ready FBX files (textures embedded).
//
//   node scripts/import-trucks.mjs <sourceDir> [--only <truckId>]
//
// <sourceDir> holds one folder per truck, named after the truck ("burrito bandito", "chief beef", ...).
// Each folder needs *_texture.fbx, *_texture.png, *_texture_normal.png, *_texture_roughness.png and
// *_texture_metallic.png. Output goes to public/models/<id>.fbx, which the game picks up automatically.
//
// The model is rotated by the yaw in scripts/truck-models.json so its front faces +Z, scaled to the
// game's truck footprint, centred, and dropped onto y = 0. The mesh is welded and quantized (via a glTF document),
// textures resized, roughness (G) and metallic (B) packed into one map, then written as FBX by fbx-writer.mjs.
import { readFileSync, readdirSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import sharp from 'sharp';
import { Document } from '@gltf-transform/core';
import { EXTTextureWebP } from '@gltf-transform/extensions';
import { weld, quantize, prune, dedup } from '@gltf-transform/functions';
import { TRUCKS } from '../src/data/trucks.js';
import { docToFbx } from './fbx-writer.mjs';

// FBXLoader decodes embedded textures with browser APIs. We only need its geometry, so stub them.
globalThis.window = globalThis.window || { URL: { createObjectURL: () => '' } };
THREE.TextureLoader.prototype.load = function () { return new THREE.Texture(); };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public/models');
const config = JSON.parse(readFileSync(join(ROOT, 'scripts/truck-models.json'), 'utf8'));
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function findTruck(folder) {
  const n = norm(folder);
  return TRUCKS.find((t) => norm(t.name) === n || norm(t.id) === n) || null;
}
function findFile(dir, suffix) {
  const f = readdirSync(dir).find((x) => x.toLowerCase().endsWith(suffix));
  if (!f) throw new Error(`missing *${suffix} in ${dir}`);
  return join(dir, f);
}

function loadGeometry(fbxPath) {
  const buf = readFileSync(fbxPath);
  const root = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  root.updateMatrixWorld(true);
  const geos = [];
  root.traverse((o) => { if (o.isMesh) { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); geos.push(g); } });
  if (geos.length !== 1) throw new Error(`expected 1 mesh, found ${geos.length}`);
  return geos[0];
}

function normalize(geo, opts) {
  geo.rotateY((opts.yaw * Math.PI) / 180);
  geo.computeBoundingBox();
  let b = geo.boundingBox;
  const len = b.max.z - b.min.z, wid = b.max.x - b.min.x;
  const s = Math.min(opts.length / len, opts.maxWidth / wid);
  geo.scale(s, s, s);
  geo.computeBoundingBox(); b = geo.boundingBox;
  geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  geo.computeBoundingBox();
  return geo;
}

async function webp(path, size, quality, extra = (x) => x) {
  return extra(sharp(path).resize(size, size)).webp({ quality }).toBuffer();
}
async function packMR(roughPath, metalPath, size) {
  const r = await sharp(roughPath).resize(size, size).greyscale().raw().toBuffer();
  const m = await sharp(metalPath).resize(size, size).greyscale().raw().toBuffer();
  const px = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i++) { px[i * 3] = 255; px[i * 3 + 1] = r[i]; px[i * 3 + 2] = m[i]; }
  return sharp(px, { raw: { width: size, height: size, channels: 3 } }).webp({ quality: 90 }).toBuffer();
}

async function importTruck(dir, truck) {
  const opts = { ...config.defaults, ...(config.trucks[truck.id] || {}) };
  const geo = normalize(loadGeometry(findFile(dir, '_texture.fbx')), opts);
  const pos = geo.attributes.position.array, nrm = geo.attributes.normal.array, uv = new Float32Array(geo.attributes.uv.array);
  for (let i = 1; i < uv.length; i += 2) uv[i] = 1 - uv[i]; // three.js (flipY) UVs -> glTF (top-left origin)

  const doc = new Document();
  doc.createExtension(EXTTextureWebP).setRequired(true);
  const buffer = doc.createBuffer();
  const acc = (arr, type) => doc.createAccessor().setArray(arr).setType(type).setBuffer(buffer);
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', acc(new Float32Array(pos), 'VEC3'))
    .setAttribute('NORMAL', acc(new Float32Array(nrm), 'VEC3'))
    .setAttribute('TEXCOORD_0', acc(uv, 'VEC2'));
  const tex = async (name, data) => doc.createTexture(name).setImage(data).setMimeType('image/webp');
  const mat = doc.createMaterial(truck.id)
    .setBaseColorTexture(await tex('base', await webp(findFile(dir, '_texture.png'), opts.baseSize, 82)))
    .setNormalTexture(await tex('normal', await webp(findFile(dir, '_texture_normal.png'), opts.normalSize, 90)))
    .setMetallicRoughnessTexture(await tex('mr', await packMR(findFile(dir, '_texture_roughness.png'), findFile(dir, '_texture_metallic.png'), opts.mrSize)))
    .setMetallicFactor(1).setRoughnessFactor(1);
  prim.setMaterial(mat);
  const mesh = doc.createMesh(truck.id).addPrimitive(prim);
  doc.createScene().addChild(doc.createNode(truck.id).setMesh(mesh));
  await doc.transform(weld(), dedup(), prune(), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 14 }));

  mkdirSync(OUT, { recursive: true });
  const out = join(OUT, `${truck.id}.fbx`);
  writeFileSync(out, await docToFbx(doc, truck.id));
  const b = geo.boundingBox;
  console.log(`${truck.id.padEnd(14)} ${(statSync(out).size / 1024).toFixed(0).padStart(5)} KB  tris ${pos.length / 9}  size ${(b.max.x - b.min.x).toFixed(2)} x ${(b.max.y).toFixed(2)} x ${(b.max.z - b.min.z).toFixed(2)} (w x h x l)`);
}

const args = process.argv.slice(2);
const src = args[0];
if (!src) { console.error('usage: node scripts/import-trucks.mjs <sourceDir> [--only <truckId>]'); process.exit(1); }
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
for (const folder of readdirSync(src)) {
  const dir = join(src, folder);
  if (!statSync(dir).isDirectory() || folder.startsWith('__')) continue;
  const truck = findTruck(folder);
  if (!truck) { console.warn(`skip "${folder}": no truck with that name`); continue; }
  if (only && truck.id !== only) continue;
  await importTruck(dir, truck);
}
