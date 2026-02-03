/**
 * Health API 响应类型
 */
export interface HealthResponse {
  status: "ok" | "error";
  timestamp: string;
  version: string;
}

/**
 * Health 状态（用于 ViewModel）
 */
export interface HealthState {
  status: HealthResponse["status"] | "unknown";
  lastChecked: string | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * 创建初始 Health 状态
 */
export function createInitialHealthState(): HealthState {
  return {
    status: "unknown",
    lastChecked: null,
    isLoading: false,
    error: null,
  };
}

/**
 * 验证 HealthResponse 结构
 */
export function isValidHealthResponse(data: unknown): data is HealthResponse {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const obj = data as Record<string, unknown>;
  return (
    (obj.status === "ok" || obj.status === "error") &&
    typeof obj.timestamp === "string" &&
    typeof obj.version === "string"
  );
}
