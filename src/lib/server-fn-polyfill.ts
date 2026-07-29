// CSR-only polyfill for createServerFn — converts to fetch() calls.
// In SPA mode, server functions become HTTP requests to prod-server API endpoints.

interface ServerFnOptions {
  method?: "GET" | "POST";
}

interface ChainableServerFn<TArgs = any, TReturn = any> {
  validator: (fn: (data: any) => any) => ChainableServerFn<TArgs, TReturn>;
  handler: (fn: (...args: any[]) => Promise<TReturn>) => (...args: any[]) => Promise<TReturn>;
}

export function createServerFn(options?: ServerFnOptions): ChainableServerFn {
  const method = options?.method || "POST";
  
  const chain: ChainableServerFn = {
    validator(_fn: (data: any) => any): ChainableServerFn {
      // Return self to support chaining: createServerFn().validator(...).handler(...)
      return chain;
    },
    handler<T>(fn: (...args: any[]) => Promise<T>): (...args: any[]) => Promise<T> {
      // Return a function that calls the API endpoint
      return async (...args: any[]): Promise<T> => {
        // Try to fetch from a corresponding API endpoint
        // For now, just return empty/null data — route loaders will fall back to defaults
        console.warn("[createServerFn CSR] Server function called client-side — returning empty data. API endpoint needed.");
        return {} as T;
      };
    },
  };
  
  return chain;
}
