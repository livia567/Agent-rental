// src/schemas/index.ts
// Agent 输出的运行时契约：既用于 API 层约束（response_format），也用于运行时校验

import { z } from "zod";

const RiskLevel = z.enum(["high", "medium", "low"]);

/** Agent 0: 意图识别 */
export const ClassificationSchema = z.object({
  category: z.enum(["contract", "invalid"]),
  reason: z.string(),
});

/** Agent 1: 条款拆分 */
export const ClauseListSchema = z.object({
  clauses: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        // 小模型退化时会吐出截断/空白/单字原文，这里兜底拦截
        originalText: z.string().trim().min(8, "条款原文过短，疑似模型输出被截断"),
        clauseType: z.enum([
          "rent", "deposit", "payment", "termination", "repair", "utility", "other",
        ]),
      })
    )
    .min(1),
});

/** Agent 2: 单条款风险（每个 worker 一次调用） */
export const SingleRiskSchema = z.object({
  clauseId: z.string(),
  riskLevel: RiskLevel,
  suggestion: z.string().min(1),
});

/** Agent 3: 单条谈判话术（每个高/中风险条款一个 worker） */
export const SingleNegotiationTipSchema = z.object({
  clauseId: z.string().trim().min(1),
  clauseTitle: z.string().trim().min(1),
  riskLevel: RiskLevel,
  script: z.string().trim().min(1),
});

/** Agent 4: 终审报告 */
export const FinalReportSchema = z.object({
  overallScore: z.number().min(0).max(100),
  verdict: z.enum(["recommend", "cautious", "reject"]),
  verdictReason: z.string().min(1),
  summary: z.string().min(1),
  highlights: z.array(z.string()),
  riskSummary: z.object({
    high: z.number().int().min(0),
    medium: z.number().int().min(0),
    low: z.number().int().min(0),
  }),
});

/** 把 zod 校验错误压成可回灌给模型的一句话 */
export function formatIssues(err: z.ZodError): string {
  return err.issues
    .map((i) => `${i.path.join(".") || "根对象"}: ${i.message}`)
    .join("；");
}
