#!/usr/bin/env bun
/**
 * send-outreach.ts — CLI outreach mailer.
 *
 * Sends a single plain-text outreach email through the existing, LIVE SendGrid
 * path in src/integrations/email.ts (sendEmail -> sendViaSendGrid), so the
 * message inherits the app's fail-closed SendGrid behavior and uses the
 * real SENDGRID_API_KEY. The From address is the owner's branded address
 * (SMTP_FROM, set to electric.vortexz@gmail.com in the live env).
 *
 * READ-ONLY with respect to data: this only sends email. It touches no tenant
 * data, portal, or users.
 *
 * How env is loaded: Bun auto-loads `.env` from the current working directory.
 * Run this from a directory whose `.env` contains SENDGRID_API_KEY and SMTP_FROM
 * (e.g. the live copy /home/team/shared/site), or export them on the command
 * line. The script REFUSES to run without a real SENDGRID_API_KEY so it can
 * never silently fall back to the mock logger and misreport a delivery.
 *
 * SendGrid sender-identity note: SendGrid only permits sending FROM a verified
 * sender identity. If the key rejects From=electric.vortexz@gmail.com (HTTP 403
 * "from address not verified"), sendEmail returns { success:false, error } and
 * this script exits non-zero. Do NOT work around it — the from identity must be
 * verified in the SendGrid account (owner action). Success is defined only by
 * the fail-closed SendGrid HTTP 202.
 *
 * Usage:
 *   bun run scripts/send-outreach.ts <to> <subject> <body-file|'-'>
 *
 * The body is read from a file, or from stdin when the 3rd arg is '-'.
 *
 * Examples:
 *   cd /home/team/shared/site && \
 *     bun run /path/to/GetSimplerLife100/scripts/send-outreach.ts \
 *       sales@example.com "Automating proposal-to-invoice for your clients" \
 *       /tmp/pitch.txt
 *   echo "Hi ..." | bun run scripts/send-outreach.ts a@b.co "Subject" -
 */
import { readFile } from "node:fs/promises";
import { sendEmail } from "../src/integrations/email";

function usage(): never {
  console.error(
    "Usage: bun run scripts/send-outreach.ts <to> <subject> <body-file|->"
  );
  console.error(
    "Requires SENDGRID_API_KEY + SMTP_FROM in env (Bun auto-loads .env from cwd; see header)."
  );
  process.exit(2);
}

async function main() {
  const [, , to, subject, bodyArg] = process.argv;

  if (!to || !subject || bodyArg === undefined) {
    usage();
  }
  if (!process.env.SENDGRID_API_KEY) {
    console.error(
      "[send-outreach] ERROR: SENDGRID_API_KEY is not set. Running from the live " +
        "copy (/home/team/shared/site) so Bun loads its .env, or export " +
        "SENDGRID_API_KEY explicitly. Refusing to run so we never silently " +
        "fall back to the mock logger and misreport a delivery."
    );
    process.exit(3);
  }

  let body: string;
  if (bodyArg === "-") {
    body = await new Promise<string>((resolve) => {
      let data = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (c) => (data += c));
      process.stdin.on("end", () => resolve(data));
    });
  } else {
    body = await readFile(bodyArg, "utf8");
  }
  body = body.trim();

  const from = process.env.SMTP_FROM || "electric.vortexz@gmail.com";
  console.log(
    `[send-outreach] Sending to "${to}" from "${from}" (subject: "${subject}")...`
  );

  const result = await sendEmail({ to, subject, text: body });

  console.log("[send-outreach] RESULT:");
  console.log(JSON.stringify(result, null, 2));

  if (!result.success) {
    console.error(
      `[send-outreach] FAILED (SendGrid did not return 202). ${result.error ?? ""}`
    );
    process.exit(1);
  }
  console.log(
    `[send-outreach] DELIVERED via SendGrid (HTTP 202). messageId=${result.messageId}`
  );
}

main().catch((err) => {
  console.error("[send-outreach] Unexpected error:", err);
  process.exit(1);
});
