import { describe, expect, it } from "vitest";

import {
  formatFundingDemoStatusCliOutput,
  parseFundingDemoStatusCliArgs,
  runFundingDemoStatusCli,
} from "./fundingDemoStatus.js";
import { createFundingDemoEvidenceManifest } from "../../operator/fundingDemoEvidenceManifest.js";
import { createFundingDemoStatus } from "../../operator/fundingDemoStatus.js";
import type { FundingDemoEvidenceManifestVerification } from "../../operator/fundingDemoEvidenceManifest.js";
import type { FundingDemoReviewIndexVerification } from "../../operator/fundingDemoReviewIndex.js";
import type {
  FundingReadyOperatorDemoReport,
  FundingReadyOperatorDemoVerification,
} from "../../operator/fundingReadyDemo.js";

const FUNDING_PROOF: FundingReadyOperatorDemoReport = {
  schemaVersion: 1,
  generatedAt: "2026-07-03T00:00:00.000Z",
  network: "base-sepolia",
  objective: "AgentOS Kernel becomes a credible funding-ready AI x blockchain proof.",
  passed: true,
  summary: { checks: 7, passed: 7, failed: 0 },
  economicAbuseSignals: { count: 0, amountWei: "0" },
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

const REVIEW_INDEX_VERIFICATION: FundingDemoReviewIndexVerification = {
  passed: true,
  failures: [],
  expectedHtml: "<!doctype html>",
};

const EVIDENCE_MANIFEST_VERIFICATION: FundingDemoEvidenceManifestVerification = {
  passed: true,
  failures: [],
  expected: createFundingDemoEvidenceManifest({ generatedAt: "2026-07-03T00:00:00.000Z" }),
};

describe("parseFundingDemoStatusCliArgs", () => {
  it("parses final proof, verification, review index, manifest, output, and format paths", () => {
    expect(parseFundingDemoStatusCliArgs([
      "--funding-proof", "artifacts/demo/funding-ready-demo.json",
      "--funding-proof-verification", "artifacts/demo/funding-ready-demo-verification.json",
      "--review-index-verification", "artifacts/demo/index-verification.json",
      "--evidence-manifest-verification", "artifacts/demo/evidence-manifest-verification.json",
      "--output", "artifacts/demo/status.json",
      "--format", "summary",
    ])).toEqual({
      fundingProofPath: "artifacts/demo/funding-ready-demo.json",
      fundingProofVerificationPath: "artifacts/demo/funding-ready-demo-verification.json",
      reviewIndexVerificationPath: "artifacts/demo/index-verification.json",
      evidenceManifestVerificationPath: "artifacts/demo/evidence-manifest-verification.json",
      outputPath: "artifacts/demo/status.json",
      format: "summary",
    });
  });
});

describe("runFundingDemoStatusCli", () => {
  it("writes funding demo status without RPC or signer env", async () => {
    const outputs: string[] = [];
    const writes: unknown[] = [];
    const env: Record<string, string | undefined> = {};

    await runFundingDemoStatusCli({
      argv: ["--output", "artifacts/funding-demo/status.json", "--format", "summary"],
      env,
      readText: readFixture,
      writeOutput: (output) => outputs.push(output),
      writeText: async (path, contents) => {
        const status = JSON.parse(contents) as { passed: boolean; summary: { checks: number } };
        writes.push({ path, passed: status.passed, checks: status.summary.checks });
      },
      mkdirp: async (path) => { writes.push({ mkdir: path }); },
    });

    expect(writes).toEqual([
      { mkdir: "artifacts/funding-demo" },
      { path: "artifacts/funding-demo/status.json", passed: true, checks: 4 },
    ]);
    expect(outputs[0]).toContain("Funding demo status");
    expect(outputs[0]).toContain("overall: passed");
    expect(env.BASE_SEPOLIA_RPC_URL).toBeUndefined();
    expect(env.PRIVATE_KEY).toBeUndefined();
  });

  it("sets a failing exit code when the status does not pass", async () => {
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await runFundingDemoStatusCli({
      argv: ["--output", "artifacts/funding-demo/status.json", "--format", "summary"],
      readText: async (path) => path.endsWith("index-verification.json")
        ? JSON.stringify({ ...REVIEW_INDEX_VERIFICATION, passed: false, failures: ["review index is stale"] })
        : readFixture(path),
      writeOutput: (output) => outputs.push(output),
      writeText: async () => {},
      mkdirp: async () => {},
      setExitCode: (code) => exitCodes.push(code),
    });

    expect(outputs[0]).toContain("overall: failed");
    expect(exitCodes).toEqual([1]);
  });
});

describe("formatFundingDemoStatusCliOutput", () => {
  it("formats JSON and summary output", () => {
    const status = createFundingDemoStatus({
      generatedAt: "2026-07-03T00:00:00.000Z",
      fundingProof: FUNDING_PROOF,
      fundingProofVerification: FUNDING_PROOF_VERIFICATION,
      reviewIndexVerification: REVIEW_INDEX_VERIFICATION,
      evidenceManifestVerification: EVIDENCE_MANIFEST_VERIFICATION,
    });

    expect(formatFundingDemoStatusCliOutput(status, "json")).toContain("\"passed\": true");
    expect(formatFundingDemoStatusCliOutput(status, "summary")).toContain("overall: passed");
    expect(formatFundingDemoStatusCliOutput(status, "summary")).toContain("economicAbuseSignals: count=0 amountWei=0");
  });
});

async function readFixture(path: string): Promise<string> {
  if (path.endsWith("funding-ready-demo-verification.json")) return JSON.stringify(FUNDING_PROOF_VERIFICATION);
  if (path.endsWith("funding-ready-demo.json")) return JSON.stringify(FUNDING_PROOF);
  if (path.endsWith("index-verification.json")) return JSON.stringify(REVIEW_INDEX_VERIFICATION);
  return JSON.stringify(EVIDENCE_MANIFEST_VERIFICATION);
}
