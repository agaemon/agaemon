import { decodeFunctionData, parseEther } from "viem";
import { describe, expect, it } from "vitest";

import { createTreasuryPaymentAction, PAYMENT_CAPABILITY } from "./treasury.js";

const TREASURY_PAYMENT_ABI = [
  {
    type: "function",
    name: "pay",
    stateMutability: "payable",
    inputs: [{ name: "recipient", type: "address" }],
    outputs: [],
  },
] as const;

describe("createTreasuryPaymentAction", () => {
  it("builds a PAYMENT action for the treasury payment adapter", () => {
    const action = createTreasuryPaymentAction({
      adapter: "0x0000000000000000000000000000000000000a11",
      recipient: "0x0000000000000000000000000000000000000b11",
      amountWei: parseEther("0.00001"),
    });

    const decoded = decodeFunctionData({
      abi: TREASURY_PAYMENT_ABI,
      data: action.data,
    });

    expect(action.capability).toBe(PAYMENT_CAPABILITY);
    expect(action.target).toBe("0x0000000000000000000000000000000000000a11");
    expect(action.value).toBe(parseEther("0.00001"));
    expect(action.usesBorrowing).toBe(false);
    expect(decoded.functionName).toBe("pay");
    expect(decoded.args[0].toLowerCase()).toBe("0x0000000000000000000000000000000000000b11");
  });
});
