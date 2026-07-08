import { createAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummary } from "./summary.js";

import type {
  CreateAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryParams,
} from "./summary.js";

export interface VerifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryParams
  extends CreateAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryParams {
  finalizationArchiveStatusSummaryMarkdown: string;
}

export interface AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryVerification {
  passed: boolean;
  failures: string[];
  expected: string;
}

export function verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummary(
  params: VerifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryParams,
): AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryVerification {
  const summary = createAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummary(params);
  if (!summary.passed) {
    return {
      passed: false,
      failures: summary.failures,
      expected: "",
    };
  }

  const failures = params.finalizationArchiveStatusSummaryMarkdown === summary.markdown
    ? []
    : ["closeout finalization archive status summary Markdown does not match current finalization archive status evidence"];

  return {
    passed: failures.length === 0,
    failures,
    expected: summary.markdown,
  };
}
