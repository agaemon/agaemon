import { encodeFunctionData } from "viem";
import type { Address } from "viem";

import type { ExecuteTransaction } from "../transactions/builder.js";

export const REPUTATION_REGISTRY_ABI = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "scoreOf",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "score", type: "uint256" }],
  },
  {
    type: "function",
    name: "adjustReputation",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agent", type: "address" },
      { name: "delta", type: "int256" },
    ],
    outputs: [],
  },
] as const;

export interface CreateReputationAdjustTransactionParams {
  registry: Address;
  agent: Address;
  delta: bigint;
}

export function createReputationAdjustTransaction(
  params: CreateReputationAdjustTransactionParams,
): ExecuteTransaction {
  return {
    to: params.registry,
    value: 0n,
    data: encodeFunctionData({
      abi: REPUTATION_REGISTRY_ABI,
      functionName: "adjustReputation",
      args: [params.agent, params.delta],
    }),
  };
}

export function parseReputationDelta(value: string): bigint {
  const trimmed = value.trim();
  if (!/^[+-]?\d+$/.test(trimmed)) {
    throw new Error("--delta must be a signed integer");
  }

  const delta = BigInt(trimmed);
  if (delta === 0n) {
    throw new Error("--delta must not be zero");
  }

  return delta;
}
