import { describe, expect, it } from "vitest";

import {
  formatOperatorDashboardHtmlSummary,
  renderOperatorDashboardHtml,
} from "./dashboardHtml.js";
import type { OperatorDashboardSnapshot } from "./dashboard.js";

const SNAPSHOT: OperatorDashboardSnapshot = {
  schemaVersion: 1,
  generatedAt: "2026-07-03T00:00:00.000Z",
  launch: {
    decision: "go",
    passed: true,
    failedChecks: 0,
    source: { path: "artifacts/funding-demo/base-sepolia-launch-gate.json" },
  },
  health: {
    passed: true,
    failedChecks: 0,
    warnings: 1,
    source: { path: "artifacts/funding-demo/base-sepolia-health.json" },
  },
  agent: {
    address: "0x0000000000000000000000000000000000001004",
    roleLabel: "agentos.kernel.operator",
    metadataURI: "agentos://base-sepolia/<script>",
    source: { path: "deployments/base-sepolia/latest.json" },
  },
  release: {
    latestCommitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    latestGeneratedAt: "2026-07-02T00:00:00.000Z",
    latestReadinessRunUrl: "https://github.com/sagaratalatti/agentos-kernel/actions/runs/1",
    source: { path: "docs/releases/latest.json" },
  },
  eventIndex: {
    verified: true,
    indexedEventCount: 4,
    economicEventCount: 2,
    economicContracts: [{ contract: "payoutRuleAdapter", eventCount: 2 }],
    storeSha256: "a".repeat(64),
    source: { path: "artifacts/funding-demo/base-event-index.json" },
    verificationSource: { path: "artifacts/funding-demo/base-event-index-verification.json" },
  },
  economics: {
    balances: {
      ownerBalanceWei: "1000000000000000000",
      agentBalanceWei: "250000000000000000",
      source: { path: "artifacts/funding-demo/base-sepolia-health.json" },
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
      lowestRemainingPeriodWei: "0",
      verified: true,
      budgetFailureCount: 1,
      abuseSignalCount: 2,
      abuseSignalAmountWei: "500",
      source: { path: "artifacts/funding-demo/economic-payout-summary.json" },
      verificationSource: { path: "artifacts/funding-demo/economic-payout-summary-verification.json" },
    },
  },
  memoryStorage: {
    verified: true,
    memoryIdLabel: "agentos.memory.funding-demo",
    publisher: "local",
    storageURI: "memory://local/demo",
    contentHash: "0x3333",
    source: { path: "artifacts/funding-demo/memory-storage-binding.json" },
    verificationSource: { path: "artifacts/funding-demo/memory-storage-binding-verification.json" },
    migration: {
      verified: true,
      source: { path: "artifacts/funding-demo/memory-storage-migration-verification.json" },
      fromSource: { path: "artifacts/funding-demo/memory-storage-binding.json" },
      toSource: { path: "artifacts/funding-demo/memory-storage-binding-migrated.json" },
    },
  },
};

describe("renderOperatorDashboardHtml", () => {
  it("renders a static local operator dashboard with source evidence and trust boundary", () => {
    const html = renderOperatorDashboardHtml(SNAPSHOT);

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<title>AgentOS Operator Dashboard</title>");
    expect(html).toContain("AgentOS Operator Dashboard");
    expect(html).toContain("AI proposes, policy decides, accounts execute");
    expect(html).toContain("Base Sepolia / testnet only");
    expect(html).toContain("Launch gate");
    expect(html).toContain("go");
    expect(html).toContain("Health");
    expect(html).toContain("warnings: 1");
    expect(html).toContain("Event index");
    expect(html).toContain("4 indexed / 2 economic");
    expect(html).toContain(`store sha256: ${"a".repeat(64)}`);
    expect(html).toContain("Payout evidence");
    expect(html).toContain("abuse signals: 2");
    expect(html).toContain("abuse signal wei: 500");
    expect(html).toContain("Memory storage");
    expect(html).toContain("migration: verified");
    expect(html).toContain("artifacts/funding-demo/memory-storage-migration-verification.json");
    expect(html).toContain("artifacts/funding-demo/base-sepolia-launch-gate.json");
    expect(html).toContain("artifacts/funding-demo/operator-dashboard.html");
    expect(html).not.toContain("<script>");
    expect(html).toContain("agentos://base-sepolia/&lt;script&gt;");
  });

  it("summarizes the rendered dashboard without exposing RPC or signer requirements", () => {
    expect(formatOperatorDashboardHtmlSummary(SNAPSHOT, "artifacts/operator-dashboard.html")).toEqual([
      "Operator dashboard HTML",
      "output: artifacts/operator-dashboard.html",
      "launch: go",
      "health: passed",
      "eventIndex: verified",
      "memoryStorage: verified",
      "trustBoundary: AI proposes, policy decides, accounts execute",
    ].join("\n"));
  });
});
