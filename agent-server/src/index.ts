import express from "express";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// dotenv v17 不再自动注入 process.env，手动解析 .env
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env");
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  }
} catch { /* .env not found */ }

import cors from "cors";
import "./db";
import authRouter from "./routes/auth";
import historyRouter from "./routes/history";
import rentalRouter from "./routes/rental";

const app = express();
const port = process.env.PORT || "3900";

app.use(cors());
app.use(express.json({ limit: "50mb" }));  // 支持多张 Base64 图片同时上传
app.use(express.urlencoded({ extended: true }));

app.post("/api/heartbeat", (req, res) => {
  res.json({
    message: "服务端正常运行",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/auth", authRouter);
app.use("/api/history", historyRouter);
app.use("/api/rental", rentalRouter);

app.listen(port, () => {
  console.log(`当前服务端运行在: http://localhost:${port}`);
});
