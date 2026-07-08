import { createHash } from "node:crypto";

import type {
  AgentProposalExecutionBroadcastSubmitResult,
  AgentProposalExecutionBroadcastSubmittedTransaction,
} from "./submit.js";

export interface CreateAgentProposalExecutionBroadcastReceiptParams {
  broadcastPackagePath: string;
  broadcastPackageJson: string;
  submitResult: AgentProposalExecutionBroadcastSubmitResult;
  generatedAt?: string | undefined;
}

export interface AgentProposalExecutionBroadcastReceiptResult {
  passed: boolean;
  failures: string[];
  receipt: AgentProposalExecutionBroadcastReceipt | null;
}

export interface AgentProposalExecutionBroadcastReceipt {
  schemaVersion: 1;
  generatedAt: string;
  broadcastPackage: AgentProposalExecutionBroadcastReceiptFile;
  signer: string;
  chainId: number;
  transactions: AgentProposalExecutionBroadcastSubmittedTransaction[];
}

export interface AgentProposalExecutionBroadcastReceiptFile {
  path: string;
  sha256: string;
}

export function createAgentProposalExecutionBroadcastReceipt(
  params: CreateAgentProposalExecutionBroadcastReceiptParams,
): AgentProposalExecutionBroadcastReceiptResult {
  const failures: string[] = [];
  if (params.submitResult.mode !== "send" || !params.submitResult.passed) {
    failures.push("broadcast receipt requires a successful send result");
  }
  if (params.submitResult.broadcastPackage !== params.broadcastPackagePath) {
    failures.push("submit result broadcast package must match broadcast package argument");
  }
  if (params.submitResult.signer === null) failures.push("submit result signer is required");
  if (params.submitResult.chainId === null) failures.push("submit result chain ID is required");
  if (
    params.submitResult.mode === "send" &&
    params.submitResult.passed &&
    params.submitResult.submitted.length !== params.submitResult.transactions
  ) {
    failures.push("submitted transaction count must match submit result transaction count");
  }
  if (params.submitResult.submitted.some((transaction) => transaction.status !== "success")) {
    failures.push("broadcast receipt requires successful transaction receipts");
  }

  if (failures.length > 0 || params.submitResult.signer === null || params.submitResult.chainId === null) {
    return {
      passed: false,
      failures: uniqueFailures(failures),
      receipt: null,
    };
  }

  return {
    passed: true,
    failures: [],
    receipt: {
      schemaVersion: 1,
      generatedAt: params.generatedAt ?? new Date().toISOString(),
      broadcastPackage: {
        path: params.broadcastPackagePath,
        sha256: sha256(params.broadcastPackageJson),
      },
      signer: params.submitResult.signer,
      chainId: params.submitResult.chainId,
      transactions: params.submitResult.submitted.map((transaction) => ({
        index: transaction.index,
        hash: transaction.hash,
        blockNumber: transaction.blockNumber,
        status: transaction.status,
      })),
    },
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function uniqueFailures(failures: string[]): string[] {
  return [...new Set(failures)];
}
