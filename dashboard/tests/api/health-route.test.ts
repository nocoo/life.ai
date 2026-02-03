import { describe, it, expect } from "bun:test";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("should return 200 status", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
  });

  it("should return ok status in body", async () => {
    const response = await GET();
    const data = await response.json();

    expect(data.status).toBe("ok");
  });

  it("should return version 1.0.0", async () => {
    const response = await GET();
    const data = await response.json();

    expect(data.version).toBe("1.0.0");
  });

  it("should return valid ISO timestamp", async () => {
    const response = await GET();
    const data = await response.json();

    expect(data.timestamp).toBeDefined();
    const date = new Date(data.timestamp);
    expect(date.toISOString()).toBe(data.timestamp);
  });

  it("should return timestamp close to current time", async () => {
    const beforeTime = new Date();
    const response = await GET();
    const afterTime = new Date();
    const data = await response.json();

    const responseTime = new Date(data.timestamp);
    expect(responseTime.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
    expect(responseTime.getTime()).toBeLessThanOrEqual(afterTime.getTime());
  });

  it("should return correct content type", async () => {
    const response = await GET();
    const contentType = response.headers.get("content-type");

    expect(contentType).toContain("application/json");
  });

  it("should return all required fields", async () => {
    const response = await GET();
    const data = await response.json();

    expect(data).toHaveProperty("status");
    expect(data).toHaveProperty("timestamp");
    expect(data).toHaveProperty("version");
  });
});
