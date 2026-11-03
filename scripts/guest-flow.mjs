// The main path as a first-time guest, in headless Chrome: the home page
// (closing the sign-in prompt), typing an address, picking the suggestion,
// confirming the pin, the scan and its 3D preview, "Yes, looks right", then
// the project's steps. A screenshot and the errors at each step.
//
//   node scripts/guest-flow.mjs <outDir> [baseUrl] ["address"] [desktop|phone]
//
// Runs a real scan (one geocoding lookup and the free public surveys).
import fs from 'node:fs';
import path from 'node:path';
import { openPage, sleep } from './lib/headless.mjs';

const [outDir, base = 'http://localhost:5173', address = '214 Avenida Del Mar, San Clemente, CA', sizeName = 'desktop'] = process.argv.slice(2);
if (!outDir) {
  console.error('usage: node scripts/guest-flow.mjs <outDir> [baseUrl] ["address"] [desktop|phone]');
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
const page = await openPage(sizeName === 'phone' ? { width: 390, height: 844, mobile: true } : { width: 1280, height: 800 });
const shot = (name) => page.screenshot(path.join(outDir, `${sizeName}-${name}.png`));
const button = (re) => `[...document.querySelectorAll('button, a')].find((b) => b.offsetParent && ${re}.test(b.textContent.trim()))`;
const steps = [];
const step = (name, ok, note = '') => {
  const errors = page.events.filter((e) => e.kind !== 'warning').splice(0);
  page.events.length = 0;
  steps.push({ name, ok, note, errors });
  console.log(sizeName, ok ? 'ok  ' : 'FAIL', name, note, errors.length ? `errors: ${errors.slice(0, 3).map((e) => `[${e.kind}] ${e.text.slice(0, 100)}`).join(' | ')}` : '');
  return ok;
};

await page.send('Page.navigate', { url: base });
await sleep(4500);
await shot('1-home');
const prompt = await page.evaluate('Boolean(document.querySelector(\'[role="dialog"]\'))');
for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await sleep(800);
step('home page; the sign-in prompt closes', !(await page.evaluate('Boolean(document.querySelector(\'[role="dialog"]\'))')), prompt ? '(it opened for the guest)' : '');

await page.evaluate('document.querySelector(\'[role="combobox"]\').focus()');
await page.send('Input.insertText', { text: address });
let t0 = Date.now();
const listed = await page.waitFor('document.querySelectorAll(\'[role="option"]\').length > 0', 15000);
await shot('2-suggestions');
if (step('address suggestions', Boolean(listed), `${Date.now() - t0} ms`)) {
  await page.evaluate('document.querySelector(\'[role="option"]\').click()');
  t0 = Date.now();
  const located = await page.waitFor(`Boolean(${button('/Yes, scan my property|Scan this spot/')})`, 30000);
  await shot('3-pin');
  if (step('located; pin to confirm', Boolean(located), `${Date.now() - t0} ms`)) {
    await page.evaluate(`${button('/Yes, scan my property|Scan this spot/')}.click()`);
    t0 = Date.now();
    const scanned = await page.waitFor(`Boolean(${button('/Yes, looks right|Edit the plan|Draw lawn/')})`, 150000, 1000);
    await sleep(4000);
    await shot('4-scan');
    step('scan result', Boolean(scanned), `${Math.round((Date.now() - t0) / 1000)} s`);
    step('3D preview', Boolean(await page.waitFor('Boolean(window.__ecoThree?.current)', 20000)));
    const confirmed = await page.evaluate(`(() => { const b = ${button('/Yes, looks right/')}; if (b) b.click(); return Boolean(b); })()`);
    const opened = await page.waitFor('/\\/project\\//.test(location.pathname)', 20000);
    await sleep(6000);
    await shot('5-project');
    const url = await page.evaluate('location.pathname');
    if (step('"Yes, looks right" opens the project', confirmed && Boolean(opened), url)) {
      const root = url.replace(/\/(design|impact|plan)$/, '');
      for (const sub of ['design', 'impact', 'plan']) {
        await page.send('Page.navigate', { url: `${base}${root}/${sub}` });
        await sleep(7000);
        await shot(`6-${sub}`);
        const text = await page.evaluate('document.body.innerText.slice(0, 300).replace(/\\s+/g, " ")');
        step(`${sub} step`, !/Something went wrong|crashed|Page crashed/i.test(text), text.slice(0, 70));
      }
    }
  }
}
fs.writeFileSync(path.join(outDir, `${sizeName}-steps.json`), JSON.stringify(steps, null, 1));
page.close();
process.exit(steps.every((s) => s.ok) ? 0 : 1);
