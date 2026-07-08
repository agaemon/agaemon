import { describe, expect, it } from "vitest";

import type { OperatorDashboardSnapshot } from "../../operator/dashboard.js";
import type { OperatorDashboardVerification } from "../../operator/dashboardVerify.js";
import {
  formatOperatorDashboardVerifyCliOutput,
  parseOperatorDashboardVerifyCliArgs,
  runOperatorDashboardVerifyCli,
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
const VERIFICATION: OperatorDashboardVerification = {
  passed: true,
  failures: [],
  expected: SNAPSHOT,
};

describe("parseOperatorDashboardVerifyCliArgs", () => {
  it("parses dashboard, source evidence, output, and format paths", () => {
    expect(parseOperatorDashboardVerifyCliArgs([
      "--dashboard", "artifacts/custom-dashboard.json",
      "--manifest", "deployments/base-sepolia/custom.json",
      "--launch-gate", "artifacts/launch.json",
      "--health=artifacts/health.json",
      "--release-status", "docs/releases/custom.json",
      "--event-index", "artifacts/events.json",
      "--event-index-verification=artifacts/events-verify.json",
      "--economic-payout-summary", "artifacts/economic-payout-summary.json",
      "--economic-payout-summary-verification", "artifacts/economic-payout-summary-verification.json",
      "--memory-storage-binding", "artifacts/memory-storage-binding.json",
      "--memory-storage-binding-verification", "artifacts/memory-storage-binding-verification.json",
      "--memory-storage-migration-verification", "artifacts/memory-storage-migration-verification.json",
      "--output=artifacts/dashboard-verify.json",
      "--format", "summary",
    ])).toEqual({
      dashboardPath: "artifacts/custom-dashboard.json",
      manifestPath: "deployments/base-sepolia/custom.json",
      launchGatePath: "artifacts/launch.json",
      healthPath: "artifacts/health.json",
      releaseStatusPath: "docs/releases/custom.json",
      eventIndexPath: "artifacts/events.json",
      eventIndexVerificationPath: "artifacts/events-verify.json",
      economicPayoutSummaryPath: "artifacts/economic-payout-summary.json",
      economicPayoutSummaryVerificationPath: "artifacts/economic-payout-summary-verification.json",
      memoryStorageBindingPath: "artifacts/memory-storage-binding.json",
      memoryStorageBindingVerificationPath: "artifacts/memory-storage-binding-verification.json",
      memoryStorageMigrationVerificationPath: "artifacts/memory-storage-migration-verification.json",
      outputPath: "artifacts/dashboard-verify.json",
      format: "summary",
    });
  });

  it("requires event index and event index verification together", () => {
    expect(() => parseOperatorDashboardVerifyCliArgs(["--event-index", "artifacts/events.json"])).toThrow(
      "--event-index and --event-index-verification must be provided together",
    );
  });
});

describe("runOperatorDashboardVerifyCli", () => {
  it("verifies a saved dashboard locally without RPC or PRIVATE_KEY", async () => {
    const outputs: string[] = [];
    const writes: unknown[] = [];
    const env: Record<string, string | undefined> = {};

    await runOperatorDashboardVerifyCli({
      argv: ["--output", "artifacts/operator-dashboard-verification.json", "--format", "summary"],
      env,
      writeOutput: (output) => outputs.push(output),
      readText: async () => JSON.stringify(SNAPSHOT),
      readManifest: async () => ({
        network: "base-sepolia",
        chainId: 84532,
        rpcUrlEnv: "BASE_SEPOLIA_RPC_URL",
        explorerUrl: "https://sepolia.basescan.org",
        owner: "0x0000000000000000000000000000000000000001",
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
      }),
      createSnapshot: () => SNAPSHOT,
      verifySnapshot: () => VERIFICATION,
      writeText: async (path, contents) => { writes.push({ path, contents }); },
    });

    expect(writes).toEqual([
      {
        path: "artifacts/operator-dashboard-verification.json",
        contents: `${JSON.stringify(VERIFICATION, null, 2)}\n`,
      },
    ]);
    expect(outputs[0]).toContain("passed: true");
    expect(env.BASE_SEPOLIA_RPC_URL).toBeUndefined();
    expect(env.PRIVATE_KEY).toBeUndefined();
  });

  it("passes optional economic payout summary evidence into the recomputed snapshot", async () => {
    const snapshotParams: unknown[] = [];

    await runOperatorDashboardVerifyCli({
      argv: [
        "--economic-payout-summary",
        "artifacts/economic-payout-summary.json",
        "--economic-payout-summary-verification",
        "artifacts/economic-payout-summary-verification.json",
        "--format",
        "summary",
      ],
      writeOutput: () => {},
      readText: async (path) => {
        if (path === "artifacts/economic-payout-summary.json") {
          return JSON.stringify({
            totalAssignments: 1,
            paidAssignments: 1,
            unpaidAssignments: 0,
            blockedAssignments: 0,
            totalAmountWei: "100",
            paidAmountWei: "100",
            unpaidAmountWei: "0",
            blockedAmountWei: "0",
            lowestRemainingPeriodWei: "900",
            reasons: [{ reason: "assignment-payout-receipt-recorded", count: 1, amountWei: "100" }],
            budgetFailures: [],
          });
        }
        if (path === "artifacts/economic-payout-summary-verification.json") {
          return JSON.stringify({
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
              reasons: [{ reason: "assignment-payout-receipt-recorded", count: 1, amountWei: "100" }],
              budgetFailures: [],
            },
          });
        }
        return JSON.stringify(SNAPSHOT);
      },
      readManifest: async () => ({
        network: "base-sepolia",
        chainId: 84532,
        rpcUrlEnv: "BASE_SEPOLIA_RPC_URL",
        explorerUrl: "https://sepolia.basescan.org",
        owner: "0x0000000000000000000000000000000000000001",
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
      }),
      createSnapshot: (params) => {
        snapshotParams.push(params);
        return SNAPSHOT;
      },
      verifySnapshot: () => VERIFICATION,
    });

    expect(snapshotParams[0]).toMatchObject({
      economicPayoutSummaryPath: "artifacts/economic-payout-summary.json",
      economicPayoutSummaryVerificationPath: "artifacts/economic-payout-summary-verification.json",
      economicPayoutSummary: {
        totalAssignments: 1,
        paidAssignments: 1,
        paidAmountWei: "100",
        budgetFailures: [],
      },
      economicPayoutSummaryVerification: {
        passed: true,
        failures: [],
      },
    });
  });

  it("passes optional memory storage binding evidence into the recomputed snapshot", async () => {
    const snapshotParams: unknown[] = [];

    await runOperatorDashboardVerifyCli({
      argv: [
        "--memory-storage-binding",
        "artifacts/memory-storage-binding.json",
        "--memory-storage-binding-verification",
        "artifacts/memory-storage-binding-verification.json",
        "--memory-storage-migration-verification",
        "artifacts/memory-storage-migration-verification.json",
        "--format",
        "summary",
      ],
      writeOutput: () => {},
      readText: async (path) => {
        if (path === "artifacts/memory-storage-binding.json") {
          return JSON.stringify({
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
          });
        }
        if (path === "artifacts/memory-storage-binding-verification.json") {
          return JSON.stringify({
            schemaVersion: 1,
            bindingPath: "artifacts/memory-storage-binding.json",
            manifestPath: "deployments/base-sepolia/latest.json",
            storageDir: "storage/memory",
            passed: true,
            failures: [],
            bindingVerification: { passed: true, failures: [] },
          });
        }
        if (path === "artifacts/memory-storage-migration-verification.json") {
          return JSON.stringify({
            schemaVersion: 1,
            fromPath: "storage/memory",
            toPath: "storage/memory-migrated",
            passed: true,
            failures: [],
          });
        }
        return JSON.stringify(SNAPSHOT);
      },
      readManifest: async () => ({
        network: "base-sepolia",
        chainId: 84532,
        rpcUrlEnv: "BASE_SEPOLIA_RPC_URL",
        explorerUrl: "https://sepolia.basescan.org",
        owner: "0x0000000000000000000000000000000000000001",
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
      }),
      createSnapshot: (params) => {
        snapshotParams.push(params);
        return SNAPSHOT;
      },
      verifySnapshot: () => VERIFICATION,
    });

    expect(snapshotParams[0]).toMatchObject({
      memoryStorageBindingPath: "artifacts/memory-storage-binding.json",
      memoryStorageBindingVerificationPath: "artifacts/memory-storage-binding-verification.json",
      memoryStorageBinding: {
        memoryIdLabel: "agentos.memory.binding",
        binding: {
          record: {
            publisher: "local",
            storageURI: `memory://local/0x${"33".repeat(32)}`,
          },
        },
      },
      memoryStorageBindingVerification: {
        passed: true,
        bindingVerification: { passed: true },
      },
      memoryStorageMigrationVerificationPath: "artifacts/memory-storage-migration-verification.json",
      memoryStorageMigrationVerification: {
        passed: true,
        fromPath: "storage/memory",
        toPath: "storage/memory-migrated",
      },
    });
  });
});

describe("formatOperatorDashboardVerifyCliOutput", () => {
  it("formats JSON and summary output", () => {
    expect(formatOperatorDashboardVerifyCliOutput(VERIFICATION, "json")).toContain("\"passed\": true");
    expect(formatOperatorDashboardVerifyCliOutput(VERIFICATION, "summary")).toContain("passed: true");
  });
});
