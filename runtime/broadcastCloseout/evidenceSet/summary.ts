import { verifyAgentProposalExecutionBroadcastCloseoutEvidenceSet } from "./verify.js";

import type { VerifyAgentProposalExecutionBroadcastCloseoutEvidenceSetParams } from "./verify.js";

export interface AgentProposalExecutionBroadcastCloseoutEvidenceSetSummary {
  passed: boolean;
  failures: string[];
  markdown: string;
}

export function createAgentProposalExecutionBroadcastCloseoutEvidenceSetSummary(
  params: VerifyAgentProposalExecutionBroadcastCloseoutEvidenceSetParams,
): AgentProposalExecutionBroadcastCloseoutEvidenceSetSummary {
  const verification = verifyAgentProposalExecutionBroadcastCloseoutEvidenceSet(params);
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
    markdown: renderMarkdown(params, verification),
  };
}

function renderMarkdown(
  params: VerifyAgentProposalExecutionBroadcastCloseoutEvidenceSetParams,
  verification: ReturnType<typeof verifyAgentProposalExecutionBroadcastCloseoutEvidenceSet>,
): string {
  return [
    "# Agent Proposal Execution Broadcast Closeout Summary",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Report | ${escapeCell(params.reportPath)} |`,
    `| Archive | ${escapeCell(params.archivePath)} |`,
    `| Status | ${escapeCell(params.statusPath)} |`,
    `| Broadcast Receipt | ${escapeCell(params.broadcastReceiptPath)} |`,
    `| Broadcast Package | ${escapeCell(params.broadcastPackagePath)} |`,
    `| Submit Result | ${escapeCell(params.submitResultPath)} |`,
    `| Overall Status | ${verification.passed ? "passed" : "failed"} |`,
    "",
    "## Checks",
    "",
    "| Check | Status | Failures |",
    "| --- | --- | --- |",
    ...verification.checks.map((check) => (
      `| ${check.name} | ${check.passed ? "passed" : "failed"} | ${escapeCell(check.failures.join("; "))} |`
    )),
    "",
  ].join("\n");
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}
