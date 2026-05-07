import { NextRequest, NextResponse } from "next/server";
import { FootprintService } from "@/services/footprint-service";
import { transformMonthFootprintData } from "@/lib/month-transformers";
import type { MonthFootprintData } from "@/models/month-view";

export type MonthFootprintResponse =
  | { success: true; data: MonthFootprintData }
  | { success: false; error: string };

export async function GET(
  request: NextRequest
): Promise<NextResponse<MonthFootprintResponse>> {
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
    const service = new FootprintService();
    const rawData = service.getMonthData(month);
    const data = transformMonthFootprintData(rawData);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
