import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createAgentProposalReviewManifest } from "./manifest.js";
import { createAgentProposalSummary } from "../proposal/summary.js";

const AGENT = "0x0000000000000000000000000000000000000a01";
const TARGET = "0x0000000000000000000000000000000000000b01";
const CAPABILITY = `0x${"11".repeat(32)}`;
const GENERATED_AT = "2026-06-25T10:00:00.000Z";
const PROPOSAL_PATH = "artifacts/example-agent-proposal.json";
const SUMMARY_PATH = "artifacts/example-agent-proposal.md";

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

describe("createAgentProposalReviewManifest", () => {
  it("creates a deterministic manifest for current proposal review evidence", () => {
    const proposalJson = JSON.stringify(EXECUTABLE_PLAN_ARTIFACT);
    const summaryMarkdown = createAgentProposalSummary({
      proposalPath: PROPOSAL_PATH,
      proposalJson,
    }).markdown;

    expect(
      createAgentProposalReviewManifest({
        proposalPath: PROPOSAL_PATH,
        proposalJson,
        summaryPath: SUMMARY_PATH,
        summaryMarkdown,
        generatedAt: GENERATED_AT,
      }),
    ).toEqual({
      schemaVersion: 1,
      generatedAt: GENERATED_AT,
      proposal: {
        path: PROPOSAL_PATH,
        sha256: sha256(proposalJson),
      },
      summary: {
        path: SUMMARY_PATH,
        sha256: sha256(summaryMarkdown),
      },
      preflight: {
        passed: true,
        proposal: PROPOSAL_PATH,
        summary: SUMMARY_PATH,
        source: "plan",
        sourcePath: "artifacts/example-agent-plan.json",
        chainId: 84532,
        executable: true,
        steps: 1,
        transactions: 1,
        checks: [
          { name: "proposal-artifact", passed: true, failures: [] },
          { name: "proposal-summary", passed: true, failures: [] },
        ],
      },
    });
  });

  it("keeps hashes and failed preflight details for stale summaries", () => {
    const proposalJson = JSON.stringify(EXECUTABLE_PLAN_ARTIFACT);
    const summaryMarkdown = createAgentProposalSummary({
      proposalPath: PROPOSAL_PATH,
      proposalJson,
    }).markdown.replace("| Transactions | 1 |", "| Transactions | 2 |");

    expect(
      createAgentProposalReviewManifest({
        proposalPath: PROPOSAL_PATH,
        proposalJson,
        summaryPath: SUMMARY_PATH,
        summaryMarkdown,
        generatedAt: GENERATED_AT,
      }),
    ).toMatchObject({
      proposal: {
        path: PROPOSAL_PATH,
        sha256: sha256(proposalJson),
      },
      summary: {
        path: SUMMARY_PATH,
        sha256: sha256(summaryMarkdown),
      },
      preflight: {
        passed: false,
        checks: [
          { name: "proposal-artifact", passed: true, failures: [] },
          { name: "proposal-summary", passed: false, failures: ["proposal summary is stale"] },
        ],
      },
    });
  });
});

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
