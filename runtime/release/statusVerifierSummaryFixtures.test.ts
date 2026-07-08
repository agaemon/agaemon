import { describe, expect, it } from "vitest";

import { formatBaseSepoliaReleaseStatusSnapshotVerificationSummary } from "./status.js";

describe("base sepolia release status snapshot verification summary fixtures", () => {
  it("renders a reproducible passing release status verification summary", () => {
    expect(formatBaseSepoliaReleaseStatusSnapshotVerificationSummary({
      passed: true,
      failures: [],
    })).toBe([
      "Base Sepolia release status verification",
      "passed: true",
      "failures: 0",
    ].join("\n"));
  });

  it("keeps failed release status verification evidence readable", () => {
    expect(formatBaseSepoliaReleaseStatusSnapshotVerificationSummary({
      passed: false,
      failures: [
        "latest.commitSha must be a 40-character hex string",
        "releaseCount must equal releases length",
      ],
    })).toBe([
      "Base Sepolia release status verification",
      "passed: false",
      "failures: 2",
      "- latest.commitSha must be a 40-character hex string",
      "- releaseCount must equal releases length",
    ].join("\n"));
  });
});
