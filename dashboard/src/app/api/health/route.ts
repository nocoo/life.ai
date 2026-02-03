import { NextResponse } from "next/server";
import type { HealthResponse } from "@/models/health";

export async function GET(): Promise<NextResponse<HealthResponse>> {
  const response: HealthResponse = {
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  };
  return NextResponse.json(response);
}
