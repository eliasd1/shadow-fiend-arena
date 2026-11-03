/* Shadow Fiend Arena — a modern take on the classic WC3 "Shadow Fiend Wars" raze duel.
   Plain browser JavaScript + Three.js (r147). Open play.html to play. */
(() => {
'use strict';

// ------------------------------------------------------------------ config
const CFG = {
  hp: 700, regen: 4, speed: 3.05, turnRate: 9.5,
  castTime: 0.34, razeR: 2.25, razeDist: [2.0, 4.5, 7.0], razeCd: 2.6,
  baseDmg: 170, soulDmg: 9, maxSouls: 30,
  respawn: 3, spawnProt: 1.3, unitR: 0.45, step: 1 / 60,
  runeEvery: 30, firstRune: 8,
};
const DIFF = {
  easy:   { react: 0.42, dodge: 0.30, lead: 0.4, aimErr: 1.2, cast: 0.24, rune: 0.3 },
  normal: { react: 0.26, dodge: 0.58, lead: 0.85, aimErr: 0.6, cast: 0.13, rune: 0.6 },
  hard:   { react: 0.14, dodge: 0.85, lead: 1.0, aimErr: 0.25, cast: 0.08, rune: 0.9 },
};
const COLORS = ['#ff3b2f', '#3b8bff', '#3bff6a', '#ffd23b', '#c04bff', '#3bfff0', '#ff8a2f', '#ff4fb0'];
const NAMES = ['Nevermore', 'Dreadhorn', 'Ashclaw', 'Soulrender', 'Cinder', 'Gloomreaper', 'Hollowmaw'];
const STREAKS = { 3: ['is on a KILLING SPREE!', 'killingspree'], 4: ['is DOMINATING!', 'dominating'], 5: ['has a MEGA KILL!', 'megakill'],
  6: ['is causing MAYHEM!', 'mayhem'], 7: ['is OWNING!', 'ownage'], 8: ['is causing CARNAGE!', 'carnage'], 9: ['is GODLIKE!', 'godlike'], 10: ['is BEYOND GODLIKE! Someone kill him!', 'godlike'] };
const MULTI = { 2: ['DOUBLE KILL', 'doublekill'], 3: ['TRIPLE KILL', 'triplekill'], 4: ['MASSACRE', 'massacre'], 5: ['RAMPAGE', 'rampage'] };
const RUNES = {
  haste: { name: 'Haste', color: 0xff3a2a, css: '#ff5a3a', dur: 8 },
  dd:    { name: 'Double Damage', color: 0x3a7aff, css: '#5a9aff', dur: 10 },
  regen: { name: 'Regeneration', color: 0x3aff6a, css: '#5aff8a', dur: 6 },
};

const $ = id => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const wrap = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// particles to spawn this frame for a per-second rate, so effects look the same at 60, 144 or 240 Hz
let fxDensity = 1;
const emitN = (rate, dt) => { const n = rate * dt * fxDensity; return (n | 0) + (Math.random() < n % 1 ? 1 : 0); };

// ------------------------------------------------------------------ maps
// Arena = rounded rectangle (hx, hz, corner r). Hazards are capsules (segment + radius).
// Obstacles block movement (razes still hit through them, like the original).
function mirror(list) { return list.concat(list.map(o => Object.assign({}, o, { x: -o.x, z: -o.z, rot: (o.rot || 0) + Math.PI }))); }
const MAPS = {
  molten: {
    name: 'Scourge Pit', theme: 'molten', sight: 15, hx: 22, hz: 18, r: 6, edge: 'lava', edgeDps: 160,
    sky: 0x070203, fog: [0x170504, 0.015], hemi: [0x5a4a5a, 0x2a0603, 0.55], sun: [0xffb898, 1.25], exposure: 0.95,
    hazards: [
      { type: 'lava', a: [-30, 0], b: [-13.9, 0], r: 1.5 }, { type: 'lava', a: [-10.1, 0], b: [-1.9, 0], r: 1.5 },
      { type: 'lava', a: [1.9, 0], b: [10.1, 0], r: 1.5 }, { type: 'lava', a: [13.9, 0], b: [30, 0], r: 1.5 },
    ],
    bridges: [[-12, 0], [0, 0], [12, 0]],
    obstacles: mirror([
      { prop: 'obelisk', x: -7, z: -8, r: 1.0, h: 5.5 }, { prop: 'obelisk', x: 7, z: -8, r: 1.0, h: 4.8 },
      { prop: 'obelisk', x: -17, z: -9, r: 1.0, h: 5.0 },
    ]),
    decor: mirror([
      { prop: 'gargoyle', x: -26, z: -12, h: 4.5, rot: 0.6 }, { prop: 'gargoyle', x: 26, z: -12, h: 4.5, rot: -0.6 },
      { prop: 'obelisk', x: 0, z: -23, h: 9 }, { prop: 'obelisk', x: -14, z: -22.5, h: 7 }, { prop: 'obelisk', x: 14, z: -22.5, h: 7 },
    ]),
    runes: [[-12, 0], [12, 0]],
  },
  river: {
    name: 'Ancient River', theme: 'river', sight: 12.5, hx: 23, hz: 18, r: 5, edge: 'wall',
    sky: 0x05080d, fog: [0x0a1220, 0.016], hemi: [0x5a6a9a, 0x161208, 0.9], sun: [0xa8bcff, 1.35], exposure: 1.3,
    hazards: [{ type: 'water', a: [-30, -16.2], b: [30, 16.2], r: 2.7 }],
    obstacles: mirror([
      { prop: 'tree', x: -14, z: 8, r: 0.8, h: 4.6 }, { prop: 'tree', x: -12.4, z: 9.8, r: 0.8, h: 4.2 }, { prop: 'tree', x: -15.8, z: 10.2, r: 0.8, h: 5.0 },
      { prop: 'tree', x: -4, z: 13, r: 0.8, h: 4.4 }, { prop: 'tree', x: -2.4, z: 14.6, r: 0.8, h: 4.8 }, { prop: 'tree', x: -20, z: 1.5, r: 0.8, h: 4.5 },
      { prop: 'column', x: -8, z: 3, r: 1.0, h: 3.6 }, { prop: 'column', x: -16, z: -3, r: 1.0, h: 3.2 }, { prop: 'column', x: 6, z: 11, r: 1.0, h: 3.8 },
    ]),
    decor: mirror([
      { prop: 'gargoyle', x: -27, z: -17, h: 4.2, rot: 0.8 }, { prop: 'gargoyle', x: 27, z: 17.5, h: 4.2, rot: -2.4 },
      { prop: 'column', x: -25.5, z: 6, h: 4.5 }, { prop: 'column', x: -10, z: 21.5, h: 3.8 },
    ]),
    outsideTrees: true,
    runes: [[-10, -5.4], [10, 5.4]],
  },
  frozen: {
    name: 'Frozen Throne', theme: 'frozen', sight: 16, hx: 20, hz: 20, r: 20, edge: 'abyss', edgeDps: 600,
    sky: 0x0b1018, fog: [0x1a2635, 0.017], hemi: [0x7080a8, 0x141a26, 0.6], sun: [0xcfe2ff, 1.15], exposure: 0.8,
    hazards: [], ice: [{ x: 0, z: 0, r: 7.2 }],
    obstacles: [0, 1, 2, 3, 4, 5].map(k => { const a = k * Math.PI / 3 + Math.PI / 6; return { prop: 'ice', x: Math.cos(a) * 12, z: Math.sin(a) * 12, r: 1.25, h: 3.4, rot: a }; }),
    decor: [
      { prop: 'ice', x: 0, z: -27, h: 14 }, { prop: 'ice', x: -9, z: -25, h: 8, rot: 1 }, { prop: 'ice', x: 9, z: -25, h: 8, rot: 2 },
      { prop: 'gargoyle', x: -22, z: 12, h: 4, rot: 2.2 }, { prop: 'gargoyle', x: 22, z: 12, h: 4, rot: -2.2 },
    ],
    runes: [[-16, 0], [16, 0]],
  },
};
let MAP = MAPS.molten;

function sdArena(x, z, m = MAP) {
  const qx = Math.abs(x) - (m.hx - m.r), qz = Math.abs(z) - (m.hz - m.r);
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - m.r;
}
function segDist(px, pz, a, b) {
  const vx = b[0] - a[0], vz = b[1] - a[1], wx = px - a[0], wz = pz - a[1];
  const t = Math.max(0, Math.min(1, (wx * vx + wz * vz) / (vx * vx + vz * vz)));
  return Math.hypot(wx - vx * t, wz - vz * t);
}
function hazardAt(x, z) {
  for (const h of MAP.hazards) if (segDist(x, z, h.a, h.b) < h.r) return h;
  return null;
}
function onIce(x, z) { return (MAP.ice || []).some(c => Math.hypot(x - c.x, z - c.z) < c.r); }

// ------------------------------------------------------------------ renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
// no shadow map: prop shadows are baked into the ground, heroes cast projected shadows (see paintShadows, heroShadowMat)
renderer.shadowMap.enabled = false;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x160504, 0.016);
const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 260);
let zoom = 1;

// Quality ladder used by the automatic resolution system. Slow frames step down one rung at a time
// (hero shadows, then effect density, then pixel density); smooth frames step back up.
// Pixel-density changes reallocate the canvas, so they are rate-limited.
const LADDER = [
  { shadows: true, fx: 1, dpr: 1 },
  { shadows: false, fx: 1, dpr: 1 },
  { shadows: false, fx: 0.6, dpr: 1 },
  { shadows: false, fx: 0.6, dpr: 0.85 },
  { shadows: false, fx: 0.45, dpr: 0.7 },
  { shadows: false, fx: 0.35, dpr: 0.55 },
];
let baseDpr = 1.5, rung = 0, minRung = 0, autoQuality = true, heroShadows = true;
function applyRung() {
  const L = LADDER[rung];
  heroShadows = L.shadows; fxDensity = L.fx;
  const pr = baseDpr * L.dpr;
  if (Math.abs(renderer.getPixelRatio() - pr) > 1e-3) { renderer.setPixelRatio(pr); resize(); }
}
function setQuality(q) {
  baseDpr = Math.min(devicePixelRatio, q === 'low' ? 1 : 1.5);
  rung = minRung = q === 'low' ? 1 : 0; autoQuality = true;
  applyRung(); resize();
}
let perfAcc = 0, perfN = 0, perfGood = 0, lastDprChange = 0;
function adaptResolution(dt) {
  if (!autoQuality) return;
  perfAcc += dt; perfN++;
  if (perfAcc < 1) return;
  const avg = perfAcc / perfN, now = performance.now(); perfAcc = 0; perfN = 0;
  const changesDpr = r => LADDER[r].dpr !== LADDER[rung].dpr;
  if (avg > 1 / 50 && rung < LADDER.length - 1) {
    if (changesDpr(rung + 1) && now - lastDprChange < 2500) return;
    rung++; perfGood = 0; if (changesDpr(rung - 1)) lastDprChange = now; applyRung();
  } else if (avg < 1 / 58) {
    // climb back slowly, and never into a rung that was just too slow
    if (++perfGood >= 5 && rung > minRung && !(changesDpr(rung - 1) && now - lastDprChange < 4000)) {
      rung--; perfGood = 0; if (changesDpr(rung + 1)) lastDprChange = now; applyRung();
    }
  } else perfGood = 0;
}
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  const s = renderer.getPixelRatio() * innerHeight * 0.75;
  particles.mat.uniforms.uScale.value = s; smoke.mat.uniforms.uScale.value = s;
}
addEventListener('resize', resize);

const hemi = new THREE.HemisphereLight(0x5a4a5a, 0x2a0603, 0.55); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffb898, 1.25);
sun.position.set(12, 30, 9);
scene.add(sun);
const glowLight = new THREE.PointLight(0xff3a08, 0.8, 70, 1.5); glowLight.position.set(0, -2, 0); scene.add(glowLight);

// ------------------------------------------------------------------ fog of war
const FOW_N = 96;
const fowData = new Uint8Array(FOW_N * FOW_N * 4).fill(255);
const fowTex = new THREE.DataTexture(fowData, FOW_N, FOW_N, THREE.RGBAFormat);
fowTex.magFilter = fowTex.minFilter = THREE.LinearFilter; fowTex.generateMipmaps = false; fowTex.needsUpdate = true;
const FOW_U = { fowTex: { value: fowTex }, fowRect: { value: new THREE.Vector4(-30, -30, 60, 60) } };
const fowCur = new Float32Array(FOW_N * FOW_N).fill(1);
const FOW_GLSL = 'uniform sampler2D fowTex; uniform vec4 fowRect; float fowAt(vec2 p){ return texture2D(fowTex, (p - fowRect.xy) / fowRect.zw).r; }\n';
const FOW_DARK = '0.27';
THREE.ShaderChunk.common += '\n#ifdef USE_FOW\nvarying vec2 vFowW;\n' + FOW_GLSL + '#endif\n';
THREE.ShaderChunk.project_vertex += '\n#ifdef USE_FOW\n{ vec4 fp = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nfp = instanceMatrix * fp;\n#endif\nvFowW = (modelMatrix * fp).xz; }\n#endif\n';
THREE.ShaderChunk.fog_fragment = '#ifdef USE_FOW\ngl_FragColor.rgb *= mix(' + FOW_DARK + ', 1.0, fowAt(vFowW));\n#endif\n' + THREE.ShaderChunk.fog_fragment;
function fowMat(mat) {
  if (!mat || mat.isShaderMaterial || mat.isPointsMaterial || mat.userData.fow) return;
  mat.userData.fow = true;
  mat.defines = Object.assign({}, mat.defines, { USE_FOW: '' });
  const prev = mat.onBeforeCompile, pk = mat.customProgramCacheKey;
  mat.onBeforeCompile = function (sh, r) { prev.call(this, sh, r); sh.uniforms.fowTex = FOW_U.fowTex; sh.uniforms.fowRect = FOW_U.fowRect; };
  mat.customProgramCacheKey = function () { return pk.call(this) + '|fow'; };
  mat.needsUpdate = true;
}
function fowAll(root) { root.traverse(o => { if (o.material && !o.isPoints) [].concat(o.material).forEach(fowMat); }); }
let fogOn = true, fowT = 0;
const fowCanvas = document.createElement('canvas'); fowCanvas.width = fowCanvas.height = FOW_N;
const fowCtx = fowCanvas.getContext('2d'), fowImg = fowCtx.createImageData(FOW_N, FOW_N);
function sight() { return MAP.sight || 14; }
function losClear(ax, az, bx, bz) { // obstacles (trees, pillars) block line of sight
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-6;
  for (const o of MAP.obstacles) {
    const ox = o.x - ax, oz = o.z - az, t = (ox * dx + oz * dz) / L2;
    if (t <= 0 || t >= 1) continue;
    const px = ox - dx * t, pz = oz - dz * t;
    if (px * px + pz * pz < o.r * o.r * 0.85 && Math.hypot(bx - o.x, bz - o.z) > o.r) return false;
  }
  return true;
}
function canSee(a, x, z) { return !fogOn || (Math.hypot(x - a.pos.x, z - a.pos.z) < sight() && losClear(a.pos.x, a.pos.z, x, z)); }
function updateFog(dt) {
  fowT -= dt; if (fowT > 0) return; fowT = 1 / 15;
  const r = FOW_U.fowRect.value, cs = r.z / FOW_N, R = sight(), c = player && fogOn ? player.pos : null, D = fowImg.data;
  for (let iz = 0; iz < FOW_N; iz++) for (let ix = 0; ix < FOW_N; ix++) {
    const i = iz * FOW_N + ix; let v = 1;
    if (c) {
      const x = r.x + (ix + 0.5) * cs, z = r.y + (iz + 0.5) * cs, d = Math.hypot(x - c.x, z - c.z);
      v = d > R ? 0 : losClear(c.x, c.z, x, z) ? Math.min(1, (R - d) / 1.6) : 0;
    }
    fowCur[i] += (v - fowCur[i]) * 0.45;
    const b = fowCur[i] * 255 | 0, i4 = i * 4; fowData[i4] = fowData[i4 + 1] = fowData[i4 + 2] = b;
    D[i4 + 3] = (1 - fowCur[i]) * 165 | 0;
  }
  fowTex.needsUpdate = true; fowCtx.putImageData(fowImg, 0, 0);
}

// ------------------------------------------------------------------ texture helpers
function canvasTex(size, draw, srgb, w) {
  const c = document.createElement('canvas'); c.width = w || size; c.height = size;
  draw(c.getContext('2d'), c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 8; return t;
}
function crackPath(g, x, y, len, ang, w, step = 9) {
  g.beginPath(); g.moveTo(x, y);
  for (let i = 0; i < len; i++) { ang += rnd(-0.6, 0.6); x += Math.cos(ang) * step; y += Math.sin(ang) * step; g.lineTo(x, y); }
  g.lineWidth = w; g.stroke();
}
const scorchTex = canvasTex(256, (g) => {
  const gr = g.createRadialGradient(128, 128, 10, 128, 128, 126);
  gr.addColorStop(0, 'rgba(0,0,0,0.95)'); gr.addColorStop(0.6, 'rgba(10,2,0,0.8)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
});
const ringTex = canvasTex(256, (g) => {
  const gr = g.createRadialGradient(128, 128, 60, 128, 128, 126);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.8, 'rgba(255,255,255,0.06)');
  gr.addColorStop(0.92, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
});
const crackTex = canvasTex(512, (g) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = '#ff6a20'; g.shadowColor = '#ff2a00'; g.shadowBlur = 12; g.lineCap = 'round';
  for (let i = 0; i < 11; i++) { const a = i / 11 * Math.PI * 2 + rnd(-0.2, 0.2); crackPath(g, 256, 256, 22, a, rnd(2, 5), 10); }
  const gr = g.createRadialGradient(256, 256, 0, 256, 256, 120); gr.addColorStop(0, 'rgba(255,120,40,0.9)'); gr.addColorStop(1, 'rgba(255,60,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
});

// ------------------------------------------------------------------ shaders
const NOISE_GLSL = `
  float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
  float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p*=2.03;a*=.5;}return v;}`;
const WORLD_VS = 'varying vec3 vW; varying vec2 vUv; void main(){ vUv=uv; vec4 w = modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }';
const timeU = { value: 0 };
const lavaMat = new THREE.ShaderMaterial({
  uniforms: { t: timeU, ...FOW_U }, vertexShader: WORLD_VS,
  fragmentShader: `uniform float t; varying vec3 vW; ${NOISE_GLSL} ${FOW_GLSL}
    void main(){ vec2 p=vW.xz*0.13; float q=fbm(p*1.6-vec2(t*0.04,t*0.03));
      float v=fbm(p+vec2(t*0.025,-t*0.02)+q*1.4);
      vec3 hot=mix(vec3(1.0,0.55,0.12),vec3(0.55,0.05,0.0),smoothstep(0.2,0.45,v));
      vec3 col=mix(hot*1.15,vec3(0.035,0.015,0.012),smoothstep(0.38,0.58,v));
      float d=length(vW.xz); col*=exp(-max(d-32.,0.)*0.035);
      gl_FragColor=vec4(col*mix(0.27,1.,fowAt(vW.xz)),1.); }`,
});
const waterMat = new THREE.ShaderMaterial({
  uniforms: { t: timeU, ...FOW_U }, vertexShader: WORLD_VS, transparent: true,
  fragmentShader: `uniform float t; varying vec3 vW; ${NOISE_GLSL} ${FOW_GLSL}
    void main(){ vec2 p=vW.xz*0.35; float a=fbm(p+vec2(t*0.25,t*0.12)); float b=fbm(p*1.7-vec2(t*0.18,-t*0.1));
      float r=pow(smoothstep(0.55,0.8,a*b*2.0),2.0);
      vec3 col=mix(vec3(0.02,0.06,0.09),vec3(0.05,0.14,0.2),a)+vec3(0.5,0.65,0.9)*r*0.5;
      gl_FragColor=vec4(col*mix(0.27,1.,fowAt(vW.xz)),0.9); }`,
});
const iceMat = new THREE.ShaderMaterial({
  uniforms: { t: timeU, ...FOW_U }, vertexShader: WORLD_VS,
  fragmentShader: `uniform float t; varying vec3 vW; ${NOISE_GLSL} ${FOW_GLSL}
    void main(){ vec2 p=vW.xz*0.3; float a=fbm(p*1.3); float c=1.0-smoothstep(0.0,0.03,abs(fbm(p*2.2)-0.5));
      float glint=pow(n(vW.xz*6.0+t*0.2),30.0);
      vec3 col=mix(vec3(0.12,0.22,0.32),vec3(0.35,0.52,0.66),a)+vec3(0.6,0.8,1.0)*c*0.35+glint*0.8;
      gl_FragColor=vec4(col*0.75*mix(0.27,1.,fowAt(vW.xz)),1.); }`,
});
const voidMat = new THREE.ShaderMaterial({
  uniforms: { t: timeU, ...FOW_U }, vertexShader: WORLD_VS,
  fragmentShader: `uniform float t; varying vec3 vW; ${NOISE_GLSL} ${FOW_GLSL}
    void main(){ float v=fbm(vW.xz*0.06+vec2(t*0.01,t*0.015)); vec3 col=mix(vec3(0.01,0.015,0.03),vec3(0.06,0.12,0.2),v*v);
      gl_FragColor=vec4(col*mix(0.27,1.,fowAt(vW.xz)),1.); }`,
});
// raze column: noisy shadow-fire, used in two layers (dark smoke + fire)
function columnMat(dark) {
  return new THREE.ShaderMaterial({
    uniforms: { t: timeU, life: { value: 0 }, seed: { value: 0 }, ...FOW_U }, vertexShader: WORLD_VS,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: dark ? THREE.NormalBlending : THREE.AdditiveBlending,
    fragmentShader: `uniform float t, life, seed; varying vec2 vUv; varying vec3 vW; ${NOISE_GLSL} ${FOW_GLSL}
      void main(){ float y=vUv.y; float nn=fbm(vec2(vUv.x*7.0+seed, y*2.5 - t*5.0 - seed));
        float shape=pow(1.0-y, 1.4) * smoothstep(0.0,0.08,y);
        float f=clamp(nn*1.6*shape - life*0.9, 0.0, 1.0); f*=mix(0.2,1.,fowAt(vW.xz));
        ${dark ? 'gl_FragColor=vec4(vec3(0.03,0.0,0.0), f*0.85);' : 'vec3 c=mix(vec3(0.5,0.02,0.0),vec3(1.0,0.45,0.1),f); gl_FragColor=vec4(c*f*2.2, f);'} }`,
  });
}

// ------------------------------------------------------------------ particles (pooled GPU point clouds)
class Particles {
  constructor(max, additive) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 3); this.c1 = new Float32Array(max * 3); this.grav = new Float32Array(max); this.drag = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 }, ...FOW_U },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float uScale; uniform sampler2D fowTex; uniform vec4 fowRect;
        void main(){ vC=color; vA=alpha*mix(0.25,1.,texture2D(fowTex,(position.xz-fowRect.xy)/fowRect.zw).r); vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=size*uScale/-mv.z; gl_Position=projectionMatrix*mv; }`,
      fragmentShader: additive
        ? `varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,.0,d); a*=a; gl_FragColor=vec4(vC, a*vA*0.85); }`
        : `varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,.1,d); gl_FragColor=vec4(vC, a*vA*0.55); }`,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false, transparent: true,
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = additive ? 4 : 3;
    scene.add(this.points);
  }
  spawn(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, grav = 0, drag = 0) {
    if (this.n >= this.max) return;
    const i = this.n++, i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.life[i] = this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1;
    this.c0[i3] = c0[0]; this.c0[i3 + 1] = c0[1]; this.c0[i3 + 2] = c0[2];
    this.c1[i3] = c1[0]; this.c1[i3 + 1] = c1[1]; this.c1[i3 + 2] = c1[2];
    this.grav[i] = grav; this.drag[i] = drag; this.size[i] = s0; this.alpha[i] = 0;
  }
  copy(a, b) {
    const a3 = a * 3, b3 = b * 3, P = this.pos, V = this.vel, C0 = this.c0, C1 = this.c1, C = this.col;
    P[a3] = P[b3]; P[a3 + 1] = P[b3 + 1]; P[a3 + 2] = P[b3 + 2];
    V[a3] = V[b3]; V[a3 + 1] = V[b3 + 1]; V[a3 + 2] = V[b3 + 2];
    C0[a3] = C0[b3]; C0[a3 + 1] = C0[b3 + 1]; C0[a3 + 2] = C0[b3 + 2];
    C1[a3] = C1[b3]; C1[a3 + 1] = C1[b3 + 1]; C1[a3 + 2] = C1[b3 + 2];
    C[a3] = C[b3]; C[a3 + 1] = C[b3 + 1]; C[a3 + 2] = C[b3 + 2];
    this.life[a] = this.life[b]; this.maxLife[a] = this.maxLife[b]; this.s0[a] = this.s0[b]; this.s1[a] = this.s1[b];
    this.grav[a] = this.grav[b]; this.drag[a] = this.drag[b]; this.size[a] = this.size[b]; this.alpha[a] = this.alpha[b];
  }
  clear() { this.n = 0; }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.copy(i, --this.n); i--; continue; }
      const i3 = i * 3, k = 1 - this.life[i] / this.maxLife[i], dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= dr; this.vel[i3 + 2] *= dr; this.vel[i3 + 1] = this.vel[i3 + 1] * dr + this.grav[i] * dt;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      this.alpha[i] = k < 0.1 ? k * 10 : 1 - (k - 0.1) / 0.9;
      for (let c = 0; c < 3; c++) this.col[i3 + c] = this.c0[i3 + c] + (this.c1[i3 + c] - this.c0[i3 + c]) * k;
    }
    this.geo.setDrawRange(0, this.n);
    const at = this.geo.attributes, n = Math.max(this.n, 1);
    at.position.updateRange.count = n * 3; at.color.updateRange.count = n * 3; at.size.updateRange.count = n; at.alpha.updateRange.count = n;
    at.position.needsUpdate = at.color.needsUpdate = at.size.needsUpdate = at.alpha.needsUpdate = true;
  }
}
const particles = new Particles(10000, true);
const smoke = new Particles(2500, false);
const FIRE0 = [0.95, 0.38, 0.1], FIRE1 = [0.35, 0.02, 0.0], EMBER = [1, 0.35, 0.06], SOUL0 = [0.9, 0.3, 0.15];
const SMOKE0 = [0.06, 0.02, 0.02], SMOKE1 = [0.02, 0.02, 0.02];

// pooled effect meshes
const flashLights = [];
for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xff5a1a, 0, 12, 2); l.position.y = 1.5; scene.add(l); flashLights.push({ l, t: 0 }); }
let flashIdx = 0;
const fx = [];
const quadGeo = new THREE.PlaneGeometry(2, 2);
function poolMesh(tex, color, blending) {
  const m = new THREE.Mesh(quadGeo, new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, depthWrite: false, blending, opacity: 0 }));
  m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 2; scene.add(m); return m;
}
const ringPool = Array.from({ length: 24 }, () => poolMesh(ringTex, 0xff7a3a, THREE.AdditiveBlending));
const scorchPool = Array.from({ length: 24 }, () => poolMesh(scorchTex, 0xffffff, THREE.NormalBlending));
const crackPool = Array.from({ length: 12 }, () => poolMesh(crackTex, 0xffffff, THREE.AdditiveBlending));
let ringI = 0, scorchI = 0, crackI = 0;
function addFx(mesh, dur, kind, x, z, s0, s1, op, color) {
  mesh.visible = true; mesh.position.set(x, kind === 'scorch' ? 0.03 : kind === 'crack' ? 0.05 : 0.07, z);
  if (color !== undefined) mesh.material.color.set(color);
  mesh.rotation.z = rnd(0, 6.28);
  const e = fx.find(f => f.mesh === mesh);
  const rec = e || { mesh }; Object.assign(rec, { t: 0, dur, s0, s1, op }); if (!e) fx.push(rec);
}
// raze columns
const colGeo = new THREE.CylinderGeometry(1.15, 0.85, 1, 24, 6, true); colGeo.translate(0, 0.5, 0);
const columns = Array.from({ length: 8 }, () => {
  const g = new THREE.Group(); g.visible = false;
  const dark = new THREE.Mesh(colGeo, columnMat(true)); dark.scale.set(1.12, 1, 1.12); dark.renderOrder = 3;
  const fire = new THREE.Mesh(colGeo, columnMat(false)); fire.renderOrder = 5;
  g.add(dark, fire); scene.add(g); return { g, dark, fire, t: 99 };
});
let colI = 0;
let shake = 0;

function razeFx(x, z, power, dd) {
  const c = columns[colI++ % columns.length]; c.t = 0; c.g.visible = true; c.g.position.set(x, 0, z);
  c.dark.material.uniforms.seed.value = c.fire.material.uniforms.seed.value = rnd(0, 50);
  c.fire.material.uniforms.t = c.dark.material.uniforms.t = timeU;
  c.dd = dd;
  const hot = dd ? [0.5, 0.6, 1] : power > 0.5 ? [1, 0.45, 0.12] : FIRE0;
  const cool = dd ? [0.05, 0.1, 0.5] : FIRE1;
  for (let i = 0; i < 70; i++) {
    const a = rnd(0, 7), r = Math.sqrt(Math.random()) * CFG.razeR * 0.85;
    particles.spawn(x + Math.cos(a) * r, rnd(0, 0.4), z + Math.sin(a) * r, Math.cos(a) * rnd(0, 1.2), rnd(3, 9), Math.sin(a) * rnd(0, 1.2), rnd(0.45, 0.9), rnd(0.9, 1.5), 0.2, hot, cool, 2, 1.5);
  }
  for (let i = 0; i < 36; i++) { const a = rnd(0, 7), s = rnd(5, 11); particles.spawn(x, 0.3, z, Math.cos(a) * s, rnd(1, 6), Math.sin(a) * s, rnd(0.3, 0.6), 0.25, 0.05, [1, 0.7, 0.35], [0.8, 0.15, 0], -14, 2.5); }
  // souls spiralling out of the ground
  for (let i = 0; i < 10; i++) { const a = i / 10 * 6.28, r = CFG.razeR * 0.6; particles.spawn(x + Math.cos(a) * r, 0.5, z + Math.sin(a) * r, -Math.sin(a) * 3, rnd(4, 7), Math.cos(a) * 3, 0.9, 0.7, 0.15, SOUL0, [0.4, 0, 0.1], -1, 1.2); }
  for (let i = 0; i < 26; i++) { const a = rnd(0, 7), r = rnd(0, CFG.razeR); smoke.spawn(x + Math.cos(a) * r, rnd(0.3, 1.5), z + Math.sin(a) * r, Math.cos(a) * 0.8, rnd(1.5, 3.5), Math.sin(a) * 0.8, rnd(1.2, 2.0), rnd(1.4, 2.0), rnd(2.8, 3.8), SMOKE0, SMOKE1, -0.3, 0.8); }
  addFx(ringPool[ringI++ % ringPool.length], 0.38, 'ring', x, z, 0.4, CFG.razeR * 1.15, 0.8, dd ? 0x3a6aff : 0xff3a10);
  addFx(crackPool[crackI++ % crackPool.length], 1.6, 'crack', x, z, CFG.razeR * 1.1, CFG.razeR * 1.15, 1, dd ? 0x6a9aff : 0xffffff);
  addFx(scorchPool[scorchI++ % scorchPool.length], 3.5, 'scorch', x, z, CFG.razeR * 0.95, CFG.razeR * 0.95, 0.85);
  const fl = flashLights[flashIdx++ % flashLights.length]; fl.l.position.set(x, 1.6, z); fl.l.color.set(dd ? 0x4a7aff : 0xff5a1a); fl.t = 0.4;
}
function clickFx(x, z) { addFx(ringPool[ringI++ % ringPool.length], 0.35, 'ring', x, z, 0.6, 0.15, 0.9, 0x3bff6a); }

// ------------------------------------------------------------------ audio (see audio.js)
const AUD = window.SFA_AUDIO;
function sfx(kind, vol = 1, pos) {
  let pan = 0;
  if (pos && player) pan = Math.max(-1, Math.min(1, (pos.x - player.pos.x) / 11));
  AUD.play(kind, { vol, pan });
}

// ------------------------------------------------------------------ model loading
function decodeB64(b64) { const bin = atob(b64), buf = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i); return buf.buffer; }
function parseGLB(b64) {
  return new Promise(res => {
    if (!b64 || !THREE.GLTFLoader) { res(null); return; }
    new THREE.GLTFLoader().parse(decodeB64(b64), '', g => res(g.scene), e => { console.warn(e); res(null); });
  });
}
function fitModel(obj, height) {
  const holder = new THREE.Group();
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3());
  obj.scale.multiplyScalar(height / size.y);
  obj.updateMatrixWorld(true); box.setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.sub(new THREE.Vector3(c.x, box.min.y, c.z));
  holder.add(obj); return holder;
}

// hero: a skeleton built in code. The model ships without one, so bones are placed from the mesh
// layout and every vertex is skinned by height and side (see skinHero).
let heroTemplate = null;
const HERO_H = 2.7;
// model space: x = right, y = up (-0.95..0.95), z = forward. [name, parent, x, y, z]; right arm mirrored to left
const HERO_BONES = [
  ['root', -1, 0, 0, 0], ['pelvis', 0, 0, 0.02, 0],
  ['tail1', 1, 0, -0.04, 0], ['tail2', 2, 0, -0.34, 0], ['tail3', 3, 0, -0.64, 0],
  ['chest', 1, 0, 0.24, 0], ['neck', 5, 0, 0.53, 0], ['head', 6, 0, 0.67, 0],
  ['clavR', 5, 0.12, 0.47, 0], ['upperR', 8, 0.36, 0.44, 0], ['foreR', 9, 0.47, 0.0, 0], ['handR', 10, 0.60, -0.42, 0],
  ['clavL', 5, -0.12, 0.47, 0], ['upperL', 12, -0.36, 0.44, 0], ['foreL', 13, -0.47, 0.0, 0], ['handL', 14, -0.60, -0.42, 0],
];
// which height range each bone owns: body bones along the centre line, arm bones down each arm
const BODY_SPANS = [[1, -0.02, 0.22], [5, 0.22, 0.52], [6, 0.52, 0.66], [7, 0.66, 1.1], [2, -0.32, -0.02], [3, -0.62, -0.32], [4, -1.1, -0.62]];
const ARM_SPANS = [[0, 0.45, 1.1], [1, 0.0, 0.45], [2, -0.42, 0.0], [3, -1.1, -0.42]]; // clav, upper, fore, hand
function skinHero(geo) {
  const P = geo.attributes.position, n = P.count, idx = new Uint16Array(n * 4), wts = new Float32Array(n * 4);
  const span = (y, lo, hi, w) => { const d = y < lo ? lo - y : y > hi ? y - hi : 0; return Math.exp(-(d / w) * (d / w)); };
  for (let i = 0; i < n; i++) {
    const x = P.getX(i), y = P.getY(i), ax = Math.abs(x), side = x >= 0 ? 0 : 4;
    // arms hang beside the body: everything outside this line (it widens toward the shoulders) is arm
    const edge = 0.27 + Math.max(0, Math.min(y, 0.45)) * 0.18;
    const arm = smooth(edge - 0.05, edge + 0.05, ax);
    const cand = [];
    let sb = 0; for (const [b, lo, hi] of BODY_SPANS) sb += span(y, lo, hi, 0.07);
    for (const [b, lo, hi] of BODY_SPANS) cand.push([b, (1 - arm) * span(y, lo, hi, 0.07) / sb]);
    let sa = 0; for (const [, lo, hi] of ARM_SPANS) sa += span(y, lo, hi, 0.06);
    for (const [k, lo, hi] of ARM_SPANS) cand.push([8 + side + k, arm * span(y, lo, hi, 0.06) / sa]);
    cand.sort((a, b) => b[1] - a[1]);
    let sum = 0; for (let k = 0; k < 4; k++) sum += cand[k][1];
    for (let k = 0; k < 4; k++) { idx[i * 4 + k] = cand[k][0]; wts[i * 4 + k] = cand[k][1] / sum; }
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wts, 4));
  // culling uses the rest-pose bounds, so make them cover every pose (arms raised overhead reach y ~1.9)
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.45, 0), 1.6);
}
function makeBones() {
  const bones = HERO_BONES.map(([name, p, x, y, z]) => { const b = new THREE.Bone(); b.name = name; b.userData.at = new THREE.Vector3(x, y, z); return b; });
  HERO_BONES.forEach(([, p], i) => { if (p >= 0) bones[p].add(bones[i]); });
  bones.forEach(b => b.position.copy(b.parent && b.parent.isBone ? b.userData.at.clone().sub(b.parent.userData.at) : b.userData.at));
  return bones;
}
function fallbackHero() {
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0x1a0606, emissive: 0x7a1004, emissiveIntensity: 0.6, roughness: 0.6, flatShading: true });
  const add = (geo, x, y, z, rx = 0, rz = 0) => { const k = new THREE.Mesh(geo, m); k.position.set(x, y, z); k.rotation.set(rx, 0, rz); g.add(k); };
  add(new THREE.ConeGeometry(0.45, 1.3, 6), 0, 0.75, 0, Math.PI);
  add(new THREE.DodecahedronGeometry(0.42, 0), 0, 1.5, 0);
  for (const sx of [-1, 1]) { add(new THREE.ConeGeometry(0.28, 0.8, 4), sx * 0.55, 1.75, 0, 0, -sx * 0.7); add(new THREE.CylinderGeometry(0.07, 0.12, 1.3, 5), sx * 0.75, 1.0, 0.1, 0, sx * 0.25); }
  return fitModel(g, HERO_H);
}
// hero shadow: the skinned hero flattened onto the ground along the sun. The stencil keeps overlapping
// triangles (and overlapping heroes) from darkening the same pixel twice.
const HERO_SHADOW_Y = 0.025;
const heroShadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide,
  stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.ReplaceStencilOperation });
heroShadowMat.userData.fow = true; // skip the fog-of-war patch: project_vertex is replaced below
heroShadowMat.onBeforeCompile = sh => {
  sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `vec4 wp = modelMatrix * vec4(transformed, 1.0);
    const vec3 L = vec3(${SUN_DIR.x.toFixed(4)}, ${SUN_DIR.y.toFixed(4)}, ${SUN_DIR.z.toFixed(4)});
    wp.xyz -= L * ((wp.y - ${HERO_SHADOW_Y}) / L.y);
    vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;`);
};
heroShadowMat.customProgramCacheKey = () => 'sfa-hero-shadow';
function cloneHero() {
  const t = heroTemplate || fallbackHero();
  const c = t.clone(true); const mats = [], shadows = [];
  let bones = null;
  c.traverse(o => {
    if (!o.isMesh || o.userData.shadow) return;
    o.material = o.material.clone();
    o.material.userData.base = o.material.color.clone();
    mats.push(o.material);
    if (!heroTemplate) return;
    // swap the static mesh for a skinned one with this unit's own skeleton
    const sk = new THREE.SkinnedMesh(o.geometry, o.material);
    sk.position.copy(o.position); sk.quaternion.copy(o.quaternion); sk.scale.copy(o.scale);
    o.parent.add(sk); o.parent.remove(o);
    bones = makeBones(); sk.add(bones[0]);
    c.updateMatrixWorld(true);
    const skel = new THREE.Skeleton(bones); sk.bind(skel);
    const s = new THREE.SkinnedMesh(heroTemplate.userData.shadowGeo || o.geometry, heroShadowMat);
    s.userData.shadow = true; s.renderOrder = 1; s.frustumCulled = false; sk.add(s); s.bind(skel, sk.bindMatrix);
    shadows.push(s);
  });
  c.userData.mats = mats; c.userData.shadows = shadows;
  c.userData.bones = bones && Object.fromEntries(bones.map(b => [b.name, b]));
  return c;
}

// props
const PROP_TEMPLATES = {};
function fallbackProp(kind) {
  const g = new THREE.Group();
  if (kind === 'tree') {
    const m = new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 1, flatShading: true });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.35, 3, 6), m); trunk.position.y = 1.5; g.add(trunk);
    for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.09, 1.4, 4), m); b.position.set(0, 2.2 + i * 0.2, 0); b.rotation.set(rnd(-1, 1), rnd(0, 6), rnd(-1, 1)); g.add(b); }
  } else if (kind === 'ice') {
    const m = new THREE.MeshStandardMaterial({ color: 0x9fd0ff, roughness: 0.15, metalness: 0.1, emissive: 0x103050, flatShading: true });
    for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.3, rnd(1.5, 3), 5), m); s.position.set(rnd(-0.5, 0.5), 1, rnd(-0.5, 0.5)); s.rotation.set(rnd(-0.4, 0.4), 0, rnd(-0.4, 0.4)); g.add(s); }
  } else {
    const m = new THREE.MeshStandardMaterial({ color: kind === 'obelisk' ? 0x120c0c : 0x4a4644, roughness: 0.6, flatShading: true });
    const s = new THREE.Mesh(kind === 'obelisk' ? new THREE.ConeGeometry(0.8, 4, 5) : new THREE.CylinderGeometry(0.6, 0.7, 3, 10), m); s.position.y = kind === 'obelisk' ? 2 : 1.5; g.add(s);
  }
  return g;
}
const NORM_PROPS = {};
function normProp(kind) { // template fitted to height 1, meshes with their matrices
  if (NORM_PROPS[kind] !== undefined) return NORM_PROPS[kind];
  const t = PROP_TEMPLATES[kind] || PROP_TEMPLATES[PROP_FALLBACK[kind]]; if (!t) return (NORM_PROPS[kind] = null);
  const h = fitModel(t.clone(true), 1); h.updateMatrixWorld(true);
  const parts = []; h.traverse(o => { if (o.isMesh) parts.push({ geo: o.geometry, mat: o.material, m: o.matrixWorld.clone() }); });
  return (NORM_PROPS[kind] = parts);
}
const PROP_FALLBACK = { treeFar: 'tree' }; // low-poly backdrop variant, if the data file has one
const propMatrix = (() => { const M = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3();
  return (o, part, out) => { q.setFromAxisAngle(up, o.rot || 0); M.compose(p.set(o.x, o.y || 0, o.z), q, s.set(o.h, o.h, o.h)); return out.multiplyMatrices(M, part.m); }; })();
function addProps(G, kind, list) { // list: [{x,y,z,h,rot}]
  if (!list.length) return;
  const parts = normProp(kind);
  if (!parts) { for (const o of list) { const p = makeProp(kind, o.h); p.position.set(o.x, o.y || 0, o.z); p.rotation.y = o.rot || 0; G.add(p); } return; }
  // one instanced mesh per 14x14 cell, with its own bounds, so groups off screen are frustum-culled
  const cells = {};
  for (const o of list) { const k = Math.floor(o.x / 14) + ',' + Math.floor(o.z / 14); (cells[k] = cells[k] || []).push(o); }
  const tmp = new THREE.Matrix4(), box = new THREE.Box3(), c = new THREE.Vector3();
  for (const k in cells) {
    const cl = cells[k];
    box.makeEmpty();
    for (const o of cl) { box.expandByPoint(c.set(o.x - o.h, (o.y || 0), o.z - o.h)); box.expandByPoint(c.set(o.x + o.h, (o.y || 0) + o.h, o.z + o.h)); }
    for (const part of parts) {
      const geo = new THREE.BufferGeometry(); // shares the template's GPU buffers, only the bounds differ
      geo.index = part.geo.index; for (const n in part.geo.attributes) geo.setAttribute(n, part.geo.attributes[n]);
      geo.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
      const im = new THREE.InstancedMesh(geo, part.mat, cl.length);
      cl.forEach((o, i) => im.setMatrixAt(i, propMatrix(o, part, tmp)));
      G.add(im);
    }
  }
}
function makeProp(kind, height) {
  const base = PROP_FALLBACK[kind] || kind, t = PROP_TEMPLATES[kind] || PROP_TEMPLATES[base];
  const obj = t ? t.clone(true) : fallbackProp(base);
  return fitModel(obj, height);
}

// ------------------------------------------------------------------ map building
let mapGroup = null;
function roundedRectShape(hx, hz, r) {
  const s = new THREE.Shape();
  s.moveTo(-hx + r, -hz); s.lineTo(hx - r, -hz); s.quadraticCurveTo(hx, -hz, hx, -hz + r);
  s.lineTo(hx, hz - r); s.quadraticCurveTo(hx, hz, hx - r, hz); s.lineTo(-hx + r, hz);
  s.quadraticCurveTo(-hx, hz, -hx, hz - r); s.lineTo(-hx, -hz + r); s.quadraticCurveTo(-hx, -hz, -hx + r, -hz);
  return s;
}
function circleShape(rad) { const s = new THREE.Shape(); s.absarc(0, 0, rad, 0, Math.PI * 2, false); return s; }
function edgePoints(n, offset) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
    let lo = 0, hi = 60;
    for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (sdArena(dx * m, dz * m) < offset) lo = m; else hi = m; }
    pts.push([dx * lo, dz * lo, a]);
  }
  return pts;
}
// sun direction (pointing at the sun); prop shadows are baked along it, hero shadows projected along it
const SUN_DIR = new THREE.Vector3(12, 30, 9).normalize();
// project every caster's triangles onto the ground along the sun, then blur: soft, exact, free at runtime
function paintShadows(g, toC, casters, S) {
  const N = S / 2, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const c = cv.getContext('2d'), M = new THREE.Matrix4(), v = new THREE.Vector3();
  c.fillStyle = '#000';
  for (const o of casters) {
    const parts = normProp(o.kind);
    if (!parts) { const [x, z] = toC(o.x - SUN_DIR.x * o.h * 0.4, o.z - SUN_DIR.z * o.h * 0.4); c.beginPath(); c.arc(x / 2, z / 2, 20, 0, 7); c.fill(); continue; }
    for (const part of parts) {
      propMatrix(o, part, M);
      const P = part.geo.attributes.position, I = part.geo.index, n = P.count, gx = new Float32Array(n), gz = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(M);
        const t = Math.max(0, v.y) / SUN_DIR.y, [x, z] = toC(v.x - SUN_DIR.x * t, v.z - SUN_DIR.z * t);
        gx[i] = x / 2; gz[i] = z / 2;
      }
      const tri = I ? I.array : null, cnt = tri ? tri.length : n;
      // small paths: one huge path with tens of thousands of sub-paths fills very slowly
      for (let i = 0; i < cnt; i += 3) {
        if (i % 600 === 0) { if (i) c.fill(); c.beginPath(); }
        const a = tri ? tri[i] : i; let b = tri ? tri[i + 1] : i + 1, d = tri ? tri[i + 2] : i + 2;
        // front and back faces project with opposite winding and would cancel under the nonzero rule
        if ((gx[b] - gx[a]) * (gz[d] - gz[a]) - (gz[b] - gz[a]) * (gx[d] - gx[a]) < 0) { const s = b; b = d; d = s; }
        c.moveTo(gx[a], gz[a]); c.lineTo(gx[b], gz[b]); c.lineTo(gx[d], gz[d]); c.closePath();
      }
      c.fill();
    }
  }
  g.save(); g.globalAlpha = 0.6; g.filter = `blur(${Math.round(S / 400)}px)`; g.drawImage(cv, 0, 0, S, S); g.restore();
}
function paintGround(m, casters = []) {
  const W = 2 * (m.hx + 2), D = 2 * (m.hz + 2), S = 2048;
  const toC = (x, z) => [(x + W / 2) / W * S, (z + D / 2) / D * S];
  const pal = {
    molten: { base: '#1a1514', spot: [22, 16, 15], line: 'rgba(5,2,2,0.9)', blight: 'rgba(40,6,30,0.22)' },
    river: { base: '#232a1c', spot: [32, 38, 24], line: 'rgba(8,8,5,0.6)', blight: 'rgba(40,46,24,0.25)' },
    frozen: { base: '#3c4a5a', spot: [70, 84, 100], line: 'rgba(20,28,40,0.55)', blight: null },
  }[m.theme];
  const color = canvasTex(S, (g) => {
    g.fillStyle = pal.base; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 26000; i++) {
      const v = Math.random(), [r, gg, b] = pal.spot;
      g.fillStyle = `rgba(${r * (0.6 + v) | 0},${gg * (0.6 + v) | 0},${b * (0.6 + v) | 0},0.18)`;
      g.beginPath(); g.arc(rnd(0, S), rnd(0, S), rnd(2, 22), 0, 7); g.fill();
    }
    if (pal.blight) for (let i = 0; i < 40; i++) { g.fillStyle = pal.blight; g.beginPath(); g.ellipse(rnd(0, S), rnd(0, S), rnd(60, 220), rnd(40, 160), rnd(0, 3), 0, 7); g.fill(); }
    if (m.theme === 'molten') { // big Scourge flagstones
      g.strokeStyle = pal.line; g.lineWidth = 6;
      const step = S / 18;
      for (let y = 0; y < S; y += step) { const off = (y / step) % 2 ? step / 2 : 0; g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); for (let x = off; x < S; x += step) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + step); g.stroke(); } }
      g.strokeStyle = 'rgba(0,0,0,0.7)'; for (let i = 0; i < 60; i++) crackPath(g, rnd(0, S), rnd(0, S), rnd(8, 26) | 0, rnd(0, 7), 3);
      // dark banks along the lava
      for (const h of m.hazards) { const [ax, az] = toC(h.a[0], h.a[1]), [bx, bz] = toC(h.b[0], h.b[1]); g.strokeStyle = 'rgba(0,0,0,0.75)'; g.lineCap = 'round'; g.lineWidth = (h.r + 1.1) * 2 / W * S; g.beginPath(); g.moveTo(ax, az); g.lineTo(bx, bz); g.stroke(); }
    }
    if (m.theme === 'river') { // dirt paths + muddy river banks
      g.lineCap = 'round';
      for (const h of m.hazards) { const [ax, az] = toC(h.a[0], h.a[1]), [bx, bz] = toC(h.b[0], h.b[1]); g.strokeStyle = 'rgba(30,24,14,0.9)'; g.lineWidth = (h.r + 1.4) * 2 / W * S; g.beginPath(); g.moveTo(ax, az); g.lineTo(bx, bz); g.stroke(); }
      g.strokeStyle = 'rgba(48,38,24,0.55)'; g.lineWidth = 70;
      for (const [x1, z1, x2, z2] of [[-20, 14, 20, -14], [-22, -6, -4, -14], [22, 6, 4, 14]]) { const [a1, b1] = toC(x1, z1), [a2, b2] = toC(x2, z2); g.beginPath(); g.moveTo(a1, b1); g.quadraticCurveTo((a1 + a2) / 2 + rnd(-100, 100), (b1 + b2) / 2 + rnd(-100, 100), a2, b2); g.stroke(); }
    }
    if (m.theme === 'frozen') { // frost patterns + ruined tile ring
      g.strokeStyle = 'rgba(230,240,255,0.25)'; for (let i = 0; i < 90; i++) crackPath(g, rnd(0, S), rnd(0, S), rnd(6, 16) | 0, rnd(0, 7), 2);
      const [cx, cz] = toC(0, 0); g.strokeStyle = 'rgba(30,40,60,0.6)'; g.lineWidth = 8;
      for (const rr of [9, 15]) { g.beginPath(); g.ellipse(cx, cz, rr / W * S, rr / D * S, 0, 0, 7); g.stroke(); }
      for (let k = 0; k < 24; k++) { const a = k / 24 * 6.28; const [x1, z1] = toC(Math.cos(a) * 9, Math.sin(a) * 9), [x2, z2] = toC(Math.cos(a) * 15, Math.sin(a) * 15); g.beginPath(); g.moveTo(x1, z1); g.lineTo(x2, z2); g.stroke(); }
    }
    paintShadows(g, toC, casters, S);
    // rune circles
    for (const [x, z] of m.runes) { const [cx, cz] = toC(x, z); g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 10; g.beginPath(); g.arc(cx, cz, 1.4 / W * S, 0, 7); g.stroke(); }
  }, true);
  const glow = canvasTex(S, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    if (m.theme === 'molten') { g.strokeStyle = '#d02a08'; g.shadowColor = '#c01800'; g.shadowBlur = 10; g.globalAlpha = 0.5; for (let i = 0; i < 24; i++) crackPath(g, rnd(0, S), rnd(0, S), rnd(6, 14) | 0, rnd(0, 7), 1.5); }
    for (const [x, z] of m.runes) { const [cx, cz] = toC(x, z); g.globalAlpha = 0.7; g.strokeStyle = m.theme === 'frozen' ? '#4aa0ff' : m.theme === 'river' ? '#50ffa0' : '#ff4a1a'; g.shadowColor = g.strokeStyle; g.shadowBlur = 16; g.lineWidth = 4; g.beginPath(); g.arc(cx, cz, 1.25 / W * S, 0, 7); g.stroke(); }
  }, true);
  return { color, glow, W, D };
}

function clearMap() {
  if (!mapGroup) return;
  scene.remove(mapGroup);
  // also frees prop-template buffers shared with these meshes; they are re-uploaded on the next build
  mapGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  for (const d of mapGroup.userData.owned) d.dispose(); // per-map textures and materials (shared ones are never listed)
  mapGroup = null;
}
function buildMap(id) {
  clearMap(); MAP = MAPS[id] || MAPS.molten;
  const m = MAP, G = new THREE.Group(); mapGroup = G; scene.add(G);
  G.userData.owned = [];
  const own = x => { G.userData.owned.push(x); return x; };
  { const ext = Math.max(m.hx, m.hz) + 4; FOW_U.fowRect.value.set(-ext, -ext, ext * 2, ext * 2); fowCur.fill(0); fowT = 0; }
  scene.background = new THREE.Color(m.sky); scene.fog.color.set(m.fog[0]); scene.fog.density = m.fog[1];
  hemi.color.set(m.hemi[0]); hemi.groundColor.set(m.hemi[1]); hemi.intensity = m.hemi[2];
  sun.color.set(m.sun[0]); sun.intensity = m.sun[1]; renderer.toneMappingExposure = m.exposure;
  glowLight.color.set(m.theme === 'molten' ? 0xff3a08 : m.theme === 'river' ? 0x2a6aff : 0x6ab0ff);
  glowLight.intensity = m.theme === 'molten' ? 0.8 : 0.35;

  // props first: their shadows are baked into the ground texture below
  const lists = {};
  const put = (kind, o) => { (lists[kind] = lists[kind] || []).push(o); };
  if (m.outsideTrees) {
    for (const [x, z] of edgePoints(64, 1.6)) put('treeFar', { x: x + rnd(-1.2, 1.2), z: z + rnd(-1.2, 1.2), h: rnd(4.5, 6.5), rot: rnd(0, 6.28) });
    for (const [x, z] of edgePoints(26, 8)) put('treeFar', { x: x + rnd(-2, 2), z: z + rnd(-2, 2), h: rnd(5, 7.5), rot: rnd(0, 6.28) });
  }
  if (m.theme === 'frozen') for (const [x, z] of edgePoints(22, 1.2)) put('ice', { x, y: -0.2, z, h: rnd(1.6, 2.8), rot: rnd(0, 6.28) });
  const casters = [];
  for (const o of m.obstacles) { const p = { kind: o.prop, x: o.x, z: o.z, h: o.h, rot: o.rot !== undefined ? o.rot : rnd(0, 6.28) }; put(o.prop, p); casters.push(p); }
  for (const o of m.decor) put(o.prop, { x: o.x, y: m.edge === 'lava' ? -0.8 : 0, z: o.z, h: o.h, rot: o.rot || 0 });

  // ground
  const tex = paintGround(m, casters);
  own(tex.color); own(tex.glow);
  const shape = m.r >= Math.min(m.hx, m.hz) ? circleShape(m.hx) : roundedRectShape(m.hx, m.hz, m.r);
  const gGeo = new THREE.ShapeGeometry(shape, 48);
  const pa = gGeo.attributes.position, uv = gGeo.attributes.uv;
  for (let i = 0; i < pa.count; i++) uv.setXY(i, (pa.getX(i) + tex.W / 2) / tex.W, (pa.getY(i) + tex.D / 2) / tex.D);
  const ground = new THREE.Mesh(gGeo, own(new THREE.MeshStandardMaterial({ map: tex.color, emissiveMap: tex.glow, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: m.theme === 'frozen' ? 0.55 : 0.9, metalness: 0.05 })));
  ground.rotation.x = -Math.PI / 2; G.add(ground);
  // cliff sides
  const depth = m.edge === 'abyss' ? 16 : 4;
  const cliffGeo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 48 });
  const cliffMat = own(new THREE.MeshStandardMaterial({ color: m.theme === 'frozen' ? 0x2a3646 : 0x17110f, roughness: 1, emissive: m.theme === 'molten' ? 0x501004 : 0x000000, emissiveIntensity: 0.5 }));
  const cliff = new THREE.Mesh(cliffGeo, [own(new THREE.MeshBasicMaterial({ visible: false })), cliffMat]);
  cliff.rotation.x = Math.PI / 2; cliff.position.y = -0.01; G.add(cliff);

  // outside
  if (m.edge === 'lava') { const lava = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), lavaMat); lava.rotation.x = -Math.PI / 2; lava.position.y = -1.4; G.add(lava); }
  if (m.edge === 'abyss') { const v = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), voidMat); v.rotation.x = -Math.PI / 2; v.position.y = -18; G.add(v); }
  if (m.edge === 'wall') {
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), own(new THREE.MeshStandardMaterial({ color: 0x07090a, roughness: 1 })));
    outer.rotation.x = -Math.PI / 2; outer.position.y = -0.03; G.add(outer);
  }
  // hazard ribbons
  for (const h of m.hazards) {
    const dx = h.b[0] - h.a[0], dz = h.b[1] - h.a[1], len = Math.hypot(dx, dz);
    const rib = new THREE.Mesh(new THREE.PlaneGeometry(len, h.r * 2), h.type === 'lava' ? lavaMat : waterMat);
    rib.rotation.x = -Math.PI / 2; rib.rotation.z = -Math.atan2(dz, dx);
    rib.position.set((h.a[0] + h.b[0]) / 2, h.type === 'lava' ? 0.02 : 0.015, (h.a[1] + h.b[1]) / 2); rib.renderOrder = 1; G.add(rib);
  }
  const bm = m.bridges ? own(new THREE.MeshStandardMaterial({ color: 0x0f0b0a, roughness: 0.9, flatShading: true })) : null;
  (m.bridges || []).forEach(([x, z]) => {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.3, 4.2), bm); slab.position.set(x, 0.05, z); G.add(slab);
    for (const sx of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.7, 0.4), bm); post.position.set(x + sx * 2.1, 0.35, z - 2); G.add(post); const p2 = post.clone(); p2.position.z = z + 2; G.add(p2); }
  });
  (m.ice || []).forEach(c => { const ice = new THREE.Mesh(new THREE.CircleGeometry(c.r, 64), iceMat); ice.rotation.x = -Math.PI / 2; ice.position.set(c.x, 0.02, c.z); G.add(ice); });

  // rim rocks / walls
  const rockMat = own(new THREE.MeshStandardMaterial({ color: m.theme === 'frozen' ? 0x161c26 : m.theme === 'river' ? 0x14160f : 0x070505, roughness: 0.95, metalness: 0.05, flatShading: true }));
  const rockGeo = new THREE.DodecahedronGeometry(1, 1);
  { const p = rockGeo.attributes.position; for (let i = 0; i < p.count; i++) { const k = 0.75 + ((Math.sin(p.getX(i) * 12.9 + p.getY(i) * 78.2 + p.getZ(i) * 37.7) * 43758.5) % 1 + 1) % 1 * 0.45; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); } rockGeo.computeVertexNormals(); }
  const wall = m.edge === 'wall';
  const rimPts = edgePoints(wall ? 90 : 110, wall ? 0.6 : 0.8);
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rimPts.length * (wall ? 2 : 1));
  { const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(); let k = 0;
    for (const [x, z] of rimPts) for (let j = 0; j < (wall ? 2 : 1); j++) {
      const s = wall ? rnd(0.3, 0.6) : rnd(0.35, 0.8), out = j ? 1.0 : 0;
      const l = Math.hypot(x, z) || 1;
      q.setFromEuler(e.set(rnd(0, 3), rnd(0, 3), rnd(0, 3)));
      mm.compose(new THREE.Vector3(x + x / l * (out + rnd(-0.2, 0.6)), wall ? rnd(-0.3, 0.4) + j * 0.6 : rnd(-0.9, -0.3), z + z / l * (out + rnd(-0.2, 0.6))), q, new THREE.Vector3(s, s * rnd(0.7, 1.3), s));
      rocks.setMatrixAt(k++, mm);
    } }
  G.add(rocks);
  for (const kind in lists) addProps(G, kind, lists[kind]);
  // ambient emitters
  m._emit = [];
  for (const o of m.obstacles) if (o.prop === 'obelisk') m._emit.push([o.x, o.h * 0.75, o.z]);
}

// ------------------------------------------------------------------ units
let units = [], player = null, settings = {}, state = 'menu', firstBlood = false, gameTime = 0;
const labelsEl = $('labels');

class Unit {
  constructor(i, name, isPlayer) {
    this.id = i; this.name = name; this.isPlayer = isPlayer; this.color = COLORS[i % COLORS.length];
    this.pos = new THREE.Vector3(); this.prev = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.slide = new THREE.Vector2();
    this.facing = 0; this.faceAngle = null; this.moveTarget = null;
    this.hp = CFG.hp; this.souls = 0; this.kills = 0; this.deaths = 0; this.streak = 0;
    this.alive = true; this.respawnT = 0; this.prot = 0; this.cd = [0, 0, 0]; this.cast = null; this.post = 0;
    this.buffs = { haste: 0, dd: 0, regen: 0 };
    this.lastHitBy = null; this.lastHitT = -99; this.multi = 0; this.multiT = 0;
    this.flash = 0; this.deathT = 0; this.bob = rnd(0, 6); this.walkPhase = 0; this.flinch = 0;
    this.pose = {}; this.poseT = {}; this.poseBase = {}; this.poseHold = {}; this.spdS = 0; this.yawS = 0; this.lastFacing = 0; this.dip = 0; this.bank = 0;
    this.root = new THREE.Group(); scene.add(this.root);
    this.model = cloneHero(); this.root.add(this.model);
    const ring = new THREE.Mesh(quadGeo, new THREE.MeshBasicMaterial({ map: ringTex, color: this.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }));
    ring.rotation.x = -Math.PI / 2; ring.scale.setScalar(0.95); ring.position.y = 0.06; this.root.add(ring); this.ring = ring;
    const shadow = new THREE.Mesh(quadGeo, new THREE.MeshBasicMaterial({ map: scorchTex, transparent: true, depthWrite: false, opacity: 0.6 }));
    shadow.rotation.x = -Math.PI / 2; shadow.scale.setScalar(0.7); shadow.position.y = 0.04; this.root.add(shadow); this.blob = shadow;
    this.tele = new THREE.Mesh(quadGeo, new THREE.MeshBasicMaterial({ map: ringTex, color: this.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    this.tele.rotation.x = -Math.PI / 2; this.tele.visible = false; scene.add(this.tele);
    this.label = document.createElement('div'); this.label.className = 'ulabel';
    this.label.innerHTML = `<span style="color:${this.color}">${name}</span><div class="hb"><div></div></div>`;
    labelsEl.appendChild(this.label); this.hbEl = this.label.querySelector('.hb div');
  }
  dispose() {
    scene.remove(this.root); scene.remove(this.tele); this.label.remove();
    for (const m of this.model.userData.mats) m.dispose();
    this.ring.material.dispose(); this.blob.material.dispose(); this.tele.material.dispose();
  }
  get speed() { let s = CFG.speed * (this.buffs.haste > 0 ? 1.6 : 1); const h = hazardAt(this.pos.x, this.pos.z); if (h && h.type === 'water') s *= 0.85; return s; }
  moveTo(x, z) { if (!this.alive || this.cast) return; this.moveTarget = new THREE.Vector2(x, z); this.faceAngle = null; }
  razeCenter(slot, facing = this.facing) {
    const d = CFG.razeDist[slot]; return new THREE.Vector2(this.pos.x + Math.sin(facing) * d, this.pos.z + Math.cos(facing) * d);
  }
  castRaze(slot) {
    if (!this.alive || this.cast || this.cd[slot] > 0) return false;
    this.cast = { slot, t: CFG.castTime }; this.moveTarget = null; this.faceAngle = null;
    const c = this.razeCenter(slot);
    this.tele.position.set(c.x, 0.08, c.y); this.tele.visible = true;
    sfx('cast', this.isPlayer ? 0.9 : earVol(this.pos) * 0.6, this.pos);
    return true;
  }
  steer(dir) { // slide around obstacles in the way (WC3-style pathing)
    for (const o of MAP.obstacles) {
      const ox = o.x - this.pos.x, oz = o.z - this.pos.z, d = Math.hypot(ox, oz);
      if (d > 3.2 || d < 1e-4) continue;
      if (ox * dir.x + oz * dir.y <= 0) continue;
      const perp = Math.abs(dir.x * oz - dir.y * ox), need = o.r + CFG.unitR + 0.25;
      if (perp < need) {
        let px = dir.y, pz = -dir.x; if (px * ox + pz * oz > 0) { px = -px; pz = -pz; }
        const k = (1 - d / 3.2) * 1.6 + 0.2; dir.x += px * k; dir.y += pz * k; dir.normalize();
      }
    }
    return dir;
  }
  step(dt, input) {
    this.prev.copy(this.pos);
    for (let s = 0; s < 3; s++) this.cd[s] = Math.max(0, this.cd[s] - dt);
    for (const k in this.buffs) this.buffs[k] = Math.max(0, this.buffs[k] - dt);
    if (!this.alive) { this.respawnT -= dt; if (this.respawnT <= 0) respawn(this); return; }
    this.prot = Math.max(0, this.prot - dt); this.post = Math.max(0, this.post - dt);
    this.hp = Math.min(CFG.hp, this.hp + (CFG.regen + (this.buffs.regen > 0 ? 70 : 0)) * dt);
    let dir = null;
    if (this.cast) {
      this.cast.t -= dt;
      if (this.cast.t <= 0) { const s = this.cast.slot; this.cast = null; this.post = 0.38; this.cd[s] = CFG.razeCd; this.tele.visible = false; resolveRaze(this, s); }
    } else {
      if (input && (input.x || input.z)) { dir = new THREE.Vector2(input.x, input.z).normalize(); this.moveTarget = null; }
      else if (this.moveTarget) {
        const dx = this.moveTarget.x - this.pos.x, dz = this.moveTarget.y - this.pos.z, d = Math.hypot(dx, dz);
        if (d < 0.08) this.moveTarget = null; else dir = this.steer((this._dir || (this._dir = new THREE.Vector2())).set(dx / d, dz / d));
      }
      let target = this.faceAngle;
      if (dir) target = Math.atan2(dir.x, dir.y);
      if (target !== null) {
        const diff = wrap(target - this.facing), st = CFG.turnRate * dt;
        this.facing = wrap(this.facing + Math.max(-st, Math.min(st, diff)));
        if (!dir && Math.abs(diff) < 0.01) this.faceAngle = null;
      }
    }
    // movement (with ice momentum)
    const want = this._want || (this._want = new THREE.Vector2()); want.set(0, 0);
    if (dir) { const ad = Math.abs(wrap(Math.atan2(dir.x, dir.y) - this.facing)); const k = ad < 0.35 ? 1 : ad < 1.2 ? 0.35 : 0; want.set(dir.x, dir.y).multiplyScalar(this.speed * k); }
    if (onIce(this.pos.x, this.pos.z)) this.slide.lerp(want, 1 - Math.exp(-1.4 * dt)); else this.slide.copy(want);
    this.pos.x += this.slide.x * dt; this.pos.z += this.slide.y * dt;
    // obstacles
    for (const o of MAP.obstacles) {
      const dx = this.pos.x - o.x, dz = this.pos.z - o.z, d = Math.hypot(dx, dz), m = o.r + CFG.unitR;
      if (d < m && d > 1e-4) { this.pos.x = o.x + dx / d * m; this.pos.z = o.z + dz / d * m; if (onIce(this.pos.x, this.pos.z)) this.slide.multiplyScalar(-0.4); }
    }
    // edge
    const sd = sdArena(this.pos.x, this.pos.z), lim = MAP.edge === 'wall' ? -0.6 : 2.5;
    if (sd > lim) { const e = 0.01, gx = sdArena(this.pos.x + e, this.pos.z) - sd, gz = sdArena(this.pos.x, this.pos.z + e) - sd, gl = Math.hypot(gx, gz) || 1; this.pos.x -= gx / gl * (sd - lim); this.pos.z -= gz / gl * (sd - lim); }
    let dps = 0;
    if (MAP.edge !== 'wall' && sd > -0.2) dps = MAP.edgeDps;
    const hz = hazardAt(this.pos.x, this.pos.z); if (hz && hz.type === 'lava') dps = Math.max(dps, 150);
    if (dps) {
      this.hp -= dps * dt;
      if (Math.random() < 0.5) {
        if (MAP.edge === 'abyss' && sd > -0.2) particles.spawn(this.pos.x, 0.5, this.pos.z, rnd(-1, 1), rnd(-2, 1), rnd(-1, 1), 0.6, 0.8, 0.1, [0.5, 0.7, 1], [0.1, 0.2, 0.4], -4, 1);
        else particles.spawn(this.pos.x + rnd(-0.4, 0.4), 0.2, this.pos.z + rnd(-0.4, 0.4), 0, rnd(2, 4), 0, 0.5, 0.9, 0.2, FIRE0, FIRE1, 1);
      }
      if (this.hp <= 0) kill(this, gameTime - this.lastHitT < 5 ? this.lastHitBy : null, true);
    }
    // runes
    if (rune && Math.hypot(this.pos.x - rune.x, this.pos.z - rune.z) < 1.1) takeRune(this);
    this.vel.subVectors(this.pos, this.prev).divideScalar(dt);
  }
  // Pose in the style of the DotA 1 Shadow Fiend (the WC3 Firelord model): a legless, hunched figure
  // that glides with a slow float, long arms swinging like heavy pendulums and a tail streaming behind.
  animate(dt, t) {
    const raw = Math.min(Math.hypot(this.vel.x, this.vel.z) / CFG.speed, 1.6);
    this.spdS += (raw - this.spdS) * (1 - Math.exp(-dt * 6));
    const w = Math.min(this.spdS, 1), idle = 1 - w;
    const yaw = wrap(this.facing - this.lastFacing) / Math.max(dt, 1e-3); this.lastFacing = this.facing;
    this.yawS += (Math.max(-12, Math.min(12, yaw)) - this.yawS) * (1 - Math.exp(-dt * 6));
    this.walkPhase += dt * Math.PI * 2 * 1.05 * this.spdS; // about one stride per second, faster with Haste
    const ph = this.walkPhase, br = Math.sin(t * 1.6 + this.bob), T = this.poseT;
    // glide
    T.pelvisX = 0.06 + 0.10 * w;                       // body only tips a little: the hunch is in the shoulders
    T.chestX = 0.16 + 0.08 * w + br * 0.03 * idle;     // shoulders rolled forward; breathing at rest
    T.chestY = Math.sin(ph) * 0.09 * w;                // shoulders turn a little into each swing
    T.neckX = -0.10 - 0.12 * w;                        // head stays up, eyes ahead
    T.headX = 0.06 + br * 0.02 * idle;
    for (const [s, k] of [[1, 'R'], [-1, 'L']]) {
      const sw = Math.sin(ph) * s;                     // arms swing in opposition
      T['upperX' + k] = -sw * 0.38 * w - 0.08 + Math.sin(t * 1.1 + this.bob + s) * 0.05 * idle;
      T['upperZ' + k] = s * (0.06 + 0.08 * w + br * 0.02 * idle);
      // elbows and claws lag the shoulder: loose, heavy follow-through
      T['foreX' + k] = -0.18 - Math.sin(ph - 0.8) * s * 0.22 * w;
      T['handX' + k] = -0.12 - Math.sin(ph - 1.5) * s * 0.18 * w;
      T['clavX' + k] = sw * 0.05 * w;
    }
    const turn = Math.max(-1, Math.min(1, this.yawS / 6));
    for (let i = 1; i <= 3; i++) { // tail streams back and waves, trailing the turn
      T['tailX' + i] = (0.10 + 0.20 * w) * [1, 0.8, 0.7][i - 1];
      T['tailZ' + i] = Math.sin(t * 2.4 + this.bob - i * 0.9) * (0.07 + 0.08 * w) + turn * 0.12 * i * w;
    }
    Object.assign(this.poseBase, T);
    // raze: both arms rise overhead, then slam down in front on the impact frame
    let dip = 0;
    const slam = (e, k, s) => { T['upperX' + k] = -2.5 + 1.9 * e; T['upperZ' + k] = s * 0.25 * (1 - e); T['foreX' + k] = -0.5 + 0.2 * e; T['handX' + k] = -0.3 + 0.1 * e; };
    if (this.cast) {
      const c = 1 - this.cast.t / CFG.castTime;
      if (c < 0.6) {
        const e = smooth(0, 0.6, c);
        for (const [s, k] of [[1, 'R'], [-1, 'L']]) { T['upperX' + k] = -2.5 * e; T['upperZ' + k] = s * 0.25 * e; T['foreX' + k] = -0.5 * e; T['handX' + k] = -0.3 * e; }
        T.chestX = 0.1 - 0.35 * e; T.pelvisX = 0.1 - 0.1 * e; T.neckX = -0.1; T.headX = -0.15 * e;
      } else {
        const e = smooth(0.6, 1, c);
        for (const [s, k] of [[1, 'R'], [-1, 'L']]) slam(e, k, s);
        T.chestX = -0.25 + 0.75 * e; T.pelvisX = 0.35 * e; T.neckX = -0.1 - 0.2 * e; T.headX = 0.1 * e;
        dip = 0.08 * e;
      }
    } else if (this.post > 0) { // hold the slam, then settle back into the glide pose computed above
      const e = smooth(0.15, 1, 1 - this.post / 0.38), H = this.poseHold;
      for (const [s, k] of [[1, 'R'], [-1, 'L']]) slam(1, k, s);
      for (const k of ['R', 'L']) for (const p of ['upperX', 'upperZ', 'foreX', 'handX']) { H[p + k] = T[p + k]; }
      H.chestX = 0.5; H.pelvisX = 0.35; H.neckX = -0.3; H.headX = 0.1;
      for (const p in H) T[p] = H[p] + (this.poseBase[p] - H[p]) * e;
      dip = 0.08 * (1 - e);
    }
    if (this.flinch > 0) {
      this.flinch = Math.max(0, this.flinch - dt * 4);
      T.chestX -= this.flinch * 0.35; T.neckX += this.flinch * 0.2; T.upperZR += this.flinch * 0.4; T.upperZL -= this.flinch * 0.4;
    }
    const r = 1 - Math.exp(-dt * (this.cast ? 28 : 12)), C = this.pose;
    for (const p in T) C[p] = C[p] === undefined ? T[p] : C[p] + (T[p] - C[p]) * r;
    this.dip = dip; this.bank = Math.max(-0.3, Math.min(0.3, -this.yawS * 0.035)) * w;
    const B = this.model.userData.bones; if (!B) return;
    B.pelvis.rotation.x = C.pelvisX; B.chest.rotation.set(C.chestX, C.chestY, 0); B.neck.rotation.x = C.neckX; B.head.rotation.x = C.headX;
    for (const k of ['R', 'L']) {
      B['clav' + k].rotation.x = C['clavX' + k];
      B['upper' + k].rotation.set(C['upperX' + k], 0, C['upperZ' + k]);
      B['fore' + k].rotation.x = C['foreX' + k]; B['hand' + k].rotation.x = C['handX' + k];
    }
    for (let i = 1; i <= 3; i++) B['tail' + i].rotation.set(C['tailX' + i], 0, C['tailZ' + i]);
  }
  visual(dt, t) {
    const alive = this.alive;
    this.seen = this === player || !player || canSee(player, this.pos.x, this.pos.z);
    this.root.visible = this.seen;
    this.root.position.set(this.pos.x, 0, this.pos.z);
    this.flash = Math.max(0, this.flash - dt * 5);
    const m = this.model;
    for (const s of m.userData.shadows) s.visible = heroShadows;
    this.blob.material.opacity = heroShadows ? 0.35 : 0.6;
    m.rotation.y = this.facing;
    if (alive) {
      this.deathT = 0;
      this.animate(dt, t);
      // float: slow bob at rest, a gentle double bob per stride while gliding, no footfalls
      const w = Math.min(this.spdS, 1);
      const hover = 0.32 + Math.sin(t * 1.8 + this.bob) * 0.06 * (1 - w) + Math.sin(this.walkPhase * 2) * 0.025 * w - this.dip;
      m.position.set(0, hover, 0);
      m.rotation.order = 'YXZ';
      m.rotation.set(0, this.facing, this.bank); // bank into turns
      m.scale.setScalar(1 + this.flash * 0.06);
      this.ring.material.opacity = this.prot > 0 ? 0.3 + 0.3 * Math.sin(t * 20) : 0.6;
      this.ring.material.color.set(this.buffs.dd > 0 ? '#4a8aff' : this.color);
      const fx = Math.sin(this.facing), fz = Math.cos(this.facing), sv = this.seen;
      if (sv) for (let n = emitN(42, dt); n > 0; n--) particles.spawn(this.pos.x - fx * 0.15 + rnd(-0.15, 0.15), hover + 0.15, this.pos.z - fz * 0.15 + rnd(-0.15, 0.15), rnd(-0.3, 0.3) - this.vel.x * 0.15, rnd(-0.2, 0.6), rnd(-0.3, 0.3) - this.vel.z * 0.15, rnd(0.4, 0.8), 0.7, 0.1, FIRE0, FIRE1, 0.5, 1);
      if (sv) for (let n = emitN(this.souls / CFG.maxSouls * 48, dt); n > 0; n--) { const a = rnd(0, 7); particles.spawn(this.pos.x + Math.cos(a) * 0.8, rnd(0.6, 2), this.pos.z + Math.sin(a) * 0.8, 0, rnd(0.3, 1), 0, 0.9, 0.35, 0.05, SOUL0, [0.5, 0, 0.1], 0.3, 0); }
      if (sv && this.buffs.haste > 0) for (let n = emitN(36, dt); n > 0; n--) particles.spawn(this.pos.x, rnd(0.3, 1.8), this.pos.z, -this.vel.x * 0.3, 0.2, -this.vel.z * 0.3, 0.4, 0.5, 0.1, [1, 0.25, 0.15], [0.3, 0, 0], 0, 1);
      if (sv && this.buffs.regen > 0) for (let n = emitN(30, dt); n > 0; n--) particles.spawn(this.pos.x + rnd(-0.6, 0.6), 0.2, this.pos.z + rnd(-0.6, 0.6), 0, rnd(1, 2), 0, 0.8, 0.4, 0.1, [0.3, 1, 0.4], [0, 0.3, 0.1], 0, 0);
      if (this.cast) this.tele.visible = sv;
      if (this.cast && sv) { // claws gather shadow-fire during the wind-up
        const k = 1 - this.cast.t / CFG.castTime, rx = fz, rz = -fx;
        for (let n = emitN(60, dt); n > 0; n--) for (const s of [-1, 1]) particles.spawn(this.pos.x + rx * s * 0.8 + fx * 0.4, 1.0 + k * 1.6, this.pos.z + rz * s * 0.8 + fz * 0.4, rnd(-0.3, 0.3), rnd(0, 0.5), rnd(-0.3, 0.3), 0.3, 0.6, 0.1, this.buffs.dd > 0 ? [0.4, 0.6, 1] : [1, 0.4, 0.1], [0.3, 0, 0], 0, 1);
        this.tele.scale.setScalar(CFG.razeR * (0.55 + 0.45 * k)); this.tele.material.opacity = 0.25 + 0.5 * k;
      }
    } else {
      this.deathT += dt;
      const k = Math.min(this.deathT / 0.7, 1);
      m.scale.setScalar(Math.max(0.001, 1 - k)); m.position.y = 0.32 - k * 0.6; m.rotation.y += k * 6;
      this.ring.material.opacity = 0; this.tele.visible = false;
    }
    for (const mat of m.userData.mats) if (mat.userData.base) mat.color.copy(mat.userData.base).multiplyScalar(1 + this.flash * 3);
  }
}

function earVol(p) { if (!player) return 0.5; const d = p.distanceTo(player.pos); return Math.max(0, 1 - d / 26); }

function resolveRaze(u, slot) {
  const c = u.razeCenter(slot), dd = u.buffs.dd > 0;
  razeFx(c.x, c.y, u.souls / CFG.maxSouls, dd);
  sfx('raze', u.isPlayer ? 1 : earVol(new THREE.Vector3(c.x, 0, c.y)), { x: c.x });
  if (player) { const d = Math.hypot(c.x - player.pos.x, c.y - player.pos.z); shake = Math.max(shake, Math.max(0, 0.38 - d * 0.03)); }
  const dmg = (CFG.baseDmg + u.souls * CFG.soulDmg) * (dd ? 2 : 1);
  for (const o of units) {
    if (o === u || !o.alive || o.prot > 0) continue;
    if (Math.hypot(o.pos.x - c.x, o.pos.z - c.y) <= CFG.razeR + CFG.unitR) damage(o, dmg, u);
  }
}
function damage(o, amt, src) {
  o.hp -= amt; o.flash = 1; o.flinch = 1; o.lastHitBy = src; o.lastHitT = gameTime;
  src.souls = Math.min(CFG.maxSouls, src.souls + 1);
  sfx('hit', o.isPlayer || src.isPlayer ? 0.9 : earVol(o.pos) * 0.7, o.pos);
  if (o.seen !== false || src === player) floatText(o.pos, Math.round(amt), src === player ? '#ffd04a' : o === player ? '#ff5a5a' : '#ffb04a');
  for (let i = 0; i < 16; i++) particles.spawn(o.pos.x, 1.2, o.pos.z, rnd(-3, 3), rnd(1, 4), rnd(-3, 3), 0.5, 0.5, 0.1, [1, 0.3, 0.2], [0.3, 0, 0], -6, 2);
  if (o.hp <= 0) kill(o, src, false);
}
function kill(o, src, env) {
  if (!o.alive) return;
  o.alive = false; o.hp = 0; o.respawnT = CFG.respawn; o.deaths++; o.cast = null; o.moveTarget = null; o.tele.visible = false;
  for (const k in o.buffs) o.buffs[k] = 0;
  const lost = Math.floor(o.souls / 2); o.souls -= lost; const prevStreak = o.streak; o.streak = 0;
  for (let i = 0; i < 70; i++) { const a = rnd(0, 7), s = rnd(1, 6); particles.spawn(o.pos.x, rnd(0.4, 2), o.pos.z, Math.cos(a) * s, rnd(1, 7), Math.sin(a) * s, rnd(0.6, 1.2), rnd(0.6, 1.2), 0.1, [1, 0.4, 0.15], [0.2, 0, 0.05], -3, 1.5); }
  for (let i = 0; i < 14; i++) smoke.spawn(o.pos.x + rnd(-0.5, 0.5), rnd(0.5, 1.5), o.pos.z + rnd(-0.5, 0.5), rnd(-0.5, 0.5), rnd(1, 2), rnd(-0.5, 0.5), 1.6, 1.4, 3, SMOKE0, SMOKE1, 0, 0.5);
  sfx('death', o.isPlayer ? 1 : earVol(o.pos), o.pos);
  const how = MAP.edge === 'abyss' ? 'into the abyss' : 'into the lava';
  let msg;
  if (src && src !== o) {
    src.kills++; src.streak++; src.souls = Math.min(CFG.maxSouls, src.souls + 4);
    soulOrbs(o.pos, src, 6 + Math.min(lost, 10));
    if (src.isPlayer) sfx('kill', 0.9);
    msg = `<b style="color:${src.color}">${src.name}</b> ${env ? 'drove' : 'razed'} <b style="color:${o.color}">${o.name}</b>${env ? ' ' + how : ''}`;
    if (!firstBlood) { firstBlood = true; announce('FIRST BLOOD', `${src.name} has drawn first blood!`, 'firstblood'); }
    else {
      src.multi = gameTime - src.multiT < 4 ? src.multi + 1 : 1; src.multiT = gameTime;
      if (src.multi >= 2) { const m = MULTI[Math.min(src.multi, 5)]; announce(m[0], src.name, m[1]); }
      else if (src.streak >= 3) { const s = STREAKS[Math.min(src.streak, 10)]; announce('', `${src.name} ${s[0]}`, s[1]); }
    }
    if (prevStreak >= 3) killfeed(`<b style="color:${src.color}">${src.name}</b> ended ${o.name}'s spree`);
  } else msg = `<b style="color:${o.color}">${o.name}</b> fell ${how}`;
  killfeed(msg);
  if (src && src.kills >= settings.kills) endGame(src);
}
function freeSpot(margin) {
  for (let i = 0; i < 200; i++) {
    const x = rnd(-MAP.hx, MAP.hx), z = rnd(-MAP.hz, MAP.hz);
    if (sdArena(x, z) > -margin || hazardAt(x, z) && hazardAt(x, z).type === 'lava') continue;
    if (MAP.obstacles.some(o => Math.hypot(o.x - x, o.z - z) < o.r + 1.2)) continue;
    return new THREE.Vector3(x, 0, z);
  }
  return new THREE.Vector3(0, 0, 0);
}
function respawn(u) {
  let best = null, bestD = -1;
  for (let i = 0; i < 14; i++) {
    const p = freeSpot(3);
    let md = 99; for (const o of units) if (o !== u && o.alive) md = Math.min(md, o.pos.distanceTo(p));
    if (md > bestD) { bestD = md; best = p; }
  }
  u.pos.copy(best); u.prev.copy(best); u.slide.set(0, 0); u.facing = Math.atan2(-best.x, -best.z);
  u.alive = true; u.hp = CFG.hp; u.prot = CFG.spawnProt; u.cd = [0, 0, 0];
  if (u.isPlayer && state === 'play') sfx('respawn', 0.8);
  for (let i = 0; i < 40; i++) { const a = rnd(0, 7); particles.spawn(u.pos.x + Math.cos(a) * 1.2, 0.1, u.pos.z + Math.sin(a) * 1.2, -Math.cos(a), rnd(2, 5), -Math.sin(a), 0.7, 0.8, 0.1, [1, 0.5, 0.2], [0.4, 0, 0], 0, 1); }
}

const orbs = [];
function soulOrbs(from, to, n) {
  for (let i = 0; i < n; i++) orbs.push({ p: new THREE.Vector3(from.x + rnd(-0.5, 0.5), rnd(1, 2), from.z + rnd(-0.5, 0.5)), v: new THREE.Vector3(rnd(-4, 4), rnd(3, 6), rnd(-4, 4)), to, t: 0 });
  if (to.isPlayer) setTimeout(() => sfx('soul', 0.45), 450);
}
function updateOrbs(dt) {
  for (let i = orbs.length - 1; i >= 0; i--) {
    const o = orbs[i]; o.t += dt;
    const tgt = new THREE.Vector3(o.to.pos.x, 1.3, o.to.pos.z), d = tgt.clone().sub(o.p), dist = d.length();
    o.v.multiplyScalar(Math.max(0, 1 - 2.5 * dt)).add(d.normalize().multiplyScalar(40 * dt * Math.min(1, o.t * 2)));
    o.p.addScaledVector(o.v, dt);
    for (let n = emitN(60, dt); n > 0; n--) particles.spawn(o.p.x, o.p.y, o.p.z, 0, 0, 0, 0.35, 0.7, 0.05, [1, 0.55, 0.3], [0.6, 0, 0.2], 0, 0);
    if (dist < 0.5 || o.t > 3) orbs.splice(i, 1);
  }
}

// ------------------------------------------------------------------ runes
let rune = null, runeT = 0;
const runeMesh = new THREE.Group(); scene.add(runeMesh); runeMesh.visible = false;
const runeGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff0000, emissiveIntensity: 2.2, roughness: 0.2, metalness: 0.3 }));
runeGem.position.y = 1.1; runeMesh.add(runeGem);
const runeRing = new THREE.Mesh(quadGeo, new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
runeRing.rotation.x = -Math.PI / 2; runeRing.position.y = 0.08; runeRing.scale.setScalar(1.3); runeMesh.add(runeRing);
const runeLight = new THREE.PointLight(0xff0000, 0, 7, 2); runeLight.position.y = 1.2; scene.add(runeLight);
function spawnRune() {
  const spot = MAP.runes[Math.random() * MAP.runes.length | 0], types = Object.keys(RUNES), type = types[Math.random() * types.length | 0];
  rune = { x: spot[0], z: spot[1], type }; const R = RUNES[type];
  runeMesh.position.set(rune.x, 0, rune.z); runeMesh.visible = true; runeLight.position.set(rune.x, 1.2, rune.z); runeLight.intensity = 1.4;
  runeGem.material.emissive.set(R.color); runeRing.material.color.set(R.color); runeLight.color.set(R.color);
  killfeed(`<span style="color:${R.css}">A ${R.name} rune has appeared!</span>`);
}
function takeRune(u) {
  const R = RUNES[rune.type]; u.buffs[rune.type] = R.dur;
  killfeed(`<b style="color:${u.color}">${u.name}</b> activated <span style="color:${R.css}">${R.name}</span>`);
  sfx('rune', u.isPlayer ? 0.9 : earVol(u.pos) * 0.7, u.pos);
  for (let i = 0; i < 40; i++) { const a = rnd(0, 7); const c = new THREE.Color(R.color); particles.spawn(rune.x, 1, rune.z, Math.cos(a) * 3, rnd(1, 4), Math.sin(a) * 3, 0.6, 0.6, 0.1, [c.r, c.g, c.b], [0, 0, 0], -4, 2); }
  rune = null; runeMesh.visible = false; runeLight.intensity = 0; runeT = CFG.runeEvery;
}

// ------------------------------------------------------------------ bots
function pathCrossesLava(ax, az, bx, bz) {
  for (let i = 1; i < 12; i++) { const t = i / 12, h = hazardAt(ax + (bx - ax) * t, az + (bz - az) * t); if (h && h.type === 'lava') return true; }
  return false;
}
class Bot {
  constructor(u, d) { this.u = u; this.d = d; this.think = rnd(0, 0.5); this.strafe = Math.random() < 0.5 ? 1 : -1; this.target = null; this.pendingCast = -1; this.castDelay = 0; }
  step(dt) {
    const u = this.u, D = this.d;
    if (!u.alive || u.cast) return;
    if (this.pendingCast >= 0) { this.castDelay -= dt; if (this.castDelay <= 0) { u.castRaze(this.pendingCast); this.pendingCast = -1; } return; }
    this.think -= dt; if (this.think > 0) return;
    this.think = D.react * rnd(0.6, 1.4);
    // escape lava immediately
    const hz = hazardAt(u.pos.x, u.pos.z);
    if (hz && hz.type === 'lava') { const side = u.pos.z >= 0 ? 1 : -1; u.moveTo(u.pos.x, u.pos.z + side * 3); return; }
    // dodge incoming razes
    for (const e of units) {
      if (e === u || !e.alive || !e.cast || !canSee(u, e.pos.x, e.pos.z)) continue;
      const c = e.razeCenter(e.cast.slot), dx = u.pos.x - c.x, dz = u.pos.z - c.y, d = Math.hypot(dx, dz);
      if (d < CFG.razeR + 0.9 && Math.random() < D.dodge) {
        let ax = dx, az = dz; if (d < 0.3) { ax = Math.cos(e.facing); az = -Math.sin(e.facing); }
        const l = Math.hypot(ax, az); this.goTo(u.pos.x + ax / l * 3, u.pos.z + az / l * 3, true); this.think = 0.3; return;
      }
    }
    // runes
    if (rune && Math.random() < D.rune) {
      const rd = Math.hypot(rune.x - u.pos.x, rune.z - u.pos.z);
      const closer = units.some(o => o !== u && o.alive && Math.hypot(rune.x - o.pos.x, rune.z - o.pos.z) < rd * 0.7);
      if (rd < 14 && !closer) { this.goTo(rune.x, rune.z); return; }
    }
    if (this.target && this.target.alive && canSee(u, this.target.pos.x, this.target.pos.z)) this.lastSeen = { x: this.target.pos.x, z: this.target.pos.z, t: gameTime };
    if (!this.target || !this.target.alive || !canSee(u, this.target.pos.x, this.target.pos.z) || Math.random() < 0.05) {
      let best = null, bd = 1e9;
      for (const o of units) if (o !== u && o.alive && canSee(u, o.pos.x, o.pos.z)) { const d = o.pos.distanceTo(u.pos) + (o.isPlayer ? -1.5 : 0) + rnd(0, 3); if (d < bd) { bd = d; best = o; } }
      this.target = best;
    }
    const t = this.target;
    if (!t) {
      if (this.lastSeen && gameTime - this.lastSeen.t < 3 && Math.hypot(this.lastSeen.x - u.pos.x, this.lastSeen.z - u.pos.z) > 1.5) { this.goTo(this.lastSeen.x, this.lastSeen.z); return; }
      if (!this.wander || Math.hypot(this.wander.x - u.pos.x, this.wander.z - u.pos.z) < 1.5 || Math.random() < 0.02) this.wander = freeSpot(3);
      this.goTo(this.wander.x, this.wander.z); return;
    }
    const lead = (CFG.castTime + D.cast) * D.lead;
    const px = t.pos.x + t.vel.x * lead + rnd(-D.aimErr, D.aimErr) * 0.5, pz = t.pos.z + t.vel.z * lead + rnd(-D.aimErr, D.aimErr) * 0.5;
    const dx = px - u.pos.x, dz = pz - u.pos.z, d = Math.hypot(dx, dz) || 0.01, ang = Math.atan2(dx, dz);
    const diff = Math.abs(wrap(ang - u.facing));
    let best = -1, err = 1e9;
    for (let s = 0; s < 3; s++) if (u.cd[s] <= 0) { const e = Math.abs(d - CFG.razeDist[s]); if (e < err) { err = e; best = s; } }
    if (best >= 0 && err < CFG.razeR * 0.6 && t.prot <= 0) {
      if (diff < 0.2) { this.pendingCast = best; this.castDelay = D.cast * rnd(0.5, 1.5); u.moveTarget = null; return; }
      u.moveTarget = null; u.faceAngle = ang; this.think = 0.05; return;
    }
    if (Math.random() < 0.08) this.strafe *= -1;
    const want = best >= 0 ? CFG.razeDist[best] : 8.5;
    const nx = dx / d, nz = dz / d;
    this.goTo(px - nx * want - nz * this.strafe * 1.4, pz - nz * want + nx * this.strafe * 1.4);
  }
  goTo(x, z, urgent) {
    const u = this.u;
    for (let i = 0; i < 20 && sdArena(x, z) > -1.6; i++) { x *= 0.92; z *= 0.92; }
    const h = hazardAt(x, z); if (h && h.type === 'lava') z += (z >= 0 ? 1 : -1) * (h.r + 1 - Math.abs(z));
    if (!urgent && MAP.bridges && pathCrossesLava(u.pos.x, u.pos.z, x, z)) {
      let bb = null, bc = 1e9;
      for (const [bx, bz] of MAP.bridges) { const c = Math.hypot(bx - u.pos.x, bz - u.pos.z) + Math.hypot(x - bx, z - bz); if (c < bc) { bc = c; bb = [bx, bz]; } }
      const onBridge = Math.abs(u.pos.x - bb[0]) < 1.4 && Math.abs(u.pos.z) < 3.5;
      if (!onBridge) { x = bb[0]; z = bb[1] + (u.pos.z >= 0 ? 2.6 : -2.6); }
      else { x = bb[0]; z = u.pos.z >= 0 ? -3 : 3; }
    }
    u.moveTo(x, z);
  }
}
let bots = [];

// ------------------------------------------------------------------ input
const keys = {}; let rightDown = false;
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function groundPoint(e) {
  mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, camera); const p = new THREE.Vector3();
  return ray.ray.intersectPlane(plane, p) ? p : null;
}
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
renderer.domElement.addEventListener('mousedown', e => {
  if (state !== 'play' || !player) return;
  if (e.button === 2) { rightDown = true; const p = groundPoint(e); if (p) { player.moveTo(p.x, p.z); clickFx(p.x, p.z); } }
});
addEventListener('mouseup', e => { if (e.button === 2) rightDown = false; });
renderer.domElement.addEventListener('mousemove', e => {
  if (rightDown && state === 'play' && player) { const p = groundPoint(e); if (p) player.moveTo(p.x, p.z); }
});
addEventListener('wheel', e => { zoom = Math.max(0.6, Math.min(1.5, zoom + Math.sign(e.deltaY) * 0.08)); });
addEventListener('keydown', e => {
  const k = e.key.toLowerCase(); keys[k] = true;
  if (state !== 'play' || !player || e.repeat) return;
  const slot = { z: 0, x: 1, c: 2, '1': 0, '2': 1, '3': 2 }[k];
  if (slot !== undefined) player.castRaze(slot);
  if (k === 's' && settings.move === 'mouse') { player.moveTarget = null; }
  if (k === 'm') { AUD.muted = !AUD.muted; announce('', AUD.muted ? 'Sound muted (M)' : 'Sound on (M)'); }
  if (k === 'escape') pauseToMenu();
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') pauseToMenu(); });
function pauseToMenu() { state = 'menu'; $('menu').classList.remove('hidden'); $('play').textContent = 'RESUME'; AUD.stopAmbient(); }
function wasd() {
  if (settings.move !== 'wasd') return null;
  return { x: (keys.d ? 1 : 0) - (keys.a ? 1 : 0), z: (keys.s ? 1 : 0) - (keys.w ? 1 : 0) };
}

// ------------------------------------------------------------------ HUD
const floats = [];
function floatText(pos, txt, color) {
  const el = document.createElement('div'); el.className = 'dmg'; el.textContent = txt; el.style.color = color;
  labelsEl.appendChild(el); floats.push({ el, p: new THREE.Vector3(pos.x + rnd(-0.3, 0.3), 2.6, pos.z), t: 0 });
}
let annT = 0;
function announce(big, small, voiceKey) {
  if (voiceKey) AUD.announce(voiceKey);
  $('announce').textContent = big; $('sub-announce').textContent = small; $('announce').style.opacity = big ? 1 : 0; $('sub-announce').style.opacity = 1; annT = 2.8;
}
function killfeed(html) { const d = document.createElement('div'); d.innerHTML = html; $('killfeed').prepend(d); while ($('killfeed').children.length > 6) $('killfeed').lastChild.remove(); setTimeout(() => d.remove(), 7000); }
const mm = $('minimap').getContext('2d'); const slots = [...document.querySelectorAll('.slot')];
const tmpV = new THREE.Vector3();
function project(p, y) { tmpV.set(p.x, y, p.z).project(camera); return [(tmpV.x * 0.5 + 0.5) * innerWidth, (-tmpV.y * 0.5 + 0.5) * innerHeight, tmpV.z]; }
let hudT = 0, mmT = 0, lastBuffs = '';
function updateHud(dt) {
  for (const u of units) {
    const [x, y, z] = project(u.pos, 3.5);
    const show = u.alive && z < 1 && u.seen !== false;
    u.label.style.display = show ? '' : 'none';
    if (show) { u.label.style.left = x + 'px'; u.label.style.top = y + 'px'; const f = u.hp / CFG.hp; u.hbEl.style.width = (f * 100) + '%'; u.hbEl.style.background = f > 0.5 ? '#4adf4a' : f > 0.25 ? '#e0c030' : '#e04030'; }
  }
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.t += dt; f.p.y += dt * 1.6;
    const [x, y] = project(f.p, f.p.y); f.el.style.left = x + 'px'; f.el.style.top = y + 'px'; f.el.style.opacity = 1 - f.t;
    if (f.t > 1) { f.el.remove(); floats.splice(i, 1); }
  }
  if (annT > 0) { annT -= dt; if (annT <= 0) { $('announce').style.opacity = 0; $('sub-announce').style.opacity = 0; } }
  if (!player) return;
  slots.forEach((el, s) => {
    const cd = player.cd[s]; el.querySelector('.cd').style.height = (cd / CFG.razeCd * 100) + '%';
    el.querySelector('.t').textContent = cd > 0.05 ? cd.toFixed(1) : '';
  });
  $('soulCount').textContent = player.souls;
  $('hpFill').style.width = (player.hp / CFG.hp * 100) + '%';
  $('hpText').textContent = `${Math.ceil(player.hp)} / ${CFG.hp}`;
  $('respawn').textContent = player.alive ? '' : `Respawning in ${Math.max(0, player.respawnT).toFixed(1)}…`;
  const bh = Object.keys(RUNES).filter(k => player.buffs[k] > 0).map(k => `<span style="border-color:${RUNES[k].css};color:${RUNES[k].css}">${RUNES[k].name} ${player.buffs[k].toFixed(0)}s</span>`).join('');
  if (bh !== lastBuffs) { $('buffs').innerHTML = bh; lastBuffs = bh; }
  hudT -= dt;
  if (hudT <= 0) {
    hudT = 0.25;
    const sorted = [...units].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    $('scoreboard').innerHTML = `<div class="r h"><span>${MAP.name} — first to ${settings.kills}</span><span>K / D</span></div>` +
      sorted.map(u => `<div class="r ${u.isPlayer ? 'me' : ''}"><span style="color:${u.color}">${u.name}</span><span>${u.kills} / ${u.deaths}</span></div>`).join('');
  }
  mmT -= dt; if (mmT <= 0) { mmT = 0.05; drawMinimap(); }
}
function drawMinimap() {
  const S = 180, ext = Math.max(MAP.hx, MAP.hz) + 1, k = (S / 2 - 6) / ext, X = x => S / 2 + x * k;
  mm.clearRect(0, 0, S, S);
  mm.save(); mm.beginPath(); mm.arc(S / 2, S / 2, S / 2 - 1, 0, 7); mm.clip();
  mm.fillStyle = MAP.theme === 'molten' ? '#3a1408' : MAP.theme === 'river' ? '#0c0f14' : '#05080e'; mm.fillRect(0, 0, S, S);
  mm.fillStyle = MAP.theme === 'frozen' ? '#46566a' : MAP.theme === 'river' ? '#1e2a16' : '#2a1d18';
  mm.beginPath();
  if (MAP.r >= Math.min(MAP.hx, MAP.hz)) mm.arc(S / 2, S / 2, MAP.hx * k, 0, 7);
  else { const hx = MAP.hx * k, hz = MAP.hz * k, r = MAP.r * k, c = S / 2; mm.moveTo(c - hx + r, c - hz); mm.arcTo(c + hx, c - hz, c + hx, c + hz, r); mm.arcTo(c + hx, c + hz, c - hx, c + hz, r); mm.arcTo(c - hx, c + hz, c - hx, c - hz, r); mm.arcTo(c - hx, c - hz, c + hx, c - hz, r); }
  mm.fill();
  mm.lineCap = 'round';
  for (const h of MAP.hazards) { mm.strokeStyle = h.type === 'lava' ? '#ff5a10' : '#1a4a6a'; mm.lineWidth = h.r * 2 * k; mm.beginPath(); mm.moveTo(X(h.a[0]), X(h.a[1])); mm.lineTo(X(h.b[0]), X(h.b[1])); mm.stroke(); }
  for (const c of MAP.ice || []) { mm.fillStyle = '#7aa4c8'; mm.beginPath(); mm.arc(X(c.x), X(c.z), c.r * k, 0, 7); mm.fill(); }
  if (fogOn && player) { const r = FOW_U.fowRect.value; mm.imageSmoothingEnabled = true; mm.drawImage(fowCanvas, X(r.x), X(r.y), r.z * k, r.w * k); }
  mm.fillStyle = '#000a'; for (const o of MAP.obstacles) { mm.beginPath(); mm.arc(X(o.x), X(o.z), o.r * k + 1, 0, 7); mm.fill(); }
  if (rune) { mm.fillStyle = RUNES[rune.type].css; mm.beginPath(); mm.arc(X(rune.x), X(rune.z), 4, 0, 7); mm.fill(); }
  for (const u of units) {
    if (!u.alive || u.seen === false) continue;
    const x = X(u.pos.x), y = X(u.pos.z);
    mm.fillStyle = u.color; mm.beginPath(); mm.arc(x, y, u.isPlayer ? 5 : 4, 0, 7); mm.fill();
    mm.strokeStyle = u.color; mm.lineWidth = 2; mm.beginPath(); mm.moveTo(x, y); mm.lineTo(x + Math.sin(u.facing) * 9, y + Math.cos(u.facing) * 9); mm.stroke();
  }
  mm.restore();
}

// ------------------------------------------------------------------ game flow
function startGame() {
  AUD.init();
  settings = { bots: +$('optBots').value, diff: $('optDiff').value, kills: +$('optKills').value, move: $('optMove').value, fog: $('optFog').value, gfx: $('optGfx').value, map: $('optMap').value };
  units.forEach(u => u.dispose()); units = []; bots = []; orbs.length = 0; firstBlood = false; gameTime = 0;
  particles.clear(); smoke.clear(); rune = null; runeMesh.visible = false; runeLight.intensity = 0; runeT = CFG.firstRune;
  buildMap(settings.map);
  setQuality(settings.gfx);
  AUD.startAmbient(MAP.theme);
  player = new Unit(0, 'You', true); units.push(player);
  for (let i = 0; i < settings.bots; i++) { const u = new Unit(i + 1, NAMES[i], false); units.push(u); bots.push(new Bot(u, DIFF[settings.diff])); }
  units.forEach(u => respawn(u));
  camLook.set(player.pos.x, 0, player.pos.z);
  fogOn = settings.fog !== 'off'; fowCur.fill(0);
  fowAll(scene);
  prewarm();
  $('menu').classList.add('hidden'); $('end').classList.add('hidden'); $('hud').classList.remove('hidden');
  $('help').style.display = ''; setTimeout(() => { $('help').style.display = 'none'; }, 15000);
  $('killfeed').innerHTML = ''; announce('', `${MAP.name} — harvest their souls!`);
  state = 'play';
}
function endGame(w) {
  state = 'end';
  setTimeout(() => {
    $('endTitle').textContent = w.isPlayer ? 'VICTORY' : `${w.name.toUpperCase()} WINS`;
    $('endTable').innerHTML = [...units].sort((a, b) => b.kills - a.kills).map(u => `<div class="r"><span style="color:${u.color}">${u.name}</span><span>${u.kills} kills · ${u.deaths} deaths</span></div>`).join('');
    $('end').classList.remove('hidden');
  }, 1200);
}
$('optVol').value = Math.round(AUD.volume * 100);
$('optVol').oninput = e => { AUD.volume = e.target.value / 100; AUD.muted = false; };
// options that define the match: changing one while paused means a new game, the rest apply on resume
const MATCH_OPTS = { optMap: 'map', optBots: 'bots', optDiff: 'diff', optKills: 'kills', optFog: 'fog' };
const matchChanged = () => Object.entries(MATCH_OPTS).some(([id, k]) => $(id).value !== String(settings[k]));
const paused = () => state === 'menu' && units.length && $('play').textContent !== 'PLAY';
$('play').onclick = () => {
  if (paused() && !matchChanged()) {
    settings.move = $('optMove').value;
    if ($('optGfx').value !== settings.gfx) { settings.gfx = $('optGfx').value; setQuality(settings.gfx); }
    $('menu').classList.add('hidden'); state = 'play'; AUD.init(); AUD.startAmbient(MAP.theme);
  } else startGame();
};
$('again').onclick = () => { $('play').textContent = 'PLAY'; startGame(); };
for (const id of Object.keys(MATCH_OPTS)) $(id).addEventListener('change', () => { if (paused()) $('play').textContent = matchChanged() ? 'NEW GAME' : 'RESUME'; });
$('optMap').onchange = () => { if (state === 'menu' && !units.length) buildMap($('optMap').value); };

// ------------------------------------------------------------------ main loop
let last = performance.now(), acc = 0, time = 0, beatT = 0;
const camPos = new THREE.Vector3(0, 30, 30), camLook = new THREE.Vector3(), tmpCam = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now; time += dt; timeU.value = time;
  if (state === 'play' || state === 'end') {
    acc += dt;
    while (acc >= CFG.step) {
      const st = CFG.step; gameTime += st;
      if (state === 'play') {
        bots.forEach(b => b.step(st));
        if (!rune) { runeT -= st; if (runeT <= 0) spawnRune(); }
      }
      units.forEach(u => u.step(st, u.isPlayer ? wasd() : null));
      for (let i = 0; i < units.length; i++) for (let j = i + 1; j < units.length; j++) {
        const a = units[i], b = units[j]; if (!a.alive || !b.alive) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), m = CFG.unitR * 2;
        if (d < m && d > 1e-4) { const p = (m - d) / 2 / d; a.pos.x -= dx * p; a.pos.z -= dz * p; b.pos.x += dx * p; b.pos.z += dz * p; }
      }
      acc -= st;
    }
  }
  units.forEach(u => u.visual(dt, time));
  updateFog(dt);
  if (state === 'play') adaptResolution(dt);
  if (state === 'play' && player && player.alive && player.hp < CFG.hp * 0.3) { beatT -= dt; if (beatT <= 0) { beatT = 0.55 + player.hp / CFG.hp * 1.2; sfx('heartbeat', 0.8); } } else beatT = 0;
  updateOrbs(dt);
  // ambience per map
  const m = MAP;
  if (m.theme === 'molten') {
    for (let n = emitN(180, dt); n > 0; n--) { const a = rnd(0, 7), r = rnd(m.hx - 2, m.hx + 12); particles.spawn(Math.cos(a) * r, -1, Math.sin(a) * r * 0.85, rnd(-0.3, 0.3), rnd(1, 2.5), rnd(-0.3, 0.3), rnd(2, 4), rnd(0.15, 0.35), 0.05, EMBER, [0.3, 0.02, 0], 0.2, 0); }
    for (const h of m.hazards) for (let n = emitN(30, dt); n > 0; n--) { const t = Math.random(); particles.spawn(h.a[0] + (h.b[0] - h.a[0]) * t, 0.1, h.a[1] + rnd(-h.r, h.r), 0, rnd(0.8, 2), 0, rnd(1, 2), rnd(0.2, 0.5), 0.05, EMBER, [0.3, 0.02, 0], 0.2, 0); }
    for (const e of m._emit || []) for (let n = emitN(9, dt); n > 0; n--) particles.spawn(e[0] + rnd(-0.3, 0.3), e[1] * rnd(0.3, 1), e[2] + rnd(-0.3, 0.3), 0, rnd(0.3, 0.8), 0, 1.2, 0.3, 0.05, [1, 0.15, 0.05], [0.3, 0, 0], 0, 0);
  } else if (m.theme === 'river') {
    for (let n = emitN(36, dt); n > 0; n--) particles.spawn(rnd(-m.hx, m.hx), rnd(0.5, 3), rnd(-m.hz, m.hz), rnd(-0.3, 0.3), rnd(-0.1, 0.2), rnd(-0.3, 0.3), rnd(2, 4), 0.18, 0.1, [0.6, 1, 0.4], [0.1, 0.3, 0.05], 0, 0);
    for (let n = emitN(18, dt); n > 0; n--) { const t = Math.random(), h = m.hazards[0]; smoke.spawn(h.a[0] + (h.b[0] - h.a[0]) * t, 0.3, h.a[1] + (h.b[1] - h.a[1]) * t + rnd(-2, 2), 0.3, 0.1, 0.2, 4, 2, 4, [0.12, 0.16, 0.22], [0.05, 0.07, 0.1], 0, 0); }
  } else {
    for (let n = emitN(240, dt); n > 0; n--) { const cx = camLook.x + rnd(-25, 25), cz = camLook.z + rnd(-20, 25); particles.spawn(cx, rnd(10, 14), cz, rnd(-0.6, 0.2), -rnd(1.2, 2), rnd(-0.3, 0.3), 7, 0.14, 0.14, [0.7, 0.8, 0.95], [0.5, 0.6, 0.75], 0, 0); }
    for (let n = emitN(24, dt); n > 0; n--) { const p = edgePointsCache[Math.random() * edgePointsCache.length | 0]; if (p) smoke.spawn(p[0], -1, p[1], 0, rnd(0.5, 1.2), 0, 3, 2, 4, [0.2, 0.28, 0.38], [0.08, 0.1, 0.14], 0, 0); }
  }
  if (rune) { runeGem.rotation.y += dt * 2; runeGem.position.y = 1.1 + Math.sin(time * 3) * 0.15; runeRing.material.opacity = 0.6 + 0.3 * Math.sin(time * 5); for (let n = emitN(24, dt); n > 0; n--) { const c = new THREE.Color(RUNES[rune.type].color); particles.spawn(rune.x + rnd(-0.4, 0.4), 0.3, rune.z + rnd(-0.4, 0.4), 0, rnd(1, 2), 0, 0.8, 0.35, 0.05, [c.r, c.g, c.b], [0, 0, 0], 0, 0); } }
  particles.update(dt); smoke.update(dt);
  for (const f of fx) {
    if (!f.mesh.visible) continue;
    f.t += dt; const k = Math.min(f.t / f.dur, 1);
    f.mesh.scale.setScalar(f.s0 + (f.s1 - f.s0) * (1 - Math.pow(1 - k, 3)));
    f.mesh.material.opacity = f.op * (1 - k);
    if (k >= 1) f.mesh.visible = false;
  }
  for (const c of columns) {
    if (!c.g.visible) continue;
    c.t += dt; const k = c.t / 0.75;
    const grow = Math.min(1, c.t / 0.1);
    c.g.scale.set(CFG.razeR * 0.75 * (0.7 + 0.3 * grow), 4.8 * (0.25 + 0.75 * grow) * (1 + k * 0.3), CFG.razeR * 0.75 * (0.7 + 0.3 * grow));
    c.dark.material.uniforms.life.value = c.fire.material.uniforms.life.value = Math.max(0, k * 1.15 - 0.1);
    if (k >= 1) c.g.visible = false;
  }
  for (const fl of flashLights) { fl.t = Math.max(0, fl.t - dt); fl.l.intensity = fl.t * 18; }
  glowLight.intensity = (MAP.theme === 'molten' ? 0.8 : 0.35) + Math.sin(time * 1.7) * 0.1;
  // camera
  if (player && state !== 'menu') {
    camLook.lerp(tmpCam.set(player.pos.x, 0, player.pos.z), 1 - Math.exp(-dt * 6));
    camPos.set(camLook.x, 16 * zoom, camLook.z + 11 * zoom);
  } else if (!player) {
    camLook.set(0, 0, 0); camPos.set(Math.sin(time * 0.1) * 30, 22, Math.cos(time * 0.1) * 30);
  }
  if (devCam) { camPos.copy(devCam.pos); camLook.copy(devCam.look); }
  shake = Math.max(0, shake - dt * 1.2);
  camera.position.copy(camPos); if (shake > 0) camera.position.add(tmpCam.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(shake));
  camera.lookAt(camLook);
  if (state !== 'menu' || player) updateHud(dt);
  renderer.render(scene, camera);
}
let edgePointsCache = [], devCam = null; // devCam: fixed camera for dev tools ({pos, look} Vector3s)
function prewarm() { // compile every effect shader now, not on the first raze/rune
  const hidden = [];
  const show = o => { if (!o.visible) { o.visible = true; hidden.push(o); } };
  columns.forEach(c => show(c.g)); ringPool.forEach(show); scorchPool.forEach(show); crackPool.forEach(show); show(runeMesh);
  units.forEach(u => show(u.tele));
  try { renderer.compile(scene, camera); } catch (e) {}
  hidden.forEach(o => { o.visible = false; });
}

// ------------------------------------------------------------------ boot
async function boot() {
  $('play').disabled = true; $('loadState').textContent = 'Summoning the Shadow Fiend…';
  const P = window.SFA_PROPS || {}, kinds = ['obelisk', 'gargoyle', 'column', 'tree', 'treeFar', 'ice'];
  const [hero, heroShadow, ...props] = await Promise.all([parseGLB(window.HERO_GLB_B64), parseGLB(window.HERO_SHADOW_GLB_B64), ...kinds.map(k => parseGLB(P[k]))]);
  if (hero) {
    heroTemplate = fitModel(hero, HERO_H);
    // low-poly shadow caster, in the same model space as the hero mesh
    heroShadow && heroShadow.traverse(o => { if (o.isMesh) heroTemplate.userData.shadowGeo = o.geometry; });
    heroTemplate.traverse(o => { if (o.isMesh) skinHero(o.geometry); });
    if (heroTemplate.userData.shadowGeo) skinHero(heroTemplate.userData.shadowGeo);
  }
  kinds.forEach((k, i) => { if (props[i]) PROP_TEMPLATES[k] = props[i]; });
  buildMap($('optMap').value);
  edgePointsCache = edgePoints(80, 0.5);
  setQuality('high');
  $('loadState').textContent = ''; $('play').disabled = false;
}
const origBuild = buildMap;
buildMap = function (id) { origBuild(id); edgePointsCache = edgePoints(80, 0.5); };
setQuality('high');
requestAnimationFrame(frame);
boot();
window.__game = { renderer, get fogOn() { return fogOn; },  get units() { return units; }, get state() { return state; }, get map() { return MAP; }, get rune() { return rune; }, CFG, buildMap: id => buildMap(id),
  get quality() { return { rung, autoQuality, heroShadows, fxDensity, pixelRatio: renderer.getPixelRatio() }; },
  set devCam(c) { devCam = c; },
  forceQuality(pr) { autoQuality = false; rung = 0; baseDpr = pr; applyRung(); } }; // for dev/bench.js
})();
