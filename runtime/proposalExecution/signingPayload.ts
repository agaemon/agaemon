import { verifyAgentProposalExecutionReadiness } from "./readinessVerify.js";

import type { AgentProposalExecutionReadinessVerification, VerifyAgentProposalExecutionReadinessParams } from "./readinessVerify.js";

export interface CreateAgentProposalExecutionSigningPayloadParams extends VerifyAgentProposalExecutionReadinessParams {
  readinessPath: string;
}

export interface AgentProposalExecutionSigningPayloadResult {
  passed: boolean;
  failures: string[];
  verification: AgentProposalExecutionReadinessVerification;
  payload: AgentProposalExecutionSigningPayload | null;
}

export interface AgentProposalExecutionSigningPayload {
  schemaVersion: 1;
  signer: string;
  chainId: number;
  readiness: {
    path: string;
  };
  bundle: {
    path: string;
  };
  nonceStart: number;
  transactions: AgentProposalExecutionSigningPayloadTransaction[];
}

export interface AgentProposalExecutionSigningPayloadTransaction {
  index: number;
  stepId: string;
  title: string;
  nonce: number;
  to: string;
  value: string;
  data: string;
  gasLimit: string;
}

interface ReadinessReport {
  signer: string;
  expectedChainId: number;
  pendingNonce: number;
  transactions: ReadinessTransaction[];
}

interface ReadinessTransaction {
  index: number;
  stepId: string;
  title: string;
  to: string;
  value: string;
  data: string;
  gasEstimate: string;
}

export function createAgentProposalExecutionSigningPayload(
  params: CreateAgentProposalExecutionSigningPayloadParams,
): AgentProposalExecutionSigningPayloadResult {
  const verification = verifyAgentProposalExecutionReadiness(params);
  if (!verification.passed) {
    return {
      passed: false,
      failures: verification.failures,
      verification,
      payload: null,
    };
  }

  const readiness = JSON.parse(params.readinessJson) as ReadinessReport;
  return {
    passed: true,
    failures: [],
    verification,
    payload: {
      schemaVersion: 1,
      signer: readiness.signer,
      chainId: readiness.expectedChainId,
      readiness: {
        path: params.readinessPath,
      },
      bundle: {
        path: params.bundlePath,
      },
      nonceStart: readiness.pendingNonce,
      transactions: readiness.transactions.map((transaction, index) => ({
        index,
        stepId: transaction.stepId,
        title: transaction.title,
        nonce: readiness.pendingNonce + index,
        to: transaction.to,
        value: transaction.value,
        data: transaction.data,
        gasLimit: transaction.gasEstimate,
      })),
    },
  };
}
