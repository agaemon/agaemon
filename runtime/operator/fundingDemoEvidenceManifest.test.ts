import { describe, expect, it } from "vitest";

import {
  createFundingDemoEvidenceManifest,
  formatFundingDemoEvidenceManifestSummary,
  formatFundingDemoEvidenceManifestVerificationSummary,
  verifyFundingDemoEvidenceManifest,
} from "./fundingDemoEvidenceManifest.js";

describe("createFundingDemoEvidenceManifest", () => {
  it("lists the funding demo evidence artifacts under a local-only trust boundary", () => {
    const manifest = createFundingDemoEvidenceManifest({
      generatedAt: "2026-07-03T00:00:00.000Z",
      artifactRoot: "artifacts/funding-demo",
      deploymentManifestPath: "deployments/base-sepolia/latest.json",
      releaseStatusPath: "docs/releases/latest.json",
    });

    expect(manifest).toMatchObject({
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
    });
    expect(manifest.evidence.map((entry) => [entry.id, entry.path])).toEqual([
      ["deployment-manifest", "deployments/base-sepolia/latest.json"],
      ["release-status", "docs/releases/latest.json"],
      ["security-evidence", "artifacts/funding-demo/base-security-evidence.json"],
      ["local-preflight", "artifacts/funding-demo/base-sepolia-local-preflight.json"],
      ["readiness-checkpoint", "artifacts/funding-demo/base-sepolia-readiness-checkpoint.json"],
      ["agent-account-safety", "artifacts/funding-demo/base-agent-account-safety.json"],
      ["health", "artifacts/funding-demo/base-sepolia-health.json"],
      ["health-verification", "artifacts/funding-demo/base-sepolia-health-verification.json"],
      ["payout-reconciliations", "artifacts/funding-demo/coordination-payout-reconciliations.json"],
      ["economic-payout-summary", "artifacts/funding-demo/economic-payout-summary.json"],
      ["economic-payout-summary-verification", "artifacts/funding-demo/economic-payout-summary-verification.json"],
      ["launch-gate", "artifacts/funding-demo/base-sepolia-launch-gate.json"],
      ["launch-gate-verification", "artifacts/funding-demo/base-sepolia-launch-gate-verification.json"],
      ["event-index", "artifacts/funding-demo/base-event-index.json"],
      ["event-index-verification", "artifacts/funding-demo/base-event-index-verification.json"],
      ["memory-storage-binding", "artifacts/funding-demo/memory-storage-binding.json"],
      ["memory-storage-binding-verification", "artifacts/funding-demo/memory-storage-binding-verification.json"],
      ["memory-storage-binding-migrated", "artifacts/funding-demo/memory-storage-binding-migrated.json"],
      ["memory-storage-migration-verification", "artifacts/funding-demo/memory-storage-migration-verification.json"],
      ["operator-dashboard", "artifacts/funding-demo/operator-dashboard.json"],
      ["operator-dashboard-html", "artifacts/funding-demo/operator-dashboard.html"],
      ["operator-dashboard-verification", "artifacts/funding-demo/operator-dashboard-verification.json"],
      ["funding-proof", "artifacts/funding-demo/funding-ready-demo.json"],
      ["funding-proof-verification", "artifacts/funding-demo/funding-ready-demo-verification.json"],
      ["review-index", "artifacts/funding-demo/index.html"],
      ["review-index-verification", "artifacts/funding-demo/index-verification.json"],
    ]);
    expect(formatFundingDemoEvidenceManifestSummary(manifest)).toContain("evidence: 26 files");
  });
});

describe("verifyFundingDemoEvidenceManifest", () => {
  it("passes when the saved manifest matches current source paths except generatedAt", () => {
    const saved = createFundingDemoEvidenceManifest({ generatedAt: "2026-07-03T00:00:00.000Z" });
    const expected = createFundingDemoEvidenceManifest({ generatedAt: "2026-07-03T01:00:00.000Z" });

    const verification = verifyFundingDemoEvidenceManifest({ saved, expected });

    expect(verification).toMatchObject({
      passed: true,
      failures: [],
      expected,
    });
    expect(formatFundingDemoEvidenceManifestVerificationSummary(verification)).toContain("passed: true");
  });

  it("fails when the saved manifest is stale", () => {
    const saved = createFundingDemoEvidenceManifest();
    const expected = createFundingDemoEvidenceManifest({ artifactRoot: "artifacts/current" });

    expect(verifyFundingDemoEvidenceManifest({ saved, expected })).toMatchObject({
      passed: false,
      failures: ["funding demo evidence manifest is stale"],
    });
  });

  it("fails when a required evidence artifact is missing", () => {
    const saved = createFundingDemoEvidenceManifest();
    const expected = createFundingDemoEvidenceManifest();

    expect(verifyFundingDemoEvidenceManifest({
      saved,
      expected,
      missingEvidencePaths: ["artifacts/funding-demo/operator-dashboard.json"],
    })).toMatchObject({
      passed: false,
      failures: ["required evidence artifact is missing: artifacts/funding-demo/operator-dashboard.json"],
    });
  });
});
