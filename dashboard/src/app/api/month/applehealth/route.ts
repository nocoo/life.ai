import { NextRequest, NextResponse } from "next/server";
import { AppleHealthService } from "@/services/applehealth-service";
import {
  transformMonthHealthData,
} from "@/lib/month-transformers";
import type { MonthHealthData } from "@/models/month-view";

export type MonthAppleHealthResponse =
  | { success: true; data: MonthHealthData }
  | { success: false; error: string };

export async function GET(
  request: NextRequest
): Promise<NextResponse<MonthAppleHealthResponse>> {
  const searchParams = request.nextUrl.searchParams;
  const month = searchParams.get("month");

  if (!month) {
    return NextResponse.json(
      { success: false, error: "Missing required parameter: month" },
      { status: 400 }
    );
  }

  // Validate month format (YYYY-MM)
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json(
      { success: false, error: "Invalid month format. Use YYYY-MM" },
      { status: 400 }
    );
  }

  try {
    const service = new AppleHealthService();
    const rawData = service.getMonthData(month);
    const data = transformMonthHealthData(rawData);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
