import { describe, expect, it } from "vitest";

import {
  createBaseSepoliaReleaseSummary,
  verifyBaseSepoliaReleaseSummary,
} from "./summary.js";

const STATUS = {
  schemaVersion: 1,
  network: "base-sepolia",
  releaseCount: 1,
  latest: {
    note: "base-sepolia-2026-06-25-bbbbbbb.md",
    generatedAt: "2026-06-25T08:00:00.000Z",
    commitSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    shortCommitSha: "bbbbbbb",
    manifestSha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    readinessRunUrl: "https://github.com/sagaratalatti/agentos-kernel/actions/runs/28199999999",
    readinessRunId: "28199999999",
    checksSummary: "12 passed, 0 failed",
  },
  releases: [
    {
      note: "base-sepolia-2026-06-25-bbbbbbb.md",
      generatedAt: "2026-06-25T08:00:00.000Z",
      commitSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      readinessRunUrl: "https://github.com/sagaratalatti/agentos-kernel/actions/runs/28199999999",
    },
  ],
};

describe("createBaseSepoliaReleaseSummary", () => {
  it("renders deterministic Markdown from a valid status snapshot", () => {
    expect(createBaseSepoliaReleaseSummary(JSON.stringify(STATUS, null, 2))).toBe(
      [
        "# Current Base Sepolia Release",
        "",
        "Generated from `docs/releases/latest.json`. Individual release notes remain the source of truth.",
        "",
        "| Field | Value |",
        "| --- | --- |",
        "| Status | `available` |",
        "| Latest Note | [base-sepolia-2026-06-25-bbbbbbb.md](base-sepolia-2026-06-25-bbbbbbb.md) |",
        "| Generated At | 2026-06-25T08:00:00.000Z |",
        "| Commit | `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb` |",
        "| Readiness Run | [28199999999](https://github.com/sagaratalatti/agentos-kernel/actions/runs/28199999999) |",
        "| Checks | 12 passed, 0 failed |",
        "| Manifest SHA-256 | `cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc` |",
        "| Release Count | 1 |",
        "",
      ].join("\n"),
    );
  });

  it("rejects invalid status snapshots before rendering", () => {
    const invalidStatus = JSON.stringify({ ...STATUS, network: "base-mainnet" });

    expect(() => createBaseSepoliaReleaseSummary(invalidStatus)).toThrow(
      "release status snapshot invalid: network must be base-sepolia",
    );
  });

  it("renders an empty-release state", () => {
    const emptyStatus = JSON.stringify({
      schemaVersion: 1,
      network: "base-sepolia",
      releaseCount: 0,
      latest: null,
      releases: [],
    });

    expect(createBaseSepoliaReleaseSummary(emptyStatus)).toBe(
      [
        "# Current Base Sepolia Release",
        "",
        "Generated from `docs/releases/latest.json`. Individual release notes remain the source of truth.",
        "",
        "No Base Sepolia release notes have been published yet.",
        "",
        "| Field | Value |",
        "| --- | --- |",
        "| Status | `unavailable` |",
        "| Release Count | 0 |",
        "",
      ].join("\n"),
    );
  });
});

describe("verifyBaseSepoliaReleaseSummary", () => {
  it("detects stale checked-in summaries", () => {
    const current = createBaseSepoliaReleaseSummary(JSON.stringify(STATUS, null, 2)).replace(
      "| Release Count | 1 |",
      "| Release Count | 2 |",
    );

    expect(verifyBaseSepoliaReleaseSummary(current, JSON.stringify(STATUS, null, 2))).toMatchObject({
      passed: false,
      failures: ["release summary is stale"],
    });
  });
});
