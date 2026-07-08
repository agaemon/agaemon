import { verifyAgentProposalExecutionPreview } from "./previewVerify.js";

import type { AgentProposalExecutionPreviewVerification } from "./previewVerify.js";
import type { VerifyAgentProposalExecutionPreviewParams } from "./previewVerify.js";

export interface CreateAgentProposalExecutionRunbookParams extends VerifyAgentProposalExecutionPreviewParams {
  previewPath: string;
}

export interface AgentProposalExecutionRunbook {
  passed: boolean;
  failures: string[];
  verification: AgentProposalExecutionPreviewVerification;
  markdown: string;
  transactions: number;
}

export function createAgentProposalExecutionRunbook(
  params: CreateAgentProposalExecutionRunbookParams,
): AgentProposalExecutionRunbook {
  const verification = verifyAgentProposalExecutionPreview(params);
  const preview = verification.previewResult.preview;
  if (!verification.passed || preview === null) {
    return {
      passed: false,
      failures: verification.failures,
      verification,
      markdown: "",
      transactions: 0,
    };
  }

  return {
    passed: true,
    failures: [],
    verification,
    markdown: renderRunbook(params.previewPath, preview),
    transactions: preview.transactions.length,
  };
}

function renderRunbook(
  previewPath: string,
  preview: NonNullable<AgentProposalExecutionPreviewVerification["previewResult"]["preview"]>,
): string {
  const rows = [
    "# Agent Proposal Execution Runbook",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Preview | ${escapeCell(previewPath)} |`,
    `| Bundle | ${escapeCell(preview.bundle.path)} |`,
    `| Chain ID | ${preview.chainId} |`,
    `| Agent | ${escapeCell(preview.agent)} |`,
    `| Objective | ${escapeCell(preview.objective)} |`,
    `| Transactions | ${preview.transactions.length} |`,
    `| Signing | not included |`,
    `| Gas estimation | not included |`,
    `| Broadcast | not included |`,
    "",
    "| Index | Step ID | Title | To | Value Wei | Data Bytes | Data SHA-256 |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...preview.transactions.map((transaction) => {
      const cells = [
        transaction.index.toString(),
        transaction.stepId,
        transaction.title,
        transaction.to,
        transaction.value,
        transaction.dataBytes.toString(),
        transaction.dataSha256,
      ];
      return `| ${cells.map(escapeCell).join(" | ")} |`;
    }),
    "",
  ];
  return rows.join("\n");
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replace(/\r?\n/g, " ");
}
