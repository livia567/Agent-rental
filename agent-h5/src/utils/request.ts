import axios from "axios";
import type { SSEEvent } from "../types";

// 创建axios实例
const request = axios.create({
  baseURL: "http://localhost:3900/api",
  timeout: 120000,
  headers: {
    "Content-Type": "application/json",
  },
});

//请求拦截器
request.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('rental_token')
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  },
  (error) => Promise.reject(error),
);

//在收到401错误时调用，清除过期的登录状态
function clearExpiredAuth() {
  localStorage.removeItem('rental_token')
  localStorage.removeItem('rental_user')
}

//响应拦截器
request.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) clearExpiredAuth()
    return Promise.reject(error)
  },
);

export function post<T = any>(url: string, data?: Record<string, unknown>): Promise<T> {
  return request.post(url, data);
}

export function get<T = any>(url: string, params?: Record<string, unknown>): Promise<T> {
  return request.get(url, { params });
}

/**
 * 增强版流式请求，支持语义化Agent事件
 *
 * @param url         请求路径（拼接在 baseURL 后）
 * @param data        请求体
 * @param onEvent     统一事件回调，接收所有语义化SSE事件
 * @param onComplete  流正常结束回调
 * @param onError     异常回调
 * @returns           可用来取消请求的 AbortController
 */
export async function fetchStream(
  url: string,
  data: Record<string, unknown>,
  onEvent: (event: SSEEvent) => void,
  onComplete: (finalData?: unknown) => void,
  onError: (message: string) => void,
): Promise<AbortController> {
  const controller = new AbortController();

  try {
    const token = localStorage.getItem('rental_token')
    const response = await fetch(`http://localhost:3900/api/${url}`, {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: controller.signal,
    });

    if (response.status === 401) {
      clearExpiredAuth()
      onError('登录已过期，请重新登录')
      return controller
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;

        try {
          const jsonStr = line.substring(6);
          const jsonData = JSON.parse(jsonStr) as SSEEvent & { done?: string };

          // done 信号
          if (jsonData.done) {
            onComplete(jsonData.data);
            continue;
          }

          // 错误信号
          if (jsonData.type === "error") {
            onError(jsonData.message || "未知错误");
            continue;
          }

          // 正常事件：传给统一回调
          onEvent(jsonData);
        } catch {
          // 非JSON行，跳过
          console.warn("跳过无法解析的SSE行:", line);
        }
      }
    }

    return controller;
  } catch (err: any) {
    // 主动取消（AbortController.abort）不是错误，静默返回，避免误触发错误提示
    if (err?.name === "AbortError") return controller;
    onError(err.message || "网络请求失败");
    return controller;
  }
}
