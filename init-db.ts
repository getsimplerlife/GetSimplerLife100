import { createClient } from "@libsql/client";
import { users, audits } from "./src/db/schema";
import { drizzle } from "drizzle-orm/libsql";

async function main() {
  const client = createClient({
    url: process.env.TEAM_DB_URL!,
    authToken: process.env.TEAM_DB_AUTH_TOKEN!,
  });

  const db = drizzle(client);

  console.log("Creating tables...");

  // Drizzle doesn't have a simple "create all tables" for libsql in a script like this easily without migrations, 
  // but we can use raw SQL via the client to create them if they don't exist.
  
  await client.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS audits (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      results TEXT,
      deliverable_url TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  console.log("Tables created successfully.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
