// Contact sheet of the middle QA panel (Esri photo with the detected lawn and
// property line), numbered, for scanning many homes at once:
//   node scripts/qa-sheet.mjs <dir> <out.png> <from> <to> [perRow]
import fs from 'node:fs';
import path from 'node:path';
import { blank, decodePng, fit, paste, png } from './render.mjs';

const [dir, out, from, to, perRow = 5] = process.argv.slice(2);
const TILE = 300;
const ns = [];
for (let n = Number(from); n <= Number(to); n++) if (fs.existsSync(path.join(import.meta.dirname, '..', 'previews', dir, `home-${n}.png`))) ns.push(n);
const cols = Number(perRow);
const sheet = blank(cols * (TILE + 6), Math.ceil(ns.length / cols) * (TILE + 6), 30);
// 3x5 pixel digits for the home number.
const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
const label = (img, text, x0, y0) => {
  [...text].forEach((ch, c) => {
    const bits = DIGITS[Number(ch)];
    for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) {
      const on = bits[j * 3 + i] === '1';
      for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) {
        const x = x0 + c * 16 + i * 4 + dx;
        const y = y0 + j * 4 + dy;
        if (x < img.w && y < img.h) img.rgb.set(on ? [255, 255, 255] : [0, 0, 0], (y * img.w + x) * 3);
      }
    }
  });
};
ns.forEach((n, idx) => {
  const img = decodePng(fs.readFileSync(path.join(import.meta.dirname, '..', 'previews', dir, `home-${n}.png`)));
  const panelW = Math.round((img.w - 16) / 3);
  const mid = blank(panelW, img.h);
  for (let y = 0; y < img.h; y++) mid.rgb.set(img.rgb.subarray((y * img.w + panelW + 8) * 3, (y * img.w + panelW + 8 + panelW) * 3), y * panelW * 3);
  const tile = fit(mid, TILE);
  const x = (idx % cols) * (TILE + 6);
  const y = Math.floor(idx / cols) * (TILE + 6);
  paste(sheet, tile, x, y);
  label(sheet, String(n), x + 4, y + 4);
});
fs.writeFileSync(out, png(sheet));
console.log(ns.length, 'homes');
