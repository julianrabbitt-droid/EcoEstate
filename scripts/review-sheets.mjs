// Contact sheets of a city-test run's renders (lawn-api/scripts/review.html,
// served by serve-run.mjs), a few homes per sheet, for looking at every one.
//
//   node scripts/review-sheets.mjs <runUrl> <outDir> <slug> <from> <to> [perSheet]
import fs from 'node:fs';
import path from 'node:path';
import { openPage, sleep } from './lib/headless.mjs';

const [runUrl, outDir, slug, from, to, perSheet = '4'] = process.argv.slice(2);
if (!runUrl || !outDir || !slug) {
  console.error('usage: node scripts/review-sheets.mjs <runUrl> <outDir> <slug> <from> <to> [perSheet]');
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
const page = await openPage({ width: 1600, height: 1000 });
for (let a = Number(from); a <= Number(to); a += Number(perSheet)) {
  const ns = [];
  for (let n = a; n < a + Number(perSheet) && n <= Number(to); n++) ns.push(n);
  await page.send('Page.navigate', { url: `${runUrl}/review.html?city=${slug}&n=${ns.join(',')}` });
  await page.waitFor('window.__reviewReady && [...document.images].every((i) => i.complete)', 60000, 500);
  await sleep(500);
  const { height } = await page.evaluate('({ height: document.body.scrollHeight })');
  const shot = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: 1600, height, scale: 1 } });
  const file = path.join(outDir, `${slug}-${ns[0]}-${ns.at(-1)}.png`);
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  console.log(file);
}
page.close();
process.exit(0);
