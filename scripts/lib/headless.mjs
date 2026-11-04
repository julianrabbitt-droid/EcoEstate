// Headless Chrome over the DevTools protocol, for the page tests in scripts/
// (no packages: Node's own fetch and WebSocket). The installed Google Chrome
// is used; each test gets its own throwaway profile.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * A headless page at { width, height, mobile }. Returns { send, evaluate,
 * waitFor, screenshot, events, close }; `events` collects exceptions,
 * console errors and failed requests (cleared with events.length = 0).
 */
export async function openPage({ width = 1280, height = 800, mobile = false, port = 9330 + Math.floor(Math.random() * 600) } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ecoestate-headless-'));
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`,
    '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader',
    // Light on memory (the tests run beside the person's own browser): one
    // renderer process, a capped script heap, nothing running in the background.
    '--renderer-process-limit=1', '--js-flags=--max-old-space-size=768', '--disable-extensions', '--disable-background-networking',
    '--disable-component-update', '--disable-default-apps', '--disable-sync', '--disk-cache-size=33554432', '--disable-features=Translate,MediaRouter,OptimizationHints',
    // HEADLESS_GL=swiftshader: software WebGL (slower; headless Chrome's GPU
    // path can leave photographed textures white).
    ...(process.env.HEADLESS_GL ? [`--use-angle=${process.env.HEADLESS_GL}`] : []),
  ], { stdio: 'ignore' });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    chrome.kill();
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch {
      // Chrome may still be writing it as it exits; it's in the temp folder either way.
    }
  };
  process.on('exit', close);
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; } catch { /* starting */ }
    await sleep(250);
  }
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done) => ws.addEventListener('open', done, { once: true }));
  let seq = 0;
  const pending = new Map();
  const events = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
      return;
    }
    const p = m.params || {};
    if (m.method === 'Runtime.exceptionThrown') events.push({ kind: 'exception', text: (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || '').split('\n')[0] });
    if (m.method === 'Runtime.consoleAPICalled' && (p.type === 'error' || p.type === 'warning')) events.push({ kind: p.type, text: p.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 240) });
    if (m.method === 'Network.responseReceived' && p.response.status >= 400) events.push({ kind: 'http', text: `${p.response.status} ${p.response.url.slice(0, 160)}` });
    if (m.method === 'Network.loadingFailed' && !p.canceled) events.push({ kind: 'netfail', text: `${p.errorText} ${p.type || ''}` });
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  // Polls a page expression until it's truthy (resolves to it) or the time is up (null).
  const waitFor = async (expression, ms, every = 400) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      try {
        const v = await evaluate(expression);
        if (v) return v;
      } catch { /* not yet */ }
      await sleep(every);
    }
    return null;
  };
  const screenshot = async (file) => {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(s.data, 'base64'));
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  return { send, evaluate, waitFor, screenshot, events, close: () => { ws.close(); close(); } };
}
