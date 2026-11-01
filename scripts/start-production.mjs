// Production entry (Railway): runs the lawn measurement service on a private
// port next to the main API, which serves the built site on $PORT and forwards
// /api/lawn to it. If either process stops, exit so the host restarts both.
import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const LAWN_PORT = process.env.LAWN_PORT || '3100';

function run(name, args, cwd, env) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, stdio: 'inherit' });
  child.on('exit', (code) => {
    console.error(`${name} exited with code ${code}; shutting down`);
    process.exit(code || 1);
  });
  return child;
}

run('lawn-api', ['server.js'], path.join(ROOT, 'lawn-api'), { PORT: LAWN_PORT });
run('api', ['--disable-warning=ExperimentalWarning', '--import', 'tsx', 'server/index.js'], ROOT, {
  NODE_ENV: 'production',
  LAWN_API_URL: `http://127.0.0.1:${LAWN_PORT}`,
});
