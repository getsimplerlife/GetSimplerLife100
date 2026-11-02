/**
 * MAIL-LANE ISOLATION (slice 170) — a test must state the world it assumes.
 *
 * Why this exists: the deployment box now exports a REAL mail lane
 * (`SMTP_HOST/SMTP_PORT/SMTP_SECURE/SMTP_USER/SMTP_PASS/SMTP_FROM` — Brevo
 * SMTP), and earlier boxes exported `SENDGRID_API_KEY`. Three test files
 * assumed the machine had NO lane: they asserted "nothing configured" or
 * "SendGrid is the lane", inherited the box's lane instead, and went red on
 * every machine that had one — a gate red for a reason that had nothing to do
 * with the change under test.
 *
 * Rule: a test that cares about the mail lane calls `clearMailLane()` in its
 * own `beforeEach` (and restores in `afterEach`), then configures exactly the
 * lane it is testing. It never inherits the host's credentials.
 *
 * `clearMailLane()` sets the variables to the EMPTY STRING rather than
 * deleting them: an empty string is what "not configured" means to
 * `src/integrations/email.ts` (`process.env.X || ""`), and it is unambiguous
 * even if something re-reads the env later in the file.
 */
const MAIL_ENV_KEYS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "SENDGRID_API_KEY",
] as const;

/**
 * Blank every mail-lane variable for the current test and return a restore
 * function that puts the host's original values back.
 *
 *   let restoreMailLane: () => void;
 *   beforeEach(() => { restoreMailLane = clearMailLane(); });
 *   afterEach(() => { restoreMailLane(); });
 */
export function clearMailLane(): () => void {
  const saved = new Map<string, string | undefined>();
  for (const key of MAIL_ENV_KEYS) {
    saved.set(key, process.env[key]);
    process.env[key] = "";
  }
  return () => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}
