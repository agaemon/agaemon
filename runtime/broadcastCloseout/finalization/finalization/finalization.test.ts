import { describe, expect, it } from "vitest";

import { createAgentProposalExecutionBroadcastCloseoutFinalization } from "./finalization.js";
import { createAgentProposalExecutionBroadcastReceipt } from "../../../broadcast/receipt.js";

import type { AgentProposalExecutionBroadcastSubmitResult } from "../../../broadcast/submit.js";

const GENERATED_AT = "2026-06-25T10:00:00.000Z";
const BROADCAST_ARCHIVE_PATH = "artifacts/example-agent-proposal-execution-broadcast-archive.json";
const BROADCAST_PACKAGE_PATH = "artifacts/example-agent-proposal-execution-broadcast-package.json";
const BROADCAST_RECEIPT_PATH = "artifacts/example-agent-proposal-execution-broadcast-receipt.json";
const BROADCAST_REPORT_PATH = "artifacts/example-agent-proposal-execution-broadcast-report.md";
const CLOSEOUT_STATUS_PATH = "artifacts/example-agent-proposal-execution-broadcast-closeout-status.json";
const CLOSEOUT_SUMMARY_PATH = "artifacts/example-agent-proposal-execution-broadcast-closeout-summary.md";
const FINALIZATION_ARCHIVE_STATUS_PATH = "artifacts/example-agent-proposal-execution-broadcast-closeout-finalization-archive-status.json";
const FINALIZATION_ARCHIVE_STATUS_SUMMARY_PATH =
  "artifacts/example-agent-proposal-execution-broadcast-closeout-finalization-archive-status-summary.md";
const FINALIZATION_ARCHIVE_STATUS_SUMMARY_PACKAGE_PATH =
  "artifacts/example-agent-proposal-execution-broadcast-closeout-finalization-archive-status-summary-package.json";
const FINALIZATION_ARCHIVE_STATUS_SUMMARY_PACKAGE_STATUS_PATH =
  "artifacts/example-agent-proposal-execution-broadcast-closeout-finalization-archive-status-summary-package-status.json";
const FINALIZATION_ARCHIVE_PATH = "artifacts/example-agent-proposal-execution-broadcast-closeout-finalization-archive.json";
const FINALIZATION_STATUS_PATH = "artifacts/example-agent-proposal-execution-broadcast-closeout-finalization-status.json";
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

describe("createAgentProposalExecutionBroadcastCloseoutFinalization", () => {
  it("builds and verifies the complete closeout artifact set", () => {
    const finalization = createAgentProposalExecutionBroadcastCloseoutFinalization(createFinalizationParams());

    expect(finalization.passed).toBe(true);
    expect(finalization.failures).toEqual([]);
    expect(finalization.report.path).toBe(BROADCAST_REPORT_PATH);
    expect(finalization.report.markdown).toContain("# Agent Proposal Execution Broadcast Report");
    expect(finalization.archive.path).toBe(BROADCAST_ARCHIVE_PATH);
    expect(JSON.parse(finalization.archive.json).verification.passed).toBe(true);
    expect(finalization.status).not.toBeNull();
    expect(finalization.status?.path).toBe(CLOSEOUT_STATUS_PATH);
    expect(JSON.parse(finalization.status?.json ?? "{}").passed).toBe(true);
    expect(finalization.summary.path).toBe(CLOSEOUT_SUMMARY_PATH);
    expect(finalization.summary.markdown).toContain("# Agent Proposal Execution Broadcast Closeout Summary");
    expect(finalization.summary.markdown).toContain(`| Status | ${CLOSEOUT_STATUS_PATH} |`);
    expect(finalization.verification).toEqual({
      passed: true,
      failures: [],
      expected: finalization.summary.markdown,
    });
  });

  it("does not build status or summary artifacts when receipt evidence is stale", () => {
    const params = createFinalizationParams();
    const staleReceipt = JSON.parse(params.broadcastReceiptJson);
    staleReceipt.transactions[0].status = "reverted";

    expect(
      createAgentProposalExecutionBroadcastCloseoutFinalization({
        ...params,
        broadcastReceiptJson: JSON.stringify(staleReceipt, null, 2),
      }),
    ).toEqual({
      passed: false,
      failures: ["broadcast receipt JSON does not match current broadcast receipt"],
      report: { path: BROADCAST_REPORT_PATH, markdown: "" },
      archive: { path: BROADCAST_ARCHIVE_PATH, json: "" },
      status: null,
      summary: { path: CLOSEOUT_SUMMARY_PATH, markdown: "" },
      finalizationStatus: null,
      finalizationArchive: null,
      finalizationArchiveStatus: null,
      finalizationArchiveStatusSummary: null,
      finalizationArchiveStatusSummaryPackage: null,
      finalizationArchiveStatusSummaryPackageStatus: null,
      verification: {
        passed: false,
        failures: ["broadcast receipt JSON does not match current broadcast receipt"],
        expected: "",
      },
    });
  });

  it("optionally builds a compact finalization status artifact from generated outputs", () => {
    const finalization = createAgentProposalExecutionBroadcastCloseoutFinalization({
      ...createFinalizationParams(),
      finalizationStatusPath: FINALIZATION_STATUS_PATH,
    });

    expect(finalization.passed).toBe(true);
    expect(finalization.finalizationStatus?.path).toBe(FINALIZATION_STATUS_PATH);
    expect(JSON.parse(finalization.finalizationStatus?.json ?? "{}")).toEqual({
      passed: true,
      summary: CLOSEOUT_SUMMARY_PATH,
      report: BROADCAST_REPORT_PATH,
      archive: BROADCAST_ARCHIVE_PATH,
      status: CLOSEOUT_STATUS_PATH,
      broadcastReceipt: BROADCAST_RECEIPT_PATH,
      broadcastPackage: BROADCAST_PACKAGE_PATH,
      submitResult: SUBMIT_RESULT_PATH,
      signer: SIGNER,
      chainId: 84532,
      transactions: 1,
      checks: [
        {
          name: "broadcast-closeout-finalization",
          passed: true,
          failures: [],
        },
      ],
    });
  });

  it("optionally builds a finalization archive artifact from generated outputs", () => {
    const finalization = createAgentProposalExecutionBroadcastCloseoutFinalization({
      ...createFinalizationParams(),
      finalizationStatusPath: FINALIZATION_STATUS_PATH,
      finalizationArchivePath: FINALIZATION_ARCHIVE_PATH,
    });

    expect(finalization.passed).toBe(true);
    expect(finalization.finalizationArchive?.path).toBe(FINALIZATION_ARCHIVE_PATH);
    expect(JSON.parse(finalization.finalizationArchive?.json ?? "{}")).toMatchObject({
      schemaVersion: 1,
      generatedAt: GENERATED_AT,
      finalizationArchivePath: FINALIZATION_ARCHIVE_PATH,
      report: { path: BROADCAST_REPORT_PATH },
      archive: { path: BROADCAST_ARCHIVE_PATH },
      status: { path: CLOSEOUT_STATUS_PATH },
      summary: { path: CLOSEOUT_SUMMARY_PATH },
      finalizationStatus: { path: FINALIZATION_STATUS_PATH },
      receipt: { path: BROADCAST_RECEIPT_PATH },
      broadcastPackage: { path: BROADCAST_PACKAGE_PATH },
      submitResult: { path: SUBMIT_RESULT_PATH },
      verification: {
        passed: true,
        failures: [],
      },
    });
  });

  it("rejects finalization archive output without finalization status output", () => {
    expect(
      createAgentProposalExecutionBroadcastCloseoutFinalization({
        ...createFinalizationParams(),
        finalizationArchivePath: FINALIZATION_ARCHIVE_PATH,
      }),
    ).toMatchObject({
      passed: false,
      failures: ["finalization archive output requires finalization status output"],
      finalizationStatus: null,
      finalizationArchive: null,
    });
  });

  it("optionally builds a finalization archive status artifact from generated outputs", () => {
    const finalization = createAgentProposalExecutionBroadcastCloseoutFinalization({
      ...createFinalizationParams(),
      finalizationStatusPath: FINALIZATION_STATUS_PATH,
      finalizationArchivePath: FINALIZATION_ARCHIVE_PATH,
      finalizationArchiveStatusPath: FINALIZATION_ARCHIVE_STATUS_PATH,
    });

    expect(finalization.passed).toBe(true);
    expect(finalization.finalizationArchiveStatus?.path).toBe(FINALIZATION_ARCHIVE_STATUS_PATH);
    expect(JSON.parse(finalization.finalizationArchiveStatus?.json ?? "{}")).toEqual({
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
      signer: SIGNER,
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
  });

  it("rejects finalization archive status output without finalization archive output", () => {
    expect(
      createAgentProposalExecutionBroadcastCloseoutFinalization({
        ...createFinalizationParams(),
        finalizationStatusPath: FINALIZATION_STATUS_PATH,
        finalizationArchiveStatusPath: FINALIZATION_ARCHIVE_STATUS_PATH,
      }),
    ).toMatchObject({
      passed: false,
      failures: ["finalization archive status output requires finalization archive output"],
      finalizationStatus: null,
      finalizationArchive: null,
      finalizationArchiveStatus: null,
    });
  });

  it("optionally builds a finalization archive status summary artifact from generated outputs", () => {
    const finalization = createAgentProposalExecutionBroadcastCloseoutFinalization({
      ...createFinalizationParams(),
      finalizationStatusPath: FINALIZATION_STATUS_PATH,
      finalizationArchivePath: FINALIZATION_ARCHIVE_PATH,
      finalizationArchiveStatusPath: FINALIZATION_ARCHIVE_STATUS_PATH,
      finalizationArchiveStatusSummaryPath: FINALIZATION_ARCHIVE_STATUS_SUMMARY_PATH,
    });

    expect(finalization.passed).toBe(true);
    expect(finalization.finalizationArchiveStatusSummary?.path).toBe(FINALIZATION_ARCHIVE_STATUS_SUMMARY_PATH);
    expect(finalization.finalizationArchiveStatusSummary?.markdown).toContain(
      "# Agent Proposal Execution Broadcast Closeout Finalization Archive Status Summary",
    );
    expect(finalization.finalizationArchiveStatusSummary?.markdown).toContain(
      `| Finalization Archive Status | ${FINALIZATION_ARCHIVE_STATUS_PATH} |`,
    );
    expect(finalization.finalizationArchiveStatusSummary?.markdown).toContain(
      "| broadcast-closeout-finalization-archive | passed |  |",
    );
  });

  it("rejects finalization archive status summary output without finalization archive status output", () => {
    expect(
      createAgentProposalExecutionBroadcastCloseoutFinalization({
        ...createFinalizationParams(),
        finalizationStatusPath: FINALIZATION_STATUS_PATH,
        finalizationArchivePath: FINALIZATION_ARCHIVE_PATH,
        finalizationArchiveStatusSummaryPath: FINALIZATION_ARCHIVE_STATUS_SUMMARY_PATH,
      }),
    ).toMatchObject({
      passed: false,
      failures: ["finalization archive status summary output requires finalization archive status output"],
      finalizationStatus: null,
      finalizationArchive: null,
      finalizationArchiveStatus: null,
      finalizationArchiveStatusSummary: null,
    });
  });

  it("optionally builds a finalization archive status summary package artifact from generated outputs", () => {
    const finalization = createAgentProposalExecutionBroadcastCloseoutFinalization({
      ...createFinalizationParams(),
      finalizationStatusPath: FINALIZATION_STATUS_PATH,
      finalizationArchivePath: FINALIZATION_ARCHIVE_PATH,
      finalizationArchiveStatusPath: FINALIZATION_ARCHIVE_STATUS_PATH,
      finalizationArchiveStatusSummaryPath: FINALIZATION_ARCHIVE_STATUS_SUMMARY_PATH,
      finalizationArchiveStatusSummaryPackagePath: FINALIZATION_ARCHIVE_STATUS_SUMMARY_PACKAGE_PATH,
    });

    expect(finalization.passed).toBe(true);
    expect(finalization.finalizationArchiveStatusSummaryPackage?.path).toBe(
      FINALIZATION_ARCHIVE_STATUS_SUMMARY_PACKAGE_PATH,
    );
    expect(JSON.parse(finalization.finalizationArchiveStatusSummaryPackage?.json ?? "{}")).toMatchObject({
      schemaVersion: 1,
      generatedAt: GENERATED_AT,
      finalizationArchiveStatusSummaryPackagePath: FINALIZATION_ARCHIVE_STATUS_SUMMARY_PACKAGE_PATH,
      finalizationArchiveStatusSummary: { path: FINALIZATION_ARCHIVE_STATUS_SUMMARY_PATH },
      finalizationArchiveStatus: { path: FINALIZATION_ARCHIVE_STATUS_PATH },
      finalizationArchive: { path: FINALIZATION_ARCHIVE_PATH },
      report: { path: BROADCAST_REPORT_PATH },
      archive: { path: BROADCAST_ARCHIVE_PATH },
      status: { path: CLOSEOUT_STATUS_PATH },
      summary: { path: CLOSEOUT_SUMMARY_PATH },
      finalizationStatus: { path: FINALIZATION_STATUS_PATH },
      receipt: { path: BROADCAST_RECEIPT_PATH },
      broadcastPackage: { path: BROADCAST_PACKAGE_PATH },
      submitResult: { path: SUBMIT_RESULT_PATH },
      verification: {
        passed: true,
        failures: [],
      },
    });
  });

  it("rejects finalization archive status summary package output without finalization archive status summary output", () => {
    expect(
      createAgentProposalExecutionBroadcastCloseoutFinalization({
        ...createFinalizationParams(),
        finalizationStatusPath: FINALIZATION_STATUS_PATH,
        finalizationArchivePath: FINALIZATION_ARCHIVE_PATH,
        finalizationArchiveStatusPath: FINALIZATION_ARCHIVE_STATUS_PATH,
        finalizationArchiveStatusSummaryPackagePath: FINALIZATION_ARCHIVE_STATUS_SUMMARY_PACKAGE_PATH,
      }),
    ).toMatchObject({
      passed: false,
      failures: ["finalization archive status summary package output requires finalization archive status summary output"],
      finalizationStatus: null,
      finalizationArchive: null,
      finalizationArchiveStatus: null,
      finalizationArchiveStatusSummary: null,
      finalizationArchiveStatusSummaryPackage: null,
    });
  });

  it("optionally builds a finalization archive status summary package status artifact from generated outputs", () => {
    const finalization = createAgentProposalExecutionBroadcastCloseoutFinalization({
      ...createFinalizationParams(),
      finalizationStatusPath: FINALIZATION_STATUS_PATH,
      finalizationArchivePath: FINALIZATION_ARCHIVE_PATH,
      finalizationArchiveStatusPath: FINALIZATION_ARCHIVE_STATUS_PATH,
      finalizationArchiveStatusSummaryPath: FINALIZATION_ARCHIVE_STATUS_SUMMARY_PATH,
      finalizationArchiveStatusSummaryPackagePath: FINALIZATION_ARCHIVE_STATUS_SUMMARY_PACKAGE_PATH,
      finalizationArchiveStatusSummaryPackageStatusPath: FINALIZATION_ARCHIVE_STATUS_SUMMARY_PACKAGE_STATUS_PATH,
    });

    expect(finalization.passed).toBe(true);
    expect(finalization.finalizationArchiveStatusSummaryPackageStatus?.path).toBe(
      FINALIZATION_ARCHIVE_STATUS_SUMMARY_PACKAGE_STATUS_PATH,
    );
    expect(JSON.parse(finalization.finalizationArchiveStatusSummaryPackageStatus?.json ?? "{}")).toEqual({
      passed: true,
      finalizationArchiveStatusSummaryPackage: FINALIZATION_ARCHIVE_STATUS_SUMMARY_PACKAGE_PATH,
      finalizationArchiveStatusSummary: FINALIZATION_ARCHIVE_STATUS_SUMMARY_PATH,
      finalizationArchiveStatus: FINALIZATION_ARCHIVE_STATUS_PATH,
      finalizationArchive: FINALIZATION_ARCHIVE_PATH,
      report: BROADCAST_REPORT_PATH,
      archive: BROADCAST_ARCHIVE_PATH,
      status: CLOSEOUT_STATUS_PATH,
      summary: CLOSEOUT_SUMMARY_PATH,
      finalizationStatus: FINALIZATION_STATUS_PATH,
      broadcastReceipt: BROADCAST_RECEIPT_PATH,
      broadcastPackage: BROADCAST_PACKAGE_PATH,
      submitResult: SUBMIT_RESULT_PATH,
      signer: SIGNER,
      chainId: 84532,
      transactions: 1,
      checks: [
        {
          name: "broadcast-closeout-finalization-archive-status-summary-package",
          passed: true,
          failures: [],
        },
      ],
    });
  });

  it("rejects finalization archive status summary package status output without package output", () => {
    expect(
      createAgentProposalExecutionBroadcastCloseoutFinalization({
        ...createFinalizationParams(),
        finalizationStatusPath: FINALIZATION_STATUS_PATH,
        finalizationArchivePath: FINALIZATION_ARCHIVE_PATH,
        finalizationArchiveStatusPath: FINALIZATION_ARCHIVE_STATUS_PATH,
        finalizationArchiveStatusSummaryPath: FINALIZATION_ARCHIVE_STATUS_SUMMARY_PATH,
        finalizationArchiveStatusSummaryPackageStatusPath: FINALIZATION_ARCHIVE_STATUS_SUMMARY_PACKAGE_STATUS_PATH,
      }),
    ).toMatchObject({
      passed: false,
      failures: [
        "finalization archive status summary package status output requires finalization archive status summary package output",
      ],
      finalizationStatus: null,
      finalizationArchive: null,
      finalizationArchiveStatus: null,
      finalizationArchiveStatusSummary: null,
      finalizationArchiveStatusSummaryPackage: null,
      finalizationArchiveStatusSummaryPackageStatus: null,
    });
  });
});

function createFinalizationParams() {
  const broadcastPackageJson = JSON.stringify(BROADCAST_PACKAGE, null, 2);
  const submitResultJson = JSON.stringify(SUBMIT_RESULT, null, 2);
  const receipt = createAgentProposalExecutionBroadcastReceipt({
    broadcastPackagePath: BROADCAST_PACKAGE_PATH,
    broadcastPackageJson,
    submitResult: SUBMIT_RESULT,
    generatedAt: GENERATED_AT,
  });
  if (!receipt.passed || receipt.receipt === null) throw new Error("test fixture receipt failed");

  return {
    broadcastReceiptPath: BROADCAST_RECEIPT_PATH,
    broadcastReceiptJson: JSON.stringify(receipt.receipt, null, 2),
    broadcastPackagePath: BROADCAST_PACKAGE_PATH,
    broadcastPackageJson,
    submitResultPath: SUBMIT_RESULT_PATH,
    submitResultJson,
    reportPath: BROADCAST_REPORT_PATH,
    archivePath: BROADCAST_ARCHIVE_PATH,
    statusPath: CLOSEOUT_STATUS_PATH,
    summaryPath: CLOSEOUT_SUMMARY_PATH,
    generatedAt: GENERATED_AT,
  };
}
