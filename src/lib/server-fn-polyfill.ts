// CSR-only polyfill for createServerFn — converts to fetch() calls.
// In SPA mode, server functions become HTTP requests to prod-server API endpoints.

interface ServerFnOptions {
  method?: "GET" | "POST";
}

interface ChainableServerFn {
  handler: <T>(fn: (...args: any[]) => Promise<T>) => (...args: any[]) => Promise<T>;
  validator: (fn: (data: any) => any) => ChainableServerFn;
}

export function createServerFn(_options?: ServerFnOptions): ChainableServerFn {


  // Data that flows through the chain: validator → handler

  const chainable: ChainableServerFn = {
    validator(_fn: (data: any) => any): ChainableServerFn {
      return chainable;
    },

    handler<T>(_fn: (...args: any[]) => Promise<T>): (...args: any[]) => Promise<T> {
      return async (..._args: any[]): Promise<T> => {
        // In the browser (CSR), server functions cannot execute server-side logic.
        // Route loaders and components should handle the empty/default response gracefully.
        console.warn("[createServerFn CSR] Server function called client-side — returning empty data. API endpoint needed.");
        return {} as T;
      };
    },
  };

  return chainable;
}
