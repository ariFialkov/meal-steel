// Convert truck models from GLB to FBX (textures embedded as JPEG), for hosts that don't accept .glb files.
//
//   node scripts/glb-to-fbx.mjs [file.glb ...]      (default: every public/models/*.glb)
//
// Writes <name>.fbx next to each .glb; delete the .glb afterwards (the game loads public/models/*.fbx).
import { readdirSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { docToFbx } from './fbx-writer.mjs';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '../public/models');
const files = process.argv.length > 2 ? process.argv.slice(2) : readdirSync(DIR).filter((f) => f.endsWith('.glb')).map((f) => join(DIR, f));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const f of files) {
  const name = basename(f, '.glb'), out = join(dirname(f), `${name}.fbx`);
  writeFileSync(out, await docToFbx(await io.read(f), name));
  console.log(`${name.padEnd(14)} ${(statSync(f).size / 1024).toFixed(0).padStart(5)} KB glb -> ${(statSync(out).size / 1024).toFixed(0).padStart(5)} KB fbx`);
}
