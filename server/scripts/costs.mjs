// What each session cost in paid API calls, newest first.
//
//   npm run costs            last 20 sessions
//   npm run costs -- 100     last 100 sessions
import { PRICES, usageBySession } from '../usage.js';

const sessions = await usageBySession({ limit: Number(process.argv[2]) || 20 });
if (!sessions.length) {
  console.log('No paid API calls recorded yet.');
  process.exit(0);
}
const usd = (v) => `$${v.toFixed(v < 0.01 ? 5 : 2)}`;
let grand = 0;
for (const s of sessions) {
  grand += s.totalUsd;
  console.log(`\n${s.ended.slice(0, 16).replace('T', ' ')}  ${usd(s.totalUsd).padStart(9)}  ${s.user ?? 'signed out'}  (session ${s.sessionId.slice(0, 8)})`);
  for (const [service, { units, usd: cost }] of Object.entries(s.services).sort((a, b) => b[1].usd - a[1].usd)) {
    console.log(`    ${service.padEnd(20)} ${String(Math.round(units)).padStart(8)} ${PRICES[service]?.per ?? ''}${units === 1 ? '' : 's'}  ${usd(cost).padStart(9)}`);
  }
}
console.log(`\nTotal for these ${sessions.length} sessions: ${usd(grand)} at list price (before free allowances).`);
console.log('Free allowances:', Object.entries(PRICES).map(([k, p]) => `${k}: ${p.free}`).join('; '));
process.exit(0);
