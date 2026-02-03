import { NextRequest, NextResponse } from "next/server";
import {
  PixiuService,
  type PixiuRawData,
} from "@/services/pixiu-service";

export type PixiuResponse =
  | { success: true; data: PixiuRawData }
  | { success: false; error: string };

export async function GET(
  request: NextRequest
): Promise<NextResponse<PixiuResponse>> {
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
    const service = new PixiuService();
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
