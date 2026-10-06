// Convert truck models from GLB into the game's web-native model format (see model-writer.mjs).
//
//   node scripts/export-models.mjs <file.glb ...>
//
// Each <id>.glb becomes src/models/<id>.js plus public/models/<id>_{base,normal,mr}.jpg.
import { statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { writeTruckModel } from './model-writer.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = process.argv.slice(2);
if (!files.length) { console.error('usage: node scripts/export-models.mjs <file.glb ...>'); process.exit(1); }
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const f of files) {
  const id = basename(f, '.glb'), { js, images } = await writeTruckModel(await io.read(f), id, ROOT);
  const kb = (p) => statSync(p).size / 1024;
  console.log(`${id.padEnd(14)} mesh ${kb(js).toFixed(0).padStart(4)} KB  textures ${images.reduce((s, p) => s + kb(p), 0).toFixed(0).padStart(4)} KB`);
}
