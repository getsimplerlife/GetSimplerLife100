// Stub for @libsql/client — no-op in browser
export const createClient = () => ({
  execute: () => ({ rows: [], columns: [] }),
  batch: () => [],
  close: () => {},
});
