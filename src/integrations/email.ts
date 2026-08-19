import nodemailer from "nodemailer"; // we can use nodemailer, it is standard and works perfectly in Bun, but let's write a highly resilient wrapper

// SMTP Configuration
const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_SECURE = process.env.SMTP_SECURE === "true" || SMTP_PORT === 465;
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || "Simpler Life 100 <notifications@simplerlife100.ctonew.app>";

export interface EmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
}

export interface EmailResult {
  success: boolean;
  messageId: string;
  isMock: boolean;
  recipient: string | string[];
  /** Present only on failure (fail-closed paths return success:false instead of throwing). */
  error?: string;
}

/**
 * Sends an email. Precedence (#233):
 *   1. SendGrid (HTTP POST /v3/mail/send) when SENDGRID_API_KEY is set —
 *      this is the LIVE path today (SENDGRID_API_KEY + SMTP_FROM configured,
 *      no SMTP_*), so owner reconnect alerts now deliver for real.
 *   2. nodemailer SMTP when SMTP_HOST/USER/PASS are set (unchanged behavior).
 *   3. Mock/simulation logger (unchanged fallback) — never claims delivery.
 * SendGrid was chosen above SMTP because the verified, working credential in
 * the live environment is the SendGrid key (mail.send scope confirmed), while
 * SMTP_* is unset everywhere; SMTP remains for deployments that configure it.
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  const { to, subject, text, html } = options;
  const sendgridKey = process.env.SENDGRID_API_KEY || "";

  if (sendgridKey) {
    return sendViaSendGrid({ to, subject, text, html, apiKey: sendgridKey });
  }

  // If no SMTP configured, fallback to Mock/Simulation mode
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    const debugPath = "/home/team/shared/sent_emails_debug.json";
    const debugEmail = {
      timestamp: new Date().toISOString(),
      to,
      subject,
      text,
      html,
      smtpConfig: {
        host: SMTP_HOST || "none",
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
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

    console.log(`[Email Mock] SMTP not configured. Simulated sending to ${to}:`);
    console.log(`Subject: ${subject}`);
    return {
      success: true,
      messageId: `mock-${crypto.randomUUID()}`,
      isMock: true,
      recipient: to,
    };
  }

  // Real SMTP Send
  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });

    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to,
      subject,
      text,
      html,
    });

    console.log(`[Email SMTP] Sent email to ${to}. MessageID: ${info.messageId}`);
    return {
      success: true,
      messageId: info.messageId,
      isMock: false,
      recipient: to,
    };
  } catch (err: any) {
    console.error("[Email SMTP] Send failed:", err);
    throw new Error(`SMTP Send Failure: ${err.message}`);
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
  const from = parseFromAddress(process.env.SMTP_FROM || SMTP_FROM);
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
        subject: opts.subject,
        content,
      }),
    });
    if (response.status === 202) {
      // SendGrid returns 202 Accepted; the message id is in the X-Message-Id
      // header when the API exposes it (body is empty).
      const messageId = response.headers?.get("x-message-id") || `sg-${crypto.randomUUID()}`;
      console.log(`[Email SendGrid] Sent email to ${opts.to}. MessageID: ${messageId}`);
      return { success: true, messageId, isMock: false, recipient: opts.to };
    }
    const errText = await response.text().catch(() => "");
    console.error(`[Email SendGrid] Send failed: HTTP ${response.status}: ${errText.slice(0, 500)}`);
    return {
      success: false,
      messageId: "",
      isMock: false,
      recipient: opts.to,
      error: `SendGrid HTTP ${response.status}: ${errText}`,
    };
  } catch (err: any) {
    console.error("[Email SendGrid] Send failed:", err);
    return {
      success: false,
      messageId: "",
      isMock: false,
      recipient: opts.to,
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

Your AI Employee "${agentName}" has completed a run for the workflow "${workflowName}".

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
        <p>Your AI Employee <strong>${agentName}</strong> has completed execution of the workflow <strong>${workflowName}</strong> with the following outcome:</p>
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
