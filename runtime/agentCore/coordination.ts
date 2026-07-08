import { encodeAbiParameters, encodeFunctionData, keccak256, stringToHex } from "viem";
import type { Address, Hex } from "viem";

import { createAction } from "../core/action.js";
import type { AgentAction } from "../core/action.js";
import type { ExecuteTransaction } from "../transactions/builder.js";

export const COORDINATION_ACCEPT_CAPABILITY =
  "0xfd778ede067bae6cfb1ad4c78ad182f9b874ad21ed3f82d26541f9bfdda17a6d" as const;
export const COORDINATION_COMPLETE_CAPABILITY =
  "0x00e928b7a6b30b817fda9abae2db0783dbe2bc8ac963dcd48d915ed2cebc2570" as const;

export const AGENT_COORDINATION_ABI = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "agentDirectory",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "memoryRegistry",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "createAssignment",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assigner", type: "address" },
      { name: "assignee", type: "address" },
      { name: "taskHash", type: "bytes32" },
      { name: "contextHash", type: "bytes32" },
    ],
    outputs: [{ name: "assignmentId", type: "uint256" }],
  },
  {
    type: "function",
    name: "acceptAssignment",
    stateMutability: "nonpayable",
    inputs: [{ name: "assignmentId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "acceptAssignmentByAssignee",
    stateMutability: "nonpayable",
    inputs: [{ name: "assignmentId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "completeAssignment",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assignmentId", type: "uint256" },
      { name: "resultHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "completeAssignmentByAssignee",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assignmentId", type: "uint256" },
      { name: "resultHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "completeAssignmentByAssigneeWithMemory",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assignmentId", type: "uint256" },
      { name: "memoryId", type: "bytes32" },
      { name: "merkleRoot", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelAssignment",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assignmentId", type: "uint256" },
      { name: "cancellationHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "assignmentCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "count", type: "uint256" }],
  },
  {
    type: "function",
    name: "assignmentOf",
    stateMutability: "view",
    inputs: [{ name: "assignmentId", type: "uint256" }],
    outputs: [
      { name: "assigner", type: "address" },
      { name: "assignee", type: "address" },
      { name: "taskHash", type: "bytes32" },
      { name: "contextHash", type: "bytes32" },
      { name: "status", type: "uint8" },
      { name: "acceptedBy", type: "address" },
      { name: "completedBy", type: "address" },
      { name: "resultHash", type: "bytes32" },
      { name: "cancellationHash", type: "bytes32" },
      { name: "createdAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "assignmentMemoryResultOf",
    stateMutability: "view",
    inputs: [{ name: "assignmentId", type: "uint256" }],
    outputs: [
      { name: "resultMemoryId", type: "bytes32" },
      { name: "resultMerkleRoot", type: "bytes32" },
    ],
  },
] as const;

export const ASSIGNMENT_STATUS = {
  Created: 0,
  Accepted: 1,
  Completed: 2,
  Cancelled: 3,
} as const;

export interface AgentCoordinationCommitment {
  taskHash: Hex;
  contextHash: Hex;
}

export interface CreateAgentCoordinationCommitmentParams {
  taskLabel: string;
  contextURI: string;
}

export interface CreateCoordinationAssignmentTransactionParams extends AgentCoordinationCommitment {
  coordination: Address;
  assigner: Address;
  assignee: Address;
}

export interface CreateAcceptCoordinationAssignmentTransactionParams {
  coordination: Address;
  assignmentId: bigint;
}

export interface CreateCoordinationAcceptanceActionParams extends CreateAcceptCoordinationAssignmentTransactionParams {}

export interface CreateCoordinationCompletionActionParams extends CreateCompleteCoordinationAssignmentTransactionParams {}

export interface CoordinationMemoryProof {
  memoryId: Hex;
  merkleRoot: Hex;
}

export interface CreateCoordinationMemoryCompletionActionParams
  extends CreateAcceptCoordinationAssignmentTransactionParams, CoordinationMemoryProof {}

export interface CreateCompleteCoordinationAssignmentTransactionParams
  extends CreateAcceptCoordinationAssignmentTransactionParams {
  resultHash: Hex;
}

export interface CreateCancelCoordinationAssignmentTransactionParams
  extends CreateAcceptCoordinationAssignmentTransactionParams {
  cancellationHash: Hex;
}

export function createAgentCoordinationCommitment(
  params: CreateAgentCoordinationCommitmentParams,
): AgentCoordinationCommitment {
  return {
    taskHash: keccak256(stringToHex(params.taskLabel)),
    contextHash: keccak256(stringToHex(params.contextURI)),
  };
}

export function createCoordinationEvidenceHash(evidenceURI: string): Hex {
  return keccak256(stringToHex(evidenceURI));
}

export function createCoordinationMemoryResultHash(params: CoordinationMemoryProof): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { name: "memoryId", type: "bytes32" },
        { name: "merkleRoot", type: "bytes32" },
      ],
      [params.memoryId, params.merkleRoot],
    ),
  );
}

export function createCoordinationAcceptanceAction(params: CreateCoordinationAcceptanceActionParams): AgentAction {
  return createAction({
    capability: COORDINATION_ACCEPT_CAPABILITY,
    target: params.coordination,
    data: encodeFunctionData({
      abi: AGENT_COORDINATION_ABI,
      functionName: "acceptAssignmentByAssignee",
      args: [params.assignmentId],
    }),
    usesBorrowing: false,
  });
}

export function createCoordinationCompletionAction(params: CreateCoordinationCompletionActionParams): AgentAction {
  return createAction({
    capability: COORDINATION_COMPLETE_CAPABILITY,
    target: params.coordination,
    data: encodeFunctionData({
      abi: AGENT_COORDINATION_ABI,
      functionName: "completeAssignmentByAssignee",
      args: [params.assignmentId, params.resultHash],
    }),
    usesBorrowing: false,
  });
}

export function createCoordinationMemoryCompletionAction(
  params: CreateCoordinationMemoryCompletionActionParams,
): AgentAction {
  return createAction({
    capability: COORDINATION_COMPLETE_CAPABILITY,
    target: params.coordination,
    data: encodeFunctionData({
      abi: AGENT_COORDINATION_ABI,
      functionName: "completeAssignmentByAssigneeWithMemory",
      args: [params.assignmentId, params.memoryId, params.merkleRoot],
    }),
    usesBorrowing: false,
  });
}

export function createCoordinationAssignmentTransaction(
  params: CreateCoordinationAssignmentTransactionParams,
): ExecuteTransaction {
  return {
    to: params.coordination,
    value: 0n,
    data: encodeFunctionData({
      abi: AGENT_COORDINATION_ABI,
      functionName: "createAssignment",
      args: [params.assigner, params.assignee, params.taskHash, params.contextHash],
    }),
  };
}

export function createAcceptCoordinationAssignmentTransaction(
  params: CreateAcceptCoordinationAssignmentTransactionParams,
): ExecuteTransaction {
  return {
    to: params.coordination,
    value: 0n,
    data: encodeFunctionData({
      abi: AGENT_COORDINATION_ABI,
      functionName: "acceptAssignment",
      args: [params.assignmentId],
    }),
  };
}

export function createCompleteCoordinationAssignmentTransaction(
  params: CreateCompleteCoordinationAssignmentTransactionParams,
): ExecuteTransaction {
  return {
    to: params.coordination,
    value: 0n,
    data: encodeFunctionData({
      abi: AGENT_COORDINATION_ABI,
      functionName: "completeAssignment",
      args: [params.assignmentId, params.resultHash],
    }),
  };
}

export function createCancelCoordinationAssignmentTransaction(
  params: CreateCancelCoordinationAssignmentTransactionParams,
): ExecuteTransaction {
  return {
    to: params.coordination,
    value: 0n,
    data: encodeFunctionData({
      abi: AGENT_COORDINATION_ABI,
      functionName: "cancelAssignment",
      args: [params.assignmentId, params.cancellationHash],
    }),
  };
}
