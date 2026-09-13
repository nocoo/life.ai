import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/live/route";
import { APP_VERSION } from "@/lib/version";

describe("GET /api/live", () => {
  it("returns the project version", async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("ok");
    expect(data.version).toBe(APP_VERSION);
  });
});
