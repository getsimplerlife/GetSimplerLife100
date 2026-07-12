import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  needsPasswordReset: integer("needs_password_reset", { mode: "boolean" }).notNull().default(false),
});

export const audits = sqliteTable("audits", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  type: text("type").notNull(), // 'QuickScan' | 'DeepAudit'
  status: text("status").notNull(), // 'pending' | 'in-progress' | 'completed'
  results: text("results"), // JSON string
  deliverableUrl: text("deliverable_url"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const integrations = sqliteTable("integrations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  provider: text("provider").notNull(),
  displayName: text("display_name").notNull(),
  config: text("config").notNull(), // JSON: { access_token, refresh_token, instance_url, scope, expires_at }
  status: text("status").notNull().default("active"), // 'active' | 'expired' | 'error' | 'pending'
  healthAt: integer("health_at", { mode: "timestamp" }),
  errorMsg: text("error_msg"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const providerCredentials = sqliteTable("provider_credentials", {
  provider: text("provider").primaryKey(),
  clientId: text("client_id").notNull(),
  clientSecret: text("client_secret").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
