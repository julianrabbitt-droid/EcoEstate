// Serve a city-test output folder over http (with CORS), for the side-by-side
// review pages (compare.html: the scan; review.html: its renders; both copied
// in) and the app's /dev/render page.
//
//   node scripts/serve-run.mjs <outDir> [port]
//   → http://127.0.0.1:8768/compare.html?city=<slug>&n=1,2,3
//   → http://localhost:5173/dev/render?src=http://127.0.0.1:8768/<slug>&n=1&real=1
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const [dir, port = '8768'] = process.argv.slice(2);
const root = path.resolve(dir);
for (const page of ['compare.html', 'review.html']) fs.copyFileSync(new URL(`./${page}`, import.meta.url), path.join(root, page));
const TYPES = { '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.jsonl': 'text/plain' };
http
  .createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'Access-Control-Allow-Origin': '*' }).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(Number(port), '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}`));
