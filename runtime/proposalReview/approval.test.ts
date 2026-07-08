import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createAgentProposalReviewApproval } from "./approval.js";
import { createAgentProposalReviewPackage } from "./package.js";

const AGENT = "0x0000000000000000000000000000000000000a01";
const TARGET = "0x0000000000000000000000000000000000000b01";
const REVIEWER = "0x0000000000000000000000000000000000000c01";
const CAPABILITY = `0x${"11".repeat(32)}`;
const GENERATED_AT = "2026-06-25T10:00:00.000Z";
const PROPOSAL_PATH = "artifacts/example-agent-proposal.json";
const SUMMARY_PATH = "artifacts/example-agent-proposal.md";
const MANIFEST_PATH = "artifacts/example-agent-proposal-review.json";

const EXECUTABLE_PLAN_ARTIFACT = {
  mode: "dry-run",
  chainId: 84532,
  manifest: "deployments/base-sepolia/latest.json",
  plan: "artifacts/example-agent-plan.json",
  objective: "Dry-run a structured plan",
  agent: AGENT,
  executable: true,
  steps: [
    {
      id: "step-1",
      title: "Allowed action",
      action: {
        capability: CAPABILITY,
        target: TARGET,
        valueWei: "123",
        data: "0x1234",
        usesBorrowing: false,
      },
      decision: {
        allowed: true,
        code: "Allowed",
      },
      transaction: {
        to: AGENT,
        value: "123",
        data: "0xabcd",
      },
    },
  ],
};

const DENIED_INTENT_ARTIFACT = {
  mode: "dry-run",
  chainId: 84532,
  manifest: "deployments/base-sepolia/latest.json",
  intent: "artifacts/example-agent-intents.json",
  objective: "Dry-run operator intents",
  agent: AGENT,
  executable: false,
  steps: [
    {
      id: "intent-1",
      title: "Denied action",
      action: {
        capability: CAPABILITY,
        target: TARGET,
        valueWei: "0",
        data: "0x1234",
        usesBorrowing: false,
      },
      decision: {
        allowed: false,
        code: "CapabilityDenied",
      },
      transaction: null,
    },
  ],
};

describe("createAgentProposalReviewApproval", () => {
  it("creates an approval artifact for a verified executable review package", () => {
    const evidence = createEvidence(JSON.stringify(EXECUTABLE_PLAN_ARTIFACT));

    const result = createAgentProposalReviewApproval({
      manifestPath: MANIFEST_PATH,
      manifestJson: evidence.manifestJson,
      proposalPath: PROPOSAL_PATH,
      proposalJson: evidence.proposalJson,
      summaryPath: SUMMARY_PATH,
      summaryMarkdown: evidence.summaryMarkdown,
      reviewer: REVIEWER,
      decision: "approved",
      generatedAt: GENERATED_AT,
    });

    expect(result).toEqual({
      passed: true,
      failures: [],
      manifestVerification: { passed: true, failures: [] },
      approval: {
        schemaVersion: 1,
        generatedAt: GENERATED_AT,
        reviewer: "0x0000000000000000000000000000000000000C01",
        decision: "approved",
        manifest: {
          path: MANIFEST_PATH,
          sha256: sha256(evidence.manifestJson),
        },
        proposal: evidence.package.manifest!.proposal,
        summary: evidence.package.manifest!.summary,
        preflight: evidence.package.manifest!.preflight,
      },
    });
  });

  it("rejects approved decisions for verified non-executable review packages", () => {
    const evidence = createEvidence(JSON.stringify(DENIED_INTENT_ARTIFACT));

    expect(
      createAgentProposalReviewApproval({
        manifestPath: MANIFEST_PATH,
        manifestJson: evidence.manifestJson,
        proposalPath: PROPOSAL_PATH,
        proposalJson: evidence.proposalJson,
        summaryPath: SUMMARY_PATH,
        summaryMarkdown: evidence.summaryMarkdown,
        reviewer: REVIEWER,
        decision: "approved",
        generatedAt: GENERATED_AT,
      }),
    ).toEqual({
      passed: false,
      failures: [
        "approved review packages must be executable",
        "approved review packages must include at least one transaction",
      ],
      manifestVerification: { passed: true, failures: [] },
      approval: null,
    });
  });

  it("creates a rejection artifact for a verified non-executable review package", () => {
    const evidence = createEvidence(JSON.stringify(DENIED_INTENT_ARTIFACT));

    const result = createAgentProposalReviewApproval({
      manifestPath: MANIFEST_PATH,
      manifestJson: evidence.manifestJson,
      proposalPath: PROPOSAL_PATH,
      proposalJson: evidence.proposalJson,
      summaryPath: SUMMARY_PATH,
      summaryMarkdown: evidence.summaryMarkdown,
      reviewer: REVIEWER,
      decision: "rejected",
      generatedAt: GENERATED_AT,
    });

    expect(result.passed).toBe(true);
    expect(result.approval?.decision).toBe("rejected");
    expect(result.approval?.preflight.executable).toBe(false);
    expect(result.approval?.preflight.transactions).toBe(0);
  });
});

function createEvidence(proposalJson: string) {
  const reviewPackage = createAgentProposalReviewPackage({
    proposalPath: PROPOSAL_PATH,
    proposalJson,
    summaryPath: SUMMARY_PATH,
    manifestPath: MANIFEST_PATH,
    generatedAt: GENERATED_AT,
  });
  if (!reviewPackage.passed || reviewPackage.manifest === null) throw new Error("test fixture package failed");
  return {
    package: reviewPackage,
    proposalJson,
    summaryMarkdown: reviewPackage.summary.markdown,
    manifestJson: JSON.stringify(reviewPackage.manifest, null, 2),
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
