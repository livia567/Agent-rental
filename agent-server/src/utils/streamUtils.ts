import { Response } from "express";
import { SSEEvent } from "../types";

interface StreamResponse {
  /** 发送通用SSE事件 */
  send: (data: Record<string, unknown>) => void;
  /** 发送语义化Agent事件 */
  sendAgentEvent: (event: SSEEvent) => void;
  /** 正常关闭流 */
  end: () => void;
  /** 错误关闭流 */
  error: (message: string) => void;
}

export const createStreamResponse = (res: Response): StreamResponse => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // send方法只是封装了一下res.write（因为流式接口只能用res.write，数据要以data:开头）
  const send = (data: Record<string, unknown>): void => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (err) {
      console.error("发送流式数据失败:", err);
    }
  };

  return {
    send,

    sendAgentEvent: (event: SSEEvent): void => {
      send(event as unknown as Record<string, unknown>);
    },

    end: (): void => {
      try {
        send({ done: true });
        res.end();
      } catch (err) {
        console.error("结束流式响应失败:", err);
      }
    },

    error: (message: string): void => {
      try {
        send({ type: "error", message });
        res.end();
      } catch (err) {
        console.error("流式数据错误:", err);
      }
    },
  };
};
