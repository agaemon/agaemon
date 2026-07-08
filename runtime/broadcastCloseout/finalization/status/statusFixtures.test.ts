import { describe, expect, it } from "vitest";

import { verifyAgentProposalExecutionBroadcastCloseoutFinalizationStatus } from "./statusVerify.js";
import { getPolicyDecisionFixture } from "../../../fixtures/policyDecisions.js";
import {
  BROADCAST_ARCHIVE_PATH,
  BROADCAST_PACKAGE_PATH,
  BROADCAST_RECEIPT_PATH,
  BROADCAST_REPORT_PATH,
  CLOSEOUT_STATUS_PATH,
  CLOSEOUT_SUMMARY_PATH,
  FINALIZATION_STATUS_PATH,
  SIGNER_ACCOUNT,
  SUBMIT_RESULT_PATH,
  createFixtureBroadcastCloseoutFinalizationStatusEvidence,
} from "../../fixtures/closeoutEvidence.js";

describe("broadcast closeout finalization status fixture integration", () => {
  it("creates and verifies fixture finalization status evidence from saved finalization artifacts", async () => {
    const evidence = await createFixtureBroadcastCloseoutFinalizationStatusEvidence({
      objective: "Create fixture broadcast closeout finalization status",
      proposalPath: "artifacts/fixture-broadcast-closeout-finalization-status-proposal.json",
      summaryPath: "artifacts/fixture-broadcast-closeout-finalization-status-proposal.md",
      manifestPath: "artifacts/fixture-broadcast-closeout-finalization-status-review.json",
      approvalPath: "artifacts/fixture-broadcast-closeout-finalization-status-approval.json",
      sourcePath: "artifacts/fixture-broadcast-closeout-finalization-status-plan.json",
      fixtures: [
        getPolicyDecisionFixture("allowed-swap"),
        getPolicyDecisionFixture("allowed-memory"),
      ],
    });

    expect(evidence.status).toEqual({
      passed: true,
      summary: CLOSEOUT_SUMMARY_PATH,
      report: BROADCAST_REPORT_PATH,
      archive: BROADCAST_ARCHIVE_PATH,
      status: CLOSEOUT_STATUS_PATH,
      broadcastReceipt: BROADCAST_RECEIPT_PATH,
      broadcastPackage: BROADCAST_PACKAGE_PATH,
      submitResult: SUBMIT_RESULT_PATH,
      signer: SIGNER_ACCOUNT.address,
      chainId: 84532,
      transactions: 2,
      checks: [
        {
          name: "broadcast-closeout-finalization",
          passed: true,
          failures: [],
        },
      ],
    });
    expect(evidence.params.finalizationStatusPath).toBe(FINALIZATION_STATUS_PATH);
    expect(verifyAgentProposalExecutionBroadcastCloseoutFinalizationStatus(evidence.params)).toEqual({
      passed: true,
      failures: [],
    });
  });

  it("rejects stale saved fixture finalization status JSON", async () => {
    const evidence = await createFixtureBroadcastCloseoutFinalizationStatusEvidence({
      objective: "Reject stale fixture broadcast closeout finalization status JSON",
      proposalPath: "artifacts/fixture-stale-broadcast-closeout-finalization-status-json-proposal.json",
      summaryPath: "artifacts/fixture-stale-broadcast-closeout-finalization-status-json-proposal.md",
      manifestPath: "artifacts/fixture-stale-broadcast-closeout-finalization-status-json-review.json",
      approvalPath: "artifacts/fixture-stale-broadcast-closeout-finalization-status-json-approval.json",
      sourcePath: "artifacts/fixture-stale-broadcast-closeout-finalization-status-json-plan.json",
      fixtures: [
        getPolicyDecisionFixture("allowed-swap"),
        getPolicyDecisionFixture("allowed-memory"),
      ],
    });
    const status = JSON.parse(evidence.params.finalizationStatusJson);
    status.transactions = 1;

    expect(
      verifyAgentProposalExecutionBroadcastCloseoutFinalizationStatus({
        ...evidence.params,
        finalizationStatusJson: `${JSON.stringify(status, null, 2)}\n`,
      }),
    ).toEqual({
      passed: false,
      failures: ["closeout finalization status JSON does not match current finalization evidence"],
    });
  });

  it("blocks status verification when fixture summary evidence is stale", async () => {
    const evidence = await createFixtureBroadcastCloseoutFinalizationStatusEvidence({
      objective: "Block stale fixture broadcast closeout finalization status summary",
      proposalPath: "artifacts/fixture-stale-broadcast-closeout-finalization-status-summary-proposal.json",
      summaryPath: "artifacts/fixture-stale-broadcast-closeout-finalization-status-summary-proposal.md",
      manifestPath: "artifacts/fixture-stale-broadcast-closeout-finalization-status-summary-review.json",
      approvalPath: "artifacts/fixture-stale-broadcast-closeout-finalization-status-summary-approval.json",
      sourcePath: "artifacts/fixture-stale-broadcast-closeout-finalization-status-summary-plan.json",
      fixtures: [
        getPolicyDecisionFixture("allowed-swap"),
        getPolicyDecisionFixture("allowed-memory"),
      ],
    });

    expect(
      verifyAgentProposalExecutionBroadcastCloseoutFinalizationStatus({
        ...evidence.params,
        summaryMarkdown: evidence.params.summaryMarkdown.replace(
          "| Overall Status | passed |",
          "| Overall Status | failed |",
        ),
      }),
    ).toEqual({
      passed: false,
      failures: [
        "closeout evidence set summary Markdown does not match current evidence",
        "closeout finalization status JSON does not match current finalization evidence",
      ],
    });
  });
});
