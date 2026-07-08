import { verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus } from "../status/statusVerify.js";

import type { AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus } from "../status/status.js";
import type {
  VerifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusParams,
} from "../status/statusVerify.js";

export interface CreateAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryParams
  extends VerifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusParams {
  finalizationArchiveStatusPath: string;
}

export interface AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummary {
  passed: boolean;
  failures: string[];
  markdown: string;
}

export function createAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummary(
  params: CreateAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryParams,
): AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummary {
  const verification = verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus(params);
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
    markdown: renderMarkdown(params, JSON.parse(params.finalizationArchiveStatusJson) as AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus),
  };
}

function renderMarkdown(
  params: CreateAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryParams,
  status: AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus,
): string {
  return [
    "# Agent Proposal Execution Broadcast Closeout Finalization Archive Status Summary",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Finalization Archive Status | ${escapeCell(params.finalizationArchiveStatusPath)} |`,
    `| Finalization Archive | ${escapeCell(status.finalizationArchive ?? "unknown")} |`,
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
