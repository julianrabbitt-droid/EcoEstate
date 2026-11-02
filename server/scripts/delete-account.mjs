// Deletes an EcoEstate account on request (Privacy Policy: within 30 days).
// People can also do this themselves from the account menu.
//
//   npm run delete-account -- someone@example.com           # dry run: shows what would go
//   npm run delete-account -- someone@example.com --confirm # deletes
import { sql, users } from '../db.js';
import { deleteAccount, deletionPlan, KEPT_ENTITIES } from '../accountDeletion.js';

const [email, flag] = process.argv.slice(2);
if (!email) {
  console.error('Usage: npm run delete-account -- <email> [--confirm]');
  process.exit(1);
}

const user = await users.byEmail(email);
if (!user) {
  console.error(`No account with email ${email}.`);
  await sql.end();
  process.exit(1);
}

const plan = await deletionPlan(user);
console.log(`Account ${user.id} (${email}), Clerk ${user.clerk_id || 'none'}`);
for (const r of plan.records) console.log(`  ${KEPT_ENTITIES.includes(r.entity) ? 'keep  ' : 'delete'} ${r.entity}: ${r.n}`);
console.log(`  delete files: ${plan.files.length}`);
console.log(`  cancel subscriptions: ${plan.subscriptions.length}`);

if (flag !== '--confirm') {
  console.log('\nDry run. Add --confirm to delete.');
} else {
  await deleteAccount(user, { log: (line) => console.log(`  ${line}`) });
  console.log('Done.');
}
await sql.end();
