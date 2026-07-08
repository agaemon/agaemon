import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";

import {
  createReputationAdjustTransaction,
  parseReputationDelta,
  REPUTATION_REGISTRY_ABI,
} from "./registry.js";

describe("createReputationAdjustTransaction", () => {
  it("builds an owner reputation adjustment transaction", () => {
    const transaction = createReputationAdjustTransaction({
      registry: "0x0000000000000000000000000000000000000c0f",
      agent: "0x0000000000000000000000000000000000000a11",
      delta: 1n,
    });

    const decoded = decodeFunctionData({
      abi: REPUTATION_REGISTRY_ABI,
      data: transaction.data,
    });

    expect(transaction.to).toBe("0x0000000000000000000000000000000000000c0f");
    expect(transaction.value).toBe(0n);
    expect(decoded.functionName).toBe("adjustReputation");
    expect(decoded.args[0]).toBe("0x0000000000000000000000000000000000000a11");
    expect(decoded.args[1]).toBe(1n);
  });

  it("supports negative deltas", () => {
    const transaction = createReputationAdjustTransaction({
      registry: "0x0000000000000000000000000000000000000c0f",
      agent: "0x0000000000000000000000000000000000000a11",
      delta: -1n,
    });

    const decoded = decodeFunctionData({
      abi: REPUTATION_REGISTRY_ABI,
      data: transaction.data,
    });

    expect(decoded.args[1]).toBe(-1n);
  });
});

describe("parseReputationDelta", () => {
  it("parses signed integer deltas", () => {
    expect(parseReputationDelta("1")).toBe(1n);
    expect(parseReputationDelta("+2")).toBe(2n);
    expect(parseReputationDelta("-3")).toBe(-3n);
  });

  it("rejects zero and non-integer values", () => {
    expect(() => parseReputationDelta("0")).toThrow("--delta must not be zero");
    expect(() => parseReputationDelta("1.5")).toThrow("--delta must be a signed integer");
    expect(() => parseReputationDelta("abc")).toThrow("--delta must be a signed integer");
  });
});
