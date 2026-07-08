import { encodeAbiParameters, encodeFunctionData, keccak256, stringToHex } from "viem";
import type { Address, Hex } from "viem";

import type { ExecuteTransaction } from "../transactions/builder.js";

export const REPUTATION_HISTORY_ABI = [
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
    name: "recordEvent",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agent", type: "address" },
      { name: "actionHash", type: "bytes32" },
      { name: "evidenceHash", type: "bytes32" },
      { name: "scoreDelta", type: "int256" },
    ],
    outputs: [{ name: "eventId", type: "uint256" }],
  },
  {
    type: "function",
    name: "eventCountOf",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "count", type: "uint256" }],
  },
  {
    type: "function",
    name: "eventOf",
    stateMutability: "view",
    inputs: [
      { name: "agent", type: "address" },
      { name: "eventId", type: "uint256" },
    ],
    outputs: [
      { name: "actionHash", type: "bytes32" },
      { name: "evidenceHash", type: "bytes32" },
      { name: "scoreDelta", type: "int256" },
      { name: "timestamp", type: "uint256" },
    ],
  },
] as const;

export interface ReputationEventCommitment {
  actionHash: Hex;
  evidenceHash: Hex;
}

export interface CreateReputationEventCommitmentParams {
  actionLabel: string;
  evidenceURI: string;
}

export interface CreateRecordReputationEventTransactionParams extends ReputationEventCommitment {
  history: Address;
  agent: Address;
  scoreDelta: bigint;
}

export interface CoordinationOutcomeEvidence {
  coordination: Address;
  assignmentId: bigint;
  assignee: Address;
  resultHash: Hex;
  resultMemoryId: Hex;
  resultMerkleRoot: Hex;
}

export interface CreateCoordinationOutcomeReputationTransactionParams extends CoordinationOutcomeEvidence {
  history: Address;
  actionLabel: string;
  scoreDelta: bigint;
}

export function createReputationEventCommitment(
  params: CreateReputationEventCommitmentParams,
): ReputationEventCommitment {
  return {
    actionHash: keccak256(stringToHex(params.actionLabel)),
    evidenceHash: keccak256(stringToHex(params.evidenceURI)),
  };
}

export function createCoordinationOutcomeEvidenceHash(params: CoordinationOutcomeEvidence): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { name: "coordination", type: "address" },
        { name: "assignmentId", type: "uint256" },
        { name: "assignee", type: "address" },
        { name: "resultHash", type: "bytes32" },
        { name: "resultMemoryId", type: "bytes32" },
        { name: "resultMerkleRoot", type: "bytes32" },
      ],
      [
        params.coordination,
        params.assignmentId,
        params.assignee,
        params.resultHash,
        params.resultMemoryId,
        params.resultMerkleRoot,
      ],
    ),
  );
}

export function createRecordReputationEventTransaction(
  params: CreateRecordReputationEventTransactionParams,
): ExecuteTransaction {
  return {
    to: params.history,
    value: 0n,
    data: encodeFunctionData({
      abi: REPUTATION_HISTORY_ABI,
      functionName: "recordEvent",
      args: [params.agent, params.actionHash, params.evidenceHash, params.scoreDelta],
    }),
  };
}

export function createCoordinationOutcomeReputationTransaction(
  params: CreateCoordinationOutcomeReputationTransactionParams,
): ExecuteTransaction {
  return createRecordReputationEventTransaction({
    history: params.history,
    agent: params.assignee,
    actionHash: keccak256(stringToHex(params.actionLabel)),
    evidenceHash: createCoordinationOutcomeEvidenceHash(params),
    scoreDelta: params.scoreDelta,
  });
}
