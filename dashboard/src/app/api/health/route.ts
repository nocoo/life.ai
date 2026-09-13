import { NextResponse } from "next/server";
import type { HealthResponse } from "@/models/health";
import { APP_VERSION } from "@/lib/version";

export async function GET(): Promise<NextResponse<HealthResponse>> {
  const response: HealthResponse = {
    status: "ok",
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
  };
  return NextResponse.json(response);
}
