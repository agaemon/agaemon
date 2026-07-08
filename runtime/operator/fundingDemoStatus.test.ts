import { describe, expect, it } from "vitest";

import {
  createFundingDemoStatus,
  formatFundingDemoStatusSummary,
  formatFundingDemoStatusVerificationSummary,
  verifyFundingDemoStatus,
} from "./fundingDemoStatus.js";
import { createFundingDemoEvidenceManifest } from "./fundingDemoEvidenceManifest.js";
import type { FundingDemoEvidenceManifestVerification } from "./fundingDemoEvidenceManifest.js";
import type { FundingDemoReviewIndexVerification } from "./fundingDemoReviewIndex.js";
import type {
  FundingReadyOperatorDemoReport,
  FundingReadyOperatorDemoVerification,
} from "./fundingReadyDemo.js";

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

describe("createFundingDemoStatus", () => {
  it("summarizes the final funding demo gates as one local launch status", () => {
    const status = createFundingDemoStatus({
      generatedAt: "2026-07-03T00:00:00.000Z",
      fundingProof: FUNDING_PROOF,
      fundingProofVerification: FUNDING_PROOF_VERIFICATION,
      reviewIndexVerification: REVIEW_INDEX_VERIFICATION,
      evidenceManifestVerification: EVIDENCE_MANIFEST_VERIFICATION,
    });

    expect(status).toEqual({
      schemaVersion: 1,
      generatedAt: "2026-07-03T00:00:00.000Z",
      network: "base-sepolia",
      objective: "AgentOS Kernel becomes a credible funding-ready AI x blockchain proof.",
      passed: true,
      summary: { checks: 4, passed: 4, failed: 0 },
      economicAbuseSignals: { count: 2, amountWei: "500" },
      trustBoundary: {
        ai: "proposes",
        policy: "decides",
        accounts: "execute",
        mainnet: false,
        liveFunds: false,
      },
      checks: [
        {
          id: "funding-proof",
          label: "Funding-ready proof",
          passed: true,
          source: { path: "artifacts/funding-demo/funding-ready-demo.json" },
          failures: [],
        },
        {
          id: "funding-proof-verification",
          label: "Funding-ready proof verification",
          passed: true,
          source: { path: "artifacts/funding-demo/funding-ready-demo-verification.json" },
          failures: [],
        },
        {
          id: "review-index-verification",
          label: "Funding demo review index verification",
          passed: true,
          source: { path: "artifacts/funding-demo/index-verification.json" },
          failures: [],
        },
        {
          id: "evidence-manifest-verification",
          label: "Funding demo evidence manifest verification",
          passed: true,
          source: { path: "artifacts/funding-demo/evidence-manifest-verification.json" },
          failures: [],
        },
      ],
    });
    expect(formatFundingDemoStatusSummary(status)).toEqual([
      "Funding demo status",
      "network: base-sepolia",
      "overall: passed",
      "checks: 4 passed, 0 failed",
      "economicAbuseSignals: count=2 amountWei=500",
      "- funding-proof: passed",
      "- funding-proof-verification: passed",
      "- review-index-verification: passed",
      "- evidence-manifest-verification: passed",
      "trustBoundary: AI proposes, policy decides, accounts execute",
    ].join("\n"));
  });

  it("fails closed when any final funding demo gate fails", () => {
    const status = createFundingDemoStatus({
      generatedAt: "2026-07-03T00:00:00.000Z",
      fundingProof: {
        ...FUNDING_PROOF,
        passed: false,
        summary: { checks: 2, passed: 1, failed: 1 },
        checks: [
          { id: "launch-gate", label: "Launch gate", passed: false, failures: ["launch gate failed"] },
        ],
      },
      fundingProofVerification: { ...FUNDING_PROOF_VERIFICATION, passed: false, failures: ["funding proof is stale"] },
      reviewIndexVerification: { ...REVIEW_INDEX_VERIFICATION, passed: false, failures: ["review index is stale"] },
      evidenceManifestVerification: { ...EVIDENCE_MANIFEST_VERIFICATION, passed: true, failures: [] },
    });

    expect(status.passed).toBe(false);
    expect(status.summary).toEqual({ checks: 4, passed: 1, failed: 3 });
    expect(status.checks.map((check) => ({ id: check.id, passed: check.passed, failures: check.failures }))).toEqual([
      { id: "funding-proof", passed: false, failures: ["launch gate failed"] },
      { id: "funding-proof-verification", passed: false, failures: ["funding proof is stale"] },
      { id: "review-index-verification", passed: false, failures: ["review index is stale"] },
      { id: "evidence-manifest-verification", passed: true, failures: [] },
    ]);
    expect(formatFundingDemoStatusSummary(status)).toContain("overall: failed");
  });
});

describe("verifyFundingDemoStatus", () => {
  it("passes when the saved status matches the recomputed status except for generatedAt", () => {
    const expected = createFundingDemoStatus({
      generatedAt: "2026-07-03T00:00:00.000Z",
      fundingProof: FUNDING_PROOF,
      fundingProofVerification: FUNDING_PROOF_VERIFICATION,
      reviewIndexVerification: REVIEW_INDEX_VERIFICATION,
      evidenceManifestVerification: EVIDENCE_MANIFEST_VERIFICATION,
    });
    const saved = { ...expected, generatedAt: "2026-07-03T00:01:00.000Z" };

    const verification = verifyFundingDemoStatus({ saved, expected });

    expect(verification).toEqual({
      passed: true,
      failures: [],
      expected,
    });
    expect(formatFundingDemoStatusVerificationSummary(verification)).toEqual([
      "Funding demo status verification",
      "passed: true",
      "failures: 0",
    ].join("\n"));
  });

  it("fails when the saved status is stale", () => {
    const expected = createFundingDemoStatus({
      generatedAt: "2026-07-03T00:00:00.000Z",
      fundingProof: FUNDING_PROOF,
      fundingProofVerification: FUNDING_PROOF_VERIFICATION,
      reviewIndexVerification: REVIEW_INDEX_VERIFICATION,
      evidenceManifestVerification: EVIDENCE_MANIFEST_VERIFICATION,
    });
    const saved = {
      ...expected,
      checks: expected.checks.map((check) => check.id === "review-index-verification"
        ? { ...check, source: { path: "artifacts/funding-demo/stale-index-verification.json" } }
        : check),
    };

    const verification = verifyFundingDemoStatus({ saved, expected });

    expect(verification).toEqual({
      passed: false,
      failures: ["funding demo status is stale"],
      expected,
    });
    expect(formatFundingDemoStatusVerificationSummary(verification)).toContain("passed: false");
  });
});
