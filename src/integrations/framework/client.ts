/**
 * Base HTTP Client with Rate Limiting, Retry, and Error Handling
 *
 * Provides a reusable HTTP client that all integration providers use.
 * Handles rate limiting with exponential backoff, retry-after headers,
 * response parsing, and error normalization.
 */

export interface HttpClientOptions {
  baseUrl: string;
  headers?: Record<string, string>;
  rateLimit?: {
    maxRequestsPerSecond: number;
  };
  timeout?: number;
  retry?: {
    maxRetries: number;
    baseDelay: number; // ms
    maxDelay: number; // ms
  };
}

export interface HttpClientResponse<T = any> {
  status: number;
  statusText: string;
  headers: Headers;
  data: T;
  ok: boolean;
}

export class HttpClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public statusText: string,
    public body?: any,
  ) {
    super(message);
    this.name = "HttpClientError";
  }
}

export class RateLimitError extends HttpClientError {
  constructor(
    message: string,
    public retryAfter: number,
  ) {
    super(message, 429, "Too Many Requests");
    this.name = "RateLimitError";
  }
}

export class HttpClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private timeout: number;
  private retryConfig: { maxRetries: number; baseDelay: number; maxDelay: number };
  private lastRequestTime = 0;
  private minRequestInterval: number;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.defaultHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options.headers,
    };
    this.timeout = options.timeout ?? 30_000;
    this.retryConfig = {
      maxRetries: options.retry?.maxRetries ?? 3,
      baseDelay: options.retry?.baseDelay ?? 1000,
      maxDelay: options.retry?.maxDelay ?? 30_000,
    };
    this.minRequestInterval = options.rateLimit
      ? 1000 / options.rateLimit.maxRequestsPerSecond
      : 0;
  }

  private async rateLimitThrottle(): Promise<void> {
    if (this.minRequestInterval <= 0) return;
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minRequestInterval) {
      await this.sleep(this.minRequestInterval - elapsed);
    }
    this.lastRequestTime = Date.now();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private buildUrl(path: string): string {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `${this.baseUrl}${cleanPath}`;
  }

  private async request<T = any>(
    method: string,
    path: string,
    body?: any,
    options?: { headers?: Record<string, string>; signal?: AbortSignal },
    retryCount = 0,
  ): Promise<HttpClientResponse<T>> {
    await this.rateLimitThrottle();

    const url = this.buildUrl(path);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    // Combine signals if provided
    const signal = options?.signal
      ? anySignal([controller.signal, options.signal])
      : controller.signal;

    try {
      const fetchOptions: RequestInit = {
        method,
        headers: {
          ...this.defaultHeaders,
          ...options?.headers,
        },
        signal,
      };

      if (body !== undefined && method !== "GET" && method !== "HEAD") {
        fetchOptions.body = typeof body === "string" ? body : JSON.stringify(body);
      }

      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get("Retry-After") || "5", 10);
        if (retryCount < this.retryConfig.maxRetries) {
          const delay = Math.min(
            retryAfter * 1000 + Math.random() * 1000,
            this.retryConfig.maxDelay,
          );
          await this.sleep(delay);
          return this.request<T>(method, path, body, options, retryCount + 1);
        }
        throw new RateLimitError(
          `Rate limited by ${url}. Retry after ${retryAfter}s`,
          retryAfter,
        );
      }

      // Auto-retry on 5xx errors
      if (response.status >= 500 && retryCount < this.retryConfig.maxRetries) {
        const delay = Math.min(
          this.retryConfig.baseDelay * Math.pow(2, retryCount),
          this.retryConfig.maxDelay,
        );
        await this.sleep(delay);
        return this.request<T>(method, path, body, options, retryCount + 1);
      }

      // Parse response
      let data: T;
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        data = await response.json();
      } else {
        data = (await response.text()) as unknown as T;
      }

      if (!response.ok) {
        throw new HttpClientError(
          `${method} ${url} failed (${response.status})`,
          response.status,
          response.statusText,
          data,
        );
      }

      return {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data,
        ok: true,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err instanceof HttpClientError || err instanceof RateLimitError) {
        throw err;
      }
      if (err.name === "AbortError") {
        throw new HttpClientError(`Request to ${url} timed out after ${this.timeout}ms`, 408, "Timeout");
      }
      throw new HttpClientError(`Request failed: ${err.message}`, 0, "Network Error");
    }
  }

  async get<T = any>(path: string, headers?: Record<string, string>): Promise<HttpClientResponse<T>> {
    return this.request<T>("GET", path, undefined, { headers });
  }

  async post<T = any>(path: string, body?: any, headers?: Record<string, string>): Promise<HttpClientResponse<T>> {
    return this.request<T>("POST", path, body, { headers });
  }

  async put<T = any>(path: string, body?: any, headers?: Record<string, string>): Promise<HttpClientResponse<T>> {
    return this.request<T>("PUT", path, body, { headers });
  }

  async patch<T = any>(path: string, body?: any, headers?: Record<string, string>): Promise<HttpClientResponse<T>> {
    return this.request<T>("PATCH", path, body, { headers });
  }

  async delete<T = any>(path: string, headers?: Record<string, string>): Promise<HttpClientResponse<T>> {
    return this.request<T>("DELETE", path, undefined, { headers });
  }
}

/**
 * Combine multiple AbortSignals into one
 */
function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

export { anySignal };