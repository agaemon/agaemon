import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createAgentProposalExecutionBroadcastArchive } from "./archive.js";
import { createAgentProposalExecutionBroadcastReceipt } from "./receipt.js";
import { createAgentProposalExecutionBroadcastReport } from "./report.js";

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

describe("createAgentProposalExecutionBroadcastArchive", () => {
  it("creates a deterministic archive manifest for current post-broadcast evidence", () => {
    const evidence = createArchiveEvidence();

    expect(createAgentProposalExecutionBroadcastArchive(evidence)).toEqual({
      schemaVersion: 1,
      generatedAt: GENERATED_AT,
      archivePath: BROADCAST_ARCHIVE_PATH,
      report: { path: BROADCAST_REPORT_PATH, sha256: sha256(evidence.reportMarkdown) },
      receipt: { path: BROADCAST_RECEIPT_PATH, sha256: sha256(evidence.broadcastReceiptJson) },
      broadcastPackage: { path: BROADCAST_PACKAGE_PATH, sha256: sha256(evidence.broadcastPackageJson) },
      submitResult: { path: SUBMIT_RESULT_PATH, sha256: sha256(evidence.submitResultJson) },
      verification: {
        passed: true,
        failures: [],
        report: {
          passed: true,
          failures: [],
          markdown: evidence.reportMarkdown,
          transactions: 1,
        },
      },
    });
  });

  it("keeps hashes and failed verification details for edited report markdown", () => {
    const evidence = createArchiveEvidence();
    const editedReportMarkdown = evidence.reportMarkdown.replace("success", "pending");

    expect(
      createAgentProposalExecutionBroadcastArchive({
        ...evidence,
        reportMarkdown: editedReportMarkdown,
      }),
    ).toMatchObject({
      report: { path: BROADCAST_REPORT_PATH, sha256: sha256(editedReportMarkdown) },
      verification: {
        passed: false,
        failures: ["broadcast report markdown does not match current receipt evidence"],
      },
    });
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

  return {
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
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
