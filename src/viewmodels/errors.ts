import { isAbortError, isApiError } from "../services/http";

export type LoadStatus = "idle" | "loading" | "ready" | "error";

export const GENERIC_ERROR_MESSAGE = "请求失败，请重试。";

export function isAuthFailure(error: unknown): boolean {
	return isApiError(error) && (error.status === 401 || error.status === 403);
}

export function toErrorMessage(error: unknown): string {
	if (isAbortError(error)) {
		return "已取消";
	}
	if (isApiError(error)) {
		return error.message;
	}
	if (error instanceof TypeError) {
		return "无法连接服务器，请重试。";
	}
	if (error instanceof Error && error.message.trim()) {
		return error.message;
	}
	return GENERIC_ERROR_MESSAGE;
}
