import { decodeFunctionData, keccak256, stringToHex } from "viem";
import { describe, expect, it } from "vitest";

import {
  createMemoryCommitAction,
  createSingleLeafMemoryCommitment,
  MEMORY_COMMIT_CAPABILITY,
  MEMORY_REGISTRY_ABI,
} from "./commitment.js";

describe("createMemoryCommitAction", () => {
  it("builds a MEMORY_COMMIT action for the memory registry", () => {
    const memoryId = keccak256(stringToHex("agentos.memory.test"));
    const merkleRoot = keccak256(stringToHex("root"));
    const contentHash = keccak256(stringToHex("content"));
    const storageURIHash = keccak256(stringToHex("memory://agentos/test"));

    const action = createMemoryCommitAction({
      registry: "0x0000000000000000000000000000000000000c0f",
      memoryId,
      merkleRoot,
      contentHash,
      storageURIHash,
    });

    const decoded = decodeFunctionData({
      abi: MEMORY_REGISTRY_ABI,
      data: action.data,
    });

    expect(action.capability).toBe(MEMORY_COMMIT_CAPABILITY);
    expect(action.target).toBe("0x0000000000000000000000000000000000000c0f");
    expect(action.value).toBe(0n);
    expect(action.usesBorrowing).toBe(false);
    expect(decoded.functionName).toBe("commitMemory");
    expect(decoded.args[0]).toBe(memoryId);
    expect(decoded.args[1]).toBe(merkleRoot);
    expect(decoded.args[2]).toBe(contentHash);
    expect(decoded.args[3]).toBe(storageURIHash);
  });
});

describe("createSingleLeafMemoryCommitment", () => {
  it("hashes memory content and storage URI deterministically", () => {
    const commitment = createSingleLeafMemoryCommitment({
      memoryIdLabel: "agentos.memory.test",
      content: "AgentOS memory commitment smoke test",
      storageURI: "memory://agentos/base-sepolia/smoke-test",
    });

    const expectedContentHash = keccak256(stringToHex("AgentOS memory commitment smoke test"));

    expect(commitment.memoryId).toBe(keccak256(stringToHex("agentos.memory.test")));
    expect(commitment.contentHash).toBe(expectedContentHash);
    expect(commitment.merkleRoot).toBe(expectedContentHash);
    expect(commitment.storageURIHash).toBe(keccak256(stringToHex("memory://agentos/base-sepolia/smoke-test")));
  });
});
