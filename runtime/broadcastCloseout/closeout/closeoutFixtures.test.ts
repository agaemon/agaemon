import { describe, expect, it } from "vitest";

import { createAgentProposalExecutionBroadcastCloseout } from "./closeout.js";
import { verifyAgentProposalExecutionBroadcastCloseout } from "./closeoutVerify.js";
import { verifyAgentProposalExecutionBroadcastArchive } from "../../broadcast/archiveVerify.js";
import { getPolicyDecisionFixture } from "../../fixtures/policyDecisions.js";
import {
  BROADCAST_ARCHIVE_PATH,
  BROADCAST_REPORT_PATH,
  FIRST_TX_HASH,
  GENERATED_AT,
  SECOND_TX_HASH,
  createFixtureBroadcastReceiptEvidence,
} from "../fixtures/closeoutEvidence.js";

describe("broadcast closeout fixture integration", () => {
  it("packages verified fixture archive evidence for closeout", async () => {
    const evidence = await createFixtureBroadcastReceiptEvidence({
      objective: "Close out fixture broadcast archive evidence",
      proposalPath: "artifacts/fixture-broadcast-closeout-proposal.json",
      summaryPath: "artifacts/fixture-broadcast-closeout-proposal.md",
      manifestPath: "artifacts/fixture-broadcast-closeout-review.json",
      approvalPath: "artifacts/fixture-broadcast-closeout-approval.json",
      sourcePath: "artifacts/fixture-broadcast-closeout-plan.json",
      fixtures: [
        getPolicyDecisionFixture("allowed-swap"),
        getPolicyDecisionFixture("allowed-memory"),
      ],
    });

    const closeout = createAgentProposalExecutionBroadcastCloseout({
      ...evidence,
      reportPath: BROADCAST_REPORT_PATH,
      archivePath: BROADCAST_ARCHIVE_PATH,
      generatedAt: GENERATED_AT,
    });

    expect(closeout.passed).toBe(true);
    expect(closeout.failures).toEqual([]);
    expect(closeout.report.path).toBe(BROADCAST_REPORT_PATH);
    expect(closeout.report.markdown).toContain("# Agent Proposal Execution Broadcast Report");
    expect(closeout.report.markdown).toContain("| Transactions | 2 |");
    expect(closeout.report.markdown).toContain(`| 0 | ${FIRST_TX_HASH} | 901 | success |`);
    expect(closeout.report.markdown).toContain(`| 1 | ${SECOND_TX_HASH} | 902 | success |`);
    expect(closeout.archive.path).toBe(BROADCAST_ARCHIVE_PATH);
    expect(JSON.parse(closeout.archive.json)).toMatchObject({
      schemaVersion: 1,
      generatedAt: GENERATED_AT,
      archivePath: BROADCAST_ARCHIVE_PATH,
      verification: {
        passed: true,
        failures: [],
        report: {
          passed: true,
          failures: [],
          transactions: 2,
        },
      },
    });
    expect(closeout.archiveVerification).toEqual({ passed: true, failures: [] });
    expect(
      verifyAgentProposalExecutionBroadcastArchive({
        ...evidence,
        archivePath: BROADCAST_ARCHIVE_PATH,
        archiveJson: closeout.archive.json,
        reportPath: BROADCAST_REPORT_PATH,
        reportMarkdown: closeout.report.markdown,
      }),
    ).toEqual({
      passed: true,
      failures: [],
    });
    expect(
      verifyAgentProposalExecutionBroadcastCloseout({
        ...evidence,
        archivePath: BROADCAST_ARCHIVE_PATH,
        archiveJson: closeout.archive.json,
        reportPath: BROADCAST_REPORT_PATH,
        reportMarkdown: closeout.report.markdown,
      }),
    ).toEqual({
      passed: true,
      failures: [],
      closeout,
    });
  });

  it("blocks stale fixture archive evidence during closeout verification", async () => {
    const evidence = await createFixtureBroadcastReceiptEvidence({
      objective: "Block stale fixture broadcast closeout archive",
      proposalPath: "artifacts/fixture-stale-broadcast-closeout-proposal.json",
      summaryPath: "artifacts/fixture-stale-broadcast-closeout-proposal.md",
      manifestPath: "artifacts/fixture-stale-broadcast-closeout-review.json",
      approvalPath: "artifacts/fixture-stale-broadcast-closeout-approval.json",
      sourcePath: "artifacts/fixture-stale-broadcast-closeout-plan.json",
      fixtures: [
        getPolicyDecisionFixture("allowed-swap"),
        getPolicyDecisionFixture("allowed-memory"),
      ],
    });
    const closeout = createAgentProposalExecutionBroadcastCloseout({
      ...evidence,
      reportPath: BROADCAST_REPORT_PATH,
      archivePath: BROADCAST_ARCHIVE_PATH,
      generatedAt: GENERATED_AT,
    });
    if (!closeout.passed) {
      throw new Error(`fixture closeout failed: ${closeout.failures.join(", ")}`);
    }
    const staleArchive = JSON.parse(closeout.archive.json);
    staleArchive.receipt.sha256 = "12".repeat(32);
    const staleArchiveJson = `${JSON.stringify(staleArchive, null, 2)}\n`;

    expect(
      verifyAgentProposalExecutionBroadcastArchive({
        ...evidence,
        archivePath: BROADCAST_ARCHIVE_PATH,
        archiveJson: staleArchiveJson,
        reportPath: BROADCAST_REPORT_PATH,
        reportMarkdown: closeout.report.markdown,
      }),
    ).toEqual({
      passed: false,
      failures: ["receipt sha256 does not match current receipt"],
    });
    expect(
      verifyAgentProposalExecutionBroadcastCloseout({
        ...evidence,
        archivePath: BROADCAST_ARCHIVE_PATH,
        archiveJson: staleArchiveJson,
        reportPath: BROADCAST_REPORT_PATH,
        reportMarkdown: closeout.report.markdown,
      }),
    ).toEqual({
      passed: false,
      failures: ["closeout archive JSON does not match current broadcast closeout"],
      closeout: expect.objectContaining({
        passed: true,
        failures: [],
        report: closeout.report,
        archive: closeout.archive,
      }),
    });
  });
});
