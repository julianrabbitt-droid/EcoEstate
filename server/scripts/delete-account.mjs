// Deletes an EcoEstate account on request (Privacy Policy: within 30 days).
//
//   npm run delete-account -- someone@example.com           # dry run: shows what would go
//   npm run delete-account -- someone@example.com --confirm # deletes
//
// Removes the user's records (projects, tracked projects, progress, posts,
// comments, messages they sent), their uploaded files, their sign-in account
// at Clerk and their app user row, and cancels any live Stripe subscription.
// Keeps what the law or fraud prevention needs: purchases (payment and tax
// records), the billing account and referral records.
import { createClient } from '@supabase/supabase-js';
import { createClerkClient } from '@clerk/express';
import Stripe from 'stripe';
import { sql, users } from '../db.js';

const KEEP = new Set(['Base44Purchase', 'BillingAccount', 'Referral']);
const [email, flag] = process.argv.slice(2);
const confirm = flag === '--confirm';
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

const owned = await sql`SELECT entity, count(*)::int AS n FROM records WHERE created_by_id = ${user.id} GROUP BY entity ORDER BY entity`;
const files = await sql`SELECT id FROM files WHERE created_by_id = ${user.id}`;
const subs = await sql`SELECT data->>'subscriptionId' AS id FROM records
  WHERE entity = 'Base44Purchase' AND data->>'appUserId' = ${user.id} AND data->>'status' = 'paid' AND data ? 'subscriptionId'`;

console.log(`Account ${user.id} (${email}), Clerk ${user.clerk_id || 'none'}`);
for (const r of owned) console.log(`  ${KEEP.has(r.entity) ? 'keep  ' : 'delete'} ${r.entity}: ${r.n}`);
console.log(`  delete files: ${files.length}`);
console.log(`  cancel subscriptions: ${subs.filter((s) => s.id).length}`);

if (!confirm) {
  console.log('\nDry run. Add --confirm to delete.');
  await sql.end();
  process.exit(0);
}

const key = process.env.STRIPE_SECRET_KEY;
if (key) {
  const stripe = new Stripe(key);
  for (const { id } of subs) {
    if (!id) continue;
    try {
      await stripe.subscriptions.cancel(id);
      console.log(`  canceled ${id}`);
    } catch (e) {
      console.warn(`  could not cancel ${id}: ${e.message}`);
    }
  }
}

if (files.length) {
  const storage = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }).storage.from('uploads');
  const { error } = await storage.remove(files.map((f) => f.id));
  if (error) console.warn(`  storage: ${error.message}`);
  await sql`DELETE FROM files WHERE created_by_id = ${user.id}`;
}

const removed = await sql`DELETE FROM records WHERE created_by_id = ${user.id} AND NOT (entity = ANY(${[...KEEP]})) RETURNING id`;
console.log(`  deleted ${removed.length} records`);

if (user.clerk_id && process.env.CLERK_SECRET_KEY) {
  try {
    await createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY }).users.deleteUser(user.clerk_id);
    console.log('  deleted Clerk sign-in account');
  } catch (e) {
    console.warn(`  Clerk: ${e.message} (delete it in the Clerk dashboard)`);
  }
}

// The user row goes too; kept purchases still name the buyer's email for tax records.
await sql`DELETE FROM users WHERE id = ${user.id}`;
console.log('Done.');
await sql.end();
