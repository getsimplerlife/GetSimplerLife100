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
  status: text("status").notNull(), // 'pending' | 'in-progress' | 'completed' | 'implemented'
  results: text("results"), // JSON string
  deliverableUrl: text("deliverable_url"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const agentRuns = sqliteTable("agent_runs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  auditId: text("audit_id").references(() => audits.id),
  agentName: text("agent_name").notNull(),
  workflowKey: text("workflow_key").notNull(),
  inputData: text("input_data"), // JSON string of input params
  resultData: text("result_data"), // JSON string of workflow result
  status: text("status").notNull(), // 'success' | 'failed' | 'human_review'
  message: text("message"),
  feedback: text("feedback"), // Customer adjustment request
  feedbackResponse: text("feedback_response"), // Our response
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const agentFiles = sqliteTable("agent_files", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  agentName: text("agent_name").notNull(),
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  fileSize: integer("file_size").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
