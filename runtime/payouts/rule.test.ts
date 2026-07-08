import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";

import { createPayoutRuleAction, PAYOUT_CAPABILITY, PAYOUT_RULE_ABI } from "./rule.js";

describe("createPayoutRuleAction", () => {
  it("builds a PAYOUT action for a configured payout adapter", () => {
    const action = createPayoutRuleAction({
      adapter: "0x0000000000000000000000000000000000000c0f",
      recipient: "0x0000000000000000000000000000000000000a11",
      amountWei: 1_000_000_000_000n,
    });

    const decoded = decodeFunctionData({
      abi: PAYOUT_RULE_ABI,
      data: action.data,
    });

    expect(action.capability).toBe(PAYOUT_CAPABILITY);
    expect(action.target).toBe("0x0000000000000000000000000000000000000c0f");
    expect(action.value).toBe(1_000_000_000_000n);
    expect(action.usesBorrowing).toBe(false);
    expect(decoded.functionName).toBe("payout");
    expect(decoded.args[0]).toBe("0x0000000000000000000000000000000000000a11");
  });
});
