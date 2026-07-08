import { describe, expect, it } from "vitest";

import {
  createFundingReadyOperatorDemoReport,
  formatFundingReadyOperatorDemoSummary,
  formatFundingReadyOperatorDemoVerificationSummary,
  verifyFundingReadyOperatorDemoReport,
} from "./fundingReadyDemo.js";
import type { EconomicPayoutSummaryVerification } from "../economics/summaryVerify.js";
import type { AgentOsEventIndex } from "../indexer/events.js";
import type { AgentOsEventIndexVerification } from "../indexer/verify.js";
import type { BaseSepoliaHealthReport } from "../launch/health.js";
import type { BaseSepoliaLaunchGateReport } from "../launch/gate.js";
import type { OperatorDashboardSnapshot } from "./dashboard.js";
import type { OperatorDashboardVerification } from "./dashboardVerify.js";

describe("createFundingReadyOperatorDemoReport", () => {
  it("passes only when the Base Sepolia proof chain and trust boundary are intact", () => {
    const report = createFundingReadyOperatorDemoReport({
      generatedAt: "2026-07-03T00:00:00.000Z",
      launchGatePath: "artifacts/base-sepolia-launch-gate.json",
      launchGate: launchGate({ passed: true, decision: "go" }),
      healthPath: "artifacts/base-sepolia-health.json",
      health: health({ passed: true }),
      releaseStatusPath: "docs/releases/latest.json",
      releaseStatusJson: releaseStatusJson(),
      eventIndexPath: "artifacts/base-event-index.json",
      eventIndex: eventIndex({ economicEventCount: 2 }),
      eventIndexVerificationPath: "artifacts/base-event-index-verification.json",
      eventIndexVerification: eventIndexVerification({ passed: true }),
      economicPayoutSummaryVerificationPath: "artifacts/economic-payout-summary-verification.json",
      economicPayoutSummaryVerification: economicPayoutSummaryVerification({ passed: true }),
      dashboardPath: "artifacts/operator-dashboard.json",
      dashboard: dashboard({ economicEventCount: 2, payoutVerified: true }),
      dashboardVerificationPath: "artifacts/operator-dashboard-verification.json",
      dashboardVerification: dashboardVerification({ passed: true }),
    });

    expect(report).toMatchObject({
      schemaVersion: 1,
      generatedAt: "2026-07-03T00:00:00.000Z",
      network: "base-sepolia",
      objective: "AgentOS Kernel becomes a credible funding-ready AI x blockchain proof.",
      passed: true,
      summary: { checks: 7, passed: 7, failed: 0 },
      economicAbuseSignals: {
        count: 0,
        amountWei: "0",
      },
      trustBoundary: {
        ai: "proposes",
        policy: "decides",
        accounts: "execute",
        mainnet: false,
        liveFunds: false,
      },
      evidence: {
        memoryStorageBinding: { path: "artifacts/memory-storage-binding.json" },
        memoryStorageBindingVerification: { path: "artifacts/memory-storage-binding-verification.json" },
        memoryStorageMigrationVerification: { path: "artifacts/memory-storage-migration-verification.json" },
      },
    });
    expect(report.checks.map((check) => check.id)).toEqual([
      "launch-gate",
      "health",
      "release-status",
      "event-index",
      "economic-evidence",
      "dashboard",
      "trust-boundary",
    ]);
    expect(formatFundingReadyOperatorDemoSummary(report)).toContain("overall: passed");
    expect(formatFundingReadyOperatorDemoSummary(report)).toContain("economicAbuseSignals: count=0 amountWei=0");
    expect(formatFundingReadyOperatorDemoSummary(report)).toContain("trustBoundary: AI proposes, policy decides, accounts execute");
  });

  it("fails when the launch gate is no-go", () => {
    const report = createFundingReadyOperatorDemoReport({
      generatedAt: "2026-07-03T00:00:00.000Z",
      launchGatePath: "artifacts/base-sepolia-launch-gate.json",
      launchGate: launchGate({ passed: false, decision: "no-go" }),
      healthPath: "artifacts/base-sepolia-health.json",
      health: health({ passed: true }),
      releaseStatusPath: "docs/releases/latest.json",
      releaseStatusJson: releaseStatusJson(),
      eventIndexPath: "artifacts/base-event-index.json",
      eventIndex: eventIndex({ economicEventCount: 2 }),
      eventIndexVerificationPath: "artifacts/base-event-index-verification.json",
      eventIndexVerification: eventIndexVerification({ passed: true }),
      economicPayoutSummaryVerificationPath: "artifacts/economic-payout-summary-verification.json",
      economicPayoutSummaryVerification: economicPayoutSummaryVerification({ passed: true }),
      dashboardPath: "artifacts/operator-dashboard.json",
      dashboard: dashboard({ economicEventCount: 2, payoutVerified: true }),
      dashboardVerificationPath: "artifacts/operator-dashboard-verification.json",
      dashboardVerification: dashboardVerification({ passed: true }),
    });

    expect(report.passed).toBe(false);
    expect(report.checks.find((check) => check.id === "launch-gate")).toMatchObject({
      passed: false,
      failures: ["launch gate decision must be go", "launch gate report must be passed"],
    });
  });

  it("fails when durable memory storage evidence is not visible in the dashboard", () => {
    const report = createFundingReadyOperatorDemoReport({
      generatedAt: "2026-07-03T00:00:00.000Z",
      launchGatePath: "artifacts/base-sepolia-launch-gate.json",
      launchGate: launchGate({ passed: true, decision: "go" }),
      healthPath: "artifacts/base-sepolia-health.json",
      health: health({ passed: true }),
      releaseStatusPath: "docs/releases/latest.json",
      releaseStatusJson: releaseStatusJson(),
      eventIndexPath: "artifacts/base-event-index.json",
      eventIndex: eventIndex({ economicEventCount: 2 }),
      eventIndexVerificationPath: "artifacts/base-event-index-verification.json",
      eventIndexVerification: eventIndexVerification({ passed: true }),
      economicPayoutSummaryVerificationPath: "artifacts/economic-payout-summary-verification.json",
      economicPayoutSummaryVerification: economicPayoutSummaryVerification({ passed: true }),
      dashboardPath: "artifacts/operator-dashboard.json",
      dashboard: dashboard({ economicEventCount: 2, payoutVerified: true, memoryStorage: "missing" }),
      dashboardVerificationPath: "artifacts/operator-dashboard-verification.json",
      dashboardVerification: dashboardVerification({ passed: true }),
    });

    expect(report.passed).toBe(false);
    expect(report.checks.find((check) => check.id === "dashboard")).toMatchObject({
      passed: false,
      failures: ["dashboard memory storage panel must be verified"],
    });
  });

  it("fails when durable memory storage migration evidence is present but unverified", () => {
    const report = createFundingReadyOperatorDemoReport({
      generatedAt: "2026-07-03T00:00:00.000Z",
      launchGatePath: "artifacts/base-sepolia-launch-gate.json",
      launchGate: launchGate({ passed: true, decision: "go" }),
      healthPath: "artifacts/base-sepolia-health.json",
      health: health({ passed: true }),
      releaseStatusPath: "docs/releases/latest.json",
      releaseStatusJson: releaseStatusJson(),
      eventIndexPath: "artifacts/base-event-index.json",
      eventIndex: eventIndex({ economicEventCount: 2 }),
      eventIndexVerificationPath: "artifacts/base-event-index-verification.json",
      eventIndexVerification: eventIndexVerification({ passed: true }),
      economicPayoutSummaryVerificationPath: "artifacts/economic-payout-summary-verification.json",
      economicPayoutSummaryVerification: economicPayoutSummaryVerification({ passed: true }),
      dashboardPath: "artifacts/operator-dashboard.json",
      dashboard: dashboard({ economicEventCount: 2, payoutVerified: true, memoryStorageMigration: "unverified" }),
      dashboardVerificationPath: "artifacts/operator-dashboard-verification.json",
      dashboardVerification: dashboardVerification({ passed: true }),
    });

    expect(report.passed).toBe(false);
    expect(report.evidence).toMatchObject({
      memoryStorageMigrationVerification: { path: "artifacts/memory-storage-migration-verification.json" },
    });
    expect(report.checks.find((check) => check.id === "dashboard")).toMatchObject({
      passed: false,
      failures: ["dashboard memory storage migration must be verified"],
    });
  });

  it("fails when dashboard abuse-signal totals do not match verified economic evidence", () => {
    const report = createFundingReadyOperatorDemoReport({
      generatedAt: "2026-07-03T00:00:00.000Z",
      launchGatePath: "artifacts/base-sepolia-launch-gate.json",
      launchGate: launchGate({ passed: true, decision: "go" }),
      healthPath: "artifacts/base-sepolia-health.json",
      health: health({ passed: true }),
      releaseStatusPath: "docs/releases/latest.json",
      releaseStatusJson: releaseStatusJson(),
      eventIndexPath: "artifacts/base-event-index.json",
      eventIndex: eventIndex({ economicEventCount: 2 }),
      eventIndexVerificationPath: "artifacts/base-event-index-verification.json",
      eventIndexVerification: eventIndexVerification({ passed: true }),
      economicPayoutSummaryVerificationPath: "artifacts/economic-payout-summary-verification.json",
      economicPayoutSummaryVerification: economicPayoutSummaryVerification({
        passed: true,
        abuseSignalCount: 1,
        abuseSignalAmountWei: "300",
      }),
      dashboardPath: "artifacts/operator-dashboard.json",
      dashboard: dashboard({ economicEventCount: 2, payoutVerified: true }),
      dashboardVerificationPath: "artifacts/operator-dashboard-verification.json",
      dashboardVerification: dashboardVerification({ passed: true }),
    });

    expect(report.passed).toBe(false);
    expect(report.checks.find((check) => check.id === "economic-evidence")).toMatchObject({
      passed: false,
      failures: [
        "dashboard economic abuse-signal count must match verified summary",
        "dashboard economic abuse-signal amount must match verified summary",
      ],
    });
  });
});

describe("verifyFundingReadyOperatorDemoReport", () => {
  it("passes when the saved proof matches recomputed evidence apart from generatedAt", () => {
    const saved = createReport();
    const expected = { ...saved, generatedAt: "2026-07-03T00:00:01.000Z" };

    const verification = verifyFundingReadyOperatorDemoReport({ saved, expected });

    expect(verification).toEqual({
      passed: true,
      failures: [],
      expected,
    });
    expect(formatFundingReadyOperatorDemoVerificationSummary(verification)).toContain("passed: true");
  });

  it("fails when the saved proof is stale", () => {
    const saved = {
      ...createReport(),
      checks: createReport().checks.map((check) => check.id === "launch-gate"
        ? { ...check, passed: false, failures: ["launch gate decision must be go"] }
        : check),
    };

    const verification = verifyFundingReadyOperatorDemoReport({
      saved,
      expected: createReport(),
    });

    expect(verification.passed).toBe(false);
    expect(verification.failures).toEqual(["funding-ready operator demo proof is stale"]);
  });
});

function createReport() {
  return createFundingReadyOperatorDemoReport({
    generatedAt: "2026-07-03T00:00:00.000Z",
    launchGatePath: "artifacts/base-sepolia-launch-gate.json",
    launchGate: launchGate({ passed: true, decision: "go" }),
    healthPath: "artifacts/base-sepolia-health.json",
    health: health({ passed: true }),
    releaseStatusPath: "docs/releases/latest.json",
    releaseStatusJson: releaseStatusJson(),
    eventIndexPath: "artifacts/base-event-index.json",
    eventIndex: eventIndex({ economicEventCount: 2 }),
    eventIndexVerificationPath: "artifacts/base-event-index-verification.json",
    eventIndexVerification: eventIndexVerification({ passed: true }),
    economicPayoutSummaryVerificationPath: "artifacts/economic-payout-summary-verification.json",
    economicPayoutSummaryVerification: economicPayoutSummaryVerification({ passed: true }),
    dashboardPath: "artifacts/operator-dashboard.json",
    dashboard: dashboard({ economicEventCount: 2, payoutVerified: true }),
    dashboardVerificationPath: "artifacts/operator-dashboard-verification.json",
    dashboardVerification: dashboardVerification({ passed: true }),
  });
}

function launchGate(params: { passed: boolean; decision: "go" | "no-go" }): BaseSepoliaLaunchGateReport {
  return {
    schemaVersion: 1,
    generatedAt: "2026-07-03T00:00:00.000Z",
    manifestPath: "deployments/base-sepolia/latest.json",
    manifestSha256: "a".repeat(64),
    releaseStatusPath: "docs/releases/latest.json",
    commitSha: "a".repeat(40),
    readinessRunUrl: "https://github.com/sagaratalatti/agentos-kernel/actions/runs/1",
    decision: params.decision,
    passed: params.passed,
    summary: { checks: 2, passed: params.passed ? 2 : 1, failed: params.passed ? 0 : 1 },
    checks: [
      { id: "health", label: "Health report", passed: params.passed, failures: params.passed ? [] : ["failed"] },
      { id: "economic-payout-summary", label: "Economic payout summary", passed: true, failures: [] },
    ],
  };
}

function health(params: { passed: boolean }): BaseSepoliaHealthReport {
  return {
    schemaVersion: 1,
    generatedAt: "2026-07-03T00:00:00.000Z",
    manifest: {
      path: "deployments/base-sepolia/latest.json",
      sha256: "a".repeat(64),
      network: "base-sepolia",
      chainId: 84532,
      contractCount: 5,
      transactionCount: 8,
    },
    release: {
      statusPath: "docs/releases/latest.json",
      latestCommitSha: "a".repeat(40),
      latestGeneratedAt: "2026-07-02T00:00:00.000Z",
      latestReadinessRunUrl: "https://github.com/sagaratalatti/agentos-kernel/actions/runs/1",
    },
    operator: {
      owner: "0x0000000000000000000000000000000000000001",
      ownerBalanceWei: "1000000000000000000",
      ownerPendingNonce: 7,
      agentAccount: "0x0000000000000000000000000000000000001004",
      agentBalanceWei: "0",
    },
    passed: params.passed,
    summary: { checks: 1, passed: params.passed ? 1 : 0, failed: params.passed ? 0 : 1, warnings: 0 },
    checks: [
      {
        id: "manifest-shape",
        label: "Deployment manifest shape",
        severity: "critical" as const,
        passed: params.passed,
        failures: params.passed ? [] : ["bad manifest"],
        remediation: "Regenerate the manifest.",
      },
    ],
  };
}

function releaseStatusJson(): string {
  const release = {
    note: "base-sepolia-2026-06-25-4c7e8c2.md",
    generatedAt: "2026-07-02T00:00:00.000Z",
    commitSha: "a".repeat(40),
    readinessRunUrl: "https://github.com/sagaratalatti/agentos-kernel/actions/runs/1",
  };
  return JSON.stringify({
    schemaVersion: 1,
    network: "base-sepolia",
    releaseCount: 1,
    latest: {
      ...release,
      shortCommitSha: "a".repeat(7),
      manifestSha256: "a".repeat(64),
      readinessRunId: "1",
      checksSummary: "3 passed, 0 failed",
    },
    releases: [release],
  });
}

function eventIndex(params: { economicEventCount: number }): AgentOsEventIndex {
  return {
    schemaVersion: 1,
    manifest: {
      path: "deployments/base-sepolia/latest.json",
      network: "base-sepolia",
      chainId: 84532,
      contracts: {},
    },
    replay: {
      fromBlock: "0",
      toBlock: null,
      inputLogCount: params.economicEventCount,
      indexedEventCount: params.economicEventCount,
    },
    economicEvents: {
      eventCount: params.economicEventCount,
      latestBlock: params.economicEventCount === 0 ? null : "101",
      byContract: [{ contract: "payoutRuleAdapter" as const, eventCount: params.economicEventCount }],
      byEventName: [{ eventName: "PayoutSent", eventCount: params.economicEventCount }],
    },
    events: [],
  };
}

function eventIndexVerification(params: { passed: boolean }): AgentOsEventIndexVerification {
  return {
    passed: params.passed,
    summary: { checks: 8, passed: params.passed ? 8 : 7, failed: params.passed ? 0 : 1 },
    failures: params.passed ? [] : ["economic event summary does not match indexed events"],
    checks: [],
  };
}

function economicPayoutSummaryVerification(
  params: { passed: boolean; abuseSignalCount?: number; abuseSignalAmountWei?: string },
): EconomicPayoutSummaryVerification {
  const abuseSignalCount = params.abuseSignalCount ?? 0;
  const abuseSignalAmountWei = params.abuseSignalAmountWei ?? "0";
  return {
    passed: params.passed,
    failures: params.passed ? [] : ["economic payout summary is stale"],
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
      reasons: [{ reason: "assignment-payout-receipt-recorded" as const, count: 1, amountWei: "100" }],
      abuseSignals: {
        invalidAssignments: { count: 0, amountWei: "0", assignmentIds: [] },
        ruleOrBudgetBlocks: {
          count: abuseSignalCount,
          amountWei: abuseSignalAmountWei,
          assignmentIds: abuseSignalCount === 0 ? [] : ["1"],
        },
        evidenceMismatches: { count: 0, amountWei: "0", assignmentIds: [] },
        policyBlocks: { count: 0, amountWei: "0", assignmentIds: [] },
      },
      budgetFailures: [],
    },
  };
}

function dashboard(params: {
  economicEventCount: number;
  payoutVerified: boolean;
  abuseSignalCount?: number;
  abuseSignalAmountWei?: string;
  memoryStorage?: "verified" | "unverified" | "missing";
  memoryStorageMigration?: "verified" | "unverified" | "missing";
}): OperatorDashboardSnapshot {
  const memoryStorage = params.memoryStorage ?? "verified";
  const memoryStorageMigration = params.memoryStorageMigration ?? "verified";
  return {
    schemaVersion: 1,
    generatedAt: "2026-07-03T00:00:00.000Z",
    launch: { decision: "go" as const, passed: true, failedChecks: 0, source: { path: "artifacts/base-sepolia-launch-gate.json" } },
    health: { passed: true, failedChecks: 0, warnings: 0, source: { path: "artifacts/base-sepolia-health.json" } },
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
    eventIndex: {
      verified: true,
      indexedEventCount: params.economicEventCount,
      economicEventCount: params.economicEventCount,
      economicContracts: [{ contract: "payoutRuleAdapter", eventCount: params.economicEventCount }],
      source: { path: "artifacts/base-event-index.json" },
      verificationSource: { path: "artifacts/base-event-index-verification.json" },
    },
    economics: {
      balances: {
        ownerBalanceWei: "1000000000000000000",
        agentBalanceWei: "0",
        source: { path: "artifacts/base-sepolia-health.json" },
      },
      payoutSummary: {
        totalAssignments: 1,
        paidAssignments: 1,
        unpaidAssignments: 0,
        blockedAssignments: 0,
        totalAmountWei: "100",
        paidAmountWei: "100",
        unpaidAmountWei: "0",
        blockedAmountWei: "0",
        lowestRemainingPeriodWei: "900",
        verified: params.payoutVerified,
        budgetFailureCount: 0,
        abuseSignalCount: params.abuseSignalCount ?? 0,
        abuseSignalAmountWei: params.abuseSignalAmountWei ?? "0",
        source: { path: "artifacts/economic-payout-summary.json" },
        verificationSource: { path: "artifacts/economic-payout-summary-verification.json" },
      },
    },
    ...(memoryStorage === "missing"
      ? {}
      : {
          memoryStorage: {
            verified: memoryStorage === "verified",
            memoryIdLabel: "agentos.memory.binding",
            publisher: "local",
            storageURI: `memory://local/0x${"33".repeat(32)}`,
            contentHash: `0x${"33".repeat(32)}`,
            source: { path: "artifacts/memory-storage-binding.json" },
            verificationSource: { path: "artifacts/memory-storage-binding-verification.json" },
            ...(memoryStorageMigration === "missing"
              ? {}
              : {
                  migration: {
                    verified: memoryStorageMigration === "verified",
                    source: { path: "artifacts/memory-storage-migration-verification.json" },
                    fromSource: { path: "storage/memory" },
                    toSource: { path: "storage/memory-migrated" },
                  },
                }),
          },
        }),
  };
}

function dashboardVerification(params: { passed: boolean }): OperatorDashboardVerification {
  return {
    passed: params.passed,
    failures: params.passed ? [] : ["operator dashboard snapshot is stale"],
    expected: dashboard({ economicEventCount: 2, payoutVerified: true }),
  };
}
