import { NextResponse } from "next/server";
import { StorageService, type StorageStats } from "@/services/storage-service";

export type StorageResponse =
  | { success: true; data: StorageStats }
  | { success: false; error: string };

export async function GET(): Promise<NextResponse<StorageResponse>> {
  try {
    const service = new StorageService();
    const data = service.getStorageStats();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
