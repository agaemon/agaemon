import { describe, expect, it } from "vitest";

import { formatBaseSepoliaReleaseStatusSummary } from "./status.js";

describe("base sepolia release status summary fixtures", () => {
  it("renders a reproducible release status write summary with manifest evidence", () => {
    expect(formatBaseSepoliaReleaseStatusSummary({
      output: "docs/releases/latest.json",
      notes: 2,
      manifest: "deployments/base-sepolia/latest.json",
      written: true,
    })).toBe([
      "Base Sepolia release status",
      "output: docs/releases/latest.json",
      "notes: 2",
      "manifest: deployments/base-sepolia/latest.json",
      "written: true",
    ].join("\n"));
  });

  it("keeps stale release status verification failures readable", () => {
    expect(formatBaseSepoliaReleaseStatusSummary({
      output: "docs/releases/latest.json",
      notes: 2,
      passed: false,
      failures: ["release status is stale"],
    })).toBe([
      "Base Sepolia release status",
      "output: docs/releases/latest.json",
      "notes: 2",
      "passed: false",
      "failures: 1",
      "- release status is stale",
    ].join("\n"));
  });
});
