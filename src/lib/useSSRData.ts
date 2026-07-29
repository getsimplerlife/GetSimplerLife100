import { useState, useEffect } from "react";
import { loadPortalSSRData } from "./loadPortalSSRData";

/**
 * Hook that first tries SSR filesystem data, then window.__PORTAL_DATA__,
 * then falls back to client-side fetch.
 *
 * Usage:
 *   const { data: tasks, loading } = useSSRData("tasks", fetchTasks, []);
 */
export function useSSRData<T>(
  key: string,
  fetchFn: () => Promise<T>,
  defaultValue: T
) {
  // Phase 1: SSR (server-side) — read from filesystem
  // Phase 2: Hydration — read from window.__PORTAL_DATA__
  // Phase 3: Client navigation — fetch from API
  const [data, setData] = useState<T>(() => {
    // During SSR, try filesystem data first
    if (typeof window === "undefined") {
      try {
        const ssrData = loadPortalSSRData([key]);
        if (ssrData && (ssrData as any)[key] !== undefined) {
          return (ssrData as any)[key] as T;
        }
      } catch {}
      return defaultValue;
    }

    // During hydration, check __PORTAL_DATA__ from prod-server
    const portalData = (window as any).__PORTAL_DATA__;
    if (portalData && portalData[key] !== undefined) {
      const d = portalData[key] as T;
      delete portalData[key];
      return d;
    }
    return defaultValue;
  });

  const [loading, setLoading] = useState(() => {
    // Already have data from SSR or __PORTAL_DATA__
    if (typeof window === "undefined") {
      try {
        const ssrData = loadPortalSSRData([key]);
        if (ssrData && (ssrData as any)[key] !== undefined) return false;
      } catch {}
      return true;
    }
    const portalData = (window as any).__PORTAL_DATA__;
    if (portalData && portalData[key] !== undefined) return false;
    return true;
  });

  useEffect(() => {
    if (!loading) return;
    let cancelled = false;
    fetchFn()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading, setData };
}
