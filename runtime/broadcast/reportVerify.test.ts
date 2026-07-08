import { describe, expect, it } from "vitest";

import { createAgentProposalExecutionBroadcastReceipt } from "./receipt.js";
import { createAgentProposalExecutionBroadcastReport } from "./report.js";
import { verifyAgentProposalExecutionBroadcastReport } from "./reportVerify.js";

import type { AgentProposalExecutionBroadcastSubmitResult } from "./submit.js";

const GENERATED_AT = "2026-06-25T10:00:00.000Z";
const BROADCAST_PACKAGE_PATH = "artifacts/example-agent-proposal-execution-broadcast-package.json";
const BROADCAST_RECEIPT_PATH = "artifacts/example-agent-proposal-execution-broadcast-receipt.json";
const BROADCAST_REPORT_PATH = "artifacts/example-agent-proposal-execution-broadcast-report.md";
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

describe("verifyAgentProposalExecutionBroadcastReport", () => {
  it("passes when the saved report matches current receipt evidence", () => {
    const evidence = createReportEvidence();

    expect(verifyAgentProposalExecutionBroadcastReport(evidence)).toEqual({
      passed: true,
      failures: [],
      report: expect.objectContaining({
        passed: true,
        failures: [],
        transactions: 1,
        markdown: evidence.reportMarkdown,
      }),
    });
  });

  it("rejects edited report markdown", () => {
    const evidence = createReportEvidence();

    expect(
      verifyAgentProposalExecutionBroadcastReport({
        ...evidence,
        reportMarkdown: evidence.reportMarkdown.replace("success", "pending"),
      }),
    ).toEqual({
      passed: false,
      failures: ["broadcast report markdown does not match current receipt evidence"],
      report: expect.objectContaining({
        passed: true,
        failures: [],
        transactions: 1,
        markdown: evidence.reportMarkdown,
      }),
    });
  });
});

function createReportEvidence() {
  const broadcastPackageJson = JSON.stringify(BROADCAST_PACKAGE, null, 2);
  const submitResultJson = JSON.stringify(SUBMIT_RESULT, null, 2);
  const receipt = createAgentProposalExecutionBroadcastReceipt({
    broadcastPackagePath: BROADCAST_PACKAGE_PATH,
    broadcastPackageJson,
    submitResult: SUBMIT_RESULT,
    generatedAt: GENERATED_AT,
  });
  if (!receipt.passed || receipt.receipt === null) throw new Error("test fixture receipt failed");

  const report = createAgentProposalExecutionBroadcastReport({
    broadcastReceiptPath: BROADCAST_RECEIPT_PATH,
    broadcastReceiptJson: JSON.stringify(receipt.receipt, null, 2),
    broadcastPackagePath: BROADCAST_PACKAGE_PATH,
    broadcastPackageJson,
    submitResultPath: SUBMIT_RESULT_PATH,
    submitResultJson,
  });
  if (!report.passed) throw new Error("test fixture report failed");

  return {
    reportPath: BROADCAST_REPORT_PATH,
    reportMarkdown: report.markdown,
    broadcastReceiptPath: BROADCAST_RECEIPT_PATH,
    broadcastReceiptJson: JSON.stringify(receipt.receipt, null, 2),
    broadcastPackagePath: BROADCAST_PACKAGE_PATH,
    broadcastPackageJson,
    submitResultPath: SUBMIT_RESULT_PATH,
    submitResultJson,
  };
}
