import { describe, expect, it } from "vitest";

import {
  formatFundingDemoReviewIndexCliOutput,
  parseFundingDemoReviewIndexCliArgs,
  runFundingDemoReviewIndexCli,
} from "./fundingDemoReviewIndex.js";
import type { OperatorDashboardSnapshot } from "../../operator/dashboard.js";
import type { FundingDemoEvidenceManifest } from "../../operator/fundingDemoEvidenceManifest.js";
import type {
  FundingReadyOperatorDemoReport,
  FundingReadyOperatorDemoVerification,
} from "../../operator/fundingReadyDemo.js";

const MANIFEST: FundingDemoEvidenceManifest = {
  schemaVersion: 1,
  generatedAt: "2026-07-03T00:00:00.000Z",
  network: "base-sepolia",
  objective: "AgentOS Kernel becomes a credible funding-ready AI x blockchain proof.",
  artifactRoot: "artifacts/funding-demo",
  trustBoundary: { ai: "proposes", policy: "decides", accounts: "execute", mainnet: false, liveFunds: false },
  evidence: [
    { id: "funding-proof", label: "Funding-ready proof", path: "artifacts/funding-demo/funding-ready-demo.json", role: "proof", required: true },
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
  economics: {
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
      verified: true,
      budgetFailureCount: 0,
      abuseSignalCount: 0,
      abuseSignalAmountWei: "0",
      source: { path: "artifacts/funding-demo/economic-payout-summary.json" },
      verificationSource: { path: "artifacts/funding-demo/economic-payout-summary-verification.json" },
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
  economicAbuseSignals: { count: 0, amountWei: "0" },
  trustBoundary: { ai: "proposes", policy: "decides", accounts: "execute", mainnet: false, liveFunds: false },
  evidence: {
    launchGate: { path: "artifacts/funding-demo/base-sepolia-launch-gate.json" },
    health: { path: "artifacts/funding-demo/base-sepolia-health.json" },
    releaseStatus: { path: "docs/releases/latest.json" },
    eventIndex: { path: "artifacts/funding-demo/base-event-index.json" },
    eventIndexVerification: { path: "artifacts/funding-demo/base-event-index-verification.json" },
    economicPayoutSummaryVerification: { path: "artifacts/funding-demo/economic-payout-summary-verification.json" },
    dashboard: { path: "artifacts/funding-demo/operator-dashboard.json" },
    dashboardVerification: { path: "artifacts/funding-demo/operator-dashboard-verification.json" },
  },
  checks: [{ id: "launch-gate", label: "Launch gate", passed: true, failures: [] }],
};

const FUNDING_PROOF_VERIFICATION: FundingReadyOperatorDemoVerification = {
  passed: true,
  failures: [],
  expected: FUNDING_PROOF,
};

describe("parseFundingDemoReviewIndexCliArgs", () => {
  it("parses evidence, proof, dashboard, output, and format paths", () => {
    expect(parseFundingDemoReviewIndexCliArgs([
      "--evidence-manifest", "artifacts/demo/evidence-manifest.json",
      "--funding-proof", "artifacts/demo/funding-ready-demo.json",
      "--funding-proof-verification", "artifacts/demo/funding-ready-demo-verification.json",
      "--dashboard", "artifacts/demo/operator-dashboard.json",
      "--output", "artifacts/demo/index.html",
      "--format", "summary",
    ])).toEqual({
      evidenceManifestPath: "artifacts/demo/evidence-manifest.json",
      fundingProofPath: "artifacts/demo/funding-ready-demo.json",
      fundingProofVerificationPath: "artifacts/demo/funding-ready-demo-verification.json",
      dashboardPath: "artifacts/demo/operator-dashboard.json",
      outputPath: "artifacts/demo/index.html",
      format: "summary",
    });
  });
});

describe("runFundingDemoReviewIndexCli", () => {
  it("writes local reviewer HTML without RPC or signer env", async () => {
    const outputs: string[] = [];
    const writes: unknown[] = [];
    const env: Record<string, string | undefined> = {};

    await runFundingDemoReviewIndexCli({
      argv: ["--output", "artifacts/funding-demo/index.html", "--format", "summary"],
      env,
      readText: async (path) => {
        if (path.endsWith("evidence-manifest.json")) return JSON.stringify(MANIFEST);
        if (path.endsWith("funding-ready-demo-verification.json")) return JSON.stringify(FUNDING_PROOF_VERIFICATION);
        if (path.endsWith("funding-ready-demo.json")) return JSON.stringify(FUNDING_PROOF);
        return JSON.stringify(DASHBOARD);
      },
      writeOutput: (output) => outputs.push(output),
      writeText: async (path, contents) => { writes.push({ path, hasHtml: contents.includes("<!doctype html>") }); },
      mkdirp: async (path) => { writes.push({ mkdir: path }); },
    });

    expect(writes).toEqual([
      { mkdir: "artifacts/funding-demo" },
      { path: "artifacts/funding-demo/index.html", hasHtml: true },
    ]);
    expect(outputs[0]).toContain("Funding demo review index");
    expect(env.BASE_SEPOLIA_RPC_URL).toBeUndefined();
    expect(env.PRIVATE_KEY).toBeUndefined();
  });
});

describe("formatFundingDemoReviewIndexCliOutput", () => {
  it("formats HTML and summary output", () => {
    const params = {
      manifest: MANIFEST,
      fundingProof: FUNDING_PROOF,
      fundingProofVerification: FUNDING_PROOF_VERIFICATION,
      dashboard: DASHBOARD,
    };

    expect(formatFundingDemoReviewIndexCliOutput(params, "html", "artifacts/funding-demo/index.html")).toContain("<!doctype html>");
    expect(formatFundingDemoReviewIndexCliOutput(params, "summary", "artifacts/funding-demo/index.html")).toContain("output: artifacts/funding-demo/index.html");
    expect(formatFundingDemoReviewIndexCliOutput(params, "summary", "artifacts/funding-demo/index.html")).toContain("economicAbuseSignals: count=0 amountWei=0");
  });
});
