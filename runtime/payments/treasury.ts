import { encodeFunctionData } from "viem";
import type { Address, Hex } from "viem";

import { createAction } from "../core/action.js";
import type { AgentAction } from "../core/action.js";

export const PAYMENT_CAPABILITY =
  "0x2ab23539095ae1b8b6609f091b4bef4a98bd08b082a96b63e1fc0bebd1519065" as const;

export const TREASURY_PAYMENT_ABI = [
  {
    type: "function",
    name: "pay",
    stateMutability: "payable",
    inputs: [{ name: "recipient", type: "address" }],
    outputs: [],
  },
] as const;

export interface TreasuryPaymentActionParams {
  adapter: Address;
  recipient: Address;
  amountWei: bigint;
}

export function createTreasuryPaymentAction(params: TreasuryPaymentActionParams): AgentAction {
  return createAction({
    capability: PAYMENT_CAPABILITY,
    target: params.adapter,
    value: params.amountWei,
    data: encodeFunctionData({
      abi: TREASURY_PAYMENT_ABI,
      functionName: "pay",
      args: [params.recipient],
    }) as Hex,
    usesBorrowing: false,
  });
}
