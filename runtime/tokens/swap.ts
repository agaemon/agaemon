import { encodeFunctionData } from "viem";
import type { Address, Hex } from "viem";

import { createAction } from "../core/action.js";
import type { AgentAction } from "../core/action.js";

export const SWAP_EXACT_ETH_FOR_TOKEN_CAPABILITY =
  "0xc41d860a8ca0e85536fca7a8d0902112fdc9173651f2380076029d625dac84db" as const;

export const SWAP_EXACT_ETH_FOR_TOKEN_ABI = [
  {
    type: "function",
    name: "swapExactEthForToken",
    stateMutability: "payable",
    inputs: [
      { name: "tokenOut", type: "address" },
      { name: "recipient", type: "address" },
      { name: "minAmountOut", type: "uint256" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

export interface SwapExactEthForTokenActionParams {
  adapter: Address;
  tokenOut: Address;
  recipient: Address;
  ethIn: bigint;
  minAmountOut: bigint;
}

export function createSwapExactEthForTokenAction(params: SwapExactEthForTokenActionParams): AgentAction {
  return createAction({
    capability: SWAP_EXACT_ETH_FOR_TOKEN_CAPABILITY,
    target: params.adapter,
    value: params.ethIn,
    data: encodeFunctionData({
      abi: SWAP_EXACT_ETH_FOR_TOKEN_ABI,
      functionName: "swapExactEthForToken",
      args: [params.tokenOut, params.recipient, params.minAmountOut],
    }) as Hex,
    usesBorrowing: false,
  });
}
