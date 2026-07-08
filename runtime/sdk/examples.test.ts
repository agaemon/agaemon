import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";

import {
  createAgentOsCoordinationLifecyclePlanExample,
  createAgentOsErc20TransferIntentExample,
  createAgentOsMemoryCommitPlanExample,
  createAgentOsReputationScoreSyncExample,
  createAgentOsSwapIntentExample,
  createAgentOsTreasuryPaymentIntentExample,
} from "./examples.js";
import { MEMORY_REGISTRY_ABI } from "../memory/commitment.js";
import { REPUTATION_REGISTRY_ABI } from "../reputation/registry.js";

const AGENT = "0x0000000000000000000000000000000000000a01";
const RECIPIENT = "0x0000000000000000000000000000000000000b01";
const MEMORY_REGISTRY = "0x0000000000000000000000000000000000000c01";
const REPUTATION_REGISTRY = "0x0000000000000000000000000000000000000c02";
const COORDINATION = "0x0000000000000000000000000000000000000c03";

describe("AgentOS SDK examples", () => {
  it("builds a treasury payment intent example", () => {
    expect(createAgentOsTreasuryPaymentIntentExample({ recipient: RECIPIENT, amountWei: "100" })).toEqual({
      objective: "Pay a recipient from the agent treasury",
      intents: [
        {
          id: "treasury-payment-1",
          title: "Pay recipient",
          type: "treasury-payment",
          recipient: RECIPIENT,
          amountWei: "100",
        },
      ],
    });
  });

  it("builds ERC20 transfer and swap intent examples", () => {
    expect(createAgentOsErc20TransferIntentExample({ recipient: RECIPIENT, amountRaw: "2500" }).intents[0]).toEqual({
      id: "erc20-transfer-1",
      title: "Transfer ERC20 token",
      type: "erc20-transfer",
      recipient: RECIPIENT,
      amountRaw: "2500",
    });
    expect(
      createAgentOsSwapIntentExample({
        recipient: RECIPIENT,
        ethInWei: "50",
        minAmountOut: "7",
      }).intents[0],
    ).toEqual({
      id: "swap-exact-eth-for-token-1",
      title: "Swap exact ETH for token",
      type: "swap-exact-eth-for-token",
      recipient: RECIPIENT,
      ethInWei: "50",
      minAmountOut: "7",
    });
  });

  it("builds a memory commit plan example with deterministic commitment metadata", () => {
    const example = createAgentOsMemoryCommitPlanExample({
      registry: MEMORY_REGISTRY,
      memoryIdLabel: "agentos.memory.demo",
      content: "AgentOS memory commitment demo",
      storageURI: "memory://local/demo",
    });
    const decoded = decodeFunctionData({
      abi: MEMORY_REGISTRY_ABI,
      data: example.plan.steps[0]!.action.data,
    });

    expect(example.plan.objective).toBe("Commit verifiable agent memory");
    expect(example.plan.steps[0]!.id).toBe("memory-commit-1");
    expect(example.plan.steps[0]!.action.target).toBe(MEMORY_REGISTRY);
    expect(decoded.functionName).toBe("commitMemory");
    expect(decoded.args[0]).toBe(example.commitment.memoryId);
    expect(decoded.args[1]).toBe(example.commitment.merkleRoot);
  });

  it("builds a reputation score sync example as an explicit owner transaction", () => {
    const example = createAgentOsReputationScoreSyncExample({
      registry: REPUTATION_REGISTRY,
      agent: AGENT,
      registryScore: 1n,
      historyDeltas: [2n, 3n],
    });
    const decoded = decodeFunctionData({
      abi: REPUTATION_REGISTRY_ABI,
      data: example.transaction!.data,
    });

    expect(example.historyScore).toBe(5n);
    expect(example.transaction!.to).toBe(REPUTATION_REGISTRY);
    expect(decoded.functionName).toBe("adjustReputation");
    expect(decoded.args[0]).toBe(AGENT);
    expect(decoded.args[1]).toBe(4n);
  });

  it("returns null reputation transaction when registry score is already synced", () => {
    expect(
      createAgentOsReputationScoreSyncExample({
        registry: REPUTATION_REGISTRY,
        agent: AGENT,
        registryScore: 5n,
        historyDeltas: [2n, 3n],
      }).transaction,
    ).toBeNull();
  });

  it("builds a coordination lifecycle plan example for agent acceptance and completion", () => {
    const example = createAgentOsCoordinationLifecyclePlanExample({
      coordination: COORDINATION,
      assignmentId: 7n,
      resultURI: "memory://local/coordination-result",
    });

    expect(example.plan.objective).toBe("Accept and complete a coordination assignment");
    expect(example.plan.steps.map((step) => step.id)).toEqual([
      "coordination-accept-1",
      "coordination-complete-1",
    ]);
    expect(example.plan.steps.every((step) => step.action.target === COORDINATION)).toBe(true);
    expect(example.resultHash).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
