import { verifyAgentProposalExecutionBroadcastPackage } from "./packageVerify.js";

import type { VerifyAgentProposalExecutionBroadcastPackageParams } from "./packageVerify.js";

export interface SubmitAgentProposalExecutionBroadcastParams
  extends VerifyAgentProposalExecutionBroadcastPackageParams {
  send: boolean;
  client: AgentProposalExecutionBroadcastSubmitClient;
}

export interface AgentProposalExecutionBroadcastSubmitClient {
  getChainId(): Promise<number>;
  sendRawTransaction(params: { serializedTransaction: `0x${string}` }): Promise<`0x${string}`>;
  waitForTransactionReceipt(params: { hash: `0x${string}` }): Promise<{
    blockNumber: bigint;
    status: "success" | "reverted";
  }>;
}

export interface AgentProposalExecutionBroadcastSubmitResult {
  mode: "dry-run" | "send";
  passed: boolean;
  failures: string[];
  broadcastPackage: string;
  signer: string | null;
  chainId: number | null;
  transactions: number;
  submitted: AgentProposalExecutionBroadcastSubmittedTransaction[];
}

export interface AgentProposalExecutionBroadcastSubmittedTransaction {
  index: number;
  hash: `0x${string}`;
  blockNumber: string;
  status: "success" | "reverted";
}

export async function submitAgentProposalExecutionBroadcast(
  params: SubmitAgentProposalExecutionBroadcastParams,
): Promise<AgentProposalExecutionBroadcastSubmitResult> {
  const verification = await verifyAgentProposalExecutionBroadcastPackage(params);
  const broadcastPackage = verification.packageResult.package;
  const baseResult = {
    mode: params.send ? "send" as const : "dry-run" as const,
    broadcastPackage: params.broadcastPackagePath,
    signer: broadcastPackage?.signer ?? null,
    chainId: broadcastPackage?.chainId ?? null,
    transactions: broadcastPackage?.transactions.length ?? 0,
  };

  if (!verification.passed || broadcastPackage === null) {
    return {
      ...baseResult,
      passed: false,
      failures: verification.failures,
      submitted: [],
    };
  }

  if (!params.send) {
    return {
      ...baseResult,
      passed: true,
      failures: [],
      submitted: [],
    };
  }

  const connectedChainId = await params.client.getChainId();
  if (connectedChainId !== broadcastPackage.chainId) {
    return {
      ...baseResult,
      passed: false,
      failures: [`connected chain ${connectedChainId} does not match broadcast package chain ${broadcastPackage.chainId}`],
      submitted: [],
    };
  }

  const submitted: AgentProposalExecutionBroadcastSubmittedTransaction[] = [];
  for (const transaction of broadcastPackage.transactions) {
    const hash = await params.client.sendRawTransaction({
      serializedTransaction: transaction.rawTransaction as `0x${string}`,
    });
    const receipt = await params.client.waitForTransactionReceipt({ hash });
    submitted.push({
      index: transaction.index,
      hash,
      blockNumber: receipt.blockNumber.toString(),
      status: receipt.status,
    });
    if (receipt.status !== "success") {
      return {
        ...baseResult,
        passed: false,
        failures: [`broadcast transaction ${transaction.index} reverted`],
        submitted,
      };
    }
  }

  return {
    ...baseResult,
    passed: true,
    failures: [],
    submitted,
  };
}
