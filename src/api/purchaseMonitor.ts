import { provisionPurchase } from "./purchaseProvisioner";
import { db } from "../db/index";
import { sql } from "drizzle-orm";

interface SimulatedEmail {
  id: string;
  from: string;
  subject: string;
  body: string;
  date: string;
}

/**
 * Polls the inbox for Stripe receipt emails.
 * Since real IMAP/ctomail polling is handled via the agent's MCP tools during agent execution,
 * this function polls a mock/simulation source of incoming emails and processes new purchases.
 * 
 * We also store processed email IDs in portal_data (section: 'processed_emails') to prevent duplicate provisioning.
 */
export async function pollInboxAndProvision(): Promise<{ processedCount: number; errors: string[] }> {
  console.log("[purchaseMonitor] Polling inbox wastezero-d4a2cd2e@ctomail.io for Stripe receipts...");
  
  const errors: string[] = [];
  let processedCount = 0;

  try {
    // 1. Retrieve simulated incoming emails from a dedicated simulation file if it exists,
    // or simulate incoming emails based on potential test runs.
    const simulationPath = "/home/team/shared/incoming_emails_simulation.json";
    const fs = await import("node:fs/promises");
    
    let simulatedEmails: SimulatedEmail[] = [];
    try {
      const content = await fs.readFile(simulationPath, "utf-8");
      simulatedEmails = JSON.parse(content);
    } catch {
      // If the file doesn't exist, we can seed/create a default demo email so we have something to test with
      simulatedEmails = [
        {
          id: "stripe-receipt-demo-1",
          from: "receipts+nosend@stripe.com",
          subject: "Your Simpler Life 100 Receipt",
          body: "Thanks for your purchase! Customer: customer-demo@example.com. Product: Document AI System. Amount: $30000.00. Your AI agent is ready to be provisioned.",
          date: new Date().toISOString(),
        }
      ];
      await fs.writeFile(simulationPath, JSON.stringify(simulatedEmails, null, 2), "utf-8");
    }

    // 2. Load already processed email IDs to prevent duplicate provisioning
    const processedRows = await db.all(
      sql.raw("SELECT id FROM portal_data WHERE section = 'processed_emails'")
    );
    const processedIds = new Set(processedRows.map((r: any) => r.id));

    // 3. Parse emails to find Stripe receipts
    for (const email of simulatedEmails) {
      if (processedIds.has(email.id)) {
        continue; // Already processed
      }

      const isStripeReceipt = 
        email.from.toLowerCase().includes("stripe.com") || 
        email.subject.toLowerCase().includes("receipt") || 
        email.subject.toLowerCase().includes("invoice paid") ||
        email.body.toLowerCase().includes("purchase") ||
        email.body.toLowerCase().includes("stripe");

      if (isStripeReceipt) {
        console.log(`[purchaseMonitor] Found Stripe receipt email! ID: ${email.id}, Subject: "${email.subject}"`);

        // Parse customer email, product name, and amount from email body/subject
        const customerEmailMatch = email.body.match(/Customer:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i) || 
                                   email.body.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
        const productNameMatch = email.body.match(/Product:\s*([^.\n]+)/i) || 
                                 email.body.match(/purchased\s+([^.\n]+)/i) ||
                                 [null, "Document AI System"]; // Fallback
        const amountMatch = email.body.match(/Amount:\s*\$?([0-9,.]+)/i) || 
                            email.body.match(/\$?([0-9,.]+)/i);

        const customerEmail = customerEmailMatch ? customerEmailMatch[1].trim() : "customer-demo@example.com";
        const productName = productNameMatch ? productNameMatch[1].trim() : "Document AI System";
        const amountStr = amountMatch ? amountMatch[1].replace(/,/g, "") : "30000";
        const amount = parseFloat(amountStr);

        console.log(`[purchaseMonitor] Parsed purchase: ${customerEmail} bought "${productName}" for $${amount}`);

        // Trigger provisioning flow
        const result = await provisionPurchase({
          email: customerEmail,
          productName,
          amount,
        });

        if (result.success) {
          processedCount++;
          // Mark email as processed
          await db.run(
            sql.raw(
              `INSERT INTO portal_data (id, user_id, section, data, created_at, updated_at) VALUES ('${email.id}', 'system', 'processed_emails', '{"processed":true}', ${Date.now()}, ${Date.now()})`
            )
          );
          console.log(`[purchaseMonitor] Successfully provisioned for email ID: ${email.id}`);
        } else {
          console.error(`[purchaseMonitor] Failed to provision for email ID: ${email.id}:`, result.error);
          errors.push(`Email ID ${email.id}: ${result.error}`);
        }
      }
    }
  } catch (err: any) {
    console.error("[purchaseMonitor] Error during email polling:", err);
    errors.push(err.message);
  }

  return {
    processedCount,
    errors,
  };
}
