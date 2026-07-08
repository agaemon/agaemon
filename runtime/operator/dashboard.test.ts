import { describe, expect, it } from "vitest";

import {
  createOperatorDashboardSnapshot,
  formatOperatorDashboardSnapshotSummary,
  validateOperatorDashboardSnapshot,
} from "./dashboard.js";

const MEMORY_STORAGE_BINDING = {
  schemaVersion: 1,
  manifestPath: "deployments/base-sepolia/latest.json",
  storageDir: "storage/memory",
  memoryIdLabel: "agentos.memory.binding",
  binding: {
    schemaVersion: 1,
    deploymentManifest: {
      path: "deployments/base-sepolia/latest.json",
      sha256: "a".repeat(64),
    },
    memoryIdLabel: "agentos.memory.binding",
    record: {
      publisher: "local",
      memoryId: `0x${"11".repeat(32)}`,
      merkleRoot: `0x${"22".repeat(32)}`,
      contentHash: `0x${"33".repeat(32)}`,
      storageURIHash: `0x${"44".repeat(32)}`,
      storageURI: `memory://local/0x${"33".repeat(32)}`,
    },
    verification: { ok: true },
  },
  verification: { passed: true, failures: [] },
} as const;

const MEMORY_STORAGE_BINDING_VERIFICATION = {
  schemaVersion: 1,
  bindingPath: "artifacts/memory-storage-binding.json",
  manifestPath: "deployments/base-sepolia/latest.json",
  storageDir: "storage/memory",
  passed: true,
  failures: [],
  bindingVerification: { passed: true, failures: [] },
  storageVerification: {
    ok: true,
    checks: {
      memoryIdMatches: true,
      merkleRootMatches: true,
      contentHashMatches: true,
      storageURIHashMatches: true,
    },
  },
} as const;

const MEMORY_STORAGE_MIGRATION_VERIFICATION = {
  schemaVersion: 1,
  fromPath: "storage/memory",
  toPath: "storage/memory-migrated",
  passed: true,
  failures: [],
} as const;

describe("createOperatorDashboardSnapshot", () => {
  it("builds the LC4 first-screen response from verified source evidence", () => {
    const snapshot = createOperatorDashboardSnapshot({
      generatedAt: "2026-07-03T00:00:00.000Z",
      manifestPath: "deployments/base-sepolia/latest.json",
      manifest: {
        network: "base-sepolia",
        chainId: 84532,
        rpcUrlEnv: "BASE_SEPOLIA_RPC_URL",
        explorerUrl: "https://sepolia.basescan.org",
        owner: "0x0000000000000000000000000000000000000001",
        agentProfile: {
          roleLabel: "agentos.kernel.operator",
          metadataURI: "agentos://base-sepolia/agent-account/v1",
        },
        contracts: {
          capabilityRegistry: "0x0000000000000000000000000000000000001001",
          policyEngine: "0x0000000000000000000000000000000000001002",
          reputationRegistry: "0x0000000000000000000000000000000000001003",
          agentAccount: "0x0000000000000000000000000000000000001004",
          testTargetProtocol: "0x0000000000000000000000000000000000001005",
        },
        transactions: {
          deployCapabilityRegistry: `0x${"11".repeat(32)}`,
          deployPolicyEngine: `0x${"22".repeat(32)}`,
          deployReputationRegistry: `0x${"33".repeat(32)}`,
          deployAgentAccount: `0x${"44".repeat(32)}`,
          deployTestTargetProtocol: `0x${"55".repeat(32)}`,
          setCapability: `0x${"66".repeat(32)}`,
          setPolicy: `0x${"77".repeat(32)}`,
          smokeExecute: `0x${"88".repeat(32)}`,
        },
        smokeTest: {
          capability: `0x${"99".repeat(32)}`,
          targetWasCalled: true,
        },
      },
      launchGatePath: "artifacts/base-sepolia-launch-gate.json",
      launchGate: {
        schemaVersion: 1,
        generatedAt: "2026-07-03T00:00:00.000Z",
        manifestPath: "deployments/base-sepolia/latest.json",
        manifestSha256: "a".repeat(64),
        releaseStatusPath: "docs/releases/latest.json",
        commitSha: "a".repeat(40),
        readinessRunUrl: "https://github.com/sagaratalatti/agentos-kernel/actions/runs/1",
        decision: "go",
        passed: true,
        summary: { checks: 3, passed: 3, failed: 0 },
        checks: [
          { id: "readiness-checkpoint", label: "Readiness checkpoint", passed: true, failures: [] },
          { id: "health", label: "Health report", passed: true, failures: [] },
          { id: "manifest-consistency", label: "Manifest consistency", passed: true, failures: [] },
        ],
      },
      healthPath: "artifacts/base-sepolia-health.json",
      health: {
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
        passed: true,
        summary: { checks: 4, passed: 4, failed: 0, warnings: 0 },
        checks: [
          {
            id: "manifest-shape",
            label: "Deployment manifest shape",
            severity: "critical",
            passed: true,
            failures: [],
            remediation: "Regenerate the manifest.",
          },
        ],
      },
      releaseStatusPath: "docs/releases/latest.json",
      releaseStatusJson: JSON.stringify({
        schemaVersion: 1,
        network: "base-sepolia",
        releaseCount: 1,
        latest: {
          note: "base-sepolia-2026-06-25-4c7e8c2.md",
          generatedAt: "2026-07-02T00:00:00.000Z",
          commitSha: "a".repeat(40),
          shortCommitSha: "a".repeat(7),
          manifestSha256: "a".repeat(64),
          readinessRunUrl: "https://github.com/sagaratalatti/agentos-kernel/actions/runs/1",
          readinessRunId: "1",
          checksSummary: "3 passed, 0 failed",
        },
        releases: [
          {
            note: "base-sepolia-2026-06-25-4c7e8c2.md",
            generatedAt: "2026-07-02T00:00:00.000Z",
            commitSha: "a".repeat(40),
            readinessRunUrl: "https://github.com/sagaratalatti/agentos-kernel/actions/runs/1",
          },
        ],
      }),
      eventIndexPath: "artifacts/base-event-index.json",
      eventIndexVerificationPath: "artifacts/base-event-index-verification.json",
      eventIndex: {
        schemaVersion: 1,
        manifest: {
          path: "deployments/base-sepolia/latest.json",
          network: "base-sepolia",
          chainId: 84532,
          contracts: {
            agentAccount: "0x0000000000000000000000000000000000001004",
          },
        },
        replay: {
          fromBlock: "0",
          toBlock: null,
          inputLogCount: 2,
          indexedEventCount: 2,
        },
        economicEvents: {
          eventCount: 1,
          latestBlock: "101",
          byContract: [{ contract: "payoutRuleAdapter", eventCount: 1 }],
          byEventName: [{ eventName: "PayoutSent", eventCount: 1 }],
        },
        events: [],
      },
      eventIndexVerification: {
        passed: true,
        summary: { checks: 7, passed: 7, failed: 0 },
        failures: [],
        checks: [],
        store: {
          path: "artifacts/base-event-index.json",
          sha256: "a".repeat(64),
        },
      },
      economicPayoutSummaryPath: "artifacts/economic-payout-summary.json",
      economicPayoutSummary: {
        totalAssignments: 3,
        paidAssignments: 1,
        unpaidAssignments: 1,
        blockedAssignments: 1,
        totalAmountWei: "600",
        paidAmountWei: "100",
        unpaidAmountWei: "200",
        blockedAmountWei: "300",
        lowestRemainingPeriodWei: "0",
        reasons: [
          { reason: "assignment-payout-receipt-recorded", count: 1, amountWei: "100" },
          { reason: "payout-daily-limit-exceeded", count: 1, amountWei: "300" },
          { reason: "ready-for-payout", count: 1, amountWei: "200" },
        ],
        abuseSignals: {
          invalidAssignments: { count: 0, amountWei: "0", assignmentIds: [] },
          ruleOrBudgetBlocks: { count: 1, amountWei: "300", assignmentIds: ["3"] },
          evidenceMismatches: { count: 0, amountWei: "0", assignmentIds: [] },
          policyBlocks: { count: 0, amountWei: "0", assignmentIds: [] },
        },
        budgetFailures: [
          {
            assignmentId: "3",
            failures: ["budget spend exceeds remaining period budget"],
          },
        ],
      },
      economicPayoutSummaryVerificationPath: "artifacts/economic-payout-summary-verification.json",
      economicPayoutSummaryVerification: {
        passed: true,
        failures: [],
        expected: {
          totalAssignments: 3,
          paidAssignments: 1,
          unpaidAssignments: 1,
          blockedAssignments: 1,
          totalAmountWei: "600",
          paidAmountWei: "100",
          unpaidAmountWei: "200",
          blockedAmountWei: "300",
          lowestRemainingPeriodWei: "0",
          reasons: [
            { reason: "assignment-payout-receipt-recorded", count: 1, amountWei: "100" },
            { reason: "payout-daily-limit-exceeded", count: 1, amountWei: "300" },
            { reason: "ready-for-payout", count: 1, amountWei: "200" },
          ],
          abuseSignals: {
            invalidAssignments: { count: 0, amountWei: "0", assignmentIds: [] },
            ruleOrBudgetBlocks: { count: 1, amountWei: "300", assignmentIds: ["3"] },
            evidenceMismatches: { count: 0, amountWei: "0", assignmentIds: [] },
            policyBlocks: { count: 0, amountWei: "0", assignmentIds: [] },
          },
          budgetFailures: [
            {
              assignmentId: "3",
              failures: ["budget spend exceeds remaining period budget"],
            },
          ],
        },
      },
      memoryStorageBindingPath: "artifacts/memory-storage-binding.json",
      memoryStorageBinding: MEMORY_STORAGE_BINDING,
      memoryStorageBindingVerificationPath: "artifacts/memory-storage-binding-verification.json",
      memoryStorageBindingVerification: MEMORY_STORAGE_BINDING_VERIFICATION,
      memoryStorageMigrationVerificationPath: "artifacts/memory-storage-migration-verification.json",
      memoryStorageMigrationVerification: MEMORY_STORAGE_MIGRATION_VERIFICATION,
    });

    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      generatedAt: "2026-07-03T00:00:00.000Z",
      launch: {
        decision: "go",
        passed: true,
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
      },
      release: {
        latestCommitSha: "a".repeat(40),
        source: { path: "docs/releases/latest.json" },
      },
      eventIndex: {
        verified: true,
        indexedEventCount: 2,
        economicEventCount: 1,
        economicContracts: [{ contract: "payoutRuleAdapter", eventCount: 1 }],
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
          totalAssignments: 3,
          paidAssignments: 1,
          unpaidAssignments: 1,
          blockedAssignments: 1,
          totalAmountWei: "600",
          paidAmountWei: "100",
          unpaidAmountWei: "200",
          blockedAmountWei: "300",
          verified: true,
          budgetFailureCount: 1,
          abuseSignalCount: 1,
          abuseSignalAmountWei: "300",
          source: { path: "artifacts/economic-payout-summary.json" },
          verificationSource: { path: "artifacts/economic-payout-summary-verification.json" },
        },
      },
      memoryStorage: {
        verified: true,
        memoryIdLabel: "agentos.memory.binding",
        publisher: "local",
        storageURI: `memory://local/0x${"33".repeat(32)}`,
        contentHash: `0x${"33".repeat(32)}`,
        source: { path: "artifacts/memory-storage-binding.json" },
        verificationSource: { path: "artifacts/memory-storage-binding-verification.json" },
        migration: {
          verified: true,
          source: { path: "artifacts/memory-storage-migration-verification.json" },
          fromSource: { path: "storage/memory" },
          toSource: { path: "storage/memory-migrated" },
        },
      },
    });
    validateOperatorDashboardSnapshot(snapshot);
    expect(snapshot.eventIndex?.storeSha256).toBe("a".repeat(64));
    const summary = formatOperatorDashboardSnapshotSummary(snapshot);
    expect(summary).toContain("launch: go");
    expect(summary).toContain("eventIndex: verified (2 events, 1 economic)");
    expect(summary).toContain(`eventIndexStoreSha256: ${"a".repeat(64)}`);
    expect(summary).toContain("economicBalances: owner=1000000000000000000 agent=0");
    expect(summary).toContain("economicPayouts: verified total=3 paid=1 unpaid=1 blocked=1 budgetFailures=1 abuseSignals=1 abuseSignalAmountWei=300");
    expect(summary).toContain("memoryStorage: verified local agentos.memory.binding");
    expect(summary).toContain("memoryMigration: verified storage/memory -> storage/memory-migrated");
  });
});
