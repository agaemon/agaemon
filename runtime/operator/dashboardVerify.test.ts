import { describe, expect, it } from "vitest";

import type { OperatorDashboardSnapshot } from "./dashboard.js";
import {
  formatOperatorDashboardVerificationSummary,
  verifyOperatorDashboardSnapshot,
} from "./dashboardVerify.js";

const SNAPSHOT: OperatorDashboardSnapshot = {
  schemaVersion: 1,
  generatedAt: "2026-07-03T00:00:00.000Z",
  launch: {
    decision: "go",
    passed: true,
    failedChecks: 0,
    source: { path: "artifacts/base-sepolia-launch-gate.json" },
  },
  health: {
    passed: true,
    failedChecks: 0,
    warnings: 0,
    source: { path: "artifacts/base-sepolia-health.json" },
  },
  agent: {
    address: "0x0000000000000000000000000000000000001004",
    roleLabel: "agentos.kernel.operator",
    metadataURI: "agentos://base-sepolia/agent-account/v1",
    source: { path: "deployments/base-sepolia/latest.json" },
  },
  release: {
    latestCommitSha: "a".repeat(40),
    latestGeneratedAt: "2026-07-02T00:00:00.000Z",
    latestReadinessRunUrl: "https://github.com/sagaratalatti/agentos-kernel/actions/runs/1",
    source: { path: "docs/releases/latest.json" },
  },
};

describe("verifyOperatorDashboardSnapshot", () => {
  it("passes when the saved dashboard matches recomputed evidence", () => {
    const verification = verifyOperatorDashboardSnapshot({
      saved: SNAPSHOT,
      expected: SNAPSHOT,
    });

    expect(verification).toEqual({
      passed: true,
      failures: [],
      expected: SNAPSHOT,
    });
    expect(formatOperatorDashboardVerificationSummary(verification)).toContain("passed: true");
  });

  it("ignores generatedAt drift when source evidence still matches", () => {
    const expected = { ...SNAPSHOT, generatedAt: "2026-07-03T00:00:01.000Z" };
    const verification = verifyOperatorDashboardSnapshot({
      saved: SNAPSHOT,
      expected,
    });

    expect(verification).toEqual({
      passed: true,
      failures: [],
      expected,
    });
  });

  it("fails when the saved dashboard is stale", () => {
    const stale = {
      ...SNAPSHOT,
      launch: { ...SNAPSHOT.launch, decision: "no-go" as const },
    };

    const verification = verifyOperatorDashboardSnapshot({
      saved: stale,
      expected: SNAPSHOT,
    });

    expect(verification.passed).toBe(false);
    expect(verification.failures).toEqual(["operator dashboard snapshot is stale"]);
  });
});
