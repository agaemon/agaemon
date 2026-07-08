import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  createBaseSepoliaLaunchGateReport,
  formatBaseSepoliaLaunchGateSummary,
} from "./gate.js";
import { BASE_READINESS_SCRIPTS } from "../base/readiness.js";
import type { BaseSecurityEvidenceReport } from "../security/evidence.js";
import type { EconomicPayoutSummaryVerification } from "../economics/summaryVerify.js";
import type { BaseSepoliaHealthReport } from "./health.js";

const MANIFEST = JSON.stringify({ network: "base-sepolia", chainId: 84532 }, null, 2);
const MANIFEST_SHA = createHash("sha256").update(MANIFEST).digest("hex");

const CHECKPOINT = {
  schemaVersion: 1,
  generatedAt: "2026-07-02T00:00:00.000Z",
  commit: { sha: "098e51d098e51d098e51d098e51d098e51d098e5" },
  manifest: {
    path: "deployments/base-sepolia/latest.json",
    sha256: MANIFEST_SHA,
    network: "base-sepolia",
    chainId: 84532,
  },
  readiness: {
    runUrl: "https://github.com/sagaratalatti/agentos-kernel/actions/runs/28155970869",
    summary: { checks: 12, passed: 12, failed: 0, overall: "passed" },
    checks: BASE_READINESS_SCRIPTS.map((script) => ({
      name: script.name,
      script: script.script,
      command: `npm run ${script.script}`,
      passed: true,
      exitCode: 0,
      signal: null,
      stdout: "",
      stderr: "",
    })),
  },
};

const RELEASE_STATUS = JSON.stringify({
  schemaVersion: 1,
  network: "base-sepolia",
  releaseCount: 1,
  latest: {
    note: "base-sepolia-2026-06-25-4c7e8c2.md",
    generatedAt: "2026-06-25T08:05:49.658Z",
    commitSha: "4c7e8c241f7daedade7a864af3692723fc6978dd",
    shortCommitSha: "4c7e8c2",
    manifestSha256: MANIFEST_SHA,
    readinessRunUrl: "https://github.com/sagaratalatti/agentos-kernel/actions/runs/28155970869",
    readinessRunId: "28155970869",
    checksSummary: "12 passed, 0 failed",
  },
  releases: [
    {
      note: "base-sepolia-2026-06-25-4c7e8c2.md",
      generatedAt: "2026-06-25T08:05:49.658Z",
      commitSha: "4c7e8c241f7daedade7a864af3692723fc6978dd",
      readinessRunUrl: "https://github.com/sagaratalatti/agentos-kernel/actions/runs/28155970869",
    },
  ],
}, null, 2);

const HEALTH: BaseSepoliaHealthReport = {
  schemaVersion: 1,
  generatedAt: "2026-07-02T00:00:00.000Z",
  manifest: {
    path: "deployments/base-sepolia/latest.json",
    sha256: MANIFEST_SHA,
    network: "base-sepolia",
    chainId: 84532,
    contractCount: 5,
    transactionCount: 8,
  },
  release: {
    statusPath: "docs/releases/latest.json",
    latestCommitSha: "4c7e8c241f7daedade7a864af3692723fc6978dd",
    latestGeneratedAt: "2026-06-25T08:05:49.658Z",
    latestReadinessRunUrl: "https://github.com/sagaratalatti/agentos-kernel/actions/runs/28155970869",
  },
  passed: true,
  summary: { checks: 4, passed: 4, failed: 0, warnings: 0 },
  checks: [
    {
      id: "manifest-shape",
      label: "Deployment manifest shape",
      severity: "critical",
      passed: true,
      failures: [],
      remediation: "Regenerate deployments/base-sepolia/latest.json from the deployment scripts.",
    },
  ],
};

const LOCAL_PREFLIGHT = {
  releaseDir: "docs/releases",
  manifest: "deployments/base-sepolia/latest.json",
  envExample: ".env.example",
  index: "docs/releases/README.md",
  status: "docs/releases/latest.json",
  summary: "docs/releases/CURRENT.md",
  notes: 1,
  passed: true,
  checks: [
    {
      name: "release-summary",
      passed: true,
      failures: [],
    },
  ],
};

const SECURITY_EVIDENCE: BaseSecurityEvidenceReport = {
  schemaVersion: 1,
  generatedAt: "2026-07-02T00:00:00.000Z",
  passed: true,
  summary: { checks: 2, passed: 2, failed: 0 },
  fuzzTests: {
    count: 1,
    paths: ["test/PolicyEngineFuzz.t.sol"],
  },
  invariantTests: {
    count: 0,
    paths: [],
  },
  runtimeFixtures: {
    count: 1,
    paths: ["runtime/proposalExecution/signingPayloadPreflight.test.ts"],
  },
  runtimeFixtureCategories: {
    staleArtifacts: { count: 1, paths: ["runtime/proposalExecution/signingPayloadPreflight.test.ts"] },
    malformedInputs: { count: 1, paths: ["runtime/proposalExecution/signingPayloadPreflight.test.ts"] },
    editedEvidence: { count: 1, paths: ["runtime/proposalExecution/signingPayloadPreflight.test.ts"] },
    mismatchDrift: { count: 1, paths: ["runtime/proposalExecution/signingPayloadPreflight.test.ts"] },
    unsupportedChainOrManifest: { count: 1, paths: ["runtime/proposalExecution/signingPayloadPreflight.test.ts"] },
  },
  checks: [
    {
      id: "forge-adversarial-coverage",
      label: "Foundry fuzz or invariant coverage",
      passed: true,
      failures: [],
    },
    {
      id: "runtime-adversarial-fixtures",
      label: "Runtime adversarial fixture coverage",
      passed: true,
      failures: [],
    },
  ],
};

const ECONOMIC_PAYOUT_SUMMARY_VERIFICATION: EconomicPayoutSummaryVerification = {
  passed: true,
  failures: [],
  expected: {
    totalAssignments: 1,
    paidAssignments: 1,
    unpaidAssignments: 0,
    blockedAssignments: 0,
    totalAmountWei: "100",
    paidAmountWei: "100",
    unpaidAmountWei: "0",
    blockedAmountWei: "0",
    lowestRemainingPeriodWei: "900",
    reasons: [
      { reason: "assignment-payout-receipt-recorded", count: 1, amountWei: "100" },
    ],
    abuseSignals: {
      invalidAssignments: { count: 0, amountWei: "0", assignmentIds: [] },
      ruleOrBudgetBlocks: { count: 0, amountWei: "0", assignmentIds: [] },
      evidenceMismatches: { count: 0, amountWei: "0", assignmentIds: [] },
      policyBlocks: { count: 0, amountWei: "0", assignmentIds: [] },
    },
    budgetFailures: [],
  },
};

describe("createBaseSepoliaLaunchGateReport", () => {
  it("returns a go decision when readiness, release status, health, and optional local evidence pass", () => {
    const report = createBaseSepoliaLaunchGateReport({
      generatedAt: "2026-07-02T00:00:00.000Z",
      manifestPath: "deployments/base-sepolia/latest.json",
      manifestContents: MANIFEST,
      checkpoint: CHECKPOINT,
      releaseStatusPath: "docs/releases/latest.json",
      releaseStatusJson: RELEASE_STATUS,
      health: HEALTH,
      localPreflight: LOCAL_PREFLIGHT,
      securityEvidence: SECURITY_EVIDENCE,
      economicPayoutSummaryVerification: ECONOMIC_PAYOUT_SUMMARY_VERIFICATION,
    });

    expect(report.decision).toBe("go");
    expect(report.passed).toBe(true);
    expect(report.commitSha).toBe(CHECKPOINT.commit.sha);
    expect(report.summary).toEqual({ checks: 7, passed: 7, failed: 0 });
    expect(report.checks.map((check) => check.id)).toContain("local-preflight");
    expect(report.checks.map((check) => check.id)).toContain("security-evidence");
    expect(report.checks.map((check) => check.id)).toContain("economic-payout-summary");
    expect(formatBaseSepoliaLaunchGateSummary(report)).toContain("decision: go");
  });

  it("returns no-go when local preflight evidence fails", () => {
    const report = createBaseSepoliaLaunchGateReport({
      manifestPath: "deployments/base-sepolia/latest.json",
      manifestContents: MANIFEST,
      checkpoint: CHECKPOINT,
      releaseStatusPath: "docs/releases/latest.json",
      releaseStatusJson: RELEASE_STATUS,
      health: HEALTH,
      localPreflight: {
        ...LOCAL_PREFLIGHT,
        passed: false,
        checks: [
          { name: "release-summary", passed: false, failures: ["release summary is stale"] },
        ],
      },
    });

    expect(report.decision).toBe("no-go");
    expect(report.checks.find((check) => check.id === "local-preflight")).toMatchObject({
      passed: false,
      failures: ["local preflight report failed 1 check"],
    });
  });

  it("returns no-go when security evidence fails", () => {
    const report = createBaseSepoliaLaunchGateReport({
      manifestPath: "deployments/base-sepolia/latest.json",
      manifestContents: MANIFEST,
      checkpoint: CHECKPOINT,
      releaseStatusPath: "docs/releases/latest.json",
      releaseStatusJson: RELEASE_STATUS,
      health: HEALTH,
      securityEvidence: {
        ...SECURITY_EVIDENCE,
        passed: false,
        summary: { checks: 1, passed: 0, failed: 1 },
        checks: [
          {
            id: "forge-adversarial-coverage",
            label: "Foundry fuzz or invariant coverage",
            passed: false,
            failures: ["no Solidity fuzz or invariant tests found"],
          },
        ],
      },
    });

    expect(report.decision).toBe("no-go");
    expect(report.checks.find((check) => check.id === "security-evidence")).toMatchObject({
      passed: false,
      failures: ["security evidence report failed 1 check"],
    });
  });

  it("returns no-go when economic payout summary verification fails", () => {
    const report = createBaseSepoliaLaunchGateReport({
      manifestPath: "deployments/base-sepolia/latest.json",
      manifestContents: MANIFEST,
      checkpoint: CHECKPOINT,
      releaseStatusPath: "docs/releases/latest.json",
      releaseStatusJson: RELEASE_STATUS,
      health: HEALTH,
      economicPayoutSummaryVerification: {
        ...ECONOMIC_PAYOUT_SUMMARY_VERIFICATION,
        passed: false,
        failures: ["economic payout summary is stale"],
      },
    });

    expect(report.decision).toBe("no-go");
    expect(report.checks.find((check) => check.id === "economic-payout-summary")).toMatchObject({
      passed: false,
      failures: ["economic payout summary verification failed: economic payout summary is stale"],
    });
  });

  it("returns no-go when health evidence fails", () => {
    const report = createBaseSepoliaLaunchGateReport({
      manifestPath: "deployments/base-sepolia/latest.json",
      manifestContents: MANIFEST,
      checkpoint: CHECKPOINT,
      releaseStatusPath: "docs/releases/latest.json",
      releaseStatusJson: RELEASE_STATUS,
      health: { ...HEALTH, passed: false, summary: { checks: 1, passed: 0, failed: 1, warnings: 0 } },
    });

    expect(report.decision).toBe("no-go");
    expect(report.checks.find((check) => check.id === "health")).toMatchObject({
      passed: false,
      failures: ["health report failed 1 check"],
    });
  });

  it("returns no-go when readiness checkpoint verification fails", () => {
    const report = createBaseSepoliaLaunchGateReport({
      manifestPath: "deployments/base-sepolia/latest.json",
      manifestContents: MANIFEST,
      checkpoint: { ...CHECKPOINT, readiness: { ...CHECKPOINT.readiness, summary: { checks: 12, passed: 11, failed: 1, overall: "failed" } } },
      releaseStatusPath: "docs/releases/latest.json",
      releaseStatusJson: RELEASE_STATUS,
      health: HEALTH,
    });

    expect(report.decision).toBe("no-go");
    expect(report.checks.find((check) => check.id === "readiness-checkpoint")?.failures).toContain("readiness overall must be passed");
  });

  it("rejects malformed injected health reports", () => {
    expect(() =>
      createBaseSepoliaLaunchGateReport({
        manifestPath: "deployments/base-sepolia/latest.json",
        manifestContents: MANIFEST,
        checkpoint: CHECKPOINT,
        releaseStatusPath: "docs/releases/latest.json",
        releaseStatusJson: RELEASE_STATUS,
        health: { ...HEALTH, passed: "yes" },
      }),
    ).toThrow("health report passed must be a boolean");
  });

  it("rejects malformed injected local preflight reports", () => {
    expect(() =>
      createBaseSepoliaLaunchGateReport({
        manifestPath: "deployments/base-sepolia/latest.json",
        manifestContents: MANIFEST,
        checkpoint: CHECKPOINT,
        releaseStatusPath: "docs/releases/latest.json",
        releaseStatusJson: RELEASE_STATUS,
        health: HEALTH,
        localPreflight: { ...LOCAL_PREFLIGHT, passed: "yes" },
      }),
    ).toThrow("local preflight report passed must be a boolean");
  });

  it("rejects malformed injected security evidence reports", () => {
    expect(() =>
      createBaseSepoliaLaunchGateReport({
        manifestPath: "deployments/base-sepolia/latest.json",
        manifestContents: MANIFEST,
        checkpoint: CHECKPOINT,
        releaseStatusPath: "docs/releases/latest.json",
        releaseStatusJson: RELEASE_STATUS,
        health: HEALTH,
        securityEvidence: { ...SECURITY_EVIDENCE, passed: "yes" },
      }),
    ).toThrow("security evidence report passed must be a boolean");
  });
});
