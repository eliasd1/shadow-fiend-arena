#!/usr/bin/env node
/* Drive a headless, muted Chrome for visual tests: run JS steps in the game page and take screenshots.
   No dependencies (Node 22+ has WebSocket). Usage:
     node tools/headless.mjs <url> <steps.json> <outDir>
   steps.json: [{ "eval": "<js, may await>", "wait": ms, "shot": "name" }, ...] (each key optional)
   Uses a throwaway Chrome profile and --mute-audio; the browser is closed at the end. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const [url, stepsFile, outDir] = process.argv.slice(2);
if (!url || !stepsFile || !outDir) { console.error('usage: node tools/headless.mjs <url> <steps.json> <outDir>'); process.exit(1); }
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', PORT = 9333;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sfa-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', '--mute-audio', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--autoplay-policy=no-user-gesture-required', '--window-size=1600,900', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
try {
  let target;
  for (let k = 0; k < 50 && !target; k++) { try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === 'page'); } catch { await sleep(200); } }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  for (let k = 0; k < 120; k++) { // wait for the page (a big single-file build parses for a while)
    const r = await send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
    if (r.result.value === 'complete') break; await sleep(250);
  }
  await sleep(500);
  fs.mkdirSync(outDir, { recursive: true });
  for (const st of JSON.parse(fs.readFileSync(stepsFile, 'utf8'))) {
    if (st.eval) {
      const r = await send('Runtime.evaluate', { expression: `(async () => { ${st.eval} })()`, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) console.log('error:', r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      else if (r.result.value !== undefined) console.log(typeof r.result.value === 'string' ? r.result.value : JSON.stringify(r.result.value));
    }
    if (st.wait) await sleep(st.wait);
    if (st.shot) { const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85 }); fs.writeFileSync(path.join(outDir, st.shot + '.jpg'), Buffer.from(data, 'base64')); console.log('shot', st.shot); }
  }
} finally {
  try { ws && ws.close(); } catch {}
  chrome.kill(); await sleep(300); fs.rmSync(profile, { recursive: true, force: true });
}
