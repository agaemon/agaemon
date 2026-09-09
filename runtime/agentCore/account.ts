import { encodeFunctionData } from "viem";
import type { Address } from "viem";

import type { ExecuteTransaction } from "../transactions/builder.js";

export const AGENT_ACCOUNT_REVOCATION_CHECKS = [
  "revokeDelegateCallable",
  "unauthorizedRevokeDelegateDenied",
  "zeroRevokeDelegateDenied",
] as const;

export const AGENT_ACCOUNT_ABI = [
  { type: "error", name: "NotOwner", inputs: [] },
  { type: "error", name: "InvalidAddress", inputs: [] },
  {
    type: "function",
    name: "revokeDelegate",
    stateMutability: "nonpayable",
    inputs: [{ name: "subagent", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "paused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "delegates",
    stateMutability: "view",
    inputs: [{ name: "subagent", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "capabilities",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "policyEngine",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "reputationRegistry",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "reputation",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "delegate",
    stateMutability: "nonpayable",
    inputs: [{ name: "subagent", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "pause",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "unpause",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
] as const;

export interface CreateDelegateTransactionParams {
  agent: Address;
  delegate: Address;
}

export interface CreateAgentAccountTransactionParams {
  agent: Address;
}

export type AgentAccountOperation =
  | {
      name: "delegate" | "revokeDelegate";
      delegate: Address;
    }
  | {
      name: "pause";
    }
  | {
      name: "unpause";
    };

export interface ResolveAgentAccountOperationParams {
  delegate?: Address | undefined;
  envDelegate?: Address | undefined;
  revokeDelegate?: Address | undefined;
  pause: boolean;
  send: boolean;
  unpause: boolean;
}

export function createDelegateTransaction(params: CreateDelegateTransactionParams): ExecuteTransaction {
  return {
    to: params.agent,
    value: 0n,
    data: encodeFunctionData({
      abi: AGENT_ACCOUNT_ABI,
      functionName: "delegate",
      args: [params.delegate],
    }),
  };
}

export function createRevokeDelegateTransaction(params: CreateDelegateTransactionParams): ExecuteTransaction {
  return {
    to: params.agent,
    value: 0n,
    data: encodeFunctionData({
      abi: AGENT_ACCOUNT_ABI,
      functionName: "revokeDelegate",
      args: [params.delegate],
    }),
  };
}

export function resolveAgentAccountOperation(
  params: ResolveAgentAccountOperationParams,
): AgentAccountOperation | null {
  const operationCount = Number(params.delegate !== undefined) + Number(params.revokeDelegate !== undefined) + Number(params.pause) + Number(params.unpause);
  if (operationCount > 1) throw new Error("Choose only one operation: --delegate, --revoke-delegate, --pause, or --unpause");
  if (params.send && operationCount === 0) throw new Error("--send requires --delegate, --revoke-delegate, --pause, or --unpause");

  if (params.delegate !== undefined) return { name: "delegate", delegate: params.delegate };
  if (params.revokeDelegate !== undefined) return { name: "revokeDelegate", delegate: params.revokeDelegate };
  if (params.pause) return { name: "pause" };
  if (params.unpause) return { name: "unpause" };

  return null;
}

export function createPauseTransaction(params: CreateAgentAccountTransactionParams): ExecuteTransaction {
  return {
    to: params.agent,
    value: 0n,
    data: encodeFunctionData({
      abi: AGENT_ACCOUNT_ABI,
      functionName: "pause",
    }),
  };
}

export function createUnpauseTransaction(params: CreateAgentAccountTransactionParams): ExecuteTransaction {
  return {
    to: params.agent,
    value: 0n,
    data: encodeFunctionData({
      abi: AGENT_ACCOUNT_ABI,
      functionName: "unpause",
    }),
  };
}
