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
      throw new Error("User already exists");
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
