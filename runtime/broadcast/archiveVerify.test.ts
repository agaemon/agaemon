import { describe, expect, it } from "vitest";

import { createAgentProposalExecutionBroadcastArchive } from "./archive.js";
import { createAgentProposalExecutionBroadcastReceipt } from "./receipt.js";
import { createAgentProposalExecutionBroadcastReport } from "./report.js";
import { verifyAgentProposalExecutionBroadcastArchive } from "./archiveVerify.js";

import type { AgentProposalExecutionBroadcastSubmitResult } from "./submit.js";

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

describe("verifyAgentProposalExecutionBroadcastArchive", () => {
  it("passes when the saved archive matches current post-broadcast evidence", () => {
    const evidence = createArchiveEvidence();

    expect(verifyAgentProposalExecutionBroadcastArchive(evidence)).toEqual({
      passed: true,
      failures: [],
    });
  });

  it("rejects stale archive hashes", () => {
    const evidence = createArchiveEvidence();
    const archive = JSON.parse(evidence.archiveJson);
    archive.report.sha256 = "12".repeat(32);

    expect(
      verifyAgentProposalExecutionBroadcastArchive({
        ...evidence,
        archiveJson: JSON.stringify(archive, null, 2),
      }),
    ).toEqual({
      passed: false,
      failures: ["report sha256 does not match current report"],
    });
  });

  it("rejects malformed archive JSON", () => {
    const evidence = createArchiveEvidence();

    const result = verifyAgentProposalExecutionBroadcastArchive({
      ...evidence,
      archiveJson: "{",
    });

    expect(result.passed).toBe(false);
    expect(result.failures[0]).toMatch(/^broadcast archive JSON is malformed:/);
  });
});

function createArchiveEvidence() {
  const broadcastPackageJson = JSON.stringify(BROADCAST_PACKAGE, null, 2);
  const submitResultJson = JSON.stringify(SUBMIT_RESULT, null, 2);
  const receipt = createAgentProposalExecutionBroadcastReceipt({
    broadcastPackagePath: BROADCAST_PACKAGE_PATH,
    broadcastPackageJson,
    submitResult: SUBMIT_RESULT,
    generatedAt: GENERATED_AT,
  });
  if (!receipt.passed || receipt.receipt === null) throw new Error("test fixture receipt failed");
  const broadcastReceiptJson = JSON.stringify(receipt.receipt, null, 2);
  const report = createAgentProposalExecutionBroadcastReport({
    broadcastReceiptPath: BROADCAST_RECEIPT_PATH,
    broadcastReceiptJson,
    broadcastPackagePath: BROADCAST_PACKAGE_PATH,
    broadcastPackageJson,
    submitResultPath: SUBMIT_RESULT_PATH,
    submitResultJson,
  });
  if (!report.passed) throw new Error("test fixture report failed");

  const archive = createAgentProposalExecutionBroadcastArchive({
    archivePath: BROADCAST_ARCHIVE_PATH,
    reportPath: BROADCAST_REPORT_PATH,
    reportMarkdown: report.markdown,
    broadcastReceiptPath: BROADCAST_RECEIPT_PATH,
    broadcastReceiptJson,
    broadcastPackagePath: BROADCAST_PACKAGE_PATH,
    broadcastPackageJson,
    submitResultPath: SUBMIT_RESULT_PATH,
    submitResultJson,
    generatedAt: GENERATED_AT,
  });

  return {
    archivePath: BROADCAST_ARCHIVE_PATH,
    archiveJson: JSON.stringify(archive, null, 2),
    reportPath: BROADCAST_REPORT_PATH,
    reportMarkdown: report.markdown,
    broadcastReceiptPath: BROADCAST_RECEIPT_PATH,
    broadcastReceiptJson,
    broadcastPackagePath: BROADCAST_PACKAGE_PATH,
    broadcastPackageJson,
    submitResultPath: SUBMIT_RESULT_PATH,
    submitResultJson,
  };
}
