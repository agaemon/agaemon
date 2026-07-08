import { describe, expect, it } from "vitest";

import type { DeploymentManifest } from "../base/deploymentManifest.js";
import type { AgentOsEventIndex } from "./events.js";
import {
  formatAgentOsEventIndexVerificationSummary,
  verifyAgentOsEventIndex,
} from "./verify.js";

describe("verifyAgentOsEventIndex", () => {
  it("passes a deterministic index that matches the deployment manifest", () => {
    const verification = verifyAgentOsEventIndex({
      index: createIndex(),
      manifest: createManifest(),
      expectedManifestPath: "deployments/base-sepolia/latest.json",
      expectedFromBlock: 100n,
    });

    expect(verification).toEqual({
      passed: true,
      summary: { checks: 8, passed: 8, failed: 0 },
      failures: [],
      checks: [
        { id: "schema-version", passed: true, failures: [] },
        { id: "manifest-identity", passed: true, failures: [] },
        { id: "manifest-contracts", passed: true, failures: [] },
        { id: "replay-range", passed: true, failures: [] },
        { id: "event-count", passed: true, failures: [] },
        { id: "event-order", passed: true, failures: [] },
        { id: "event-contracts", passed: true, failures: [] },
        { id: "economic-event-summary", passed: true, failures: [] },
      ],
    });
    expect(formatAgentOsEventIndexVerificationSummary(verification)).toContain("overall: passed");
  });

  it("fails when indexed contracts do not match the manifest", () => {
    const index = createIndex();
    index.manifest.contracts.agentAccount = "0x0000000000000000000000000000000000000bad";

    const verification = verifyAgentOsEventIndex({
      index,
      manifest: createManifest(),
      expectedManifestPath: "deployments/base-sepolia/latest.json",
      expectedFromBlock: 100n,
    });

    expect(verification.passed).toBe(false);
    expect(verification.failures).toContain(
      "manifest-contracts: indexed contract agentAccount does not match deployment manifest",
    );
  });

  it("fails when the economic event summary is stale", () => {
    const index = createIndex();
    index.economicEvents.eventCount = 1;

    const verification = verifyAgentOsEventIndex({
      index,
      manifest: createManifest(),
      expectedManifestPath: "deployments/base-sepolia/latest.json",
      expectedFromBlock: 100n,
    });

    expect(verification.passed).toBe(false);
    expect(verification.failures).toContain(
      "economic-event-summary: economic event summary does not match indexed events",
    );
  });

  it("records local store metadata and rejects unexpected store hashes", () => {
    const verification = verifyAgentOsEventIndex({
      index: createIndex(),
      manifest: createManifest(),
      expectedManifestPath: "deployments/base-sepolia/latest.json",
      store: {
        path: "artifacts/base-event-index.json",
        sha256: "a".repeat(64),
      },
      expectedStoreSha256: "b".repeat(64),
    });

    expect(verification.store).toEqual({
      path: "artifacts/base-event-index.json",
      sha256: "a".repeat(64),
    });
    expect(verification.passed).toBe(false);
    expect(verification.failures).toContain("store-metadata: index store sha256 does not match expected hash");
    expect(formatAgentOsEventIndexVerificationSummary(verification)).toContain(`storeSha256: ${"a".repeat(64)}`);
  });
});

function createIndex(): AgentOsEventIndex {
  return {
    schemaVersion: 1,
    manifest: {
      path: "deployments/base-sepolia/latest.json",
      network: "base-sepolia",
      chainId: 84532,
      contracts: {
        agentAccount: "0x0000000000000000000000000000000000000a11",
        agentDirectory: "0x0000000000000000000000000000000000000d12",
        capabilityRegistry: "0x0000000000000000000000000000000000000C01",
        policyEngine: "0x0000000000000000000000000000000000000c02",
        reputationRegistry: "0x0000000000000000000000000000000000000c03",
      },
    },
    replay: {
      fromBlock: "100",
      toBlock: null,
      inputLogCount: 1,
      indexedEventCount: 1,
    },
    economicEvents: {
      eventCount: 0,
      latestBlock: null,
      byContract: [],
      byEventName: [],
    },
    events: [
      {
        id: "101:0:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        contract: "agentDirectory",
        address: "0x0000000000000000000000000000000000000d12",
        eventName: "AgentActiveSet",
        blockNumber: "101",
        logIndex: 0,
        transactionHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        args: {
          agent: "0x0000000000000000000000000000000000000a11",
          active: true,
        },
      },
    ],
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
      agentAccount: "0x0000000000000000000000000000000000000a11",
      testTargetProtocol: "0x0000000000000000000000000000000000000c04",
      agentDirectory: "0x0000000000000000000000000000000000000d12",
    },
    transactions: {
      deployCapabilityRegistry: "0x1111111111111111111111111111111111111111111111111111111111111111",
      deployPolicyEngine: "0x2222222222222222222222222222222222222222222222222222222222222222",
      deployReputationRegistry: "0x3333333333333333333333333333333333333333333333333333333333333333",
      deployAgentAccount: "0x4444444444444444444444444444444444444444444444444444444444444444",
      deployTestTargetProtocol: "0x5555555555555555555555555555555555555555555555555555555555555555",
      setCapability: "0x6666666666666666666666666666666666666666666666666666666666666666",
      setPolicy: "0x7777777777777777777777777777777777777777777777777777777777777777",
      smokeExecute: "0x8888888888888888888888888888888888888888888888888888888888888888",
    },
    smokeTest: {
      capability: "0x9999999999999999999999999999999999999999999999999999999999999999",
      targetWasCalled: true,
    },
  };
}
