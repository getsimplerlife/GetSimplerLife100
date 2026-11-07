import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Button, EmptyState, buttonClass } from "~/components/ui";

/**
 * PortalEmptyState — the P1-3 empty-state block for portal surfaces.
 *
 * SLICE 199: this is now a thin adapter over `EmptyState` in `~/components/ui`,
 * so the product has ONE empty state and not two. Two things changed, both
 * deliberate:
 *
 *  1. The optional emoji `icon` prop is GONE. No page ever passed it, so it was
 *     a feature that existed only in the type — and an empty state that shows an
 *     emoji on one page and not another is exactly the inconsistency the owner
 *     asked us to remove.
 *  2. The CTA is a real `Button` (or a `<Link>` wearing `buttonClass`) instead
 *     of a bare styled `<button>`, so it gets the same focus ring and hit area
 *     as every other control.
 *
 * The props stay source-compatible with the 46 existing call sites.
 */
export type PortalEmptyStateAction =
  | { label: string; to: string } // internal router link
  | { label: string; href: string } // external anchor
  | { label: string; onClick: () => void }; // in-page action (e.g. scroll to composer)

interface PortalEmptyStateProps {
  title: string;
  body?: ReactNode;
  action?: PortalEmptyStateAction;
  compact?: boolean;
}

/** Scroll a composer on the same page into view (used by same-page CTAs). */
export function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

const CTA_CLASS = "text-emerald-400 hover:text-emerald-300";

function EmptyStateCTA({ action }: { action: PortalEmptyStateAction }) {
  const label = <>{action.label} →</>;
  if ("to" in action) {
    return (
      <Link to={action.to as any} className={buttonClass({ variant: "ghost", size: "sm", className: CTA_CLASS })}>
        {label}
      </Link>
    );
  }
  if ("href" in action) {
    return (
      <a
        href={action.href}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClass({ variant: "ghost", size: "sm", className: CTA_CLASS })}
      >
        {label}
      </a>
    );
  }
  return (
    <Button variant="ghost" size="sm" className={CTA_CLASS} onClick={action.onClick}>
      {label}
    </Button>
  );
}

export function PortalEmptyState({ title, body, action, compact }: PortalEmptyStateProps) {
  return (
    <EmptyState
      title={title}
      body={body}
      compact={compact}
      action={action ? <EmptyStateCTA action={action} /> : undefined}
    />
  );
}
