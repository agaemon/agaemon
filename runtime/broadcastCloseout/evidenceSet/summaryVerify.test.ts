import { describe, expect, it } from "vitest";

import { createAgentProposalExecutionBroadcastCloseoutEvidenceSet } from "./set.js";
import { createAgentProposalExecutionBroadcastCloseoutEvidenceSetSummary } from "./summary.js";
import { createAgentProposalExecutionBroadcastReceipt } from "../../broadcast/receipt.js";
import { verifyAgentProposalExecutionBroadcastCloseoutEvidenceSetSummary } from "./summaryVerify.js";

import type { AgentProposalExecutionBroadcastSubmitResult } from "../../broadcast/submit.js";

const GENERATED_AT = "2026-06-25T10:00:00.000Z";
const BROADCAST_ARCHIVE_PATH = "artifacts/example-agent-proposal-execution-broadcast-archive.json";
const BROADCAST_PACKAGE_PATH = "artifacts/example-agent-proposal-execution-broadcast-package.json";
const BROADCAST_RECEIPT_PATH = "artifacts/example-agent-proposal-execution-broadcast-receipt.json";
const BROADCAST_REPORT_PATH = "artifacts/example-agent-proposal-execution-broadcast-report.md";
const CLOSEOUT_STATUS_PATH = "artifacts/example-agent-proposal-execution-broadcast-closeout-status.json";
const CLOSEOUT_SUMMARY_PATH = "artifacts/example-agent-proposal-execution-broadcast-closeout-summary.md";
const SUBMIT_RESULT_PATH = "artifacts/example-agent-proposal-execution-broadcast-submit.json";
const SIGNER = "0x0000000000000000000000000000000000000d01";
const TX_HASH = `0x${"34".repeat(32)}` as const;

const BROADCAST_PACKAGE = {
  schemaVersion: 1,
  generatedAt: GENERATED_AT,
  signer: SIGNER,
  chainId: 84532,
  nonceStart: 7,
  pendingNonce: 7,
  transactions: [
    {
      index: 0,
      rawTransaction: "0x1234",
    },
  ],
};

const SUBMIT_RESULT: AgentProposalExecutionBroadcastSubmitResult = {
  mode: "send",
  passed: true,
  failures: [],
  broadcastPackage: BROADCAST_PACKAGE_PATH,
  signer: SIGNER,
  chainId: 84532,
  transactions: 1,
  submitted: [
    {
      index: 0,
      hash: TX_HASH,
      blockNumber: "999",
      status: "success",
    },
  ],
};

describe("verifyAgentProposalExecutionBroadcastCloseoutEvidenceSetSummary", () => {
  it("passes when saved summary Markdown matches current evidence", () => {
    const evidence = createSummaryEvidence();

    expect(verifyAgentProposalExecutionBroadcastCloseoutEvidenceSetSummary(evidence)).toEqual({
      passed: true,
      failures: [],
      expected: evidence.summaryMarkdown,
    });
  });

  it("rejects edited summary Markdown", () => {
    const evidence = createSummaryEvidence();

    expect(
      verifyAgentProposalExecutionBroadcastCloseoutEvidenceSetSummary({
        ...evidence,
        summaryMarkdown: evidence.summaryMarkdown.replace("passed", "failed"),
      }),
    ).toEqual({
      passed: false,
      failures: ["closeout evidence set summary Markdown does not match current evidence"],
      expected: evidence.summaryMarkdown,
    });
  });
});

function createSummaryEvidence() {
  const broadcastPackageJson = JSON.stringify(BROADCAST_PACKAGE, null, 2);
  const submitResultJson = JSON.stringify(SUBMIT_RESULT, null, 2);
  const receipt = createAgentProposalExecutionBroadcastReceipt({
    broadcastPackagePath: BROADCAST_PACKAGE_PATH,
    broadcastPackageJson,
    submitResult: SUBMIT_RESULT,
    generatedAt: GENERATED_AT,
  });
  if (!receipt.passed || receipt.receipt === null) throw new Error("test fixture receipt failed");

  const params = {
    broadcastReceiptPath: BROADCAST_RECEIPT_PATH,
    broadcastReceiptJson: JSON.stringify(receipt.receipt, null, 2),
    broadcastPackagePath: BROADCAST_PACKAGE_PATH,
    broadcastPackageJson,
    submitResultPath: SUBMIT_RESULT_PATH,
    submitResultJson,
    reportPath: BROADCAST_REPORT_PATH,
    archivePath: BROADCAST_ARCHIVE_PATH,
    statusPath: CLOSEOUT_STATUS_PATH,
    generatedAt: GENERATED_AT,
  };
  const evidenceSet = createAgentProposalExecutionBroadcastCloseoutEvidenceSet(params);
  if (!evidenceSet.passed || evidenceSet.status === null) throw new Error("test fixture evidence set failed");

  const summaryParams = {
    reportPath: BROADCAST_REPORT_PATH,
    reportMarkdown: evidenceSet.report.markdown,
    archivePath: BROADCAST_ARCHIVE_PATH,
    archiveJson: evidenceSet.archive.json,
    statusPath: CLOSEOUT_STATUS_PATH,
    statusJson: evidenceSet.status.json,
    broadcastReceiptPath: BROADCAST_RECEIPT_PATH,
    broadcastReceiptJson: params.broadcastReceiptJson,
    broadcastPackagePath: BROADCAST_PACKAGE_PATH,
    broadcastPackageJson,
    submitResultPath: SUBMIT_RESULT_PATH,
    submitResultJson,
  };
  const summary = createAgentProposalExecutionBroadcastCloseoutEvidenceSetSummary(summaryParams);
  if (!summary.passed) throw new Error("test fixture summary failed");

  return {
    summaryPath: CLOSEOUT_SUMMARY_PATH,
    summaryMarkdown: summary.markdown,
    ...summaryParams,
  };
}
