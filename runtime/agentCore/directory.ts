import { encodeFunctionData, keccak256, stringToHex } from "viem";
import type { Address, Hex } from "viem";

import type { ExecuteTransaction } from "../transactions/builder.js";

export const AGENT_DIRECTORY_ABI = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "registerAgent",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agent", type: "address" },
      { name: "roleHash", type: "bytes32" },
      { name: "metadataURIHash", type: "bytes32" },
      { name: "active", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setActive",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agent", type: "address" },
      { name: "active", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "profileOf",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [
      { name: "roleHash", type: "bytes32" },
      { name: "metadataURIHash", type: "bytes32" },
      { name: "active", type: "bool" },
      { name: "registered", type: "bool" },
    ],
  },
] as const;

export interface AgentProfileCommitment {
  roleHash: Hex;
  metadataURIHash: Hex;
}

export interface CreateAgentProfileCommitmentParams {
  roleLabel: string;
  metadataURI: string;
}

export interface CreateRegisterAgentProfileTransactionParams extends AgentProfileCommitment {
  directory: Address;
  agent: Address;
  active: boolean;
}

export interface CreateSetAgentActiveTransactionParams {
  directory: Address;
  agent: Address;
  active: boolean;
}

export function createAgentProfileCommitment(
  params: CreateAgentProfileCommitmentParams,
): AgentProfileCommitment {
  return {
    roleHash: keccak256(stringToHex(params.roleLabel)),
    metadataURIHash: keccak256(stringToHex(params.metadataURI)),
  };
}

export function createRegisterAgentProfileTransaction(
  params: CreateRegisterAgentProfileTransactionParams,
): ExecuteTransaction {
  return {
    to: params.directory,
    value: 0n,
    data: encodeFunctionData({
      abi: AGENT_DIRECTORY_ABI,
      functionName: "registerAgent",
      args: [params.agent, params.roleHash, params.metadataURIHash, params.active],
    }),
  };
}

export function createSetAgentActiveTransaction(
  params: CreateSetAgentActiveTransactionParams,
): ExecuteTransaction {
  return {
    to: params.directory,
    value: 0n,
    data: encodeFunctionData({
      abi: AGENT_DIRECTORY_ABI,
      functionName: "setActive",
      args: [params.agent, params.active],
    }),
  };
}
