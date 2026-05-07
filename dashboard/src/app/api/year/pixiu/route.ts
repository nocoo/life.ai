import { NextRequest, NextResponse } from "next/server";
import { PixiuService } from "@/services/pixiu-service";
import { transformYearPixiuData } from "@/lib/year-transformers";
import type { YearPixiuData } from "@/models/year-view";

export type YearPixiuResponse =
  | { success: true; data: YearPixiuData }
  | { success: false; error: string };

export async function GET(
  request: NextRequest
): Promise<NextResponse<YearPixiuResponse>> {
  const searchParams = request.nextUrl.searchParams;
  const yearParam = searchParams.get("year");

  if (!yearParam) {
    return NextResponse.json(
      { success: false, error: "Missing required parameter: year" },
      { status: 400 }
    );
  }

  // Validate year format (YYYY)
  if (!/^\d{4}$/.test(yearParam)) {
    return NextResponse.json(
      { success: false, error: "Invalid year format. Use YYYY" },
      { status: 400 }
    );
  }

  const year = parseInt(yearParam, 10);

  try {
    const service = new PixiuService();
    const rawData = service.getYearData(year);
    const data = transformYearPixiuData(rawData);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
