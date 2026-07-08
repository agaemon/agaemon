import { verifyAgentProposalExecutionBroadcastCloseoutEvidenceSetSummary } from "../../evidenceSet/summaryVerify.js";

import type {
  VerifyAgentProposalExecutionBroadcastCloseoutEvidenceSetSummaryParams,
} from "../../evidenceSet/summaryVerify.js";

export interface VerifyAgentProposalExecutionBroadcastCloseoutFinalizationParams
  extends VerifyAgentProposalExecutionBroadcastCloseoutEvidenceSetSummaryParams {
  summaryPath: string;
}

export interface AgentProposalExecutionBroadcastCloseoutFinalizationVerificationCheck {
  name: "broadcast-closeout-finalization";
  passed: boolean;
  failures: string[];
}

export interface AgentProposalExecutionBroadcastCloseoutFinalizationVerification {
  passed: boolean;
  failures: string[];
  checks: AgentProposalExecutionBroadcastCloseoutFinalizationVerificationCheck[];
  expected: string;
}

export function verifyAgentProposalExecutionBroadcastCloseoutFinalization(
  params: VerifyAgentProposalExecutionBroadcastCloseoutFinalizationParams,
): AgentProposalExecutionBroadcastCloseoutFinalizationVerification {
  const verification = verifyAgentProposalExecutionBroadcastCloseoutEvidenceSetSummary(params);
  const check = {
    name: "broadcast-closeout-finalization" as const,
    passed: verification.passed,
    failures: verification.failures,
  };

  return {
    passed: verification.passed,
    failures: verification.failures,
    checks: [check],
    expected: verification.expected,
  };
}
