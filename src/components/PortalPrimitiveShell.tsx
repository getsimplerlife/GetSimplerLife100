/**
 * PortalPrimitiveShell — the two shared states every slice-135 primitive page
 * needs, matching the existing portal look (dark shell, Card, stone/emerald
 * tokens used by invoices/settings/knowledgebase):
 *
 *   - SignedOutNotice: a 401 from any read is NOT an empty list. The page says
 *     plainly that the session is inactive and nothing was loaded.
 *   - ErrorLine: a real failure (400/404/500) with the server's own message.
 *
 * No data, no counts, no placeholders are rendered in either state.
 */
import { Card } from "~/components/ui";

export function SignedOutNotice({ surface }: { surface: string }) {
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">{surface}</h1>
      <Card>
        <div className="p-6">
          <p className="text-sm font-semibold text-stone-100">Please sign in to continue</p>
          <p className="mt-1 text-xs text-stone-400">
            Your session is not active, so nothing on this page was loaded — no data is shown, empty or otherwise.
          </p>
          <a href="/login" className="mt-3 inline-block text-sm font-bold text-emerald-400 hover:text-emerald-300">
            Sign in →
          </a>
        </div>
      </Card>
    </div>
  );
}

export function ErrorLine({ message }: { message: string }) {
  if (!message) return null;
  return <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{message}</div>;
}

export function FeedbackLine({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{message}</div>
  );
}
