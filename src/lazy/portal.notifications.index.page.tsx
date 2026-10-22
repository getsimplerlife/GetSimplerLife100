import { Link } from "@tanstack/react-router";
import { usePortalContext } from "~/routes/portal.context";
import { noticeTime, type NoticeItem } from "~/lib/portal-notifications";
import { PortalEmptyState } from "~/components/PortalEmptyState";
import { NoticeIcon, type NoticeIconName } from "~/components/PortalIcons";

/**
 * Notifications — P2-3 honest, unified portal notification surface.
 *
 * Consumption ONLY: every row is derived client-side from live workspace
 * state (approval queue, import run ledger, proposals/invoices/deal rooms).
 * "Unread" is defined by the underlying record still needing attention —
 * there is no separate store to mark as read, so nothing here is persisted or
 * fabricated. The agent-era hub, channels tab, and mark-all wrote to a store
 * prod-server never serves; all of that theater is gone.
 */

const TONE_ICON: Record<NoticeItem["tone"], NoticeIconName> = {
  approval: "approval",
  complete: "complete",
  error: "error",
  info: "info",
};

const TONE_CLASS: Record<NoticeItem["tone"], string> = {
  approval: "border-emerald-500/30 bg-emerald-500/5 text-emerald-400",
  complete: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  error: "border-rose-500/30 bg-rose-500/5 text-rose-400",
  info: "border-stone-700 bg-stone-900/60 text-stone-400",
};

function NoticeRow({ item }: { item: NoticeItem }) {
  return (
    <Link
      to={item.link as any}
      className={`block rounded-xl border p-4 transition-all hover:border-stone-700 hover:bg-stone-900/50 ${
        item.unread ? "border-emerald-500/30 bg-emerald-500/5" : "border-stone-900 bg-black"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className={`h-9 w-9 shrink-0 rounded-lg border flex items-center justify-center ${TONE_CLASS[item.tone]}`}>
          <NoticeIcon name={TONE_ICON[item.tone]} className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className={`text-xs font-bold leading-tight ${item.unread ? "text-white" : "text-stone-300"}`}>
              {item.title}
            </h3>
            {item.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" aria-label="Needs attention" />}
          </div>
          <p className="text-xs text-stone-400 leading-normal mt-1">{item.message}</p>
          <span className="text-[10px] text-stone-600 font-mono block mt-1">
            {noticeTime(item.at) ? `Updated ${noticeTime(item.at)}` : "Record time not available"}
          </span>
        </div>
      </div>
    </Link>
  );
}

interface SectionProps {
  title: string;
  items: NoticeItem[];
  emptyTitle: string;
  emptyBody: string;
  openLabel: string;
  openTo: string;
}

function NoticeSection({ title, items, emptyTitle, emptyBody, openLabel, openTo }: SectionProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black text-white tracking-tight">{title}</h2>
        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-stone-500">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      </div>
      {items.length === 0 ? (
        <PortalEmptyState title={emptyTitle} body={emptyBody} compact />
      ) : (
        <div className="space-y-2.5">
          {items.map((item) => (
            <NoticeRow key={item.id} item={item} />
          ))}
        </div>
      )}
      <div className="pt-1">
        <Link to={openTo as any} className="text-xs font-bold text-emerald-400 hover:text-emerald-300">
          {openLabel} →
        </Link>
      </div>
    </section>
  );
}

function NotificationsPage() {
  const { feed, unreadCount, notificationsError, updatedAt, refreshNotifications } = usePortalContext();

  const approvals = feed.filter((i) => i.kind === "approval");
  const imports = feed.filter((i) => i.kind === "import");
  const quote = feed.filter((i) => i.kind === "quote");

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 border-b border-stone-900 pb-6">
        <div>
          <p className="text-[10px] font-mono tracking-widest text-stone-500 uppercase font-bold">WORKSPACE ACTIVITY</p>
          <h1 className="text-2xl font-black text-white tracking-tight mt-1">Notifications</h1>
          <p className="text-xs text-stone-400 mt-1.5 max-w-2xl leading-relaxed">
            Everything here is drawn from your live workspace records — pending approvals, import run results, and
            quote-to-cash statuses. An item is unread while it still needs attention and clears itself when the
            underlying record changes. Nothing is stored or fabricated.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {unreadCount > 0 && (
            <span className="text-[10px] font-mono font-bold text-rose-300">
              {unreadCount} unread
            </span>
          )}
          {updatedAt != null && (
            <span className="text-[10px] font-mono text-stone-500">
              Updated {noticeTime(updatedAt)}
            </span>
          )}
          <button
            onClick={refreshNotifications}
            className="px-4 py-2 rounded-xl bg-stone-900 border border-stone-800 text-xs font-bold text-white hover:bg-stone-800 transition-all"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Honest error state — never substitute fake items. */}
      {notificationsError && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4">
          <p className="text-xs font-bold text-rose-300">Couldn't refresh notifications.</p>
          <p className="text-xs text-stone-400 mt-1">{notificationsError}</p>
          <button
            onClick={refreshNotifications}
            className="mt-3 text-xs font-bold text-emerald-400 hover:text-emerald-300"
          >
            Retry →
          </button>
        </div>
      )}

      {/* Totally empty + healthy: ONE honest empty state — no placeholder rows. */}
      {feed.length === 0 && !notificationsError && (
        <PortalEmptyState
          title="Nothing needs your attention right now"
          body="When an approval, import run, or quote-to-cash record changes in your workspace, it appears here automatically. The count shown on the bell above comes from the same live data."
        />
      )}

      {feed.length > 0 && (
        <div className="space-y-10">
          <NoticeSection
            title="Approvals"
            items={approvals}
            emptyTitle="No approvals waiting on you"
            emptyBody="Nothing is queued for your decision. New gated actions appear here when they are created."
            openLabel="Open Approvals"
            openTo="/portal/approvals"
          />
          <NoticeSection
            title="Imports"
            items={imports}
            emptyTitle="No import activity"
            emptyBody="Import runs and staged commits appear here when they happen. Nothing syncs in the background and nothing is imported until you approve."
            openLabel="Open Imports"
            openTo="/portal/import"
          />
          <NoticeSection
            title="Quote-to-cash"
            items={quote}
            emptyTitle="No quote-to-cash activity"
            emptyBody="Proposal, invoice, and deal-room status changes appear here. Items come straight from your workspace records — nothing is invented."
            openLabel="Open Workspace"
            openTo="/portal/proposals"
          />
        </div>
      )}
    </div>
  );
}

export default NotificationsPage;