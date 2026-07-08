import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  formatBaseSepoliaLaunchGateVerificationSummary,
  verifyBaseSepoliaLaunchGateReport,
} from "./gateVerify.js";
import type { BaseSepoliaLaunchGateReport } from "./gate.js";
import type { BaseSepoliaHealthReport } from "./health.js";
import type { BaseSecurityEvidenceReport } from "../security/evidence.js";
import type { EconomicPayoutSummaryVerification } from "../economics/summaryVerify.js";

const MANIFEST = JSON.stringify({ network: "base-sepolia", chainId: 84532 }, null, 2);
const MANIFEST_SHA = createHash("sha256").update(MANIFEST).digest("hex");

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
  release: { statusPath: "docs/releases/latest.json" },
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

const GATE: BaseSepoliaLaunchGateReport = {
  schemaVersion: 1,
  generatedAt: "2026-07-02T00:00:00.000Z",
  manifestPath: "deployments/base-sepolia/latest.json",
  manifestSha256: MANIFEST_SHA,
  releaseStatusPath: "docs/releases/latest.json",
  commitSha: "098e51d098e51d098e51d098e51d098e51d098e5",
  readinessRunUrl: "https://github.com/sagaratalatti/agentos-kernel/actions/runs/28155970869",
  decision: "go",
  passed: true,
  summary: { checks: 6, passed: 6, failed: 0 },
  checks: [
    { id: "readiness-checkpoint", label: "Readiness checkpoint", passed: true, failures: [] },
    { id: "local-preflight", label: "Local preflight", passed: true, failures: [] },
    { id: "security-evidence", label: "Security evidence", passed: true, failures: [] },
    { id: "economic-payout-summary", label: "Economic payout summary", passed: true, failures: [] },
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

describe("verifyBaseSepoliaLaunchGateReport", () => {
  it("passes a go launch gate report that matches current manifest and health evidence", () => {
    expect(verifyBaseSepoliaLaunchGateReport(GATE, {
      manifestContents: MANIFEST,
      health: HEALTH,
      localPreflight: LOCAL_PREFLIGHT,
      securityEvidence: SECURITY_EVIDENCE,
      economicPayoutSummaryVerification: ECONOMIC_PAYOUT_SUMMARY_VERIFICATION,
    })).toEqual({ passed: true, failures: [] });
  });

  it("fails when supplied local preflight evidence failed", () => {
    const verification = verifyBaseSepoliaLaunchGateReport(GATE, {
      localPreflight: {
        ...LOCAL_PREFLIGHT,
        passed: false,
        checks: [
          { name: "release-summary", passed: false, failures: ["release summary is stale"] },
        ],
      },
    });

    expect(verification.failures).toContain("local preflight report must be passed");
  });

  it("fails when supplied local preflight evidence is missing from the saved launch gate", () => {
    const verification = verifyBaseSepoliaLaunchGateReport({
      ...GATE,
      checks: GATE.checks.filter((check) => check.id !== "local-preflight"),
    }, {
      localPreflight: LOCAL_PREFLIGHT,
    });

    expect(verification.failures).toContain("launch gate report must include a local-preflight check");
  });

  it("fails when supplied local preflight evidence no longer matches the saved launch gate", () => {
    const verification = verifyBaseSepoliaLaunchGateReport(GATE, {
      localPreflight: {
        ...LOCAL_PREFLIGHT,
        status: "docs/releases/other.json",
      },
    });

    expect(verification.failures).toContain(
      "local preflight status path does not match launch gate release status path",
    );
  });

  it("fails malformed supplied local preflight evidence without throwing", () => {
    expect(verifyBaseSepoliaLaunchGateReport(GATE, {
      localPreflight: { ...LOCAL_PREFLIGHT, passed: "yes" },
    })).toEqual({
      passed: false,
      failures: ["local preflight report invalid: local preflight report passed must be a boolean"],
    });
  });

  it("fails when supplied security evidence failed", () => {
    const verification = verifyBaseSepoliaLaunchGateReport(GATE, {
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

    expect(verification.failures).toContain("security evidence report must be passed");
  });

  it("fails when supplied security evidence is missing from the saved launch gate", () => {
    const verification = verifyBaseSepoliaLaunchGateReport({
      ...GATE,
      checks: GATE.checks.filter((check) => check.id !== "security-evidence"),
    }, {
      securityEvidence: SECURITY_EVIDENCE,
    });

    expect(verification.failures).toContain("launch gate report must include a security-evidence check");
  });

  it("fails when the saved launch gate security evidence check failed", () => {
    const verification = verifyBaseSepoliaLaunchGateReport({
      ...GATE,
      checks: GATE.checks.map((check) => check.id === "security-evidence"
        ? { ...check, passed: false, failures: ["security evidence report failed 1 check"] }
        : check),
    }, {
      securityEvidence: SECURITY_EVIDENCE,
    });

    expect(verification.failures).toContain("launch gate security-evidence check must be passed");
  });

  it("fails malformed supplied security evidence without throwing", () => {
    expect(verifyBaseSepoliaLaunchGateReport(GATE, {
      securityEvidence: { ...SECURITY_EVIDENCE, passed: "yes" },
    })).toEqual({
      passed: false,
      failures: ["security evidence report invalid: security evidence report passed must be a boolean"],
    });
  });

  it("fails when supplied economic payout summary verification failed", () => {
    const verification = verifyBaseSepoliaLaunchGateReport(GATE, {
      economicPayoutSummaryVerification: {
        ...ECONOMIC_PAYOUT_SUMMARY_VERIFICATION,
        passed: false,
        failures: ["economic payout summary is stale"],
      },
    });

    expect(verification.failures).toContain("economic payout summary verification must be passed");
  });

  it("fails when supplied economic payout summary verification is missing from the saved launch gate", () => {
    const verification = verifyBaseSepoliaLaunchGateReport({
      ...GATE,
      checks: GATE.checks.filter((check) => check.id !== "economic-payout-summary"),
    }, {
      economicPayoutSummaryVerification: ECONOMIC_PAYOUT_SUMMARY_VERIFICATION,
    });

    expect(verification.failures).toContain("launch gate report must include an economic-payout-summary check");
  });

  it("fails when the saved launch gate economic payout summary check failed", () => {
    const verification = verifyBaseSepoliaLaunchGateReport({
      ...GATE,
      checks: GATE.checks.map((check) => check.id === "economic-payout-summary"
        ? { ...check, passed: false, failures: ["economic payout summary verification failed"] }
        : check),
    }, {
      economicPayoutSummaryVerification: ECONOMIC_PAYOUT_SUMMARY_VERIFICATION,
    });

    expect(verification.failures).toContain("launch gate economic-payout-summary check must be passed");
  });

  it("fails malformed supplied economic payout summary verification without throwing", () => {
    expect(verifyBaseSepoliaLaunchGateReport(GATE, {
      economicPayoutSummaryVerification: { ...ECONOMIC_PAYOUT_SUMMARY_VERIFICATION, passed: "yes" },
    })).toEqual({
      passed: false,
      failures: [
        "economic payout summary verification invalid: economic payout summary verification passed must be a boolean",
      ],
    });
  });

  it("fails malformed launch gate reports without throwing", () => {
    expect(verifyBaseSepoliaLaunchGateReport({ ...GATE, passed: "yes" })).toEqual({
      passed: false,
      failures: ["launch gate report passed must be a boolean"],
    });
  });

  it("fails no-go launch gate reports", () => {
    const verification = verifyBaseSepoliaLaunchGateReport({
      ...GATE,
      passed: false,
      decision: "no-go",
      summary: { checks: 4, passed: 3, failed: 1 },
    });

    expect(verification.failures).toContain("launch gate report must be passed");
    expect(verification.failures).toContain("launch gate decision must be go");
  });

  it("fails when the saved launch gate no longer matches current manifest evidence", () => {
    const verification = verifyBaseSepoliaLaunchGateReport(GATE, {
      manifestContents: JSON.stringify({ network: "base-sepolia", changed: true }),
    });

    expect(verification.failures).toContain("launch gate manifest SHA-256 does not match current manifest");
  });

  it("fails when the saved launch gate no longer matches the health report", () => {
    const verification = verifyBaseSepoliaLaunchGateReport(GATE, {
      health: { ...HEALTH, manifest: { ...HEALTH.manifest, sha256: "0".repeat(64) } },
    });

    expect(verification.failures).toContain("launch gate manifest SHA-256 does not match health report manifest");
  });

  it("formats readable verifier summaries", () => {
    expect(formatBaseSepoliaLaunchGateVerificationSummary({
      passed: false,
      failures: ["launch gate decision must be go"],
    })).toBe([
      "Base Sepolia launch gate verification",
      "passed: false",
      "failures: 1",
      "- launch gate decision must be go",
    ].join("\n"));
  });
});
