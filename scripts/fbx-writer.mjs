// Writes a game truck (a glTF-Transform document: one textured mesh) as a binary FBX 7.4 file with its textures
// embedded, for hosts that don't accept .glb. Read back by three's FBXLoader (src/vehicles/models.js).
//
// What goes in:
//  - one Mesh model with the node transforms baked into the vertices (so the model sits at the identity),
//    per-vertex normals and UVs (V flipped: FBX uses the OpenGL convention, glTF the image one), triangles;
//  - a Phong material wired to three embedded JPEG textures: base colour (DiffuseColor), normal map (NormalMap) and
//    the glTF metallic-roughness map (roughness in G, metalness in B) on the SpecularColor slot, which FBXLoader
//    reads as a specularMap. models.js turns that back into a MeshStandardMaterial's roughness and metalness maps.
// Arrays are zlib-compressed, as the FBX SDK does.
import { deflateSync } from 'node:zlib';
import sharp from 'sharp';

const VERSION = 7400;
let nextId = 1000000;
const uid = () => nextId++;

// ------------------------------------------------------------------ binary encoding
// a property: { t: type code, v: value }
const I = (v) => ({ t: 'I', v }), D = (v) => ({ t: 'D', v }), L = (v) => ({ t: 'L', v }), S = (v) => ({ t: 'S', v }), C = (v) => ({ t: 'C', v });
const R = (v) => ({ t: 'R', v }), Di = (v) => ({ t: 'd', v }), Ii = (v) => ({ t: 'i', v });
const node = (name, props = [], children = []) => ({ name, props, children });
const P = (name, type, type2, flags, ...values) => node('P', [S(name), S(type), S(type2), S(flags), ...values]);
/** "name\0\1Class": how binary FBX stores object names */
const objName = (name, cls) => `${name}\u0000\u0001${cls}`;

function encProp({ t, v }) {
  switch (t) {
    case 'I': { const b = Buffer.alloc(5); b.write('I'); b.writeInt32LE(v, 1); return b; }
    case 'D': { const b = Buffer.alloc(9); b.write('D'); b.writeDoubleLE(v, 1); return b; }
    case 'L': { const b = Buffer.alloc(9); b.write('L'); b.writeBigInt64LE(BigInt(v), 1); return b; }
    case 'C': return Buffer.from([0x43, v ? 1 : 0]);
    case 'S': case 'R': {
      const data = t === 'S' ? Buffer.from(v, 'utf8') : Buffer.from(v);
      const h = Buffer.alloc(5); h.write(t); h.writeUInt32LE(data.length, 1); return Buffer.concat([h, data]);
    }
    case 'd': case 'i': {
      const raw = t === 'd' ? Buffer.from(Float64Array.from(v).buffer) : Buffer.from(Int32Array.from(v).buffer);
      const z = deflateSync(raw);
      const h = Buffer.alloc(13); h.write(t); h.writeUInt32LE(v.length, 1); h.writeUInt32LE(1, 5); h.writeUInt32LE(z.length, 9);
      return Buffer.concat([h, z]);
    }
    default: throw new Error('fbx: unknown property type ' + t);
  }
}
const NULL_RECORD = Buffer.alloc(13);
/** a node record at absolute file offset `at`; children are followed by a null record */
function encNode(n, at) {
  const name = Buffer.from(n.name, 'ascii'), props = Buffer.concat(n.props.map(encProp));
  let pos = at + 13 + name.length + props.length;
  const kids = [];
  for (const c of n.children) { const b = encNode(c, pos); kids.push(b); pos += b.length; }
  if (n.children.length) { kids.push(NULL_RECORD); pos += 13; }
  const h = Buffer.alloc(13); h.writeUInt32LE(pos, 0); h.writeUInt32LE(n.props.length, 4); h.writeUInt32LE(props.length, 8); h.writeUInt8(name.length, 12);
  return Buffer.concat([h, name, props, ...kids]);
}
function encFile(nodes) {
  const head = Buffer.alloc(27); head.write('Kaydara FBX Binary  \u0000', 0, 'latin1'); head[21] = 0x1a; head[22] = 0x00; head.writeUInt32LE(VERSION, 23);
  const parts = [head]; let pos = 27;
  for (const n of nodes) { const b = encNode(n, pos); parts.push(b); pos += b.length; }
  parts.push(NULL_RECORD); pos += 13;
  // footer, as the FBX SDK (and Blender) write it
  const foot = [Buffer.from('fabcab09d0c8d466b176fb831cf7267e', 'hex'), Buffer.alloc(4)]; pos += 20;
  let pad = ((pos + 15) & ~15) - pos; if (pad === 0) pad = 16;
  const ver = Buffer.alloc(4); ver.writeUInt32LE(VERSION, 0);
  foot.push(Buffer.alloc(pad), ver, Buffer.alloc(120), Buffer.from('f85a8c6adef5d97eece90ce3758f290b', 'hex'));
  return Buffer.concat([...parts, ...foot]);
}

// ------------------------------------------------------------------ the scene
const jpeg = (img, q, linear) => sharp(Buffer.from(img)).jpeg({ quality: q, chromaSubsampling: linear ? '4:4:4' : '4:2:0', mozjpeg: true }).toBuffer();

/**
 * @param doc a glTF-Transform Document holding one mesh primitive (POSITION, NORMAL, TEXCOORD_0, indices) with a
 *            metallic-roughness material
 * @param name the truck id (used for object and texture names)
 * @returns the .fbx file contents
 */
export async function docToFbx(doc, name) {
  const root = doc.getRoot();
  const meshNode = root.listNodes().find((n) => n.getMesh());
  if (!meshNode) throw new Error(`${name}: no mesh`);
  const prim = meshNode.getMesh().listPrimitives()[0];
  const M = meshNode.getWorldMatrix(); // column-major
  const pos = prim.getAttribute('POSITION'), nor = prim.getAttribute('NORMAL'), uv = prim.getAttribute('TEXCOORD_0'), idx = prim.getIndices();
  const n = pos.getCount(), V = new Array(n * 3), N = new Array(n * 3), U = new Array(n * 2), e = [0, 0, 0];
  // normals go through the inverse transpose; these models only carry translation and uniform scale, so normalising is enough
  for (let i = 0; i < n; i++) {
    pos.getElement(i, e);
    V[i * 3] = M[0] * e[0] + M[4] * e[1] + M[8] * e[2] + M[12];
    V[i * 3 + 1] = M[1] * e[0] + M[5] * e[1] + M[9] * e[2] + M[13];
    V[i * 3 + 2] = M[2] * e[0] + M[6] * e[1] + M[10] * e[2] + M[14];
    nor.getElement(i, e);
    const x = M[0] * e[0] + M[4] * e[1] + M[8] * e[2], y = M[1] * e[0] + M[5] * e[1] + M[9] * e[2], z = M[2] * e[0] + M[6] * e[1] + M[10] * e[2], l = Math.hypot(x, y, z) || 1;
    N[i * 3] = x / l; N[i * 3 + 1] = y / l; N[i * 3 + 2] = z / l;
    uv.getElement(i, e); U[i * 2] = e[0]; U[i * 2 + 1] = 1 - e[1];
  }
  const tri = idx ? Array.from(idx.getArray()) : Array.from({ length: n }, (_, i) => i);
  const PVI = new Array(tri.length);
  for (let t = 0; t < tri.length; t += 3) { PVI[t] = tri[t]; PVI[t + 1] = tri[t + 1]; PVI[t + 2] = ~tri[t + 2]; } // last corner of each polygon is stored as -(i + 1)

  const mat = prim.getMaterial();
  const maps = [
    ['DiffuseColor', 'base', mat.getBaseColorTexture(), 88, false],
    ['NormalMap', 'normal', mat.getNormalTexture(), 92, true],
    ['SpecularColor', 'mr', mat.getMetallicRoughnessTexture(), 90, true],
  ].filter((m) => m[2]);

  const geoId = uid(), modelId = uid(), matId = uid();
  const objects = [
    node('Geometry', [L(geoId), S(objName(name, 'Geometry')), S('Mesh')], [
      node('Vertices', [Di(V)]),
      node('PolygonVertexIndex', [Ii(PVI)]),
      node('GeometryVersion', [I(124)]),
      node('LayerElementNormal', [I(0)], [node('Version', [I(101)]), node('Name', [S('')]), node('MappingInformationType', [S('ByVertice')]), node('ReferenceInformationType', [S('Direct')]), node('Normals', [Di(N)])]),
      node('LayerElementUV', [I(0)], [node('Version', [I(101)]), node('Name', [S('map1')]), node('MappingInformationType', [S('ByVertice')]), node('ReferenceInformationType', [S('Direct')]), node('UV', [Di(U)])]),
      node('LayerElementMaterial', [I(0)], [node('Version', [I(101)]), node('Name', [S('')]), node('MappingInformationType', [S('AllSame')]), node('ReferenceInformationType', [S('IndexToDirect')]), node('Materials', [Ii([0])])]),
      node('Layer', [I(0)], [node('Version', [I(100)]),
        ...['LayerElementNormal', 'LayerElementUV', 'LayerElementMaterial'].map((t) => node('LayerElement', [], [node('Type', [S(t)]), node('TypedIndex', [I(0)])]))]),
    ]),
    node('Model', [L(modelId), S(objName(name, 'Model')), S('Mesh')], [
      node('Version', [I(232)]),
      node('Properties70', [], [P('DefaultAttributeIndex', 'int', 'Integer', '', I(0))]),
      node('Shading', [C(true)]), node('Culling', [S('CullingOff')]),
    ]),
    node('Material', [L(matId), S(objName(name, 'Material')), S('')], [
      node('Version', [I(102)]), node('ShadingModel', [S('phong')]), node('MultiLayer', [I(0)]),
      node('Properties70', [], [P('DiffuseColor', 'Color', '', 'A', D(1), D(1), D(1)), P('Shininess', 'double', 'Number', '', D(20))]),
    ]),
  ];
  const conns = [
    node('C', [S('OO'), L(modelId), L(0)]),
    node('C', [S('OO'), L(geoId), L(modelId)]),
    node('C', [S('OO'), L(matId), L(modelId)]),
  ];
  for (const [slot, key, tex, q, linear] of maps) {
    const texId = uid(), vidId = uid(), file = `${name}_${key}.jpg`, data = await jpeg(tex.getImage(), q, linear);
    objects.push(
      node('Video', [L(vidId), S(objName(file, 'Video')), S('Clip')], [
        node('Type', [S('Clip')]),
        node('Properties70', [], [P('Path', 'KString', 'XRefUrl', '', S(file))]),
        node('UseMipMap', [I(0)]), node('Filename', [S(file)]), node('RelativeFilename', [S(file)]), node('Content', [R(data)]),
      ]),
      node('Texture', [L(texId), S(objName(file, 'Texture')), S('')], [
        node('Type', [S('TextureVideoClip')]), node('Version', [I(202)]), node('TextureName', [S(objName(file, 'Texture'))]),
        node('Media', [S(objName(file, 'Video'))]), node('FileName', [S(file)]), node('RelativeFilename', [S(file)]),
        node('ModelUVTranslation', [D(0), D(0)]), node('ModelUVScaling', [D(1), D(1)]), node('Texture_Alpha_Source', [S('None')]), node('Cropping', [I(0), I(0), I(0), I(0)]),
      ]),
    );
    conns.push(node('C', [S('OP'), L(texId), L(matId), S(slot)]), node('C', [S('OO'), L(vidId), L(texId)]));
  }

  return encFile([
    node('FBXHeaderExtension', [], [node('FBXHeaderVersion', [I(1003)]), node('FBXVersion', [I(VERSION)]), node('Creator', [S('Meal Steel truck exporter')])]),
    node('GlobalSettings', [], [node('Version', [I(1000)]), node('Properties70', [], [
      P('UpAxis', 'int', 'Integer', '', I(1)), P('UpAxisSign', 'int', 'Integer', '', I(1)),
      P('FrontAxis', 'int', 'Integer', '', I(2)), P('FrontAxisSign', 'int', 'Integer', '', I(1)),
      P('CoordAxis', 'int', 'Integer', '', I(0)), P('CoordAxisSign', 'int', 'Integer', '', I(1)),
      P('UnitScaleFactor', 'double', 'Number', '', D(100)), // metres
    ])]),
    node('Objects', [], objects),
    node('Connections', [], conns),
  ]);
}
