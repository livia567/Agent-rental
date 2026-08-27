import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const analysisRecords = sqliteTable("analysis_records", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  contractText: text("contract_text").notNull(),
  status: text("status").notNull(),
  resultJson: text("result_json"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
