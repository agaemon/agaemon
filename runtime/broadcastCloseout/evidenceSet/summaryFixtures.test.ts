import { describe, expect, it } from "vitest";

import { createAgentProposalExecutionBroadcastCloseoutEvidenceSetSummary } from "./summary.js";
import { getPolicyDecisionFixture } from "../../fixtures/policyDecisions.js";
import {
  BROADCAST_ARCHIVE_PATH,
  BROADCAST_PACKAGE_PATH,
  BROADCAST_RECEIPT_PATH,
  BROADCAST_REPORT_PATH,
  CLOSEOUT_STATUS_PATH,
  SUBMIT_RESULT_PATH,
  createFixtureBroadcastCloseoutEvidenceSetSummaryEvidence,
} from "../fixtures/closeoutEvidence.js";

describe("broadcast closeout evidence-set summary fixture integration", () => {
  it("renders readable fixture summary Markdown from verified evidence-set artifacts", async () => {
    const evidence = await createFixtureBroadcastCloseoutEvidenceSetSummaryEvidence({
      objective: "Render fixture broadcast closeout evidence-set summary",
      proposalPath: "artifacts/fixture-broadcast-closeout-evidence-set-summary-proposal.json",
      summaryPath: "artifacts/fixture-broadcast-closeout-evidence-set-summary-proposal.md",
      manifestPath: "artifacts/fixture-broadcast-closeout-evidence-set-summary-review.json",
      approvalPath: "artifacts/fixture-broadcast-closeout-evidence-set-summary-approval.json",
      sourcePath: "artifacts/fixture-broadcast-closeout-evidence-set-summary-plan.json",
      fixtures: [
        getPolicyDecisionFixture("allowed-swap"),
        getPolicyDecisionFixture("allowed-memory"),
      ],
    });

    expect(evidence.summary.markdown).toBe([
      "# Agent Proposal Execution Broadcast Closeout Summary",
      "",
      "| Field | Value |",
      "| --- | --- |",
      `| Report | ${BROADCAST_REPORT_PATH} |`,
      `| Archive | ${BROADCAST_ARCHIVE_PATH} |`,
      `| Status | ${CLOSEOUT_STATUS_PATH} |`,
      `| Broadcast Receipt | ${BROADCAST_RECEIPT_PATH} |`,
      `| Broadcast Package | ${BROADCAST_PACKAGE_PATH} |`,
      `| Submit Result | ${SUBMIT_RESULT_PATH} |`,
      "| Overall Status | passed |",
      "",
      "## Checks",
      "",
      "| Check | Status | Failures |",
      "| --- | --- | --- |",
      "| broadcast-closeout | passed |  |",
      "| broadcast-closeout-status | passed |  |",
      "",
    ].join("\n"));
  });

  it("blocks summary output when fixture status evidence is stale", async () => {
    const evidence = await createFixtureBroadcastCloseoutEvidenceSetSummaryEvidence({
      objective: "Block stale fixture broadcast closeout evidence-set summary status",
      proposalPath: "artifacts/fixture-stale-broadcast-closeout-evidence-set-summary-status-proposal.json",
      summaryPath: "artifacts/fixture-stale-broadcast-closeout-evidence-set-summary-status-proposal.md",
      manifestPath: "artifacts/fixture-stale-broadcast-closeout-evidence-set-summary-status-review.json",
      approvalPath: "artifacts/fixture-stale-broadcast-closeout-evidence-set-summary-status-approval.json",
      sourcePath: "artifacts/fixture-stale-broadcast-closeout-evidence-set-summary-status-plan.json",
      fixtures: [
        getPolicyDecisionFixture("allowed-swap"),
        getPolicyDecisionFixture("allowed-memory"),
      ],
    });
    const status = JSON.parse(evidence.params.statusJson);
    status.transactions = 1;

    expect(
      createAgentProposalExecutionBroadcastCloseoutEvidenceSetSummary({
        ...evidence.params,
        statusJson: `${JSON.stringify(status, null, 2)}\n`,
      }),
    ).toEqual({
      passed: false,
      failures: ["closeout status JSON does not match current closeout evidence"],
      markdown: "",
    });
  });

  it("blocks summary output when fixture closeout archive evidence is stale", async () => {
    const evidence = await createFixtureBroadcastCloseoutEvidenceSetSummaryEvidence({
      objective: "Block stale fixture broadcast closeout evidence-set summary archive",
      proposalPath: "artifacts/fixture-stale-broadcast-closeout-evidence-set-summary-archive-proposal.json",
      summaryPath: "artifacts/fixture-stale-broadcast-closeout-evidence-set-summary-archive-proposal.md",
      manifestPath: "artifacts/fixture-stale-broadcast-closeout-evidence-set-summary-archive-review.json",
      approvalPath: "artifacts/fixture-stale-broadcast-closeout-evidence-set-summary-archive-approval.json",
      sourcePath: "artifacts/fixture-stale-broadcast-closeout-evidence-set-summary-archive-plan.json",
      fixtures: [
        getPolicyDecisionFixture("allowed-swap"),
        getPolicyDecisionFixture("allowed-memory"),
      ],
    });
    const archive = JSON.parse(evidence.params.archiveJson);
    archive.receipt.sha256 = "78".repeat(32);

    expect(
      createAgentProposalExecutionBroadcastCloseoutEvidenceSetSummary({
        ...evidence.params,
        archiveJson: `${JSON.stringify(archive, null, 2)}\n`,
      }),
    ).toEqual({
      passed: false,
      failures: [
        "closeout archive JSON does not match current broadcast closeout",
        "closeout archive JSON does not match current broadcast closeout",
        "closeout status JSON does not match current closeout evidence",
      ],
      markdown: "",
    });
  });
});
