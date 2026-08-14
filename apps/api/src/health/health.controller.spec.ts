import { afterEach, describe, expect, it } from "vitest";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  const controller = new HealthController();
  const originalSha = process.env.BUILD_SHA;

  afterEach(() => {
    process.env.BUILD_SHA = originalSha;
  });

  it("reports ok status", () => {
    expect(controller.check().status).toBe("ok");
  });

  it("falls back to 'local' when BUILD_SHA is unset", () => {
    delete process.env.BUILD_SHA;
    expect(controller.check().sha).toBe("local");
  });

  it("reports the build SHA when BUILD_SHA is set", () => {
    process.env.BUILD_SHA = "abc1234";
    expect(controller.check().sha).toBe("abc1234");
  });
});
