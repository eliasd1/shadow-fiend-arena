/* Shadow Fiend Arena — sound engine.
   Everything is synthesised live with the Web Audio API (no copyrighted samples).
   Custom sounds: put files in a "sounds" folder next to play.html, named
   <kind>.ogg / .mp3 / .wav, and they replace the built-in sound of that kind.
   Kinds: cast, raze, hit, death, soul, kill, respawn, heartbeat, ambient (loops),
   firstblood, doublekill, triplekill, ultrakill, rampage, killingspree, dominating,
   megakill, unstoppable, wickedsick, monsterkill, godlike, beyondgodlike. */
(() => {
'use strict';
const KINDS = ['cast', 'raze', 'hit', 'death', 'soul', 'kill', 'respawn', 'heartbeat', 'ambient',
  'rune', 'firstblood', 'doublekill', 'triplekill', 'massacre', 'rampage', 'killingspree', 'dominating',
  'megakill', 'mayhem', 'ownage', 'carnage', 'godlike'];
let ctx = null, master, sfxBus, ambBus, revIn, whiteBuf, brownBuf, distCurve;
let volume = 0.7, muted = false, ambientNodes = null, crackleTimer = null;
const custom = {}; // kind -> HTMLAudioElement
try { const v = localStorage.getItem('sfa-volume'); if (v !== null) volume = +v; muted = localStorage.getItem('sfa-muted') === '1'; } catch (e) {}

const rnd = (a, b) => a + Math.random() * (b - a);

function makeBuffers() {
  const sr = ctx.sampleRate;
  whiteBuf = ctx.createBuffer(1, sr * 2, sr);
  const w = whiteBuf.getChannelData(0); for (let i = 0; i < w.length; i++) w[i] = Math.random() * 2 - 1;
  brownBuf = ctx.createBuffer(1, sr * 4, sr);
  const b = brownBuf.getChannelData(0); let last = 0;
  for (let i = 0; i < b.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
  distCurve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; distCurve[i] = (3 + 30) * x * 20 * Math.PI / 180 / (Math.PI + 30 * Math.abs(x)); }
}
function makeReverb(seconds, decay) {
  const sr = ctx.sampleRate, len = sr * seconds, ir = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c); let lp = 0;
    for (let i = 0; i < len; i++) { lp = lp * 0.6 + (Math.random() * 2 - 1) * 0.4; d[i] = lp * Math.pow(1 - i / len, decay); }
  }
  const conv = ctx.createConvolver(); conv.buffer = ir; return conv;
}

function init() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  makeBuffers();
  master = ctx.createGain(); master.gain.value = muted ? 0 : volume;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.25;
  master.connect(comp); comp.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.connect(master);
  ambBus = ctx.createGain(); ambBus.gain.value = 0.55; ambBus.connect(master);
  const rev = makeReverb(2.8, 2.6); revIn = ctx.createGain(); revIn.gain.value = 0.9;
  const revOut = ctx.createGain(); revOut.gain.value = 0.55;
  revIn.connect(rev); rev.connect(revOut); revOut.connect(master);
  loadCustom();
  decodeVoices();
}

function loadCustom() {
  if (location.protocol === 'data:') return;
  for (const k of KINDS) {
    const exts = ['ogg', 'mp3', 'wav']; let i = 0;
    const tryNext = () => {
      if (i >= exts.length) return;
      const a = new Audio(); a.preload = 'auto';
      a.addEventListener('canplaythrough', () => { custom[k] = a; if (k === 'ambient' && ambientNodes) startAmbient(); }, { once: true });
      a.addEventListener('error', () => { i++; tryNext(); }, { once: true });
      a.src = `sounds/${k}.${exts[i]}`;
    };
    tryNext();
  }
}
function playCustom(kind, vol) {
  const a = custom[kind]; if (!a) return false;
  const c = a.cloneNode(); c.volume = Math.max(0, Math.min(1, vol * (muted ? 0 : volume))); c.play().catch(() => {});
  return true;
}

// ---------------------------------------------------------------- building blocks
function voice(vol, pan, wet) {
  const g = ctx.createGain(); g.gain.value = vol;
  let node = g;
  if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); node = p; }
  node.connect(sfxBus);
  if (wet > 0) { const s = ctx.createGain(); s.gain.value = wet; node.connect(s); s.connect(revIn); }
  return g;
}
function env(param, t, attack, peak, dur, floor = 0.0001) {
  param.setValueAtTime(floor, t);
  param.exponentialRampToValueAtTime(peak, t + attack);
  param.exponentialRampToValueAtTime(floor, t + dur);
}
function noise(t, dur, buf = whiteBuf) {
  const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
  s.start(t, rnd(0, buf.duration - 0.1)); s.stop(t + dur + 0.05); return s;
}
function osc(type, t, dur, f0, f1, detune = 0) {
  const o = ctx.createOscillator(); o.type = type; o.detune.value = detune;
  o.frequency.setValueAtTime(f0, t); if (f1 !== undefined) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  o.start(t); o.stop(t + dur + 0.05); return o;
}
function filt(type, f, q = 1) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
function gain(v = 0) { const g = ctx.createGain(); g.gain.value = v; return g; }
function chain(...n) { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; }

// ---------------------------------------------------------------- sound designs
const SOUNDS = {
  // charge-up during the cast point: dark rising swell + demonic whisper
  cast(out, t) {
    const d = 0.34;
    const n = noise(t, d), bp = filt('bandpass', 300, 2.5), g = gain();
    bp.frequency.setValueAtTime(250, t); bp.frequency.exponentialRampToValueAtTime(2200, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + d * 0.9); g.gain.linearRampToValueAtTime(0, t + d + 0.03);
    chain(n, bp, g, out);
    const o = osc('sawtooth', t, d, 45, 95), lp = filt('lowpass', 300, 4), g2 = gain();
    g2.gain.setValueAtTime(0.0001, t); g2.gain.exponentialRampToValueAtTime(0.35, t + d * 0.85); g2.gain.linearRampToValueAtTime(0, t + d + 0.03);
    chain(o, lp, g2, out);
    for (const f of [900, 1700, 2900]) { // whisper formants
      const w = noise(t, d), b = filt('bandpass', f, 12), wg = gain(), lfo = osc('sine', t, d, rnd(18, 30)), lg = gain(0.04);
      wg.gain.setValueAtTime(0.0001, t); wg.gain.exponentialRampToValueAtTime(0.09, t + d * 0.7); wg.gain.linearRampToValueAtTime(0, t + d);
      chain(lfo, lg); lg.connect(wg.gain); chain(w, b, wg, out);
    }
  },
  // the raze eruption: sub boom + distorted crunch + roar + fire crackle tail
  raze(out, t) {
    const sub = osc('sine', t, 0.9, 120, 26), sg = gain(); env(sg.gain, t, 0.006, 1.0, 0.9); chain(sub, sg, out);
    const n = noise(t, 0.9), ws = ctx.createWaveShaper(), lp = filt('lowpass', 4000, 0.8), cg = gain();
    ws.curve = distCurve; lp.frequency.setValueAtTime(5000, t); lp.frequency.exponentialRampToValueAtTime(140, t + 0.8);
    env(cg.gain, t, 0.004, 0.75, 0.85); chain(n, ws, lp, cg, out);
    const body = noise(t, 1.1), bp = filt('bandpass', 170, 0.9), bg = gain(); env(bg.gain, t, 0.01, 1.3, 1.1); chain(body, bp, bg, out);
    for (const det of [-14, 0, 17]) { const r = osc('sawtooth', t, 1.2, 62, 38, det), rl = filt('lowpass', 420, 2), rg = gain(); env(rg.gain, t, 0.03, 0.16, 1.2); chain(r, rl, rg, out); }
    for (let i = 0; i < 34; i++) { // crackling fire
      const ct = t + 0.06 + Math.pow(Math.random(), 1.6) * 1.3, c = noise(ct, 0.02), hp = filt('highpass', rnd(1500, 4500), 1), g = gain();
      env(g.gain, ct, 0.001, rnd(0.05, 0.28) * (1 - (ct - t) / 1.5), 0.018 + Math.random() * 0.02); chain(c, hp, g, out);
    }
  },
  // a hit on a hero: a heavy burning impact, a crunch, and the hiss of scorched shadow
  hit(out, t) {
    thud(out, t, 95, 0.22, 0.75);
    const n = noise(t, 0.12), ws = ctx.createWaveShaper(), bp = filt('bandpass', 1300, 1.1), g = gain(); ws.curve = distCurve; env(g.gain, t, 0.002, 0.35, 0.12); chain(n, ws, bp, g, out);
    const h = noise(t + 0.04, 0.4), hp = filt('highpass', 3000), hg = gain(); env(hg.gain, t + 0.04, 0.01, 0.06, 0.4); chain(h, hp, hg, out);
  },
  // a hero dies: demonic groan through vowel formants + rising soul shimmer
  death(out0, t) {
    const out = gain(0.6); out.connect(out0);
    const d = 1.3, src = gain(1); // summing bus (gain() defaults to 0, which silenced this sound)
    for (const det of [0, 9]) { const o = osc('sawtooth', t, d, 115, 40, det); o.connect(src); }
    const sg = gain(); env(sg.gain, t, 0.04, 2.6, d);
    const f1 = filt('bandpass', 750, 6), f2 = filt('bandpass', 1150, 7), mix = gain(1);
    f1.frequency.setValueAtTime(750, t); f1.frequency.linearRampToValueAtTime(420, t + d);
    f2.frequency.setValueAtTime(1150, t); f2.frequency.linearRampToValueAtTime(780, t + d);
    src.connect(f1); src.connect(f2); f1.connect(mix); f2.connect(mix); chain(mix, sg, out);
    const lo = filt('lowpass', 260), lg = gain(); env(lg.gain, t, 0.02, 1.1, d); src.connect(lo); chain(lo, lg, out);
  },
  // souls flying into you: soft, low fire "fwoomp" (no tones)
  soul(out, t) {
    const n = ctx.createBufferSource(); n.buffer = brownBuf; n.start(t, rnd(0, 3)); n.stop(t + 0.5);
    const bp = filt('lowpass', 300, 0.7), g = gain();
    bp.frequency.setValueAtTime(250, t); bp.frequency.exponentialRampToValueAtTime(900, t + 0.18); bp.frequency.exponentialRampToValueAtTime(200, t + 0.45);
    env(g.gain, t, 0.08, 0.9, 0.45); chain(n, bp, g, out);
  },
  // rune pickup: power rushing in, a deep swell under a crystalline shimmer
  rune(out, t) {
    const s = osc('sine', t, 1.1, 45, 90), sg = gain(); env(sg.gain, t, 0.15, 0.5, 1.1); chain(s, sg, out);
    metal(out, t, 1480, [1, 2.76, 5.4], 0.9, 0.05); metal(out, t + 0.05, 1975, [1, 2.76, 5.4], 0.8, 0.04);
    const n = noise(t, 0.6), bp = filt('bandpass', 600, 1.5), g = gain(); bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(3000, t + 0.5); env(g.gain, t, 0.3, 0.2, 0.6); chain(n, bp, g, out);
  },
  // you got the kill: a deep tolling iron bell with a dark choir under it
  kill(out, t) {
    metal(out, t, 55, [1, 2.0, 2.92, 4.2, 5.4], 3.0, 0.35); thud(out, t, 70, 0.3, 0.4);
    choir(out, t + 0.05, 1.8, 55, 0.12);
  },
  // respawn: reversed-feel swell up from below
  respawn(out, t) {
    const n = noise(t, 0.9), bp = filt('bandpass', 200, 2), g = gain();
    bp.frequency.setValueAtTime(150, t); bp.frequency.exponentialRampToValueAtTime(2500, t + 0.8);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.75); g.gain.linearRampToValueAtTime(0, t + 0.85);
    chain(n, bp, g, out);
    const o = osc('sawtooth', t, 0.85, 40, 110), lp = filt('lowpass', 500), og = gain();
    og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.25, t + 0.75); og.gain.linearRampToValueAtTime(0, t + 0.85);
    chain(o, lp, og, out);
  },
  // low health heartbeat (lub-dub)
  heartbeat(out, t) {
    for (const [dt, a] of [[0, 0.8], [0.16, 0.55]]) { const o = osc('sine', t + dt, 0.18, 70, 40), g = gain(); env(g.gain, t + dt, 0.008, a, 0.18); chain(o, g, out); }
  },
  // stinger under announcer callouts
  stinger(out, t) {
    const o = osc('sine', t, 1.2, 90, 30), g = gain(); env(g.gain, t, 0.01, 0.8, 1.2); chain(o, g, out);
    for (const det of [-10, 10]) { const s = osc('sawtooth', t, 1.4, 73.4, 73.4, det), lp = filt('lowpass', 600), sg = gain(); env(sg.gain, t, 0.02, 0.12, 1.4); chain(s, lp, sg, out); }
  },
  // ---- items, shop and pickups: physical sources only (metal, leather, wood, glass, air, voices)
  // a few coins clinking: inharmonic metal partials with fast decays
  coin(out, t) {
    for (let i = 0; i < 4; i++) { const ct = t + Math.random() * 0.12; metal(out, ct, rnd(2300, 3400), [1, 2.4, 3.9, 5.6], rnd(0.05, 0.12), rnd(0.03, 0.06)); }
  },
  // purchase: a leather pouch thrown on the counter, then a spill of coins
  buy(out, t) {
    thud(out, t, 420, 0.09, 0.5); thud(out, t, 120, 0.15, 0.4);
    for (let i = 0; i < 8; i++) { const ct = t + 0.03 + Math.pow(Math.random(), 1.5) * 0.35; metal(out, ct, rnd(1900, 3600), [1, 2.4, 3.9, 5.6], rnd(0.05, 0.14), rnd(0.02, 0.05)); }
  },
  // shop: an old wooden door creaks open
  shopOpen(out, t) {
    const o = osc('sawtooth', t, 0.5, 70, 95), j = osc('sine', t, 0.5, 23), jg = gain(18), bp = filt('bandpass', 700, 7), g = gain();
    chain(j, jg); jg.connect(o.frequency); env(g.gain, t, 0.06, 0.18, 0.5); chain(o, bp, g, out); thud(out, t + 0.42, 160, 0.12, 0.3);
  },
  // can't do that: a dull double knock on wood
  error(out, t) { thud(out, t, 180, 0.07, 0.35); thud(out, t + 0.09, 150, 0.08, 0.3); },
  // Shadowstep: air torn open, a sub drop, the hiss of shadow closing behind you
  blink(out, t) {
    const n = noise(t, 0.35), bp = filt('bandpass', 3000, 1.6), g = gain();
    bp.frequency.setValueAtTime(3500, t); bp.frequency.exponentialRampToValueAtTime(350, t + 0.3); env(g.gain, t, 0.01, 0.45, 0.35); chain(n, bp, g, out);
    const s = osc('sine', t, 0.4, 140, 38), sg = gain(); env(sg.gain, t, 0.005, 0.6, 0.4); chain(s, sg, out);
    const h = noise(t + 0.08, 0.5), hp = filt('highpass', 4000), hg = gain(); env(hg.gain, t + 0.08, 0.02, 0.08, 0.5); chain(h, hp, hg, out);
  },
  // Cyclone: a real gusting wind with a low rumble under it
  cyclone(out, t) {
    const d = 2.3;
    for (const [f, q, a] of [[380, 3, 0.5], [900, 5, 0.25]]) {
      const n = noise(t, d), bp = filt('bandpass', f, q), g = gain(), l1 = osc('sine', t, d, rnd(0.7, 1.1)), l2 = osc('sine', t, d, rnd(2, 3)), lg = gain(f * 0.35);
      chain(l1, lg); chain(l2, lg); lg.connect(bp.frequency);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(a, t + 0.35); g.gain.setValueAtTime(a, t + d - 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + d); chain(n, bp, g, out);
    }
    const r = ctx.createBufferSource(); r.buffer = brownBuf; r.start(t, rnd(0, 2)); r.stop(t + d);
    const rg = gain(); env(rg.gain, t, 0.3, 0.6, d); chain(r, filt('lowpass', 120), rg, out);
  },
  // Avatar Totem: a huge iron gong and a dark choir swelling under it
  avatar(out, t) {
    metal(out, t, 68, [1, 2.32, 4.25, 6.63, 9.38], 2.6, 0.28);
    thud(out, t, 90, 0.4, 0.6);
    choir(out, t, 2.2, 73.4, 0.18);
  },
  // Veil Blade: an inhaled breath, then silence closing in
  veil(out, t) {
    const n = noise(t, 0.6), hp = filt('bandpass', 2400, 0.8), g = gain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6); chain(n, hp, g, out);
    const s = osc('sine', t + 0.5, 0.5, 90, 45), sg = gain(); env(sg.gain, t + 0.5, 0.01, 0.35, 0.5); chain(s, sg, out);
    whisper(out, t + 0.1, 0.6, 0.05);
  },
  // Soothing Salve: a cork pulled, then a few gulps
  salve(out, t) {
    const c = noise(t, 0.02), cg = gain(); env(cg.gain, t, 0.001, 0.4, 0.02); chain(c, filt('highpass', 1500), cg, out);
    const p = osc('sine', t, 0.05, 900, 380), pg = gain(); env(pg.gain, t, 0.002, 0.25, 0.05); chain(p, pg, out);
    for (let i = 0; i < 3; i++) { const gt = t + 0.18 + i * 0.16, o = osc('sine', gt, 0.07, 240, 520), g = gain(); env(g.gain, gt, 0.01, 0.3, 0.07); chain(o, filt('lowpass', 900), g, out); }
  },
  // Watcher Ward: a staff driven into the earth, then a faint uneasy hum
  ward(out, t) {
    thud(out, t, 240, 0.1, 0.5); thud(out, t, 70, 0.25, 0.5);
    for (const f of [196, 207.6]) { const o = osc('sine', t + 0.05, 1.2, f), g = gain(); env(g.gain, t + 0.05, 0.2, 0.05, 1.2); chain(o, g, out); }
  },
  // Requiem, gathering: a choir and a storm of whispers rising for one second
  requiemCharge(out, t) {
    choir(out, t, 1.1, 49, 0.22); whisper(out, t, 1.0, 0.14);
    const s = osc('sawtooth', t, 1.0, 36, 72), sg = gain(); g2ramp(sg.gain, t, 1.0, 0.35); chain(s, filt('lowpass', 300, 4), sg, out);
    const n = noise(t, 1.0), bp = filt('bandpass', 300, 2), ng = gain(); bp.frequency.setValueAtTime(200, t); bp.frequency.exponentialRampToValueAtTime(2400, t + 1.0); g2ramp(ng.gain, t, 1.0, 0.3); chain(n, bp, ng, out);
  },
  // Requiem, released: the ground bursts, souls scream outward
  requiem(out, t) {
    const sub = osc('sine', t, 1.6, 90, 22), sg = gain(); env(sg.gain, t, 0.005, 1.1, 1.6); chain(sub, sg, out);
    const n = noise(t, 1.4), ws = ctx.createWaveShaper(), lp = filt('lowpass', 6000, 0.7), g = gain(); ws.curve = distCurve; lp.frequency.setValueAtTime(6000, t); lp.frequency.exponentialRampToValueAtTime(180, t + 1.3); env(g.gain, t, 0.004, 0.9, 1.4); chain(n, ws, lp, g, out);
    for (let i = 0; i < 5; i++) { // screaming souls: formant sweeps falling away
      const st = t + 0.03 + i * 0.06, o = osc('sawtooth', st, 0.9, rnd(300, 480), rnd(120, 180)), b = filt('bandpass', rnd(900, 1400), 6), og = gain();
      env(og.gain, st, 0.03, 0.09, 0.9); chain(o, b, og, out);
    }
    metal(out, t, 41, [1, 2.32, 4.25, 6.63], 2.2, 0.25);
  },
  // Soul Wand: the captured souls whisper and rush out
  wand(out, t) { whisper(out, t, 0.7, 0.12); const s = osc('sawtooth', t, 0.6, 55, 110), g = gain(); env(g.gain, t, 0.05, 0.12, 0.6); chain(s, filt('lowpass', 400, 3), g, out); },
};
// ---- physical building blocks for the sounds above
function metal(out, t, f0, ratios, decay, amp) { // struck metal: inharmonic partials, higher ones die faster
  ratios.forEach((r, i) => { const o = osc('sine', t, decay * 1.2, f0 * r * rnd(0.995, 1.005)), g = gain(); env(g.gain, t, 0.001, amp / (1 + i * 0.6), decay / (1 + i * 0.35)); chain(o, g, out); });
}
function g2ramp(param, t, dur, peak) { param.setValueAtTime(0.0001, t); param.exponentialRampToValueAtTime(peak, t + dur * 0.95); param.linearRampToValueAtTime(0, t + dur); }
function thud(out, t, f, dur, amp) { // a dull body impact: low-passed noise plus a dropping sine
  const n = noise(t, dur), g = gain(); env(g.gain, t, 0.002, amp, dur); chain(n, filt('lowpass', f * 3), g, out);
  const o = osc('sine', t, dur, f, f * 0.55), og = gain(); env(og.gain, t, 0.002, amp * 0.8, dur); chain(o, og, out);
}
function choir(out, t, dur, f, amp) { // a low "ah" from detuned voices through vowel formants
  const src = gain(1); for (const det of [-12, 0, 9, 17]) osc('sawtooth', t, dur, f, f, det).connect(src);
  const mix = gain(1), g = gain(); for (const [ff, q] of [[700, 6], [1220, 8], [2600, 10]]) { const b = filt('bandpass', ff, q); src.connect(b); b.connect(mix); }
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(amp, t + dur * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); chain(mix, g, out);
}
function whisper(out, t, dur, amp) { // breathy formant noise with a tremble, like many voices at once
  for (const f of [800, 1500, 2600]) {
    const n = noise(t, dur), b = filt('bandpass', f * rnd(0.9, 1.1), 9), g = gain(), l = osc('sine', t, dur, rnd(14, 24)), lg = gain(amp * 0.5);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(amp, t + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    chain(l, lg); lg.connect(g.gain); chain(n, b, g, out);
  }
}
const WET = { requiemCharge: 0.6, requiem: 0.8, coin: 0.15, buy: 0.2, shopOpen: 0.1, error: 0, blink: 0.4, cyclone: 0.5, avatar: 0.7, veil: 0.6, salve: 0.4, ward: 0.3, wand: 0.5, rune: 0.6, cast: 0.25, raze: 0.55, hit: 0.3, death: 0.6, soul: 0.35, kill: 0.6, respawn: 0.6, heartbeat: 0.05, stinger: 0.7 };

function play(kind, opts = {}) {
  if (!ctx || document.hidden) return;
  const vol = opts.vol === undefined ? 1 : opts.vol;
  if (vol <= 0.02) return;
  if (playCustom(kind, vol)) return;
  const fn = SOUNDS[kind]; if (!fn) return;
  const out = voice(vol, opts.pan || 0, WET[kind] || 0.3);
  fn(out, ctx.currentTime + 0.005);
  setTimeout(() => { try { out.disconnect(); } catch (e) {} }, 3500);
}

// ---------------------------------------------------------------- announcer (recorded voice, see announcer-data.js)
const VOICE_FILE = { firstblood: 'firstblood', doublekill: 'doublekill', triplekill: 'triplekill', massacre: 'massacre', rampage: 'rampage',
  killingspree: 'killingspree', dominating: 'dominating', megakill: 'megakill', mayhem: 'mayhem', ownage: 'ownage', carnage: 'carnage', godlike: 'godlike' };
const voiceBufs = {}; let curVoice = null;
function decodeVoices() {
  const data = window.SFA_ANNOUNCER || {};
  for (const k of Object.keys(data)) {
    const bin = atob(data[k]), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    ctx.decodeAudioData(u8.buffer).then(b => { voiceBufs[k] = b; }).catch(() => {});
  }
}
function announce(kind) {
  if (!ctx || document.hidden || muted || volume <= 0) return;
  if (playCustom(kind, 1)) return;
  const b = voiceBufs[VOICE_FILE[kind]]; if (!b) return;
  if (curVoice) { try { curVoice.stop(); } catch (e) {} }
  const s = ctx.createBufferSource(); s.buffer = b;
  const out = voice(1.15, 0, 0.18); s.connect(out); s.start(); curVoice = s;
}

// ---------------------------------------------------------------- ambient bed
let ambTheme = 'molten';
function startAmbient(theme) {
  if (!ctx) return; stopAmbient(); if (theme) ambTheme = theme;
  if (custom.ambient) { const a = custom.ambient; a.loop = true; a.volume = (muted ? 0 : volume) * 0.6; a.play().catch(() => {}); ambientNodes = { el: a }; return; }
  const t = ctx.currentTime, nodes = [];
  // lava rumble
  const r = ctx.createBufferSource(); r.buffer = brownBuf; r.loop = true; r.start(t);
  const rl = filt('lowpass', 130, 0.7), rg = gain(0), lfo = osc('sine', t, 1e6, 0.11), lg = gain(0.12);
  rg.gain.linearRampToValueAtTime(ambTheme === 'molten' ? 0.5 : 0.18, t + 2); chain(lfo, lg); lg.connect(rg.gain); chain(r, rl, rg, ambBus);
  // wind howl
  const w = ctx.createBufferSource(); w.buffer = whiteBuf; w.loop = true; w.start(t);
  const wb = filt('bandpass', 420, 5), wg = gain(0), wl = osc('sine', t, 1e6, 0.07), wlg = gain(220);
  wg.gain.linearRampToValueAtTime(ambTheme === 'frozen' ? 0.16 : ambTheme === 'river' ? 0.05 : 0.06, t + 3); chain(wl, wlg); wlg.connect(wb.frequency); chain(w, wb, wg, ambBus);
  nodes.push(r, w, lfo, wl);
  if (ambTheme === 'river') { // flowing water
    const f = ctx.createBufferSource(); f.buffer = whiteBuf; f.loop = true; f.start(t);
    const fb = filt('bandpass', 700, 0.8), fg = gain(0), fl = osc('sine', t, 1e6, 0.3), flg = gain(250);
    fg.gain.linearRampToValueAtTime(0.05, t + 3); chain(fl, flg); flg.connect(fb.frequency); chain(f, fb, fg, ambBus); nodes.push(f, fl);
  }
  ambientNodes = { nodes };
  crackleTimer = setInterval(() => { // lava pops and bubbles
    if (document.hidden || !ctx || ambTheme !== 'molten') return;
    const t2 = ctx.currentTime;
    if (Math.random() < 0.6) { const c = noise(t2, 0.03), hp = filt('bandpass', rnd(800, 3000), 2), g = gain(); env(g.gain, t2, 0.002, rnd(0.03, 0.09), 0.03); chain(c, hp, g, ambBus); }
    if (Math.random() < 0.12) { const o = osc('sine', t2, 0.25, rnd(70, 120), rnd(160, 260)), g = gain(); env(g.gain, t2, 0.02, 0.12, 0.25); chain(o, filt('lowpass', 400), g, ambBus); }
  }, 140);
}
function stopAmbient() {
  if (crackleTimer) { clearInterval(crackleTimer); crackleTimer = null; }
  if (!ambientNodes) return;
  if (ambientNodes.el) ambientNodes.el.pause();
  else for (const n of ambientNodes.nodes) { try { n.stop(); } catch (e) {} }
  ambientNodes = null;
}

// ---------------------------------------------------------------- volume / visibility
function applyVolume() {
  if (master) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.03);
  if (ambientNodes && ambientNodes.el) ambientNodes.el.volume = (muted ? 0 : volume) * 0.6;
  try { localStorage.setItem('sfa-volume', String(volume)); localStorage.setItem('sfa-muted', muted ? '1' : '0'); } catch (e) {}
}
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) { ctx.suspend(); if (ambientNodes && ambientNodes.el) ambientNodes.el.pause(); }
  else { ctx.resume(); if (ambientNodes && ambientNodes.el) ambientNodes.el.play().catch(() => {}); }
});

window.SFA_AUDIO = {
  init, play, announce, startAmbient, stopAmbient,
  get volume() { return volume; }, set volume(v) { volume = Math.max(0, Math.min(1, v)); applyVolume(); },
  get muted() { return muted; }, set muted(m) { muted = !!m; applyVolume(); },
  _sounds: SOUNDS, get _ctx() { return ctx; },
  // silent offline render of one sound, for testing (returns peak and RMS)
  async _renderOffline(kind, wantData) {
    const saved = { ctx, sfxBus, revIn, whiteBuf, brownBuf, distCurve };
    ctx = new OfflineAudioContext(2, 44100 * 3, 44100); makeBuffers();
    sfxBus = ctx.destination; const rev = makeReverb(2.8, 2.6); revIn = ctx.createGain(); revIn.gain.value = 0.9;
    const ro = ctx.createGain(); ro.gain.value = 0.55; revIn.connect(rev); rev.connect(ro); ro.connect(ctx.destination);
    const out = voice(1, 0, WET[kind] || 0.3); SOUNDS[kind](out, 0.01);
    const buf = await ctx.startRendering();
    ({ ctx, sfxBus, revIn, whiteBuf, brownBuf, distCurve } = saved);
    let peak = 0, sum = 0, nan = false; const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) { const v = d[i]; if (v !== v) nan = true; peak = Math.max(peak, Math.abs(v)); sum += v * v; }
    return { kind, peak: +peak.toFixed(3), rms: +Math.sqrt(sum / d.length).toFixed(4), nan, ...(wantData ? { data: d } : {}) };
  },
};
})();
