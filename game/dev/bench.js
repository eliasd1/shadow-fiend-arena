/* Shadow Fiend Arena benchmark. Not part of the game build.
   Load play.html from a local server, then in the console (or via a test tool):
     await (await fetch('dev/bench.js')).text().then(eval); await SFA_BENCH.run()
   Sound is forced off. Randomness is seeded so runs are comparable. */
(() => {
const R = __game.renderer, gl = R.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
const P = { on: false, frames: [], logic: [], gpu: [], calls: [], tris: [], long: [] };
const raf = window.requestAnimationFrame.bind(window);
if (!window.__benchHooked) {
  window.__benchHooked = true;
  window.requestAnimationFrame = cb => raf(ts => { const t = performance.now(); cb(ts); if (P.on && cb.name === 'frame') P.logic.push(performance.now() - t); });
  const render = R.render.bind(R), pend = [];
  R.render = (s, c) => {
    let q = null;
    if (ext && P.on) { q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); }
    render(s, c);
    if (q) { gl.endQuery(ext.TIME_ELAPSED_EXT); pend.push(q); P.calls.push(R.info.render.calls); P.tris.push(R.info.render.triangles); }
    for (let i = pend.length - 1; i >= 0; i--) {
      const qq = pend[i];
      if (!gl.getQueryParameter(qq, gl.QUERY_RESULT_AVAILABLE)) continue;
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) P.gpu.push(gl.getQueryParameter(qq, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(qq); pend.splice(i, 1);
    }
  };
  new PerformanceObserver(l => { if (P.on) for (const e of l.getEntries()) P.long.push(Math.round(e.duration)); }).observe({ entryTypes: ['longtask'] });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const stat = a => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), q = p => +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2);
  return { avg: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2), p50: q(0.5), p95: q(0.95), max: +s[s.length - 1].toFixed(2) };
};
function seed(n) { let a = n >>> 0; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function start(map, fog, bots = '7') {
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
  set('optMap', map); set('optBots', bots); set('optDiff', 'hard'); set('optFog', fog); set('optGfx', 'high'); set('optKills', '30');
  SFA_AUDIO.muted = true;
  const btn = document.getElementById('play'); btn.textContent = 'PLAY';
  const t = performance.now(); btn.click(); return +(performance.now() - t).toFixed(1);
}
async function measure(sec) {
  Object.assign(P, { frames: [], logic: [], gpu: [], calls: [], tris: [], long: [], on: true });
  let last = performance.now(); const end = last + sec * 1000;
  await new Promise(r => { const f = () => { const n = performance.now(); P.frames.push(n - last); last = n; n < end ? raf(f) : r(); }; raf(f); });
  P.on = false; await sleep(150);
  return {
    frameMs: stat(P.frames), over20ms: P.frames.filter(x => x > 20).length, logicMs: stat(P.logic), gpuMs: stat(P.gpu),
    drawCalls: stat(P.calls), triangles: stat(P.tris), longTasks: P.long,
    heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null,
    gpuObjects: { ...R.info.memory }, programs: R.info.programs.length,
  };
}
// pr: forced pixel ratio, so every run renders the same number of pixels
async function scenario(map, fog, { sec = 8, pr = 1.5 } = {}) {
  seed(1234);
  const startMs = start(map, fog);
  await sleep(1500);
  if (window.__game.forceQuality) window.__game.forceQuality(pr); else { R.setPixelRatio(pr); R.setSize(innerWidth, innerHeight); }
  await sleep(500);
  const m = await measure(sec);
  return { map, fog, pr, size: innerWidth + 'x' + innerHeight, startMs, ...m };
}
async function leak(n = 6) {
  const out = [];
  for (let i = 0; i < n; i++) { start(['molten', 'river', 'frozen'][i % 3], 'on'); await sleep(400); out.push(R.info.memory.textures); }
  return { texturesAfterEachStart: out, growthPerStart: +((out[n - 1] - out[0]) / (n - 1)).toFixed(2) };
}
async function run({ sec = 8 } = {}) {
  const res = { when: new Date().toISOString(), ua: navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0], fileMB: null, runs: [] };
  for (const [map, fog] of [['molten', 'off'], ['river', 'off'], ['frozen', 'off'], ['river', 'on']]) res.runs.push(await scenario(map, fog, { sec }));
  res.leak = await leak();
  window.__benchResult = res; return res;
}
window.SFA_BENCH = { run, scenario, leak, measure, start, seed };
})();
