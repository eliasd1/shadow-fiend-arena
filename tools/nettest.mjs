#!/usr/bin/env node
/* Online play test: one muted headless Chrome, a host tab and N guest tabs, joined through the real PeerJS
   lobby server with the invite code. Checks that guests see the match, that their commands move and raze
   their own hero on the host, and takes screenshots of every tab. Usage:
     node tools/nettest.mjs <url> <outDir> [guests=1] */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const [url, outDir, nGuests = '1'] = process.argv.slice(2);
if (!url || !outDir) { console.error('usage: node tools/nettest.mjs <url> <outDir> [guests]'); process.exit(1); }
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', PORT = 9334;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sfa-net-'));
const chrome = spawn(CHROME, ['--headless=new', '--mute-audio', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--autoplay-policy=no-user-gesture-required', '--window-size=1280,720', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function tab(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl); let id = 0; const pending = new Map();
  await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } });
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  // headless tabs in the background get throttled; keep every tab "visible" and "focused"
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  const ev = async (js) => { const r = await send('Runtime.evaluate', { expression: `(async () => { ${js} })()`, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const shot = async (name) => { const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 }); fs.writeFileSync(path.join(outDir, name + '.jpg'), Buffer.from(data, 'base64')); };
  const go = async (u) => { await send('Page.navigate', { url: u }); for (let k = 0; k < 160; k++) { try { if (await ev(`return document.readyState === 'complete' && !document.getElementById('play').disabled`)) break; } catch {} await sleep(250); } };
  return { ev, shot, go, close: () => ws.close() };
}
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };
const tabs = [];
try {
  fs.mkdirSync(outDir, { recursive: true });
  let first; for (let k = 0; k < 50 && !first; k++) { try { first = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === 'page'); } catch { await sleep(200); } }
  const host = await tab(first); tabs.push(host);
  const guests = [];
  for (let g = 0; g < +nGuests; g++) {
    const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
    guests.push(await tab(t)); tabs.push(guests[g]);
  }
  const init = `window.__errs = []; addEventListener('error', e => __errs.push(e.message + ' @' + e.lineno)); localStorage.setItem('sfa-muted', '1'); SFA_AUDIO.muted = true; return 1`;
  await host.go(url); await host.ev(init);
  await host.ev(`document.getElementById('optName').value = 'Hosty'; __game.hostOnline(); return 1`);
  let code = '';
  for (let k = 0; k < 60 && !code; k++) { await sleep(250); code = await host.ev(`return document.getElementById('inviteCode').textContent`); }
  ok(!!code, `host got an invite code from the lobby server (${code || 'none'})`);
  if (!code) throw new Error('no code: ' + await host.ev(`return document.getElementById('netState').textContent`));
  const link = await host.ev(`return location.href.split('#')[0] + '#join=' + __game.net.code`);
  // the first guest opens the invite link; any others type the code
  for (let g = 0; g < guests.length; g++) {
    const G = guests[g];
    if (g === 0) { await G.go(link); await G.ev(init); await G.ev(`document.getElementById('optName').value = 'Guest${g + 1}'; __game.joinOnline(${JSON.stringify(code)}); return 1`); }
    else { await G.go(url); await G.ev(init); await G.ev(`document.getElementById('optName').value = 'Guest${g + 1}'; __game.joinOnline(${JSON.stringify(code)}); return 1`); }
  }
  let inLobby = 0;
  for (let k = 0; k < 80 && inLobby < guests.length; k++) { await sleep(250); inLobby = await host.ev(`return __game.net.conns.length`); }
  ok(inLobby === guests.length, `${inLobby}/${guests.length} guests in the host's lobby`);
  await host.shot('host-lobby'); await guests[0].shot('guest-lobby');
  await host.ev(`const $ = id => document.getElementById(id); $('optMap').value = 'grave'; $('optBots').value = '2'; $('optDiff').value = 'easy'; $('optFog').value = 'on'; $('optKills').value = '30'; $('play').click(); return 1`);
  await sleep(3000);
  const hs = await host.ev(`return { n: __game.units.length, names: __game.units.map(u => u.name), state: __game.state }`);
  ok(hs.n === 1 + guests.length + 2, `host match has ${hs.n} heroes: ${hs.names.join(', ')}`);
  for (let g = 0; g < guests.length; g++) {
    const gs = await guests[g].ev(`return { n: __game.units.length, state: __game.state, me: __game.units.find(u => u.isPlayer)?.name, snaps: __game.net.snaps.length }`);
    ok(gs.state === 'play' && gs.n === hs.n && gs.me === 'Guest' + (g + 1), `guest ${g + 1} in the match (${gs.n} heroes, plays ${gs.me}, ${gs.snaps} snapshots buffered)`);
  }
  // positions agree (guest draws others ~110 ms behind)
  const G1 = guests[0];
  const diff = async () => {
    const h = await host.ev(`return __game.units.map(u => [u.id, u.pos.x, u.pos.z, u.alive])`), c = await G1.ev(`return __game.units.map(u => [u.id, u.pos.x, u.pos.z, u.alive])`);
    return Math.max(...h.map(([id, x, z, a]) => { const o = c.find(q => q[0] === id); return o && a && o[3] ? Math.hypot(o[1] - x, o[2] - z) : 0; }));
  };
  ok(await diff() < 1.5, `guest positions match the host (worst ${(await diff()).toFixed(2)} units apart)`);
  // the guest walks: its hero moves on the host
  const myId = await G1.ev(`return __game.units.find(u => u.isPlayer).id`);
  const before = await host.ev(`const u = __game.units.find(u => u.id === ${myId}); return [u.pos.x, u.pos.z]`);
  const tgt = await G1.ev(`const u = __game.units.find(u => u.isPlayer); u.prot = 0; const a = Math.atan2(-u.pos.x, -u.pos.z); const x = u.pos.x + Math.sin(a) * 5, z = u.pos.z + Math.cos(a) * 5; __game.act({ t: 'move', x, z }); return [x, z]`);
  await sleep(2500);
  const after = await host.ev(`const u = __game.units.find(u => u.id === ${myId}); return [u.pos.x, u.pos.z]`);
  const moved = Math.hypot(after[0] - before[0], after[1] - before[1]);
  ok(moved > 2, `guest's move command moved its hero on the host by ${moved.toFixed(1)} units (to ${tgt.map(v => v.toFixed(1))})`);
  // the guest razes: the host counts the cast and the guest sees the raze
  const casts0 = await host.ev(`return __game.units.find(u => u.id === ${myId}).stats.casts`);
  await G1.ev(`__game.act({ t: 'raze', s: 1 }); return 1`);
  await sleep(250); await G1.shot('guest-razing');
  await sleep(1200);
  const casts1 = await host.ev(`return __game.units.find(u => u.id === ${myId}).stats.casts`);
  ok(casts1 === casts0 + 1, `guest's raze cast on the host (casts ${casts0} -> ${casts1})`);
  const gcd = await G1.ev(`return __game.units.find(u => u.isPlayer).cd[1]`);
  ok(gcd > 0, `guest sees its own raze cooldown (${gcd.toFixed(2)} s)`);
  // a buy away from the shop is refused, and the reason comes back to the guest
  await G1.ev(`__game.act({ t: 'buy', id: 'boots' }); return 1`); await sleep(600);
  const err = await G1.ev(`return document.getElementById('err').textContent`);
  ok(/Soul Merchant/.test(err), `refused buy reports back to the guest: "${err}"`);
  // let the match run, then screenshots
  await host.ev(`__game.units[0].prot = 1e9; return 1`);
  await sleep(4000);
  await host.shot('host-match'); for (let g = 0; g < guests.length; g++) await guests[g].shot(`guest${g + 1}-match`);
  ok(await diff() < 2, `still in sync after a few seconds (worst ${(await diff()).toFixed(2)})`);
  // a guest leaves: a bot takes over its hero on the host
  await G1.ev(`document.getElementById('leaveBtn').click(); return 1`);
  await sleep(2500);
  const taken = await host.ev(`return __game.dev.bots.some(b => b.u.id === ${myId})`);
  ok(taken, `after the guest left, a bot plays its hero`);
  const errs = [];
  for (const t of tabs) errs.push(...await t.ev(`return window.__errs || []`));
  ok(!errs.length, `no JavaScript errors in any tab ${errs.length ? JSON.stringify(errs) : ''}`);
} catch (e) { console.log('FAIL', e.message); process.exitCode = 1; }
finally {
  tabs.forEach(t => t.close());
  chrome.kill(); await sleep(300); fs.rmSync(profile, { recursive: true, force: true });
}
