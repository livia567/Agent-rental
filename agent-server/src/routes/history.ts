import express from "express";
import { findOwnedAnalysis, listCompletedAnalyses } from "../db/analysis";
import { requireAuth } from "../middleware/auth";

const router = express.Router();
router.use(requireAuth);

router.get("/", (req, res) => {
  const records = listCompletedAnalyses(req.user.userId).map((r) => {
    const result = r.resultJson ? JSON.parse(r.resultJson) : null;
    return {
      id: r.id,
      contractPreview: r.contractText.replace(/\s+/g, " ").slice(0, 48),
      createdAt: r.createdAt,
      finalReport: result?.finalReport ?? null,
    };
  });
  res.json({ success: true, data: records });
});

router.get("/:id", (req, res) => {
  const record = findOwnedAnalysis(req.params.id, req.user.userId);
  if (!record || record.status !== "done" || !record.resultJson) {
    return res.status(404).json({ success: false, error: "历史记录不存在" });
  }
  res.json({ success: true, data: JSON.parse(record.resultJson) });
});

export default router;
