/**
 * portal.knowledgebase.index.page.tsx — Phase 4.4 native KNOWLEDGE-BASE /
 * HELP-CENTER portal surface (lazy route). Article management (draft →
 * published → archived), categories, search over the tenant's OWN articles,
 * and AI answer-draft requests. All mutations ride the Approval Queue (pending
 * cards + approve/reject); the copy stays HONEST: answer drafting is
 * config-only and OFF by default — requested drafts persist an explicit
 * disabled note and never fabricate an answer.
 */
import { useCallback, useEffect, useState } from "react";
import { Card, CardBody, Badge, Button } from "~/components/ui";
import { authedJson } from "~/lib/portal-primitives";

interface CategoryView {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
}
interface ArticleView {
  id: string;
  categoryId?: string;
  title: string;
  status: string;
  tags: string[];
  updatedAt: string;
}
interface DraftView {
  id: string;
  question: string;
  status: string;
  note: string;
  requestedAt: string;
}
interface PendingWriteView {
  id: string;
  op: string;
  action: string;
  status: string;
  requestedAt: string;
}

export default function PortalKnowledgeBaseIndexPage() {
  const [categories, setCategories] = useState<CategoryView[]>([]);
  const [articles, setArticles] = useState<ArticleView[]>([]);
  const [drafts, setDrafts] = useState<DraftView[]>([]);
  const [writes, setWrites] = useState<PendingWriteView[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchHits, setSearchHits] = useState<ArticleView[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // SLICE 190 — four silent `if (x.ok)` reads made a failed knowledge-base read
  // render "No categories yet." / "No articles yet" / "No pending approvals.",
  // and a failed SEARCH rendered as "No articles match your workspace's
  // content." — a false statement about the tenant's own content.
  const [loaded, setLoaded] = useState(false);
  const [readError, setReadError] = useState("");
  const [searchError, setSearchError] = useState("");
  const [catForm, setCatForm] = useState({ name: "", description: "" });
  const [artForm, setArtForm] = useState({ title: "", body: "", tags: "", categoryId: "" });
  const [draftForm, setDraftForm] = useState({ question: "", sourceArticleIds: "" });

  const load = useCallback(async () => {
    const [c, a, d, w] = await Promise.all([
      authedJson<{ categories: CategoryView[] }>("/api/native/knowledgebase/categories"),
      authedJson<{ articles: ArticleView[] }>("/api/native/knowledgebase/articles"),
      authedJson<{ drafts: DraftView[] }>("/api/native/knowledgebase/drafts"),
      authedJson<{ writes: PendingWriteView[] }>("/api/native/knowledgebase/writes"),
    ]);
    const errors = [c, a, d, w].flatMap((x) => (x.ok ? [] : [x.error]));
    if (errors.length > 0) {
      setReadError(errors.join(" · "));
      setLoaded(false);
      return;
    }
    if (c.ok) setCategories(c.data?.categories ?? []);
    if (a.ok) setArticles(a.data?.articles ?? []);
    if (d.ok) setDrafts(d.data?.drafts ?? []);
    if (w.ok) setWrites(w.data?.writes ?? []);
    setReadError("");
    setLoaded(true);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function submit(path: string, body: unknown): Promise<void> {
    setNotice(null);
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; data?: { status?: string } };
    if (res.ok || res.status === 202) {
      setNotice(json.data?.status === "pending" ? "Queued for approval — approve it from the pending list below." : "Saved.");
      void load();
    } else {
      setNotice(json.error ?? "That action could not be completed.");
    }
  }

  async function createCategory(): Promise<void> {
    await submit("/api/native/knowledgebase/categories", { name: catForm.name, description: catForm.description });
    setCatForm({ name: "", description: "" });
  }
  async function createArticle(): Promise<void> {
    const tags = artForm.tags.trim() ? artForm.tags.split(",").map((s) => s.trim()).filter(Boolean) : [];
    await submit("/api/native/knowledgebase/articles", { title: artForm.title, body: artForm.body, tags, categoryId: artForm.categoryId.trim() || undefined });
    setArtForm({ title: "", body: "", tags: "", categoryId: "" });
  }
  async function articleAction(id: string, action: "publish" | "archive" | "delete"): Promise<void> {
    await submit(`/api/native/knowledgebase/articles/${id}/${action}`, {});
  }
  async function requestDraft(): Promise<void> {
    const sourceArticleIds = draftForm.sourceArticleIds.trim() ? draftForm.sourceArticleIds.split(",").map((s) => s.trim()).filter(Boolean) : [];
    await submit("/api/native/knowledgebase/drafts/request", { question: draftForm.question, sourceArticleIds });
    setDraftForm({ question: "", sourceArticleIds: "" });
  }
  async function decideWrite(id: string, decision: "apply" | "reject"): Promise<void> {
    await submit(`/api/native/knowledgebase/writes/${id}/${decision}`, {});
  }

  async function runSearch(): Promise<void> {
    if (!searchTerm.trim()) {
      setSearchHits(null);
      setSearchError("");
      return;
    }
    // SLICE 190 — `else setSearchHits([])` turned a 500 into "No articles match
    // your workspace's content.": a statement about the tenant's own content
    // made about a read that never answered.
    const res = await authedJson<{ articles: ArticleView[] }>(
      `/api/native/knowledgebase/search?q=${encodeURIComponent(searchTerm.trim())}`,
    );
    if (!res.ok) {
      setSearchHits(null);
      setSearchError(res.error);
      return;
    }
    setSearchError("");
    setSearchHits(res.data?.articles ?? []);
  }

  const statusColor: Record<string, string> = { draft: "bg-stone-700 text-stone-200", published: "bg-emerald-900 text-emerald-200", archived: "bg-stone-800 text-stone-400" };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Knowledge Base</h1>
        <p className="text-stone-400 text-sm mt-1">Articles, categories and search over your workspace's own how-to content. Every change is approval-gated; AI answer drafting is config-only and OFF by default.</p>
      </div>
      {notice && <div className="rounded-lg bg-stone-900 border border-stone-700 px-4 py-3 text-sm text-stone-200">{notice}</div>}
      {readError && (
        <div role="alert" className="rounded-lg bg-rose-950/40 border border-rose-800/50 px-4 py-3 text-sm text-rose-200">
          Could not read this workspace&apos;s knowledge base — {readError}. Categories, articles and pending approvals
          below are unread, not empty.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Create category */}
        <Card>
          <CardBody>
            <h2 className="text-lg font-semibold text-white mb-3">New category</h2>
            <div className="space-y-3">
              <input className="w-full rounded-lg bg-stone-900 border border-stone-700 px-3 py-2 text-sm text-white placeholder-stone-500" placeholder="Category name" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} />
              <input className="w-full rounded-lg bg-stone-900 border border-stone-700 px-3 py-2 text-sm text-white placeholder-stone-500" placeholder="Description" value={catForm.description} onChange={(e) => setCatForm({ ...catForm, description: e.target.value })} />
              <Button onClick={createCategory}>Create category</Button>
            </div>
          </CardBody>
        </Card>
        {/* Create article */}
        <Card>
          <CardBody>
            <h2 className="text-lg font-semibold text-white mb-3">New article</h2>
            <div className="space-y-3">
              <input className="w-full rounded-lg bg-stone-900 border border-stone-700 px-3 py-2 text-sm text-white placeholder-stone-500" placeholder="Title" value={artForm.title} onChange={(e) => setArtForm({ ...artForm, title: e.target.value })} />
              <textarea className="w-full rounded-lg bg-stone-900 border border-stone-700 px-3 py-2 text-sm text-white placeholder-stone-500 min-h-28" placeholder="Body" value={artForm.body} onChange={(e) => setArtForm({ ...artForm, body: e.target.value })} />
              <input className="w-full rounded-lg bg-stone-900 border border-stone-700 px-3 py-2 text-sm text-white placeholder-stone-500" placeholder="Tags (comma-separated)" value={artForm.tags} onChange={(e) => setArtForm({ ...artForm, tags: e.target.value })} />
              <input className="w-full rounded-lg bg-stone-900 border border-stone-700 px-3 py-2 text-sm text-white placeholder-stone-500" placeholder="Category id (optional)" value={artForm.categoryId} onChange={(e) => setArtForm({ ...artForm, categoryId: e.target.value })} />
              <Button onClick={createArticle}>Create article</Button>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardBody>
          <h2 className="text-lg font-semibold text-white mb-3">Search your knowledge base</h2>
          <div className="flex gap-3">
            <input className="flex-1 rounded-lg bg-stone-900 border border-stone-700 px-3 py-2 text-sm text-white placeholder-stone-500" placeholder="Search titles, bodies and tags…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void runSearch(); }} />
            <Button onClick={runSearch}>Search</Button>
          </div>
          {searchError && (
            <p role="alert" className="mt-4 text-sm text-rose-300">
              The search could not be read — {searchError}. This is not a result of zero matching articles: the search
              never answered.
            </p>
          )}
          {searchHits && (
            <div className="mt-4 space-y-2">
              {searchHits.length === 0 && <p className="text-sm text-stone-400">No articles match your workspace's content.</p>}
              {searchHits.map((a) => (
                <div key={a.id} className="rounded-lg bg-stone-900 border border-stone-700 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-white">{a.title}</span>
                    <span className="text-xs text-stone-400">{a.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Categories */}
      <Card>
        <CardBody>
          <h2 className="text-lg font-semibold text-white mb-3">Categories ({categories.length})</h2>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-2 rounded-full bg-stone-900 border border-stone-700 px-3 py-1 text-xs text-stone-300">{c.name}</span>
            ))}
            {!loaded ? (
              <p className="text-sm text-stone-500">The category list could not be read — see the message above.</p>
            ) : categories.length === 0 ? (
              <p className="text-sm text-stone-500">No categories yet.</p>
            ) : null}
          </div>
        </CardBody>
      </Card>

      {/* Articles */}
      <Card>
        <CardBody>
          <h2 className="text-lg font-semibold text-white mb-3">Articles ({articles.length})</h2>
          <div className="space-y-2">
            {articles.map((a) => (
              <div key={a.id} className="rounded-lg bg-stone-900 border border-stone-700 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-white">{a.title}</span>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge className={statusColor[a.status] ?? "bg-stone-700 text-stone-200"}>{a.status}</Badge>
                      {a.tags.map((t) => <span key={t} className="text-xs text-stone-500">#{t}</span>)}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {a.status === "draft" && <Button onClick={() => void articleAction(a.id, "publish")}>Publish</Button>}
                    {(a.status === "draft" || a.status === "published") && <Button onClick={() => void articleAction(a.id, "archive")}>Archive</Button>}
                    {a.status === "draft" && <Button onClick={() => void articleAction(a.id, "delete")}>Delete</Button>}
                  </div>
                </div>
              </div>
            ))}
            {!loaded ? (
              <p className="text-sm text-stone-500">The article list could not be read — see the message above.</p>
            ) : articles.length === 0 ? (
              <p className="text-sm text-stone-500">No articles yet — create one above.</p>
            ) : null}
          </div>
        </CardBody>
      </Card>

      {/* AI answer drafts */}
      <Card>
        <CardBody>
          <h2 className="text-lg font-semibold text-white mb-3">AI answer drafts (OFF by default)</h2>
          <p className="text-sm text-stone-400 mb-3">Request a draft answer grounded in your workspace's own articles. Answer drafting is config-only and currently disabled — approved requests persist an honest record, never a fabricated answer.</p>
          <div className="space-y-3">
            <input className="w-full rounded-lg bg-stone-900 border border-stone-700 px-3 py-2 text-sm text-white placeholder-stone-500" placeholder="Your question" value={draftForm.question} onChange={(e) => setDraftForm({ ...draftForm, question: e.target.value })} />
            <input className="w-full rounded-lg bg-stone-900 border border-stone-700 px-3 py-2 text-sm text-white placeholder-stone-500" placeholder="Source article ids (comma-separated, optional)" value={draftForm.sourceArticleIds} onChange={(e) => setDraftForm({ ...draftForm, sourceArticleIds: e.target.value })} />
            <Button onClick={requestDraft}>Request answer draft</Button>
          </div>
          {drafts.length > 0 && (
            <div className="mt-4 space-y-2">
              {drafts.map((d) => (
                <div key={d.id} className="rounded-lg bg-stone-900 border border-stone-700 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-white">{d.question}</span>
                    <span className="text-xs text-stone-400">{d.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-stone-500">{d.note}</p>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Pending approvals */}
      <Card>
        <CardBody>
          <h2 className="text-lg font-semibold text-white mb-3">Pending approvals ({writes.length})</h2>
          <div className="space-y-2">
            {writes.map((w) => (
              <div key={w.id} className="rounded-lg bg-stone-900 border border-stone-700 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm text-white">{w.action}</span>
                  <div className="flex gap-2">
                    <Button onClick={() => void decideWrite(w.id, "apply")}>Approve</Button>
                    <Button onClick={() => void decideWrite(w.id, "reject")}>Reject</Button>
                  </div>
                </div>
              </div>
            ))}
            {!loaded ? (
              <p className="text-sm text-stone-500">The pending-approval list could not be read — see the message above.</p>
            ) : writes.length === 0 ? (
              <p className="text-sm text-stone-500">No pending approvals.</p>
            ) : null}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}