// Stacks QA panels (previews/<dir>/home-<n>.png) into one image for review:
//   node scripts/qa-stack.mjs <dir> <out.png> 3 7 12 …
import fs from 'node:fs';
import path from 'node:path';
import { blank, decodePng, paste, png } from './render.mjs';

const [dir, out, ...ns] = process.argv.slice(2);
const imgs = ns.map((n) => ({ n, img: decodePng(fs.readFileSync(path.join(import.meta.dirname, '..', 'previews', dir, `home-${n}.png`))) }));
const w = Math.max(...imgs.map((x) => x.img.w));
const sheet = blank(w, imgs.reduce((a, x) => a + x.img.h + 6, 0), 40);
let y = 0;
for (const { img } of imgs) {
  paste(sheet, img, 0, y);
  y += img.h + 6;
}
fs.writeFileSync(out, png(sheet));
