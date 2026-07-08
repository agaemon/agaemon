import { describe, expect, it } from "vitest";

import {
  formatEventIndexReplayCliOutput,
  parseEventIndexReplayCliArgs,
  runEventIndexReplayCli,
} from "./replay.js";
import type { AgentOsEventIndex } from "../../indexer/events.js";

const INDEX: AgentOsEventIndex = {
  schemaVersion: 1,
  manifest: {
    path: "deployments/base-sepolia/latest.json",
    network: "base-sepolia",
    chainId: 84532,
    contracts: {
      agentAccount: "0x0000000000000000000000000000000000000a11",
    },
  },
  replay: {
    fromBlock: "100",
    toBlock: "200",
    inputLogCount: 1,
    indexedEventCount: 1,
  },
  economicEvents: {
    eventCount: 0,
    latestBlock: null,
    byContract: [],
    byEventName: [],
  },
  events: [],
};

describe("parseEventIndexReplayCliArgs", () => {
  it("parses replay paths, block range, and format", () => {
    expect(parseEventIndexReplayCliArgs([
      "--manifest", "deployments/base-sepolia/custom.json",
      "--output=artifacts/custom-event-index.json",
      "--from-block", "100",
      "--to-block=200",
      "--format", "summary",
    ])).toEqual({
      manifestPath: "deployments/base-sepolia/custom.json",
      outputPath: "artifacts/custom-event-index.json",
      fromBlock: 100n,
      toBlock: 200n,
      format: "summary",
    });
  });

  it("requires a configured replay start block", () => {
    expect(() => parseEventIndexReplayCliArgs([])).toThrow("--from-block is required");
    expect(() => parseEventIndexReplayCliArgs(["--from-block", "-1"])).toThrow(
      "--from-block must be a non-negative integer",
    );
  });
});

describe("runEventIndexReplayCli", () => {
  it("loads RPC env, replays logs, writes index JSON, and does not require PRIVATE_KEY", async () => {
    const outputs: string[] = [];
    const writes: unknown[] = [];
    const clients: string[] = [];
    const replayParams: unknown[] = [];
    const env: Record<string, string | undefined> = {};

    await runEventIndexReplayCli({
      argv: ["--from-block", "100", "--output", "artifacts/base-event-index.json", "--format", "summary"],
      env,
      writeOutput: (output) => outputs.push(output),
      loadDotEnv: (_path, target) => { target.BASE_SEPOLIA_RPC_URL = "https://example.invalid"; },
      readManifest: async () => ({
        network: "base-sepolia",
        chainId: 84532,
        rpcUrlEnv: "BASE_SEPOLIA_RPC_URL",
        explorerUrl: "https://sepolia.basescan.org",
        owner: "0x0000000000000000000000000000000000000001",
        contracts: {
          capabilityRegistry: "0x0000000000000000000000000000000000001001",
          policyEngine: "0x0000000000000000000000000000000000001002",
          reputationRegistry: "0x0000000000000000000000000000000000001003",
          agentAccount: "0x0000000000000000000000000000000000001004",
          testTargetProtocol: "0x0000000000000000000000000000000000001005",
        },
        transactions: {
          deployCapabilityRegistry: `0x${"11".repeat(32)}`,
          deployPolicyEngine: `0x${"22".repeat(32)}`,
          deployReputationRegistry: `0x${"33".repeat(32)}`,
          deployAgentAccount: `0x${"44".repeat(32)}`,
          deployTestTargetProtocol: `0x${"55".repeat(32)}`,
          setCapability: `0x${"66".repeat(32)}`,
          setPolicy: `0x${"77".repeat(32)}`,
          smokeExecute: `0x${"88".repeat(32)}`,
        },
        smokeTest: {
          capability: `0x${"99".repeat(32)}`,
          targetWasCalled: true,
        },
      }),
      createClient: (rpcUrl) => {
        clients.push(rpcUrl);
        return { getLogs: async () => [] };
      },
      replayIndex: async (params) => {
        replayParams.push(params);
        return INDEX;
      },
      writeIndex: async (params) => {
        writes.push(params);
        return {
          path: params.path,
          sha256: "a".repeat(64),
        };
      },
    });

    expect(clients).toEqual(["https://example.invalid"]);
    expect(replayParams[0]).toMatchObject({
      manifestPath: "deployments/base-sepolia/latest.json",
      fromBlock: 100n,
    });
    expect(writes).toEqual([{ path: "artifacts/base-event-index.json", index: INDEX }]);
    expect(outputs[0]).toContain("AgentOS event index");
    expect(outputs[0]).toContain(`storeSha256: ${"a".repeat(64)}`);
    expect(env.PRIVATE_KEY).toBeUndefined();
  });
});

describe("formatEventIndexReplayCliOutput", () => {
  it("formats JSON and summary output", () => {
    expect(formatEventIndexReplayCliOutput(INDEX, "json")).toContain("\"schemaVersion\": 1");
    expect(formatEventIndexReplayCliOutput(INDEX, "summary")).toContain("indexedEvents: 1");
    expect(formatEventIndexReplayCliOutput(INDEX, "summary")).toContain("economicEvents: 0");
  });
});
