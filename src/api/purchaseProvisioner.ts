import { db } from "../db/index";
import { users } from "../db/schema";
import { deployAgent } from "../agents/index";
import { sendEmail } from "../integrations/email";
import { hashPassword } from "../db/auth";
import { eq, sql } from "drizzle-orm";
import { logAuditEvent } from "./auditLogs";

// Mappings for Product Name/ID/Tier to AI agent type
export const PRODUCT_TO_AGENT_MAP: Record<string, string> = {
  "Document AI System": "document_intake",
  "AI Customer Support Agent": "document_intake", // mapped to document_intake for now
  "Additional AI Agent": "document_intake",      // mapped to document_intake for now
};

export interface ProvisionInput {
  email: string;
  productName: string;
  amount: number;
}

export interface ProvisionResult {
  success: boolean;
  userId: string;
  isNewUser: boolean;
  agentInstanceId?: string;
  error?: string;
}

/**
 * Handles purchase provisioning flow:
 * - Maps product to agent type.
 * - Creates user account if it doesn't exist (with a temp password).
 * - Deploys the purchased agent instance for the customer via `deployAgent()`.
 * - Stores purchase record in portal_data (section: 'purchases').
 * - Sends onboarding email with login credentials.
 * - Notifies the owner via email about the new customer.
 */
export async function provisionPurchase(input: ProvisionInput): Promise<ProvisionResult> {
  const { email, productName, amount } = input;
  console.log(`[purchaseProvisioner] Provisioning purchase for ${email}. Product: "${productName}". Amount: $${amount}`);

  try {
    // 1. Map product to AI agent type
    let agentType = "document_intake"; // default
    for (const [prod, type] of Object.entries(PRODUCT_TO_AGENT_MAP)) {
      if (productName.toLowerCase().includes(prod.toLowerCase()) || prod.toLowerCase().includes(productName.toLowerCase())) {
        agentType = type;
        break;
      }
    }

    // 2. Create/update user in database if they don't have one
    let user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    let isNewUser = false;
    let tempPassword = "";
    let userId = "";

    if (!user) {
      isNewUser = true;
      userId = crypto.randomUUID();
      tempPassword = `Simpler-${Math.random().toString(36).slice(-8)}`;
      const hashedPassword = await hashPassword(tempPassword);

      await db.insert(users).values({
        id: userId,
        email,
        password: hashedPassword,
        createdAt: new Date(),
        needsPasswordReset: true, // Mark that they should reset their password on first login
      });

      console.log(`[purchaseProvisioner] Created new user with ID: ${userId} and temp password: ${tempPassword}`);
      
      await logAuditEvent({
        userId,
        userEmail: email,
        action: "register_auto",
        resource: "user_account",
        status: "success",
        details: { email, provisionedFor: productName },
      });
    } else {
      userId = user.id;
      console.log(`[purchaseProvisioner] Existing user found with ID: ${userId}`);
    }

    // 3. Deploy the purchased agent instance via the agent runtime
    let agentInstanceId = "";
    try {
      const agentInstance = await deployAgent(userId, agentType, productName);
      agentInstanceId = agentInstance.id;
      console.log(`[purchaseProvisioner] Deployed agent "${productName}" (ID: ${agentInstanceId}) for user ${userId}`);
    } catch (deployErr: any) {
      console.error("[purchaseProvisioner] Failed to deploy agent:", deployErr);
      // We still want to proceed so the user gets created and purchase is stored
    }

    // 4. Store purchase record in portal_data (section: 'purchases')
    const purchaseId = crypto.randomUUID();
    const purchaseRecord = {
      id: purchaseId,
      email,
      productName,
      amount,
      agentType,
      agentId: agentInstanceId,
      createdAt: Date.now(),
    };

    await db.run(
      sql.raw(
        `INSERT INTO portal_data (id, user_id, section, data, created_at, updated_at) VALUES ('${purchaseId}', '${userId}', 'purchases', '${JSON.stringify(purchaseRecord).replace(/'/g, "''")}', ${Date.now()}, ${Date.now()})`
      )
    );

    // 5. Send onboarding email to the customer
    const portalUrl = "https://simplerlife100.ctonew.app/portal";
    let onboardingSubject = `Welcome to Simpler Life 100! Your AI Employee ${productName} is Ready`;
    let onboardingBodyHtml = "";
    let onboardingBodyText = "";

    if (isNewUser) {
      onboardingBodyText = `
Hello,

Thank you for purchasing "${productName}" from Simpler Life 100!

We have successfully provisioned your new AI employee.

Your temporary login credentials for the Operations Portal are:
Portal Link: ${portalUrl}
Email: ${email}
Temporary Password: ${tempPassword}

(Please reset your password upon first login.)

If you have any questions, feel free to reply to this email.

Best regards,
Simpler Life 100 Operations Team
      `.trim();

      onboardingBodyHtml = `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0f172a; color: #f1f5f9; border-radius: 8px;">
  <h2 style="color: #38bdf8; margin-top: 0;">Welcome to Simpler Life 100!</h2>
  <p>Thank you for purchasing the <strong>${productName}</strong> AI employee!</p>
  <p>We've set up your account and deployed your new AI agent. It's ready to handle tasks in your portal.</p>
  
  <div style="background-color: #1e293b; border: 1px solid #334155; border-radius: 6px; padding: 15px; margin: 20px 0;">
    <h3 style="color: #94a3b8; margin: 0 0 10px 0; font-size: 14px; text-transform: uppercase;">Your Login Credentials</h3>
    <p style="margin: 5px 0;"><strong>Portal URL:</strong> <a href="${portalUrl}" style="color: #38bdf8;">${portalUrl}</a></p>
    <p style="margin: 5px 0;"><strong>Username / Email:</strong> ${email}</p>
    <p style="margin: 5px 0;"><strong>Temporary Password:</strong> <code style="background-color: #0f172a; padding: 2px 6px; border-radius: 4px; font-weight: bold; color: #38bdf8;">${tempPassword}</code></p>
  </div>
  
  <p style="font-size: 13px; color: #94a3b8;">* Please reset your temporary password after logging in for the first time.</p>
  
  <p>If you have any questions or need help with custom configurations, please reply directly to this email.</p>
  <hr style="border: 0; border-top: 1px solid #334155; margin: 20px 0;" />
  <p style="font-size: 12px; color: #64748b;">Simpler Life 100 Operations Team | <a href="https://simplerlife100.ctonew.app" style="color: #64748b;">simplerlife100.ctonew.app</a></p>
</div>
      `.trim();
    } else {
      onboardingBodyText = `
Hello,

Thank you for your purchase of "${productName}" from Simpler Life 100!

We have successfully provisioned and deployed this new AI employee in your existing Operations Portal.

You can log in and manage your new employee at any time:
Portal Link: ${portalUrl}
Email: ${email}

Best regards,
Simpler Life 100 Operations Team
      `.trim();

      onboardingBodyHtml = `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0f172a; color: #f1f5f9; border-radius: 8px;">
  <h2 style="color: #38bdf8; margin-top: 0;">Your New AI Employee is Deployed!</h2>
  <p>Thank you for your purchase of the <strong>${productName}</strong> AI employee!</p>
  <p>Since you already have a Simpler Life 100 account, we have successfully added and deployed this new agent to your existing portal.</p>
  
  <div style="background-color: #1e293b; border: 1px solid #334155; border-radius: 6px; padding: 15px; margin: 20px 0;">
    <p style="margin: 0;">Access your updated portal here: <a href="${portalUrl}" style="color: #38bdf8; font-weight: bold;">${portalUrl}</a></p>
  </div>
  
  <p>If you have any questions or need custom workflow integrations, please reply directly to this email.</p>
  <hr style="border: 0; border-top: 1px solid #334155; margin: 20px 0;" />
  <p style="font-size: 12px; color: #64748b;">Simpler Life 100 Operations Team | <a href="https://simplerlife100.ctonew.app" style="color: #64748b;">simplerlife100.ctonew.app</a></p>
</div>
      `.trim();
    }

    await sendEmail({
      to: email,
      subject: onboardingSubject,
      text: onboardingBodyText,
      html: onboardingBodyHtml,
    });

    // 6. Notify the owner via email about the new customer
    const ownerEmail = "owner@simplerlife100.ctonew.app";
    const ownerSubject = `[New Sale] $${amount} - ${productName} purchased by ${email}`;
    const ownerBodyText = `
Hello Admin,

A new purchase has been processed!

Customer Email: ${email}
Product: ${productName}
Amount: $${amount}
Agent Deployed: ${agentType} (ID: ${agentInstanceId})
User Status: ${isNewUser ? "New User Created" : "Existing User Updated"}

Portal Log: https://simplerlife100.ctonew.app/portal

Best,
Simpler Life 100 Provisioner Bot
    `.trim();

    await sendEmail({
      to: ownerEmail,
      subject: ownerSubject,
      text: ownerBodyText,
    }).catch(err => console.error("[purchaseProvisioner] Failed to notify owner:", err));

    return {
      success: true,
      userId,
      isNewUser,
      agentInstanceId,
    };
  } catch (err: any) {
    console.error("[purchaseProvisioner] Critical error during provisioning:", err);
    return {
      success: false,
      userId: "",
      isNewUser: false,
      error: err.message,
    };
  }
}
