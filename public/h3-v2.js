// Stub for h3-v2 — server-only module, no-op in browser
export const H3Event = class {};
export const clearSession = () => {};
export const deleteCookie = () => {};
export const getRequestHost = () => "localhost";
export const getRequestIP = () => "127.0.0.1";
export const getRequestProtocol = () => "http";
export const getRequestURL = () => new URL("http://localhost");
export const getSession = () => null;
export const getValidatedQuery = () => ({});
export const parseCookies = () => ({});
export const sanitizeStatusCode = (c) => c;
export const sanitizeStatusMessage = (m) => m;
export const sealSession = () => "";
export const setCookie = () => {};
export const toResponse = (r) => r;
export const unsealSession = () => ({});
export const updateSession = () => ({});
export const useSession = () => ({});
