import { encodeFunctionData } from "viem";
import type { Address } from "viem";

import { createAction } from "../core/action.js";
import type { AgentAction } from "../core/action.js";

export const ERC20_TRANSFER_CAPABILITY =
  "0xe24d44a191ef8d85246f55e6af92a50eac5a8eebeb30d6037150b06f93bb12e5" as const;

export const ERC20_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export interface Erc20TransferActionParams {
  token: Address;
  recipient: Address;
  amount: bigint;
}

export function createErc20TransferAction(params: Erc20TransferActionParams): AgentAction {
  return createAction({
    capability: ERC20_TRANSFER_CAPABILITY,
    target: params.token,
    value: 0n,
    data: encodeFunctionData({
      abi: ERC20_TRANSFER_ABI,
      functionName: "transfer",
      args: [params.recipient, params.amount],
    }),
    usesBorrowing: false,
  });
}
