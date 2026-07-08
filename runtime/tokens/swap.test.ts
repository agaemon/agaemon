import { decodeFunctionData, parseEther, parseUnits } from "viem";
import { describe, expect, it } from "vitest";

import { createSwapExactEthForTokenAction, SWAP_EXACT_ETH_FOR_TOKEN_ABI, SWAP_EXACT_ETH_FOR_TOKEN_CAPABILITY } from "./swap.js";

describe("createSwapExactEthForTokenAction", () => {
  it("builds a SWAP_EXACT_ETH_FOR_TOKEN action for the mock swap adapter", () => {
    const action = createSwapExactEthForTokenAction({
      adapter: "0x0000000000000000000000000000000000000a11",
      tokenOut: "0x0000000000000000000000000000000000000e20",
      recipient: "0x0000000000000000000000000000000000000b11",
      ethIn: parseEther("0.000001"),
      minAmountOut: parseUnits("0.00095", 18),
    });

    const decoded = decodeFunctionData({
      abi: SWAP_EXACT_ETH_FOR_TOKEN_ABI,
      data: action.data,
    });

    expect(action.capability).toBe(SWAP_EXACT_ETH_FOR_TOKEN_CAPABILITY);
    expect(action.target).toBe("0x0000000000000000000000000000000000000a11");
    expect(action.value).toBe(parseEther("0.000001"));
    expect(action.usesBorrowing).toBe(false);
    expect(decoded.functionName).toBe("swapExactEthForToken");
    expect(decoded.args[0].toLowerCase()).toBe("0x0000000000000000000000000000000000000e20");
    expect(decoded.args[1].toLowerCase()).toBe("0x0000000000000000000000000000000000000b11");
    expect(decoded.args[2]).toBe(parseUnits("0.00095", 18));
  });
});
