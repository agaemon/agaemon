import { describe, expect, it } from "vitest";

import { formatBaseSepoliaReleaseIndexSummary } from "./index.js";

describe("base sepolia release index summary fixtures", () => {
  it("renders a reproducible release index write summary with manifest evidence", () => {
    expect(formatBaseSepoliaReleaseIndexSummary({
      output: "docs/releases/README.md",
      notes: 2,
      manifest: "deployments/base-sepolia/latest.json",
      written: true,
    })).toBe([
      "Base Sepolia release index",
      "output: docs/releases/README.md",
      "notes: 2",
      "manifest: deployments/base-sepolia/latest.json",
      "written: true",
    ].join("\n"));
  });

  it("keeps stale release index verification failures readable", () => {
    expect(formatBaseSepoliaReleaseIndexSummary({
      output: "docs/releases/README.md",
      notes: 2,
      passed: false,
      failures: ["release index is stale"],
    })).toBe([
      "Base Sepolia release index",
      "output: docs/releases/README.md",
      "notes: 2",
      "passed: false",
      "failures: 1",
      "- release index is stale",
    ].join("\n"));
  });
});
