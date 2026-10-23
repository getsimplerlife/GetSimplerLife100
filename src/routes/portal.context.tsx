import { createContext, useContext } from "react";
import type { NoticeItem } from "~/lib/portal-notifications";

/**
 * Portal context — P2-3. The notification surface is derived LIVE from real
 * workspace endpoints (see src/lib/portal-notifications.ts) and shared through
 * this context so the shell badge and the Notifications page always agree.
 * The legacy agent-era notification API was removed in this slice: it wrote to
 * a store that prod-server never serves, so every write was theater.
 */
export interface PortalContextType {
  userEmail: string;
  feed: NoticeItem[];
  unreadCount: number;
  notificationsError: string | null;
  /** Epoch ms of the last successful refresh — real, not fabricated. */
  updatedAt: number | null;
  refreshNotifications: () => void;
}

export const PortalContext = createContext<PortalContextType | null>(null);

export function usePortalContext() {
  const context = useContext(PortalContext);
  if (!context) {
    throw new Error("usePortalContext must be used within a PortalLayout");
  }
  return context;
}