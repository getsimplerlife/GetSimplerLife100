// Stub for seroval — server-only serialization, no-op in browser
export const serialize = (v) => v;
export const deserialize = (v) => v;
export const toJSON = (v) => v;
export const fromJSON = (v) => v;
export const toCrossJSON = (v) => v;
export const toCrossJSONAsync = (v) => Promise.resolve(v);
export const toCrossJSONStream = (v) => v;
