import { describe, expect, it } from "vitest";

import { createAgentProposalReviewManifest } from "./manifest.js";
import { verifyAgentProposalReviewManifest } from "./manifestVerify.js";
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

describe("verifyAgentProposalReviewManifest", () => {
  it("passes when the saved manifest matches current review evidence", () => {
    const evidence = createEvidence();

    expect(
      verifyAgentProposalReviewManifest({
        manifestJson: JSON.stringify(evidence.manifest),
        proposalPath: PROPOSAL_PATH,
        proposalJson: evidence.proposalJson,
        summaryPath: SUMMARY_PATH,
        summaryMarkdown: evidence.summaryMarkdown,
      }),
    ).toEqual({
      passed: true,
      failures: [],
    });
  });

  it("rejects stale hashes and embedded preflight reports", () => {
    const evidence = createEvidence();
    const staleSummary = evidence.summaryMarkdown.replace("| Transactions | 1 |", "| Transactions | 2 |");

    expect(
      verifyAgentProposalReviewManifest({
        manifestJson: JSON.stringify(evidence.manifest),
        proposalPath: PROPOSAL_PATH,
        proposalJson: evidence.proposalJson,
        summaryPath: SUMMARY_PATH,
        summaryMarkdown: staleSummary,
      }),
    ).toEqual({
      passed: false,
      failures: [
        "summary sha256 does not match current summary",
        "preflight report does not match current proposal review",
      ],
    });
  });

  it("rejects malformed or unsupported manifests", () => {
    expect(
      verifyAgentProposalReviewManifest({
        manifestJson: JSON.stringify({
          schemaVersion: 2,
          generatedAt: "not-a-date",
          proposal: { path: PROPOSAL_PATH, sha256: "bad" },
          summary: { path: SUMMARY_PATH, sha256: "bad" },
          preflight: {},
        }),
        proposalPath: PROPOSAL_PATH,
        proposalJson: JSON.stringify(EXECUTABLE_PLAN_ARTIFACT),
        summaryPath: SUMMARY_PATH,
        summaryMarkdown: "",
      }),
    ).toMatchObject({
      passed: false,
      failures: expect.arrayContaining([
        "manifest schemaVersion must be 1",
        "manifest generatedAt must be a valid timestamp",
        "proposal sha256 must be a SHA-256 hex string",
        "summary sha256 must be a SHA-256 hex string",
        "preflight report does not match current proposal review",
      ]),
    });
  });
});

function createEvidence() {
  const proposalJson = JSON.stringify(EXECUTABLE_PLAN_ARTIFACT);
  const summaryMarkdown = createAgentProposalSummary({
    proposalPath: PROPOSAL_PATH,
    proposalJson,
  }).markdown;
  const manifest = createAgentProposalReviewManifest({
    proposalPath: PROPOSAL_PATH,
    proposalJson,
    summaryPath: SUMMARY_PATH,
    summaryMarkdown,
    generatedAt: GENERATED_AT,
  });
  return { proposalJson, summaryMarkdown, manifest };
}
