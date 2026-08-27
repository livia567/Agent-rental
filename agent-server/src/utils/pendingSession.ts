import { Response } from "express";

interface PendingSession { //待处理会话的格式
  res: Response;
  timer: ReturnType<typeof setTimeout>;
  onExpire: (threadId: string) => void; //过期执行的回调
}

const sessions = new Map<string, PendingSession>(); //存储待处理会话

//注册等待确认函数
export function registerWaitingConfirm(
  threadId: string,
  res: Response,
  onExpire: (threadId: string) => void,
  timeoutMinutes = 5
): void {
  closeWaitingConfirm(threadId); //清理旧的‘等待确认’，用户可能重新分析之后再次重新分析

  const timer = setTimeout(() => {
    expireWaitingConfirm(threadId);
  }, timeoutMinutes * 60 * 1000);

  sessions.set(threadId, { res, timer, onExpire }); //把要清理的东西存起来
}

//清理旧的等待确认函数
export function closeWaitingConfirm(threadId: string): void {
  const session = sessions.get(threadId);
  if (!session) return;
  clearTimeout(session.timer);
  try { session.res.end(); } catch { /* 客户端可能已经断开连接了 */ }
  sessions.delete(threadId); //最后删会话，顺序不能变
}

//过期等待确认函数
export function expireWaitingConfirm(threadId: string): void {
  const session = sessions.get(threadId);
  if (!session) return;
  clearTimeout(session.timer);
  try {
    session.res.write(
      `data: ${JSON.stringify({ type: "error", message: "确认超时，请重新提交合同" })}\n\n`
    );
    session.res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    session.res.end();
  } catch { /* 客户端可能已断开 */ }
  session.onExpire(threadId);
  sessions.delete(threadId);
}
