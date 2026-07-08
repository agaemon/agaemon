import { createAgentProposalExecutionBroadcastCloseoutEvidenceSetSummary } from "./summary.js";

import type { VerifyAgentProposalExecutionBroadcastCloseoutEvidenceSetParams } from "./verify.js";

export interface VerifyAgentProposalExecutionBroadcastCloseoutEvidenceSetSummaryParams
  extends VerifyAgentProposalExecutionBroadcastCloseoutEvidenceSetParams {
  summaryMarkdown: string;
}

export interface AgentProposalExecutionBroadcastCloseoutEvidenceSetSummaryVerification {
  passed: boolean;
  failures: string[];
  expected: string;
}

export function verifyAgentProposalExecutionBroadcastCloseoutEvidenceSetSummary(
  params: VerifyAgentProposalExecutionBroadcastCloseoutEvidenceSetSummaryParams,
): AgentProposalExecutionBroadcastCloseoutEvidenceSetSummaryVerification {
  const summary = createAgentProposalExecutionBroadcastCloseoutEvidenceSetSummary(params);
  if (!summary.passed) {
    return {
      passed: false,
      failures: summary.failures,
      expected: "",
    };
  }

  const failures = params.summaryMarkdown === summary.markdown
    ? []
    : ["closeout evidence set summary Markdown does not match current evidence"];

  return {
    passed: failures.length === 0,
    failures,
    expected: summary.markdown,
  };
}
