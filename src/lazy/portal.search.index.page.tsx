import { useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { PortalEmptyState } from "~/components/PortalEmptyState";
import { PortalIcon } from "~/components/PortalIcons";
import { noticeTime } from "~/lib/portal-notifications";
import {
  usePortalGlobalSearch,
  searchWorkspace,
  type SearchEntry,
} from "~/lib/portal-search";

/**
 * Search — /portal/search (P2-7 global search, portal-only).
 *
 * ONE search surface for the whole portal. The index is built ONLY from the
 * ten real read endpoints the dashboard/notifications/pages already use; every
 * result is a record this workspace actually stores, matched by plain
 * case-insensitive token inclusion on its real fields. There is no search
 * server and no new endpoint — nothing is fabricated or guessed — and the
 * page never fetches directly, reads nothing beyond the lib's ten bounded
 * GETs, and every count on the page derives from the matched rows it renders.
 * All-401 → honest "Sign in" panel; empty workspace → honest empty state.
 */
function workspaceInitialQuery(): string {
  if (typeof window === "undefined") return "";
  try {
    return new URLSearchParams(window.location.search).get("q") ?? "";
  } catch {
    return "";
  }
}

function SearchPage() {
  const { index, signedOut, loading, updatedAt } = usePortalGlobalSearch(30000);
  const [query, setQuery] = useState(workspaceInitialQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => searchWorkspace(index, query), [index, query]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (signedOut) {
    return (
      <div className="max-w-xl mx-auto mt-16 bg-stone-950 border border-stone-900 rounded-2xl p-8 text-center">
        <h1 className="text-lg font-bold text-white mb-2">Sign in to see your search results.</h1>
        <p className="text-sm text-stone-400 mb-6">
          Your workspace's records appear in search once you're signed in.
        </p>
      </div>
    );
  }

  const queryTrimmed = query.trim();
  const workspaceEmpty = index.length === 0;

  return (
    <div className="space-y-8 text-stone-100 max-w-6xl mx-auto">
      <div className="border-b border-stone-900 pb-6">
        <h1 className="text-3xl font-black text-white tracking-tight">Search</h1>
        <p className="text-stone-400 text-sm mt-1">
          Find records across your workspace. Search draws only from the real data this portal
          already shows you — tasks, workflows, reports, proposals, invoices, deal rooms,
          approvals, integrations, and imports. Nothing is fetched beyond that and nothing is generated.
        </p>
      </div>

      {/* Search input */}
      <div className="relative">
        <PortalIcon
          name="search"
          className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-stone-500 pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQuery("");
          }}
          placeholder="Search tasks, workflows, proposals, clients, records…"
          aria-label="Search workspace"
          className="w-full bg-stone-950 border border-stone-900 rounded-2xl pl-11 pr-4 py-3.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500 font-semibold placeholder-stone-500 text-stone-200"
        />
      </div>

      {/* Honest states */}
      {workspaceEmpty && !queryTrimmed ? (
        <div className="max-w-xl mx-auto my-8">
          <PortalEmptyState
            title="Nothing to search yet"
            body="Search results draw from records this workspace has stored — tasks, workflows, reports, proposals, invoices, deal rooms, approvals, integrations, and imports. Nothing has been recorded for this workspace yet."
          />
        </div>
      ) : results.noQuery ? (
        <div className="max-w-xl mx-auto my-8">
          <PortalEmptyState
            title="Type to search your workspace"
            body="Start typing to search this workspace's real records. Results are grouped by where they live, and every row links to the page that owns it."
          />
        </div>
      ) : results.noMatches ? (
        <div className="max-w-xl mx-auto my-8">
          <PortalEmptyState
            title={`No matches for “${queryTrimmed}”`}
            body="Try a different word. Search only covers records this workspace already stores — it never reaches outside your data or invents results."
          />
        </div>
      ) : (
        <div className="space-y-8">
          {results.groups.map((group) => (
            <section key={group.category}>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-xs font-black text-stone-400 uppercase tracking-widest">
                  {group.label} · {group.entries.length}
                </h2>
                <Link
                  to={group.link as any}
                  className="text-[10px] font-mono text-stone-600 hover:text-emerald-400 transition-colors"
                >
                  Open {group.label} →
                </Link>
              </div>
              <div className="bg-stone-950 border border-stone-900 rounded-2xl divide-y divide-stone-900 overflow-hidden">
                {group.entries.map((entry: SearchEntry) => (
                  <Link
                    key={entry.id}
                    to={entry.link as any}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-stone-900/40 transition-colors group"
                  >
                    <PortalIcon name="search" className="w-4 h-4 shrink-0 text-emerald-400" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-stone-100 truncate">{entry.title}</p>
                      {entry.subtitle && (
                        <p className="text-[10px] font-semibold text-stone-500 truncate">{entry.subtitle}</p>
                      )}
                    </div>
                    {entry.at > 0 && (
                      <span className="text-[10px] font-mono text-stone-600 whitespace-nowrap shrink-0">
                        {noticeTime(entry.at)}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          ))}

          <p className="text-center text-[10px] font-mono text-stone-600 pt-2">
            {updatedAt != null
              ? `Searches this workspace's live data · refreshes every 30 seconds · Last refreshed ${new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
              : "Searches this workspace's live data · refreshes every 30 seconds."}
          </p>
        </div>
      )}
    </div>
  );
}

export default SearchPage;