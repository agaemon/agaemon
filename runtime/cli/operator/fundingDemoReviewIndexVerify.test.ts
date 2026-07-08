import { describe, expect, it } from "vitest";

import {
  formatFundingDemoReviewIndexVerifyCliOutput,
  parseFundingDemoReviewIndexVerifyCliArgs,
  runFundingDemoReviewIndexVerifyCli,
} from "./fundingDemoReviewIndexVerify.js";
import {
  renderFundingDemoReviewIndexHtml,
  type FundingDemoReviewIndexVerification,
} from "../../operator/fundingDemoReviewIndex.js";
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
    { id: "review-index", label: "Funding demo review index", path: "artifacts/funding-demo/index.html", role: "operator-view", required: true },
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

const HTML = renderFundingDemoReviewIndexHtml({
  manifest: MANIFEST,
  fundingProof: FUNDING_PROOF,
  fundingProofVerification: FUNDING_PROOF_VERIFICATION,
  dashboard: DASHBOARD,
});

const VERIFICATION: FundingDemoReviewIndexVerification = {
  passed: true,
  failures: [],
  expectedHtml: HTML,
};

describe("parseFundingDemoReviewIndexVerifyCliArgs", () => {
  it("parses review index, evidence, proof, dashboard, output, and format paths", () => {
    expect(parseFundingDemoReviewIndexVerifyCliArgs([
      "--review-index", "artifacts/demo/index.html",
      "--evidence-manifest", "artifacts/demo/evidence-manifest.json",
      "--funding-proof", "artifacts/demo/funding-ready-demo.json",
      "--funding-proof-verification", "artifacts/demo/funding-ready-demo-verification.json",
      "--dashboard", "artifacts/demo/operator-dashboard.json",
      "--output", "artifacts/demo/index-verification.json",
      "--format", "summary",
    ])).toEqual({
      reviewIndexPath: "artifacts/demo/index.html",
      evidenceManifestPath: "artifacts/demo/evidence-manifest.json",
      fundingProofPath: "artifacts/demo/funding-ready-demo.json",
      fundingProofVerificationPath: "artifacts/demo/funding-ready-demo-verification.json",
      dashboardPath: "artifacts/demo/operator-dashboard.json",
      outputPath: "artifacts/demo/index-verification.json",
      format: "summary",
    });
  });
});

describe("runFundingDemoReviewIndexVerifyCli", () => {
  it("writes review index verification without RPC or signer env", async () => {
    const outputs: string[] = [];
    const writes: unknown[] = [];
    const env: Record<string, string | undefined> = {};

    await runFundingDemoReviewIndexVerifyCli({
      argv: ["--output", "artifacts/funding-demo/index-verification.json", "--format", "summary"],
      env,
      readText: readFixture,
      writeOutput: (output) => outputs.push(output),
      writeText: async (path, contents) => { writes.push({ path, passed: JSON.parse(contents).passed }); },
      mkdirp: async (path) => { writes.push({ mkdir: path }); },
    });

    expect(writes).toEqual([
      { mkdir: "artifacts/funding-demo" },
      { path: "artifacts/funding-demo/index-verification.json", passed: true },
    ]);
    expect(outputs[0]).toContain("Funding demo review index verification");
    expect(env.BASE_SEPOLIA_RPC_URL).toBeUndefined();
    expect(env.PRIVATE_KEY).toBeUndefined();
  });

  it("fails closed when the saved review index is stale", async () => {
    const outputs: string[] = [];
    const writes: unknown[] = [];
    const exitCodes: number[] = [];

    await runFundingDemoReviewIndexVerifyCli({
      argv: ["--output", "artifacts/funding-demo/index-verification.json", "--format", "summary"],
      readText: async (path) => path.endsWith("index.html")
        ? HTML.replace("overall: passed", "overall: failed")
        : readFixture(path),
      writeOutput: (output) => outputs.push(output),
      writeText: async (path, contents) => {
        const verification = JSON.parse(contents) as { passed: boolean; failures: string[] };
        writes.push({ path, passed: verification.passed, failures: verification.failures });
      },
      mkdirp: async () => {},
      setExitCode: (code) => exitCodes.push(code),
    });

    expect(writes).toEqual([
      {
        path: "artifacts/funding-demo/index-verification.json",
        passed: false,
        failures: ["funding demo review index is stale"],
      },
    ]);
    expect(outputs[0]).toContain("passed: false");
    expect(exitCodes).toEqual([1]);
  });
});

describe("formatFundingDemoReviewIndexVerifyCliOutput", () => {
  it("formats JSON and summary output", () => {
    expect(formatFundingDemoReviewIndexVerifyCliOutput(VERIFICATION, "json")).toContain("\"passed\": true");
    expect(formatFundingDemoReviewIndexVerifyCliOutput(VERIFICATION, "summary")).toContain("passed: true");
  });
});

async function readFixture(path: string): Promise<string> {
  if (path.endsWith("index.html")) return HTML;
  if (path.endsWith("evidence-manifest.json")) return JSON.stringify(MANIFEST);
  if (path.endsWith("funding-ready-demo-verification.json")) return JSON.stringify(FUNDING_PROOF_VERIFICATION);
  if (path.endsWith("funding-ready-demo.json")) return JSON.stringify(FUNDING_PROOF);
  return JSON.stringify(DASHBOARD);
}
