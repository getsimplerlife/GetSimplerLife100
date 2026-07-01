import { db } from "../src/db";
import { users, audits } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "../src/db/auth";

async function test() {
  const email = "test-purchase-direct@example.com";
  const type = "QuickScan";
  
  console.log("Testing database logic directly...");
  try {
    let user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      console.log("User not found, creating...");
      const userId = crypto.randomUUID();
      const hashedPassword = await hashPassword(crypto.randomUUID());

      await db.insert(users).values({
        id: userId,
        email,
        password: hashedPassword,
        createdAt: new Date(),
        needsPasswordReset: true,
      });

      user = { id: userId, email } as any;
    } else {
      console.log("User found:", user.id);
    }

    const auditId = crypto.randomUUID();
    await db.insert(audits).values({
      id: auditId,
      userId: user!.id,
      type,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    console.log("Success! Audit created:", auditId);
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
