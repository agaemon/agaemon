import { describe, expect, it } from "vitest";

import { verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus } from "./statusVerify.js";
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
  FINALIZATION_STATUS_PATH,
  SIGNER_ACCOUNT,
  SUBMIT_RESULT_PATH,
  createFixtureBroadcastCloseoutFinalizationArchiveStatusEvidence,
} from "../../fixtures/closeoutEvidence.js";

describe("broadcast closeout finalization archive status fixture integration", () => {
  it.each(["allowed-swap", "allowed-memory"] as const)("creates and verifies fixture finalization archive status evidence from saved archive artifacts (%s)", async (fixtureId) => {
    const evidence = await createFixtureBroadcastCloseoutFinalizationArchiveStatusEvidence({
      objective: "Create fixture broadcast closeout finalization archive status",
      proposalPath: "artifacts/fixture-broadcast-closeout-finalization-archive-status-proposal.json",
      summaryPath: "artifacts/fixture-broadcast-closeout-finalization-archive-status-proposal.md",
      manifestPath: "artifacts/fixture-broadcast-closeout-finalization-archive-status-review.json",
      approvalPath: "artifacts/fixture-broadcast-closeout-finalization-archive-status-approval.json",
      sourcePath: "artifacts/fixture-broadcast-closeout-finalization-archive-status-plan.json",
      fixtures: [
        getPolicyDecisionFixture(fixtureId),
      ],
    });

    expect(evidence.status).toEqual({
      passed: true,
      finalizationArchive: FINALIZATION_ARCHIVE_PATH,
      report: BROADCAST_REPORT_PATH,
      archive: BROADCAST_ARCHIVE_PATH,
      status: CLOSEOUT_STATUS_PATH,
      summary: CLOSEOUT_SUMMARY_PATH,
      finalizationStatus: FINALIZATION_STATUS_PATH,
      broadcastReceipt: BROADCAST_RECEIPT_PATH,
      broadcastPackage: BROADCAST_PACKAGE_PATH,
      submitResult: SUBMIT_RESULT_PATH,
      signer: SIGNER_ACCOUNT.address,
      chainId: 84532,
      transactions: 1,
      checks: [
        {
          name: "broadcast-closeout-finalization-archive",
          passed: true,
          failures: [],
        },
      ],
    });
    expect(evidence.params.finalizationArchiveStatusPath).toBe(FINALIZATION_ARCHIVE_STATUS_PATH);
    expect(verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus(evidence.params)).toEqual({
      passed: true,
      failures: [],
    });
  });

  it.each(["allowed-swap", "allowed-memory"] as const)("rejects stale saved fixture finalization archive status JSON (%s)", async (fixtureId) => {
    const evidence = await createFixtureBroadcastCloseoutFinalizationArchiveStatusEvidence({
      objective: "Reject stale fixture broadcast closeout finalization archive status JSON",
      proposalPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-json-proposal.json",
      summaryPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-json-proposal.md",
      manifestPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-json-review.json",
      approvalPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-json-approval.json",
      sourcePath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-json-plan.json",
      fixtures: [
        getPolicyDecisionFixture(fixtureId),
      ],
    });
    const status = JSON.parse(evidence.params.finalizationArchiveStatusJson);
    status.transactions = 0;

    expect(
      verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus({
        ...evidence.params,
        finalizationArchiveStatusJson: `${JSON.stringify(status, null, 2)}\n`,
      }),
    ).toEqual({
      passed: false,
      failures: ["closeout finalization archive status JSON does not match current finalization archive evidence"],
    });
  });

  it.each(["allowed-swap", "allowed-memory"] as const)("blocks status verification when fixture finalization archive evidence is stale (%s)", async (fixtureId) => {
    const evidence = await createFixtureBroadcastCloseoutFinalizationArchiveStatusEvidence({
      objective: "Block stale fixture broadcast closeout finalization archive status archive",
      proposalPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-archive-proposal.json",
      summaryPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-archive-proposal.md",
      manifestPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-archive-review.json",
      approvalPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-archive-approval.json",
      sourcePath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-archive-plan.json",
      fixtures: [
        getPolicyDecisionFixture(fixtureId),
      ],
    });
    const archive = JSON.parse(evidence.params.finalizationArchiveJson);
    archive.summary.sha256 = "0".repeat(64);

    expect(
      verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus({
        ...evidence.params,
        finalizationArchiveJson: JSON.stringify(archive, null, 2),
      }),
    ).toEqual({
      passed: false,
      failures: [
        "summary sha256 does not match current summary",
        "closeout finalization archive status JSON does not match current finalization archive evidence",
      ],
    });
  });
});
