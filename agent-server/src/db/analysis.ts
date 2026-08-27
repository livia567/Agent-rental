import { and, desc, eq } from "drizzle-orm";
import { db } from "./index";
import { analysisRecords } from "./schema";

export type AnalysisStatus = "running" | "waiting_confirm" | "processing" | "done" | "error" | "expired";

export function createAnalysis(id: string, userId: number, contractText: string) {
  const now = new Date();
  db.insert(analysisRecords).values({
    id, userId, contractText, status: "running", createdAt: now, updatedAt: now,
  }).run();
}

export function updateAnalysis(id: string, userId: number, status: AnalysisStatus, result?: unknown) {
  db.update(analysisRecords)
    .set({ status, resultJson: result ? JSON.stringify(result) : undefined, updatedAt: new Date() })
    .where(and(eq(analysisRecords.id, id), eq(analysisRecords.userId, userId)))
    .run();
}

export function findOwnedAnalysis(id: string, userId: number) {
  return db.select().from(analysisRecords)
    .where(and(eq(analysisRecords.id, id), eq(analysisRecords.userId, userId)))
    .get();
}

export function listCompletedAnalyses(userId: number) {
  return db.select({
    id: analysisRecords.id,
    contractText: analysisRecords.contractText,
    resultJson: analysisRecords.resultJson,
    createdAt: analysisRecords.createdAt,
  }).from(analysisRecords)
    .where(and(eq(analysisRecords.userId, userId), eq(analysisRecords.status, "done")))
    .orderBy(desc(analysisRecords.createdAt))
    .all();
}
