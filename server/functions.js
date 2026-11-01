// Loads each server/functions/<name>/entry.ts. They were written for Base44's
// Deno runtime: each either default-exports a handler or registers one with
// Deno.serve(handler), which a minimal Deno global captures. Handlers are
// mounted at POST /api/functions/<name>.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { APP_URL } from './config.js';

let registering = null;
globalThis.Deno ??= {
  env: { get: (name) => process.env[name] },
  serve: (handler) => {
    registering = typeof handler === 'function' ? handler : handler?.handler;
  },
};

const dir = path.join(import.meta.dirname, 'functions');
export const handlers = {};
for (const name of fs.readdirSync(dir)) {
  const entry = path.join(dir, name, 'entry.ts');
  if (!fs.existsSync(entry)) continue;
  registering = null;
  const mod = await import(pathToFileURL(entry).href);
  const handler = typeof mod.default === 'function' ? mod.default : registering;
  if (handler) handlers[name] = handler;
  else console.warn(`[functions] ${name} did not register a handler`);
}

export async function runFunction(name, req, res) {
  const handler = handlers[name];
  if (!handler) return res.status(404).json({ error: `Unknown function ${name}` });

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  // Return links for checkout come from this server-owned value, never the caller.
  headers.set('x-base44-app-url', APP_URL);
  const hasBody = !['GET', 'HEAD'].includes(req.method) && req.body?.length;
  const request = new Request(`${APP_URL}${req.originalUrl}`, {
    method: req.method,
    headers,
    body: hasBody ? req.body : undefined,
  });

  try {
    const response = await handler(request);
    res.status(response.status);
    response.headers.forEach((v, k) => res.setHeader(k, v));
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    console.error(`[functions] ${name} failed`, err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Internal error' });
  }
}
