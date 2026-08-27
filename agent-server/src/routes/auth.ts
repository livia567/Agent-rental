import express from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import { signToken } from "../middleware/auth";

const router = express.Router();

function valid(username: unknown, password: unknown): username is string {
  return typeof username === "string" && /^[a-zA-Z0-9_]{3,32}$/.test(username)
    && typeof password === "string" && password.length >= 6 && password.length <= 72;
}

function reply(user: { id: number; username: string }, res: express.Response) {
  res.json({ token: signToken({ userId: user.id, username: user.username }), user });
}

router.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (!valid(username, password)) {
    return res.status(400).json({ success: false, error: "用户名为3-32位字母、数字或下划线，密码至少6位" });
  }

  const exists = db.select().from(users).where(eq(users.username, username)).get();
  if (exists) return res.status(409).json({ success: false, error: "用户名已存在" });

  const passwordHash = await bcrypt.hash(password, 12);
  const result = db.insert(users).values({ username, passwordHash, createdAt: new Date() }).run();
  reply({ id: Number(result.lastInsertRowid), username }, res);
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ success: false, error: "请输入用户名和密码" });
  }

  const user = db.select().from(users).where(eq(users.username, username)).get();
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ success: false, error: "用户名或密码错误" });
  }

  reply({ id: user.id, username: user.username }, res);
});

export default router;
