import type { SVGProps } from "react";

/**
 * PortalIcons — SVG iconography for the portal shell, matching the marketing
 * site's emerald-token design system (24×24 stroke icons, fill none, stroke
 * currentColor). Replaces the emoji nav icons (P2-1).
 *
 * Usage: <PortalIcon name="proposals" className="w-4 h-4 text-emerald-400" />
 * The icon color inherits from `currentColor`, so any text-emerald-* class on
 * the page tints it.
 */
export type PortalIconName =
  | "dashboard"
  | "proposals"
  | "invoices"
  | "checklists"
  | "deal-rooms"
  | "boards"
  | "tasks"
  | "surveys"
  | "inbox"
  | "workflows"
  | "import"
  | "documents"
  | "vault"
  | "files"
  | "approvals"
  | "assistant"
  | "communications"
  | "integrations"
  | "secure"
  | "dedupe"
  | "access"
  | "knowledge"
  | "settings"
  | "admin"
  | "logout"
  | "install"
  | "bell"
  | "mail";

export type NoticeIconName = "approval" | "complete" | "error" | "info";

const NAV_PATHS: Record<PortalIconName, string> = {
  dashboard: "M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10",
  proposals: "M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2zm4 5h6M9 12h6M9 16h5",
  invoices: "M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3zm4 5h6M9 12h6",
  checklists: "M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z",
  "deal-rooms": "M5 6h14a1 1 0 011 1v10a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1zm0 5h14M9 6v15",
  boards: "M4 5h16v14H4zM10 5v14M16 5v14",
  tasks: "M8 3h8a2 2 0 012 2v15H6V5a2 2 0 012-2zM9 3v2M15 3v2M9 12h6M9 16h6",
  surveys: "M4 20h16M6 16v-4M10 16V8M14 16v-6M18 16v-2",
  inbox: "M4 6h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1zm0 2l8 5 8-5",
  workflows: "M13 3L5 13h6l-1 8 8-10h-6l1-8z",
  import: "M12 4v10m0 0l-4-4m4 4l4-4M5 19h14",
  documents: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z",
  vault: "M4 7h16M6 7v12a1 1 0 001 1h10a1 1 0 001-1V7M9 11h6M9 15h6",
  files: "M6 4h12a1 1 0 011 1v15H5V5a1 1 0 011-1zM9 8h6M9 12h6",
  approvals: "M12 3l7 3v5c0 4.42-2.94 8.05-7 10-4.06-1.95-7-5.58-7-10V6l7-3zM9 12l2 2 4-4",
  assistant: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zm7 9l.9 2.1L22 15l-2.1.9L19 18l-.9-2.1L16 15l2.1-.9L19 12z",
  communications: "M4 5h16a1 1 0 011 1v10a1 1 0 01-1 1H9l-4 4v-4H4a1 1 0 01-1-1V6a1 1 0 011-1zm4 5h8M8 14h5",
  integrations: "M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zm0 9l8-4.5M12 12L4 7.5M12 12v9",
  secure: "M7 11V8a5 5 0 0110 0v3M5 11h14v10H5V11zm5 5h4",
  dedupe: "M4 5h16l-6 7v6l-4 2v-8L4 5z",
  access: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm8-1l2 2 4-4",
  knowledge: "M4 5a2 2 0 012-2h12a2 2 0 012 2v14H6a2 2 0 00-2 2V5zm0 14a2 2 0 002 2h14M8 7h8M8 11h8",
  settings: "M4 6h9M17 6h3M4 12h3M11 12h9M4 18h9M17 18h3M17 4v4M11 10v4M17 16v4",
  admin: "M17 20v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M10 11a4 4 0 100-8 4 4 0 000 8zm11 9v-1a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
  logout: "M15 12H4m0 0l4-4m-4 4l4 4M10 4h10v16H10",
  install: "M12 3v10m0 0l-4-4m4 4l4-4M5 19h14",
  bell: "M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M12 21a2 2 0 001.7-1H10.3A2 2 0 0012 21z",
  mail: "M4 6h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1zm0 2l8 5 8-5",
};

const NOTICE_PATHS: Record<NoticeIconName, string> = {
  approval: "M12 8v4l3 3M12 21a9 9 0 100-18 9 9 0 000 18z",
  complete: "M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z",
  error: "M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
  info: "M13 16h-1v-4h-1m1-4h.01M12 21a9 9 0 100-18 9 9 0 000 18z",
};

interface PortalIconProps extends SVGProps<SVGSVGElement> {
  name: PortalIconName;
}

export function PortalIcon({ name, className, ...rest }: PortalIconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true" {...rest}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={NAV_PATHS[name]} />
    </svg>
  );
}

interface NoticeIconProps extends SVGProps<SVGSVGElement> {
  name: NoticeIconName;
}

export function NoticeIcon({ name, className, ...rest }: NoticeIconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true" {...rest}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={NOTICE_PATHS[name]} />
    </svg>
  );
}