import { verifyAgentProposalExecutionHandoff } from "./handoffVerify.js";

import type { AgentProposalExecutionBundle } from "./bundle.js";
import type {
  AgentProposalExecutionHandoffVerification,
  VerifyAgentProposalExecutionHandoffParams,
} from "./handoffVerify.js";

export interface CreateAgentProposalExecutionReadinessParams extends VerifyAgentProposalExecutionHandoffParams {
  signer: string;
  expectedChainId: number;
  client: AgentProposalExecutionReadinessClient;
}

export interface AgentProposalExecutionReadinessClient {
  getChainId(): Promise<number>;
  getTransactionCount(params: { address: string; blockTag: "pending" }): Promise<number>;
  estimateGas(params: { account: string; to: string; value: bigint; data: string }): Promise<bigint>;
}

export interface AgentProposalExecutionReadinessCheck {
  name: "execution-handoff" | "chain" | "nonce" | "gas-estimates";
  passed: boolean;
  failures: string[];
}

export interface AgentProposalExecutionReadinessTransaction {
  index: number;
  stepId: string;
  title: string;
  to: string;
  value: string;
  data: string;
  gasEstimate: string;
}

export interface AgentProposalExecutionReadinessReport {
  passed: boolean;
  failures: string[];
  checks: AgentProposalExecutionReadinessCheck[];
  signer: string;
  expectedChainId: number;
  connectedChainId: number | null;
  pendingNonce: number | null;
  transactions: AgentProposalExecutionReadinessTransaction[];
  handoffVerification: AgentProposalExecutionHandoffVerification;
}

export async function createAgentProposalExecutionReadiness(
  params: CreateAgentProposalExecutionReadinessParams,
): Promise<AgentProposalExecutionReadinessReport> {
  const handoffVerification = verifyAgentProposalExecutionHandoff(params);
  const handoffCheck = {
    name: "execution-handoff" as const,
    passed: handoffVerification.passed,
    failures: handoffVerification.failures,
  };
  if (!handoffVerification.passed) {
    return createReport({
      params,
      checks: [handoffCheck],
      connectedChainId: null,
      pendingNonce: null,
      transactions: [],
      handoffVerification,
    });
  }

  const connectedChainId = await params.client.getChainId();
  const chainFailures = connectedChainId === params.expectedChainId
    ? []
    : [`connected chain ${connectedChainId} does not match expected chain ${params.expectedChainId}`];
  const chainCheck = {
    name: "chain" as const,
    passed: chainFailures.length === 0,
    failures: chainFailures,
  };
  if (!chainCheck.passed) {
    return createReport({
      params,
      checks: [handoffCheck, chainCheck],
      connectedChainId,
      pendingNonce: null,
      transactions: [],
      handoffVerification,
    });
  }

  const pendingNonce = await params.client.getTransactionCount({ address: params.signer, blockTag: "pending" });
  const nonceCheck = {
    name: "nonce" as const,
    passed: true,
    failures: [],
  };
  const bundle = JSON.parse(params.bundleJson) as AgentProposalExecutionBundle;
  const transactions: AgentProposalExecutionReadinessTransaction[] = [];
  const gasFailures: string[] = [];
  for (const [index, transaction] of bundle.transactions.entries()) {
    try {
      const gasEstimate = await params.client.estimateGas({
        account: params.signer,
        to: transaction.to,
        value: BigInt(transaction.value),
        data: transaction.data,
      });
      transactions.push({
        index,
        stepId: transaction.stepId,
        title: transaction.title,
        to: transaction.to,
        value: transaction.value,
        data: transaction.data,
        gasEstimate: gasEstimate.toString(),
      });
    } catch (error) {
      gasFailures.push(`transaction ${index} gas estimate failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const gasCheck = {
    name: "gas-estimates" as const,
    passed: gasFailures.length === 0,
    failures: gasFailures,
  };

  return createReport({
    params,
    checks: [handoffCheck, chainCheck, nonceCheck, gasCheck],
    connectedChainId,
    pendingNonce,
    transactions,
    handoffVerification,
  });
}

function createReport(parameters: {
  params: Pick<CreateAgentProposalExecutionReadinessParams, "signer" | "expectedChainId">;
  checks: AgentProposalExecutionReadinessCheck[];
  connectedChainId: number | null;
  pendingNonce: number | null;
  transactions: AgentProposalExecutionReadinessTransaction[];
  handoffVerification: AgentProposalExecutionHandoffVerification;
}): AgentProposalExecutionReadinessReport {
  return {
    passed: parameters.checks.every((check) => check.passed),
    failures: uniqueFailures(parameters.checks.flatMap((check) => check.failures)),
    checks: parameters.checks,
    signer: parameters.params.signer,
    expectedChainId: parameters.params.expectedChainId,
    connectedChainId: parameters.connectedChainId,
    pendingNonce: parameters.pendingNonce,
    transactions: parameters.transactions,
    handoffVerification: parameters.handoffVerification,
  };
}

function uniqueFailures(failures: string[]): string[] {
  return [...new Set(failures)];
}
