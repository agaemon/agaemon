import type { AbiEvent, Address, Hex } from "viem";
import { encodeAbiParameters, encodeEventTopics, getAddress, parseAbiItem } from "viem";
import { describe, expect, it } from "vitest";

import type { DeploymentManifest } from "../base/deploymentManifest.js";
import {
  AGENTOS_EVENT_INDEXER_SCHEMA_VERSION,
  createAgentOsEventIndex,
  KNOWN_AGENTOS_EVENT_SPECS,
} from "./events.js";

const AGENT_ACCOUNT = "0x0000000000000000000000000000000000000a11";
const DIRECTORY = "0x0000000000000000000000000000000000000d12";
const MEMORY_REGISTRY = "0x0000000000000000000000000000000000000e01";
const PAYOUT_RULE_ADAPTER = "0x0000000000000000000000000000000000000e02";
const TREASURY_PAYMENT_ADAPTER = "0x0000000000000000000000000000000000000e03";
const UNKNOWN_CONTRACT = "0x0000000000000000000000000000000000000999";

describe("createAgentOsEventIndex", () => {
  it("normalizes known AgentOS events from manifest addresses", () => {
    const directoryEvent = createEventLog({
      address: DIRECTORY,
      event: "event AgentRegistered(address indexed agent, bytes32 indexed roleHash, bytes32 metadataURIHash, bool active)",
      args: {
        agent: AGENT_ACCOUNT,
        roleHash: hash("1"),
        metadataURIHash: hash("2"),
        active: true,
      },
      blockNumber: 102n,
      logIndex: 3,
      transactionHash: hash("a"),
    });
    const memoryEvent = createEventLog({
      address: MEMORY_REGISTRY,
      event:
        "event MemoryCommitted(address indexed agent, bytes32 indexed memoryId, uint256 indexed version, bytes32 merkleRoot, bytes32 contentHash, bytes32 storageURIHash)",
      args: {
        agent: AGENT_ACCOUNT,
        memoryId: hash("3"),
        version: 2n,
        merkleRoot: hash("4"),
        contentHash: hash("5"),
        storageURIHash: hash("6"),
      },
      blockNumber: 101n,
      logIndex: 1,
      transactionHash: hash("b"),
    });
    const ignoredEvent = createEventLog({
      address: UNKNOWN_CONTRACT,
      event: "event AgentActiveSet(address indexed agent, bool active)",
      args: {
        agent: AGENT_ACCOUNT,
        active: false,
      },
      blockNumber: 100n,
      logIndex: 0,
      transactionHash: hash("c"),
    });

    const index = createAgentOsEventIndex({
      manifest: createManifest(),
      manifestPath: "deployments/base-sepolia/latest.json",
      fromBlock: 100n,
      toBlock: 110n,
      logs: [directoryEvent, ignoredEvent, memoryEvent],
    });

    expect(index.schemaVersion).toBe(AGENTOS_EVENT_INDEXER_SCHEMA_VERSION);
    expect(index.manifest.contracts).toEqual({
      agentAccount: AGENT_ACCOUNT,
      agentDirectory: DIRECTORY,
      capabilityRegistry: getAddress("0x0000000000000000000000000000000000000c01"),
      memoryRegistry: MEMORY_REGISTRY,
      payoutRuleAdapter: PAYOUT_RULE_ADAPTER,
      policyEngine: "0x0000000000000000000000000000000000000c02",
      reputationRegistry: "0x0000000000000000000000000000000000000c03",
      treasuryPaymentAdapter: getAddress(TREASURY_PAYMENT_ADAPTER),
    });
    expect(index.replay).toEqual({
      fromBlock: "100",
      toBlock: "110",
      inputLogCount: 3,
      indexedEventCount: 2,
    });
    expect(index.events.map((event) => event.eventName)).toEqual(["MemoryCommitted", "AgentRegistered"]);
    expect(index.events[0]).toMatchObject({
      id: `101:1:${hash("b")}`,
      contract: "memoryRegistry",
      address: MEMORY_REGISTRY,
      eventName: "MemoryCommitted",
      blockNumber: "101",
      logIndex: 1,
      transactionHash: hash("b"),
      args: {
        agent: AGENT_ACCOUNT,
        memoryId: hash("3"),
        version: "2",
        merkleRoot: hash("4"),
        contentHash: hash("5"),
        storageURIHash: hash("6"),
      },
    });
  });

  it("replays idempotently from the same block range", () => {
    const logs = [
      createEventLog({
        address: AGENT_ACCOUNT,
        event: "event DelegateSet(address indexed subagent, bool allowed)",
        args: {
          subagent: "0x0000000000000000000000000000000000000d31",
          allowed: true,
        },
        blockNumber: 200n,
        logIndex: 4,
        transactionHash: hash("d"),
      }),
      createEventLog({
        address: DIRECTORY,
        event: "event AgentActiveSet(address indexed agent, bool active)",
        args: {
          agent: AGENT_ACCOUNT,
          active: false,
        },
        blockNumber: 200n,
        logIndex: 2,
        transactionHash: hash("e"),
      }),
    ];
    const params = {
      manifest: createManifest(),
      manifestPath: "deployments/base-sepolia/latest.json",
      fromBlock: 200n,
      logs,
    };

    expect(createAgentOsEventIndex(params)).toEqual(
      createAgentOsEventIndex({
        ...params,
        logs: [...logs].reverse(),
      }),
    );
  });

  it("summarizes indexed LC9 economic events for operator review", () => {
    const payoutEvent = createEventLog({
      address: PAYOUT_RULE_ADAPTER,
      event:
        "event PayoutSent(address indexed agent, address indexed recipient, uint256 amount, uint256 indexed day, uint256 dailyAmount)",
      args: {
        agent: AGENT_ACCOUNT,
        recipient: "0x0000000000000000000000000000000000000f01",
        amount: 100n,
        day: 1n,
        dailyAmount: 100n,
      },
      blockNumber: 300n,
      logIndex: 1,
      transactionHash: hash("p"),
    });
    const paymentEvent = createEventLog({
      address: TREASURY_PAYMENT_ADAPTER,
      event: "event PaymentForwarded(address indexed agent, address indexed recipient, uint256 amount)",
      args: {
        agent: AGENT_ACCOUNT,
        recipient: "0x0000000000000000000000000000000000000f02",
        amount: 200n,
      },
      blockNumber: 301n,
      logIndex: 2,
      transactionHash: hash("q"),
    });

    const index = createAgentOsEventIndex({
      manifest: createManifest(),
      manifestPath: "deployments/base-sepolia/latest.json",
      fromBlock: 300n,
      toBlock: 310n,
      logs: [paymentEvent, payoutEvent],
    });

    expect(index.economicEvents).toEqual({
      eventCount: 2,
      latestBlock: "301",
      byContract: [
        { contract: "payoutRuleAdapter", eventCount: 1 },
        { contract: "treasuryPaymentAdapter", eventCount: 1 },
      ],
      byEventName: [
        { eventName: "PaymentForwarded", eventCount: 1 },
        { eventName: "PayoutSent", eventCount: 1 },
      ],
    });
  });

  it("exposes event specs for the LC3 launch telemetry surface", () => {
    expect(KNOWN_AGENTOS_EVENT_SPECS.map((spec) => spec.contract).sort()).toEqual([
      "agentAccount",
      "agentCoordination",
      "agentDirectory",
      "capabilityRegistry",
      "coordinationPayoutReceiptRegistry",
      "memoryRegistry",
      "payoutRuleAdapter",
      "policyEngine",
      "reputationHistory",
      "reputationRegistry",
      "treasuryPaymentAdapter",
    ]);
  });
});

function createEventLog(params: {
  address: Address;
  event: string;
  args: Record<string, unknown>;
  blockNumber: bigint;
  logIndex: number;
  transactionHash: Hex;
}) {
  const event = parseAbiItem(params.event) as AbiEvent;
  const indexedParams = event.inputs.filter((input) => input.indexed);
  const dataParams = event.inputs.filter((input) => !input.indexed);

  return {
    address: params.address,
    topics: encodeEventTopics({
      abi: [event],
      eventName: event.name,
      args: Object.fromEntries(indexedParams.map((input) => [input.name, params.args[input.name ?? ""]])),
    }) as [Hex, ...Hex[]],
    data:
      dataParams.length === 0
        ? "0x"
        : encodeAbiParameters(
            dataParams.map((input) => ({ name: input.name, type: input.type })),
            dataParams.map((input) => params.args[input.name ?? ""]),
          ),
    blockNumber: params.blockNumber,
    logIndex: params.logIndex,
    transactionHash: params.transactionHash,
  };
}

function createManifest(): DeploymentManifest {
  return {
    network: "base-sepolia",
    chainId: 84532,
    rpcUrlEnv: "BASE_SEPOLIA_RPC_URL",
    explorerUrl: "https://sepolia.basescan.org",
    owner: "0x0000000000000000000000000000000000000001",
    contracts: {
      capabilityRegistry: "0x0000000000000000000000000000000000000c01",
      policyEngine: "0x0000000000000000000000000000000000000c02",
      reputationRegistry: "0x0000000000000000000000000000000000000c03",
      agentAccount: AGENT_ACCOUNT,
      testTargetProtocol: "0x0000000000000000000000000000000000000c04",
      agentDirectory: DIRECTORY,
      memoryRegistry: MEMORY_REGISTRY,
      payoutRuleAdapter: PAYOUT_RULE_ADAPTER,
      treasuryPaymentAdapter: TREASURY_PAYMENT_ADAPTER,
    },
    transactions: {
      deployCapabilityRegistry: hash("1"),
      deployPolicyEngine: hash("2"),
      deployReputationRegistry: hash("3"),
      deployAgentAccount: hash("4"),
      deployTestTargetProtocol: hash("5"),
      setCapability: hash("6"),
      setPolicy: hash("7"),
      smokeExecute: hash("8"),
    },
    smokeTest: {
      capability: hash("9"),
      targetWasCalled: true,
    },
  };
}

function hash(seed: string): Hex {
  return `0x${seed.repeat(64).slice(0, 64)}` as Hex;
}
