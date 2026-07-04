import { createContext, useContext } from "react";

export interface SystemNotification {
  _id?: string;
  id: string;
  type: "approval" | "complete" | "error" | "info";
  title: string;
  message: string;
  link: string;
  read: boolean;
  createdAt: string;
}

export interface PortalContextType {
  notifications: SystemNotification[];
  unreadCount: number;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  addNotification: (notification: Omit<SystemNotification, "id" | "createdAt" | "read">) => Promise<void>;
}

export const PortalContext = createContext<PortalContextType | null>(null);

export function usePortalContext() {
  const context = useContext(PortalContext);
  if (!context) {
    throw new Error("usePortalContext must be used within a PortalLayout");
  }
  return context;
}
