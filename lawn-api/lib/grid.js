// A north-up pixel grid in a projected CRS (UTM, taken from the NAIP imagery).
// Pixel (i, j) covers x0 + i*res .. x0 + (i+1)*res and y0 - j*res .. y0 - (j+1)*res.
import proj4 from 'proj4';

export function crsForEpsg(epsg) {
  // NAIP is published in NAD83 / UTM (EPSG:269xx) or WGS84 / UTM (EPSG:326xx).
  if (epsg >= 26901 && epsg <= 26923) return `+proj=utm +zone=${epsg - 26900} +datum=NAD83 +units=m +no_defs`;
  if (epsg >= 32601 && epsg <= 32660) return `+proj=utm +zone=${epsg - 32600} +datum=WGS84 +units=m +no_defs`;
  if (epsg === 3857) return proj4.defs('EPSG:3857');
  throw new Error(`Unsupported imagery projection EPSG:${epsg}`);
}

export function makeGrid(epsg, res, lonLatBox, pad = 3) {
  const crs = crsForEpsg(epsg);
  const fwd = proj4('EPSG:4326', crs);
  const [w, s, e, n] = lonLatBox;
  const pts = [[w, s], [e, s], [e, n], [w, n]].map((p) => fwd.forward(p));
  const minX = Math.min(...pts.map((p) => p[0])) - pad;
  const maxX = Math.max(...pts.map((p) => p[0])) + pad;
  const minY = Math.min(...pts.map((p) => p[1])) - pad;
  const maxY = Math.max(...pts.map((p) => p[1])) + pad;
  // Snap to whole pixels so NAIP pixels line up with the grid.
  const x0 = Math.floor(minX / res) * res;
  const y0 = Math.ceil(maxY / res) * res;
  return {
    epsg,
    crs,
    res,
    x0,
    y0,
    w: Math.ceil((maxX - x0) / res),
    h: Math.ceil((y0 - minY) / res),
    toLonLat: proj4(crs, 'EPSG:4326').forward,
    fromLonLat: fwd.forward,
  };
}

export const pixelCenter = (grid, i, j) => [grid.x0 + (i + 0.5) * grid.res, grid.y0 - (j + 0.5) * grid.res];

/**
 * Affine map from grid pixel (i, j) to another CRS, fitted on three corners.
 * Over a property-sized area the UTM -> other projection distortion is far
 * below a pixel, so this avoids a projection call per pixel.
 */
export function affineTo(grid, targetCrs) {
  const t = proj4(grid.crs, targetCrs).forward;
  const a = t(pixelCenter(grid, 0, 0));
  const b = t(pixelCenter(grid, grid.w - 1, 0));
  const c = t(pixelCenter(grid, 0, grid.h - 1));
  const di = Math.max(grid.w - 1, 1);
  const dj = Math.max(grid.h - 1, 1);
  const ax = [(b[0] - a[0]) / di, (c[0] - a[0]) / dj];
  const ay = [(b[1] - a[1]) / di, (c[1] - a[1]) / dj];
  return (i, j) => [a[0] + ax[0] * i + ax[1] * j, a[1] + ay[0] * i + ay[1] * j];
}

/** Rasterize polygons (lon/lat GeoJSON rings) into a 0/1 mask using even-odd fill. */
export function rasterize(grid, polygons) {
  const mask = new Uint8Array(grid.w * grid.h);
  const edges = [];
  for (const rings of polygons) {
    for (const ring of rings) {
      const pts = ring.map((p) => grid.fromLonLat(p)).map(([x, y]) => [(x - grid.x0) / grid.res - 0.5, (grid.y0 - y) / grid.res - 0.5]);
      for (let k = 0; k < pts.length - 1; k++) edges.push([pts[k], pts[k + 1]]);
    }
  }
  for (let j = 0; j < grid.h; j++) {
    const xs = [];
    for (const [[x1, y1], [x2, y2]] of edges) {
      if ((y1 <= j && y2 > j) || (y2 <= j && y1 > j)) xs.push(x1 + ((j - y1) / (y2 - y1)) * (x2 - x1));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k]));
      const to = Math.min(grid.w - 1, Math.floor(xs[k + 1]));
      for (let i = from; i <= to; i++) mask[j * grid.w + i] = 1;
    }
  }
  return mask;
}

export const polygonsOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);

/**
 * Rasterize many geometries into one Int32Array of labels: pixel = index + 1
 * of the geometry covering it (later geometries win), 0 for none. Each one only
 * scans its own rows, so thousands of footprints stay cheap.
 */
export function rasterizeLabels(grid, geometries) {
  const labels = new Int32Array(grid.w * grid.h);
  geometries.forEach((geometry, index) => {
    const edges = [];
    let minRow = Infinity;
    let maxRow = -Infinity;
    for (const rings of polygonsOf(geometry)) {
      for (const ring of rings) {
        const pts = ring.map((p) => grid.fromLonLat(p)).map(([x, y]) => [(x - grid.x0) / grid.res - 0.5, (grid.y0 - y) / grid.res - 0.5]);
        for (let k = 0; k < pts.length - 1; k++) {
          edges.push([pts[k], pts[k + 1]]);
          minRow = Math.min(minRow, pts[k][1]);
          maxRow = Math.max(maxRow, pts[k][1]);
        }
      }
    }
    for (let j = Math.max(0, Math.ceil(minRow)); j <= Math.min(grid.h - 1, Math.floor(maxRow)); j++) {
      const xs = [];
      for (const [[x1, y1], [x2, y2]] of edges) {
        if ((y1 <= j && y2 > j) || (y2 <= j && y1 > j)) xs.push(x1 + ((j - y1) / (y2 - y1)) * (x2 - x1));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const from = Math.max(0, Math.ceil(xs[k]));
        const to = Math.min(grid.w - 1, Math.floor(xs[k + 1]));
        for (let i = from; i <= to; i++) labels[j * grid.w + i] = index + 1;
      }
    }
  });
  return labels;
}

/** Call fn(k) for every pixel index k inside a geometry (scanning only its rows). */
export function forEachPixel(grid, geometry, fn) {
  const edges = [];
  let minRow = Infinity;
  let maxRow = -Infinity;
  for (const rings of polygonsOf(geometry)) {
    for (const ring of rings) {
      const pts = ring.map((p) => grid.fromLonLat(p)).map(([x, y]) => [(x - grid.x0) / grid.res - 0.5, (grid.y0 - y) / grid.res - 0.5]);
      for (let k = 0; k < pts.length - 1; k++) {
        edges.push([pts[k], pts[k + 1]]);
        minRow = Math.min(minRow, pts[k][1]);
        maxRow = Math.max(maxRow, pts[k][1]);
      }
    }
  }
  for (let j = Math.max(0, Math.ceil(minRow)); j <= Math.min(grid.h - 1, Math.floor(maxRow)); j++) {
    const xs = [];
    for (const [[x1, y1], [x2, y2]] of edges) {
      if ((y1 <= j && y2 > j) || (y2 <= j && y1 > j)) xs.push(x1 + ((j - y1) / (y2 - y1)) * (x2 - x1));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k]));
      const to = Math.min(grid.w - 1, Math.floor(xs[k + 1]));
      for (let i = from; i <= to; i++) fn(j * grid.w + i);
    }
  }
}
