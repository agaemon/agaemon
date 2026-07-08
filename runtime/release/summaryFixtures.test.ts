import { describe, expect, it } from "vitest";

import { formatBaseSepoliaReleaseSummaryReport } from "./summary.js";

describe("base sepolia release summary report fixtures", () => {
  it("renders a reproducible release summary write report", () => {
    expect(formatBaseSepoliaReleaseSummaryReport({
      status: "docs/releases/latest.json",
      output: "docs/releases/CURRENT.md",
      written: true,
    })).toBe([
      "Base Sepolia release summary",
      "status: docs/releases/latest.json",
      "output: docs/releases/CURRENT.md",
      "written: true",
    ].join("\n"));
  });

  it("keeps stale release summary check failures readable", () => {
    expect(formatBaseSepoliaReleaseSummaryReport({
      status: "docs/releases/latest.json",
      output: "docs/releases/CURRENT.md",
      passed: false,
      failures: ["release summary is stale"],
    })).toBe([
      "Base Sepolia release summary",
      "status: docs/releases/latest.json",
      "output: docs/releases/CURRENT.md",
      "passed: false",
      "failures: 1",
      "- release summary is stale",
    ].join("\n"));
  });
});
