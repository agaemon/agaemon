import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createAgentProposalReviewPackage } from "./package.js";

const AGENT = "0x0000000000000000000000000000000000000a01";
const TARGET = "0x0000000000000000000000000000000000000b01";
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

describe("createAgentProposalReviewPackage", () => {
  it("creates and verifies a complete review package for a valid proposal", () => {
    const proposalJson = JSON.stringify(EXECUTABLE_PLAN_ARTIFACT);

    const result = createAgentProposalReviewPackage({
      proposalPath: PROPOSAL_PATH,
      proposalJson,
      summaryPath: SUMMARY_PATH,
      manifestPath: MANIFEST_PATH,
      generatedAt: GENERATED_AT,
    });

    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.proposal).toBe(PROPOSAL_PATH);
    expect(result.summary.path).toBe(SUMMARY_PATH);
    expect(result.summary.markdown).toContain("# Agent Proposal Review");
    expect(result.manifestPath).toBe(MANIFEST_PATH);
    expect(result.manifest?.generatedAt).toBe(GENERATED_AT);
    expect(result.manifest?.proposal.sha256).toBe(sha256(proposalJson));
    expect(result.manifest?.summary.sha256).toBe(sha256(result.summary.markdown));
    expect(result.manifestVerification).toEqual({ passed: true, failures: [] });
  });

  it("rejects invalid proposal artifacts without creating a manifest", () => {
    const proposalJson = JSON.stringify({
      ...EXECUTABLE_PLAN_ARTIFACT,
      executable: false,
    });

    expect(
      createAgentProposalReviewPackage({
        proposalPath: PROPOSAL_PATH,
        proposalJson,
        summaryPath: SUMMARY_PATH,
        manifestPath: MANIFEST_PATH,
        generatedAt: GENERATED_AT,
      }),
    ).toEqual({
      passed: false,
      failures: ["non-executable proposals must not expose transaction payloads"],
      proposal: PROPOSAL_PATH,
      summary: { path: SUMMARY_PATH, markdown: "" },
      manifestPath: MANIFEST_PATH,
      manifest: null,
      manifestVerification: null,
    });
  });
});

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
