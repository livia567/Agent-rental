// src/agents/ocrExtractor.ts

import * as tencentcloud from "tencentcloud-sdk-nodejs-ocr";
import type { OCRResult } from "../types";

const OcrClient = tencentcloud.ocr.v20181119.Client;

/**
 * 调用腾讯云 OCR 识别合同图片
 * @param imageBase64  图片的 Base64 编码（去掉 data:image/xxx;base64, 前缀）
 * @returns 识别出的文字内容
 */
export async function extractTextFromImage(imageBase64: string): Promise<OCRResult> {
  const client = new OcrClient({
    credential: {
      secretId: process.env.TENCENT_SECRET_ID!,
      secretKey: process.env.TENCENT_SECRET_KEY!,
    },
    region: "ap-guangzhou",
  });

  try {
    // 使用通用印刷体识别（GeneralAccurateOCR），适合合同文档
    const response = await client.GeneralAccurateOCR({
      ImageBase64: imageBase64,
    });

    const detections = response.TextDetections
    const text = detections
      ?.map((item) => item.DetectedText)
      .join("\n") || "";

    if (!text.trim()) {
      return { success: false, text: "", error: "图片中未识别到文字" };
    }

    return {
      success: true,
      text,
      confidence: detections
        ? Math.round(
            detections.reduce((sum, item) => sum + (item.Confidence || 0), 0) /
              detections.length
          )
        : 0,
    };
  } catch (err: any) {
    return {
      success: false,
      text: "",
      error: `OCR识别失败：${err.message || "未知错误"}`,
    };
  }
}
