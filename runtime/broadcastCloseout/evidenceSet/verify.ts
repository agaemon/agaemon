import { verifyAgentProposalExecutionBroadcastCloseoutStatus } from "../status/statusVerify.js";
import { verifyAgentProposalExecutionBroadcastCloseout } from "../closeout/closeoutVerify.js";

import type { VerifyAgentProposalExecutionBroadcastCloseoutStatusParams } from "../status/statusVerify.js";

export interface VerifyAgentProposalExecutionBroadcastCloseoutEvidenceSetParams
  extends VerifyAgentProposalExecutionBroadcastCloseoutStatusParams {
  statusPath: string;
}

export interface AgentProposalExecutionBroadcastCloseoutEvidenceSetVerificationCheck {
  name: "broadcast-closeout" | "broadcast-closeout-status";
  passed: boolean;
  failures: string[];
}

export interface AgentProposalExecutionBroadcastCloseoutEvidenceSetVerification {
  passed: boolean;
  failures: string[];
  checks: AgentProposalExecutionBroadcastCloseoutEvidenceSetVerificationCheck[];
}

export function verifyAgentProposalExecutionBroadcastCloseoutEvidenceSet(
  params: VerifyAgentProposalExecutionBroadcastCloseoutEvidenceSetParams,
): AgentProposalExecutionBroadcastCloseoutEvidenceSetVerification {
  const closeoutVerification = verifyAgentProposalExecutionBroadcastCloseout(params);
  const statusVerification = verifyAgentProposalExecutionBroadcastCloseoutStatus(params);
  const checks: AgentProposalExecutionBroadcastCloseoutEvidenceSetVerificationCheck[] = [
    {
      name: "broadcast-closeout",
      passed: closeoutVerification.passed,
      failures: closeoutVerification.failures,
    },
    {
      name: "broadcast-closeout-status",
      passed: statusVerification.passed,
      failures: statusVerification.failures,
    },
  ];

  return {
    passed: checks.every((check) => check.passed),
    failures: checks.flatMap((check) => check.failures),
    checks,
  };
}
