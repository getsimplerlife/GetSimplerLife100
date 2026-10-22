import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

/**
 * PortalEmptyState — the P1-3 designed empty-state block for portal surfaces.
 *
 * Matches the P1-1 billing empty state (dashed stone border, centered, bold
 * title, muted body, ONE emerald CTA) and the P1-4 communications empty state
 * (dark theme, honest copy). Honesty bar: title/body state what the user sees
 * and why it's empty; the single CTA is the one real next action. Never
 * fabricate data or imply capability that doesn't exist.
 */
export type PortalEmptyStateAction =
  | { label: string; to: string } // internal router link
  | { label: string; href: string } // external anchor
  | { label: string; onClick: () => void }; // in-page action (e.g. scroll to composer)

interface PortalEmptyStateProps {
  title: string;
  body?: ReactNode;
  action?: PortalEmptyStateAction;
  icon?: string;
  compact?: boolean;
}

/** Scroll a composer on the same page into view (used by same-page CTAs). */
export function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function EmptyStateCTA({ action }: { action: PortalEmptyStateAction }) {
  const cls =
    "inline-block mt-3 text-emerald-400 font-bold text-sm hover:text-emerald-300 cursor-pointer";
  if ("to" in action) {
    return (
      <Link to={action.to} className={cls}>
        {action.label} →
      </Link>
    );
  }
  if ("href" in action) {
    return (
      <a href={action.href} target="_blank" rel="noopener noreferrer" className={cls}>
        {action.label} →
      </a>
    );
  }
  return (
    <button type="button" onClick={action.onClick} className={cls}>
      {action.label} →
    </button>
  );
}

export function PortalEmptyState({ title, body, action, icon, compact }: PortalEmptyStateProps) {
  return (
    <div
      className={`text-center border border-dashed border-stone-800 rounded-xl ${
        compact ? "px-4 py-8" : "px-6 py-12"
      }`}
    >
      {icon && <div className={`${compact ? "text-2xl mb-2" : "text-3xl mb-3"} block`}>{icon}</div>}
      <p className="text-stone-400 font-bold text-sm">{title}</p>
      {body && (
        <p className="text-stone-500 text-xs mt-1 max-w-md mx-auto leading-relaxed">{body}</p>
      )}
      {action && <EmptyStateCTA action={action} />}
    </div>
  );
}