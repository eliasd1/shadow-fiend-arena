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
  // Requiem of Souls: one line per 2 souls, each hits a hero once
  ultCast: 1.0, ultCd: 35, ultMinSouls: 2, ultDmg: 70, ultRange: 10, ultSpeed: 17, ultWidth: 0.55, ultSlow: 0.3, ultSlowDur: 2,
};
const DIFF = {
  // items: chance to use an item when it makes sense; plan: buying order (wards only matter with fog on)
  easy:   { react: 0.42, dodge: 0.30, lead: 0.4, aimErr: 1.2, cast: 0.24, rune: 0.3, items: 0.35, plan: ['boots', 'salve', 'wand', 'treads', 'cyclone'] },
  normal: { react: 0.26, dodge: 0.58, lead: 0.85, aimErr: 0.6, cast: 0.13, rune: 0.6, items: 0.7, plan: ['boots', 'salve', 'wand', 'treads', 'dagger', 'cyclone', 'scepter', 'avatar'] },
  hard:   { react: 0.14, dodge: 0.85, lead: 1.0, aimErr: 0.25, cast: 0.08, rune: 0.9, items: 1.0, plan: ['boots', 'ward', 'treads', 'dagger', 'avatar', 'cyclone', 'blade', 'scepter', 'wand'] },
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

const { ITEMS, SHOP, GOLD, iconURL } = window.SFA_ITEMS;
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
// point-mirror a terrace or ramp through the arena centre (maps are symmetric so no side is favoured)
const mirT = t => t.r !== undefined ? { ...t, x: -t.x, z: -t.z } : t.rect ? { ...t, rect: [-t.rect[2], -t.rect[3], -t.rect[0], -t.rect[1]] } : { ...t, poly: t.poly.map(([x, z]) => [-x, -z]) };
const mirR = r => ({ ...r, a: [-r.a[0], -r.a[1]], b: [-r.b[0], -r.b[1]] });
const both = (list, f) => list.concat(list.map(f));
// the mirrored half of a two-sided map gets the Dusk version of each prop
const DUSK_PROP = { canopy: 'tree', spireDawn: 'spireDusk' };
const duskSide = list => list.map((o, i) => i < list.length / 2 ? o : { ...o, prop: DUSK_PROP[o.prop] || o.prop });
const MAPS = {
  // lava river with three bridges; each bank has a raised bastion in its back corner and a small lookout
  molten: {
    name: 'Scourge Pit', theme: 'molten', sight: 14, hx: 22, hz: 18, r: 6, edge: 'lava', edgeDps: 160,
    sky: 0x070203, fog: [0x170504, 0.015], hemi: [0x5a4a5a, 0x2a0603, 0.55], sun: [0xffb898, 1.25], exposure: 0.95,
    hazards: [
      { type: 'lava', a: [-30, 0], b: [-13.9, 0], r: 1.5 }, { type: 'lava', a: [-10.1, 0], b: [-1.9, 0], r: 1.5 },
      { type: 'lava', a: [1.9, 0], b: [10.1, 0], r: 1.5 }, { type: 'lava', a: [13.9, 0], b: [30, 0], r: 1.5 },
    ],
    bridges: [[-12, 0], [0, 0], [12, 0]],
    terraces: both([
      { poly: [[-21.2, -8.5], [-11.5, -8.5], [-11.5, -16.8], [-16.5, -16.8], [-21.2, -12.5]], h: 1.6 },
      { x: 14, z: -13, r: 3.3, h: 1.2 },
    ], mirT),
    ramps: both([
      { a: [-8.2, -12.6], b: [-11.5, -12.6], w: 3.2 }, { a: [-17, -5.0], b: [-17, -8.5], w: 3.0 },
      { a: [14, -7.2], b: [14, -9.7], w: 2.6 },
    ], mirR),
    obstacles: mirror([
      { prop: 'obelisk', x: -7, z: -8, r: 1.0, h: 5.5 }, { prop: 'obelisk', x: 7, z: -8, r: 1.0, h: 4.8 },
      { prop: 'obelisk', x: -16, z: -13, r: 1.0, h: 5.5 },
      { prop: 'shop', x: 0, z: -14.5, r: 1.8, h: 3.6, rot: 0 },
      { prop: 'brazier', x: -2.9, z: -14.5, r: 0.45, h: 1.6 }, { prop: 'brazier', x: 2.9, z: -14.5, r: 0.45, h: 1.6 }, { prop: 'brazier', x: -20.1, z: -9.6, r: 0.45, h: 1.6 }, // braziers by the merchant and on the bastion
    ]),
    decor: mirror([
      { prop: 'gargoyle', x: -26, z: -12, h: 4.5, rot: 0.6 }, { prop: 'gargoyle', x: 26, z: -12, h: 4.5, rot: -0.6 },
      { prop: 'obelisk', x: 0, z: -23, h: 9 }, { prop: 'obelisk', x: -14, z: -22.5, h: 7 }, { prop: 'obelisk', x: 14, z: -22.5, h: 7 },
      { prop: 'ziggurat', x: -25, z: -21, h: 8, rot: 0.7, opt: true }, { prop: 'skullBrazier', x: -23, z: -4, h: 3, rot: 1.6, opt: true },
      { prop: 'bonePile', x: -21, z: 20, h: 1.6, rot: 2, opt: true },
    ]),
    runes: [[-12, 0], [12, 0]],
  },
  // the classic mid-lane duel in daylight: a shallow river with the two rune spots, a cobbled lane up to a spire on
  // each bluff, lush summer forest on the Dawn side (bottom left) and blighted dead wood on the Dusk side (top right)
  river: {
    name: 'Mid Lane', theme: 'river', sight: 13, hx: 23, hz: 18, r: 5, edge: 'wall', outer: 0x121a0c,
    sky: 0x0e1a10, fog: [0x2a3a26, 0.011], hemi: [0xcfdcf0, 0x3a2e1c, 0.75], sun: [0xfff0d4, 1.35], exposure: 0.95,
    hazards: [{ type: 'water', a: [-30, -16.2], b: [30, 16.2], r: 2.7 }],
    dawn: (x, z) => z * 60 - x * 32.4 > 0, // which side of the river a point is on
    lane: [[-21, 13.6], [-14.6, 9.4], [-8.6, 5.6], [-6.5, 3.5], [0, 0], [6.5, -3.5], [8.6, -5.6], [14.6, -9.4], [21, -13.6]],
    terraces: both([{ x: -13, z: 10, r: 6.2, h: 1.6 }], mirT),
    ramps: both([{ a: [-6.5, 3.5], b: [-8.62, 5.62], w: 3.2 }, { a: [-3.6, 10], b: [-6.8, 10], w: 3.0 }], mirR),
    obstacles: duskSide(mirror([
      { prop: 'spireDawn', x: -9.6, z: 9.6, r: 1.15, h: 6.4, rot: 0.6 }, { prop: 'canopy', x: -17, z: 7.2, r: 0.85, h: 4.6 },
      { prop: 'canopy', x: -4, z: 13.5, r: 0.85, h: 4.4 }, { prop: 'canopy', x: -2.2, z: 15, r: 0.85, h: 4.8 }, { prop: 'canopy', x: -20, z: 1.5, r: 0.85, h: 4.5 },
      { prop: 'canopy', x: -9.5, z: 0.5, r: 0.9, h: 4.2 }, { prop: 'canopy', x: -16, z: -3, r: 0.9, h: 4.6 }, { prop: 'canopy', x: 6, z: 11.5, r: 0.9, h: 4.4 },
      { prop: 'shop', x: -15.2, z: 13, r: 1.8, h: 3.6, rot: Math.PI * 0.75 },
      { prop: 'brazier', x: -12.6, z: 14.6, r: 0.45, h: 1.6 }, { prop: 'brazier', x: -17.6, z: 11.2, r: 0.45, h: 1.6 }, // braziers by the merchant
    ])),
    decor: [],
    outsideTrees: true,
    runes: [[-10, -5.4], [10, 5.4]],
  },
  // a round ice platform over the abyss; the throne dais in the middle is high ground and covered in ice
  frozen: {
    name: 'Frozen Throne', theme: 'frozen', sight: 15, hx: 20, hz: 20, r: 20, edge: 'abyss', edgeDps: 600,
    sky: 0x0b1018, fog: [0x1a2635, 0.017], hemi: [0x7080a8, 0x141a26, 0.6], sun: [0xcfe2ff, 1.15], exposure: 0.8,
    hazards: [], ice: [{ x: 0, z: 0, r: 4.7 }],
    terraces: [{ x: 0, z: 0, r: 6, h: 1.7 }],
    ramps: [45, 135, 225, 315].map(d => { const a = d * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return { a: [c * 9, s * 9], b: [c * 6, s * 6], w: 3 }; }),
    obstacles: [0, 1, 2, 3, 4, 5].map(k => { const a = k * Math.PI / 3 + Math.PI / 6; return { prop: 'ice', x: Math.cos(a) * 12.5, z: Math.sin(a) * 12.5, r: 1.25, h: 3.4, rot: a }; })
      .concat([{ prop: 'shop', x: 0, z: 16.5, r: 1.8, h: 3.6, rot: Math.PI }, { prop: 'shop', x: 0, z: -16.5, r: 1.8, h: 3.6, rot: 0 }])
      // braziers by both merchants and round the throne dais
      .concat([[-2.9, 16.5], [2.9, 16.5], [-2.9, -16.5], [2.9, -16.5], [5.3, 0], [-5.3, 0], [0, 5.3], [0, -5.3]].map(([x, z]) => ({ prop: 'brazier', x, z, r: 0.45, h: 1.6 }))),
    decor: [
      { prop: 'ice', x: 0, z: -27, h: 14 }, { prop: 'ice', x: -9, z: -25, h: 8, rot: 1 }, { prop: 'ice', x: 9, z: -25, h: 8, rot: 2 },
      { prop: 'gargoyle', x: -22, z: 12, h: 4, rot: 2.2 }, { prop: 'gargoyle', x: 22, z: 12, h: 4, rot: -2.2 },
      { prop: 'iceThrone', x: 0, z: -32, h: 18, opt: true }, { prop: 'frozenPillar', x: -24, z: -9, h: 5, rot: 0.4, opt: true }, { prop: 'frozenPillar', x: 24, z: 9, h: 5, rot: 2.1, opt: true },
    ],
    runes: [[-16, 0], [16, 0]],
  },
  // a haunted hill with a crypt mound on top; four cursed open graves burn anyone who stands in them
  grave: {
    name: 'Forsaken Graveyard', theme: 'grave', sight: 13, hx: 21, hz: 21, r: 7, edge: 'wall',
    sky: 0x04070a, fog: [0x0a1412, 0.018], hemi: [0x5a6a72, 0x0e1210, 0.85], sun: [0x9ab8c8, 1.25], exposure: 1.15,
    hazards: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => ({ type: 'curse', a: [sx * 13 - 0.8, sz * 12.5], b: [sx * 13 + 0.8, sz * 12.5], r: 1.5 })),
    terraces: [{ x: 0, z: 0, r: 8, h: 1.4 }, { x: 0, z: 0, r: 3.3, h: 2.8 }],
    ramps: [
      { a: [0, -11.2], b: [0, -8], w: 3.2 }, { a: [0, 11.2], b: [0, 8], w: 3.2 }, { a: [11.2, 0], b: [8, 0], w: 3.2 }, { a: [-11.2, 0], b: [-8, 0], w: 3.2 },
      { a: [5.7, 0.2], b: [3.3, 0.2], w: 2.4 }, { a: [-5.7, -0.2], b: [-3.3, -0.2], w: 2.4 },
    ],
    obstacles: [
      { prop: 'obelisk', x: 0, z: 0, r: 0.9, h: 4.2 },
      ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => ({ prop: 'column', x: sx * 4.6, z: sz * 4.6, r: 0.9, h: 2.6 })),
      ...[[-16, -8], [16, 8], [-8, 16], [8, -16], [-17, 9], [17, -9]].map(([x, z]) => ({ prop: 'tree', x, z, r: 0.8, h: 4.8 })),
      { prop: 'shop', x: -17, z: 0, r: 1.8, h: 3.6, rot: Math.PI / 2 }, { prop: 'shop', x: 17, z: 0, r: 1.8, h: 3.6, rot: -Math.PI / 2 },
      // braziers flank the four ramps up the hill and light both merchants
      ...[[0, -1], [0, 1], [1, 0], [-1, 0]].flatMap(([ax, az]) => [-1, 1].map(s => ({ prop: 'brazier', x: ax * 7.3 + az * s * 2.3, z: az * 7.3 + ax * s * 2.3, r: 0.45, h: 1.6 }))),
      ...[-1, 1].flatMap(sx => [-1, 1].map(sz => ({ prop: 'brazier', x: sx * 17, z: sz * 2.9, r: 0.45, h: 1.6 }))),
    ],
    decor: [
      { prop: 'gargoyle', x: -25, z: -25, h: 4.5, rot: 0.8 }, { prop: 'gargoyle', x: 25, z: 25, h: 4.5, rot: -2.4 },
      { prop: 'gargoyle', x: 25, z: -25, h: 4.5, rot: -0.8 }, { prop: 'gargoyle', x: -25, z: 25, h: 4.5, rot: 2.4 },
      { prop: 'crypt', x: 0, z: -27, h: 8, opt: true }, { prop: 'deadOak', x: 26, z: 4, h: 9, opt: true }, { prop: 'deadOak', x: -26, z: -4, h: 9, rot: 2, opt: true },
      { prop: 'tombstones', x: -9, z: 15, h: 1.3, opt: true }, { prop: 'tombstones', x: 9, z: -15, h: 1.3, rot: Math.PI, opt: true },
    ],
    outsideTrees: true,
    runes: [[0, -16], [0, 16]],
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
// ------------------------------------------------------------------ terrain: cliff levels, ramps, pathing
// Like a WC3 tileset: flat terraces at cliff levels joined by ramps. A map lists `terraces` (rect, circle or
// polygon plateaus with a height; later ones stack on earlier ones) and `ramps` (low end a, high end b, width).
// Everything is baked into one height grid (0.25 units) that movement, vision, effects and the camera read.
const TG = { res: 0.25, x0: 0, z0: 0, n: 0, h: null };
// walkable means gentle: ramps rise at most ~0.6 per unit, a cliff (blended over one grid cell) is ~7 per unit
const MAX_SLOPE = 1.8, NAV_SLOPE = 0.8; // paths are a bit stricter, so they climb ramps from the bottom, never up a side lip
function inShape(t, x, z) {
  if (t.r !== undefined) return Math.hypot(x - t.x, z - t.z) <= t.r;
  if (t.rect) return x >= t.rect[0] && x <= t.rect[2] && z >= t.rect[1] && z <= t.rect[3];
  let c = false; const P = t.poly; // polygon, even-odd
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > z) !== (P[j][1] > z) && x < (P[j][0] - P[i][0]) * (z - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c;
  return c;
}
function plateauH(m, x, z) { let h = 0; for (const t of m.terraces || []) if (inShape(t, x, z)) h = Math.max(h, t.h); return h; }
function buildTerrain(m) {
  const ext = Math.max(m.hx, m.hz) + 6; TG.x0 = TG.z0 = -ext; TG.n = Math.ceil(ext * 2 / TG.res); TG.h = new Float32Array(TG.n * TG.n);
  for (const r of m.ramps || []) { r.h0 = plateauH(m, r.a[0], r.a[1]); r.h1 = plateauH(m, r.b[0] + (r.b[0] - r.a[0]) * 0.05, r.b[1] + (r.b[1] - r.a[1]) * 0.05); }
  for (let iz = 0; iz < TG.n; iz++) for (let ix = 0; ix < TG.n; ix++) {
    const x = TG.x0 + (ix + 0.5) * TG.res, z = TG.z0 + (iz + 0.5) * TG.res;
    let h = plateauH(m, x, z);
    for (const r of m.ramps || []) {
      const dx = r.b[0] - r.a[0], dz = r.b[1] - r.a[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
      const t = ((x - r.a[0]) * ux + (z - r.a[1]) * uz) / L, side = Math.abs((x - r.a[0]) * uz - (z - r.a[1]) * ux);
      if (t >= -0.02 && t <= 1.02 && side <= r.w / 2) h = r.h0 + (r.h1 - r.h0) * Math.max(0, Math.min(1, t));
    }
    TG.h[iz * TG.n + ix] = h;
  }
}
// ground height at a point (bilinear, so ramps are smooth slopes and cliffs are one-cell-wide steep walls)
function H(x, z) {
  if (!TG.h) return 0;
  const fx = (x - TG.x0) / TG.res - 0.5, fz = (z - TG.z0) / TG.res - 0.5, ix = Math.floor(fx), iz = Math.floor(fz), N = TG.n;
  if (ix < 0 || iz < 0 || ix >= N - 1 || iz >= N - 1) return 0;
  const tx = fx - ix, tz = fz - iz, i = iz * N + ix, h = TG.h;
  return (h[i] * (1 - tx) + h[i + 1] * tx) * (1 - tz) + (h[i + N] * (1 - tx) + h[i + N + 1] * tx) * tz;
}
// can a hero step from a to b, or is that a cliff? (judged by steepness, so tiny steps can't creep up a wall)
function slopeOK(ax, az, bx, bz, max) { const d = Math.hypot(bx - ax, bz - az); return d < 1e-6 || Math.abs(H(bx, bz) - H(ax, az)) <= max * Math.max(d, 0.04); }
function canStep(ax, az, bx, bz) { return slopeOK(ax, az, bx, bz, MAX_SLOPE); }
// line of sight over terrain: anything higher than the viewer's ground in between blocks it
function terrainLOS(ax, az, bx, bz) {
  const hv = H(ax, az) + 0.5, d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.5);
  for (let i = 1; i <= n; i++) { const t = i / n; if (H(ax + (bx - ax) * t, az + (bz - az) * t) > hv) return false; }
  return true;
}

// A* over a 0.5-unit walk grid: cliffs (except via ramps), obstacles, the arena edge and (optionally) lava
const NAV = { res: 0.5, x0: 0, z0: 0, n: 0, walk: null, walkSafe: null };
function buildNav(m) {
  const ext = Math.max(m.hx, m.hz) + 3; NAV.x0 = NAV.z0 = -ext; NAV.n = Math.ceil(ext * 2 / NAV.res);
  NAV.walk = new Uint8Array(NAV.n * NAV.n); NAV.walkSafe = new Uint8Array(NAV.n * NAV.n);
  const lim = m.edge === 'wall' ? -0.9 : -0.4;
  for (let iz = 0; iz < NAV.n; iz++) for (let ix = 0; ix < NAV.n; ix++) {
    const x = NAV.x0 + (ix + 0.5) * NAV.res, z = NAV.z0 + (iz + 0.5) * NAV.res, i = iz * NAV.n + ix;
    let ok = sdArena(x, z, m) < lim && !m.obstacles.some(o => Math.hypot(o.x - x, o.z - z) < o.r + CFG.unitR + 0.1);
    // a cell on a cliff edge (big height change within a hero's radius) is not walkable
    if (ok) { const h = H(x, z); // no steep ground anywhere within a hero's radius
      for (const r of [0.15, 0.3, 0.45]) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) if (Math.abs(H(x + dx * r, z + dz * r) - h) > NAV_SLOPE * r + 0.02) { ok = false; break; } }
    NAV.walk[i] = ok ? 1 : 0;
    const hz = ok && hazardAt(x, z); NAV.walkSafe[i] = ok && !(hz && hz.type !== 'water') ? 1 : 0;
  }
}
const navCell = (x, z) => [Math.floor((x - NAV.x0) / NAV.res), Math.floor((z - NAV.z0) / NAV.res)];
const navOK = (grid, ix, iz) => ix >= 0 && iz >= 0 && ix < NAV.n && iz < NAV.n && grid[iz * NAV.n + ix] === 1;
function nearestOpen(grid, ix, iz) {
  if (navOK(grid, ix, iz)) return [ix, iz];
  for (let r = 1; r < 14; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dz)) === r && navOK(grid, ix + dx, iz + dz)) return [ix + dx, iz + dz];
  return null;
}
function walkLine(grid, ax, az, bx, bz) { // straight segment stays on walkable cells and never crosses a cliff
  const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.12);
  let px = ax, pz = az;
  for (let i = 1; i <= n; i++) { const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, [ix, iz] = navCell(x, z); if (!navOK(grid, ix, iz) || !slopeOK(px, pz, x, z, NAV_SLOPE)) return false; px = x; pz = z; }
  return true;
}
const navG = new Float32Array(0);
function findPath(ax, az, bx, bz, avoidHazards = true) {
  if (!NAV.walk) return [[bx, bz]];
  const grid = avoidHazards ? NAV.walkSafe : NAV.walk, N = NAV.n;
  let s = navCell(ax, az), e = navCell(bx, bz);
  s = nearestOpen(grid, s[0], s[1]) || nearestOpen(NAV.walk, s[0], s[1]); e = nearestOpen(grid, e[0], e[1]);
  if (!s || !e) return [[bx, bz]];
  const endX = NAV.x0 + (e[0] + 0.5) * NAV.res, endZ = NAV.z0 + (e[1] + 0.5) * NAV.res;
  const tx = navOK(grid, ...navCell(bx, bz)) ? bx : endX, tz = navOK(grid, ...navCell(bx, bz)) ? bz : endZ;
  if (walkLine(grid, ax, az, tx, tz)) return [[tx, tz]];
  const g = new Float32Array(N * N).fill(1e9), from = new Int32Array(N * N).fill(-1), closed = new Uint8Array(N * N);
  const heap = [], push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  const si = s[1] * N + s[0], ei = e[1] * N + e[0], hx = i => Math.hypot((i % N) - e[0], ((i / N) | 0) - e[1]);
  g[si] = 0; push(hx(si), si);
  let found = false, guard = 0;
  while (heap.length && guard++ < 40000) {
    const [, i] = pop(); if (closed[i]) continue; closed[i] = 1;
    if (i === ei) { found = true; break; }
    const ix = i % N, iz = (i / N) | 0, hi = TG.h ? H(NAV.x0 + (ix + 0.5) * NAV.res, NAV.z0 + (iz + 0.5) * NAV.res) : 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue; const jx = ix + dx, jz = iz + dz; if (!navOK(grid, jx, jz)) continue;
      if (dx && dz && (!navOK(grid, ix + dx, iz) || !navOK(grid, ix, iz + dz))) continue; // no corner cutting
      const j = jz * N + jx; if (closed[j]) continue;
      if (Math.abs(H(NAV.x0 + (jx + 0.5) * NAV.res, NAV.z0 + (jz + 0.5) * NAV.res) - hi) > NAV_SLOPE * NAV.res * (dx && dz ? 1.414 : 1)) continue;
      const ng = g[i] + (dx && dz ? 1.4142 : 1); if (ng < g[j]) { g[j] = ng; from[j] = i; push(ng + hx(j), j); }
    }
  }
  if (!found) return [[tx, tz]];
  const cells = []; for (let i = ei; i !== -1; i = from[i]) cells.push([NAV.x0 + ((i % N) + 0.5) * NAV.res, NAV.z0 + (((i / N) | 0) + 0.5) * NAV.res]);
  cells.reverse(); cells[cells.length - 1] = [tx, tz];
  // string-pull: keep only the corners the straight walk can't skip
  const out = []; let cx = ax, cz = az, k = 0;
  while (k < cells.length) { let far = k; for (let j = cells.length - 1; j > k; j--) if (walkLine(grid, cx, cz, cells[j][0], cells[j][1])) { far = j; break; } out.push(cells[far]); [cx, cz] = cells[far]; k = far + 1; }
  return out;
}


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
let zoom = 1, zoomTarget = 1;

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
  baseDpr = Math.min(devicePixelRatio, q === 'low' ? 1 : 1.5); // the quality ladder lowers it if frames get slow
  rung = minRung = q === 'low' ? 1 : 0; autoQuality = true; dropsFrom = {};
  applyRung(); resize();
}
let perfAcc = 0, perfN = 0, perfGood = 0, lastDprChange = 0, dropsFrom = {};
function adaptResolution(dt) {
  if (!autoQuality) return;
  perfAcc += dt; perfN++;
  if (perfAcc < 1) return;
  const avg = perfAcc / perfN, now = performance.now(); perfAcc = 0; perfN = 0;
  const changesDpr = r => LADDER[r].dpr !== LADDER[rung].dpr;
  if (avg > 1 / 50 && rung < LADDER.length - 1) {
    if (changesDpr(rung + 1) && now - lastDprChange < 2500) return;
    // a rung we had to leave twice is too heavy for this machine: stay below it from now on
    dropsFrom[rung] = (dropsFrom[rung] || 0) + 1; if (dropsFrom[rung] >= 2) minRung = Math.max(minRung, rung + 1);
    rung++; perfGood = 0; if (changesDpr(rung - 1)) lastDprChange = now; applyRung();
  } else if (avg < 1 / 58) {
    // climb back slowly, and never into a rung that was just too slow
    if (++perfGood >= 8 && rung > minRung && !(changesDpr(rung - 1) && now - lastDprChange < 4000)) {
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

// ------------------------------------------------------------------ fog of war (WC3 style)
// R = in vision right now, G = explored. Unexplored ground is black shroud, explored ground you can't see is
// dimmed (terrain stays, heroes and effects vanish), vision is blocked by trees/pillars and by higher cliffs.
const FOW_N = 128;
const fowData = new Uint8Array(FOW_N * FOW_N * 4).fill(255);
const fowTex = new THREE.DataTexture(fowData, FOW_N, FOW_N, THREE.RGBAFormat);
fowTex.magFilter = fowTex.minFilter = THREE.LinearFilter; fowTex.generateMipmaps = false; fowTex.needsUpdate = true;
const FOW_U = { fowTex: { value: fowTex }, fowRect: { value: new THREE.Vector4(-30, -30, 60, 60) } };
const fowCur = new Float32Array(FOW_N * FOW_N).fill(1), fowSeen = new Float32Array(FOW_N * FOW_N).fill(1);
const FOW_GLSL = 'uniform sampler2D fowTex; uniform vec4 fowRect;\n' +
  'float fowAt(vec2 p){ return texture2D(fowTex, (p - fowRect.xy) / fowRect.zw).r; }\n' +
  'float fowK(vec2 p){ vec2 f = texture2D(fowTex, (p - fowRect.xy) / fowRect.zw).rg; return mix(f.g * 0.34, 1.0, f.r); }\n';
THREE.ShaderChunk.common += '\n#ifdef USE_FOW\nvarying vec2 vFowW;\n' + FOW_GLSL + '#endif\n';
THREE.ShaderChunk.project_vertex += '\n#ifdef USE_FOW\n{ vec4 fp = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nfp = instanceMatrix * fp;\n#endif\nvFowW = (modelMatrix * fp).xz; }\n#endif\n';
THREE.ShaderChunk.fog_fragment = '#ifdef USE_FOW\ngl_FragColor.rgb *= fowK(vFowW);\n#endif\n' + THREE.ShaderChunk.fog_fragment;
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
// everything that gives `a` vision: itself, its team mates (team mode) and their wards
function eyesOf(a) {
  const out = [];
  for (const u of units) if (u === a || (a.team !== undefined && u.team === a.team)) {
    if (u.alive) out.push({ x: u.pos.x, z: u.pos.z, R: sight() });
    for (const w of u.wards) out.push({ x: w.x, z: w.z, R: ITEMS.ward.vision });
  }
  if (!out.length && a.alive === false) out.push({ x: a.pos.x, z: a.pos.z, R: sight() * 0.6 });
  return out;
}
const eyeSees = (e, x, z) => Math.hypot(x - e.x, z - e.z) < e.R && losClear(e.x, e.z, x, z) && terrainLOS(e.x, e.z, x, z);
function canSee(a, x, z) {
  if (!fogOn) return true;
  for (const e of eyesOf(a)) if (eyeSees(e, x, z)) return true;
  return false;
}
// a unit is seen if its spot is in vision and it is not hidden by a Veil Blade
function canSeeUnit(a, u) { return u === a || (!(u.invis > 0) && canSee(a, u.pos.x, u.pos.z)); }
// the fog is recomputed a third of the rows per frame (a full refresh every 3 frames), so its cost is
// spread evenly instead of landing on one frame
let fowRow = 0;
function updateFog(dt) {
  if (fowT > 0) { fowT -= dt; return; } // fowT > 0 only right after a map change: hold the shroud a moment
  const r = FOW_U.fowRect.value, cs = r.z / FOW_N, D = fowImg.data;
  const eyes = player && fogOn ? eyesOf(player) : null;
  const rows = Math.ceil(FOW_N / 3), z0 = fowRow, z1 = Math.min(FOW_N, fowRow + rows); fowRow = z1 >= FOW_N ? 0 : z1;
  for (let iz = z0; iz < z1; iz++) for (let ix = 0; ix < FOW_N; ix++) {
    const i = iz * FOW_N + ix; let v = 1;
    const x = r.x + (ix + 0.5) * cs, z = r.y + (iz + 0.5) * cs;
    if (eyes) {
      v = 0;
      for (const c of eyes) { const d = Math.hypot(x - c.x, z - c.z); if (d < c.R && losClear(c.x, c.z, x, z) && terrainLOS(c.x, c.z, x, z)) { v = Math.max(v, Math.min(1, (c.R - d) / 1.6)); if (v >= 1) break; } }
      if (v > 0.4) fowSeen[i] = 1;
      else if (fowSeen[i] < 1 && sdArena(x, z) > 1.5) fowSeen[i] = 1; // the world beyond the arena is never shrouded
    } else fowSeen[i] = 1;
    fowCur[i] += (v - fowCur[i]) * 0.35;
    const i4 = i * 4; fowData[i4] = fowCur[i] * 255 | 0; fowData[i4 + 1] = fowSeen[i] * 255 | 0; fowData[i4 + 2] = 0;
    D[i4 + 3] = (1 - fowCur[i]) * (fowSeen[i] > 0.5 ? 150 : 250) | 0;
  }
  fowTex.needsUpdate = true; if (fowRow === 0) fowCtx.putImageData(fowImg, 0, 0);
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
      gl_FragColor=vec4(col*fowK(vW.xz),1.); }`,
});
const waterMat = new THREE.ShaderMaterial({
  uniforms: { t: timeU, ...FOW_U }, vertexShader: WORLD_VS, transparent: true,
  fragmentShader: `uniform float t; varying vec3 vW; ${NOISE_GLSL} ${FOW_GLSL}
    void main(){ vec2 p=vW.xz*0.35; float a=fbm(p+vec2(t*0.25,t*0.12)); float b=fbm(p*1.7-vec2(t*0.18,-t*0.1));
      float r=pow(smoothstep(0.55,0.8,a*b*2.0),2.0);
      vec3 col=mix(vec3(0.05,0.2,0.26),vec3(0.14,0.36,0.42),a)+vec3(0.7,0.85,1.0)*r*0.6;
      gl_FragColor=vec4(col*fowK(vW.xz),0.82); }`,
});
// a cursed open grave: churning violet ghost-fire over a black pit
const curseMat = new THREE.ShaderMaterial({
  uniforms: { t: timeU, ...FOW_U }, vertexShader: WORLD_VS,
  fragmentShader: `uniform float t; varying vec3 vW; ${NOISE_GLSL} ${FOW_GLSL}
    void main(){ vec2 p=vW.xz*0.55; float q=fbm(p*1.7+vec2(t*0.3,-t*0.22)); float v=fbm(p+q*1.6-vec2(0.,t*0.35));
      vec3 col=mix(vec3(0.02,0.0,0.03),vec3(0.55,0.15,0.95),smoothstep(0.45,0.85,v))+vec3(0.2,0.9,0.5)*pow(smoothstep(0.7,0.95,q),3.)*0.6;
      gl_FragColor=vec4(col*fowK(vW.xz),1.); }`,
});
const iceMat = new THREE.ShaderMaterial({
  uniforms: { t: timeU, ...FOW_U }, vertexShader: WORLD_VS,
  fragmentShader: `uniform float t; varying vec3 vW; ${NOISE_GLSL} ${FOW_GLSL}
    void main(){ vec2 p=vW.xz*0.3; float a=fbm(p*1.3); float c=1.0-smoothstep(0.0,0.03,abs(fbm(p*2.2)-0.5));
      float glint=pow(n(vW.xz*6.0+t*0.2),30.0);
      vec3 col=mix(vec3(0.12,0.22,0.32),vec3(0.35,0.52,0.66),a)+vec3(0.6,0.8,1.0)*c*0.35+glint*0.8;
      gl_FragColor=vec4(col*0.75*fowK(vW.xz),1.); }`,
});
const voidMat = new THREE.ShaderMaterial({
  uniforms: { t: timeU, ...FOW_U }, vertexShader: WORLD_VS,
  fragmentShader: `uniform float t; varying vec3 vW; ${NOISE_GLSL} ${FOW_GLSL}
    void main(){ float v=fbm(vW.xz*0.06+vec2(t*0.01,t*0.015)); vec3 col=mix(vec3(0.01,0.015,0.03),vec3(0.06,0.12,0.2),v*v);
      gl_FragColor=vec4(col*fowK(vW.xz),1.); }`,
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
        float f=clamp(nn*1.6*shape - life*0.9, 0.0, 1.0); f*=fowAt(vW.xz);
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
        void main(){ vC=color; vA=alpha*texture2D(fowTex,(position.xz-fowRect.xy)/fowRect.zw).r; vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=size*uScale/-mv.z; gl_Position=projectionMatrix*mv; }`,
      fragmentShader: additive
        ? `varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,.0,d); a*=a; gl_FragColor=vec4(vC, a*vA*0.85); }`
        : `varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,.1,d); gl_FragColor=vec4(vC, a*vA*0.55); }`,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false, transparent: true,
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = additive ? 4 : 3;
    scene.add(this.points);
  }
  spawn(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, grav = 0, drag = 0) { // y: height above the ground at (x, z)
    if (this.n >= this.max) return;
    y += H(x, z);
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
  mesh.visible = true; mesh.position.set(x, H(x, z) + (kind === 'scorch' ? 0.03 : kind === 'crack' ? 0.05 : 0.07), z);
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
  const c = columns[colI++ % columns.length]; c.t = 0; c.g.visible = true; c.g.position.set(x, H(x, z), z);
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
  const fl = flashLights[flashIdx++ % flashLights.length]; fl.l.position.set(x, H(x, z) + 1.6, z); fl.l.color.set(dd ? 0x4a7aff : 0xff5a1a); fl.t = 0.4;
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
// animation springs per joint group: [frequency Hz, damping ratio]. Low damping = loose, swinging limbs
const SPRING = { body: [2.2, 0.62], arm: [1.7, 0.32], claw: [2.4, 0.28], tail: [1.3, 0.38] };
const BODY_SPANS = [[1, -0.02, 0.22], [5, 0.22, 0.52], [6, 0.52, 0.66], [7, 0.66, 1.1], [2, -0.32, -0.02], [3, -0.62, -0.32], [4, -1.1, -0.62]];
const ARM_SPANS = [[0, 0.45, 1.1], [1, 0.0, 0.45], [2, -0.42, 0.0], [3, -1.1, -0.42]]; // clav, upper, fore, hand
function skinHero(geo) {
  const P = geo.attributes.position, n = P.count, idx = new Uint16Array(n * 4), wts = new Float32Array(n * 4);
  const span = (y, lo, hi, w) => { const d = y < lo ? lo - y : y > hi ? y - hi : 0; return Math.exp(-(d / w) * (d / w)); };
  for (let i = 0; i < n; i++) {
    const x = P.getX(i), y = P.getY(i), ax = Math.abs(x), side = x >= 0 ? 0 : 4;
    // arms hang beside the body: everything outside this line (it widens toward the shoulders) is arm
    const edge = 0.27 + Math.max(0, Math.min(y, 0.45)) * 0.18;
    const arm = smooth(edge - 0.08, edge + 0.08, ax);
    const cand = [];
    let sb = 0; for (const [b, lo, hi] of BODY_SPANS) sb += span(y, lo, hi, 0.12);
    for (const [b, lo, hi] of BODY_SPANS) cand.push([b, (1 - arm) * span(y, lo, hi, 0.12) / sb]);
    let sa = 0; for (const [, lo, hi] of ARM_SPANS) sa += span(y, lo, hi, 0.10);
    for (const [k, lo, hi] of ARM_SPANS) cand.push([8 + side + k, arm * span(y, lo, hi, 0.10) / sa]);
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
// death dissolve: texels burn away below a noise threshold, with a glowing ember edge
function addDissolve(mat) {
  mat.userData.dis = { value: 0 };
  mat.onBeforeCompile = function (sh) {
    sh.uniforms.uDis = this.userData.dis;
    sh.fragmentShader = 'uniform float uDis;\nfloat dsN(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);float a=fract(sin(dot(i,vec2(127.1,311.7)))*43758.5),b=fract(sin(dot(i+vec2(1,0),vec2(127.1,311.7)))*43758.5),c=fract(sin(dot(i+vec2(0,1),vec2(127.1,311.7)))*43758.5),d=fract(sin(dot(i+vec2(1,1),vec2(127.1,311.7)))*43758.5);return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}\n' +
      sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\nfloat dsv = dsN(vUv * 22.0) * 0.6 + dsN(vUv * 61.0) * 0.4; if (uDis > 0.0 && dsv < uDis * 1.05) discard;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif (uDis > 0.0) totalEmissiveRadiance += vec3(1.0, 0.35, 0.05) * (1.0 - smoothstep(0.0, 0.07, dsv - uDis * 1.05)) * 5.0;');
  };
  mat.customProgramCacheKey = () => 'sfa-dissolve';
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
// one material per hero, so each shadow lies on the ground under its own hero (terraces have height)
function makeHeroShadowMat(groundY) {
  const m = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide,
    stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.ReplaceStencilOperation });
  m.userData.fow = true; // skip the fog-of-war patch: project_vertex is replaced below
  m.onBeforeCompile = sh => {
    sh.uniforms.uGroundY = groundY;
    sh.vertexShader = 'uniform float uGroundY;\n' + sh.vertexShader.replace('#include <project_vertex>', `vec4 wp = modelMatrix * vec4(transformed, 1.0);
      const vec3 L = vec3(${SUN_DIR.x.toFixed(4)}, ${SUN_DIR.y.toFixed(4)}, ${SUN_DIR.z.toFixed(4)});
      wp.xyz -= L * ((wp.y - uGroundY) / L.y);
      vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;`);
  };
  m.customProgramCacheKey = () => 'sfa-hero-shadow';
  return m;
}
function cloneHero() {
  const t = heroTemplate || fallbackHero();
  const c = t.clone(true); const mats = [], shadows = [];
  let bones = null; const groundY = { value: 0.025 }, shadowMat = makeHeroShadowMat(groundY);
  c.traverse(o => {
    if (!o.isMesh || o.userData.shadow) return;
    o.material = o.material.clone(); // (clone() drops onBeforeCompile, so the dissolve is added per unit)
    o.material.userData.base = o.material.color.clone();
    if (heroTemplate) addDissolve(o.material);
    mats.push(o.material);
    if (!heroTemplate) return;
    // swap the static mesh for a skinned one with this unit's own skeleton
    const sk = new THREE.SkinnedMesh(o.geometry, o.material);
    sk.position.copy(o.position); sk.quaternion.copy(o.quaternion); sk.scale.copy(o.scale);
    o.parent.add(sk); o.parent.remove(o);
    bones = makeBones(); sk.add(bones[0]);
    c.updateMatrixWorld(true);
    const skel = new THREE.Skeleton(bones); sk.bind(skel);
    const s = new THREE.SkinnedMesh(heroTemplate.userData.shadowGeo || o.geometry, shadowMat);
    s.userData.shadow = true; s.renderOrder = 1; s.frustumCulled = false; sk.add(s); s.bind(skel, sk.bindMatrix);
    shadows.push(s);
  });
  c.userData.mats = mats; c.userData.shadows = shadows; c.userData.groundY = groundY; c.userData.shadowMat = shadowMat;
  c.userData.bones = bones && Object.fromEntries(bones.map(b => [b.name, b]));
  return c;
}

// props
const PROP_TEMPLATES = {};
// built in code, low-poly and flat-shaded like Warcraft 3 doodads: a round summer tree and the two lane spires
(() => {
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, flatShading: true, ...o });
  const lump = (r, seed) => { // a lumpy ball of leaves
    const g = new THREE.IcosahedronGeometry(r, 1), p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = 1 + 0.16 * Math.sin(v.x * 7 + seed) * Math.cos(v.z * 6 - seed) + 0.08 * Math.sin(v.y * 9 + seed * 2); v.multiplyScalar(k); v.y *= 0.8; p.setXYZ(i, v.x, v.y, v.z); }
    g.computeVertexNormals(); return g;
  };
  { const t = new THREE.Group(), bark = mat(0x3a2414), leaf = mat(0x2a6a14), leaf2 = mat(0x3f8a1c), leafD = mat(0x1c4a0e);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 2.0, 6), bark); trunk.position.y = 1.0; t.add(trunk);
    for (const [x, y, z, r, m, sd] of [[0, 2.5, 0, 1.25, leaf, 1], [0.55, 3.2, 0.2, 0.9, leaf2, 2], [-0.5, 3.0, -0.3, 0.95, leafD, 3], [0.1, 3.8, -0.1, 0.75, leaf2, 4]]) {
      const b = new THREE.Mesh(lump(r, sd), m); b.position.set(x, y, z); t.add(b);
    }
    PROP_TEMPLATES.canopy = t; }
  const spire = (stone, trim, roofC, gem, spikes) => {
    const g = new THREE.Group(), st = mat(stone), tr = mat(trim, { metalness: 0.3, roughness: 0.6 }), rf = mat(roofC);
    const gemM = new THREE.MeshStandardMaterial({ color: gem, emissive: gem, emissiveIntensity: 0.9, flatShading: true });
    const add = (geo, m, y, ry = 0) => { const o = new THREE.Mesh(geo, m); o.position.y = y; o.rotation.y = ry; g.add(o); return o; };
    add(new THREE.CylinderGeometry(1.25, 1.45, 0.6, 8), st, 0.3);
    add(new THREE.CylinderGeometry(0.85, 1.1, 3.6, 8), st, 2.4);
    add(new THREE.CylinderGeometry(1.15, 0.9, 0.35, 8), tr, 4.3);
    add(new THREE.CylinderGeometry(0.75, 0.75, 0.9, 8), st, 4.9);
    add(new THREE.ConeGeometry(1.05, 1.6, 8), rf, 6.15, Math.PI / 8);
    add(new THREE.OctahedronGeometry(0.42), gemM, 7.45);
    for (let k = 0; k < 8; k++) { // buttresses round the base, or bone spikes on the Dusk spire
      const a = k / 8 * Math.PI * 2 + Math.PI / 8, o = spikes ? new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.4, 4), tr) : new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.4, 0.5), st);
      o.position.set(Math.cos(a) * 1.05, spikes ? 1.3 : 1.0, Math.sin(a) * 1.05); o.rotation.y = -a; if (spikes) o.rotation.z = -0.5, o.rotation.order = 'YZX'; g.add(o);
    }
    return g;
  };
  PROP_TEMPLATES.spireDawn = spire(0xa89e88, 0xb8862a, 0x1e5a2c, 0x7aff4a, false);
  PROP_TEMPLATES.spireDusk = spire(0x2e2634, 0xa8a090, 0x3a1048, 0xb03aff, true);
})();
function fallbackProp(kind) {
  const g = new THREE.Group();
  if (kind === 'tree') {
    const m = new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 1, flatShading: true });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.35, 3, 6), m); trunk.position.y = 1.5; g.add(trunk);
    for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.09, 1.4, 4), m); b.position.set(0, 2.2 + i * 0.2, 0); b.rotation.set(rnd(-1, 1), rnd(0, 6), rnd(-1, 1)); g.add(b); }
  } else if (kind === 'shop') { // the Soul Merchant: squat stone hut, crimson slate roof with gold trim, lanterns, wares, a spinning coin
    const C = h => new THREE.Color(h).convertSRGBToLinear(); // colours picked in sRGB
    const stone = new THREE.MeshStandardMaterial({ color: C(0x15100f), roughness: 0.95, flatShading: true });
    const dark = new THREE.MeshStandardMaterial({ color: C(0x0c0809), roughness: 1, flatShading: true });
    const roof = new THREE.MeshStandardMaterial({ color: C(0x3a0c14), roughness: 0.6, flatShading: true, emissive: C(0x1a0204), emissiveIntensity: 1 });
    const wood = new THREE.MeshStandardMaterial({ color: C(0x2e1a0c), roughness: 0.9, flatShading: true });
    const gold = new THREE.MeshStandardMaterial({ color: C(0xffb830), emissive: C(0xc07008), emissiveIntensity: 0.8, metalness: 0.9, roughness: 0.3 });
    const bone = new THREE.MeshStandardMaterial({ color: C(0x8a7a66), roughness: 0.8, flatShading: true });
    const lamp = new THREE.MeshBasicMaterial({ color: C(0xffa040) }), soul = new THREE.MeshBasicMaterial({ color: C(0x6aff9a) });
    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const k = new THREE.Mesh(geo, mat); k.position.set(x, y, z); k.rotation.set(rx, ry, rz); g.add(k); return k; };
    add(new THREE.CylinderGeometry(2.0, 2.25, 0.4, 8), stone, 0, 0.2, 0, 0, Math.PI / 8);
    add(new THREE.CylinderGeometry(1.25, 1.5, 1.7, 8), stone, 0, 1.25, 0, 0, Math.PI / 8);
    add(new THREE.TorusGeometry(1.42, 0.06, 6, 24), gold, 0, 2.1, 0, Math.PI / 2);
    add(new THREE.ConeGeometry(2.05, 1.1, 8), roof, 0, 2.6, 0, 0, Math.PI / 8);
    add(new THREE.ConeGeometry(1.1, 1.2, 8), roof, 0, 3.4, 0, 0, Math.PI / 8);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; add(new THREE.ConeGeometry(0.09, 0.7, 5), bone, Math.cos(a) * 1.6, 2.35, Math.sin(a) * 1.6, Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9); }
    add(new THREE.BoxGeometry(0.8, 1.15, 0.3), dark, 0, 0.95, 1.38);
    add(new THREE.BoxGeometry(1.9, 0.5, 0.6), wood, 0, 0.6, 1.85);
    add(new THREE.BoxGeometry(0.42, 0.28, 0.3), gold, 0.55, 0.99, 1.85);
    for (const [x, c] of [[-0.6, 0x3aff7a], [-0.35, 0xff3a5a], [-0.1, 0x5a8aff]]) add(new THREE.CylinderGeometry(0.07, 0.09, 0.26, 8), new THREE.MeshBasicMaterial({ color: C(c) }), x, 0.98, 1.9);
    for (const sx of [-1, 1]) { add(new THREE.CylinderGeometry(0.05, 0.07, 2.0, 5), wood, sx * 1.25, 1.2, 1.6); add(new THREE.OctahedronGeometry(0.18, 0), lamp, sx * 1.25, 2.25, 1.6); }
    add(new THREE.SphereGeometry(0.12, 10, 8), soul, 0, 4.15, 0);
    const pivot = new THREE.Group(); pivot.position.y = 4.75; pivot.userData.spin = true; g.add(pivot);
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 28), gold); coin.rotation.x = Math.PI / 2; pivot.add(coin);
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
        const t = Math.max(0, v.y - (o.y || 0)) / SUN_DIR.y, [x, z] = toC(v.x - SUN_DIR.x * t, v.z - SUN_DIR.z * t);
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
// ------------------------------------------------------------------ painted look
// Art direction: a hand-painted WC3-style diorama. Broad soft colour instead of fine noise, feathered paths,
// detail clustered at cliff feet and map edges, warm firelight against a cool night, and a calm fighting floor
// so heroes and raze circles stay the most readable things on screen.
const sRGB = h => new THREE.Color(h).convertSRGBToLinear(); // colours picked in sRGB
const LOOK = {
  molten: { base: '#2a1f1c', lo: '#120b0a', hi: '#3d2c26', accent: '#3a140c', path: '#38302c', grain: [70, 50, 44],
    rock: '#332723', cap: '#4a3c38', tuft: ['#2a1610', '#8a4020'], fire: '#ff6a1a', pool: 'rgba(255,90,20,0.55)' },
  river: { base: '#3e6a1e', lo: '#2a4c12', hi: '#5a8a2a', accent: '#78a032', path: '#6a5638', grain: [80, 120, 44],
    rock: '#6a6252', cap: '#4a6a22', tuft: ['#3a5e1a', '#b4d860'], fire: '#ffa040', pool: 'rgba(255,150,60,0.4)',
    blight: '#2c2432', blightLo: '#18121c', bank: '#7e6a46', cobble: '#7a746a', deadTuft: ['#241c28', '#7a6a7e'] },
  frozen: { base: '#566a80', lo: '#34445a', hi: '#8ca3bc', accent: '#c4d4e6', path: '#46586e', grain: [150, 170, 195],
    rock: '#56677e', cap: '#e8f0fa', tuft: ['#3a4a5e', '#c8d8ea'], fire: '#ffa850', pool: 'rgba(255,160,80,0.45)' },
  grave: { base: '#272c21', lo: '#12160e', hi: '#3c4331', accent: '#435a2a', path: '#4c483c', grain: [72, 78, 62],
    rock: '#3c3c42', cap: '#39452c', tuft: ['#343a28', '#a8ae84'], fire: '#ffa040', pool: 'rgba(255,140,50,0.55)' },
};
const mkCanvas = n => { const c = document.createElement('canvas'); c.width = c.height = n; return c; };
// smooth colour noise: a tiny random grid between two colours, blurred at 256 px (upscaling it later stays soft)
function softNoise(cells, lo, hi) {
  const n = mkCanvas(cells), x = n.getContext('2d'), im = x.createImageData(cells, cells), A = new THREE.Color(lo), B = new THREE.Color(hi);
  for (let i = 0; i < im.data.length; i += 4) { const t = Math.random(); im.data[i] = (A.r + (B.r - A.r) * t) * 255; im.data[i + 1] = (A.g + (B.g - A.g) * t) * 255; im.data[i + 2] = (A.b + (B.b - A.b) * t) * 255; im.data[i + 3] = 255; }
  x.putImageData(im, 0, 0);
  const L = mkCanvas(256), l = L.getContext('2d'), k = 256 / cells;
  l.filter = `blur(${Math.max(1, k * 0.55).toFixed(1)}px)`; l.drawImage(n, -k, -k, 256 + 2 * k, 256 + 2 * k);
  return L;
}
// a soft layer: drawn at 512 px with a blur, then stretched over the 2048 ground, so every edge is feathered
function softLayer(g, S, toC, alpha, blur, draw) {
  const L = mkCanvas(512), l = L.getContext('2d'), f = 512 / S;
  l.filter = `blur(${blur}px)`; draw(l, (x, z) => toC(x, z).map(v => v * f), f);
  g.save(); g.globalAlpha = alpha; g.drawImage(L, 0, 0, S, S); g.restore();
}
const blobTex = (() => { const c = mkCanvas(64), g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c; })();

// boulder: a lumpy, flat-shaded icosahedron; vertex colours darken the base and tint upward faces (moss, ash, snow)
function rockGeometry(theme) {
  const L = LOOK[theme], geo = new THREE.IcosahedronGeometry(1, 1).toNonIndexed(), p = geo.attributes.position, v = new THREE.Vector3();
  const hs = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return s - Math.floor(s); };
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); const k = 0.8 + hs(+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)) * 0.38;
    v.multiplyScalar(k); v.y *= 0.72; if (v.y < -0.3) v.y = -0.3 + (v.y + 0.3) * 0.25; // squat, flat underside
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const n = geo.attributes.normal, col = new Float32Array(p.count * 3), base = sRGB(L.rock), cap = sRGB(L.cap), c = new THREE.Color();
  for (let i = 0; i < p.count; i += 3) { // per face, so facets stay crisp
    const ny = (n.getY(i) + n.getY(i + 1) + n.getY(i + 2)) / 3, y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const t = THREE.MathUtils.smoothstep(ny, 0.68, 0.95) * (theme === 'frozen' ? 1 : 0.85), ao = 0.4 + 0.6 * THREE.MathUtils.clamp((y + 0.3) / 0.85, 0, 1);
    c.copy(base).lerp(cap, t).multiplyScalar(ao);
    for (let j = 0; j < 3; j++) c.toArray(col, (i + j) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
// on a two-sided map, moss and grass on the Dusk side turn dead violet-grey
const WHITE = new THREE.Color(1, 1, 1), BLIGHT = new THREE.Color(0.75, 0.5, 0.95);
function blightTint(m, x, z) { return m.dawn(x, z + 1.5) ? WHITE : BLIGHT; }
function addRocks(G, kit, list) { // list: [x, y, z, s, sy]
  if (!list.length) return;
  const im = new THREE.InstancedMesh(kit.geo, kit.mat, list.length), M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  list.forEach(([x, y, z, sc, sy], i) => { q.setFromEuler(e.set(rnd(-0.25, 0.25), rnd(0, 6.28), rnd(-0.25, 0.25))); im.setMatrixAt(i, M.compose(p.set(x, y, z), q, s.set(sc * rnd(0.85, 1.2), sy, sc))); if (MAP.dawn) im.setColorAt(i, blightTint(MAP, x, z)); });
  G.add(im);
}

// grass tufts: two crossed cards with painted blades; they sway a little in the vertex shader
function tuftTexture(theme, cols) {
  const [root, tip] = cols || LOOK[theme].tuft;
  const t = canvasTex(128, (g) => {
    for (let i = 0; i < 26; i++) {
      const bx = 64 + rnd(-34, 34), h = rnd(55, 122), lean = rnd(-26, 26), w = rnd(2.5, 5);
      const gr = g.createLinearGradient(0, 128, 0, 128 - h); gr.addColorStop(0, root); gr.addColorStop(1, tip);
      g.fillStyle = gr; g.beginPath(); g.moveTo(bx - w, 128); g.quadraticCurveTo(bx + lean * 0.3, 128 - h * 0.6, bx + lean, 128 - h); g.quadraticCurveTo(bx + lean * 0.3 + w * 0.6, 128 - h * 0.55, bx + w, 128); g.fill();
    }
  }, true);
  return t;
}
function tuftGeometry() {
  const P = [], U = [], N = [];
  for (const a of [0, Math.PI / 2]) {
    const c = Math.cos(a) * 0.5, s = Math.sin(a) * 0.5, q = [[-c, 0, -s, 0, 0], [c, 0, s, 1, 0], [c, 1, s, 1, 1], [-c, 1, -s, 0, 1]];
    // both windings with up normals, so front and back are lit like the ground (DoubleSide would flip the back dark)
    for (const k of [0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]) { P.push(q[k][0], q[k][1], q[k][2]); U.push(q[k][3], q[k][4]); N.push(0, 1, 0); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  return g;
}
function tuftMaterial(map) {
  const mat = new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, roughness: 1 });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uT = timeU;
    sh.vertexShader = 'uniform float uT;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
{ float ph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.9; transformed.x += sin(uT * 1.6 + ph) * 0.08 * position.y; transformed.z += cos(uT * 1.2 + ph) * 0.05 * position.y; }
#endif`);
  };
  mat.customProgramCacheKey = () => 'sfa-tuft';
  return mat;
}
function headstoneGeometry() {
  const s = new THREE.Shape(); s.moveTo(-0.24, 0); s.lineTo(0.24, 0); s.lineTo(0.24, 0.5); s.absarc(0, 0.5, 0.24, 0, Math.PI, false); s.lineTo(-0.24, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 1, curveSegments: 5 });
  g.translate(0, 0, -0.06); return g;
}
// brazier: stone foot, iron bowl, glowing coals and a flickering flame; its light is baked into the ground glow map
function makeBrazier(theme) {
  const g = new THREE.Group(), L = LOOK[theme];
  const stone = new THREE.MeshStandardMaterial({ color: sRGB('#2a2624'), roughness: 0.95, flatShading: true });
  const iron = new THREE.MeshStandardMaterial({ color: sRGB('#1a1614'), roughness: 0.6, metalness: 0.6, flatShading: true });
  const add = (geo, mat, y) => { const k = new THREE.Mesh(geo, mat); k.position.y = y; g.add(k); return k; };
  add(new THREE.CylinderGeometry(0.3, 0.38, 0.18, 6), stone, 0.09);
  add(new THREE.CylinderGeometry(0.14, 0.22, 0.75, 6), stone, 0.55);
  add(new THREE.CylinderGeometry(0.42, 0.2, 0.28, 8, 1, true), iron, 1.05).material.side = THREE.DoubleSide;
  add(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 8), new THREE.MeshBasicMaterial({ color: sRGB(L.fire).multiplyScalar(0.35) }), 1.08);
  const flame = new THREE.Group(); flame.position.y = 1.12; g.add(flame); g.userData.flame = flame;
  const fm = new THREE.MeshBasicMaterial({ map: flameTex, color: sRGB(L.fire), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  flame.add(new THREE.Mesh(flamePlane, fm)); // turned to face the camera every frame
  return g;
}
const flameTex = canvasTex(128, (g) => {
  const gr = g.createRadialGradient(64, 92, 2, 64, 80, 60);
  gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.3, 'rgba(255,190,90,0.8)'); gr.addColorStop(0.7, 'rgba(255,90,20,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(64, 4); g.bezierCurveTo(100, 50, 112, 110, 64, 126); g.bezierCurveTo(16, 110, 28, 50, 64, 4); g.fill();
});
const flamePlane = (() => { const p = new THREE.PlaneGeometry(0.9, 1.35); p.translate(0, 0.55, 0); return p; })();

// where small decoration may go: inside the arena, off hazards, obstacles, ramps, runes and cliff edges
function decorSpot(m, x, z, pad) {
  if (sdArena(x, z, m) > -0.8) return false;
  for (const h of m.hazards) if (segDist(x, z, h.a, h.b) < h.r + (h.type === 'curse' ? 1.8 : 0.5) + pad) return false;
  for (const o of m.obstacles) if (Math.hypot(o.x - x, o.z - z) < o.r + pad) return false;
  for (const [rx, rz] of m.runes) if (Math.hypot(rx - x, rz - z) < 2 + pad) return false;
  for (const c of m.ice || []) if (Math.hypot(c.x - x, c.z - z) < c.r + pad) return false;
  for (const [bx, bz] of m.bridges || []) if (Math.abs(bx - x) < 2.6 && Math.abs(bz - z) < 2.6) return false;
  if (onRamp(m, x, z, 0.4)) return false;
  const d = 0.35; return Math.abs(H(x + d, z) - H(x - d, z)) + Math.abs(H(x, z + d) - H(x, z - d)) < 0.08;
}
// plan the small decoration before the ground is painted, so each piece gets a soft contact shadow
function planDecor(m) {
  const out = { tufts: [], pebbles: [], stones: [], ao: [] };
  const R = Math.max(m.hx, m.hz);
  const nClusters = { molten: 16, river: 70, frozen: 0, grave: 48 }[m.theme];
  for (let c = 0, tries = 0; c < nClusters && tries < 2000; tries++) {
    const x = rnd(-m.hx, m.hx), z = rnd(-m.hz, m.hz);
    // favour edges and cliff feet, where WC3 put its doodads; keep the open middle calmer
    const edge = -sdArena(x, z, m) < 5, cliff = Math.abs(H(x + 1.4, z) - H(x - 1.4, z)) + Math.abs(H(x, z + 1.4) - H(x, z - 1.4)) > 0.3;
    if (!edge && !cliff && Math.random() > 0.25) continue;
    if (!decorSpot(m, x, z, 0.6)) continue;
    c++;
    for (let k = 0, n = 3 + (Math.random() * 6 | 0); k < n; k++) {
      const tx = x + rnd(-1.1, 1.1), tz = z + rnd(-1.1, 1.1); if (!decorSpot(m, tx, tz, 0.3)) continue;
      out.tufts.push([tx, H(tx, tz), tz, rnd(0.5, 0.95)]);
    }
  }
  for (let i = 0, tries = 0; i < (m.theme === 'frozen' ? 40 : 90) && tries < 3000; tries++) {
    const x = rnd(-m.hx, m.hx), z = rnd(-m.hz, m.hz); if (!decorSpot(m, x, z, 0.3)) continue; i++;
    const s = rnd(0.07, 0.2); out.pebbles.push([x, H(x, z) - s * 0.15, z, s, s * rnd(0.6, 1)]);
    if (s > 0.13) out.ao.push([x, z, s * 2.2, s * 2.2, 0, 0.5]);
  }
  if (m.theme === 'grave') { // rows of leaning headstones around the hill, each with a sunken plot in front
    for (const r of [14, 16.2, 18.4]) for (let a = 0; a < Math.PI * 2; a += 1.35 / r) {
      if (Math.min(...[0, 1, 2, 3, 4].map(k => Math.abs(a - k * Math.PI / 2))) < 0.2) continue; // the four paths
      const x = Math.cos(a) * r + rnd(-0.2, 0.2), z = Math.sin(a) * r + rnd(-0.2, 0.2);
      if (Math.random() < 0.25 || !decorSpot(m, x, z, 0.7)) continue;
      const rot = Math.atan2(-Math.cos(a), -Math.sin(a)) + rnd(-0.2, 0.2); // faces the crypt
      out.stones.push({ x, y: H(x, z) - 0.06, z, h: rnd(0.75, 1.15), rot, lean: rnd(-0.18, 0.18) });
      const ix = x - Math.cos(a) * 0.65, iz = z - Math.sin(a) * 0.65;
      out.ao.push([x, z, 0.3, 0.45, a, 0.6], [ix, iz, 0.75, 0.42, a, 0.45]);
    }
  }
  return out;
}

function paintGround(m, casters = [], decor = { ao: [] }) {
  const W = 2 * (m.hx + 2), D = 2 * (m.hz + 2), S = 2048, L = LOOK[m.theme];
  const toC = (x, z) => [(x + W / 2) / W * S, (z + D / 2) / D * S];
  const color = canvasTex(S, (g) => {
    // broad painted colour: four octaves of soft noise, big and quiet first
    g.fillStyle = L.base; g.fillRect(0, 0, S, S);
    for (const [cells, a] of [[5, 0.6], [11, 0.42], [24, 0.3], [60, 0.16]]) { g.globalAlpha = a; g.drawImage(softNoise(cells, L.lo, L.hi), 0, 0, S, S); }
    g.globalAlpha = 1;
    // accent patches (moss, ash, frost), feathered
    softLayer(g, S, toC, 0.45, 9, (l) => { l.fillStyle = L.accent; for (let i = 0; i < 34; i++) { l.beginPath(); l.ellipse(rnd(0, 512), rnd(0, 512), rnd(10, 38), rnd(8, 26), rnd(0, 3), 0, 7); l.fill(); } });
    // fine grain, low contrast, so the ground holds up close without turning noisy
    const [r, gg, b] = L.grain;
    for (let i = 0; i < 9000; i++) { const v = rnd(0.55, 1.45); g.fillStyle = `rgba(${r * v | 0},${gg * v | 0},${b * v | 0},0.09)`; g.beginPath(); g.arc(rnd(0, S), rnd(0, S), rnd(1, 3.5), 0, 7); g.fill(); }
    const stroke = (l, P, w, col) => { l.strokeStyle = col; l.lineCap = 'round'; l.lineWidth = w; l.beginPath(); P.forEach(([x, z], i) => { const [a, c] = toC(x, z).map(v => v / S * 512); i ? l.lineTo(a, c) : l.moveTo(a, c); }); l.stroke(); };
    const u = 512 / W; // pixels per world unit on a soft layer
    if (m.theme === 'molten') { // worn Scourge flagstones, scorched banks along the lava
      g.strokeStyle = 'rgba(8,3,2,0.42)'; g.lineWidth = 4;
      const step = S / 18;
      for (let y = 0; y < S; y += step) { const off = (y / step) % 2 ? step / 2 : 0; g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); for (let x = off; x < S; x += step) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + step); g.stroke(); } }
      g.strokeStyle = 'rgba(0,0,0,0.45)'; for (let i = 0; i < 50; i++) crackPath(g, rnd(0, S), rnd(0, S), rnd(8, 22) | 0, rnd(0, 7), 2.5);
      softLayer(g, S, toC, 0.85, 7, (l) => { for (const h of m.hazards) stroke(l, [h.a, h.b], (h.r + 1.3) * 2 * u, '#050202'); });
    }
    if (m.theme === 'river') { // Dusk blight across the river, sandy banks, and the cobbled lane between the spires
      const dusk = [[-40, -40 * 16.2 / 30 - 3.4], [40, 40 * 16.2 / 30 - 3.4], [40, -40], [-40, -40]];
      softLayer(g, S, toC, 0.92, 14, (l, P) => { l.fillStyle = L.blight; l.beginPath(); dusk.forEach(([x, z], i) => { const [a, c] = P(x, z); i ? l.lineTo(a, c) : l.moveTo(a, c); }); l.fill(); });
      softLayer(g, S, toC, 0.5, 6, (l, P) => { l.fillStyle = L.blightLo; for (let i = 0; i < 40; i++) { const x = rnd(-24, 24), z = rnd(-20, 20); if (m.dawn(x, z + 3)) continue; const [a, c] = P(x, z); l.beginPath(); l.ellipse(a, c, rnd(6, 20), rnd(4, 14), rnd(0, 3), 0, 7); l.fill(); } });
      softLayer(g, S, toC, 0.4, 5, (l, P) => { l.fillStyle = '#86a844'; for (let i = 0; i < 40; i++) { const x = rnd(-24, 24), z = rnd(-20, 20); if (!m.dawn(x, z - 3)) continue; const [a, c] = P(x, z); l.beginPath(); l.ellipse(a, c, rnd(6, 18), rnd(4, 12), rnd(0, 3), 0, 7); l.fill(); } });
      softLayer(g, S, toC, 0.95, 6, (l) => { for (const h of m.hazards) stroke(l, [h.a, h.b], (h.r + 1.5) * 2 * u, L.bank); });
      softLayer(g, S, toC, 0.85, 5, (l) => stroke(l, m.lane, 3.4 * u, L.path));
      // cobbles: rows of rounded grey stones laid across the lane, gaps worn by traffic
      g.save(); g.beginPath(); { const w = 1.25; for (let i = 0; i + 1 < m.lane.length; i++) { const [ax, az] = m.lane[i], [bx, bz] = m.lane[i + 1], d = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / d * w, nz = (bx - ax) / d * w; [[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]].forEach(([x, z], k) => { const [a, c] = toC(x, z); k ? g.lineTo(a, c) : g.moveTo(a, c); }); g.closePath(); } }
      g.clip();
      for (let i = 0; i + 1 < m.lane.length; i++) {
        const [ax, az] = m.lane[i], [bx, bz] = m.lane[i + 1], d = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / d, uz = (bz - az) / d;
        for (let t = 0; t < d; t += 0.36) for (let s2 = -1.25; s2 <= 1.25; s2 += 0.36) {
          if (Math.random() < 0.12 + Math.abs(s2) * 0.25) continue; // worn away toward the edges
          const x = ax + ux * t - uz * (s2 + (Math.round(t / 0.36) % 2) * 0.18), z = az + uz * t + ux * (s2 + (Math.round(t / 0.36) % 2) * 0.18);
          if (hazardAt(x, z, m)) continue;
          const [cx, cz] = toC(x, z), r = 0.16 / W * S, v = rnd(0.7, 1.05);
          g.fillStyle = 'rgba(30,24,16,0.5)'; g.beginPath(); g.ellipse(cx + 1.5, cz + 2, r * 1.05, r * 0.9, 0, 0, 7); g.fill();
          const c = new THREE.Color(L.cobble).multiplyScalar(v); g.fillStyle = '#' + c.getHexString(); g.beginPath(); g.ellipse(cx, cz, r, r * 0.85, rnd(0, 3), 0, 7); g.fill();
        }
      }
      g.restore();
      g.strokeStyle = 'rgba(190,110,255,0.10)'; for (let i = 0; i < 30; i++) { const x = rnd(-24, 24), z = rnd(-20, 20); if (m.dawn(x, z + 3)) continue; const [a, c] = toC(x, z); crackPath(g, a, c, rnd(6, 14) | 0, rnd(0, 7), 2); }
    }
    if (m.theme === 'grave') { // trodden gravel paths up the hill, dark rims round the cursed graves
      softLayer(g, S, toC, 0.75, 6, (l) => { stroke(l, [[0, -21], [0, 21]], 2.6 * u, L.path); stroke(l, [[-21, 0], [21, 0]], 2.6 * u, L.path); });
      softLayer(g, S, toC, 0.35, 3, (l) => { stroke(l, [[0, -21], [0, 21]], 1.1 * u, '#6a6454'); stroke(l, [[-21, 0], [21, 0]], 1.1 * u, '#6a6454'); });
      softLayer(g, S, toC, 0.9, 5, (l) => { l.fillStyle = '#000'; for (const h of m.hazards) { const [cx, cz] = toC((h.a[0] + h.b[0]) / 2, (h.a[1] + h.b[1]) / 2).map(v => v / S * 512); l.beginPath(); l.ellipse(cx, cz, (h.r + 1.4) * u, (h.r + 1.1) * u, 0, 0, 7); l.fill(); } });
    }
    if (m.theme === 'frozen') { // faint frost veins and the ruined tile ring round the throne
      g.strokeStyle = 'rgba(235,245,255,0.14)'; for (let i = 0; i < 70; i++) crackPath(g, rnd(0, S), rnd(0, S), rnd(6, 16) | 0, rnd(0, 7), 2);
      const [cx, cz] = toC(0, 0); g.strokeStyle = 'rgba(30,40,60,0.4)'; g.lineWidth = 7;
      for (const rr of [9, 15]) { g.beginPath(); g.ellipse(cx, cz, rr / W * S, rr / D * S, 0, 0, 7); g.stroke(); }
      for (let k = 0; k < 24; k++) { const a = k / 24 * 6.28; const [x1, z1] = toC(Math.cos(a) * 9, Math.sin(a) * 9), [x2, z2] = toC(Math.cos(a) * 15, Math.sin(a) * 15); g.beginPath(); g.moveTo(x1, z1); g.lineTo(x2, z2); g.stroke(); }
    }
    // soft contact shadows under pebbles and headstones, sunken grave plots
    for (const [x, z, rx, rz, rot, a] of decor.ao) { const [cx, cz] = toC(x, z); g.save(); g.globalAlpha = a; g.translate(cx, cz); g.rotate(rot); g.drawImage(blobTex, -rx / W * S, -rz / D * S, 2 * rx / W * S, 2 * rz / D * S); g.restore(); }
    paintShadows(g, toC, casters, S);
    for (const t of m.terraces || []) { // cliff ambient occlusion below, a worn lit lip on top
      const path = () => { g.beginPath(); if (t.r !== undefined) { const [cx, cz] = toC(t.x, t.z); g.ellipse(cx, cz, t.r / W * S, t.r / D * S, 0, 0, 7); } else { const P = t.rect ? [[t.rect[0], t.rect[1]], [t.rect[2], t.rect[1]], [t.rect[2], t.rect[3]], [t.rect[0], t.rect[3]]] : t.poly; P.forEach(([x, z], i) => { const [a, b] = toC(x, z); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.closePath(); } };
      g.save(); g.filter = `blur(${Math.round(S / 160)}px)`; g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = S / 45; path(); g.stroke(); g.restore();
      g.save(); g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = S / 300; path(); g.stroke(); g.restore();
    }
    for (const [x, z] of m.runes) { const [cx, cz] = toC(x, z); g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 10; g.beginPath(); g.arc(cx, cz, 1.4 / W * S, 0, 7); g.stroke(); }
    // painted light: a little brighter in the middle, darker toward the rim, so the eye stays on the fight
    const vg = g.createRadialGradient(S / 2, S / 2, S * 0.12, S / 2, S / 2, S * 0.62);
    vg.addColorStop(0, 'rgba(255,240,220,0.07)'); vg.addColorStop(0.5, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = vg; g.fillRect(0, 0, S, S);
  }, true);
  const glow = canvasTex(S, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    if (m.theme === 'river') { g.strokeStyle = '#6a2aa0'; g.shadowColor = '#8a3ad0'; g.shadowBlur = 8; g.globalAlpha = 0.35; for (let i = 0; i < 26; i++) { const x = rnd(-24, 24), z = rnd(-20, 20); if (m.dawn(x, z + 4)) continue; const [a, c] = toC(x, z); crackPath(g, a, c, rnd(5, 12) | 0, rnd(0, 7), 1.5); } g.shadowBlur = 0; }
    if (m.theme === 'molten') { g.strokeStyle = '#d02a08'; g.shadowColor = '#c01800'; g.shadowBlur = 10; g.globalAlpha = 0.5; for (let i = 0; i < 24; i++) crackPath(g, rnd(0, S), rnd(0, S), rnd(6, 14) | 0, rnd(0, 7), 1.5); g.shadowBlur = 0; }
    g.globalAlpha = 1;
    for (const o of m.obstacles) if (o.prop === 'brazier') { // baked firelight pool: warm ground round every brazier, free at runtime
      const [cx, cz] = toC(o.x, o.z), R = 3.4 / W * S, gr = g.createRadialGradient(cx, cz, 0, cx, cz, R);
      gr.addColorStop(0, L.pool); gr.addColorStop(0.45, L.pool.replace(/[\d.]+\)$/, '0.18)')); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(cx - R, cz - R, 2 * R, 2 * R);
    }
    for (const [x, z] of m.runes) { const [cx, cz] = toC(x, z); g.globalAlpha = 0.7; g.strokeStyle = m.theme === 'frozen' ? '#4aa0ff' : m.theme === 'river' ? '#50ffa0' : m.theme === 'grave' ? '#9a6aff' : '#ff4a1a'; g.shadowColor = g.strokeStyle; g.shadowBlur = 16; g.lineWidth = 4; g.beginPath(); g.arc(cx, cz, 1.25 / W * S, 0, 7); g.stroke(); }
  }, true);
  return { color, glow, W, D };
}

// rock face texture for cliff walls: horizontal strata with vertical cracks
function cliffTexture(theme) {
  const [base, dark, light] = { molten: ['#1c1312', '#070303', '#3a2420'], river: ['#5e5444', '#2a2318', '#8c7e64'], frozen: ['#3a4a5c', '#141c28', '#8aa4c0'], grave: ['#1d1d22', '#08080b', '#3a3a44'] }[theme] || ['#222', '#000', '#444'];
  const t = canvasTex(256, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += rnd(6, 18)) { g.fillStyle = Math.random() < 0.5 ? dark : light; g.globalAlpha = rnd(0.15, 0.45); g.fillRect(0, y, 256, rnd(2, 7)); }
    g.globalAlpha = 0.6; g.strokeStyle = dark; for (let i = 0; i < 40; i++) crackPath(g, rnd(0, 256), rnd(0, 256), rnd(3, 9) | 0, Math.PI / 2 + rnd(-0.4, 0.4), rnd(1, 3), 8);
    g.globalAlpha = 1;
  }, true);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function terraceShape(t) {
  const s = new THREE.Shape(); // shape space: (x, -z), so after rotation.x = -PI/2 it lies flat in world xz
  if (t.r !== undefined) { s.absarc(t.x, -t.z, t.r, 0, Math.PI * 2, false); return s; }
  const P = t.rect ? [[t.rect[0], t.rect[1]], [t.rect[2], t.rect[1]], [t.rect[2], t.rect[3]], [t.rect[0], t.rect[3]]] : t.poly;
  P.forEach(([x, z], i) => i ? s.lineTo(x, -z) : s.moveTo(x, -z)); s.closePath(); return s;
}
function buildTerraces(G, m, tex, own, kit) {
  if (!(m.terraces || []).length) return;
  const cliffTex = own(cliffTexture(m.theme));
  // vertex colours shade each wall from a dark foot to a lit lip
  const wallMat = own(new THREE.MeshStandardMaterial({ map: cliffTex, color: 0xb0b0b0, vertexColors: true, roughness: 1, metalness: 0, emissive: m.theme === 'molten' ? 0x140301 : 0x000000 }));
  // the painted ground continues onto every level, a touch brighter the higher it is, so levels read at a glance
  const base = G.children[0].material, topMats = {};
  const topFor = h => topMats[h] || (topMats[h] = own(Object.assign(base.clone(), { color: new THREE.Color(1, 1, 1).multiplyScalar(1 + h * 0.09) })));
  const rocks = [];
  for (const t of m.terraces) {
    const shp = terraceShape(t);
    const top = new THREE.ShapeGeometry(shp, 40), pa = top.attributes.position, uv = top.attributes.uv;
    for (let i = 0; i < pa.count; i++) uv.setXY(i, (pa.getX(i) + tex.W / 2) / tex.W, (pa.getY(i) + tex.D / 2) / tex.D);
    const tm = new THREE.Mesh(top, topFor(t.h)); tm.rotation.x = -Math.PI / 2; tm.position.y = t.h + 0.002; G.add(tm);
    const wall = new THREE.ExtrudeGeometry(shp, { depth: t.h + 0.1, bevelEnabled: false, curveSegments: 40, steps: 3 });
    { const u = wall.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * 0.35, u.getY(i) * 0.35); }
    { const P = wall.attributes.position, C = new Float32Array(P.count * 3);
      for (let i = 0; i < P.count; i++) { const k = P.getZ(i) / (t.h + 0.1), v = k > 0.97 ? 1.25 : 0.32 + 0.68 * Math.pow(k, 0.8); C[i * 3] = C[i * 3 + 1] = C[i * 3 + 2] = v; }
      wall.setAttribute('color', new THREE.BufferAttribute(C, 3)); }
    const wm = new THREE.Mesh(wall, [own(new THREE.MeshBasicMaterial({ visible: false })), wallMat]); wm.rotation.x = -Math.PI / 2; wm.position.y = -0.1; G.add(wm);
    // boulders in clumps and gaps along the cliff foot, a few on the lip, like WC3 cliff tiles
    const pts = shp.getSpacedPoints(Math.max(16, Math.round(shp.getLength() / 0.6))), ph = rnd(0, 100);
    let cx = 0, cz = 0; for (const p of pts) { cx += p.x / pts.length; cz -= p.y / pts.length; }
    pts.forEach((p, i) => {
      const x = p.x, z = -p.y; if (onRamp(m, x, z, 1.2)) return;
      const d = 0.5 + 0.5 * Math.sin(i * 0.5 + ph) * Math.sin(i * 0.19 + ph * 2); // 0 = gap, 1 = clump
      if (Math.random() > 0.15 + d * 0.85) return;
      const l = Math.hypot(x - cx, z - cz) || 1, ox = (x - cx) / l, oz = (z - cz) / l, s = (0.22 + 0.5 * d) * rnd(0.7, 1.25);
      const fx = x + ox * s * 0.55, fz = z + oz * s * 0.55;
      rocks.push([fx, H(x + ox * 1.2, z + oz * 1.2) + s * 0.12, fz, s, s * rnd(0.8, 1.3)]);
      if (d > 0.55 && Math.random() < 0.4) rocks.push([x - ox * 0.2, t.h - 0.04, z - oz * 0.2, s * 0.45, s * 0.35]);
    });
  }
  for (const r of m.ramps || []) { // a sloped slab from the low end to the high end, with rock flanks
    const dx = r.b[0] - r.a[0], dz = r.b[1] - r.a[1], L = Math.hypot(dx, dz), px = -dz / L * r.w / 2, pz = dx / L * r.w / 2;
    const v = [[r.a[0] - px, r.h0, r.a[1] - pz], [r.a[0] + px, r.h0, r.a[1] + pz], [r.b[0] + px, r.h1, r.b[1] + pz], [r.b[0] - px, r.h1, r.b[1] - pz]];
    const pos = [], uvs = [];
    const quad = (A, B, C, D) => { for (const q of [A, B, C, A, C, D]) { pos.push(q[0], q[1] + 0.004, q[2]); uvs.push((q[0] + tex.W / 2) / tex.W, (-q[2] + tex.D / 2) / tex.D); } };
    quad(v[0], v[1], v[2], v[3]);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.computeVertexNormals();
    const rm = new THREE.Mesh(g, topFor((r.h0 + r.h1) / 2)); G.add(rm);
    for (const side of [-1, 1]) for (let k = 0; k <= 4; k++) { const t2 = k / 4, s = rnd(0.3, 0.55); rocks.push([r.a[0] + dx * t2 + side * px * 1.2, r.h0 + (r.h1 - r.h0) * t2 * 0.7, r.a[1] + dz * t2 + side * pz * 1.2, s, s * rnd(0.8, 1.4)]); }
  }
  addRocks(G, kit, rocks);
}
function onRamp(m, x, z, pad = 0) {
  for (const r of m.ramps || []) { const dx = r.b[0] - r.a[0], dz = r.b[1] - r.a[1], L = Math.hypot(dx, dz), t = ((x - r.a[0]) * dx + (z - r.a[1]) * dz) / (L * L), side = Math.abs((x - r.a[0]) * dz - (z - r.a[1]) * dx) / L; if (t > -0.15 && t < 1.15 && side < r.w / 2 + pad) return true; }
  return false;
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
  { const ext = Math.max(m.hx, m.hz) + 4; FOW_U.fowRect.value.set(-ext, -ext, ext * 2, ext * 2); fowCur.fill(0); fowSeen.fill(0); fowT = 0; }
  buildTerrain(m); buildNav(m);
  scene.background = new THREE.Color(m.sky); scene.fog.color.set(m.fog[0]); scene.fog.density = m.fog[1];
  hemi.color.set(m.hemi[0]); hemi.groundColor.set(m.hemi[1]); hemi.intensity = m.hemi[2];
  sun.color.set(m.sun[0]); sun.intensity = m.sun[1]; renderer.toneMappingExposure = m.exposure;
  glowLight.color.set(m.theme === 'molten' ? 0xff3a08 : m.theme === 'river' ? 0xffe2a8 : m.theme === 'grave' ? 0x6a3aff : 0x6ab0ff);
  glowLight.intensity = m.theme === 'molten' ? 0.8 : 0.35;

  // props first: their shadows are baked into the ground texture below
  const lists = {};
  const put = (kind, o) => { (lists[kind] = lists[kind] || []).push(o); };
  if (m.outsideTrees) {
    const wood = (x, z) => m.dawn && m.dawn(x, z) ? 'canopy' : 'treeFar';
    for (const [x, z] of edgePoints(64, 1.6)) put(wood(x, z), { x: x + rnd(-1.2, 1.2), z: z + rnd(-1.2, 1.2), h: rnd(4.5, 6.5), rot: rnd(0, 6.28) });
    if (m.dawn) for (const [x, z] of edgePoints(48, 4.5)) put(wood(x, z), { x: x + rnd(-1.5, 1.5), z: z + rnd(-1.5, 1.5), h: rnd(5, 7), rot: rnd(0, 6.28) });
    for (const [x, z] of edgePoints(26, 8)) put(wood(x, z), { x: x + rnd(-2, 2), z: z + rnd(-2, 2), h: rnd(5, 7.5), rot: rnd(0, 6.28) });
  }
  if (m.theme === 'frozen') for (const [x, z] of edgePoints(22, 1.2)) put('ice', { x, y: -0.2, z, h: rnd(1.6, 2.8), rot: rnd(0, 6.28) });
  const casters = [];
  for (const o of m.obstacles) { const p = { kind: o.prop, x: o.x, y: H(o.x, o.z), z: o.z, h: o.h, rot: o.rot !== undefined ? o.rot : rnd(0, 6.28) }; if (o.prop !== 'brazier') put(o.prop, p); casters.push(p); }
  for (const o of m.decor) if (!o.opt || PROP_TEMPLATES[o.prop]) put(o.prop, { x: o.x, y: m.edge === 'lava' ? -0.8 : H(o.x, o.z), z: o.z, h: o.h, rot: o.rot || 0 });

  // ground
  const decor = planDecor(m);
  const tex = paintGround(m, casters, decor);
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

  const kit = { geo: rockGeometry(m.theme), mat: own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true })) };
  buildTerraces(G, m, tex, own, kit);
  // outside
  if (m.edge === 'lava') { const lava = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), lavaMat); lava.rotation.x = -Math.PI / 2; lava.position.y = -1.4; G.add(lava); }
  if (m.edge === 'abyss') { const v = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), voidMat); v.rotation.x = -Math.PI / 2; v.position.y = -18; G.add(v); }
  if (m.edge === 'wall') {
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), own(new THREE.MeshStandardMaterial({ color: m.outer || 0x07090a, roughness: 1 })));
    outer.rotation.x = -Math.PI / 2; outer.position.y = -0.03; G.add(outer);
  }
  // hazard ribbons
  for (const h of m.hazards) {
    const dx = h.b[0] - h.a[0], dz = h.b[1] - h.a[1], len = Math.hypot(dx, dz);
    if (h.type === 'curse') { const pool = new THREE.Mesh(new THREE.CircleGeometry(h.r + len / 2, 40), curseMat); pool.rotation.x = -Math.PI / 2; pool.position.set((h.a[0] + h.b[0]) / 2, 0.02, (h.a[1] + h.b[1]) / 2); pool.renderOrder = 1; G.add(pool); continue; }
    const rib = new THREE.Mesh(new THREE.PlaneGeometry(len, h.r * 2), h.type === 'lava' ? lavaMat : waterMat);
    rib.rotation.x = -Math.PI / 2; rib.rotation.z = -Math.atan2(dz, dx);
    rib.position.set((h.a[0] + h.b[0]) / 2, h.type === 'lava' ? 0.02 : 0.015, (h.a[1] + h.b[1]) / 2); rib.renderOrder = 1; G.add(rib);
  }
  const bm = m.bridges ? own(new THREE.MeshStandardMaterial({ color: 0x0f0b0a, roughness: 0.9, flatShading: true })) : null;
  (m.bridges || []).forEach(([x, z]) => {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.3, 4.2), bm); slab.position.set(x, 0.05, z); G.add(slab);
    for (const sx of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.7, 0.4), bm); post.position.set(x + sx * 2.1, 0.35, z - 2); G.add(post); const p2 = post.clone(); p2.position.z = z + 2; G.add(p2); }
  });
  (m.ice || []).forEach(c => { const ice = new THREE.Mesh(new THREE.CircleGeometry(c.r, 64), iceMat); ice.rotation.x = -Math.PI / 2; ice.position.set(c.x, H(c.x, c.z) + 0.02, c.z); G.add(ice); });

  // rim boulders: bigger, half sunk, in clumps; walled maps get a second, higher row
  { const wall = m.edge === 'wall', rim = [], pts = edgePoints(wall ? 100 : 120, wall ? 0.6 : 0.8), ph = rnd(0, 100);
    pts.forEach(([x, z], i) => {
      const d = 0.5 + 0.5 * Math.sin(i * 0.4 + ph) * Math.sin(i * 0.13 + ph); if (Math.random() > 0.35 + d * 0.65) return;
      const l = Math.hypot(x, z) || 1, ox = x / l, oz = z / l;
      for (let j = 0; j < (wall ? 2 : 1); j++) {
        const s = (wall ? 0.4 + d * 0.5 : 0.4 + d * 0.6) * rnd(0.75, 1.2) * (j ? 1.25 : 1), out = j ? 1.1 : rnd(0, 0.5);
        rim.push([x + ox * out, wall ? s * 0.25 + j * 0.45 : rnd(-0.9, -0.4), z + oz * out, s, s * rnd(0.8, 1.3)]);
      }
    });
    addRocks(G, kit, rim.concat(decor.pebbles)); }
  // grass tufts and headstones
  // on a two-sided map the Dusk side gets dead, violet-grey grass
  for (const [list, cols] of m.dawn ? [[decor.tufts.filter(([x, , z]) => m.dawn(x, z + 1.5)), null], [decor.tufts.filter(([x, , z]) => !m.dawn(x, z + 1.5)), LOOK[m.theme].deadTuft]] : [[decor.tufts, null]]) {
    if (!list.length) continue;
    const tm = own(tuftMaterial(own(tuftTexture(m.theme, cols)))), im = new THREE.InstancedMesh(tuftGeometry(), tm, list.length), M = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), sc = new THREE.Vector3();
    list.forEach(([x, y, z, s], i) => im.setMatrixAt(i, M.compose(p.set(x, y - 0.02, z), q.setFromAxisAngle(up, rnd(0, 6.28)), sc.set(s * rnd(0.9, 1.3), s, s))));
    G.add(im);
  }
  if (decor.stones.length) {
    const sm = own(new THREE.MeshStandardMaterial({ color: sRGB('#4a4a48'), roughness: 1, flatShading: true }));
    const im = new THREE.InstancedMesh(headstoneGeometry(), sm, decor.stones.length), M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), p = new THREE.Vector3(), sc = new THREE.Vector3();
    const c = new THREE.Color(), moss = sRGB('#3a4a2c');
    decor.stones.forEach((o, i) => { im.setMatrixAt(i, M.compose(p.set(o.x, o.y, o.z), q.setFromEuler(e.set(o.lean, o.rot, rnd(-0.1, 0.1))), sc.set(o.h * rnd(0.85, 1.1), o.h, o.h))); im.setColorAt(i, c.setRGB(1, 1, 1).lerp(moss, rnd(0, 0.5)).multiplyScalar(rnd(0.7, 1.1))); });
    G.add(im);
  }
  // braziers: the flame flickers each frame (see the ambience loop)
  G.userData.flames = [];
  for (const o of m.obstacles) if (o.prop === 'brazier') { const b = makeBrazier(m.theme); b.scale.setScalar(o.h / 1.6); b.position.set(o.x, H(o.x, o.z), o.z); G.add(b); G.userData.flames.push({ f: b.userData.flame, ph: rnd(0, 6.28), x: o.x, y: b.position.y + o.h * 0.75, z: o.z }); }
  for (const kind in lists) addProps(G, kind, lists[kind]);
  G.userData.coins = []; G.traverse(o => { if (o.userData.spin) G.userData.coins.push(o); });
  m.shops = m.obstacles.filter(o => o.prop === 'shop');
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
    // items and gold
    this.gold = GOLD.start; this.items = [null, null, null, null, null, null]; this.maxHp = CFG.hp;
    this.mod = { spd: 0, hp: 0, cdMul: 1, scepter: false };
    this.ult = null; this.ultCd = 0; this.slowT = 0;
    this.cyclone = 0; this.immune = 0; this.invis = 0; this.veilBonus = false; this.salve = 0; this.lockT = -99; this.avatarUses = 0;
    this.hitBy = new Map(); this.marks = new Map(); this.wards = [];
    this.stats = { dmg: 0, hits: 0, casts: 0, razesHit: 0, goldEarned: 0, assists: 0, used: {} };
    this.lastHitBy = null; this.lastHitT = -99; this.multi = 0; this.multiT = 0;
    this.flash = 0; this.deathT = 0; this.bob = rnd(0, 6); this.walkPhase = 0; this.flinch = 0;
    this.poseT = {}; this.springs = {}; this.velS = new THREE.Vector2(); this.velLag = { x: 0, y: 0, vx: 0, vy: 0 }; this.accF = 0; this.accR = 0; this.spdS = 0; this.dip = 0; this.bankS = 0;
    this.yawV = { x: 0, v: 0 }; this.lookT = 0; this.look = 0;
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
    this.ring.material.dispose(); this.blob.material.dispose(); this.tele.material.dispose(); this.model.userData.shadowMat.dispose();
    for (const w of this.wards) removeWard(w);
  }
  get speed() { let s = CFG.speed * (this.buffs.haste > 0 ? 1.6 : 1) * (1 + this.mod.spd + (this.invis > 0 ? ITEMS.blade.speed : 0)) * (this.slowT > 0 ? 1 - CFG.ultSlow : 1); const h = hazardAt(this.pos.x, this.pos.z); if (h && h.type === 'water') s *= 0.85; return s; }
  // walk to (x, z) along an A* path (around cliffs via ramps, around obstacles; lava only when urgent)
  moveTo(x, z, urgent = false) {
    if (!this.alive || this.cast || this.ult) return;
    this.path = findPath(this.pos.x, this.pos.z, x, z, !urgent);
    const [px, pz] = this.path.shift(); this.moveTarget = new THREE.Vector2(px, pz); this.faceAngle = null;
  }
  razeCenter(slot, facing = this.facing) {
    const d = CFG.razeDist[slot]; return new THREE.Vector2(this.pos.x + Math.sin(facing) * d, this.pos.z + Math.cos(facing) * d);
  }
  castUlt() { // Requiem of Souls: a one-second channel, then the souls burst out in every direction
    if (!this.alive || this.cast || this.ult || this.cyclone > 0) return 'Can\u2019t do that now';
    if (this.ultCd > 0) return 'Requiem of Souls is on cooldown';
    if (this.souls < CFG.ultMinSouls) return 'Requiem needs at least ' + CFG.ultMinSouls + ' souls';
    this.ult = { t: CFG.ultCast }; this.moveTarget = null; this.faceAngle = null; this.stats.ults = (this.stats.ults || 0) + 1;
    fxUltCharge(this); netEv('ultc', this.id);
    return true;
  }
  castRaze(slot) {
    if (!this.alive || this.cast || this.ult || this.cd[slot] > 0 || this.cyclone > 0) return false;
    this.cast = { slot, t: CFG.castTime }; this.moveTarget = null; this.faceAngle = null;
    if (this.invis > 0) { this.invis = 0; this.veilBonus = true; } // a raze from the veil reveals you, with bonus damage
    this.stats.casts++;
    for (const o of units) { // Soul Wand: charges when a visible enemy razes nearby
      if (o === this || !o.alive) continue;
      const w = o.items.find(it => it && it.id === 'wand');
      if (w && w.charges < ITEMS.wand.maxCharges && Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z) < ITEMS.wand.chargeRange && canSee(o, this.pos.x, this.pos.z)) w.charges++;
    }
    fxCast(this, slot, this.facing); netEv('cast', this.id, slot, +this.facing.toFixed(3));
    return true;
  }
  step(dt, input) {
    this.prev.copy(this.pos);
    for (let s = 0; s < 3; s++) this.cd[s] = Math.max(0, this.cd[s] - dt);
    this.ultCd = Math.max(0, this.ultCd - dt); this.slowT = Math.max(0, this.slowT - dt);
    for (const k in this.buffs) this.buffs[k] = Math.max(0, this.buffs[k] - dt);
    if (!this.alive) { this.respawnT -= dt; if (this.respawnT <= 0) respawn(this); return; }
    this.prot = Math.max(0, this.prot - dt); this.post = Math.max(0, this.post - dt);
    this.hp = Math.min(this.maxHp, this.hp + (CFG.regen + (this.buffs.regen > 0 ? 70 : 0)) * dt);
    if (state === 'play') this.gold += GOLD.perSec * dt;
    for (const it of this.items) if (it && it.cd > 0) it.cd = Math.max(0, it.cd - dt);
    this.immune = Math.max(0, this.immune - dt); this.invis = Math.max(0, this.invis - dt);
    if (this.salve > 0) { this.salve -= dt; this.hp = Math.min(this.maxHp, this.hp + ITEMS.salve.heal / ITEMS.salve.dur * dt); }
    if (this.cyclone > 0) { // swept up: no moving, casting or burning until it lands
      this.cyclone -= dt; this.slide.set(0, 0); this.vel.set(0, 0, 0); this.moveTarget = null; return;
    }
    let dir = null;
    if (this.ult) {
      this.ult.t -= dt;
      if (this.ult.t <= 0) { this.ult = null; this.ultCd = CFG.ultCd; this.post = 0.5; this.invis = 0; releaseRequiem(this); } // as in DotA, the veil holds until the cast goes off
    } else if (this.cast) {
      this.cast.t -= dt;
      if (this.cast.t <= 0) { const s = this.cast.slot; this.cast = null; this.post = 0.38; this.cd[s] = CFG.razeCd * this.mod.cdMul; this.tele.visible = false; resolveRaze(this, s); }
    } else {
      if (input && (input.x || input.z)) { dir = new THREE.Vector2(input.x, input.z).normalize(); this.moveTarget = null; }
      else if (this.moveTarget) {
        const dx = this.moveTarget.x - this.pos.x, dz = this.moveTarget.y - this.pos.z, d = Math.hypot(dx, dz);
        if (d < (this.path && this.path.length ? 0.35 : 0.08)) { // waypoint reached: on to the next one
          if (this.path && this.path.length) { const [px, pz] = this.path.shift(); this.moveTarget.set(px, pz); } else this.moveTarget = null;
        } else dir = (this._dir || (this._dir = new THREE.Vector2())).set(dx / d, dz / d); // the A* path already avoids obstacles
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
    { const ox = this.pos.x, oz = this.pos.z, nx = ox + this.slide.x * dt, nz = oz + this.slide.y * dt;
      if (canStep(ox, oz, nx, nz)) { this.pos.x = nx; this.pos.z = nz; }
      else if (canStep(ox, oz, nx, oz)) { this.pos.x = nx; this.slide.y = 0; }
      else if (canStep(ox, oz, ox, nz)) { this.pos.z = nz; this.slide.x = 0; }
      else this.slide.set(0, 0); }
    // obstacles
    for (const o of MAP.obstacles) {
      const dx = this.pos.x - o.x, dz = this.pos.z - o.z, d = Math.hypot(dx, dz), m = o.r + CFG.unitR;
      if (d < m && d > 1e-4) { const nx = o.x + dx / d * m, nz = o.z + dz / d * m; if (canStep(this.pos.x, this.pos.z, nx, nz)) { this.pos.x = nx; this.pos.z = nz; } else { this.pos.x = this.prev.x; this.pos.z = this.prev.z; } if (onIce(this.pos.x, this.pos.z)) this.slide.multiplyScalar(-0.4); }
    }
    // edge
    const sd = sdArena(this.pos.x, this.pos.z), lim = MAP.edge === 'wall' ? -0.6 : 2.5;
    if (sd > lim) { const e = 0.01, gx = sdArena(this.pos.x + e, this.pos.z) - sd, gz = sdArena(this.pos.x, this.pos.z + e) - sd, gl = Math.hypot(gx, gz) || 1; this.pos.x -= gx / gl * (sd - lim); this.pos.z -= gz / gl * (sd - lim); }
    let dps = 0;
    if (MAP.edge !== 'wall' && sd > -0.2) dps = MAP.edgeDps;
    const hz = hazardAt(this.pos.x, this.pos.z); if (hz && hz.type === 'lava') dps = Math.max(dps, 150); if (hz && hz.type === 'curse') { dps = Math.max(dps, 120); this.slowT = Math.max(this.slowT, 0.3); }
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
  // Procedural animation in the style of the DotA 1 Shadow Fiend (the WC3 Firelord model): a hunched,
  // legless figure that glides. Each joint is a damped spring (second-order dynamics, see Spring) chasing
  // a target pose, so motion overshoots and settles instead of snapping: the body leans into acceleration
  // and rocks back when stopping, the arms swing as heavy pendulums, the tail trails through turns.
  animate(dt, t) {
    // smoothed velocity and acceleration in the hero's own frame (forward / right)
    const k = 1 - Math.exp(-dt * 10), V = this.velS, ax0 = V.x, az0 = V.y;
    V.x += (this.vel.x - V.x) * k; V.y += (this.vel.z - V.y) * k;
    const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
    const ax = (V.x - ax0) / Math.max(dt, 1e-3), az = (V.y - az0) / Math.max(dt, 1e-3);
    this.accF += ((ax * fx + az * fz) - this.accF) * k; this.accR += ((ax * fz - az * fx) - this.accR) * k;
    const speed = Math.hypot(V.x, V.y) / CFG.speed;
    this.spdS += (Math.min(speed, 1.6) - this.spdS) * (1 - Math.exp(-dt * 6));
    const w = Math.min(this.spdS, 1), idle = 1 - w;
    const aR = Math.max(-1, Math.min(1, this.accR / 12));
    // momentum: a lagging, springy copy of the velocity. The gap between it and the real velocity is what the
    // upper body, arms and tail feel: they lag on take-off, carry forward on a stop, then rock back and settle
    { const L = this.velLag, om = 2 * Math.PI * 1.5, n = Math.ceil(dt * 12), h = dt / n;
      for (let i = 0; i < n; i++) { L.vx += (om * om * (V.x - L.x) - 2 * 0.42 * om * L.vx) * h; L.vy += (om * om * (V.y - L.y) - 2 * 0.42 * om * L.vy) * h; L.x += L.vx * h; L.y += L.vy * h; } }
    const aF = Math.max(-1.2, Math.min(1.2, ((this.velLag.x - V.x) * fx + (this.velLag.y - V.y) * fz) / CFG.speed));
    this.walkPhase += dt * Math.PI * 2 * 1.0 * this.spdS;          // about one stride per second, faster with Haste
    const ph = this.walkPhase, br = Math.sin(t * 1.6 + this.bob), T = this.poseT;
    // idle life: now and then the head turns to look around
    if ((this.lookT -= dt) <= 0) { this.lookT = rnd(1.5, 4); this.look = idle > 0.6 ? rnd(-0.6, 0.6) : 0; }
    // glide: the hunch lives in the shoulders; the whole body tips into acceleration and rocks back on stopping
    T.pelvisX = 0.06 + 0.10 * w + aF * 0.30;
    T.pelvisZ = -aR * 0.18 + Math.sin(ph) * 0.05 * w;              // bank into turns, rock with the stride
    T.chestX = 0.16 + 0.08 * w + br * 0.035 * idle;                 // breathing at rest
    T.chestY = -Math.sin(ph) * 0.12 * w;                            // shoulders counter-rotate against the arms
    T.chestZ = Math.sin(ph) * 0.04 * w;
    T.neckX = -0.10 - 0.12 * w - aF * 0.15;                         // head stays level: eyes on the target
    T.headX = 0.06 + br * 0.02 * idle; T.headY = this.look * idle;
    for (const [s, kk] of [[1, 'R'], [-1, 'L']]) {
      const sw = Math.sin(ph) * s;                                  // arms swing in opposition
      T['upperX' + kk] = -sw * 0.36 * w - 0.08 - aF * 0.6 + Math.sin(t * 1.1 + this.bob + s) * 0.05 * idle;
      T['upperZ' + kk] = s * (0.07 + 0.08 * w + br * 0.025 * idle) - aR * 0.25;
      T['foreX' + kk] = -0.2 - Math.sin(ph - 0.8) * s * 0.2 * w - aF * 0.3;
      T['handX' + kk] = -0.14 - Math.sin(ph - 1.5) * s * 0.18 * w + Math.sin(t * 2.3 + s * 1.7 + this.bob) * 0.06 * idle; // claws flex
      T['clavX' + kk] = sw * 0.05 * w; T['clavZ' + kk] = s * br * 0.03;
    }
    for (let i = 1; i <= 3; i++) { // tail streams back with speed, waves, and swings wide through turns
      T['tailX' + i] = (0.10 + 0.20 * w - aF * 0.3) * [1, 0.8, 0.7][i - 1];
      T['tailZ' + i] = Math.sin(t * 2.2 + this.bob - i * 0.9) * (0.07 + 0.07 * w) - aR * 0.22;
    }
    // raze: anticipation (arms rise overhead, body arches back), then a slam on the impact frame
    let dip = 0, snap = 1;
    const slam = (e, kk, s) => { T['upperX' + kk] = -2.5 + 1.9 * e; T['upperZ' + kk] = s * 0.25 * (1 - e); T['foreX' + kk] = -0.5 + 0.2 * e; T['handX' + kk] = -0.3 + 0.1 * e; };
    if (this.cast) {
      const c = 1 - this.cast.t / CFG.castTime; snap = 4;
      if (c < 0.6) {
        const e = smooth(0, 0.6, c);
        for (const [s, kk] of [[1, 'R'], [-1, 'L']]) { T['upperX' + kk] = -2.5 * e; T['upperZ' + kk] = s * 0.25 * e; T['foreX' + kk] = -0.5 * e; T['handX' + kk] = -0.3 * e; }
        T.chestX = 0.1 - 0.35 * e; T.pelvisX = 0.1 - 0.1 * e; T.neckX = -0.1; T.headX = -0.15 * e; T.headY = 0;
      } else {
        const e = smooth(0.6, 1, c);
        for (const [s, kk] of [[1, 'R'], [-1, 'L']]) slam(e, kk, s);
        T.chestX = -0.25 + 0.75 * e; T.pelvisX = 0.35 * e; T.neckX = -0.1 - 0.2 * e; T.headX = 0.1 * e; T.headY = 0;
        dip = 0.1 * e;
      }
    } else if (this.post > 0) { // hold the slam a beat, then let the springs carry it back into the glide
      if (this.post > 0.2) { for (const [s, kk] of [[1, 'R'], [-1, 'L']]) slam(1, kk, s); T.chestX = 0.5; T.pelvisX = 0.35; T.neckX = -0.3; T.headX = 0.1; snap = 2.5; dip = 0.1; }
    }
    if (this.ult) {
      const e = smooth(0, 1, 1 - this.ult.t / CFG.ultCast); snap = 2.5;
      for (const [s, kk] of [[1, 'R'], [-1, 'L']]) { T['upperX' + kk] = -0.9 * e; T['upperZ' + kk] = s * (0.3 + 1.15 * e); T['foreX' + kk] = -0.5 * e; T['handX' + kk] = -0.4 * e; }
      T.chestX = 0.1 - 0.4 * e; T.pelvisX = 0.05 - 0.1 * e; T.neckX = -0.1 - 0.15 * e; T.headX = -0.25 * e; T.headY = 0;
      dip = -0.25 * e; // rises as it gathers the souls
    }
    if (this.flinch > 0) { // a hit knocks the springs, they recover on their own
      const S = this.springs, kick = this.flinch * 9;
      for (const [p, v] of [['chestX', -kick], ['neckX', kick * 0.6], ['upperZR', kick], ['upperZL', -kick], ['pelvisX', -kick * 0.5]]) if (S[p]) S[p].v += v;
      this.flinch = 0;
    }
    // springs: per joint group frequency (Hz) and damping; lower damping = more overshoot
    const S = this.springs;
    for (const p in T) {
      const g = p[0] === 't' ? SPRING.tail : p.startsWith('upper') ? SPRING.arm : p.startsWith('fore') || p.startsWith('hand') ? SPRING.claw : SPRING.body;
      const sp = S[p] || (S[p] = { x: T[p], v: 0 });
      const f = g[0] * snap, z = g[1], om = 2 * Math.PI * f;
      // semi-implicit integration, sub-stepped so stiff cast springs stay stable at low frame rates
      const n = Math.ceil(dt * f * 8), h = dt / n;
      for (let i = 0; i < n; i++) { sp.v += (om * om * (T[p] - sp.x) - 2 * z * om * sp.v) * h; sp.x += sp.v * h; }
    }
    this.dip += (dip - this.dip) * (1 - Math.exp(-dt * 20));
    this.bankS = S.pelvisZ ? S.pelvisZ.x : 0;
    const B = this.model.userData.bones; if (!B) return;
    const X = p => S[p].x;
    B.pelvis.rotation.set(X('pelvisX'), 0, X('pelvisZ'));
    B.chest.rotation.set(X('chestX'), X('chestY'), X('chestZ'));
    B.neck.rotation.x = X('neckX'); B.head.rotation.set(X('headX'), X('headY'), 0);
    for (const kk of ['R', 'L']) {
      B['clav' + kk].rotation.set(X('clavX' + kk), 0, X('clavZ' + kk));
      B['upper' + kk].rotation.set(X('upperX' + kk), 0, X('upperZ' + kk));
      B['fore' + kk].rotation.x = X('foreX' + kk); B['hand' + kk].rotation.x = X('handX' + kk);
    }
    for (let i = 1; i <= 3; i++) B['tail' + i].rotation.set(X('tailX' + i), 0, X('tailZ' + i));
  }
  visual(dt, t) {
    const alive = this.alive;
    this.seen = this === player || !player || canSeeUnit(player, this);
    this.root.visible = this.seen;
    const gy = H(this.pos.x, this.pos.z); this.gy = this.gy === undefined || Math.abs(this.gy - gy) > 1 ? gy : this.gy + (gy - this.gy) * Math.min(1, dt * 14);
    this.root.position.set(this.pos.x, this.gy, this.pos.z);
    this.model.userData.groundY.value = this.gy + 0.025;
    this.flash = Math.max(0, this.flash - dt * 5);
    const m = this.model;
    for (const s of m.userData.shadows) s.visible = heroShadows;
    this.blob.material.opacity = heroShadows ? 0.35 : 0.6;
    // displayed heading eases toward the real one (turns start and stop softly); snappy while casting
    { const Y = this.yawV, f = this.cast || this.post > 0 ? 9 : 3.4, om = 2 * Math.PI * f, tgt = Y.x + wrap(this.facing - Y.x);
      if (Math.abs(tgt - Y.x) > 2.6) Y.x = tgt - Math.sign(tgt - Y.x) * 2.6; // after a respawn: don't spin the long way
      const n = Math.ceil(dt * f * 8), h = dt / n; for (let i = 0; i < n; i++) { Y.v += (om * om * (tgt - Y.x) - 2 * 0.8 * om * Y.v) * h; Y.x += Y.v * h; } }
    m.rotation.y = this.yawV.x;
    if (alive) {
      if (this.deathT) for (const mat of m.userData.mats) if (mat.userData.dis) mat.userData.dis.value = 0;
      this.deathT = 0;
      this.animate(dt, t);
      // float: slow bob at rest, a gentle double bob per stride while gliding, no footfalls
      const w = Math.min(this.spdS, 1);
      const hover = 0.32 + Math.sin(t * 1.8 + this.bob) * 0.06 * (1 - w) + Math.sin(this.walkPhase * 2 + 0.6) * 0.035 * w - this.dip;
      // a slight side-to-side drift with the stride, so the glide never runs on rails
      const sway = Math.sin(this.walkPhase) * 0.05 * w, yv = this.yawV.x;
      m.position.set(Math.cos(yv) * sway, hover, -Math.sin(yv) * sway);
      m.rotation.order = 'YXZ';
      m.rotation.set(0, yv, 0);
      if (this.cyclone > 0) { // Cyclone Staff: lifted and spun, a funnel of wind around
        const k = Math.min(1, (ITEMS.cyclone.dur - this.cyclone) * 5, this.cyclone * 4);
        m.position.y += 1.5 * k; m.rotation.y += t * 16 * k;
        if (!this.funnel) { this.funnel = new THREE.Mesh(funnelGeo, funnelMat); this.funnel.renderOrder = 5; this.root.add(this.funnel); }
        this.funnel.visible = true; this.funnel.scale.set(k, 0.4 + 0.6 * k, k); this.funnel.rotation.y = -t * 9;
        if (this.seen) for (let n = emitN(110, dt); n > 0; n--) { const a = rnd(0, 7), r = rnd(0.5, 1.4), y = rnd(0, 3.2); particles.spawn(this.pos.x + Math.cos(a) * r * (0.5 + y / 4), y, this.pos.z + Math.sin(a) * r * (0.5 + y / 4), -Math.sin(a) * 5, rnd(1, 2.5), Math.cos(a) * 5, 0.5, 0.35, 0.1, [0.8, 0.95, 1], [0.3, 0.5, 0.6], 0, 2); }
      }
      m.scale.setScalar(1 + this.flash * 0.06);
      this.ring.material.opacity = this.prot > 0 ? 0.3 + 0.3 * Math.sin(t * 20) : 0.6;
      this.ring.material.color.set(this.immune > 0 ? '#ffd040' : this.buffs.dd > 0 ? '#4a8aff' : this.color);
      if (this.immune > 0 && this.seen) for (let n = emitN(40, dt); n > 0; n--) { const a = rnd(0, 7); particles.spawn(this.pos.x + Math.cos(a) * 0.9, rnd(0.2, 2.6), this.pos.z + Math.sin(a) * 0.9, 0, rnd(0.5, 1.5), 0, 0.6, 0.35, 0.05, [1, 0.85, 0.3], [0.5, 0.3, 0], 0, 0); }
      if (this.funnel && !(this.cyclone > 0)) this.funnel.visible = false;
      if (this.immune > 0 && !this.shell) { this.shell = new THREE.Mesh(shellGeo, shellMat); this.shell.position.y = 1.35; this.shell.renderOrder = 5; this.root.add(this.shell); }
      if (this.shell) { this.shell.visible = this.immune > 0; this.shell.scale.setScalar(Math.min(1, this.immune * 3) * (1 + Math.sin(t * 5) * 0.03)); }
      // Veil Blade: you see yourself as a shade; enemies don't see you at all
      const ghost = this.invis > 0 ? 0.3 : 1;
      if (this.ghost !== ghost) { this.ghost = ghost; for (const mat of m.userData.mats) { mat.transparent = ghost < 1; mat.opacity = ghost; } }
      const fx = Math.sin(this.facing), fz = Math.cos(this.facing), sv = this.seen;
      if (sv) for (let n = emitN(42, dt); n > 0; n--) particles.spawn(this.pos.x - fx * 0.15 + rnd(-0.15, 0.15), hover + 0.15, this.pos.z - fz * 0.15 + rnd(-0.15, 0.15), rnd(-0.3, 0.3) - this.vel.x * 0.15, rnd(-0.2, 0.6), rnd(-0.3, 0.3) - this.vel.z * 0.15, rnd(0.4, 0.8), 0.7, 0.1, FIRE0, FIRE1, 0.5, 1);
      if (sv) for (let n = emitN(this.souls / CFG.maxSouls * 48, dt); n > 0; n--) { const a = rnd(0, 7); particles.spawn(this.pos.x + Math.cos(a) * 0.8, rnd(0.6, 2), this.pos.z + Math.sin(a) * 0.8, 0, rnd(0.3, 1), 0, 0.9, 0.35, 0.05, SOUL0, [0.5, 0, 0.1], 0.3, 0); }
      if (sv && this.buffs.haste > 0) for (let n = emitN(36, dt); n > 0; n--) particles.spawn(this.pos.x, rnd(0.3, 1.8), this.pos.z, -this.vel.x * 0.3, 0.2, -this.vel.z * 0.3, 0.4, 0.5, 0.1, [1, 0.25, 0.15], [0.3, 0, 0], 0, 1);
      if (sv && this.buffs.regen > 0) for (let n = emitN(30, dt); n > 0; n--) particles.spawn(this.pos.x + rnd(-0.6, 0.6), 0.2, this.pos.z + rnd(-0.6, 0.6), 0, rnd(1, 2), 0, 0.8, 0.4, 0.1, [0.3, 1, 0.4], [0, 0.3, 0.1], 0, 0);
      if (this.ult && sv) for (let n = emitN(160, dt); n > 0; n--) { const a = rnd(0, 7), r = rnd(2.5, 5); particles.spawn(this.pos.x + Math.cos(a) * r, rnd(0.4, 2.4), this.pos.z + Math.sin(a) * r, -Math.cos(a) * r * 1.6 - Math.sin(a) * 3, rnd(0, 0.8), -Math.sin(a) * r * 1.6 + Math.cos(a) * 3, 0.55, 0.5, 0.1, [1, 0.4, 0.15], [0.4, 0, 0.1], 0, 0.5); }
      if (this.cast) this.tele.visible = sv;
      if (this.cast && sv) { // claws gather shadow-fire during the wind-up
        const k = 1 - this.cast.t / CFG.castTime, rx = fz, rz = -fx;
        for (let n = emitN(60, dt); n > 0; n--) for (const s of [-1, 1]) particles.spawn(this.pos.x + rx * s * 0.8 + fx * 0.4, 1.0 + k * 1.6, this.pos.z + rz * s * 0.8 + fz * 0.4, rnd(-0.3, 0.3), rnd(0, 0.5), rnd(-0.3, 0.3), 0.3, 0.6, 0.1, this.buffs.dd > 0 ? [0.4, 0.6, 1] : [1, 0.4, 0.1], [0.3, 0, 0], 0, 1);
        this.tele.scale.setScalar(CFG.razeR * (0.55 + 0.45 * k)); this.tele.material.opacity = 0.25 + 0.5 * k;
      }
    } else {
      this.deathT += dt;
      const k = Math.min(this.deathT / 1.1, 1); // the body burns away from the edges, rising, as the souls leave it
      for (const mat of m.userData.mats) if (mat.userData.dis) mat.userData.dis.value = k;
      m.position.y = 0.32 + k * 0.5; for (const s of m.userData.shadows) s.visible = false;
      if (this.seen && k < 1) for (let n = emitN(90 * (1 - k), dt); n > 0; n--) particles.spawn(this.pos.x + rnd(-0.5, 0.5), rnd(0.5, 2.6), this.pos.z + rnd(-0.5, 0.5), rnd(-0.4, 0.4), rnd(1.5, 3.5), rnd(-0.4, 0.4), rnd(0.6, 1.1), 0.45, 0.05, [1, 0.45, 0.12], [0.35, 0, 0.05], 0.5, 0.5);
      this.ring.material.opacity = 0; this.tele.visible = false; if (this.shell) this.shell.visible = false; if (this.funnel) this.funnel.visible = false;
    }
    for (const mat of m.userData.mats) if (mat.userData.base) { mat.color.copy(mat.userData.base).multiplyScalar(1 + this.flash * 3); if (this.immune > 0) mat.color.lerp(GOLD_TINT, 0.35); }
  }
}

const GOLD_TINT = new THREE.Color(0xffc040);
const shellGeo = new THREE.SphereGeometry(1.25, 28, 18);
const shellMat = new THREE.ShaderMaterial({
  uniforms: { t: timeU }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
  fragmentShader: `uniform float t; varying vec3 vN; varying vec3 vV; varying vec3 vP;
    void main(){ float rim = pow(1.0 - abs(dot(vN, vV)), 2.2); float hex = 0.5 + 0.5 * sin(vP.y * 22.0 - t * 4.0) * sin(atan(vP.z, vP.x) * 9.0);
      float a = rim * (0.75 + 0.25 * sin(t * 6.0)) + hex * 0.06; gl_FragColor = vec4(vec3(1.0, 0.72, 0.18) * a * 1.4, a); }`,
});
const funnelGeo = new THREE.CylinderGeometry(1.5, 0.35, 3.6, 28, 6, true).translate(0, 1.8, 0);
const funnelMat = new THREE.ShaderMaterial({
  uniforms: { t: timeU }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, vertexShader: WORLD_VS,
  fragmentShader: `uniform float t; varying vec2 vUv; ${NOISE_GLSL}
    void main(){ float a = vUv.x * 6.2832; float sw = fbm(vec2(vUv.x * 9.0 - t * 2.4 + vUv.y * 5.0, vUv.y * 3.0 - t * 1.1));
      float band = smoothstep(0.45, 0.8, sw) * smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
      gl_FragColor = vec4(vec3(0.75, 0.95, 1.0) * band * 0.9, band); }`,
});
function earVol(p) { if (!player) return 0.5; const d = p.distanceTo(player.pos); return Math.max(0, 1 - d / 26); }

// ---- effects: what a game event looks and sounds like, from this screen's point of view.
// The host calls these as things happen and sends the same event to every guest, who replays it.
function fxCast(u, slot, facing) {
  const c = u.razeCenter(slot, facing);
  u.tele.position.set(c.x, H(c.x, c.y) + 0.08, c.y); u.tele.visible = true;
  sfx('cast', u.isPlayer ? 0.9 : earVol(u.pos) * 0.6, u.pos);
}
function fxUltCharge(u) { sfx('requiemCharge', u.isPlayer ? 1 : earVol(u.pos) * 0.8, u.pos); }
function fxRaze(u, x, z, power, dd, hit) {
  razeFx(x, z, power, dd);
  sfx('raze', u.isPlayer ? 1 : earVol(new THREE.Vector3(x, 0, z)), { x });
  if (player && (u === player || Math.hypot(x - player.pos.x, z - player.pos.z) < CFG.razeR + 1)) addShake(0.12);
  if (u === player && hit) screenFlash('#ff7a20', 0.14);
}
function fxHit(o, amt, src) {
  o.flash = 1; o.flinch = 1;
  if (o === player) { screenFlash('#c00000', Math.min(0.75, 0.3 + amt / o.maxHp)); addShake(0.12); }
  sfx('hit', o.isPlayer || src.isPlayer ? 0.9 : earVol(o.pos) * 0.7, o.pos);
  if (o.seen !== false || src === player) floatText(o.pos, Math.round(amt), src === player ? '#ffd04a' : o === player ? '#ff5a5a' : '#ffb04a', amt >= 300 ? 'big' : '');
  for (let i = 0; i < 16; i++) particles.spawn(o.pos.x, 1.2, o.pos.z, rnd(-3, 3), rnd(1, 4), rnd(-3, 3), 0.5, 0.5, 0.1, [1, 0.3, 0.2], [0.3, 0, 0], -6, 2);
}
function fxDeath(o, src, orbs) {
  for (let i = 0; i < 70; i++) { const a = rnd(0, 7), s = rnd(1, 6); particles.spawn(o.pos.x, rnd(0.4, 2), o.pos.z, Math.cos(a) * s, rnd(1, 7), Math.sin(a) * s, rnd(0.6, 1.2), rnd(0.6, 1.2), 0.1, [1, 0.4, 0.15], [0.2, 0, 0.05], -3, 1.5); }
  for (let i = 0; i < 14; i++) smoke.spawn(o.pos.x + rnd(-0.5, 0.5), rnd(0.5, 1.5), o.pos.z + rnd(-0.5, 0.5), rnd(-0.5, 0.5), rnd(1, 2), rnd(-0.5, 0.5), 1.6, 1.4, 3, SMOKE0, SMOKE1, 0, 0.5);
  sfx('death', o.isPlayer ? 1 : earVol(o.pos), o.pos);
  o.tele.visible = false;
  if (src && src !== o) { soulOrbs(o.pos, src, orbs); if (src.isPlayer) { sfx('kill', 0.9); screenFlash('#ffd0a0', 0.35); } }
}
function fxSpawn(u) {
  if (u.isPlayer && state === 'play') sfx('respawn', 0.8);
  for (let i = 0; i < 40; i++) { const a = rnd(0, 7); particles.spawn(u.pos.x + Math.cos(a) * 1.2, 0.1, u.pos.z + Math.sin(a) * 1.2, -Math.cos(a), rnd(2, 5), -Math.sin(a), 0.7, 0.8, 0.1, [1, 0.5, 0.2], [0.4, 0, 0], 0, 1); }
}
function fxGold(u, g, at) { if (u === player) { floatText(at || u.pos, '+' + g, '#ffd75a'); sfx('coin', 0.5); } }
function resolveRaze(u, slot) {
  const c = u.razeCenter(slot), dd = u.buffs.dd > 0;
  const dmg = (CFG.baseDmg + u.souls * CFG.soulDmg) * (dd ? 2 : 1) + (u.veilBonus ? ITEMS.blade.bonus : 0);
  const hitsBefore = u.stats.hits;
  u.veilBonus = false;
  for (const o of units) {
    if (o === u || !o.alive || o.prot > 0) continue;
    if (Math.hypot(o.pos.x - c.x, o.pos.z - c.y) > CFG.razeR + CFG.unitR || Math.abs(H(o.pos.x, o.pos.z) - H(c.x, c.y)) > 0.9) continue;
    if (o.immune > 0 || o.cyclone > 0) { floatText(o.pos, o.immune > 0 ? 'IMMUNE' : 'MISS', '#ffe27a'); continue; }
    let extra = 0;
    if (u.mod.scepter) { // Shadow Mark: every earlier hit still burning on this target adds damage, then stacks again
      const S = ITEMS.scepter, m = o.marks.get(u);
      const n = m && gameTime - m.t < S.markDur ? m.n : 0;
      extra = n * S.mark; o.marks.set(u, { n: Math.min(S.markMax, n + 1), t: gameTime });
    }
    damage(o, dmg + extra, u);
  }
  const hit = u.stats.hits > hitsBefore;
  if (hit) u.stats.razesHit = (u.stats.razesHit || 0) + 1;
  const power = +(u.souls / CFG.maxSouls).toFixed(2);
  fxRaze(u, c.x, c.y, power, dd, hit); netEv('raze', u.id, +c.x.toFixed(2), +c.y.toFixed(2), power, dd ? 1 : 0, hit ? 1 : 0);
}
const requiemLines = [];
function releaseRequiem(u, n = Math.max(1, Math.floor(u.souls / 2)), off = rnd(0, 6.28), slow = true) {
  if (NET.role !== 'client') netEv('req', u.id, n, +off.toFixed(3));
  for (let i = 0; i < n; i++) { const a = off + i / n * Math.PI * 2; requiemLines.push({ u, x: u.pos.x, z: u.pos.z, dx: Math.sin(a), dz: Math.cos(a), d: 0, hit: new Set(), slow }); }
  sfx('requiem', u.isPlayer ? 1 : earVol(u.pos), u.pos);
  addFx(crackPool[crackI++ % crackPool.length], 2.2, 'crack', u.pos.x, u.pos.z, 2.4, 3.2, 1, 0xff3a20);
  addFx(ringPool[ringI++ % ringPool.length], 0.6, 'ring', u.pos.x, u.pos.z, 0.6, CFG.ultRange * 1.05, 0.9, 0xff2a10);
  for (let k = 0; k < 120; k++) { const a = rnd(0, 7), sp = rnd(4, 14); particles.spawn(u.pos.x, rnd(0.4, 2.2), u.pos.z, Math.cos(a) * sp, rnd(0.5, 4), Math.sin(a) * sp, rnd(0.3, 0.7), rnd(0.5, 1.1), 0.05, [1, 0.3, 0.1], [0.25, 0, 0.05], -2, 2.5); }
  for (let k = 0; k < 30; k++) { const a = rnd(0, 7); smoke.spawn(u.pos.x + Math.cos(a), rnd(0.5, 2), u.pos.z + Math.sin(a), Math.cos(a) * 3, rnd(0.5, 2), Math.sin(a) * 3, 1.6, 1.4, 3.6, SMOKE0, SMOKE1, 0, 1); }
  const fl = flashLights[flashIdx++ % flashLights.length]; fl.l.position.set(u.pos.x, H(u.pos.x, u.pos.z) + 2, u.pos.z); fl.l.color.set(0xff2a10); fl.t = 0.9;
  if (player) { const d = Math.hypot(u.pos.x - player.pos.x, u.pos.z - player.pos.z); if (d < CFG.ultRange) addShake(0.2); if (u === player) screenFlash('#ff2a10', 0.35); }
}
function updateRequiem(st) {
  for (let i = requiemLines.length - 1; i >= 0; i--) {
    const L = requiemLines[i], d0 = L.d; L.d = Math.min(CFG.ultRange, L.d + CFG.ultSpeed * st);
    const ax = L.x + L.dx * d0, az = L.z + L.dz * d0, bx = L.x + L.dx * L.d, bz = L.z + L.dz * L.d;
    for (const o of units) {
      if (NET.role === 'client') break; // guests only draw the streaks; the host deals the damage
      if (o === L.u || !o.alive || o.prot > 0 || L.hit.has(o) || !isEnemy(L.u, o)) continue;
      if (segDist(o.pos.x, o.pos.z, [ax, az], [bx, bz]) > CFG.unitR + CFG.ultWidth) continue;
      L.hit.add(o);
      if (o.immune > 0 || o.cyclone > 0) continue;
      damage(o, CFG.ultDmg, L.u); if (L.slow) o.slowT = CFG.ultSlowDur;
    }
    // the soul streak: a hot core with a smoky wake
    const seen = !player || canSee(player, bx, bz) || L.u === player;
    if (seen) { particles.spawn(bx, 1.0 + Math.sin(L.d * 1.3) * 0.3, bz, L.dx * 2, rnd(-0.3, 0.6), L.dz * 2, 0.45, 0.9, 0.1, [1, 0.35, 0.15], [0.3, 0, 0.05], 0, 2); if (Math.random() < 0.6) smoke.spawn(bx, 1.0, bz, rnd(-0.3, 0.3), rnd(0.2, 0.8), rnd(-0.3, 0.3), 0.8, 0.7, 1.6, SMOKE0, SMOKE1, 0, 1); }
    if (L.d >= CFG.ultRange) requiemLines.splice(i, 1);
  }
}
// FFA: everyone else is an enemy; team mode: only the other team
function isEnemy(a, b) { return a !== b && (a.team === undefined || a.team !== b.team); }
function damage(o, amt, src) {
  o.hp -= amt; o.lastHitBy = src; o.lastHitT = gameTime;
  o.hitBy.set(src, gameTime); o.lockT = gameTime; o.salve = 0; // salve breaks, dagger locks
  src.stats.dmg += amt; src.stats.hits++;
  src.souls = Math.min(CFG.maxSouls, src.souls + 1);
  fxHit(o, amt, src); netEv('hit', o.id, Math.round(amt), src.id);
  if (o.hp <= 0) kill(o, src, false);
}
function kill(o, src, env) {
  if (!o.alive) return;
  o.alive = false; o.hp = 0; o.respawnT = CFG.respawn; o.deaths++; o.cast = null; o.moveTarget = null; o.tele.visible = false;
  for (const k in o.buffs) o.buffs[k] = 0;
  o.invis = o.cyclone = o.immune = o.salve = o.slowT = 0; o.ult = null; o.veilBonus = false; o.marks.clear();
  // gold: bounty grows with the victim's streak; everyone else who hurt them recently gets an assist
  if (src && src !== o) {
    payGold(src, GOLD.kill + GOLD.perStreak * o.streak + (firstBlood ? 0 : GOLD.firstBlood), o.pos);
    for (const [a, t] of o.hitBy) if (a !== src && a !== o && gameTime - t <= GOLD.assistWindow) { payGold(a, GOLD.assist, o.pos); a.stats.assists++; }
  }
  o.hitBy.clear();
  // as in DotA 2: a dying Shadow Fiend lets his souls go in a last Requiem, whatever its cooldown
  if (o.souls >= CFG.ultMinSouls) releaseRequiem(o, undefined, undefined, false); // damage only: the slow is for a cast Requiem
  const lost = Math.floor(o.souls / 2); o.souls -= lost; const prevStreak = o.streak; o.streak = 0;
  const orbN = 6 + Math.min(lost, 10), by = src && src !== o ? src : null;
  fxDeath(o, by, orbN); netEv('die', o.id, by ? by.id : -1, orbN);
  const how = MAP.edge === 'abyss' ? 'into the abyss' : MAP.theme === 'grave' ? 'into a cursed grave' : 'into the lava';
  let msg;
  if (src && src !== o) {
    src.kills++; src.streak++; src.souls = Math.min(CFG.maxSouls, src.souls + 4);
    msg = `<b style="color:${src.color}">${src.name}</b> ${env ? 'drove' : 'razed'} <b style="color:${o.color}">${o.name}</b>${env ? ' ' + how : ''}`;
    if (!firstBlood) { firstBlood = true; shout('FIRST BLOOD', `${src.name} has drawn first blood!`, 'firstblood'); }
    else {
      src.multi = gameTime - src.multiT < 4 ? src.multi + 1 : 1; src.multiT = gameTime;
      if (src.multi >= 2) { const m = MULTI[Math.min(src.multi, 5)]; shout(m[0], src.name, m[1]); }
      else if (src.streak >= 3) { const s = STREAKS[Math.min(src.streak, 10)]; shout('', `${src.name} ${s[0]}`, s[1]); }
    }
    if (prevStreak >= 3) feed(`<b style="color:${src.color}">${src.name}</b> ended ${o.name}'s spree`);
  } else msg = `<b style="color:${o.color}">${o.name}</b> fell ${how}`;
  feed(msg);
  if (src && src.kills >= settings.kills && state === 'play') endGame(src, o);
}
function freeSpot(margin) {
  for (let i = 0; i < 200; i++) {
    const x = rnd(-MAP.hx, MAP.hx), z = rnd(-MAP.hz, MAP.hz);
    if (sdArena(x, z) > -margin || hazardAt(x, z) && hazardAt(x, z).type !== 'water') continue;
    if (MAP.obstacles.some(o => Math.hypot(o.x - x, o.z - z) < o.r + 1.2)) continue;
    if (NAV.walkSafe && !navOK(NAV.walkSafe, ...navCell(x, z))) continue;
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
  u.alive = true; u.hp = u.maxHp; u.prot = CFG.spawnProt; u.cd = [0, 0, 0];
  fxSpawn(u); netEv('spawn', u.id, +u.pos.x.toFixed(2), +u.pos.z.toFixed(2));
}

const orbs = [];
function soulOrbs(from, to, n) {
  for (let i = 0; i < n; i++) orbs.push({ p: new THREE.Vector3(from.x + rnd(-0.5, 0.5), rnd(1, 2), from.z + rnd(-0.5, 0.5)), v: new THREE.Vector3(rnd(-4, 4), rnd(3, 6), rnd(-4, 4)), to, t: 0 });
  if (to.isPlayer) setTimeout(() => sfx('soul', 0.45), 450);
}
const orbTmp = new THREE.Vector3();
function updateOrbs(dt) {
  for (let i = orbs.length - 1; i >= 0; i--) {
    const o = orbs[i]; o.t += dt;
    const d = orbTmp.set(o.to.pos.x - o.p.x, 1.3 - o.p.y, o.to.pos.z - o.p.z), dist = d.length(); // o.p.y: height above ground
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
  showRune({ x: spot[0], z: spot[1], type }); feed(`<span style="color:${RUNES[type].css}">A ${RUNES[type].name} rune has appeared!</span>`);
}
function showRune(r) { // r: {x, z, type}, or null to hide
  rune = r; if (!r) { runeMesh.visible = false; runeLight.intensity = 0; return; }
  const type = r.type, R = RUNES[type];
  runeMesh.position.set(rune.x, H(rune.x, rune.z), rune.z); runeMesh.visible = true; runeLight.position.set(rune.x, H(rune.x, rune.z) + 1.2, rune.z); runeLight.intensity = 1.4;
  runeGem.material.emissive.set(R.color); runeRing.material.color.set(R.color); runeLight.color.set(R.color);
  const key = 'rune' + { haste: 'Haste', dd: 'Dd', regen: 'Regen' }[type];
  if (PROP_TEMPLATES[key]) { // carved rune stone from Meshy instead of the plain gem
    runeMesh.userData.stones = runeMesh.userData.stones || {};
    const st = runeMesh.userData.stones[key] || (runeMesh.userData.stones[key] = makeProp(key, 1.1));
    if (!st.parent) { runeGem.add(st); st.position.y = -0.55; fowAll(st); }
    for (const k in runeMesh.userData.stones) runeMesh.userData.stones[k].visible = k === key;
    runeGem.material.visible = false;
  }
}
function takeRune(u) {
  const R = RUNES[rune.type]; u.buffs[rune.type] = R.dur;
  feed(`<b style="color:${u.color}">${u.name}</b> activated <span style="color:${R.css}">${R.name}</span>`);
  fxRune(u, rune); netEv('rune', u.id, rune.type, rune.x, rune.z);
  showRune(null); runeT = CFG.runeEvery;
}
function fxRune(u, r) {
  const R = RUNES[r.type], c = new THREE.Color(R.color);
  sfx('rune', u.isPlayer ? 0.9 : earVol(u.pos) * 0.7, u.pos);
  for (let i = 0; i < 40; i++) { const a = rnd(0, 7); particles.spawn(r.x, 1, r.z, Math.cos(a) * 3, rnd(1, 4), Math.sin(a) * 3, 0.6, 0.6, 0.1, [c.r, c.g, c.b], [0, 0, 0], -4, 2); }
}

// ------------------------------------------------------------------ gold and items (data in items.js)
function payGold(u, g, at) {
  u.gold += g; u.stats.goldEarned += g;
  const p = at || u.pos; fxGold(u, g, p); netEv('gold', u.id, g, +p.x.toFixed(2), +p.z.toFixed(2));
}
const slotOf = (u, id) => u.items.findIndex(it => it && it.id === id);
function recalcItems(u) {
  const has = id => slotOf(u, id) >= 0, oldMax = u.maxHp;
  u.mod.spd = Math.max(has('boots') ? ITEMS.boots.speed : 0, has('treads') ? ITEMS.treads.speed : 0) + (has('cyclone') ? ITEMS.cyclone.speed : 0);
  u.mod.hp = (has('treads') ? ITEMS.treads.hp : 0) + (has('avatar') ? ITEMS.avatar.hp : 0) + (has('scepter') ? ITEMS.scepter.hp : 0);
  u.mod.cdMul = has('scepter') ? ITEMS.scepter.cdMul : 1; u.mod.scepter = has('scepter');
  u.maxHp = CFG.hp + u.mod.hp;
  if (u.alive) u.hp = Math.max(1, Math.min(u.maxHp, u.hp + u.maxHp - oldMax));
}
// what buying `id` would cost this unit right now (Ember Treads is cheaper with Swift Boots in the bag)
function priceFor(u, id) { const D = ITEMS[id]; return D.needs && slotOf(u, D.needs) < 0 ? D.cost + ITEMS[D.needs].cost : D.cost; }
const STACKS = { salve: 3, ward: 2 };
// trading only happens standing next to a Soul Merchant, like walking up to a shop in DotA
const SHOP_RANGE = 3.7;
const nearestShop = u => (MAP.shops || []).reduce((b, o) => !b || Math.hypot(o.x - u.pos.x, o.z - u.pos.z) < Math.hypot(b.x - u.pos.x, b.z - u.pos.z) ? o : b, null);
const atShop = u => { const s = nearestShop(u); return !!s && Math.hypot(s.x - u.pos.x, s.z - u.pos.z) < SHOP_RANGE; };
function buyItem(u, id) {
  const D = ITEMS[id], price = priceFor(u, id);
  if (!atShop(u)) return 'Walk up to a Soul Merchant to buy';
  if (u.gold < price) return 'Not enough gold';
  const own = slotOf(u, id);
  if (STACKS[id]) {
    if (own >= 0) { if (u.items[own].charges >= STACKS[id]) return 'Carrying the maximum'; u.items[own].charges++; u.gold -= price; return true; }
  } else if (own >= 0) return 'Already owned';
  let slot = D.needs ? slotOf(u, D.needs) : -1; // an upgrade takes the component's slot
  if (slot < 0) slot = u.items.indexOf(null);
  if (slot < 0) return 'Inventory full';
  u.items[slot] = { id, cd: 0, charges: STACKS[id] ? 1 : id === 'wand' ? 0 : undefined };
  u.gold -= price; recalcItems(u); return true;
}
function sellItem(u, i) {
  const it = u.items[i]; if (!it || !atShop(u)) return false;
  const D = ITEMS[it.id], base = D.needs ? D.cost + ITEMS[D.needs].cost : D.cost;
  u.gold += Math.floor(base * GOLD.sellBack * (STACKS[it.id] ? it.charges : 1));
  u.items[i] = null; recalcItems(u); return true;
}
function clampToArena(x, z, margin) {
  for (let k = 0; k < 30 && sdArena(x, z) > -margin; k++) { x *= 0.95; z *= 0.95; }
  for (const o of MAP.obstacles) { const dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz), m = o.r + CFG.unitR + 0.05; if (d < m) { x = o.x + (d > 1e-4 ? dx / d : 1) * m; z = o.z + (d > 1e-4 ? dz / d : 0) * m; } }
  return [x, z];
}
// use item in slot i. pt: ground point under the cursor (quick-cast), tgt: explicit unit target (bots).
// Returns true, or a short reason it could not be used.
function useItem(u, i, pt, tgt) {
  const it = u.items[i]; if (!it) return 'Empty slot';
  const D = ITEMS[it.id];
  if (!u.alive || u.cyclone > 0) return 'Can’t act now';
  if (D.kind === 'passive') return D.name + ' is passive';
  if (it.cd > 0) return D.name + ' is on cooldown';
  const at = pt || { x: u.pos.x + Math.sin(u.facing) * 4, z: u.pos.z + Math.cos(u.facing) * 4 };
  const toward = (range) => { const dx = at.x - u.pos.x, dz = at.z - u.pos.z, d = Math.hypot(dx, dz); const k = d > range ? range / d : 1; return [u.pos.x + dx * k, u.pos.z + dz * k]; };
  let fx = {};
  switch (it.id) {
    case 'salve': u.salve = D.dur; break;
    case 'wand': {
      if (!it.charges) return 'Soul Wand has no charges';
      const h = it.charges * D.perCharge; u.hp = Math.min(u.maxHp, u.hp + h); it.charges = 0; fx = { h };
      break;
    }
    case 'ward': {
      const [x, z] = clampToArena(...toward(D.range), 0.5);
      fx = { x: +x.toFixed(2), z: +z.toFixed(2) }; if (--it.charges <= 0) u.items[i] = null;
      break;
    }
    case 'dagger': {
      if (gameTime - u.lockT < D.lock) return 'Shadowstep Dagger is disabled after taking damage';
      if (u.cast) return 'Can’t blink while razing';
      const [x, z] = clampToArena(...toward(D.range), 0.8);
      fx = { x0: +u.pos.x.toFixed(2), z0: +u.pos.z.toFixed(2), x: +x.toFixed(2), z: +z.toFixed(2) };
      u.pos.set(x, 0, z); u.prev.copy(u.pos); u.slide.set(0, 0); u.moveTarget = null;
      break;
    }
    case 'cyclone': {
      let t = tgt;
      if (!t) { // enemy nearest the cursor, otherwise yourself
        let best = 2.5; for (const o of units) if (o !== u && o.alive && canSeeUnit(u, o)) { const d = Math.hypot(o.pos.x - at.x, o.pos.z - at.z); if (d < best) { best = d; t = o; } }
        t = t || u;
      }
      if (t !== u && Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z) > D.range + 0.5) return 'Target is out of range';
      t.cyclone = D.dur; t.cast = null; t.ult = null; t.post = 0; t.tele.visible = false; t.moveTarget = null; t.salve = 0; fx = { t: t.id };
      break;
    }
    case 'blade': u.invis = D.dur; u.veilBonus = false; break;
    case 'avatar': u.immune = D.durs[Math.min(u.avatarUses++, D.durs.length - 1)]; break;
  }
  fxItem(u, it.id, fx); netEv('item', u.id, it.id, fx);
  u.stats.used[it.id] = (u.stats.used[it.id] || 0) + 1;
  if (it.id !== 'blade' && u.invis > 0) u.invis = 0; // using an item reveals you
  it.cd = D.cd || 0;
  if (u.items[i] === it && STACKS[it.id] && it.id === 'salve' && --it.charges <= 0) u.items[i] = null;
  return true;
}
// what using an item looks and sounds like (fx: the item's details, e.g. where the dagger went)
function fxItem(u, id, fx) {
  const v = (a, b) => u.isPlayer ? a : earVol(u.pos) * b;
  switch (id) {
    case 'salve': sfx('salve', v(0.7, 0.5), u.pos); break;
    case 'wand':
      if (u.seen !== false) floatText(u.pos, '+' + fx.h, '#7aff8a');
      for (let k = 0; k < 30; k++) { const a = rnd(0, 7); particles.spawn(u.pos.x + Math.cos(a) * 0.7, rnd(0.3, 2), u.pos.z + Math.sin(a) * 0.7, 0, rnd(1, 3), 0, 0.7, 0.4, 0.05, [0.75, 0.5, 1], [0.2, 0, 0.4], 0, 0.5); }
      sfx('wand', v(0.7, 0.5), u.pos); break;
    case 'ward': placeWard(u, fx.x, fx.z); sfx('ward', u.isPlayer ? 0.6 : 0, u.pos); break;
    case 'dagger': blinkFx(fx.x0, fx.z0); blinkFx(fx.x, fx.z); sfx('blink', v(0.8, 0.6), { x: fx.x }); break;
    case 'cyclone': { const t = unitById(fx.t) || u; sfx('cyclone', u.isPlayer || t.isPlayer ? 0.8 : earVol(t.pos) * 0.6, t.pos); break; }
    case 'blade':
      for (let k = 0; k < 40; k++) { const a = rnd(0, 7); smoke.spawn(u.pos.x + Math.cos(a) * 0.5, rnd(0.3, 2.2), u.pos.z + Math.sin(a) * 0.5, Math.cos(a) * 0.8, rnd(0.2, 1), Math.sin(a) * 0.8, 1.2, 1.2, 2.6, [0.18, 0.1, 0.26], [0.02, 0.02, 0.04], 0, 1); }
      sfx('veil', v(0.7, 0.5), u.pos); break;
    case 'avatar': sfx('avatar', v(0.8, 0.6), u.pos); break;
  }
}
const unitById = id => units.find(u => u.id === id);
function blinkFx(x, z) {
  for (let k = 0; k < 50; k++) { const a = rnd(0, 7), r = rnd(0, 0.8); particles.spawn(x + Math.cos(a) * r, rnd(0.2, 2.4), z + Math.sin(a) * r, Math.cos(a) * rnd(0.5, 2), rnd(-0.5, 1.5), Math.sin(a) * rnd(0.5, 2), rnd(0.3, 0.6), 0.6, 0.05, [0.5, 0.75, 1], [0.1, 0.1, 0.4], 0, 2); }
  addFx(ringPool[ringI++ % ringPool.length], 0.35, 'ring', x, z, 0.3, 1.6, 0.9, 0x6aa8ff);
}
// Watcher Wards: an unseen eye on a staff. Only its owner sees it (and the vision it gives).
const wardStaffGeo = new THREE.CylinderGeometry(0.035, 0.055, 1.2, 6).translate(0, 0.6, 0), wardEyeGeo = new THREE.SphereGeometry(0.14, 14, 10);
const wardStaffMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.9 }), wardEyeMat = new THREE.MeshBasicMaterial({ color: 0xffb020 }); wardEyeMat.color.multiplyScalar(2.2); // bright enough to read as glowing after tone mapping
function placeWard(u, x, z) {
  if (u.wards.length >= ITEMS.ward.max) removeWard(u.wards[0]);
  const g = new THREE.Group(); g.position.set(x, H(x, z), z);
  if (PROP_TEMPLATES.ward) { g.add(makeProp('ward', 1.6)); g.add(new THREE.Group()); } // keep children[1] for the bob
  else { g.add(new THREE.Mesh(wardStaffGeo, wardStaffMat)); const eye = new THREE.Mesh(wardEyeGeo, wardEyeMat); eye.position.y = 1.35; g.add(eye); }
  const ring = new THREE.Mesh(quadGeo, new THREE.MeshBasicMaterial({ map: ringTex, color: 0xffd040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.18 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; ring.scale.setScalar(ITEMS.ward.vision); g.add(ring);
  g.visible = u === player; scene.add(g); fowAll(g);
  const w = { x, z, t: ITEMS.ward.life, owner: u, mesh: g, ring }; u.wards.push(w); return w;
}
function removeWard(w) { scene.remove(w.mesh); w.ring.material.dispose(); const a = w.owner.wards, i = a.indexOf(w); if (i >= 0) a.splice(i, 1); }
function updateWards(dt) {
  for (const u of units) for (let i = u.wards.length - 1; i >= 0; i--) {
    const w = u.wards[i]; w.t -= dt;
    if (w.t <= 0) { removeWard(w); continue; }
    w.mesh.children[1].position.y = 1.35 + Math.sin(time * 2 + i) * 0.06;
    if (u === player) for (let n = emitN(6, dt); n > 0; n--) particles.spawn(w.x + rnd(-0.1, 0.1), 1.35, w.z + rnd(-0.1, 0.1), rnd(-0.2, 0.2), rnd(0.2, 0.6), rnd(-0.2, 0.2), 0.8, 0.25, 0.05, [1, 0.75, 0.2], [0.4, 0.2, 0], 0, 0);
    w.ring.material.opacity = 0.12 + Math.min(1, w.t / 5) * 0.08;
  }
}

// ------------------------------------------------------------------ bots
class Bot {
  constructor(u, d) { this.u = u; this.d = d; this.think = rnd(0, 0.5); this.strafe = Math.random() < 0.5 ? 1 : -1; this.target = null; this.pendingCast = -1; this.castDelay = 0; this.shopT = rnd(0.5, 2); this.fleeT = 0; }
  // ---- items: shopping, then using them when they help
  // what the bot wants to buy next and can afford (null: nothing)
  wish() {
    const u = this.u, D = this.d;
    if (u.hp < u.maxHp * 0.5 && slotOf(u, 'salve') < 0 && u.gold >= ITEMS.salve.cost) return 'salve';
    for (const id of D.plan) {
      if (id === 'ward' && !fogOn) continue;
      if (slotOf(u, id) >= 0 || (id === 'boots' && slotOf(u, 'treads') >= 0)) continue;
      return u.gold >= priceFor(u, id) ? id : null;
    }
    return null;
  }
  shop() {
    const u = this.u, D = this.d;
    if (u.hp < u.maxHp * 0.5 && slotOf(u, 'salve') < 0 && buyItem(u, 'salve') === true) return;
    for (const id of D.plan) {
      if (id === 'ward' && !fogOn) continue;
      const own = slotOf(u, id);
      if (own >= 0 || (ITEMS[id].needs === undefined && slotOf(u, 'treads') >= 0 && id === 'boots')) continue; // boots were upgraded
      if (u.gold < priceFor(u, id)) return; // save up for the next item in the plan
      let r = buyItem(u, id);
      if (r === 'Inventory full' && !STACKS[id]) { // make room: sell the cheapest consumable or small item
        const junk = ['ward', 'salve', 'wand', 'boots'].map(j => slotOf(u, j)).find(i => i >= 0);
        if (junk !== undefined) { sellItem(u, junk); r = buyItem(u, id); }
      }
      if (r === true) return;
    }
  }
  use(id, pt, tgt) { const i = slotOf(this.u, id); if (i < 0 || Math.random() > this.d.items) return false; return useItem(this.u, i, pt, tgt) === true; }
  ready(id) { const i = slotOf(this.u, id); return i >= 0 && !(this.u.items[i].cd > 0); }
  // a raze from `e` is about to land on us
  defend(e) {
    const u = this.u, c = e.razeCenter(e.cast.slot);
    if (this.ready('avatar') && (u.hp < u.maxHp * 0.7 || e.cast.t < 0.15) && this.use('avatar')) return true;
    if (this.ready('cyclone') && Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) < ITEMS.cyclone.range && this.use('cyclone', null, e)) return true;
    if (this.ready('dagger') && gameTime - u.lockT > ITEMS.dagger.lock) {
      const dx = u.pos.x - c.x, dz = u.pos.z - c.y, d = Math.hypot(dx, dz) || 1;
      if (this.use('dagger', { x: u.pos.x + dx / d * 9, z: u.pos.z + dz / d * 9 })) return true;
    }
    return false;
  }
  sustain() {
    const u = this.u, f = u.hp / u.maxHp, quiet = gameTime - u.lastHitT > 2.5;
    const near = units.filter(o => o !== u && o.alive && canSeeUnit(u, o) && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 9);
    if (f < 0.55 && quiet && u.salve <= 0 && this.ready('salve') && this.use('salve')) return true;
    const w = u.items[slotOf(u, 'wand')];
    if (w && w.charges >= 4 && f < 0.45 && this.use('wand')) return true;
    if (f < 0.32 && near.length && this.ready('blade') && this.use('blade')) { this.flee(near); return true; }
    if (fogOn && u.wards.length < 1 && this.ready('ward')) {
      const spot = MAP.runes.reduce((b, r) => Math.hypot(r[0] - u.pos.x, r[1] - u.pos.z) < Math.hypot(b[0] - u.pos.x, b[1] - u.pos.z) ? r : b);
      if (Math.hypot(spot[0] - u.pos.x, spot[1] - u.pos.z) < ITEMS.ward.range + 2 && this.use('ward', { x: spot[0], z: spot[1] })) return true;
    }
    return false;
  }
  flee(from) {
    let best = null, bd = -1;
    for (let i = 0; i < 8; i++) { const p = freeSpot(3); const d = Math.min(...from.map(o => Math.hypot(o.pos.x - p.x, o.pos.z - p.z))); if (d > bd) { bd = d; best = p; } }
    this.fleeT = 2.5; this.goTo(best.x, best.z);
  }
  step(dt) {
    const u = this.u, D = this.d;
    if (!u.alive || u.cyclone > 0) return;
    if ((this.shopT -= dt) <= 0) { // decide on a shopping trip; buy on arrival
      this.shopT = 1.5;
      if (atShop(u)) { this.shop(); this.shopping = !!this.wish() && this.shopping; }
      else if (!this.shopping && this.wish()) this.shopping = true;
    }
    if (u.cast) return;
    if (this.pendingCast >= 0) { this.castDelay -= dt; if (this.castDelay <= 0) { u.castRaze(this.pendingCast); this.pendingCast = -1; } return; }
    this.think -= dt; if (this.think > 0) return;
    this.think = D.react * rnd(0.6, 1.4);
    // escape lava immediately
    const hz = hazardAt(u.pos.x, u.pos.z);
    if (hz && hz.type !== 'water') { const side = u.pos.z >= 0 ? 1 : -1; u.moveTo(u.pos.x, u.pos.z + side * 3, true); return; }
    // dodge incoming razes (or answer them with an item)
    for (const e of units) {
      if (e === u || !e.alive || !e.cast || !canSee(u, e.pos.x, e.pos.z)) continue;
      const c = e.razeCenter(e.cast.slot), dx = u.pos.x - c.x, dz = u.pos.z - c.y, d = Math.hypot(dx, dz);
      if (d < CFG.razeR + 0.9 && u.immune <= 0 && this.defend(e)) { this.think = 0.2; return; }
      if (d < CFG.razeR + 0.9 && u.immune <= 0 && Math.random() < D.dodge) {
        let ax = dx, az = dz; if (d < 0.3) { ax = Math.cos(e.facing); az = -Math.sin(e.facing); }
        const l = Math.hypot(ax, az); this.goTo(u.pos.x + ax / l * 3, u.pos.z + az / l * 3, true); this.think = 0.3; return;
      }
    }
    if (this.sustain()) return;
    if (this.shopping) { // walk to the nearest Soul Merchant unless an enemy is right on top of us
      const threat = units.some(o => o !== u && o.alive && canSeeUnit(u, o) && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 6);
      if (!threat || u.hp < u.maxHp * 0.35) {
        const s = nearestShop(u);
        if (atShop(u)) { this.shop(); if (!this.wish()) this.shopping = false; return; }
        if (s) { const l = Math.hypot(s.x, s.z) || 1; this.goTo(s.x - s.x / l * 2.7, s.z - s.z / l * 2.7); return; }
      }
    }
    if (this.fleeT > 0) { this.fleeT -= D.react; return; } // keep running
    // runes
    if (rune && Math.random() < D.rune) {
      const rd = Math.hypot(rune.x - u.pos.x, rune.z - u.pos.z);
      const closer = units.some(o => o !== u && o.alive && Math.hypot(rune.x - o.pos.x, rune.z - o.pos.z) < rd * 0.7);
      if (rd < 14 && !closer) { this.goTo(rune.x, rune.z); return; }
    }
    if (this.target && this.target.alive && canSeeUnit(u, this.target)) this.lastSeen = { x: this.target.pos.x, z: this.target.pos.z, t: gameTime };
    if (!this.target || !this.target.alive || !canSeeUnit(u, this.target) || Math.random() < 0.05) {
      let best = null, bd = 1e9;
      for (const o of units) if (o !== u && o.alive && canSeeUnit(u, o)) { const d = o.pos.distanceTo(u.pos) + (o.human ? -1.5 : 0) + rnd(0, 3); if (d < bd) { bd = d; best = o; } }
      this.target = best;
    }
    const t = this.target;
    if (!t) {
      if (this.lastSeen && gameTime - this.lastSeen.t < 3 && Math.hypot(this.lastSeen.x - u.pos.x, this.lastSeen.z - u.pos.z) > 1.5) { this.goTo(this.lastSeen.x, this.lastSeen.z); return; }
      if (!this.wander || Math.hypot(this.wander.x - u.pos.x, this.wander.z - u.pos.z) < 1.5 || Math.random() < 0.02) {
        this.wander = freeSpot(3);
        if ((MAP.terraces || []).length && Math.random() < 0.45) { // look for a spot on high ground
          for (let k = 0; k < 20; k++) { const p = freeSpot(3); if (H(p.x, p.z) > 0.5) { this.wander = p; break; } }
        }
      }
      this.goTo(this.wander.x, this.wander.z); return;
    }
    { // close the gap: blink to mid-raze range, or slip in under the veil
      const td = Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z);
      if (td > 9.5 && td < 17 && u.hp > u.maxHp * 0.5 && this.ready('dagger') && gameTime - u.lockT > ITEMS.dagger.lock) {
        const k = (td - CFG.razeDist[1]) / td;
        if (this.use('dagger', { x: u.pos.x + (t.pos.x - u.pos.x) * k, z: u.pos.z + (t.pos.z - u.pos.z) * k })) { this.think = 0.05; return; }
      }
      if (td > 12 && u.hp > u.maxHp * 0.6 && u.invis <= 0 && this.ready('blade') && this.use('blade')) return;
    }
    // Requiem of Souls: when two enemies are close, or one is close enough to finish off
    if (u.ultCd <= 0 && u.souls >= 10 && Math.random() < D.items) {
      const lines = Math.floor(u.souls / 2);
      const close = units.filter(o => isEnemy(u, o) && o.alive && canSeeUnit(u, o) && o.immune <= 0 && o.cyclone <= 0 && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 4.5);
      if (close.length >= 2 || close.some(o => o.hp < lines * CFG.ultDmg * 0.35)) { u.castUlt(); return; }
    }
    const lead = (CFG.castTime + D.cast) * D.lead;
    const px = t.pos.x + t.vel.x * lead + rnd(-D.aimErr, D.aimErr) * 0.5, pz = t.pos.z + t.vel.z * lead + rnd(-D.aimErr, D.aimErr) * 0.5;
    const dx = px - u.pos.x, dz = pz - u.pos.z, d = Math.hypot(dx, dz) || 0.01, ang = Math.atan2(dx, dz);
    const diff = Math.abs(wrap(ang - u.facing));
    let best = -1, err = 1e9;
    for (let s = 0; s < 3; s++) if (u.cd[s] <= 0) { const e = Math.abs(d - CFG.razeDist[s]); if (e < err) { err = e; best = s; } }
    if (best >= 0 && err < CFG.razeR * 0.6 && t.prot <= 0 && t.immune <= 0 && t.cyclone <= 0.4) {
      if (diff < 0.2) { this.pendingCast = best; this.castDelay = D.cast * rnd(0.5, 1.5); u.moveTarget = null; return; }
      u.moveTarget = null; u.faceAngle = ang; this.think = 0.05; return;
    }
    if (Math.random() < 0.08) this.strafe *= -1;
    const want = best >= 0 ? CFG.razeDist[best] : 8.5;
    // stand at raze range from the target; among a few spots on that ring, prefer high ground (better vision,
    // and enemies below can't see you) the smarter the bot is
    const baseA = Math.atan2(u.pos.x - px, u.pos.z - pz);
    let gx = 0, gz = 0, gScore = -1e9;
    for (const off of [0, 0.5, -0.5, 1.0, -1.0]) {
      const a = baseA + off + this.strafe * 0.18, x = px + Math.sin(a) * want, z = pz + Math.cos(a) * want;
      if (sdArena(x, z) > -1.6 || (hazardAt(x, z) && hazardAt(x, z).type !== 'water')) continue;
      const score = H(x, z) * 3 * D.lead - Math.abs(off) * 1.5 - Math.hypot(x - u.pos.x, z - u.pos.z) * 0.15;
      if (score > gScore) { gScore = score; gx = x; gz = z; }
    }
    if (gScore > -1e9) this.goTo(gx, gz); else this.goTo(px - (dx / d) * want, pz - (dz / d) * want);
  }
  goTo(x, z, urgent) {
    const u = this.u;
    for (let i = 0; i < 20 && sdArena(x, z) > -1.6; i++) { x *= 0.92; z *= 0.92; }
    // re-path only when the destination really changed: A* is cheap but not free
    if (this.lastGoal && Math.hypot(this.lastGoal[0] - x, this.lastGoal[1] - z) < 0.8 && u.moveTarget && gameTime - this.lastGoal[2] < 1) return;
    this.lastGoal = [x, z, gameTime]; u.moveTo(x, z, urgent);
  }
}
let bots = [];

// ------------------------------------------------------------------ input
const keys = {}; let rightDown = false;
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function groundPoint(e) {
  mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, camera); const p = new THREE.Vector3();
  // march the ray: intersect the plane at the ground height found last time, a few times over
  plane.constant = 0; if (!ray.ray.intersectPlane(plane, p)) return null;
  for (let i = 0; i < 4; i++) { plane.constant = -H(p.x, p.z); if (!ray.ray.intersectPlane(plane, p)) return null; }
  return p;
}
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
renderer.domElement.addEventListener('mousedown', e => {
  if (state !== 'play' || !player) return;
  if (targeting) {
    if (e.button === 0) { const p = groundPoint(e); if (p) act({ t: 'item', i: targeting.i, x: +p.x.toFixed(2), z: +p.z.toFixed(2) }); }
    targeting = null; return; // right-click just cancels the aim
  }
  if (e.button === 2) {
    rightDown = true; const p = groundPoint(e); if (!p) return;
    const si = (MAP.shops || []).findIndex(o => Math.hypot(o.x - p.x, o.z - p.z) < 2.6);
    if (si >= 0) { act({ t: 'move', shop: si }); player.wantShop = MAP.shops[si]; rightDown = false; return; } // the shop opens on arrival
    player.wantShop = null; act({ t: 'move', x: +p.x.toFixed(2), z: +p.z.toFixed(2) }); clickFx(p.x, p.z);
  }
});
addEventListener('mouseup', e => { if (e.button === 2) rightDown = false; });
let cursor = null; // ground point under the mouse, for quick-cast items
renderer.domElement.addEventListener('mousemove', e => {
  cursor = groundPoint(e);
  if (rightDown && state === 'play' && player && performance.now() - (player.lastDragPath || 0) > 120) { const p = groundPoint(e); if (p) { act({ t: 'move', x: +p.x.toFixed(2), z: +p.z.toFixed(2) }); player.lastDragPath = performance.now(); } }
});
// zoom: proportional to the scroll amount so a trackpad's tiny momentum events barely move it; never while over UI
let wheelLast = 0;
addEventListener('wheel', e => {
  if (e.target !== renderer.domElement || e.ctrlKey) return;
  const now = performance.now(), d = Math.max(-120, Math.min(120, e.deltaMode ? e.deltaY * 40 : e.deltaY));
  if (Math.abs(d) < 4 || (now - wheelLast < 30 && Math.abs(d) < 15)) return; // momentum tail
  wheelLast = now; zoomTarget = Math.max(0.6, Math.min(1.5, zoomTarget + d * 0.0012));
}, { passive: true });
addEventListener('keydown', e => {
  const k = e.key.toLowerCase(); keys[k] = true;
  if (state !== 'play' || !player || e.repeat || !$('menu').classList.contains('hidden')) return;
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
  const slot = { z: 0, x: 1, c: 2 }[k];
  if (slot !== undefined) act({ t: 'raze', s: slot });
  if (k >= '1' && k <= '6') playerUseItem(+k - 1);
  if (k === 'b') toggleShop();
  if (k === 'r') act({ t: 'ult' });
  if (k === 's' && settings.move === 'mouse') act({ t: 'stop' });
  if (k === 'm') { AUD.muted = !AUD.muted; announce('', AUD.muted ? 'Sound muted (M)' : 'Sound on (M)'); }
  if (k === 'escape' && targeting) { targeting = null; return; }
  if (k === 'escape') { if (shopOpen) toggleShop(false); else pauseToMenu(); }
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
// offline the game pauses when the tab is hidden; online it can't (the match goes on for everyone), so it only goes quiet
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play' && !NET.role) pauseToMenu(); });
function pauseToMenu() {
  toggleShop(false); $('menu').classList.remove('hidden'); $('play').textContent = 'RESUME';
  if (NET.role) return; // online: the menu is an overlay, the match keeps running
  state = 'menu'; AUD.stopAmbient();
}
function wasd() {
  if (settings.move !== 'wasd') return null;
  return { x: (keys.d ? 1 : 0) - (keys.a ? 1 : 0), z: (keys.s ? 1 : 0) - (keys.w ? 1 : 0) };
}

// ------------------------------------------------------------------ HUD
const floats = [];
function floatText(pos, txt, color, cls = '') {
  const el = document.createElement('div'); el.className = 'dmg ' + cls; el.textContent = txt; el.style.color = color;
  labelsEl.appendChild(el); floats.push({ el, p: new THREE.Vector3(pos.x + rnd(-0.3, 0.3), 2.6, pos.z), t: 0 });
}
let annT = 0;
function announce(big, small, voiceKey) {
  if (voiceKey) AUD.announce(voiceKey);
  $('announce').textContent = big; $('sub-announce').textContent = small; $('announce').style.opacity = big ? 1 : 0; $('sub-announce').style.opacity = 1; annT = 2.8;
}
function killfeed(html) { const d = document.createElement('div'); d.innerHTML = html; $('killfeed').prepend(d); while ($('killfeed').children.length > 6) $('killfeed').lastChild.remove(); setTimeout(() => d.remove(), 7000); }
let errT = 0;
function showErr(msg) { $('err').textContent = msg; $('err').style.opacity = 1; errT = 1.6; sfx('error', 0.5); }
function playerUseItem(i) {
  if (!player) return;
  const it = player.items[i], D = it && ITEMS[it.id];
  if (D && (D.target === 'point' || D.target === 'unit') && !(it.cd > 0)) { // aim first, as in DotA: left-click casts, right-click or Esc cancels
    targeting = targeting && targeting.i === i ? null : { i }; return;
  }
  act(cursor ? { t: 'item', i, x: +cursor.x.toFixed(2), z: +cursor.z.toFixed(2) } : { t: 'item', i });
}
let targeting = null; // { i }: the inventory slot being aimed
const aimRing = new THREE.Mesh(quadGeo, new THREE.MeshBasicMaterial({ map: ringTex, color: 0x5aa8ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 }));
const aimMark = new THREE.Mesh(quadGeo, new THREE.MeshBasicMaterial({ map: ringTex, color: 0x9ad0ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.95 }));
for (const m of [aimRing, aimMark]) { m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 3; scene.add(m); }
function updateTargeting() {
  const it = targeting && player && player.alive && state === 'play' && player.items[targeting.i];
  if (!it || it.cd > 0) targeting = null;
  const on = !!targeting; aimRing.visible = aimMark.visible = on && !!cursor;
  document.body.classList.toggle('aiming', on);
  if (!on || !cursor) return;
  const D = ITEMS[it.id], px = player.pos.x, pz = player.pos.z;
  aimRing.position.set(px, H(px, pz) + 0.09, pz); aimRing.scale.setScalar(D.range);
  let x = cursor.x, z = cursor.z; const d = Math.hypot(x - px, z - pz);
  if (D.target === 'point' && d > D.range) { x = px + (x - px) / d * D.range; z = pz + (z - pz) / d * D.range; } // a blink past its range goes as far as it can
  aimMark.position.set(x, H(x, z) + 0.1, z); aimMark.scale.setScalar(D.target === 'unit' ? 1.2 : 0.9);
}
// every action the local player takes goes through here: run at once offline or as host, sent to the host as a guest
function act(c) {
  if (NET.role === 'client') { NET.send(c); return; }
  cmdResult(c, applyCmd(player, c));
}
function applyCmd(u, c) {
  switch (c.t) {
    case 'move': {
      const shop = c.shop !== undefined && (MAP.shops || [])[c.shop];
      if (shop) { const dx = u.pos.x - shop.x, dz = u.pos.z - shop.z, d = Math.hypot(dx, dz) || 1; u.moveTo(shop.x + dx / d * 2.8, shop.z + dz / d * 2.8); }
      else if (isFinite(c.x) && isFinite(c.z)) u.moveTo(c.x, c.z);
      return true;
    }
    case 'stop': u.moveTarget = null; u.path = null; return true;
    case 'raze': if (c.s >= 0 && c.s <= 2) u.castRaze(c.s); return true;
    case 'ult': return u.castUlt();
    case 'item': return c.i >= 0 && c.i < 6 ? useItem(u, c.i, isFinite(c.x) ? { x: c.x, z: c.z } : null) : 'Empty slot';
    case 'buy': return ITEMS[c.id] && SHOP.includes(c.id) ? buyItem(u, c.id) : 'Unknown item';
    case 'sell': return c.i >= 0 && c.i < 6 && sellItem(u, c.i) ? true : 'Walk up to a Soul Merchant to sell';
    case 'swap': if (c.a >= 0 && c.a < 6 && c.b >= 0 && c.b < 6) [u.items[c.a], u.items[c.b]] = [u.items[c.b], u.items[c.a]]; return true;
    case 'wasd': u.netInput = { x: Math.sign(c.x) || 0, z: Math.sign(c.z) || 0 }; return true;
  }
  return true;
}
// feedback on the local player's own action (for a guest it arrives back from the host)
function cmdResult(c, r) {
  if (r !== true) { if (typeof r === 'string' && c.t !== 'raze') showErr(r); return; }
  if (c.t === 'buy') { sfx('buy', 0.7); const el = shopEls[c.id]; if (el) { el.querySelector('img').animate([{ transform: 'scale(1.15)' }, { transform: 'scale(1)' }], 180); $('shopTip').innerHTML = itemTipHTML(c.id, player); } }
  if (c.t === 'sell') sfx('coin', 0.5);
  refreshInv();
}
function itemTipHTML(id, u) {
  const D = ITEMS[id], price = u ? priceFor(u, id) : D.cost;
  return `<h3>${D.name}</h3><div class="classic">In the spirit of DotA's ${D.classic}</div>` +
    `<div class="cost"><i></i> ${price}${price !== D.cost ? ` (${D.cost} + ${ITEMS[D.needs].name})` : ''}</div>` +
    `<ul>${D.stats.map(x => `<li>${x}</li>`).join('')}</ul><div class="desc">${D.desc}</div>`;
}
// inventory: six slots, hotkeys 1-6. Left-click uses, right-click sells, hover explains.
const invEls = [];
for (let i = 0; i < 6; i++) {
  const el = document.createElement('div'); el.className = 'islot empty';
  el.innerHTML = `<img alt=""><div class="cd"></div><span class="k">${i + 1}</span><span class="n"></span><span class="t"></span>`;
  el.addEventListener('mousedown', e => {
    e.stopPropagation(); if (!player) return;
    if (e.button === 0 && player.items[i]) invDrag = { i, x: e.clientX, y: e.clientY, ghost: null };
    if (e.button === 2 && player.items[i]) act({ t: 'sell', i });
  });
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('mouseenter', () => { const it = player && player.items[i]; if (!it) return; const r = el.getBoundingClientRect(), T = $('itemTip'); T.innerHTML = itemTipHTML(it.id) + '<div class="classic">Drag to another slot to move · right-click to sell for half</div>'; T.style.left = Math.min(innerWidth - 270, r.left - 100) + 'px'; T.style.bottom = (innerHeight - r.top + 8) + 'px'; T.classList.remove('hidden'); });
  el.addEventListener('mouseleave', () => $('itemTip').classList.add('hidden'));
  $('inv').appendChild(el); invEls.push(el);
}
// dragging an inventory item: a ghost icon follows the mouse; dropping it on another slot swaps the two
let invDrag = null;
addEventListener('mousemove', e => {
  if (!invDrag) return;
  if (!invDrag.ghost && Math.hypot(e.clientX - invDrag.x, e.clientY - invDrag.y) > 6) {
    const g = invDrag.ghost = document.createElement('img'); g.id = 'invGhost'; g.src = invEls[invDrag.i].querySelector('img').src; document.body.appendChild(g);
    invEls[invDrag.i].classList.add('dragging'); $('itemTip').classList.add('hidden');
  }
  if (invDrag.ghost) { invDrag.ghost.style.left = e.clientX - 22 + 'px'; invDrag.ghost.style.top = e.clientY - 22 + 'px'; invEls.forEach(el => el.classList.toggle('drop', el === slotAt(e))); }
});
addEventListener('mouseup', e => {
  if (!invDrag || e.button !== 0) return;
  const d = invDrag; invDrag = null;
  if (!d.ghost) { playerUseItem(d.i); return; }
  d.ghost.remove(); invEls.forEach(el => el.classList.remove('drop', 'dragging'));
  const to = invEls.indexOf(slotAt(e));
  if (to >= 0 && to !== d.i) { act({ t: 'swap', a: d.i, b: to }); sfx('coin', 0.25); }
});
function slotAt(e) { const el = document.elementFromPoint(e.clientX, e.clientY); return el && el.closest('.islot'); }
let invSig = '';
function refreshInv() { invSig = ''; }
function updateInv() {
  const sig = player.items.map(it => it ? it.id + ':' + (it.charges ?? '') : '-').join('|');
  if (sig !== invSig) {
    invSig = sig;
    player.items.forEach((it, i) => {
      const el = invEls[i], img = el.querySelector('img');
      el.className = 'islot' + (it ? ITEMS[it.id].kind === 'passive' ? ' passive' : '' : ' empty');
      if (it) { if (img.dataset.id !== it.id) { img.src = iconURL(it.id); img.dataset.id = it.id; } img.style.visibility = ''; }
      else { img.style.visibility = 'hidden'; img.dataset.id = ''; el.querySelector('.cd').style.height = '0'; el.querySelector('.t').textContent = ''; }
      el.querySelector('.n').textContent = it && it.charges !== undefined ? it.charges : '';
    });
  }
  player.items.forEach((it, i) => {
    if (!it) return; const D = ITEMS[it.id], el = invEls[i];
    el.querySelector('.cd').style.height = D.cd && it.cd > 0 ? (it.cd / D.cd * 100) + '%' : '0';
    el.querySelector('.t').textContent = it.cd > 0.05 ? Math.ceil(it.cd) : '';
    el.classList.toggle('active-ready', D.kind !== 'passive' && !(it.cd > 0));
  });
  $('goldText').textContent = Math.floor(player.gold);
}
// the shop panel
let shopOpen = false;
const shopEls = {};
for (const id of SHOP) {
  const el = document.createElement('div'); el.className = 'sitem';
  el.innerHTML = `<img src="${iconURL(id)}" alt="${ITEMS[id].name}"><div class="cost"><i></i><span>${ITEMS[id].cost}</span></div>`;
  el.addEventListener('mouseenter', () => { $('shopTip').innerHTML = itemTipHTML(id, player); });
  el.addEventListener('mousedown', e => {
    e.stopPropagation(); if (!player) return;
    act({ t: 'buy', id });
  });
  el.addEventListener('contextmenu', e => e.preventDefault());
  $('shopGrid').appendChild(el); shopEls[id] = el;
}
$('shopClose').onclick = () => toggleShop(false);
$('shopBtn').onclick = () => toggleShop();
$('shop').addEventListener('contextmenu', e => e.preventDefault());
function toggleShop(open = !shopOpen) {
  if (open && (!player || state !== 'play')) return;
  shopOpen = open; $('shop').classList.toggle('hidden', !open);
  if (open) { sfx('shopOpen', 0.5); updateShop(); } else $('itemTip').classList.add('hidden');
}
function updateShop() {
  $('shopGold').textContent = Math.floor(player.gold);
  $('shop').classList.toggle('far', !atShop(player));
  for (const id of SHOP) {
    const el = shopEls[id], price = priceFor(player, id);
    el.classList.toggle('poor', player.gold < price);
    el.classList.toggle('owned', slotOf(player, id) >= 0);
    el.querySelector('.cost span').textContent = price;
  }
}
const mm = $('minimap').getContext('2d'); const slots = [...document.querySelectorAll('.slot')];
const tmpV = new THREE.Vector3();
function project(p, y) { tmpV.set(p.x, y + H(p.x, p.z), p.z).project(camera); return [(tmpV.x * 0.5 + 0.5) * innerWidth, (-tmpV.y * 0.5 + 0.5) * innerHeight, tmpV.z]; }
let hudT = 0, mmT = 0, lastBuffs = '';
function updateHud(dt) {
  for (const u of units) {
    const [x, y, z] = project(u.pos, 3.5);
    const show = u.alive && z < 1 && u.seen !== false;
    u.label.style.display = show ? '' : 'none';
    if (show) { u.label.style.left = x + 'px'; u.label.style.top = y + 'px'; const f = u.hp / u.maxHp; u.hbEl.style.width = (f * 100) + '%'; u.hbEl.style.background = f > 0.5 ? '#4adf4a' : f > 0.25 ? '#e0c030' : '#e04030'; }
  }
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.t += dt; f.p.y += dt * 1.6;
    const [x, y] = project(f.p, f.p.y); f.el.style.left = x + 'px'; f.el.style.top = y + 'px'; f.el.style.opacity = 1 - f.t;
    if (f.t > 1) { f.el.remove(); floats.splice(i, 1); }
  }
  if (annT > 0) { annT -= dt; if (annT <= 0) { $('announce').style.opacity = 0; $('sub-announce').style.opacity = 0; } }
  if (!player) return;
  slots.forEach((el, s) => {
    const cd = s === 3 ? player.ultCd : player.cd[s], max = s === 3 ? CFG.ultCd : CFG.razeCd * player.mod.cdMul;
    el.querySelector('.cd').style.height = (Math.min(1, cd / max) * 100) + '%';
    el.querySelector('.t').textContent = cd > 0.05 ? (s === 3 ? Math.ceil(cd) : cd.toFixed(1)) : '';
    if (s === 3) { el.querySelector('i').textContent = Math.max(1, Math.floor(player.souls / 2)) + ' lines'; el.classList.toggle('locked', player.souls < CFG.ultMinSouls); }
  });
  $('soulCount').textContent = player.souls;
  updateInv(); updateTargeting(); if (shopOpen) updateShop();
  if (errT > 0) { errT -= dt; if (errT <= 0) $('err').style.opacity = 0; }
  { // the Soul Merchant: open on arrival after right-clicking it; hint when standing near one
    const near = atShop(player);
    if (player.wantShop && Math.hypot(player.wantShop.x - player.pos.x, player.wantShop.z - player.pos.z) < 3.6) { player.wantShop = null; toggleShop(true); }
    $('shopHint').style.opacity = near && !shopOpen && player.alive ? 1 : 0;
  }
  $('hpFill').style.width = (player.hp / player.maxHp * 100) + '%';
  $('hpText').textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
  $('respawn').textContent = player.alive ? '' : `Respawning in ${Math.max(0, player.respawnT).toFixed(1)}…`;
  const grey = !player.alive && state === 'play'; if (grey !== renderer.domElement.classList.contains('dead')) renderer.domElement.classList.toggle('dead', grey);
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
  mm.fillStyle = MAP.theme === 'molten' ? '#3a1408' : MAP.theme === 'river' || MAP.theme === 'grave' ? '#0c0f14' : '#05080e'; mm.fillRect(0, 0, S, S);
  mm.fillStyle = MAP.theme === 'frozen' ? '#46566a' : MAP.theme === 'river' ? '#3e5e22' : MAP.theme === 'grave' ? '#1e221c' : '#2a1d18';
  mm.beginPath();
  if (MAP.r >= Math.min(MAP.hx, MAP.hz)) mm.arc(S / 2, S / 2, MAP.hx * k, 0, 7);
  else { const hx = MAP.hx * k, hz = MAP.hz * k, r = MAP.r * k, c = S / 2; mm.moveTo(c - hx + r, c - hz); mm.arcTo(c + hx, c - hz, c + hx, c + hz, r); mm.arcTo(c + hx, c + hz, c - hx, c + hz, r); mm.arcTo(c - hx, c + hz, c - hx, c - hz, r); mm.arcTo(c - hx, c - hz, c + hx, c - hz, r); }
  mm.fill();
  mm.lineCap = 'round';
  // terraces are lighter on the minimap, the higher the lighter, like WC3 cliff levels
  for (const t of MAP.terraces || []) { mm.fillStyle = `rgba(255,255,255,${0.07 * t.h})`; mm.beginPath(); if (t.r !== undefined) mm.arc(X(t.x), X(t.z), t.r * k, 0, 7); else { const P = t.rect ? [[t.rect[0], t.rect[1]], [t.rect[2], t.rect[1]], [t.rect[2], t.rect[3]], [t.rect[0], t.rect[3]]] : t.poly; P.forEach(([x, z], i) => i ? mm.lineTo(X(x), X(z)) : mm.moveTo(X(x), X(z))); mm.closePath(); } mm.fill(); }
  for (const h of MAP.hazards) { mm.strokeStyle = h.type === 'lava' ? '#ff5a10' : h.type === 'curse' ? '#8a3aff' : '#1a4a6a'; mm.lineWidth = h.r * 2 * k; mm.beginPath(); mm.moveTo(X(h.a[0]), X(h.a[1])); mm.lineTo(X(h.b[0]), X(h.b[1])); mm.stroke(); }
  for (const c of MAP.ice || []) { mm.fillStyle = '#7aa4c8'; mm.beginPath(); mm.arc(X(c.x), X(c.z), c.r * k, 0, 7); mm.fill(); }
  if (fogOn && player) { const r = FOW_U.fowRect.value; mm.imageSmoothingEnabled = true; mm.drawImage(fowCanvas, X(r.x), X(r.y), r.z * k, r.w * k); }
  mm.fillStyle = '#000a'; for (const o of MAP.obstacles) { mm.beginPath(); mm.arc(X(o.x), X(o.z), o.r * k + 1, 0, 7); mm.fill(); }
  for (const o of MAP.shops || []) { mm.fillStyle = '#ffc040'; mm.fillRect(X(o.x) - 4, X(o.z) - 4, 8, 8); mm.strokeStyle = '#000'; mm.lineWidth = 1; mm.strokeRect(X(o.x) - 4, X(o.z) - 4, 8, 8); }
  if (player) for (const w of player.wards) { mm.fillStyle = '#ffd040'; mm.beginPath(); mm.arc(X(w.x), X(w.z), 2.5, 0, 7); mm.fill(); }
  if (rune) { mm.fillStyle = RUNES[rune.type].css; mm.beginPath(); mm.arc(X(rune.x), X(rune.z), 4, 0, 7); mm.fill(); }
  for (const u of units) {
    if (!u.alive || u.seen === false) continue;
    const x = X(u.pos.x), y = X(u.pos.z);
    mm.fillStyle = u.color; mm.beginPath(); mm.arc(x, y, u.isPlayer ? 5 : 4, 0, 7); mm.fill();
    mm.strokeStyle = u.color; mm.lineWidth = 2; mm.beginPath(); mm.moveTo(x, y); mm.lineTo(x + Math.sin(u.facing) * 9, y + Math.cos(u.facing) * 9); mm.stroke();
  }
  mm.restore();
}

// ------------------------------------------------------------------ online play: invite friends
// One player hosts and runs the real match; friends join with the invite code or link. PeerJS's free public
// server only introduces the browsers to each other; the game itself then flows directly between them (WebRTC).
// The host sends every guest a snapshot of all heroes 20 times a second, with the events since the last one
// (razes, hits, deaths, items...). Guests draw other heroes slightly in the past, smoothly between snapshots,
// and their own hero from the newest snapshot, and replay each event with the same effects the host sees.
const NET = { role: null, peer: null, conns: [], host: null, code: '', evq: [], snaps: [], sendT: 0, hiddenT: 0, lastWasd: '' };
const NET_PREFIX = 'sfa-arena-', NET_MAX = 8;
function netEv(...a) { if (NET.role === 'host' && (state === 'play' || state === 'end')) NET.evq.push(a); }
function feed(html) { killfeed(html); netEv('feed', html); }
function shout(big, small, voice) { announce(big, small, voice); netEv('ann', big, small, voice || ''); }
NET.send = m => { if (NET.host && NET.host.open) NET.host.send(m); };
const cleanName = n => String(n || '').replace(/[<>&"'`]/g, '').trim().slice(0, 14) || 'Guest';
// the killfeed arrives as HTML from the host: keep only the tags the game itself writes
const safeHTML = h => String(h).replace(/<(?!\/?(b|span)( style="color:#[0-9a-fA-F]{3,8}")?>)[^>]*>/g, '');
const myName = () => cleanName($('optName').value || 'Shadow Fiend');
function netStatus(t) { $('netState').textContent = t; }
function makeCode() { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let c = ''; for (let i = 0; i < 6; i++) c += A[Math.random() * A.length | 0]; return c; }
function inviteLink() { return location.href.split('#')[0] + '#join=' + NET.code; }
function newPeer(id) {
  if (!window.Peer) { netStatus('Online play needs the PeerJS library.'); return null; }
  return id ? new Peer(id, { debug: 1 }) : new Peer({ debug: 1 });
}
function netLeave() {
  if (NET.peer) try { NET.peer.destroy(); } catch (e) {}
  Object.assign(NET, { role: null, peer: null, conns: [], host: null, code: '', evq: [], snaps: [] });
  for (const id of ['optMap', 'optBots', 'optDiff', 'optKills', 'optFog']) $(id).disabled = false;
  $('play').disabled = false; $('play').textContent = units.length && state === 'menu' ? 'RESUME' : 'PLAY';
  $('lobby').classList.add('hidden'); $('inviteBox').classList.add('hidden'); $('again').classList.remove('hidden'); $('endWait').classList.add('hidden');
}
function showLobby() { $('lobby').classList.remove('hidden'); lobbyUpdate(); }
function lobbyUpdate(names) {
  if (NET.role === 'host') names = [myName() + ' (host)', ...NET.conns.map(c => c.name)];
  $('lobbyList').innerHTML = (names || []).map((n, i) => `<div><span class="sw" style="background:${COLORS[i % COLORS.length]}"></span>${cleanName(n)}</div>`).join('');
  if (NET.role === 'host') for (const c of NET.conns) if (c.open) c.send({ e: 'lobby', names, map: MAPS[$('optMap').value].name });
}

// ---- host
function hostOnline() {
  if (NET.role === 'host') return;
  netLeave(); NET.role = 'host'; NET.code = makeCode();
  const peer = NET.peer = newPeer(NET_PREFIX + NET.code); if (!peer) { NET.role = null; return; }
  netStatus('Opening the lobby…'); showLobby();
  peer.on('open', () => {
    $('inviteCode').textContent = NET.code; $('inviteBox').classList.remove('hidden');
    netStatus('Send the invite link (or code) to your friends. Press PLAY when everyone is in.');
  });
  peer.on('connection', conn => {
    conn.on('data', m => hostRecv(conn, m));
    conn.on('close', () => hostDrop(conn)); conn.on('error', () => hostDrop(conn));
  });
  peer.on('error', e => {
    if (e.type === 'unavailable-id') { NET.role = null; hostOnline(); return; } // that code is taken: pick another
    if (e.type !== 'peer-unavailable') netStatus('Online problem: ' + (e.type || e.message) + '. Check your internet connection.');
  });
  peer.on('disconnected', () => { if (NET.role === 'host' && !peer.destroyed) peer.reconnect(); }); // lost the lobby server only; players stay connected
}
function hostRecv(conn, m) {
  if (!m || typeof m !== 'object') return;
  if (m.e === 'hello') {
    if (conn.ready) return;
    if (NET.conns.length >= NET_MAX - 1) { conn.send({ e: 'full' }); setTimeout(() => conn.close(), 500); return; }
    conn.name = cleanName(m.name); conn.ready = true; NET.conns.push(conn);
    if (state === 'play' || state === 'end') { // joining a match already under way: take over a bot, or a fresh hero
      if (seatGuest(conn)) { feed(`<b style="color:${conn.unit.color}">${conn.name}</b> joined the game`); sendStart(conn); netSend({ e: 'roster', roster: roster() }, conn); }
      else conn.send({ e: 'full' });
    }
    lobbyUpdate(); return;
  }
  if (m.t && conn.unit && state === 'play') { // one of the guest's actions
    const r = applyCmd(conn.unit, m);
    if (m.t !== 'move' && m.t !== 'wasd' && m.t !== 'stop') conn.send({ e: 'res', c: m, r });
  }
}
function hostDrop(conn) {
  const i = NET.conns.indexOf(conn); if (i < 0) return;
  NET.conns.splice(i, 1);
  const u = conn.unit;
  if (u && units.includes(u)) { // a bot takes over the hero so the match stays fair
    u.netInput = null; u.human = false; u.remote = null; bots.push(new Bot(u, DIFF[settings.diff]));
    feed(`<b style="color:${u.color}">${u.name}</b> left; a bot takes over`);
  }
  lobbyUpdate();
}
function seatGuest(conn) {
  let u = null;
  const bi = bots.length - 1;
  if (bi >= 0 && units.length >= NET_MAX) { u = bots[bi].u; bots.splice(bi, 1); } // the arena is full: replace a bot
  else if (units.length < NET_MAX) { u = new Unit(Math.max(...units.map(o => o.id)) + 1, conn.name, false); units.push(u); respawn(u); fowAll(u.root); }
  if (!u) return false;
  u.name = conn.name; u.label.querySelector('span').textContent = conn.name; u.human = true; u.remote = conn; conn.unit = u;
  return true;
}
const roster = () => units.map(u => ({ id: u.id, name: u.name, human: !!u.human, x: +u.pos.x.toFixed(2), z: +u.pos.z.toFixed(2), alive: u.alive }));
function netSend(m, except) { for (const c of NET.conns) if (c !== except && c.open && c.unit) c.send(m); }
function sendStart(conn) {
  conn.send({ e: 'start', you: conn.unit.id, roster: roster(), t: gameTime,
    settings: { map: settings.map, kills: settings.kills, fog: settings.fog, bots: settings.bots, diff: settings.diff } });
}
const r2 = v => Math.round(v * 100) / 100;
function unitState(u) {
  return [u.id, r2(u.pos.x), r2(u.pos.z), r2(u.facing), Math.round(u.hp), u.maxHp, u.souls, u.alive ? 1 : 0,
    u.cast ? u.cast.slot : -1, u.cast ? r2(u.cast.t) : 0, u.ult ? r2(u.ult.t) : 0, r2(u.prot),
    r2(u.cd[0]), r2(u.cd[1]), r2(u.cd[2]), r2(u.ultCd), r2(u.buffs.haste), r2(u.buffs.dd), r2(u.buffs.regen),
    r2(u.slowT), r2(u.cyclone), r2(u.immune), r2(u.invis), u.kills, u.deaths, u.streak, Math.floor(u.gold), r2(u.respawnT), r2(u.post),
    u.items.map(it => it ? [it.id, r2(it.cd), it.charges === undefined ? null : it.charges] : 0)];
}
function netHostTick(rdt) {
  NET.sendT -= rdt; if (NET.sendT > 0 || !NET.conns.length) return;
  NET.sendT = 0.05;
  const m = { e: 's', t: r2(gameTime), u: units.map(unitState), r: rune ? [rune.x, rune.z, rune.type] : 0, ev: NET.evq };
  NET.evq = [];
  netSend(m);
}
function netSendEnd(w, v) {
  NET.evq.length && netHostTick(1); // flush the last events first
  netSend({ e: 'end', w: w.id, v: v ? v.id : -1, stats: units.map(u => [u.id, u.kills, u.deaths, u.stats.assists, Math.round(u.stats.dmg), u.stats.casts, u.stats.razesHit || 0, Math.round(u.stats.goldEarned)]) });
}
// a hidden tab gets no animation frames: keep the host's match running (and sending) on a timer instead
setInterval(() => {
  if (NET.role !== 'host' || !document.hidden || (state !== 'play' && state !== 'end')) { NET.hiddenT = performance.now(); return; }
  const now = performance.now(), d = Math.min(0.25, (now - NET.hiddenT) / 1000); NET.hiddenT = now;
  acc += d; while (acc >= CFG.step) { simStep(CFG.step); acc -= CFG.step; }
  netHostTick(d);
}, 50);

// ---- guest
function joinOnline(code) {
  code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (!code) { netStatus('Type the invite code first.'); return; }
  netLeave(); NET.role = 'client'; NET.code = code;
  for (const id of ['optMap', 'optBots', 'optDiff', 'optKills', 'optFog']) $(id).disabled = true;
  $('play').disabled = true; $('play').textContent = 'WAITING FOR HOST';
  const peer = NET.peer = newPeer(); if (!peer) { netLeave(); return; }
  netStatus('Connecting to ' + code + '…'); showLobby();
  peer.on('open', () => {
    const conn = NET.host = peer.connect(NET_PREFIX + code, { serialization: 'json', reliable: true });
    conn.on('open', () => { conn.send({ e: 'hello', name: myName() }); netStatus('Joined! Waiting for the host to press PLAY…'); });
    conn.on('data', clientRecv);
    conn.on('close', () => netLost('The host closed the game.'));
    conn.on('error', () => netLost('Lost the connection to the host.'));
  });
  peer.on('error', e => {
    if (e.type === 'peer-unavailable') { netStatus('No game found with code ' + code + '. Check the code, or ask your friend to host again.'); return; }
    netStatus('Online problem: ' + (e.type || e.message) + '. Check your internet connection.');
  });
}
function netLost(msg) {
  if (NET.role !== 'client') return;
  const inMatch = units.length > 0;
  netLeave();
  if (inMatch) { units.forEach(u => u.dispose()); units = []; player = null; state = 'menu'; AUD.stopAmbient(); $('hud').classList.add('hidden'); $('end').classList.add('hidden'); $('menu').classList.remove('hidden'); $('play').textContent = 'PLAY'; }
  netStatus(msg); $('lobby').classList.remove('hidden');
}
function clientRecv(m) {
  if (!m || typeof m !== 'object') return;
  switch (m.e) {
    case 'lobby': lobbyUpdate(m.names); netStatus(`Joined! Map: ${m.map}. Waiting for the host to press PLAY…`); break;
    case 'full': netStatus('That game is full (8 heroes).'); break;
    case 'start': startClient(m); break;
    case 'roster': syncRoster(m.roster); break;
    case 's': if (state !== 'menu' || units.length) clientSnap(m); break;
    case 'res': cmdResult(m.c, m.r); break;
    case 'end': clientEnd(m); break;
  }
}
function syncRoster(list) {
  for (const r of list) {
    let u = unitById(r.id);
    if (!u) { u = new Unit(r.id, cleanName(r.name), false); u.pos.set(r.x, 0, r.z); u.prev.copy(u.pos); units.push(u); fowAll(u.root); }
    if (u.name !== cleanName(r.name)) { u.name = cleanName(r.name); u.label.querySelector('span').textContent = u.name; }
    u.human = r.human;
  }
}
function startClient(m) {
  AUD.init();
  settings = Object.assign({ shake: $('optShake').value, move: $('optMove').value, gfx: $('optGfx').value }, m.settings);
  resetMatch();
  for (const r of m.roster) {
    const me = r.id === m.you, u = new Unit(r.id, cleanName(r.name), me); u.human = r.human;
    u.pos.set(r.x, 0, r.z); u.prev.copy(u.pos); u.alive = r.alive; units.push(u);
    if (me) player = u;
  }
  gameTime = m.t || 0; NET.snaps = [];
  enterMatch();
  $('play').disabled = false; $('again').classList.add('hidden'); $('endWait').classList.remove('hidden');
}
function clientSnap(m) {
  for (const e of m.ev || []) clientEvent(e);
  NET.snaps.push({ at: performance.now(), m: new Map(m.u.map(a => [a[0], a])) }); if (NET.snaps.length > 40) NET.snaps.shift();
  gameTime = m.t;
  const r = m.r ? { x: m.r[0], z: m.r[1], type: m.r[2] } : null;
  if (!!r !== !!rune || (r && (r.x !== rune.x || r.z !== rune.z || r.type !== rune.type))) showRune(r && RUNES[r.type] ? r : null);
  for (const a of m.u) { const u = unitById(a[0]); if (u) applyState(u, a); }
}
function applyState(u, a) {
  const [, , , , hp, maxHp, souls, alive, cs, ct, ut, prot, c0, c1, c2, ucd, bh, bd, br, slow, cyc, imm, inv, kills, deaths, streak, gold, rsp, post, items] = a;
  u.hp = hp; u.maxHp = maxHp; u.souls = souls;
  if (alive && !u.alive) { u.pos.set(a[1], 0, a[2]); u.prev.copy(u.pos); }
  u.alive = !!alive;
  if (cs >= 0) { if (!u.cast) fxCast(u, cs, a[3]); u.cast = { slot: cs, t: ct }; } else { if (u.cast) u.tele.visible = false; u.cast = null; }
  u.ult = ut > 0 ? { t: ut } : null; u.prot = prot; u.cd = [c0, c1, c2]; u.ultCd = ucd;
  u.buffs.haste = bh; u.buffs.dd = bd; u.buffs.regen = br; u.slowT = slow; u.cyclone = cyc; u.immune = imm; u.invis = inv;
  u.kills = kills; u.deaths = deaths; u.streak = streak; u.gold = gold; u.respawnT = rsp; u.post = post;
  u.items = items.map(it => it && ITEMS[it[0]] ? { id: it[0], cd: it[1], charges: it[2] === null ? undefined : it[2] } : null);
  u.mod.cdMul = u.items.some(it => it && it.id === 'scepter') ? ITEMS.scepter.cdMul : 1;
}
function clientEvent(e) {
  const U = unitById;
  switch (e[0]) {
    case 'cast': { const u = U(e[1]); if (u && !u.cast) { fxCast(u, e[2], e[3]); u.cast = { slot: e[2], t: CFG.castTime }; } break; }
    case 'ultc': { const u = U(e[1]); if (u) fxUltCharge(u); break; }
    case 'raze': { const u = U(e[1]); if (u) { u.cast = null; u.tele.visible = false; fxRaze(u, e[2], e[3], e[4], !!e[5], !!e[6]); } break; }
    case 'hit': { const o = U(e[1]), s = U(e[3]); if (o && s) fxHit(o, e[2], s); break; }
    case 'die': { const o = U(e[1]); if (o) { fxDeath(o, U(e[2]) || null, e[3]); o.alive = false; o.cast = null; } break; }
    case 'spawn': { const u = U(e[1]); if (u) { u.pos.set(e[2], 0, e[3]); u.prev.copy(u.pos); u.alive = true; fxSpawn(u); } break; }
    case 'req': { const u = U(e[1]); if (u) releaseRequiem(u, e[2], e[3]); break; }
    case 'rune': { const u = U(e[1]); if (u && RUNES[e[2]]) fxRune(u, { type: e[2], x: e[3], z: e[4] }); showRune(null); break; }
    case 'gold': { const u = U(e[1]); if (u) fxGold(u, e[2], { x: e[3], z: e[4] }); break; }
    case 'item': { const u = U(e[1]); if (u && ITEMS[e[2]]) fxItem(u, e[2], e[3] || {}); break; }
    case 'feed': killfeed(safeHTML(e[1])); break;
    case 'ann': announce(String(e[1]), String(e[2]), e[3] || undefined); break;
  }
}
// other heroes are drawn ~110 ms in the past, between two snapshots; your own from the newest one
function clientUpdate(dt) {
  const S = NET.snaps; if (!S.length) return;
  const tr = performance.now() - 110;
  let i = S.length - 1; while (i > 0 && S[i - 1].at > tr) i--;
  const b = S[i], a = S[Math.max(0, i - 1)], latest = S[S.length - 1];
  const k = b.at > a.at ? THREE.MathUtils.clamp((tr - a.at) / (b.at - a.at), 0, 1) : 1;
  for (const u of units) {
    const B = b.m.get(u.id), A = a.m.get(u.id) || B, L = latest.m.get(u.id); if (!B || !L) continue;
    u.prev.copy(u.pos);
    if (u === player) {
      const d = Math.hypot(L[1] - u.pos.x, L[2] - u.pos.z), s = d > 3 ? 1 : 1 - Math.exp(-dt * 18);
      u.pos.x += (L[1] - u.pos.x) * s; u.pos.z += (L[2] - u.pos.z) * s; u.facing = L[3];
    } else if (Math.hypot(B[1] - A[1], B[2] - A[2]) > 3) { u.pos.set(B[1], 0, B[2]); u.facing = B[3]; } // blink or respawn: no sliding
    else { u.pos.set(A[1] + (B[1] - A[1]) * k, 0, A[2] + (B[2] - A[2]) * k); u.facing = wrap(A[3] + wrap(B[3] - A[3]) * k); }
    u.vel.subVectors(u.pos, u.prev).divideScalar(Math.max(dt, 1e-3));
  }
  if (settings.move === 'wasd' && state === 'play') { const w = wasd(), sig = w.x + ',' + w.z; if (sig !== NET.lastWasd) { NET.lastWasd = sig; act({ t: 'wasd', x: w.x, z: w.z }); } }
}
function clientEnd(m) {
  for (const [id, k, d, as, dmg, casts, hits, gold] of m.stats) { const u = unitById(id); if (!u) continue; u.kills = k; u.deaths = d; u.stats.assists = as; u.stats.dmg = dmg; u.stats.casts = casts; u.stats.razesHit = hits; u.stats.goldEarned = gold; }
  const w = unitById(m.w); if (w) endGame(w, unitById(m.v));
}
// lobby buttons
$('hostBtn').onclick = () => hostOnline();
$('joinBtn').onclick = () => { $('joinBox').classList.toggle('hidden'); $('joinCode').focus(); };
$('joinGo').onclick = () => joinOnline($('joinCode').value);
$('joinCode').addEventListener('keydown', e => { if (e.key === 'Enter') joinOnline($('joinCode').value); });
$('copyLink').onclick = () => {
  const t = inviteLink(), done = () => { $('copyLink').textContent = 'Copied!'; setTimeout(() => { $('copyLink').textContent = 'Copy invite link'; }, 1500); };
  if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, () => prompt('Copy this invite link:', t)); else prompt('Copy this invite link:', t);
};
$('leaveBtn').onclick = () => { if (NET.role === 'client' && units.length) netLost('You left the game.'); else { netLeave(); netStatus(''); } };
try { $('optName').value = localStorage.getItem('sfa-name') || ''; } catch (e) {}
$('optName').addEventListener('change', () => { try { localStorage.setItem('sfa-name', $('optName').value); } catch (e) {} if (NET.role === 'host') lobbyUpdate(); });
$('optMap').addEventListener('change', () => { if (NET.role === 'host') lobbyUpdate(); });

// ------------------------------------------------------------------ game flow
function resetMatch() {
  units.forEach(u => u.dispose()); units = []; bots = []; orbs.length = 0; requiemLines.length = 0;
  camFocus = null; slowMo = null; hitStopT = 0; $('letterbox').classList.remove('on'); renderer.domElement.classList.remove('dead'); firstBlood = false; gameTime = 0;
  particles.clear(); smoke.clear(); showRune(null); runeT = CFG.firstRune;
  for (const w of [...document.querySelectorAll('.dmg')]) w.remove(); floats.length = 0;
  buildMap(settings.map);
  setQuality(settings.gfx);
  AUD.startAmbient(MAP.theme);
}
function startGame() {
  AUD.init();
  settings = { shake: $('optShake').value, bots: +$('optBots').value, diff: $('optDiff').value, kills: +$('optKills').value, move: $('optMove').value, fog: $('optFog').value, gfx: $('optGfx').value, map: $('optMap').value };
  resetMatch();
  player = new Unit(0, NET.role === 'host' ? myName() : 'You', true); player.human = true; units.push(player);
  // online: every friend in the lobby gets a hero; the Bots setting adds bots on top, up to 8 heroes
  if (NET.role === 'host') for (const c of NET.conns) { c.unit = null; if (units.length < NET_MAX) { const u = new Unit(units.length, c.name, false); u.human = true; u.remote = c; c.unit = u; units.push(u); } }
  const nb = Math.min(settings.bots, NET_MAX - units.length);
  for (let i = 0; i < nb; i++) { const u = new Unit(units.length, NAMES[i], false); units.push(u); bots.push(new Bot(u, DIFF[settings.diff])); }
  units.forEach(u => respawn(u));
  enterMatch();
  if (NET.role === 'host') { NET.evq = []; for (const c of NET.conns) if (c.unit) sendStart(c); else c.send({ e: 'full' }); }
}
function enterMatch() {
  camLook.set(player.pos.x, 0, player.pos.z);
  fogOn = settings.fog !== 'off'; fowCur.fill(0); fowSeen.fill(fogOn ? 0 : 1); fowT = 0;
  fowAll(scene);
  prewarm();
  $('menu').classList.add('hidden'); $('end').classList.add('hidden'); $('hud').classList.remove('hidden');
  $('help').style.display = ''; setTimeout(() => { $('help').style.display = 'none'; }, 15000);
  $('killfeed').innerHTML = ''; announce('', `${MAP.name} — harvest their souls!`);
  toggleShop(false); refreshInv();
  state = 'play';
}
// the winning kill plays in slow motion with the camera on the victim, then the scoreboard
function endGame(w, victim) {
  if (NET.role === 'host') netSendEnd(w, victim);
  state = 'end'; toggleShop(false);
  camFocus = (victim || w).pos.clone(); $('letterbox').classList.add('on');
  announce(w.isPlayer ? 'VICTORY' : 'DEFEAT', w.isPlayer ? 'You harvested their souls.' : `${w.name} claims the arena.`);
  slowMo = { scale: 0.22, t: 2.6, done: showEnd };
  function showEnd() {
    $('letterbox').classList.remove('on');
    const list = [...units].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    const top = (f) => list.reduce((b, u) => f(u) > f(b) ? u : b, list[0]);
    const acc = u => u.stats.casts ? u.stats.razesHit / u.stats.casts : 0;
    const awards = new Map(); const give = (u, a) => awards.set(u, (awards.get(u) || []).concat(a));
    give(top(u => u.kills), 'Soul Reaper'); give(top(u => u.stats.dmg), 'Most Damage'); if (list.some(u => u.stats.casts >= 5)) give(top(u => u.stats.casts >= 5 ? acc(u) : -1), 'Sharpest Aim');
    const mins = Math.floor(gameTime / 60), secs = Math.floor(gameTime % 60).toString().padStart(2, '0');
    $('endTitle').textContent = w.isPlayer ? 'VICTORY' : 'DEFEAT';
    $('endTitle').className = w.isPlayer ? 'win' : 'loss';
    $('endSub').textContent = `${MAP.name} · first to ${settings.kills} · ${mins}:${secs}`;
    $('endTable').innerHTML = `<table><tr><th>Hero</th><th>K</th><th>D</th><th>A</th><th>Damage</th><th>Accuracy</th><th>Gold</th><th>Items</th></tr>` +
      list.map(u => `<tr class="${u.isPlayer ? 'me' : ''}"><td><span class="sw" style="background:${u.color}"></span>${u.name}${(awards.get(u) || []).map(a => `<em>${a}</em>`).join('')}</td>` +
        `<td>${u.kills}</td><td>${u.deaths}</td><td>${u.stats.assists}</td><td>${Math.round(u.stats.dmg)}</td><td>${Math.round(acc(u) * 100)}%</td><td>${Math.round(u.stats.goldEarned)}</td>` +
        `<td class="it">${u.items.filter(Boolean).map(i => `<img src="${iconURL(i.id)}" title="${ITEMS[i.id].name}">`).join('')}</td></tr>`).join('') + '</table>';
    $('end').classList.remove('hidden');
  }
}
$('optVol').value = Math.round(AUD.volume * 100);
$('optVol').oninput = e => { AUD.volume = e.target.value / 100; AUD.muted = false; };
// options that define the match: changing one while paused means a new game, the rest apply on resume
const MATCH_OPTS = { optMap: 'map', optBots: 'bots', optDiff: 'diff', optKills: 'kills', optFog: 'fog' };
const matchChanged = () => Object.entries(MATCH_OPTS).some(([id, k]) => $(id).value !== String(settings[k]));
const paused = () => state === 'menu' && units.length && $('play').textContent !== 'PLAY';
$('play').onclick = () => {
  // online, mid-match: the menu is only an overlay; PLAY goes back to the fight (the host restarts only if a match option changed)
  if (NET.role && units.length && state !== 'menu' && !(NET.role === 'host' && matchChanged())) { settings.move = $('optMove').value; $('menu').classList.add('hidden'); return; }
  if (NET.role === 'client') return;
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
// ---- game feel: hit-stop (a few frames of near-freeze on impact), slow motion, screen flash, camera kick
let hitStopT = 0, slowMo = null, flashA = 0;
function hitStop(sec) { hitStopT = Math.max(hitStopT, sec); }
function addShake(a) { if (settings.shake !== 'off') shake = Math.max(shake, a); }
function screenFlash(color, a) { const f = $('flash'); f.style.setProperty('--c', color); flashA = Math.max(flashA, a); }
const camPos = new THREE.Vector3(0, 30, 30), camLook = new THREE.Vector3(), tmpCam = new THREE.Vector3();
// one fixed simulation step (60 Hz): bots think, units move, units push each other apart
function simStep(st) {
  gameTime += st;
  if (state === 'play') {
    bots.forEach(b => b.step(st));
    if (!rune) { runeT -= st; if (runeT <= 0) spawnRune(); }
  }
  units.forEach(u => u.step(st, u.isPlayer ? wasd() : u.netInput || null));
  updateRequiem(st);
  for (let i = 0; i < units.length; i++) for (let j = i + 1; j < units.length; j++) {
    const a = units[i], b = units[j]; if (!a.alive || !b.alive) continue;
    const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), m = CFG.unitR * 2;
    if (d < m && d > 1e-4) { // push apart, but never off a cliff
      const p = (m - d) / 2 / d, ax = a.pos.x - dx * p, az = a.pos.z - dz * p, bx = b.pos.x + dx * p, bz = b.pos.z + dz * p;
      if (canStep(a.pos.x, a.pos.z, ax, az)) { a.pos.x = ax; a.pos.z = az; }
      if (canStep(b.pos.x, b.pos.z, bx, bz)) { b.pos.x = bx; b.pos.z = bz; }
    }
  }
}
function frame(now) {
  requestAnimationFrame(frame);
  const rdt = Math.min(0.1, (now - last) / 1000); last = now; // real frame time
  let ts = 1;
  if (hitStopT > 0) { hitStopT -= rdt; ts = 0.05; }
  else if (slowMo) { slowMo.t -= rdt; ts = slowMo.t > 0 ? slowMo.scale : 1; if (slowMo.t <= 0) { const done = slowMo.done; slowMo = null; done && done(); } }
  const dt = rdt * ts; // game time: everything in the world slows with it
  const P = window.__sfaProfile, pt = P ? [performance.now()] : null, mark = P ? () => pt.push(performance.now()) : () => {};
  time += dt; timeU.value = time;
  flashA = Math.max(0, flashA - rdt * 2.6); $('flash').style.opacity = flashA;
  if (NET.role === 'client') { if (state === 'play' || state === 'end') { gameTime += dt; updateRequiem(dt); clientUpdate(dt); } }
  else if (state === 'play' || state === 'end') {
    acc += dt;
    while (acc >= CFG.step) { simStep(CFG.step); acc -= CFG.step; }
  }
  if (NET.role === 'host' && (state === 'play' || state === 'end')) netHostTick(rdt);
  mark(); // sim
  units.forEach(u => u.visual(dt, time));
  mark(); // visual
  updateFog(dt);
  mark(); // fog
  if (state === 'play') adaptResolution(rdt);
  if (state === 'play' && player && player.alive && player.hp < player.maxHp * 0.3) { beatT -= dt; if (beatT <= 0) { beatT = 0.55 + player.hp / player.maxHp * 1.2; sfx('heartbeat', 0.8); } } else beatT = 0;
  updateOrbs(dt); updateWards(dt);
  if (mapGroup) for (const c of mapGroup.userData.coins || []) c.rotation.y += dt * 2.2;
  if (mapGroup) for (const fl of mapGroup.userData.flames || []) { // brazier flicker and a few rising sparks
    const k = 1 + Math.sin(time * 11 + fl.ph) * 0.08 + Math.sin(time * 23.7 + fl.ph * 2) * 0.06; fl.f.scale.set(2 - k, k, 1); fl.f.quaternion.copy(camera.quaternion);
    for (let n = emitN(3, dt); n > 0; n--) particles.spawn(fl.x + rnd(-0.15, 0.15), fl.y, fl.z + rnd(-0.15, 0.15), rnd(-0.1, 0.1), rnd(0.8, 1.6), rnd(-0.1, 0.1), rnd(0.6, 1.1), rnd(0.06, 0.12), 0.02, EMBER, [0.3, 0.02, 0], 0.1, 0);
  }
  // ambience per map
  const m = MAP;
  if (m.theme === 'molten') {
    for (let n = emitN(180, dt); n > 0; n--) { const a = rnd(0, 7), r = rnd(m.hx - 2, m.hx + 12); particles.spawn(Math.cos(a) * r, -1, Math.sin(a) * r * 0.85, rnd(-0.3, 0.3), rnd(1, 2.5), rnd(-0.3, 0.3), rnd(2, 4), rnd(0.15, 0.35), 0.05, EMBER, [0.3, 0.02, 0], 0.2, 0); }
    for (const h of m.hazards) for (let n = emitN(30, dt); n > 0; n--) { const t = Math.random(); particles.spawn(h.a[0] + (h.b[0] - h.a[0]) * t, 0.1, h.a[1] + rnd(-h.r, h.r), 0, rnd(0.8, 2), 0, rnd(1, 2), rnd(0.2, 0.5), 0.05, EMBER, [0.3, 0.02, 0], 0.2, 0); }
    for (const e of m._emit || []) for (let n = emitN(9, dt); n > 0; n--) particles.spawn(e[0] + rnd(-0.3, 0.3), e[1] * rnd(0.3, 1), e[2] + rnd(-0.3, 0.3), 0, rnd(0.3, 0.8), 0, 1.2, 0.3, 0.05, [1, 0.15, 0.05], [0.3, 0, 0], 0, 0);
  } else if (m.theme === 'river') {
    for (let n = emitN(30, dt); n > 0; n--) { const x = rnd(-m.hx, m.hx), z = rnd(-m.hz, m.hz); if (m.dawn(x, z)) particles.spawn(x, rnd(0.5, 3), z, rnd(-0.3, 0.3), rnd(-0.1, 0.2), rnd(-0.3, 0.3), rnd(2, 4), 0.12, 0.08, [0.9, 0.9, 0.5], [0.3, 0.3, 0.1], 0, 0); else particles.spawn(x, 0.2, z, 0, rnd(0.3, 0.8), 0, rnd(1.5, 3), 0.2, 0.05, [0.6, 0.25, 1], [0.15, 0, 0.3], 0, 0); }
  } else if (m.theme === 'frozen') {
    for (let n = emitN(240, dt); n > 0; n--) { const cx = camLook.x + rnd(-25, 25), cz = camLook.z + rnd(-20, 25); particles.spawn(cx, rnd(10, 14), cz, rnd(-0.6, 0.2), -rnd(1.2, 2), rnd(-0.3, 0.3), 7, 0.14, 0.14, [0.7, 0.8, 0.95], [0.5, 0.6, 0.75], 0, 0); }
    for (let n = emitN(24, dt); n > 0; n--) { const p = edgePointsCache[Math.random() * edgePointsCache.length | 0]; if (p) smoke.spawn(p[0], -1, p[1], 0, rnd(0.5, 1.2), 0, 3, 2, 4, [0.2, 0.28, 0.38], [0.08, 0.1, 0.14], 0, 0); }
  }
  if (rune) { runeGem.rotation.y += dt * 2; runeGem.position.y = 1.1 + Math.sin(time * 3) * 0.15; runeRing.material.opacity = 0.6 + 0.3 * Math.sin(time * 5); for (let n = emitN(24, dt); n > 0; n--) { const c = new THREE.Color(RUNES[rune.type].color); particles.spawn(rune.x + rnd(-0.4, 0.4), 0.3, rune.z + rnd(-0.4, 0.4), 0, rnd(1, 2), 0, 0.8, 0.35, 0.05, [c.r, c.g, c.b], [0, 0, 0], 0, 0); } }
  mark(); // ambience, orbs, wards
  particles.update(dt); smoke.update(dt);
  mark(); // particles
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
  if (m.theme === 'grave') { // ghost-fire over the cursed graves, low mist drifting between the stones
    for (const h of m.hazards) for (let n = emitN(26, dt); n > 0; n--) particles.spawn((h.a[0] + h.b[0]) / 2 + rnd(-1.2, 1.2), 0.1, (h.a[1] + h.b[1]) / 2 + rnd(-1.2, 1.2), 0, rnd(0.8, 2), 0, rnd(0.8, 1.6), rnd(0.25, 0.5), 0.05, [0.6, 0.25, 1], [0.1, 0.5, 0.3], 0.3, 0);
    for (let n = emitN(14, dt); n > 0; n--) smoke.spawn(rnd(-m.hx, m.hx), 0.2, rnd(-m.hz, m.hz), rnd(-0.3, 0.3), rnd(0, 0.1), rnd(-0.3, 0.3), 5, 2.5, 5, [0.1, 0.13, 0.12], [0.04, 0.05, 0.05], 0, 0);
  }
  // camera
  if (player && state !== 'menu') {
    zoom += (zoomTarget - zoom) * (1 - Math.exp(-rdt * 10));
    const f = camFocus || player.pos, z = camFocus ? zoom * 0.62 : zoom; // camFocus: the final-kill cam
    camLook.lerp(tmpCam.set(f.x, H(f.x, f.z), f.z), 1 - Math.exp(-rdt * (camFocus ? 3 : 14)));
    camPos.lerp(tmpCam.set(camLook.x, camLook.y + 16 * z, camLook.z + 11 * z), camFocus ? 1 - Math.exp(-rdt * 3) : 1);
  } else if (!player) {
    camLook.set(0, 0, 0); camPos.set(Math.sin(time * 0.1) * 30, 22, Math.cos(time * 0.1) * 30);
  }
  if (devCam) { camPos.copy(devCam.pos); camLook.copy(devCam.look); }
  shake = Math.max(0, shake - rdt * 1.5);
  camera.position.copy(camPos); if (shake > 0) camera.position.add(tmpCam.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(shake));
  camera.lookAt(camLook);
  mark(); // fx, camera
  if (state !== 'menu' || player) updateHud(rdt);
  mark(); // hud
  const progs = renderer.info.programs.length;
  renderer.render(scene, camera);
  if (P) { mark(); P.push({ t: pt[0], seg: pt.slice(1).map((v, i) => +(v - pt[i]).toFixed(2)), newPrograms: renderer.info.programs.length - progs, particles: particles.n, units: units.length }); }
}
let edgePointsCache = [], devCam = null, camFocus = null; // devCam: fixed camera for dev tools ({pos, look} Vector3s)
// Compile every shader and upload every texture now, behind the menu, instead of mid-fight:
// raze columns, rings, runes, cyclone funnel, Avatar shield, wards, death dissolve. Then draw one
// full frame so the GPU links programs and uploads the map's textures before play starts.
const warmGroup = new THREE.Group();
warmGroup.add(new THREE.Mesh(funnelGeo, funnelMat), new THREE.Mesh(shellGeo, shellMat), new THREE.Mesh(wardStaffGeo, wardStaffMat), new THREE.Mesh(wardEyeGeo, wardEyeMat));
function prewarm() {
  const hidden = [];
  const show = o => { if (!o.visible) { o.visible = true; hidden.push(o); } };
  columns.forEach(c => show(c.g)); ringPool.forEach(show); scorchPool.forEach(show); crackPool.forEach(show); show(runeMesh);
  units.forEach(u => show(u.tele));
  if (player) warmGroup.position.copy(player.pos); scene.add(warmGroup); fowAll(warmGroup);
  try {
    renderer.compile(scene, camera);
    // the see-through hero (Veil Blade) is a separate shader variant: compile it too
    const mats = units.flatMap(u => u.model.userData.mats); mats.forEach(m => { m.transparent = true; });
    renderer.compile(scene, camera); mats.forEach(m => { m.transparent = false; });
    renderer.render(scene, camera);
  } catch (e) {}
  scene.remove(warmGroup); hidden.forEach(o => { o.visible = false; });
}

// ------------------------------------------------------------------ boot
if (window.SFA_ART && window.SFA_ART.title) document.getElementById('menu').style.background = `linear-gradient(90deg, #000d 0%, #0008 45%, #0000 100%), url(${window.SFA_ART.title}) center / cover`;
async function boot() {
  $('play').disabled = true; $('loadState').textContent = 'Summoning the Shadow Fiend…';
  const P = window.SFA_PROPS || {}, kinds = Object.keys(P); // base props plus any Meshy additions (shop, ward, runes, decor)
  const [hero, heroShadow, ...props] = await Promise.all([parseGLB(window.HERO_GLB_B64), parseGLB(window.HERO_SHADOW_GLB_B64), ...kinds.map(k => parseGLB(P[k]))]);
  if (hero) {
    heroTemplate = fitModel(hero, HERO_H);
    // low-poly shadow caster, in the same model space as the hero mesh
    heroShadow && heroShadow.traverse(o => { if (o.isMesh) heroTemplate.userData.shadowGeo = o.geometry; });
    heroTemplate.traverse(o => { if (o.isMesh) skinHero(o.geometry); });
    if (heroTemplate.userData.shadowGeo) skinHero(heroTemplate.userData.shadowGeo);
  }
  kinds.forEach((k, i) => { if (props[i]) PROP_TEMPLATES[k] = props[i]; });
  // sharp textures at grazing angles (the top-down camera sees most surfaces obliquely)
  const aniso = renderer.capabilities.getMaxAnisotropy();
  [heroTemplate, ...Object.values(PROP_TEMPLATES)].forEach(t => t && t.traverse(o => { if (o.material) for (const k of ['map', 'metalnessMap', 'roughnessMap']) if (o.material[k]) { o.material[k].anisotropy = aniso; o.material[k].needsUpdate = true; } }));
  buildMap($('optMap').value);
  edgePointsCache = edgePoints(80, 0.5);
  setQuality('high');
  $('loadState').textContent = ''; $('play').disabled = false;
}
const origBuild = buildMap;
buildMap = function (id) { origBuild(id); edgePointsCache = edgePoints(80, 0.5); };
setQuality('high');
requestAnimationFrame(frame);
boot().then(() => { const m = /#join=([A-Za-z0-9]+)/.exec(location.hash); if (m) { $('joinCode').value = m[1]; $('joinBox').classList.remove('hidden'); joinOnline(m[1]); } });
window.__game = { renderer, get fogOn() { return fogOn; },  get units() { return units; }, get state() { return state; }, get map() { return MAP; }, get rune() { return rune; }, CFG, buildMap: id => buildMap(id),
  get quality() { return { rung, autoQuality, heroShadows, fxDensity, pixelRatio: renderer.getPixelRatio() }; },
  set devCam(c) { devCam = c; },
  terrain: { H, canStep, findPath, NAV, navCell, navOK, buildNav },
  net: NET, act, joinOnline, hostOnline,
  dev: { advance(sec) { for (let i = 0; i < Math.round(sec / CFG.step); i++) simStep(CFG.step); }, useItem, buyItem, sellItem, canSeeUnit, canSee, damage, resolveRaze, get bots() { return bots; } },
  forceQuality(pr) { autoQuality = false; rung = 0; baseDpr = pr; applyRung(); } }; // for dev/bench.js
})();
