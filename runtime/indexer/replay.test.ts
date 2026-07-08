import { createHash } from "node:crypto";

import type { AbiEvent, Address, Hex } from "viem";
import { encodeAbiParameters, encodeEventTopics, parseAbiItem } from "viem";
import { describe, expect, it } from "vitest";

import type { DeploymentManifest } from "../base/deploymentManifest.js";
import {
  formatAgentOsEventIndexSummary,
  replayAgentOsEventIndex,
  writeAgentOsEventIndex,
} from "./replay.js";

const AGENT_ACCOUNT = "0x0000000000000000000000000000000000000a11";
const DIRECTORY = "0x0000000000000000000000000000000000000d12";

describe("replayAgentOsEventIndex", () => {
  it("fetches logs from manifest contract addresses and builds an index", async () => {
    const queries: unknown[] = [];
    const log = createEventLog({
      address: DIRECTORY,
      event: "event AgentActiveSet(address indexed agent, bool active)",
      args: {
        agent: AGENT_ACCOUNT,
        active: true,
      },
      blockNumber: 42n,
      logIndex: 7,
      transactionHash: hash("a"),
    });

    const index = await replayAgentOsEventIndex({
      manifest: createManifest(),
      manifestPath: "deployments/base-sepolia/latest.json",
      fromBlock: 40n,
      toBlock: 50n,
      maxBlockRange: 20n,
      client: {
        getLogs: async (query) => {
          queries.push(query);
          return [log];
        },
      },
    });

    expect(queries).toEqual([
      {
        address: [
          AGENT_ACCOUNT,
          DIRECTORY,
          "0x0000000000000000000000000000000000000c02",
          "0x0000000000000000000000000000000000000C01",
          "0x0000000000000000000000000000000000000c03",
        ],
        fromBlock: 40n,
        toBlock: 50n,
      },
    ]);
    expect(index.events).toHaveLength(1);
    expect(index.events[0]).toMatchObject({
      contract: "agentDirectory",
      eventName: "AgentActiveSet",
      args: {
        agent: AGENT_ACCOUNT,
        active: true,
      },
    });
    expect(formatAgentOsEventIndexSummary(index)).toContain("indexedEvents: 1");
  });

  it("splits log queries across bounded block ranges", async () => {
    const queries: unknown[] = [];

    const index = await replayAgentOsEventIndex({
      manifest: createManifest(),
      manifestPath: "deployments/base-sepolia/latest.json",
      fromBlock: 40n,
      toBlock: 45n,
      maxBlockRange: 2n,
      client: {
        getLogs: async (query) => {
          queries.push(query);
          return [];
        },
      },
    });

    expect(queries).toEqual([
      {
        address: [
          AGENT_ACCOUNT,
          DIRECTORY,
          "0x0000000000000000000000000000000000000c02",
          "0x0000000000000000000000000000000000000C01",
          "0x0000000000000000000000000000000000000c03",
        ],
        fromBlock: 40n,
        toBlock: 41n,
      },
      {
        address: [
          AGENT_ACCOUNT,
          DIRECTORY,
          "0x0000000000000000000000000000000000000c02",
          "0x0000000000000000000000000000000000000C01",
          "0x0000000000000000000000000000000000000c03",
        ],
        fromBlock: 42n,
        toBlock: 43n,
      },
      {
        address: [
          AGENT_ACCOUNT,
          DIRECTORY,
          "0x0000000000000000000000000000000000000c02",
          "0x0000000000000000000000000000000000000C01",
          "0x0000000000000000000000000000000000000c03",
        ],
        fromBlock: 44n,
        toBlock: 45n,
      },
    ]);
    expect(index.replay.inputLogCount).toBe(0);
  });
});

describe("writeAgentOsEventIndex", () => {
  it("writes deterministic JSON with a trailing newline", async () => {
    const writes: Array<{ path: string; contents: string }> = [];
    const mkdirs: string[] = [];
    const index = await replayAgentOsEventIndex({
      manifest: createManifest(),
      manifestPath: "deployments/base-sepolia/latest.json",
      fromBlock: 40n,
      client: { getLogs: async () => [] },
    });

    const store = await writeAgentOsEventIndex({
      path: "artifacts/base-event-index.json",
      index,
      mkdirp: async (path) => { mkdirs.push(path); },
      writeText: async (path, contents) => { writes.push({ path, contents }); },
    });
    const contents = `${JSON.stringify(index, null, 2)}\n`;

    expect(mkdirs).toEqual(["artifacts"]);
    expect(writes).toEqual([
      {
        path: "artifacts/base-event-index.json",
        contents,
      },
    ]);
    expect(store).toEqual({
      path: "artifacts/base-event-index.json",
      sha256: createHash("sha256").update(contents).digest("hex"),
    });
    expect(formatAgentOsEventIndexSummary(index, store)).toContain(`storeSha256: ${store.sha256}`);
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
