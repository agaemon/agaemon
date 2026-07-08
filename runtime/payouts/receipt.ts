import { encodeFunctionData } from "viem";
import type { Address, Hex } from "viem";

import type { ExecuteTransaction } from "../transactions/builder.js";

export const COORDINATION_PAYOUT_RECEIPT_ABI = [
  {
    type: "function",
    name: "recordPayoutReceipt",
    stateMutability: "nonpayable",
    inputs: [
      { name: "coordination", type: "address" },
      { name: "assignmentId", type: "uint256" },
      { name: "agent", type: "address" },
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "payoutTxHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "receiptOf",
    stateMutability: "view",
    inputs: [
      { name: "coordination", type: "address" },
      { name: "assignmentId", type: "uint256" },
    ],
    outputs: [
      { name: "agent", type: "address" },
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "payoutTxHash", type: "bytes32" },
      { name: "blockNumber", type: "uint256" },
      { name: "timestamp", type: "uint256" },
      { name: "recorded", type: "bool" },
    ],
  },
] as const;

export type CoordinationPayoutReceiptRecord = readonly [Address, Address, bigint, Hex, bigint, bigint, boolean];

export interface CoordinationPayoutReceiptState {
  agent: Address;
  recipient: Address;
  amountWei: bigint;
  payoutTxHash: Hex;
  blockNumber: bigint;
  timestamp: bigint;
  recorded: boolean;
}

export interface CreateRecordCoordinationPayoutReceiptTransactionParams {
  registry: Address;
  coordination: Address;
  assignmentId: bigint;
  agent: Address;
  recipient: Address;
  amountWei: bigint;
  payoutTxHash: Hex;
}

export function createRecordCoordinationPayoutReceiptTransaction(
  params: CreateRecordCoordinationPayoutReceiptTransactionParams,
): ExecuteTransaction {
  return {
    to: params.registry,
    value: 0n,
    data: encodeFunctionData({
      abi: COORDINATION_PAYOUT_RECEIPT_ABI,
      functionName: "recordPayoutReceipt",
      args: [
        params.coordination,
        params.assignmentId,
        params.agent,
        params.recipient,
        params.amountWei,
        params.payoutTxHash,
      ],
    }),
  };
}

export function formatCoordinationPayoutReceipt(
  receipt: CoordinationPayoutReceiptRecord,
): CoordinationPayoutReceiptState {
  return {
    agent: receipt[0],
    recipient: receipt[1],
    amountWei: receipt[2],
    payoutTxHash: receipt[3],
    blockNumber: receipt[4],
    timestamp: receipt[5],
    recorded: receipt[6],
  };
}
