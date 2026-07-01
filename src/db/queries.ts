import { createServerFn } from "@tanstack/react-start";
import { db } from "./index";
import { users, audits } from "./schema";
import { eq, and } from "drizzle-orm";
import { hashPassword, verifyPassword, createSessionToken, verifySessionToken } from "./auth";
import { setCookie, getCookie, deleteCookie, getEvent } from "vinxi/http";

// Internal logic that doesn't rely on being called as a server function
async function getUserInternal() {
  let event;
  try {
    event = getEvent();
  } catch (err) {
    // If getEvent fails, we're likely not in a request context
    return null;
  }
  
  const token = getCookie(event, "session");
  if (!token) return null;

  const userId = await verifySessionToken(token);
  if (!userId) return null;

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) return null;

  return { id: user.id, email: user.email };
}

export const register = createServerFn()
  .validator((data: any) => data)
  .handler(async ({ data }) => {
    const { email, password } = data;
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existingUser) {
      throw new Error("Account already exists, please login");
    }

    const hashedPassword = await hashPassword(password);
    const userId = crypto.randomUUID();

    await db.insert(users).values({
      id: userId,
      email,
      password: hashedPassword,
      createdAt: new Date(),
    });

    const token = await createSessionToken(userId);
    setCookie(getEvent(), "session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 2, // 2 hours
      path: "/",
    });

    return { success: true };
  });

export const login = createServerFn()
  .validator((data: any) => data)
  .handler(async ({ data }) => {
    const { email, password } = data;
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user || !(await verifyPassword(password, user.password))) {
      throw new Error("Invalid email or password");
    }

    const token = await createSessionToken(user.id);
    setCookie(getEvent(), "session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 2, // 2 hours
      path: "/",
    });

    return { success: true };
  });

export const logout = createServerFn().handler(async () => {
  deleteCookie(getEvent(), "session", { path: "/" });
  return { success: true };
});

export const checkUserExists = createServerFn()
  .validator((email: string) => email)
  .handler(async ({ data: email }) => {
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    return {
      exists: !!user,
      needsPasswordReset: user?.needsPasswordReset || false,
    };
  });

export const setPassword = createServerFn()
  .validator((data: any) => data)
  .handler(async ({ data }) => {
    const { email, password } = data;
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      throw new Error("User not found");
    }

    if (!user.needsPasswordReset) {
      throw new Error("Password already set. Use login or forgot password flow.");
    }

    const hashedPassword = await hashPassword(password);

    await db
      .update(users)
      .set({
        password: hashedPassword,
        needsPasswordReset: false,
      })
      .where(eq(users.email, email));

    return { success: true };
  });

export const getUser = createServerFn().handler(async () => {
  return getUserInternal();
});

export const getAudits = createServerFn().handler(async () => {
  const user = await getUserInternal();
  if (!user) throw new Error("Unauthorized");

  return db.query.audits.findMany({
    where: eq(audits.userId, user.id),
    orderBy: (audits, { desc }) => [desc(audits.createdAt)],
  });
});

export const getAudit = createServerFn()
  .validator((auditId: string) => auditId)
  .handler(async ({ data: auditId }) => {
    const user = await getUserInternal();
    if (!user) throw new Error("Unauthorized");

    const audit = await db.query.audits.findFirst({
      where: and(eq(audits.id, auditId), eq(audits.userId, user.id)),
    });

    if (!audit) throw new Error("Audit not found");

    return audit;
  });

export const submitLead = createServerFn()
  .validator((data: any) => data)
  .handler(async ({ data }) => {
    const fs = await import("node:fs/promises");
    const leadData = JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        ...data,
      },
      null,
      2
    );
    await fs.appendFile("/home/team/shared/leads.json", leadData + ",\n");
    return { success: true };
  });

export async function createAuditForEmailInternal(email: string, type: string) {
  let user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user) {
    const userId = crypto.randomUUID();
    // Generate a random password hash that won't match anything
    const randomPassword = crypto.randomUUID();
    const hashedPassword = await hashPassword(randomPassword);

    await db.insert(users).values({
      id: userId,
      email,
      password: hashedPassword,
      createdAt: new Date(),
      needsPasswordReset: true,
    });

    user = { id: userId, email } as any;
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

  return { success: true, auditId };
}

export const createAuditForEmail = createServerFn()
  .validator((data: { email: string; type: string }) => data)
  .handler(async ({ data }) => {
    return createAuditForEmailInternal(data.email, data.type);
  });

export const updateAuditResults = createServerFn()
  .validator((data: { auditId: string; results: string; status: string }) => data)
  .handler(async ({ data }) => {
    const { auditId, results, status } = data;
    const user = await getUserInternal();
    if (!user) throw new Error("Unauthorized");

    await db
      .update(audits)
      .set({
        results,
        status,
        updatedAt: new Date(),
      })
      .where(eq(audits.id, auditId));

    return { success: true };
  });
