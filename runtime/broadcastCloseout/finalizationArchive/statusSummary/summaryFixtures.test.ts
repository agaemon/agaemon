import { describe, expect, it } from "vitest";

import { verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummary } from "./verify.js";
import { getPolicyDecisionFixture } from "../../../fixtures/policyDecisions.js";
import {
  BROADCAST_ARCHIVE_PATH,
  BROADCAST_PACKAGE_PATH,
  BROADCAST_RECEIPT_PATH,
  BROADCAST_REPORT_PATH,
  CLOSEOUT_STATUS_PATH,
  CLOSEOUT_SUMMARY_PATH,
  FINALIZATION_ARCHIVE_PATH,
  FINALIZATION_ARCHIVE_STATUS_PATH,
  FINALIZATION_ARCHIVE_STATUS_SUMMARY_PATH,
  FINALIZATION_STATUS_PATH,
  SIGNER_ACCOUNT,
  SUBMIT_RESULT_PATH,
  createFixtureBroadcastCloseoutFinalizationArchiveStatusSummaryEvidence,
} from "../../fixtures/closeoutEvidence.js";

describe("broadcast closeout finalization archive status summary fixture integration", () => {
  it("renders and verifies fixture finalization archive status summary Markdown", async () => {
    const evidence = await createFixtureBroadcastCloseoutFinalizationArchiveStatusSummaryEvidence({
      objective: "Create fixture broadcast closeout finalization archive status summary",
      proposalPath: "artifacts/fixture-broadcast-closeout-finalization-archive-status-summary-proposal.json",
      summaryPath: "artifacts/fixture-broadcast-closeout-finalization-archive-status-summary-proposal.md",
      manifestPath: "artifacts/fixture-broadcast-closeout-finalization-archive-status-summary-review.json",
      approvalPath: "artifacts/fixture-broadcast-closeout-finalization-archive-status-summary-approval.json",
      sourcePath: "artifacts/fixture-broadcast-closeout-finalization-archive-status-summary-plan.json",
      fixtures: [
        getPolicyDecisionFixture("allowed-swap"),
        getPolicyDecisionFixture("allowed-memory"),
      ],
    });

    expect(evidence.summary).toEqual({
      passed: true,
      failures: [],
      markdown: [
        "# Agent Proposal Execution Broadcast Closeout Finalization Archive Status Summary",
        "",
        "| Field | Value |",
        "| --- | --- |",
        `| Finalization Archive Status | ${FINALIZATION_ARCHIVE_STATUS_PATH} |`,
        `| Finalization Archive | ${FINALIZATION_ARCHIVE_PATH} |`,
        `| Report | ${BROADCAST_REPORT_PATH} |`,
        `| Archive | ${BROADCAST_ARCHIVE_PATH} |`,
        `| Status | ${CLOSEOUT_STATUS_PATH} |`,
        `| Summary | ${CLOSEOUT_SUMMARY_PATH} |`,
        `| Finalization Status | ${FINALIZATION_STATUS_PATH} |`,
        `| Broadcast Receipt | ${BROADCAST_RECEIPT_PATH} |`,
        `| Broadcast Package | ${BROADCAST_PACKAGE_PATH} |`,
        `| Submit Result | ${SUBMIT_RESULT_PATH} |`,
        `| Signer | ${SIGNER_ACCOUNT.address} |`,
        "| Chain ID | 84532 |",
        "| Transactions | 2 |",
        "| Overall Status | passed |",
        "",
        "## Checks",
        "",
        "| Check | Status | Failures |",
        "| --- | --- | --- |",
        "| broadcast-closeout-finalization-archive | passed |  |",
        "",
      ].join("\n"),
    });
    expect(evidence.params.finalizationArchiveStatusSummaryPath).toBe(FINALIZATION_ARCHIVE_STATUS_SUMMARY_PATH);
    expect(verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummary(evidence.params)).toEqual({
      passed: true,
      failures: [],
      expected: evidence.summary.markdown,
    });
  });

  it("rejects stale saved fixture finalization archive status summary Markdown", async () => {
    const evidence = await createFixtureBroadcastCloseoutFinalizationArchiveStatusSummaryEvidence({
      objective: "Reject stale fixture broadcast closeout finalization archive status summary Markdown",
      proposalPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-summary-markdown-proposal.json",
      summaryPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-summary-markdown-proposal.md",
      manifestPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-summary-markdown-review.json",
      approvalPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-summary-markdown-approval.json",
      sourcePath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-summary-markdown-plan.json",
      fixtures: [
        getPolicyDecisionFixture("allowed-swap"),
        getPolicyDecisionFixture("allowed-memory"),
      ],
    });

    expect(
      verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummary({
        ...evidence.params,
        finalizationArchiveStatusSummaryMarkdown: evidence.params.finalizationArchiveStatusSummaryMarkdown.replace(
          "| Overall Status | passed |",
          "| Overall Status | failed |",
        ),
      }),
    ).toEqual({
      passed: false,
      failures: [
        "closeout finalization archive status summary Markdown does not match current finalization archive status evidence",
      ],
      expected: evidence.summary.markdown,
    });
  });

  it("blocks summary verification when fixture archive status evidence is stale", async () => {
    const evidence = await createFixtureBroadcastCloseoutFinalizationArchiveStatusSummaryEvidence({
      objective: "Block stale fixture broadcast closeout finalization archive status summary status",
      proposalPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-summary-status-proposal.json",
      summaryPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-summary-status-proposal.md",
      manifestPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-summary-status-review.json",
      approvalPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-summary-status-approval.json",
      sourcePath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-summary-status-plan.json",
      fixtures: [
        getPolicyDecisionFixture("allowed-swap"),
        getPolicyDecisionFixture("allowed-memory"),
      ],
    });
    const status = JSON.parse(evidence.params.finalizationArchiveStatusJson);
    status.transactions = 1;

    expect(
      verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummary({
        ...evidence.params,
        finalizationArchiveStatusJson: `${JSON.stringify(status, null, 2)}\n`,
      }),
    ).toEqual({
      passed: false,
      failures: ["closeout finalization archive status JSON does not match current finalization archive evidence"],
      expected: "",
    });
  });
});
