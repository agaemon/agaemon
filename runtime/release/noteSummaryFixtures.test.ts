import { describe, expect, it } from "vitest";

import { formatBaseSepoliaReleaseNoteCreationSummary } from "./note.js";

describe("base sepolia release note creation summary fixtures", () => {
  it("renders a reproducible release note creation summary with manifest evidence", () => {
    expect(formatBaseSepoliaReleaseNoteCreationSummary({
      checkpoint: "artifacts/base-sepolia-readiness-checkpoint.json",
      manifest: "deployments/base-sepolia/latest.json",
      output: "docs/releases/base-sepolia-2026-06-25-0123456.md",
      requireRunUrl: true,
      written: true,
    })).toBe([
      "Base Sepolia release note",
      "checkpoint: artifacts/base-sepolia-readiness-checkpoint.json",
      "manifest: deployments/base-sepolia/latest.json",
      "output: docs/releases/base-sepolia-2026-06-25-0123456.md",
      "requireRunUrl: true",
      "written: true",
    ].join("\n"));
  });

  it("omits manifest evidence when the release note is created without a manifest file", () => {
    expect(formatBaseSepoliaReleaseNoteCreationSummary({
      checkpoint: "artifacts/base-sepolia-readiness-checkpoint.json",
      output: "docs/releases/base-sepolia-2026-06-25-0123456.md",
      requireRunUrl: false,
      written: true,
    })).toBe([
      "Base Sepolia release note",
      "checkpoint: artifacts/base-sepolia-readiness-checkpoint.json",
      "output: docs/releases/base-sepolia-2026-06-25-0123456.md",
      "requireRunUrl: false",
      "written: true",
    ].join("\n"));
  });
});
