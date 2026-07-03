import { db } from "../src/db";
import { users, audits } from "../src/db/schema";
import { eq, and } from "drizzle-orm";
import { createAuditForEmailInternal } from "../src/db/queries";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const STATE_FILE = "/home/team/shared/monitoring_state.json";
const POTENTIAL_CUSTOMERS_FILE = "/home/team/shared/potential_customers.json";

async function loadState() {
  try {
    const data = await fs.readFile(STATE_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return { last_users: {} };
  }
}

async function saveState(state: any) {
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

async function logPotentialCustomer(user: any) {
  let customers = [];
  try {
    const data = await fs.readFile(POTENTIAL_CUSTOMERS_FILE, "utf-8");
    customers = JSON.parse(data);
  } catch {}
  
  if (!customers.find((c: any) => c.email === user.email)) {
    customers.push({
      email: user.email,
      id: user.id,
      registered_at: user.createdAt.toISOString(),
      flagged_at: new Date().toISOString()
    });
    await fs.writeFile(POTENTIAL_CUSTOMERS_FILE, JSON.stringify(customers, null, 2));
    console.log(`[MONITOR] Flagged potential customer: ${user.email}`);
  }
}

async function run() {
  console.log(`[MONITOR] Running customer monitoring at ${new Date().toISOString()}`);
  
  const state = await loadState();
  const currentUsers = await db.select().from(users);
  const newLastUsers: any = {};

  for (const user of currentUsers) {
    const lastNeedsReset = state.last_users[user.id]?.needs_password_reset;
    const currentNeedsReset = user.needsPasswordReset;

    console.log(`[MONITOR] User: ${user.email}, NeedsReset: ${currentNeedsReset}, Last: ${lastNeedsReset}`);

    // Logic 1: Transition from True to False (Purchased first, then set password)
    if (lastNeedsReset === true && currentNeedsReset === false) {
      console.log(`[MONITOR] User ${user.email} set their password. Checking for audit...`);
      const existingAudit = await db.query.audits.findFirst({
        where: eq(audits.userId, user.id)
      });
      
      if (!existingAudit) {
        console.log(`[MONITOR] No audit found for ${user.email}. Creating Blueprint audit...`);
        await createAuditForEmailInternal(user.email, "Deep-Dive AI Opportunity Audit");
      } else {
        console.log(`[MONITOR] Audit already exists for ${user.email}.`);
      }
    }

    // Logic 2: New user registered with False (Direct registration)
    if (lastNeedsReset === undefined && currentNeedsReset === false) {
      console.log(`[MONITOR] New direct registration detected: ${user.email}`);
      // Check if they already have an audit
      const existingAudit = await db.query.audits.findFirst({
        where: eq(audits.userId, user.id)
      });
      
      if (!existingAudit) {
        await logPotentialCustomer(user);
      }
    }

    newLastUsers[user.id] = {
      email: user.email,
      needs_password_reset: currentNeedsReset
    };
  }

  state.last_users = newLastUsers;
  await saveState(state);
  console.log("[MONITOR] Finished run.");
}

run().catch(console.error);
