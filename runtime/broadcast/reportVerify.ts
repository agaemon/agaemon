import { createAgentProposalExecutionBroadcastReport } from "./report.js";

import type {
  AgentProposalExecutionBroadcastReport,
  CreateAgentProposalExecutionBroadcastReportParams,
} from "./report.js";

export interface VerifyAgentProposalExecutionBroadcastReportParams
  extends CreateAgentProposalExecutionBroadcastReportParams {
  reportMarkdown: string;
}

export interface AgentProposalExecutionBroadcastReportVerification {
  passed: boolean;
  failures: string[];
  report: AgentProposalExecutionBroadcastReport;
}

export function verifyAgentProposalExecutionBroadcastReport(
  params: VerifyAgentProposalExecutionBroadcastReportParams,
): AgentProposalExecutionBroadcastReportVerification {
  const report = createAgentProposalExecutionBroadcastReport(params);
  const failures = [...report.failures];
  if (report.passed && params.reportMarkdown !== report.markdown) {
    failures.push("broadcast report markdown does not match current receipt evidence");
  }

  return {
    passed: failures.length === 0,
    failures,
    report,
  };
}
