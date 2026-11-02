// Deletes an EcoEstate account (Privacy Policy: "Your choices and rights").
// Used by the in-app "Delete account" option and `npm run delete-account`.
//
// Removes the user's records (properties, tracked projects, progress, posts,
// comments, messages they sent), their uploaded files, their Clerk sign-in and
// their app user row, and cancels any live Stripe subscription. Keeps what the
// law or fraud prevention needs: purchases (payment and tax records), the
// billing account and referral records.
import { createClient } from '@supabase/supabase-js';
import { createClerkClient } from '@clerk/express';
import Stripe from 'stripe';
import { sql } from './db.js';

export const KEPT_ENTITIES = ['Base44Purchase', 'BillingAccount', 'Referral'];

/** What deleting this user would remove: { records: [{ entity, n }], files, subscriptions }. */
export async function deletionPlan(user) {
  const records = await sql`SELECT entity, count(*)::int AS n FROM records WHERE created_by_id = ${user.id} GROUP BY entity ORDER BY entity`;
  const files = await sql`SELECT id FROM files WHERE created_by_id = ${user.id}`;
  const subs = await sql`SELECT data->>'subscriptionId' AS id FROM records
    WHERE entity = 'Base44Purchase' AND data->>'appUserId' = ${user.id} AND data->>'status' = 'paid' AND data ? 'subscriptionId'`;
  return { records, files: files.map((f) => f.id), subscriptions: subs.map((s) => s.id).filter(Boolean) };
}

/** Deletes the account. `log` receives one line per step. */
export async function deleteAccount(user, { log = () => {} } = {}) {
  const plan = await deletionPlan(user);

  const key = process.env.STRIPE_SECRET_KEY;
  if (key) {
    const stripe = new Stripe(key);
    for (const id of plan.subscriptions) {
      try {
        await stripe.subscriptions.cancel(id);
        log(`canceled subscription ${id}`);
      } catch (e) {
        log(`could not cancel ${id}: ${e.message}`);
      }
    }
  }

  if (plan.files.length && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const storage = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }).storage.from('uploads');
    const { error } = await storage.remove(plan.files);
    if (error) log(`storage: ${error.message}`);
  }
  await sql`DELETE FROM files WHERE created_by_id = ${user.id}`;

  const removed = await sql`DELETE FROM records WHERE created_by_id = ${user.id} AND NOT (entity = ANY(${KEPT_ENTITIES})) RETURNING id`;
  log(`deleted ${removed.length} records and ${plan.files.length} files`);

  if (user.clerk_id && process.env.CLERK_SECRET_KEY) {
    try {
      await createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY }).users.deleteUser(user.clerk_id);
      log('deleted Clerk sign-in account');
    } catch (e) {
      log(`Clerk: ${e.message} (delete it in the Clerk dashboard)`);
    }
  }

  // Kept purchases still name the buyer's email for tax records.
  await sql`DELETE FROM users WHERE id = ${user.id}`;
  return { records: removed.length, files: plan.files.length, subscriptions: plan.subscriptions.length };
}
