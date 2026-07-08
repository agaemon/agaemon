import { describe, expect, it } from "vitest";

import { verifyAgentProposalExecutionBroadcastCloseoutEvidenceSetSummary } from "./summaryVerify.js";
import { getPolicyDecisionFixture } from "../../fixtures/policyDecisions.js";
import {
  CLOSEOUT_SUMMARY_PATH,
  createFixtureBroadcastCloseoutEvidenceSetSummaryVerificationEvidence,
} from "../fixtures/closeoutEvidence.js";

describe("broadcast closeout evidence-set summary verifier fixture integration", () => {
  it("verifies saved fixture summary Markdown against current evidence", async () => {
    const evidence = await createFixtureBroadcastCloseoutEvidenceSetSummaryVerificationEvidence({
      objective: "Verify fixture broadcast closeout evidence-set summary",
      proposalPath: "artifacts/fixture-broadcast-closeout-evidence-set-summary-verify-proposal.json",
      summaryPath: "artifacts/fixture-broadcast-closeout-evidence-set-summary-verify-proposal.md",
      manifestPath: "artifacts/fixture-broadcast-closeout-evidence-set-summary-verify-review.json",
      approvalPath: "artifacts/fixture-broadcast-closeout-evidence-set-summary-verify-approval.json",
      sourcePath: "artifacts/fixture-broadcast-closeout-evidence-set-summary-verify-plan.json",
      fixtures: [
        getPolicyDecisionFixture("allowed-swap"),
        getPolicyDecisionFixture("allowed-memory"),
      ],
    });

    expect(evidence.summaryPath).toBe(CLOSEOUT_SUMMARY_PATH);
    expect(verifyAgentProposalExecutionBroadcastCloseoutEvidenceSetSummary(evidence)).toEqual({
      passed: true,
      failures: [],
      expected: evidence.summaryMarkdown,
    });
  });

  it("rejects stale saved fixture summary Markdown", async () => {
    const evidence = await createFixtureBroadcastCloseoutEvidenceSetSummaryVerificationEvidence({
      objective: "Reject stale fixture broadcast closeout evidence-set summary Markdown",
      proposalPath: "artifacts/fixture-stale-broadcast-closeout-evidence-set-summary-verify-markdown-proposal.json",
      summaryPath: "artifacts/fixture-stale-broadcast-closeout-evidence-set-summary-verify-markdown-proposal.md",
      manifestPath: "artifacts/fixture-stale-broadcast-closeout-evidence-set-summary-verify-markdown-review.json",
      approvalPath: "artifacts/fixture-stale-broadcast-closeout-evidence-set-summary-verify-markdown-approval.json",
      sourcePath: "artifacts/fixture-stale-broadcast-closeout-evidence-set-summary-verify-markdown-plan.json",
      fixtures: [
        getPolicyDecisionFixture("allowed-swap"),
        getPolicyDecisionFixture("allowed-memory"),
      ],
    });

    expect(
      verifyAgentProposalExecutionBroadcastCloseoutEvidenceSetSummary({
        ...evidence,
        summaryMarkdown: evidence.summaryMarkdown.replace("| Overall Status | passed |", "| Overall Status | failed |"),
      }),
    ).toEqual({
      passed: false,
      failures: ["closeout evidence set summary Markdown does not match current evidence"],
      expected: evidence.summaryMarkdown,
    });
  });

  it("blocks verification when fixture status evidence is stale", async () => {
    const evidence = await createFixtureBroadcastCloseoutEvidenceSetSummaryVerificationEvidence({
      objective: "Block stale fixture broadcast closeout evidence-set summary verifier status",
      proposalPath: "artifacts/fixture-stale-broadcast-closeout-evidence-set-summary-verify-status-proposal.json",
      summaryPath: "artifacts/fixture-stale-broadcast-closeout-evidence-set-summary-verify-status-proposal.md",
      manifestPath: "artifacts/fixture-stale-broadcast-closeout-evidence-set-summary-verify-status-review.json",
      approvalPath: "artifacts/fixture-stale-broadcast-closeout-evidence-set-summary-verify-status-approval.json",
      sourcePath: "artifacts/fixture-stale-broadcast-closeout-evidence-set-summary-verify-status-plan.json",
      fixtures: [
        getPolicyDecisionFixture("allowed-swap"),
        getPolicyDecisionFixture("allowed-memory"),
      ],
    });
    const status = JSON.parse(evidence.statusJson);
    status.transactions = 1;

    expect(
      verifyAgentProposalExecutionBroadcastCloseoutEvidenceSetSummary({
        ...evidence,
        statusJson: `${JSON.stringify(status, null, 2)}\n`,
      }),
    ).toEqual({
      passed: false,
      failures: ["closeout status JSON does not match current closeout evidence"],
      expected: "",
    });
  });

  it("blocks verification when fixture closeout archive evidence is stale", async () => {
    const evidence = await createFixtureBroadcastCloseoutEvidenceSetSummaryVerificationEvidence({
      objective: "Block stale fixture broadcast closeout evidence-set summary verifier archive",
      proposalPath: "artifacts/fixture-stale-broadcast-closeout-evidence-set-summary-verify-archive-proposal.json",
      summaryPath: "artifacts/fixture-stale-broadcast-closeout-evidence-set-summary-verify-archive-proposal.md",
      manifestPath: "artifacts/fixture-stale-broadcast-closeout-evidence-set-summary-verify-archive-review.json",
      approvalPath: "artifacts/fixture-stale-broadcast-closeout-evidence-set-summary-verify-archive-approval.json",
      sourcePath: "artifacts/fixture-stale-broadcast-closeout-evidence-set-summary-verify-archive-plan.json",
      fixtures: [
        getPolicyDecisionFixture("allowed-swap"),
        getPolicyDecisionFixture("allowed-memory"),
      ],
    });
    const archive = JSON.parse(evidence.archiveJson);
    archive.receipt.sha256 = "9a".repeat(32);

    expect(
      verifyAgentProposalExecutionBroadcastCloseoutEvidenceSetSummary({
        ...evidence,
        archiveJson: `${JSON.stringify(archive, null, 2)}\n`,
      }),
    ).toEqual({
      passed: false,
      failures: [
        "closeout archive JSON does not match current broadcast closeout",
        "closeout archive JSON does not match current broadcast closeout",
        "closeout status JSON does not match current closeout evidence",
      ],
      expected: "",
    });
  });
});
