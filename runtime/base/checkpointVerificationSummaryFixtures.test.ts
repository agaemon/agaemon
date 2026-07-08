import { describe, expect, it } from "vitest";

import { formatReadinessCheckpointVerificationSummary } from "./checkpoint.js";

describe("readiness checkpoint verification summary fixtures", () => {
  it("renders a reproducible passing checkpoint verification summary", () => {
    expect(formatReadinessCheckpointVerificationSummary({
      passed: true,
      failures: [],
    })).toBe([
      "Base Sepolia readiness checkpoint verification",
      "passed: true",
      "failures: 0",
    ].join("\n"));
  });

  it("keeps failed checkpoint verification evidence readable", () => {
    expect(formatReadinessCheckpointVerificationSummary({
      passed: false,
      failures: [
        "manifest sha256 does not match current manifest",
        "readiness run URL is required",
      ],
    })).toBe([
      "Base Sepolia readiness checkpoint verification",
      "passed: false",
      "failures: 2",
      "- manifest sha256 does not match current manifest",
      "- readiness run URL is required",
    ].join("\n"));
  });
});
