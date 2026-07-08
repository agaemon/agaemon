import { describe, expect, it } from "vitest";

import {
  formatFundingDemoReviewIndexSummary,
  formatFundingDemoReviewIndexVerificationSummary,
  renderFundingDemoReviewIndexHtml,
  verifyFundingDemoReviewIndex,
} from "./fundingDemoReviewIndex.js";
import type { OperatorDashboardSnapshot } from "./dashboard.js";
import type { FundingDemoEvidenceManifest } from "./fundingDemoEvidenceManifest.js";
import type {
  FundingReadyOperatorDemoReport,
  FundingReadyOperatorDemoVerification,
} from "./fundingReadyDemo.js";

const MANIFEST: FundingDemoEvidenceManifest = {
  schemaVersion: 1,
  generatedAt: "2026-07-03T00:00:00.000Z",
  network: "base-sepolia",
  objective: "AgentOS Kernel becomes a credible funding-ready AI x blockchain proof.",
  artifactRoot: "artifacts/funding-demo",
  trustBoundary: {
    ai: "proposes",
    policy: "decides",
    accounts: "execute",
    mainnet: false,
    liveFunds: false,
  },
  evidence: [
    {
      id: "operator-dashboard-html",
      label: "Operator dashboard <script>",
      path: "artifacts/funding-demo/operator-dashboard.html",
      role: "operator-view",
      required: true,
    },
    {
      id: "funding-proof",
      label: "Funding-ready proof",
      path: "artifacts/funding-demo/funding-ready-demo.json",
      role: "proof",
      required: true,
    },
  ],
};

const DASHBOARD: OperatorDashboardSnapshot = {
  schemaVersion: 1,
  generatedAt: "2026-07-03T00:00:00.000Z",
  launch: { decision: "go", passed: true, failedChecks: 0, source: { path: "artifacts/funding-demo/base-sepolia-launch-gate.json" } },
  health: { passed: true, failedChecks: 0, warnings: 0, source: { path: "artifacts/funding-demo/base-sepolia-health.json" } },
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
    indexedEventCount: 4,
    economicEventCount: 2,
    economicContracts: [{ contract: "payoutRuleAdapter", eventCount: 2 }],
    source: { path: "artifacts/funding-demo/base-event-index.json" },
    verificationSource: { path: "artifacts/funding-demo/base-event-index-verification.json" },
  },
  economics: {
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

const FUNDING_PROOF: FundingReadyOperatorDemoReport = {
  schemaVersion: 1,
  generatedAt: "2026-07-03T00:00:00.000Z",
  network: "base-sepolia",
  objective: "AgentOS Kernel becomes a credible funding-ready AI x blockchain proof.",
  passed: true,
  summary: { checks: 7, passed: 7, failed: 0 },
  economicAbuseSignals: { count: 2, amountWei: "500" },
  trustBoundary: {
    ai: "proposes",
    policy: "decides",
    accounts: "execute",
    mainnet: false,
    liveFunds: false,
  },
  evidence: {
    launchGate: { path: "artifacts/funding-demo/base-sepolia-launch-gate.json" },
    health: { path: "artifacts/funding-demo/base-sepolia-health.json" },
    releaseStatus: { path: "docs/releases/latest.json" },
    eventIndex: { path: "artifacts/funding-demo/base-event-index.json" },
    eventIndexVerification: { path: "artifacts/funding-demo/base-event-index-verification.json" },
    economicPayoutSummaryVerification: { path: "artifacts/funding-demo/economic-payout-summary-verification.json" },
    memoryStorageBinding: { path: "artifacts/funding-demo/memory-storage-binding.json" },
    memoryStorageBindingVerification: { path: "artifacts/funding-demo/memory-storage-binding-verification.json" },
    memoryStorageMigrationVerification: { path: "artifacts/funding-demo/memory-storage-migration-verification.json" },
    dashboard: { path: "artifacts/funding-demo/operator-dashboard.json" },
    dashboardVerification: { path: "artifacts/funding-demo/operator-dashboard-verification.json" },
  },
  checks: [
    { id: "launch-gate", label: "Launch gate", passed: true, failures: [] },
    { id: "dashboard", label: "Operator dashboard", passed: true, failures: [] },
  ],
};

const FUNDING_PROOF_VERIFICATION: FundingReadyOperatorDemoVerification = {
  passed: true,
  failures: [],
  expected: FUNDING_PROOF,
};

describe("renderFundingDemoReviewIndexHtml", () => {
  it("renders a static reviewer index for the local funding demo evidence bundle", () => {
    const html = renderFundingDemoReviewIndexHtml({
      manifest: MANIFEST,
      fundingProof: FUNDING_PROOF,
      fundingProofVerification: FUNDING_PROOF_VERIFICATION,
      dashboard: DASHBOARD,
    });

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<title>AgentOS Funding Demo Review</title>");
    expect(html).toContain("Base Sepolia / testnet only");
    expect(html).toContain("overall: passed");
    expect(html).toContain("proof verification: passed");
    expect(html).toContain("evidence files: 2");
    expect(html).toContain("memory migration: verified");
    expect(html).toContain("economic abuse signals: 2");
    expect(html).toContain("economic abuse signal wei: 500");
    expect(html).toContain("artifacts/funding-demo/operator-dashboard.html");
    expect(html).toContain("AI proposes, policy decides, accounts execute");
    expect(html).toContain("Operator dashboard &lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});

describe("formatFundingDemoReviewIndexSummary", () => {
  it("summarizes the review index without requiring RPC or signer env", () => {
    expect(formatFundingDemoReviewIndexSummary({
      manifest: MANIFEST,
      fundingProof: FUNDING_PROOF,
      fundingProofVerification: FUNDING_PROOF_VERIFICATION,
      dashboard: DASHBOARD,
      outputPath: "artifacts/funding-demo/index.html",
    })).toEqual([
      "Funding demo review index",
      "output: artifacts/funding-demo/index.html",
      "network: base-sepolia",
      "overall: passed",
      "proofVerification: passed",
      "evidence: 2 files",
      "economicAbuseSignals: count=2 amountWei=500",
      "trustBoundary: AI proposes, policy decides, accounts execute",
    ].join("\n"));
  });
});

describe("verifyFundingDemoReviewIndex", () => {
  it("passes when the saved review index matches the recomputed HTML", () => {
    const expected = renderFundingDemoReviewIndexHtml({
      manifest: MANIFEST,
      fundingProof: FUNDING_PROOF,
      fundingProofVerification: FUNDING_PROOF_VERIFICATION,
      dashboard: DASHBOARD,
    });

    const verification = verifyFundingDemoReviewIndex({
      savedHtml: expected,
      expectedHtml: expected,
    });

    expect(verification).toEqual({
      passed: true,
      failures: [],
      expectedHtml: expected,
    });
    expect(formatFundingDemoReviewIndexVerificationSummary(verification)).toContain("passed: true");
  });

  it("fails when the saved review index is stale", () => {
    const expected = renderFundingDemoReviewIndexHtml({
      manifest: MANIFEST,
      fundingProof: FUNDING_PROOF,
      fundingProofVerification: FUNDING_PROOF_VERIFICATION,
      dashboard: DASHBOARD,
    });

    const verification = verifyFundingDemoReviewIndex({
      savedHtml: expected.replace("overall: passed", "overall: failed"),
      expectedHtml: expected,
    });

    expect(verification).toEqual({
      passed: false,
      failures: ["funding demo review index is stale"],
      expectedHtml: expected,
    });
    expect(formatFundingDemoReviewIndexVerificationSummary(verification)).toContain("passed: false");
  });
});
