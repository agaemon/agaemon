import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";

import { REPUTATION_REGISTRY_ABI } from "./registry.js";
import {
  createReputationScoreSyncTransaction,
  sumReputationHistoryScore,
} from "./scoreSync.js";

describe("sumReputationHistoryScore", () => {
  it("sums positive and negative history deltas", () => {
    expect(sumReputationHistoryScore([1n, 3n, -2n])).toBe(2n);
  });

  it("rejects negative aggregate history scores", () => {
    expect(() => sumReputationHistoryScore([1n, -2n])).toThrow("history score must not be negative");
  });
});

describe("createReputationScoreSyncTransaction", () => {
  it("returns null when registry score already matches history score", () => {
    expect(
      createReputationScoreSyncTransaction({
        registry: "0x0000000000000000000000000000000000000c0f",
        agent: "0x0000000000000000000000000000000000000a11",
        registryScore: 2n,
        historyScore: 2n,
      }),
    ).toBeNull();
  });

  it("builds an exact positive sync adjustment", () => {
    const transaction = createReputationScoreSyncTransaction({
      registry: "0x0000000000000000000000000000000000000c0f",
      agent: "0x0000000000000000000000000000000000000a11",
      registryScore: 1n,
      historyScore: 3n,
    });

    expect(transaction).not.toBeNull();
    const decoded = decodeFunctionData({
      abi: REPUTATION_REGISTRY_ABI,
      data: transaction!.data,
    });

    expect(transaction!.to).toBe("0x0000000000000000000000000000000000000c0f");
    expect(transaction!.value).toBe(0n);
    expect(decoded.functionName).toBe("adjustReputation");
    expect(decoded.args[0]).toBe("0x0000000000000000000000000000000000000a11");
    expect(decoded.args[1]).toBe(2n);
  });

  it("builds an exact negative sync adjustment", () => {
    const transaction = createReputationScoreSyncTransaction({
      registry: "0x0000000000000000000000000000000000000c0f",
      agent: "0x0000000000000000000000000000000000000a11",
      registryScore: 5n,
      historyScore: 3n,
    });

    expect(transaction).not.toBeNull();
    const decoded = decodeFunctionData({
      abi: REPUTATION_REGISTRY_ABI,
      data: transaction!.data,
    });

    expect(decoded.args[1]).toBe(-2n);
  });
});
