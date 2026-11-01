// Drawing helpers for the accuracy previews: overlays of a lawn detection on
// the NAIP photo, and a minimal PNG encoder (no image library needed).
import zlib from 'node:zlib';
import { polygonsOf, rasterize } from '../lib/grid.js';

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
};

/** Encode an RGB image ({ w, h, rgb: Uint8Array }) as PNG bytes. */
export function png({ w, h, rgb }) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

export function blank(w, h, color = 255) {
  return { w, h, rgb: new Uint8Array(w * h * 3).fill(color) };
}

/** Copy `src` into `dst` at (x, y), clipped to dst. */
export function paste(dst, src, x, y) {
  for (let j = 0; j < src.h; j++) {
    const ty = y + j;
    if (ty < 0 || ty >= dst.h) continue;
    for (let i = 0; i < src.w; i++) {
      const tx = x + i;
      if (tx < 0 || tx >= dst.w) continue;
      const s = (j * src.w + i) * 3;
      const d = (ty * dst.w + tx) * 3;
      dst.rgb[d] = src.rgb[s];
      dst.rgb[d + 1] = src.rgb[s + 1];
      dst.rgb[d + 2] = src.rgb[s + 2];
    }
  }
}

/** Nearest-neighbour resize to fit inside size x size, keeping the aspect ratio. */
export function fit(img, size) {
  const scale = size / Math.max(img.w, img.h);
  const w = Math.max(1, Math.round(img.w * scale));
  const h = Math.max(1, Math.round(img.h * scale));
  const out = blank(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (Math.min(img.h - 1, Math.floor(y / scale)) * img.w + Math.min(img.w - 1, Math.floor(x / scale))) * 3;
      const d = (y * w + x) * 3;
      out.rgb[d] = img.rgb[s];
      out.rgb[d + 1] = img.rgb[s + 1];
      out.rgb[d + 2] = img.rgb[s + 2];
    }
  }
  return out;
}

function edges(mask, w, h) {
  const out = new Uint8Array(mask.length);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (!mask[k]) continue;
      if (i === 0 || j === 0 || i === w - 1 || j === h - 1 || !mask[k - 1] || !mask[k + 1] || !mask[k - w] || !mask[k + w]) out[k] = 1;
    }
  }
  return out;
}

/**
 * The NAIP photo and the detection overlay for a detectLawn(..., { debug: true })
 * result: lawn green, canopy-map trees purple, texture trees blue, property line
 * yellow (orange when estimated), buildings cyan, detected tree crowns as
 * magenta circles.
 */
export function overlay(result, parcel, source) {
  const { grid, naip, trees, rough } = result.debug;
  const { w, h } = grid;
  const lawn = rasterize(grid, result.lawn.features.flatMap((f) => polygonsOf(f.geometry)));
  const lawnEdge = edges(lawn, w, h);
  const parcelEdge = edges(result.debug.parcel, w, h);
  const footprint = parcel.footprint ? edges(rasterize(grid, polygonsOf(parcel.footprint)), w, h) : null;
  const roofs = result.debug.roofs ? edges(Uint8Array.from(result.debug.roofs, (v) => (v ? 1 : 0)), w, h) : null;
  // Tree crown outlines.
  const crowns = new Uint8Array(w * h);
  for (const t of result.trees ?? []) {
    const [x, y] = grid.fromLonLat([t.lon, t.lat]);
    const ci = (x - grid.x0) / grid.res;
    const cj = (grid.y0 - y) / grid.res;
    const r = (t.radiusFt / 3.28084) / grid.res;
    for (let a = 0; a < 64; a++) {
      const i = Math.round(ci + r * Math.cos((a / 64) * 2 * Math.PI));
      const j = Math.round(cj + r * Math.sin((a / 64) * 2 * Math.PI));
      if (i >= 0 && j >= 0 && i < w && j < h) crowns[j * w + i] = 1;
    }
  }
  const photo = blank(w, h);
  const marked = blank(w, h);
  const mix = (px, color, a) => px.map((v, c) => Math.round(v * (1 - a) + color[c] * a));
  for (let k = 0; k < w * h; k++) {
    let px = [naip.red[k], naip.green[k], naip.blue[k]];
    photo.rgb.set(px, k * 3);
    if (trees[k] && result.debug.parcel[k]) px = mix(px, [150, 60, 200], 0.45);
    else if (rough[k]) px = mix(px, [60, 120, 230], 0.45);
    if (lawn[k]) px = mix(px, [40, 230, 60], 0.55);
    if (lawnEdge[k]) px = [20, 255, 40];
    if (roofs?.[k] || footprint?.[k]) px = [0, 200, 255];
    if (crowns[k]) px = [255, 60, 200];
    if (parcelEdge[k]) px = source === 'estimated' ? [255, 140, 0] : [255, 230, 0];
    marked.rgb.set(px, k * 3);
  }
  return { photo, marked };
}
