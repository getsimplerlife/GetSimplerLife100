// Stub for node:async_hooks — no-op in browser
export class AsyncLocalStorage {
  getStore() { return undefined; }
  run(store, cb) { return cb(); }
  enterWith(store) {}
  exit(cb) { return cb(); }
}
export const executionAsyncId = () => 1;
export const triggerAsyncId = () => 0;
