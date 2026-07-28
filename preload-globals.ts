// Preload: define globalThis.app before TanStack Start/Vinxi SSR code runs.
// Fixes "undefined is not an object (evaluating 'globalThis.app.config')"
// which occurs because Vinxi's SSR context expects globalThis.app to exist.
(globalThis as any).app = (globalThis as any).app || { config: {} };
