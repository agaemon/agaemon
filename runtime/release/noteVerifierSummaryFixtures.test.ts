import { describe, expect, it } from "vitest";

import { formatBaseSepoliaReleaseNoteVerificationSummary } from "./noteVerifier.js";

describe("base sepolia release note verification summary fixtures", () => {
  it("renders a reproducible passing release note verification summary", () => {
    expect(formatBaseSepoliaReleaseNoteVerificationSummary({
      passed: true,
      failures: [],
    })).toBe([
      "Base Sepolia release note verification",
      "passed: true",
      "failures: 0",
    ].join("\n"));
  });

  it("keeps failed release note verification evidence readable", () => {
    expect(formatBaseSepoliaReleaseNoteVerificationSummary({
      passed: false,
      failures: [
        "manifest sha256 does not match current manifest",
        "readiness run URL is invalid",
      ],
    })).toBe([
      "Base Sepolia release note verification",
      "passed: false",
      "failures: 2",
      "- manifest sha256 does not match current manifest",
      "- readiness run URL is invalid",
    ].join("\n"));
  });
});
