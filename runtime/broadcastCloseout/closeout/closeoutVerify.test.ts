import { describe, expect, it } from "vitest";

import { createAgentProposalExecutionBroadcastCloseout } from "./closeout.js";
import { createAgentProposalExecutionBroadcastReceipt } from "../../broadcast/receipt.js";
import { verifyAgentProposalExecutionBroadcastCloseout } from "./closeoutVerify.js";

import type { AgentProposalExecutionBroadcastSubmitResult } from "../../broadcast/submit.js";

const GENERATED_AT = "2026-06-25T10:00:00.000Z";
const BROADCAST_ARCHIVE_PATH = "artifacts/example-agent-proposal-execution-broadcast-archive.json";
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

describe("verifyAgentProposalExecutionBroadcastCloseout", () => {
  it("passes when saved closeout outputs match current receipt evidence", () => {
    const evidence = createCloseoutEvidence();

    expect(verifyAgentProposalExecutionBroadcastCloseout(evidence)).toEqual({
      passed: true,
      failures: [],
      closeout: expect.objectContaining({
        passed: true,
        failures: [],
        report: { path: BROADCAST_REPORT_PATH, markdown: evidence.reportMarkdown },
        archive: { path: BROADCAST_ARCHIVE_PATH, json: evidence.archiveJson },
      }),
    });
  });

  it("rejects edited report Markdown", () => {
    const evidence = createCloseoutEvidence();

    expect(
      verifyAgentProposalExecutionBroadcastCloseout({
        ...evidence,
        reportMarkdown: evidence.reportMarkdown.replace("success", "pending"),
      }),
    ).toEqual({
      passed: false,
      failures: ["closeout report Markdown does not match current broadcast closeout"],
      closeout: expect.objectContaining({
        passed: true,
        failures: [],
      }),
    });
  });

  it("rejects edited archive JSON", () => {
    const evidence = createCloseoutEvidence();
    const archive = JSON.parse(evidence.archiveJson);
    archive.submitResult.path = "artifacts/other-submit.json";

    expect(
      verifyAgentProposalExecutionBroadcastCloseout({
        ...evidence,
        archiveJson: `${JSON.stringify(archive, null, 2)}\n`,
      }),
    ).toEqual({
      passed: false,
      failures: ["closeout archive JSON does not match current broadcast closeout"],
      closeout: expect.objectContaining({
        passed: true,
        failures: [],
      }),
    });
  });
});

function createCloseoutEvidence() {
  const broadcastPackageJson = JSON.stringify(BROADCAST_PACKAGE, null, 2);
  const submitResultJson = JSON.stringify(SUBMIT_RESULT, null, 2);
  const receipt = createAgentProposalExecutionBroadcastReceipt({
    broadcastPackagePath: BROADCAST_PACKAGE_PATH,
    broadcastPackageJson,
    submitResult: SUBMIT_RESULT,
    generatedAt: GENERATED_AT,
  });
  if (!receipt.passed || receipt.receipt === null) throw new Error("test fixture receipt failed");
  const closeout = createAgentProposalExecutionBroadcastCloseout({
    broadcastReceiptPath: BROADCAST_RECEIPT_PATH,
    broadcastReceiptJson: JSON.stringify(receipt.receipt, null, 2),
    broadcastPackagePath: BROADCAST_PACKAGE_PATH,
    broadcastPackageJson,
    submitResultPath: SUBMIT_RESULT_PATH,
    submitResultJson,
    reportPath: BROADCAST_REPORT_PATH,
    archivePath: BROADCAST_ARCHIVE_PATH,
    generatedAt: GENERATED_AT,
  });
  if (!closeout.passed) throw new Error("test fixture closeout failed");

  return {
    reportPath: BROADCAST_REPORT_PATH,
    reportMarkdown: closeout.report.markdown,
    archivePath: BROADCAST_ARCHIVE_PATH,
    archiveJson: closeout.archive.json,
    broadcastReceiptPath: BROADCAST_RECEIPT_PATH,
    broadcastReceiptJson: JSON.stringify(receipt.receipt, null, 2),
    broadcastPackagePath: BROADCAST_PACKAGE_PATH,
    broadcastPackageJson,
    submitResultPath: SUBMIT_RESULT_PATH,
    submitResultJson,
  };
}
