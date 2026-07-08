import { verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatus } from "../statusVerify.js";

import type {
  AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatus as PackageStatus,
} from "../status.js";
import type {
  VerifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusParams as VerifyPackageStatusParams,
} from "../statusVerify.js";

export interface CreatePackageStatusSummaryParams
  extends VerifyPackageStatusParams {
  finalizationArchiveStatusSummaryPackageStatusPath: string;
}

export interface PackageStatusSummary {
  passed: boolean;
  failures: string[];
  markdown: string;
}

export function createPackageStatusSummary(params: CreatePackageStatusSummaryParams): PackageStatusSummary {
  const verification = verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatus(params);
  if (!verification.passed) {
    return {
      passed: false,
      failures: verification.failures,
      markdown: "",
    };
  }

  return {
    passed: true,
    failures: [],
    markdown: renderMarkdown(
      params,
      JSON.parse(params.finalizationArchiveStatusSummaryPackageStatusJson) as
        PackageStatus,
    ),
  };
}

function renderMarkdown(
  params: CreatePackageStatusSummaryParams,
  status: PackageStatus,
): string {
  return [
    "# Agent Proposal Execution Broadcast Closeout Finalization Archive Status Summary Package Status Summary",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Finalization Archive Status Summary Package Status | ${escapeCell(
      params.finalizationArchiveStatusSummaryPackageStatusPath,
    )} |`,
    `| Finalization Archive Status Summary Package | ${escapeCell(
      status.finalizationArchiveStatusSummaryPackage ?? "unknown",
    )} |`,
    `| Finalization Archive Status Summary | ${escapeCell(status.finalizationArchiveStatusSummary)} |`,
    `| Finalization Archive Status | ${escapeCell(status.finalizationArchiveStatus)} |`,
    `| Finalization Archive | ${escapeCell(status.finalizationArchive)} |`,
    `| Report | ${escapeCell(params.reportPath)} |`,
    `| Archive | ${escapeCell(params.archivePath)} |`,
    `| Status | ${escapeCell(params.statusPath)} |`,
    `| Summary | ${escapeCell(params.summaryPath)} |`,
    `| Finalization Status | ${escapeCell(params.finalizationStatusPath)} |`,
    `| Broadcast Receipt | ${escapeCell(params.broadcastReceiptPath)} |`,
    `| Broadcast Package | ${escapeCell(params.broadcastPackagePath)} |`,
    `| Submit Result | ${escapeCell(params.submitResultPath)} |`,
    `| Signer | ${escapeCell(status.signer ?? "unknown")} |`,
    `| Chain ID | ${status.chainId ?? "unknown"} |`,
    `| Transactions | ${status.transactions} |`,
    `| Overall Status | ${status.passed ? "passed" : "failed"} |`,
    "",
    "## Checks",
    "",
    "| Check | Status | Failures |",
    "| --- | --- | --- |",
    ...status.checks.map((check) => (
      `| ${check.name} | ${check.passed ? "passed" : "failed"} | ${escapeCell(check.failures.join("; "))} |`
    )),
    "",
  ].join("\n");
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}
