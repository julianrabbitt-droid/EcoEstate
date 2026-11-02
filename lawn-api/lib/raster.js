// Neighbourhood operations on single-band rasters (row-major, width w).

/**
 * Mean and standard deviation of `values` over the pixels where `mask` is 1,
 * in a (2r+1)x(2r+1) window around each pixel. Pixels outside the mask don't
 * count, so a lawn next to pavement isn't marked "textured" by the edge.
 * Returns { mean, std, count } as Float32Arrays (count as Uint16Array).
 */
export function localStats(values, mask, w, h, r) {
  const W = w + 1;
  const sum = new Float64Array(W * (h + 1));
  const sq = new Float64Array(W * (h + 1));
  const cnt = new Float64Array(W * (h + 1));
  for (let j = 0; j < h; j++) {
    let rs = 0, rq = 0, rc = 0;
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (mask[k]) {
        rs += values[k];
        rq += values[k] * values[k];
        rc += 1;
      }
      const o = (j + 1) * W + i + 1;
      sum[o] = sum[o - W] + rs;
      sq[o] = sq[o - W] + rq;
      cnt[o] = cnt[o - W] + rc;
    }
  }
  const box = (a, i0, j0, i1, j1) => a[j1 * W + i1] - a[j0 * W + i1] - a[j1 * W + i0] + a[j0 * W + i0];
  const mean = new Float32Array(w * h);
  const std = new Float32Array(w * h);
  const count = new Uint16Array(w * h);
  for (let j = 0; j < h; j++) {
    const j0 = Math.max(0, j - r), j1 = Math.min(h, j + r + 1);
    for (let i = 0; i < w; i++) {
      const i0 = Math.max(0, i - r), i1 = Math.min(w, i + r + 1);
      const n = box(cnt, i0, j0, i1, j1);
      const k = j * w + i;
      count[k] = n;
      if (!n) continue;
      const m = box(sum, i0, j0, i1, j1) / n;
      mean[k] = m;
      std[k] = Math.sqrt(Math.max(0, box(sq, i0, j0, i1, j1) / n - m * m));
    }
  }
  return { mean, std, count };
}

/** Grow a 0/1 mask by a disk of radius r pixels. */
export function dilate(mask, w, h, r) {
  if (r <= 0) return mask;
  const offsets = [];
  for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if (di * di + dj * dj <= r * r) offsets.push([di, dj]);
  const out = new Uint8Array(mask.length);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (!mask[j * w + i]) continue;
      for (const [di, dj] of offsets) {
        const x = i + di, y = j + dj;
        if (x >= 0 && y >= 0 && x < w && y < h) out[y * w + x] = 1;
      }
    }
  }
  return out;
}

/** Distance in pixels from every pixel to the nearest set pixel of a 0/1 mask (3-4 chamfer). */
export function distanceTo(mask, w, h) {
  const d = Float32Array.from(mask, (v) => (v ? 0 : Infinity));
  const step = (k, q, c) => { if (d[q] + c < d[k]) d[k] = d[q] + c; };
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (i > 0) step(k, k - 1, 3);
      if (j > 0) {
        step(k, k - w, 3);
        if (i > 0) step(k, k - w - 1, 4);
        if (i < w - 1) step(k, k - w + 1, 4);
      }
    }
  }
  for (let j = h - 1; j >= 0; j--) {
    for (let i = w - 1; i >= 0; i--) {
      const k = j * w + i;
      if (i < w - 1) step(k, k + 1, 3);
      if (j < h - 1) {
        step(k, k + w, 3);
        if (i < w - 1) step(k, k + w + 1, 4);
        if (i > 0) step(k, k + w - 1, 4);
      }
    }
  }
  return d.map((v) => v / 3);
}

/** Shrink a 0/1 mask by a disk of radius r pixels. */
export function erode(mask, w, h, r) {
  if (r <= 0) return mask;
  const inverse = Uint8Array.from(mask, (v) => (v ? 0 : 1));
  return Uint8Array.from(dilate(inverse, w, h, r), (v) => (v ? 0 : 1));
}

/**
 * Label 8-connected regions of a 0/1 mask. Returns { labels, sizes }: labels
 * holds region number (1-based, 0 = background), sizes[n] its pixel count.
 */
export function labelRegions(mask, w, h) {
  const labels = new Int32Array(mask.length);
  const sizes = [0];
  const stack = new Int32Array(mask.length);
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    const id = sizes.length;
    let top = 0;
    let size = 0;
    stack[top++] = start;
    labels[start] = id;
    while (top) {
      const k = stack[--top];
      size++;
      const i = k % w;
      const j = (k - i) / w;
      for (let dj = -1; dj <= 1; dj++) {
        const y = j + dj;
        if (y < 0 || y >= h) continue;
        for (let di = -1; di <= 1; di++) {
          const x = i + di;
          if (x < 0 || x >= w) continue;
          const q = y * w + x;
          if (mask[q] && !labels[q]) {
            labels[q] = id;
            stack[top++] = q;
          }
        }
      }
    }
    sizes.push(size);
  }
  return { labels, sizes };
}
