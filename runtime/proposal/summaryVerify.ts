import { createAgentProposalSummary } from "./summary.js";

export interface VerifyAgentProposalSummaryParams {
  proposalPath: string;
  proposalJson: string;
  summaryMarkdown: string;
}

export interface AgentProposalSummaryVerification {
  passed: boolean;
  failures: string[];
  expected: string;
}

export function verifyAgentProposalSummary(
  params: VerifyAgentProposalSummaryParams,
): AgentProposalSummaryVerification {
  const summary = createAgentProposalSummary({
    proposalPath: params.proposalPath,
    proposalJson: params.proposalJson,
  });

  if (!summary.passed) {
    return {
      passed: false,
      failures: summary.failures,
      expected: "",
    };
  }

  const failures = params.summaryMarkdown === summary.markdown ? [] : ["proposal summary is stale"];
  return {
    passed: failures.length === 0,
    failures,
    expected: summary.markdown,
  };
}
