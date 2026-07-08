import { describe, expect, it } from "vitest";

import {
  BASE_READINESS_SCRIPTS,
  buildBaseReadinessChecks,
  formatBaseReadinessSummary,
  runBaseReadinessChecks,
} from "./readiness.js";

describe("base readiness summary fixtures", () => {
  it("renders a reproducible all-passing readiness summary from fixture checks", async () => {
    const checks = buildBaseReadinessChecks();
    const results = await runBaseReadinessChecks(checks, async () => ({
      exitCode: 0,
      signal: null,
      stdout: "ok",
      stderr: "",
    }));

    expect(formatBaseReadinessSummary(results)).toBe([
      "Base Sepolia readiness",
      `checks: ${BASE_READINESS_SCRIPTS.length}`,
      `passed: ${BASE_READINESS_SCRIPTS.length}`,
      "failed: 0",
      "overall: passed",
      ...BASE_READINESS_SCRIPTS.map((script) => `- ${script.name}: passed`),
    ].join("\n"));
  });

  it("keeps failed fixture decisions readable without suppressing later checks", async () => {
    const checks = buildBaseReadinessChecks();
    const results = await runBaseReadinessChecks(checks, async (check) => ({
      exitCode: check.name === "reputation" ? 1 : 0,
      signal: null,
      stdout: check.name === "reputation" ? "" : "ok",
      stderr: check.name === "reputation" ? "registry mismatch" : "",
    }));

    expect(results).toHaveLength(BASE_READINESS_SCRIPTS.length);
    expect(formatBaseReadinessSummary(results)).toBe([
      "Base Sepolia readiness",
      `checks: ${BASE_READINESS_SCRIPTS.length}`,
      `passed: ${BASE_READINESS_SCRIPTS.length - 1}`,
      "failed: 1",
      "overall: failed",
      ...BASE_READINESS_SCRIPTS.map((script) => `- ${script.name}: ${script.name === "reputation" ? "failed" : "passed"}`),
    ].join("\n"));
  });
});
