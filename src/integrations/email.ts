import nodemailer from "nodemailer"; // standard, works in Bun; wrapped here for resilience

/**
 * SLICE 170 — the lane configuration is read at CALL time, not import time.
 * Module-level `const`s captured whatever the process booted with, which made
 * the lane untestable (a test could not change it) and made "which lane did we
 * use" depend on when the module happened to be imported.
 */
const DEFAULT_SMTP_FROM = "Simpler Life 100 <notifications@simplerlife100.ctonew.app>";

/**
 * SLICE 185 — every outbound message must name a mailbox a human actually
 * reads. `simplerlife100.com` has NO MX record, so a reply addressed to the
 * From address is undeliverable: a customer hitting "Reply" reached nobody.
 * `Reply-To` points at the owner's real inbox instead.
 *
 * ONE definition, used by every lane (nodemailer SMTP here, the SendGrid HTTP
 * body here, and `sendEmailSMTP` in prod-server.ts which imports this). Read at
 * CALL time (slice 170's rule) so `EMAIL_REPLY_TO` can override it without an
 * import-order surprise, and so a test can prove the header is wired to this
 * source rather than to a literal pasted next to the send.
 */
export const DEFAULT_REPLY_TO = "electric.vortexz@gmail.com";

/** The address replies are routed to right now: `EMAIL_REPLY_TO`, else the owner's inbox. */
export function replyToAddress(): string {
  return (process.env.EMAIL_REPLY_TO || "").trim() || DEFAULT_REPLY_TO;
}

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

function readSmtpConfig(): SmtpConfig {
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  return {
    host: (process.env.SMTP_HOST || "").trim(),
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    user: (process.env.SMTP_USER || "").trim(),
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || DEFAULT_SMTP_FROM,
  };
}

/** SMTP is usable only when host + user + pass are all present. */
function smtpConfigured(cfg: SmtpConfig = readSmtpConfig()): boolean {
  return Boolean(cfg.host && cfg.user && cfg.pass);
}

function sendgridKey(): string {
  return (process.env.SENDGRID_API_KEY || "").trim();
}

export interface EmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
}

/** One attempt against one provider, in the order they were tried. */
export interface EmailLaneAttempt {
  channel: "smtp" | "sendgrid";
  ok: boolean;
  error?: string;
}

export interface EmailResult {
  success: boolean;
  messageId: string;
  /**
   * TRUE only when nothing real was attempted (no lane configured). A real
   * provider was tried and failed → `isMock: false` with `success: false`, so a
   * caller can always tell "no lane" from "every lane failed".
   */
  isMock: boolean;
  recipient: string | string[];
  /** Present only on failure (fail-closed paths return success:false instead of throwing). */
  error?: string;
  /** The lane that produced this result; "none" for the mock path. */
  channel?: "smtp" | "sendgrid" | "none";
  /** Every lane tried, in order, with what happened to it (empty for the mock path). */
  attempts?: EmailLaneAttempt[];
}

/**
 * Which lane would `sendEmail` use right now, and is it a REAL one?
 * Callers that must never claim delivery (e.g. customer invoice sends) use
 * this to avoid the mock fallback entirely: `configured: false` means no
 * message can leave the building, so nothing may be reported as sent.
 */
export interface EmailLaneStatus {
  configured: boolean;
  channel: "sendgrid" | "smtp" | "none";
}
export function emailLaneStatus(): EmailLaneStatus {
  // SLICE 170 — SMTP wins when it is configured; SendGrid is only consulted
  // when there is no SMTP lane. (The live lane is Brevo SMTP.)
  if (smtpConfigured()) return { configured: true, channel: "smtp" };
  if (sendgridKey()) return { configured: true, channel: "sendgrid" };
  return { configured: false, channel: "none" };
}

/** Configured lanes in the order `sendEmail` tries them: SMTP first, then SendGrid. */
function configuredLanes(): Array<"smtp" | "sendgrid"> {
  const lanes: Array<"smtp" | "sendgrid"> = [];
  if (smtpConfigured()) lanes.push("smtp");
  if (sendgridKey()) lanes.push("sendgrid");
  return lanes;
}

/**
 * Sends an email. Precedence and fall-through (SLICE 170):
 *   1. nodemailer SMTP when SMTP_HOST + SMTP_USER + SMTP_PASS are all set —
 *      this is the LIVE lane (Brevo SMTP). SendGrid is not consulted at all.
 *   2. SendGrid (HTTP POST /v3/mail/send) when SENDGRID_API_KEY is set and
 *      there is no SMTP lane — or as the fall-through lane when SMTP fails.
 *   3. Mock/simulation logger, ONLY when no lane is configured at all — it
 *      never claims delivery and never runs after a real attempt.
 * A failing lane falls through to the next configured one instead of
 * black-holing the message; the returned result names the lane that answered
 * (`channel`) and every lane tried (`attempts`). `isMock` is true only when
 * nothing real was attempted.
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  const { to, subject, text, html } = options;
  const lanes = configuredLanes();

  if (lanes.length === 0) return simulateSend(options);

  const attempts: EmailLaneAttempt[] = [];
  for (const lane of lanes) {
    const result =
      lane === "smtp"
        ? await sendViaSmtp({ to, subject, text, html, cfg: readSmtpConfig() })
        : await sendViaSendGrid({ to, subject, text, html, apiKey: sendgridKey() });

    if (result.success && result.messageId) {
      attempts.push({ channel: lane, ok: true });
      return { ...result, isMock: false, channel: lane, attempts };
    }

    const error = result.error || "The provider did not acknowledge the message.";
    attempts.push({ channel: lane, ok: false, error });
    const next = lanes[lanes.indexOf(lane) + 1];
    if (next) {
      console.error(`[Email] lane ${lane} failed (${error}) — falling through to ${next}.`);
    }
  }

  // Every configured lane was tried and failed. NOT a mock: a real provider
  // was attempted, and nothing was delivered.
  const detail = attempts.map((a) => `${a.channel}: ${a.error}`).join(" | ");
  console.error(`[Email] all configured lanes failed: ${detail}`);
  return {
    success: false,
    messageId: "",
    isMock: false,
    recipient: to,
    channel: attempts[attempts.length - 1].channel,
    error: `All configured email lanes failed — ${detail}`,
    attempts,
  };
}

/**
 * Mock/simulation path — unchanged behavior. Reached ONLY when no lane is
 * configured: it writes the message to the debug log and reports `isMock: true`
 * so no caller can mistake it for delivery.
 */
async function simulateSend(options: EmailOptions): Promise<EmailResult> {
  const { to, subject, text, html } = options;
  const cfg = readSmtpConfig();
  const debugPath = "/home/team/shared/sent_emails_debug.json";
  const debugEmail = {
    timestamp: new Date().toISOString(),
    to,
    subject,
    text,
    html,
    smtpConfig: {
      host: cfg.host || "none",
      port: cfg.port,
      secure: cfg.secure,
    },
  };

  try {
    const fs = await import("node:fs/promises");
    let currentLogs: any[] = [];
    try {
      const fileContent = await fs.readFile(monitorPath(), "utf-8");
      currentLogs = JSON.parse(fileContent);
    } catch {
      // If file doesn't exist, start fresh
    }
    currentLogs.push(debugEmail);
    await fs.writeFile(debugPath, JSON.stringify(currentLogs, null, 2), "utf-8");
  } catch (err) {
    console.error("[Email Mock] Failed to save simulated email to sent_emails_debug.json:", err);
  }

  console.log(`[Email Mock] No email lane configured. Simulated sending to ${to}:`);
  console.log(`Subject: ${subject}`);
  return {
    success: true,
    messageId: `mock-${crypto.randomUUID()}`,
    isMock: true,
    recipient: to,
    channel: "none",
    attempts: [],
  };
}

/**
 * SMTP lane. Fail-closed and non-throwing: a transport error comes back as
 * `{ success: false, error }` so `sendEmail` can fall through to the next lane
 * instead of throwing past a working provider.
 */
async function sendViaSmtp(opts: {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  cfg: SmtpConfig;
}): Promise<EmailResult> {
  const { to, subject, text, html, cfg } = opts;
  try {
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
    });

    const info = await transporter.sendMail({
      from: cfg.from,
      to,
      subject,
      text,
      html,
      // Slice 185: replies must reach a human — the domain has no MX.
      replyTo: replyToAddress(),
    });
    console.log(`[Email SMTP] Sent email to ${to}. MessageID: ${info.messageId}`);
    return { success: true, messageId: info.messageId, isMock: false, recipient: to, channel: "smtp" };
  } catch (err: any) {
    console.error("[Email SMTP] Send failed:", err);
    return {
      success: false,
      messageId: "",
      isMock: false,
      recipient: to,
      channel: "smtp",
      error: `SMTP Send Failure: ${err?.message || String(err)}`,
    };
  }
}

/** Parse "Name <addr>" or "addr" into SendGrid's from object. */
function parseFromAddress(from: string): { email: string; name?: string } {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  if (m) return { email: m[2].trim(), name: m[1].trim() || undefined };
  return { email: from.trim() };
}

/**
 * SendGrid HTTP path (#233). Fail-closed: ONLY HTTP 202 counts as delivered —
 * any other status (or a network throw) returns { success: false, error } and
 * is never reported as sent, so the #231 throttle logic cannot be fooled into
 * suppressing a real alert.
 */
async function sendViaSendGrid(opts: {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  apiKey: string;
}): Promise<EmailResult> {
  const toList = Array.isArray(opts.to) ? opts.to : [opts.to];
  const from = parseFromAddress(process.env.SMTP_FROM || DEFAULT_SMTP_FROM);
  const content: { type: string; value: string }[] = [];
  if (opts.text) content.push({ type: "text/plain", value: opts.text });
  if (opts.html) content.push({ type: "text/html", value: opts.html });
  if (content.length === 0) content.push({ type: "text/plain", value: "" });
  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + opts.apiKey,
      },
      body: JSON.stringify({
        personalizations: [{ to: toList.map((email) => ({ email })) }],
        from,
        // Slice 185: SendGrid's Reply-To field — same single source as SMTP.
        reply_to: { email: replyToAddress() },
        subject: opts.subject,
        content,
      }),
    });
    if (response.status === 202) {
      // SendGrid returns 202 Accepted; the message id is in the X-Message-Id
      // header when the API exposes it (body is empty).
      const messageId = response.headers?.get("x-message-id") || `sg-${crypto.randomUUID()}`;
      console.log(`[Email SendGrid] Sent email to ${opts.to}. MessageID: ${messageId}`);
      return { success: true, messageId, isMock: false, recipient: opts.to, channel: "sendgrid" };
    }
    const errText = await response.text().catch(() => "");
    console.error(`[Email SendGrid] Send failed: HTTP ${response.status}: ${errText.slice(0, 500)}`);
    return {
      success: false,
      messageId: "",
      isMock: false,
      recipient: opts.to,
      channel: "sendgrid",
      error: `SendGrid HTTP ${response.status}: ${errText}`,
    };
  } catch (err: any) {
    console.error("[Email SendGrid] Send failed:", err);
    return {
      success: false,
      messageId: "",
      isMock: false,
      recipient: opts.to,
      channel: "sendgrid",
      error: err?.message || String(err),
    };
  }
}

function monitorPath(): string {
  return "/home/team/shared/sent_emails_debug.json";
}

/**
 * Built-in beautiful template system for agent notifications.
 */
export interface EmailTemplateVariables {
  recipientName?: string;
  agentName: string;
  workflowName: string;
  status: "success" | "human_review" | "failed";
  message: string;
  details?: Record<string, any>;
  actionUrl?: string;
  actionText?: string;
}

export function renderEmailTemplate(variables: EmailTemplateVariables): {
  subject: string;
  text: string;
  html: string;
} {
  const {
    recipientName = "Operations Leader",
    agentName,
    workflowName,
    status,
    message,
    details = {},
    actionUrl = "https://simplerlife100.ctonew.app/portal",
    actionText = "View Execution in Portal",
  } = variables;

  // Determine status indicators
  let statusEmoji = "✅";
  let statusText = "Completed Successfully";
  let themeColor = "#10b981"; // Emerald green
  if (status === "human_review") {
    statusEmoji = "⚠️";
    statusText = "Action Required (Human Review)";
    themeColor = "#f59e0b"; // Amber orange
  } else if (status === "failed") {
    statusEmoji = "❌";
    statusText = "Failed to Execute";
    themeColor = "#ef4444"; // Rose red
  }

  const subject = `[${statusEmoji} ${statusText}] ${agentName} - ${workflowName}`;

  // Build key-value detail rows for HTML and text
  let detailsText = "";
  let detailsHtml = "";
  if (Object.keys(details).length > 0) {
    detailsHtml += `<div style="margin-top: 20px; background-color: #1e293b; border-radius: 8px; padding: 16px; border: 1px solid #334155;">`;
    detailsHtml += `<h4 style="margin: 0 0 10px 0; color: #94a3b8; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Execution Metadata</h4>`;
    detailsHtml += `<table style="width: 100%; font-size: 14px; border-collapse: collapse;">`;
    
    for (const [key, value] of Object.entries(details)) {
      const displayVal = typeof value === "object" ? JSON.stringify(value) : String(value);
      detailsText += `- ${key}: ${displayVal}\n`;
      detailsHtml += `
        <tr style="border-bottom: 1px solid #334155;">
          <td style="padding: 6px 0; color: #94a3b8; font-weight: bold; width: 35%;">${key}</td>
          <td style="padding: 6px 0; color: #f1f5f9; text-align: left;">${displayVal}</td>
        </tr>
      `;
    }
    detailsHtml += `</table></div>`;
  }

  const text = `
Dear ${recipientName},

Your workflow "${workflowName}" has completed a run.

Status: ${statusEmoji} ${statusText}

Summary:
${message}

${detailsText ? `Metadata:\n${detailsText}` : ""}

To view logs or manage this workflow execution, please visit:
${actionUrl}

--
Simpler Life 100 Operations Team
https://simplerlife100.ctonew.app
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #0b0f19;
      color: #f1f5f9;
      margin: 0;
      padding: 20px;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #0f172a;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid #1e293b;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
    }
    .header {
      padding: 30px;
      text-align: center;
      background-color: #020617;
      border-bottom: 1px solid #1e293b;
    }
    .header h2 {
      margin: 0;
      color: #818cf8;
      font-weight: 900;
      font-size: 24px;
      letter-spacing: -0.025em;
    }
    .content {
      padding: 30px;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background-color: ${themeColor}1a;
      color: ${themeColor};
      border: 1px solid ${themeColor}33;
      padding: 8px 14px;
      border-radius: 9999px;
      font-weight: bold;
      font-size: 14px;
      margin-bottom: 20px;
    }
    .headline {
      font-size: 20px;
      font-weight: 700;
      margin-top: 0;
      margin-bottom: 12px;
      color: #f8fafc;
    }
    .message-box {
      font-size: 16px;
      line-height: 1.6;
      color: #cbd5e1;
      margin-bottom: 24px;
    }
    .btn {
      display: inline-block;
      background-color: #4f46e5;
      color: #ffffff !important;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: bold;
      font-size: 15px;
      text-align: center;
      border: 1px solid #6366f1;
      box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25);
    }
    .footer {
      padding: 24px;
      text-align: center;
      background-color: #020617;
      border-top: 1px solid #1e293b;
      font-size: 12px;
      color: #64748b;
    }
    .footer a {
      color: #818cf8;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>SIMPLER LIFE 100</h2>
    </div>
    <div class="content">
      <div class="status-badge">
        <span>${statusEmoji}</span>
        <span>${statusText}</span>
      </div>
      
      <h3 class="headline">Run complete: ${workflowName}</h3>
      
      <div class="message-box">
        <p>Dear ${recipientName},</p>
        <p>Your workflow <strong>${workflowName}</strong> has completed execution with the following outcome:</p>
        <blockquote style="border-left: 4px solid #4f46e5; margin: 16px 0; padding-left: 16px; font-style: italic; color: #94a3b8;">
          ${message}
        </blockquote>
      </div>

      ${detailsHtml}

      <div style="margin-top: 30px; text-align: center;">
        <a href="${actionUrl}" class="btn">${actionText}</a>
      </div>
    </div>
    <div class="footer">
      <p>This is an automated system email sent by Simpler Life 100.</p>
      <p>&copy; 2026 Simpler Life 100. All rights reserved.</p>
      <p><a href="https://simplerlife100.ctonew.app">Visit Website</a> | <a href="https://simplerlife100.ctonew.app/support">Support</a></p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return { subject, text, html };
}
