#!/usr/bin/env node
/* Shadow Fiend Arena asset pipeline. No npm dependencies (Node 18+, macOS `sips` for images).

   node tools/assets.mjs

   Reads   models/shadow-fiend-game.glb and models/props/game-ready/*.glb
   Writes  models/optimized/*.glb, game/hero-data.js, game/props-data.js

   Per model: textures resized and re-encoded as JPEG, vertex data quantised (KHR_mesh_quantization:
   int16 positions, int8 normals, uint16 UVs), plus simplified variants made with a quadric
   edge-collapse simplifier: a low-poly backdrop tree and a low-poly hero shadow caster. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MODELS = path.join(ROOT, 'models'), OUT = path.join(MODELS, 'optimized'), GAME = path.join(ROOT, 'game');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sfa-assets-'));

// ------------------------------------------------------------------ GLB read / write
function readGLB(file) {
  const b = fs.readFileSync(file);
  const jsonLen = b.readUInt32LE(12), json = JSON.parse(b.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8, bin = b.subarray(binStart, binStart + b.readUInt32LE(20 + jsonLen));
  return { json, bin };
}
const COMP = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] };
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function accessor({ json, bin }, i) { // -> Float32Array / Uint32Array, de-strided, de-normalised
  const a = json.accessors[i], bv = json.bufferViews[a.bufferView], [T, bytes] = COMP[a.componentType], n = SIZE[a.type];
  const stride = bv.byteStride || bytes * n, base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const out = a.componentType === 5126 || a.normalized ? new Float32Array(a.count * n) : new Uint32Array(a.count * n);
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const get = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType];
  const norm = a.normalized ? { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[a.componentType] : 1;
  for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) {
    let v = dv[get](base + k * stride + c * bytes, true);
    if (a.normalized) v = Math.max(v / norm, -1);
    out[k * n + c] = v;
  }
  return out;
}
function imageBytes({ json, bin }, texIndex) {
  const img = json.images[json.textures[texIndex].source], bv = json.bufferViews[img.bufferView];
  return { bytes: bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength), mime: img.mimeType };
}
function loadMesh(file) { // first primitive of first mesh, with node transform baked in
  const g = readGLB(file), j = g.json, prim = j.meshes[0].primitives[0];
  const node = j.nodes.find(n => n.mesh === 0) || {};
  if (node.matrix || node.rotation || node.scale || node.translation) throw new Error(`${file}: node transforms are not supported`);
  const mat = j.materials[prim.material || 0], pbr = mat.pbrMetallicRoughness || {};
  return {
    pos: accessor(g, prim.attributes.POSITION), nrm: prim.attributes.NORMAL !== undefined ? accessor(g, prim.attributes.NORMAL) : null,
    uv: prim.attributes.TEXCOORD_0 !== undefined ? accessor(g, prim.attributes.TEXCOORD_0) : null, idx: accessor(g, prim.indices),
    color: pbr.baseColorTexture ? imageBytes(g, pbr.baseColorTexture.index) : null,
    mr: pbr.metallicRoughnessTexture ? imageBytes(g, pbr.metallicRoughnessTexture.index) : null,
    material: mat,
  };
}

// writes a GLB with one quantised primitive. images: [{bytes, mime}] referenced by the material
function writeGLB(file, mesh, { material, images = [] }) {
  const parts = [], views = [], accessors = [];
  let off = 0;
  const pushView = (buf, target) => { while (off % 4) { parts.push(Buffer.alloc(1)); off++; } views.push({ buffer: 0, byteOffset: off, byteLength: buf.length, ...(target ? { target } : {}) }); parts.push(buf); off += buf.length; return views.length - 1; };
  const n = mesh.pos.length / 3;
  // positions: int16 normalised, scale 1 (must fit in [-1, 1]; the hero shader reads raw model coordinates)
  let maxAbs = 0; for (const v of mesh.pos) maxAbs = Math.max(maxAbs, Math.abs(v));
  const attrs = {}, VEC = (k, type, ct, count, min, max, normalized) => { accessors.push({ bufferView: k, componentType: ct, count, type, ...(normalized ? { normalized: true } : {}), ...(min ? { min, max } : {}) }); return accessors.length - 1; };
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], mesh.pos[i * 3 + c]); mx[c] = Math.max(mx[c], mesh.pos[i * 3 + c]); }
  if (maxAbs <= 1) { // 8-byte stride: x, y, z, pad
    const b = Buffer.alloc(n * 8);
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) b.writeInt16LE(Math.round(mesh.pos[i * 3 + c] * 32767), i * 8 + c * 2);
    const q = v => Math.round(v * 32767); // bounds of a normalised accessor are stored as raw integers
    const k = pushView(b, 34962); views[k].byteStride = 8;
    attrs.POSITION = VEC(k, 'VEC3', 5122, n, mn.map(q), mx.map(q), true);
  } else {
    const b = Buffer.from(new Float32Array(mesh.pos).buffer);
    attrs.POSITION = VEC(pushView(b, 34962), 'VEC3', 5126, n, mn, mx);
  }
  if (mesh.nrm) { // int8 normalised, 4-byte stride
    const b = Buffer.alloc(n * 4);
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) b.writeInt8(Math.round(Math.max(-1, Math.min(1, mesh.nrm[i * 3 + c])) * 127), i * 4 + c);
    const k = pushView(b, 34962); views[k].byteStride = 4;
    attrs.NORMAL = VEC(k, 'VEC3', 5120, n, null, null, true);
  }
  if (mesh.uv) {
    let inUnit = true; for (const v of mesh.uv) if (v < 0 || v > 1) { inUnit = false; break; }
    if (inUnit) { const b = Buffer.alloc(n * 4); for (let i = 0; i < n * 2; i++) b.writeUInt16LE(Math.round(mesh.uv[i] * 65535), i * 2); attrs.TEXCOORD_0 = VEC(pushView(b, 34962), 'VEC2', 5123, n, null, null, true); }
    else attrs.TEXCOORD_0 = VEC(pushView(Buffer.from(new Float32Array(mesh.uv).buffer), 34962), 'VEC2', 5126, n);
  }
  const big = n > 65535, ib = big ? Buffer.from(new Uint32Array(mesh.idx).buffer) : Buffer.from(new Uint16Array(mesh.idx).buffer);
  const indices = VEC(pushView(ib, 34963), 'SCALAR', big ? 5125 : 5123, mesh.idx.length);
  const imageDefs = images.map(im => ({ bufferView: pushView(Buffer.from(im.bytes)), mimeType: im.mime }));
  while (off % 4) { parts.push(Buffer.alloc(1)); off++; }
  const json = {
    asset: { version: '2.0', generator: 'sfa tools/assets.mjs' },
    extensionsUsed: ['KHR_mesh_quantization'], extensionsRequired: ['KHR_mesh_quantization'],
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: attrs, indices, material: 0 }] }],
    materials: [material],
    ...(images.length ? { images: imageDefs, textures: images.map((_, i) => ({ source: i, sampler: 0 })), samplers: [{ magFilter: 9729, minFilter: 9987 }] } : {}),
    accessors, bufferViews: views, buffers: [{ byteLength: off }],
  };
  let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
  const bin = Buffer.concat(parts), head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546C67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const ch = (len, type) => { const c = Buffer.alloc(8); c.writeUInt32LE(len, 0); c.writeUInt32LE(type, 4); return c; };
  const glb = Buffer.concat([head, ch(js.length, 0x4E4F534A), js, ch(bin.length, 0x004E4942), bin]);
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, glb);
  return glb;
}

// ------------------------------------------------------------------ images (macOS sips)
function jpeg({ bytes }, size, quality) {
  const src = path.join(TMP, 'in.img'), dst = path.join(TMP, 'out.jpg');
  fs.writeFileSync(src, bytes);
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality), '-Z', String(size), src, '--out', dst], { stdio: 'ignore' });
  return { bytes: fs.readFileSync(dst), mime: 'image/jpeg' };
}

// ------------------------------------------------------------------ quadric edge-collapse simplifier
// Vertices are welded by position first. Each collapse moves one endpoint onto the other (no new
// positions), so every surviving vertex keeps its original UV and normal.
function simplify(mesh, targetTris) {
  const P = mesh.pos, nIn = P.length / 3, key = new Map(), weld = new Uint32Array(nIn), rep = [];
  for (let i = 0; i < nIn; i++) {
    const k = `${Math.round(P[i * 3] * 1e5)},${Math.round(P[i * 3 + 1] * 1e5)},${Math.round(P[i * 3 + 2] * 1e5)}`;
    let w = key.get(k); if (w === undefined) { w = rep.length; key.set(k, w); rep.push(i); } weld[i] = w;
  }
  const nv = rep.length, X = new Float64Array(nv * 3);
  rep.forEach((i, w) => { X[w * 3] = P[i * 3]; X[w * 3 + 1] = P[i * 3 + 1]; X[w * 3 + 2] = P[i * 3 + 2]; });
  let faces = [];
  for (let t = 0; t < mesh.idx.length; t += 3) { const a = weld[mesh.idx[t]], b = weld[mesh.idx[t + 1]], c = weld[mesh.idx[t + 2]]; if (a !== b && b !== c && a !== c) faces.push([a, b, c]); }
  const alive = new Uint8Array(faces.length).fill(1), vf = Array.from({ length: nv }, () => new Set());
  faces.forEach((f, i) => f.forEach(v => vf[v].add(i)));
  const Q = new Float64Array(nv * 10);
  const addPlane = (v, a, b, c, d, w) => { const q = [a * a, a * b, a * c, a * d, b * b, b * c, b * d, c * c, c * d, d * d]; for (let k = 0; k < 10; k++) Q[v * 10 + k] += q[k] * w; };
  const normal = f => {
    const [a, b, c] = f, ux = X[b * 3] - X[a * 3], uy = X[b * 3 + 1] - X[a * 3 + 1], uz = X[b * 3 + 2] - X[a * 3 + 2];
    const vx = X[c * 3] - X[a * 3], vy = X[c * 3 + 1] - X[a * 3 + 1], vz = X[c * 3 + 2] - X[a * 3 + 2];
    return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  };
  faces.forEach(f => {
    let [nx, ny, nz] = normal(f); const l = Math.hypot(nx, ny, nz); if (l < 1e-12) return;
    const area = l / 2; nx /= l; ny /= l; nz /= l; const d = -(nx * X[f[0] * 3] + ny * X[f[0] * 3 + 1] + nz * X[f[0] * 3 + 2]);
    for (const v of f) addPlane(v, nx, ny, nz, d, area);
  });
  // keep open borders in place: a steep plane through each border edge, perpendicular to its face
  const edgeCount = new Map(), ek = (a, b) => a < b ? a * nv + b : b * nv + a;
  faces.forEach(f => { for (let e = 0; e < 3; e++) { const k = ek(f[e], f[(e + 1) % 3]); edgeCount.set(k, (edgeCount.get(k) || 0) + 1); } });
  faces.forEach(f => {
    const fn = normal(f);
    for (let e = 0; e < 3; e++) {
      const a = f[e], b = f[(e + 1) % 3]; if (edgeCount.get(ek(a, b)) !== 1) continue;
      const ex = X[b * 3] - X[a * 3], ey = X[b * 3 + 1] - X[a * 3 + 1], ez = X[b * 3 + 2] - X[a * 3 + 2];
      let px = ey * fn[2] - ez * fn[1], py = ez * fn[0] - ex * fn[2], pz = ex * fn[1] - ey * fn[0]; const l = Math.hypot(px, py, pz); if (l < 1e-12) continue;
      px /= l; py /= l; pz /= l; const d = -(px * X[a * 3] + py * X[a * 3 + 1] + pz * X[a * 3 + 2]), w = Math.hypot(ex, ey, ez) * 10;
      addPlane(a, px, py, pz, d, w); addPlane(b, px, py, pz, d, w);
    }
  });
  const err = (q, v) => { const x = X[v * 3], y = X[v * 3 + 1], z = X[v * 3 + 2];
    return Q[q] * x * x + 2 * Q[q + 1] * x * y + 2 * Q[q + 2] * x * z + 2 * Q[q + 3] * x + Q[q + 4] * y * y + 2 * Q[q + 5] * y * z + 2 * Q[q + 6] * y + Q[q + 7] * z * z + 2 * Q[q + 8] * z + Q[q + 9]; };
  const ver = new Uint32Array(nv), heap = [];
  const push = (cost, u, v) => { heap.push([cost, u, v, ver[u], ver[v]]); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const qsum = new Float64Array(10);
  const edgeCost = (u, v) => { // cost of moving u onto v
    for (let k = 0; k < 10; k++) qsum[k] = Q[u * 10 + k] + Q[v * 10 + k];
    const x = X[v * 3], y = X[v * 3 + 1], z = X[v * 3 + 2], q = qsum;
    return q[0] * x * x + 2 * q[1] * x * y + 2 * q[2] * x * z + 2 * q[3] * x + q[4] * y * y + 2 * q[5] * y * z + 2 * q[6] * y + q[7] * z * z + 2 * q[8] * z + q[9];
  };
  const pushEdge = (a, b) => { push(edgeCost(a, b), a, b); push(edgeCost(b, a), b, a); };
  const seen = new Set();
  faces.forEach(f => { for (let e = 0; e < 3; e++) { const a = f[e], b = f[(e + 1) % 3], k = ek(a, b); if (!seen.has(k)) { seen.add(k); pushEdge(a, b); } } });
  let live = faces.length;
  while (live > targetTris && heap.length) {
    const [, u, v, vu, vv] = pop();
    if (ver[u] !== vu || ver[v] !== vv || !vf[u].size || !vf[v].size) continue;
    // reject collapses that flip a face or make a sliver
    let bad = false;
    for (const fi of vf[u]) {
      const f = faces[fi]; if (f.includes(v)) continue;
      const before = normal(f), g = f.map(x => x === u ? v : x), after = normal(g);
      const lb = Math.hypot(...before), la = Math.hypot(...after);
      if (la < 1e-12 || (before[0] * after[0] + before[1] * after[1] + before[2] * after[2]) < 0.3 * lb * la) { bad = true; break; }
    }
    if (bad) continue;
    for (const fi of [...vf[u]]) {
      const f = faces[fi];
      if (f.includes(v)) { alive[fi] = 0; live--; for (const x of f) vf[x].delete(fi); continue; }
      for (let k = 0; k < 3; k++) if (f[k] === u) f[k] = v;
      vf[v].add(fi);
    }
    vf[u].clear();
    for (let k = 0; k < 10; k++) Q[v * 10 + k] += Q[u * 10 + k];
    ver[u]++; ver[v]++;
    const nb = new Set(); for (const fi of vf[v]) for (const x of faces[fi]) if (x !== v) nb.add(x);
    for (const x of nb) { ver[x]++; }
    for (const x of nb) pushEdge(v, x);
  }
  // compact: each surviving welded vertex keeps the attributes of its representative original vertex
  faces = faces.filter((_, i) => alive[i]);
  const remap = new Int32Array(nv).fill(-1), pos = [], uv = [], idx = [];
  for (const f of faces) for (const w of f) {
    if (remap[w] < 0) { remap[w] = pos.length / 3; const i = rep[w]; pos.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); if (mesh.uv) uv.push(mesh.uv[i * 2], mesh.uv[i * 2 + 1]); }
    idx.push(remap[w]);
  }
  const out = { pos: new Float32Array(pos), uv: mesh.uv ? new Float32Array(uv) : null, idx: new Uint32Array(idx) };
  out.nrm = smoothNormals(out);
  return out;
}
function smoothNormals({ pos, idx }) {
  const n = new Float32Array(pos.length);
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { n[v * 3] += nx; n[v * 3 + 1] += ny; n[v * 3 + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
  return n;
}

// ------------------------------------------------------------------ build
const pbr = (colorTex, mrTex) => ({ name: 'Baked', doubleSided: true, pbrMetallicRoughness: {
  ...(colorTex !== undefined ? { baseColorTexture: { index: colorTex } } : {}), ...(mrTex !== undefined ? { metallicRoughnessTexture: { index: mrTex } } : {}) } });
const report = [];
function emit(name, mesh, opts) {
  const glb = writeGLB(path.join(OUT, name + '.glb'), mesh, opts);
  report.push(`${name.padEnd(14)} ${String(mesh.idx.length / 3).padStart(6)} tris  ${(glb.length / 1024).toFixed(0).padStart(5)} KB`);
  return glb.toString('base64');
}
function full(m, texSize, mrSize, q) {
  const images = [jpeg(m.color, texSize, q)]; if (m.mr) images.push(jpeg(m.mr, mrSize, q));
  return { images, material: pbr(0, m.mr ? 1 : undefined) };
}

// hero: 1024 colour, small metal/rough map; plus a ~2.5k-triangle shadow caster (geometry only)
const hero = loadMesh(path.join(MODELS, 'shadow-fiend-game.glb'));
const heroB64 = emit('hero', hero, full(hero, 1024, 256, 82));
const heroShadowB64 = emit('hero-shadow', { ...simplify(hero, 2500), uv: null }, { material: pbr() });
fs.writeFileSync(path.join(GAME, 'hero-data.js'), `window.HERO_GLB_B64="${heroB64}";\nwindow.HERO_SHADOW_GLB_B64="${heroShadowB64}";\n`);

// props: 1024 colour for the big decor pieces, 512 for the rest; the dead tree also gets a backdrop LOD
const PROPS = { obelisk: ['obelisk', 1024], gargoyle: ['gargoyle', 1024], column: ['column', 512], tree: ['dead-tree', 512], ice: ['ice-crystal', 1024] };
const props = {};
for (const [key, [file, size]] of Object.entries(PROPS)) {
  const m = loadMesh(path.join(MODELS, 'props', 'game-ready', file + '.glb'));
  props[key] = emit(key, m, full(m, size, 128, 80));
  if (key === 'tree') props.treeFar = emit('treeFar', simplify(m, 700), { images: [jpeg(m.color, 256, 75)], material: pbr(0) });
}
fs.writeFileSync(path.join(GAME, 'props-data.js'), 'window.SFA_PROPS=' + JSON.stringify(props) + ';\n');

// announcer: source WAVs in audio/announcer -> 48 kbps AAC (.m4a), which every current browser decodes
const VOICE = path.join(ROOT, 'audio', 'announcer'), voices = {};
for (const f of fs.readdirSync(VOICE).filter(f => f.endsWith('.wav')).sort()) {
  const dst = path.join(TMP, 'v.m4a');
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '48000', path.join(VOICE, f), dst], { stdio: 'ignore' });
  voices[f.replace('.wav', '')] = fs.readFileSync(dst).toString('base64');
}
fs.writeFileSync(path.join(GAME, 'announcer-data.js'), '/* Announcer voice: "Announcer kill sounds" by TripleSnail, recorded by Antti Saari, edited by TripleSnail. CC-BY 3.0 https://opengameart.org/content/announcer-kill-sounds */\nwindow.SFA_ANNOUNCER=' + JSON.stringify(voices) + ';\n');
fs.rmSync(TMP, { recursive: true, force: true });
console.log(report.join('\n'));
for (const f of ['hero-data.js', 'props-data.js', 'announcer-data.js']) console.log(`${f}: ${(fs.statSync(path.join(GAME, f)).size / 1e6).toFixed(2)} MB`);
