import { encodeFunctionData, keccak256, stringToHex } from "viem";
import type { Address, Hex } from "viem";

import { createAction } from "../core/action.js";
import type { AgentAction } from "../core/action.js";

export const MEMORY_COMMIT_CAPABILITY =
  "0x64cab206b90af4b50559ecddaa1088d02cf671e461769ab0227d950ac87d2fbb" as const;

export const MEMORY_REGISTRY_ABI = [
  {
    type: "function",
    name: "commitMemory",
    stateMutability: "nonpayable",
    inputs: [
      { name: "memoryId", type: "bytes32" },
      { name: "merkleRoot", type: "bytes32" },
      { name: "contentHash", type: "bytes32" },
      { name: "storageURIHash", type: "bytes32" },
    ],
    outputs: [{ name: "version", type: "uint256" }],
  },
  {
    type: "function",
    name: "commitments",
    stateMutability: "view",
    inputs: [
      { name: "agent", type: "address" },
      { name: "memoryId", type: "bytes32" },
    ],
    outputs: [
      { name: "merkleRoot", type: "bytes32" },
      { name: "contentHash", type: "bytes32" },
      { name: "storageURIHash", type: "bytes32" },
      { name: "version", type: "uint256" },
      { name: "blockNumber", type: "uint256" },
      { name: "timestamp", type: "uint256" },
    ],
  },
] as const;

export interface MemoryCommitment {
  memoryId: Hex;
  merkleRoot: Hex;
  contentHash: Hex;
  storageURIHash: Hex;
}

export interface CreateMemoryCommitActionParams extends MemoryCommitment {
  registry: Address;
}

export interface CreateSingleLeafMemoryCommitmentParams {
  memoryIdLabel: string;
  content: string;
  storageURI: string;
}

export function createMemoryCommitAction(params: CreateMemoryCommitActionParams): AgentAction {
  return createAction({
    capability: MEMORY_COMMIT_CAPABILITY,
    target: params.registry,
    data: encodeFunctionData({
      abi: MEMORY_REGISTRY_ABI,
      functionName: "commitMemory",
      args: [params.memoryId, params.merkleRoot, params.contentHash, params.storageURIHash],
    }),
    usesBorrowing: false,
  });
}

export function createSingleLeafMemoryCommitment(params: CreateSingleLeafMemoryCommitmentParams): MemoryCommitment {
  const contentHash = keccak256(stringToHex(params.content));

  return {
    memoryId: keccak256(stringToHex(params.memoryIdLabel)),
    merkleRoot: contentHash,
    contentHash,
    storageURIHash: keccak256(stringToHex(params.storageURI)),
  };
}
