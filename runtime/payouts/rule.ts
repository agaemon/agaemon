import { encodeFunctionData } from "viem";
import type { Address, Hex } from "viem";

import { createAction } from "../core/action.js";
import type { AgentAction } from "../core/action.js";

export const PAYOUT_CAPABILITY =
  "0xa10bb5b2060a412d05113732875a5431ca23453eb93f797e0ffcb5b40e5f2c3e" as const;

export const PAYOUT_RULE_ABI = [
  {
    type: "function",
    name: "payout",
    stateMutability: "payable",
    inputs: [{ name: "recipient", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "payoutRules",
    stateMutability: "view",
    inputs: [
      { name: "agent", type: "address" },
      { name: "recipient", type: "address" },
    ],
    outputs: [
      { name: "maxActionValue", type: "uint256" },
      { name: "maxDailyValue", type: "uint256" },
      { name: "enabled", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "dailyPayouts",
    stateMutability: "view",
    inputs: [
      { name: "agent", type: "address" },
      { name: "recipient", type: "address" },
      { name: "day", type: "uint256" },
    ],
    outputs: [{ name: "amount", type: "uint256" }],
  },
] as const;

export interface PayoutRuleActionParams {
  adapter: Address;
  recipient: Address;
  amountWei: bigint;
}

export function createPayoutRuleAction(params: PayoutRuleActionParams): AgentAction {
  return createAction({
    capability: PAYOUT_CAPABILITY,
    target: params.adapter,
    value: params.amountWei,
    data: encodeFunctionData({
      abi: PAYOUT_RULE_ABI,
      functionName: "payout",
      args: [params.recipient],
    }) as Hex,
    usesBorrowing: false,
  });
}
