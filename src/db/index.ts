import * as schema from "./schema";

// Only initialize the DB on the server to avoid bundling
// @libsql/client into the client-side JS bundle.
// On the client, createServerFn is polyfilled to a no-op,
// so the db is never actually accessed.
const isServer = typeof window === 'undefined';

let dbInstance: any = null;

async function getDb() {
  if (!isServer) {
    throw new Error("Database can only be accessed server-side");
  }
  if (!dbInstance) {
    // Dynamic imports ensure @libsql/client is not bundled into client JS
    const [{ createClient }, { drizzle }] = await Promise.all([
      import("@libsql/client"),
      import("drizzle-orm/libsql"),
    ]);
    const client = createClient({
      url: process.env.TEAM_DB_URL!,
      authToken: process.env.TEAM_DB_AUTH_TOKEN!,
    });
    dbInstance = drizzle(client, { schema });
  }
  return dbInstance;
}

// Export a Proxy so db usage is transparent and sync
export const db = new Proxy({} as any, {
  get(_target, prop) {
    if (!isServer) {
      // On client, return a no-op function for any property access
      return new Proxy(() => {}, { get: () => () => Promise.resolve(null) });
    }
    // First call to any db method triggers async init
    // We use a sync proxy but the actual init is async
    // Most db operations are async anyway (returns promises)
    if (!dbInstance) {
      // Trigger async init in background
      getDb();
      // Return a lazy proxy that waits for init
      return new Proxy({} as any, {
        get(_t2, prop2) {
          if (prop2 === 'then') return undefined;
          return (...args: any[]) => getDb().then((d: any) => d[prop][prop2]?.(...args) ?? d[prop]?.[prop2 as string]);
        }
      });
    }
    return dbInstance[prop as string];
  },
});
