import { describe, expect, it } from "vitest";

import { verifyAgentProposalExecutionBroadcastCloseoutFinalization } from "./finalizationVerify.js";
import { getPolicyDecisionFixture } from "../../../fixtures/policyDecisions.js";
import {
  BROADCAST_ARCHIVE_PATH,
  BROADCAST_PACKAGE_PATH,
  BROADCAST_RECEIPT_PATH,
  BROADCAST_REPORT_PATH,
  CLOSEOUT_STATUS_PATH,
  CLOSEOUT_SUMMARY_PATH,
  SUBMIT_RESULT_PATH,
  createFixtureBroadcastCloseoutFinalizationEvidence,
} from "../../fixtures/closeoutEvidence.js";

describe("broadcast closeout finalization fixture integration", () => {
  it("creates and verifies fixture finalization evidence from saved summary artifacts", async () => {
    const evidence = await createFixtureBroadcastCloseoutFinalizationEvidence({
      objective: "Finalize fixture broadcast closeout evidence",
      proposalPath: "artifacts/fixture-broadcast-closeout-finalization-proposal.json",
      summaryPath: "artifacts/fixture-broadcast-closeout-finalization-proposal.md",
      manifestPath: "artifacts/fixture-broadcast-closeout-finalization-review.json",
      approvalPath: "artifacts/fixture-broadcast-closeout-finalization-approval.json",
      sourcePath: "artifacts/fixture-broadcast-closeout-finalization-plan.json",
      fixtures: [
        getPolicyDecisionFixture("allowed-swap"),
        getPolicyDecisionFixture("allowed-memory"),
      ],
    });

    expect(evidence.finalization.passed).toBe(true);
    expect(evidence.finalization.failures).toEqual([]);
    expect(evidence.finalization.report.path).toBe(BROADCAST_REPORT_PATH);
    expect(evidence.finalization.archive.path).toBe(BROADCAST_ARCHIVE_PATH);
    expect(evidence.finalization.status?.path).toBe(CLOSEOUT_STATUS_PATH);
    expect(evidence.finalization.summary).toEqual({
      path: CLOSEOUT_SUMMARY_PATH,
      markdown: evidence.params.summaryMarkdown,
    });
    expect(evidence.finalization.verification).toEqual({
      passed: true,
      failures: [],
      expected: evidence.params.summaryMarkdown,
    });
    expect(verifyAgentProposalExecutionBroadcastCloseoutFinalization(evidence.params)).toEqual({
      passed: true,
      failures: [],
      checks: [
        {
          name: "broadcast-closeout-finalization",
          passed: true,
          failures: [],
        },
      ],
      expected: evidence.params.summaryMarkdown,
    });
  });

  it("rejects stale saved fixture summary Markdown during finalization verification", async () => {
    const evidence = await createFixtureBroadcastCloseoutFinalizationEvidence({
      objective: "Reject stale fixture broadcast closeout finalization summary",
      proposalPath: "artifacts/fixture-stale-broadcast-closeout-finalization-summary-proposal.json",
      summaryPath: "artifacts/fixture-stale-broadcast-closeout-finalization-summary-proposal.md",
      manifestPath: "artifacts/fixture-stale-broadcast-closeout-finalization-summary-review.json",
      approvalPath: "artifacts/fixture-stale-broadcast-closeout-finalization-summary-approval.json",
      sourcePath: "artifacts/fixture-stale-broadcast-closeout-finalization-summary-plan.json",
      fixtures: [
        getPolicyDecisionFixture("allowed-swap"),
        getPolicyDecisionFixture("allowed-memory"),
      ],
    });

    expect(
      verifyAgentProposalExecutionBroadcastCloseoutFinalization({
        ...evidence.params,
        summaryMarkdown: evidence.params.summaryMarkdown.replace(
          "| Overall Status | passed |",
          "| Overall Status | failed |",
        ),
      }),
    ).toEqual({
      passed: false,
      failures: ["closeout evidence set summary Markdown does not match current evidence"],
      checks: [
        {
          name: "broadcast-closeout-finalization",
          passed: false,
          failures: ["closeout evidence set summary Markdown does not match current evidence"],
        },
      ],
      expected: evidence.params.summaryMarkdown,
    });
  });

  it("blocks finalization verification when fixture status evidence is stale", async () => {
    const evidence = await createFixtureBroadcastCloseoutFinalizationEvidence({
      objective: "Block stale fixture broadcast closeout finalization status",
      proposalPath: "artifacts/fixture-stale-broadcast-closeout-finalization-status-proposal.json",
      summaryPath: "artifacts/fixture-stale-broadcast-closeout-finalization-status-proposal.md",
      manifestPath: "artifacts/fixture-stale-broadcast-closeout-finalization-status-review.json",
      approvalPath: "artifacts/fixture-stale-broadcast-closeout-finalization-status-approval.json",
      sourcePath: "artifacts/fixture-stale-broadcast-closeout-finalization-status-plan.json",
      fixtures: [
        getPolicyDecisionFixture("allowed-swap"),
        getPolicyDecisionFixture("allowed-memory"),
      ],
    });
    const status = JSON.parse(evidence.params.statusJson);
    status.transactions = 1;

    expect(
      verifyAgentProposalExecutionBroadcastCloseoutFinalization({
        ...evidence.params,
        statusJson: `${JSON.stringify(status, null, 2)}\n`,
      }),
    ).toEqual({
      passed: false,
      failures: ["closeout status JSON does not match current closeout evidence"],
      checks: [
        {
          name: "broadcast-closeout-finalization",
          passed: false,
          failures: ["closeout status JSON does not match current closeout evidence"],
        },
      ],
      expected: "",
    });
  });

  it("blocks finalization verification when fixture closeout archive evidence is stale", async () => {
    const evidence = await createFixtureBroadcastCloseoutFinalizationEvidence({
      objective: "Block stale fixture broadcast closeout finalization archive",
      proposalPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-proposal.json",
      summaryPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-proposal.md",
      manifestPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-review.json",
      approvalPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-approval.json",
      sourcePath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-plan.json",
      fixtures: [
        getPolicyDecisionFixture("allowed-swap"),
        getPolicyDecisionFixture("allowed-memory"),
      ],
    });
    const archive = JSON.parse(evidence.params.archiveJson);
    archive.receipt.sha256 = "bc".repeat(32);

    expect(
      verifyAgentProposalExecutionBroadcastCloseoutFinalization({
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
      checks: [
        {
          name: "broadcast-closeout-finalization",
          passed: false,
          failures: [
            "closeout archive JSON does not match current broadcast closeout",
            "closeout archive JSON does not match current broadcast closeout",
            "closeout status JSON does not match current closeout evidence",
          ],
        },
      ],
      expected: "",
    });
  });
});
