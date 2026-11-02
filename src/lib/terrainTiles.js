// Ground elevation from the public terrain tiles on AWS Open Data (Terrarium
// PNGs; sources include USGS 3DEP and SRTM). The fallback when the USGS
// elevation services don't answer: lower resolution (about 4 m per pixel at
// zoom 15 here), but always up. Elevation (m) = R × 256 + G + B / 256 − 32768.
const URL_TEMPLATE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
const ZOOM = 15;
const tiles = new Map(); // "x/y" -> Promise<ImageData | null>

function tile(x, y) {
  const key = `${x}/${y}`;
  if (!tiles.has(key)) {
    tiles.set(
      key,
      new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.width;
          c.height = img.height;
          const ctx = c.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0);
          resolve(ctx.getImageData(0, 0, c.width, c.height));
        };
        img.onerror = () => {
          tiles.delete(key);
          resolve(null);
        };
        img.src = `${URL_TEMPLATE}/${ZOOM}/${x}/${y}.png`;
      }),
    );
  }
  return tiles.get(key);
}

/** Elevations in metres for [[lon, lat], …]; NaN where a tile couldn't be read. */
export async function terrainElevations(points) {
  const n = 2 ** ZOOM;
  const where = points.map(([lon, lat]) => {
    const fx = ((lon + 180) / 360) * n;
    const r = (lat * Math.PI) / 180;
    const fy = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
    return { x: Math.floor(fx), y: Math.floor(fy), px: Math.floor((fx % 1) * 256), py: Math.floor((fy % 1) * 256) };
  });
  const keys = [...new Set(where.map((w) => `${w.x}/${w.y}`))];
  if (keys.length > 16) throw new Error('area too large for terrain tiles');
  const data = new Map(await Promise.all(keys.map(async (k) => [k, await tile(...k.split('/').map(Number))])));
  return where.map(({ x, y, px, py }) => {
    const d = data.get(`${x}/${y}`);
    if (!d) return NaN;
    const k = (py * d.width + px) * 4;
    return d.data[k] * 256 + d.data[k + 1] + d.data[k + 2] / 256 - 32768;
  });
}
