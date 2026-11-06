/**
 * account-password-state.ts — SLICE 194a.
 *
 * "This account has no password yet" and "the password you typed is wrong" are
 * two different facts, and a customer is entitled to the true one.
 *
 * A real Stripe purchase provisions the buyer's portal account *before* the
 * buyer has ever chosen a password: `provisionAccountForPurchase` writes a row
 * with `passwordSet: false` and no `password` field, and the buyer sets a
 * password through the set-password lane whose link is in their confirmation
 * email. Until 194a `/api/login` handed that row straight to
 * `bcrypt.compare(password, undefined)`. bcrypt rejects a non-string argument,
 * the route wrapper caught the exception and answered `400 {"error":"Invalid
 * request"}`, and `/login` printed it verbatim — so a paying customer was told
 * their credential was invalid when the truth was that we had never created one.
 *
 * This predicate is the ONE definition of "there is nothing to compare against"
 * used by both login paths (`/api/login` and the no-JS `/login` form POST), so
 * the two doors can never drift apart again.
 *
 * It answers exactly one question — *is a password present?* — and never
 * whether a password is CORRECT. A caller must still compare any real
 * credential with bcrypt; short-circuiting on this predicate alone would be an
 * authentication bypass.
 */
export function accountHasNoPassword(user: unknown): boolean {
  if (!user || typeof user !== "object") return true;
  const password = (user as { password?: unknown }).password;
  // Absent, null, or any non-string (a corrupt record, a half-written row) is
  // "nothing to compare" — never a credential, and never a reason to throw.
  if (typeof password !== "string") return true;
  return password.trim().length === 0;
}
