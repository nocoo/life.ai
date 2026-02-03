import type { HealthResponse } from "@/models/health";
import { isValidHealthResponse } from "@/models/health";

/**
 * 获取健康检查状态
 * @param baseUrl 可选的基础 URL（用于测试）
 */
export async function fetchHealth(baseUrl = ""): Promise<HealthResponse> {
  const res = await fetch(`${baseUrl}/api/health`);
  if (!res.ok) {
    throw new Error(`Health check failed: ${res.status}`);
  }
  const data: unknown = await res.json();
  if (!isValidHealthResponse(data)) {
    throw new Error("Invalid health response format");
  }
  return data;
}
