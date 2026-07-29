// Lazy DB access — safely works in both server and browser
// In the browser (Vite CSR build), @libsql/client is externalized via vite.config.ts

import type { LibSQLDatabase } from 'drizzle-orm/libsql';

let _dbInstance: any = null;

function createLazyDb(): any {
  return new Proxy({}, {
    get(_target: any, prop: string | symbol) {
      if (_dbInstance) {
        return _dbInstance[prop];
      }
      if (typeof window !== 'undefined') {
        const chainable = new Proxy(() => chainable, {
          get: () => chainable,
          apply: () => chainable,
        });
        return chainable;
      }
      throw new Error(
        `Database not initialized. Call await initDb() first.`
      );
    }
  });
}

export const db = createLazyDb() as LibSQLDatabase<any>;

export async function initDb(): Promise<LibSQLDatabase<any>> {
  if (_dbInstance) return _dbInstance;
  if (typeof window !== 'undefined') {
    throw new Error('Database access is not available in the browser');
  }
  const { createClient } = await import('@libsql/client');
  const { drizzle } = await import('drizzle-orm/libsql');
  const schema = await import('./schema');
  const client = createClient({
    url: process.env.TEAM_DB_URL!,
    authToken: process.env.TEAM_DB_AUTH_TOKEN!,
  });
  _dbInstance = drizzle(client, { schema: schema.default || schema });
  return _dbInstance;
}

export const getDb = initDb;
