import { NextRequest, NextResponse } from "next/server";
import {
  FootprintService,
  type FootprintRawData,
} from "@/services/footprint-service";

export type FootprintResponse =
  | { success: true; data: FootprintRawData }
  | { success: false; error: string };

export async function GET(
  request: NextRequest
): Promise<NextResponse<FootprintResponse>> {
  const searchParams = request.nextUrl.searchParams;
  const date = searchParams.get("date");

  if (!date) {
    return NextResponse.json(
      { success: false, error: "Missing required parameter: date" },
      { status: 400 }
    );
  }

  // Validate date format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { success: false, error: "Invalid date format. Use YYYY-MM-DD" },
      { status: 400 }
    );
  }

  try {
    const service = new FootprintService();
    const data = service.getDayData(date);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
