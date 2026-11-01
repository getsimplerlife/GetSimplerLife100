/**
 * SLICE 168 — D-10. The admin panel used to bounce a non-owner to `/portal`
 * with NO message at all: they were silently teleported and could not tell
 * whether they had been refused or had mis-clicked. Sweep A's PASS criterion
 * was "bounces *and says so in words*". The bounce now carries
 * `?notice=admin-required` and this banner says, in words, what happened.
 *
 * Unknown/absent notice codes render nothing — this never invents a message.
 */
const NOTICES: Record<string, { title: string; body: string }> = {
  "admin-required": {
    title: "The admin panel is restricted to the workspace owner.",
    body:
      "You're signed in, but your account doesn't have owner access, so that page wasn't opened. " +
      "You've been sent back to your dashboard — nothing was changed.",
  },
};

export function PortalBounceNotice({ notice }: { notice?: string | null }) {
  const entry = notice ? NOTICES[notice] : undefined;
  if (!entry) return null;
  return (
    <div
      role="alert"
      className="bg-amber-950/25 border border-amber-900/50 rounded-xl px-5 py-4 flex items-start gap-3"
    >
      <span className="text-lg leading-none" aria-hidden="true">🔒</span>
      <div>
        <p className="font-bold text-amber-300 text-sm">{entry.title}</p>
        <p className="text-stone-300 text-xs mt-1 leading-relaxed">{entry.body}</p>
      </div>
    </div>
  );
}

export default PortalBounceNotice;
