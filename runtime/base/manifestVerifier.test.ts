import { describe, expect, it } from "vitest";

import {
  DEPLOYMENT_MANIFEST_CONTRACT_FIELDS,
  DEPLOYMENT_MANIFEST_TRANSACTION_FIELDS,
  parseDeploymentManifest,
} from "./deploymentManifest.js";
import { formatDeploymentManifestVerifySummary, verifyDeploymentManifest } from "./manifestVerifier.js";

import type { DeploymentManifest } from "./deploymentManifest.js";
import type { Address, Hex } from "viem";

const MANIFEST = parseDeploymentManifest({
  network: "base-sepolia",
  chainId: 84532,
  rpcUrlEnv: "BASE_SEPOLIA_RPC_URL",
  explorerUrl: "https://sepolia.basescan.org",
  owner: "0x3124475af0ba367fFf33a5DC9BcE78c41f493713",
  contracts: {
    capabilityRegistry: "0x0000000000000000000000000000000000001001",
    policyEngine: "0x0000000000000000000000000000000000001002",
    reputationRegistry: "0x0000000000000000000000000000000000001003",
    agentAccount: "0x0000000000000000000000000000000000001004",
    testTargetProtocol: "0x0000000000000000000000000000000000001005",
    coordinationPayoutReceiptRegistry: "0x0000000000000000000000000000000000001006",
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
    configureCoordinationAcceptanceCapability:
      "0xa1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1",
    configureCoordinationCompletionCapability:
      "0xb1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1",
    acceptCoordinationAssignmentAsAgent:
      "0xc1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1",
    commitCoordinationResultMemoryAsAgent:
      "0xd1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1",
    completeCoordinationAssignmentWithMemoryAsAgent:
      "0xe1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1",
    recordCoordinationOutcomeReputation:
      "0xf1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1",
    syncReputationScoreFromHistory:
      "0xa2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2",
    deployCoordinationPayoutReceiptRegistry:
      "0x9999999999999999999999999999999999999999999999999999999999999999",
  },
  smokeTest: {
    capability: "0x497a7733c30c446bed91d579fce5ede8c3e0fbcdbe90a491d0a07e91d5b88b71",
    targetWasCalled: true,
  },
});

const SHUFFLED_MANIFEST: DeploymentManifest = {
  ...MANIFEST,
  contracts: {
    coordinationPayoutReceiptRegistry: MANIFEST.contracts.coordinationPayoutReceiptRegistry,
    testTargetProtocol: MANIFEST.contracts.testTargetProtocol,
    agentAccount: MANIFEST.contracts.agentAccount,
    reputationRegistry: MANIFEST.contracts.reputationRegistry,
    policyEngine: MANIFEST.contracts.policyEngine,
    capabilityRegistry: MANIFEST.contracts.capabilityRegistry,
  },
  transactions: {
    deployCoordinationPayoutReceiptRegistry: MANIFEST.transactions.deployCoordinationPayoutReceiptRegistry,
    syncReputationScoreFromHistory: MANIFEST.transactions.syncReputationScoreFromHistory,
    recordCoordinationOutcomeReputation: MANIFEST.transactions.recordCoordinationOutcomeReputation,
    completeCoordinationAssignmentWithMemoryAsAgent:
      MANIFEST.transactions.completeCoordinationAssignmentWithMemoryAsAgent,
    commitCoordinationResultMemoryAsAgent: MANIFEST.transactions.commitCoordinationResultMemoryAsAgent,
    acceptCoordinationAssignmentAsAgent: MANIFEST.transactions.acceptCoordinationAssignmentAsAgent,
    configureCoordinationCompletionCapability: MANIFEST.transactions.configureCoordinationCompletionCapability,
    configureCoordinationAcceptanceCapability: MANIFEST.transactions.configureCoordinationAcceptanceCapability,
    smokeExecute: MANIFEST.transactions.smokeExecute,
    setPolicy: MANIFEST.transactions.setPolicy,
    setCapability: MANIFEST.transactions.setCapability,
    deployTestTargetProtocol: MANIFEST.transactions.deployTestTargetProtocol,
    deployAgentAccount: MANIFEST.transactions.deployAgentAccount,
    deployReputationRegistry: MANIFEST.transactions.deployReputationRegistry,
    deployPolicyEngine: MANIFEST.transactions.deployPolicyEngine,
    deployCapabilityRegistry: MANIFEST.transactions.deployCapabilityRegistry,
  },
};

describe("verifyDeploymentManifest", () => {
  it("passes when every manifest contract has bytecode and every manifest transaction succeeded", async () => {
    const client = FakeManifestClient.ready();

    const report = await verifyDeploymentManifest(MANIFEST, client);

    expect(report.chainId).toEqual({ expected: 84532, actual: 84532, passed: true });
    expect(report.contracts).toHaveLength(6);
    expect(report.transactions).toHaveLength(16);
    expect(report.transactions.map((tx) => tx.name)).toContain("configureCoordinationAcceptanceCapability");
    expect(report.transactions.map((tx) => tx.name)).toContain("configureCoordinationCompletionCapability");
    expect(report.transactions.map((tx) => tx.name)).toContain("acceptCoordinationAssignmentAsAgent");
    expect(report.transactions.map((tx) => tx.name)).toContain("commitCoordinationResultMemoryAsAgent");
    expect(report.transactions.map((tx) => tx.name)).toContain("completeCoordinationAssignmentWithMemoryAsAgent");
    expect(report.transactions.map((tx) => tx.name)).toContain("recordCoordinationOutcomeReputation");
    expect(report.transactions.map((tx) => tx.name)).toContain("syncReputationScoreFromHistory");
    expect(report.transactions.find((tx) => tx.name === "deployCapabilityRegistry")).toMatchObject({
      status: "success",
      expectedContract: {
        name: "capabilityRegistry",
        address: MANIFEST.contracts.capabilityRegistry,
        matches: true,
      },
      passed: true,
    });
    expect(report.summary).toEqual({
      contractCount: 6,
      transactionCount: 16,
      failedChecks: 0,
      passed: true,
    });
  });

  it("fails when a manifest contract address has no deployed bytecode", async () => {
    const client = FakeManifestClient.ready();
    client.codes.set(MANIFEST.contracts.policyEngine, "0x");

    const report = await verifyDeploymentManifest(MANIFEST, client);

    expect(report.contracts.find((contract) => contract.name === "policyEngine")).toMatchObject({
      deployed: false,
      passed: false,
    });
    expect(report.summary.passed).toBe(false);
  });

  it("fails when a manifest transaction receipt is reverted", async () => {
    const client = FakeManifestClient.ready();
    client.receipts.set(MANIFEST.transactions.setPolicy, {
      status: "reverted",
      blockNumber: 123n,
      contractAddress: null,
    });

    const report = await verifyDeploymentManifest(MANIFEST, client);

    expect(report.transactions.find((tx) => tx.name === "setPolicy")).toMatchObject({
      status: "reverted",
      passed: false,
    });
    expect(report.summary.passed).toBe(false);
  });

  it("fails when a deploy transaction created a different contract than the manifest records", async () => {
    const client = FakeManifestClient.ready();
    client.receipts.set(MANIFEST.transactions.deployCoordinationPayoutReceiptRegistry!, {
      status: "success",
      blockNumber: 123n,
      contractAddress: "0x000000000000000000000000000000000000dEaD",
    });

    const report = await verifyDeploymentManifest(MANIFEST, client);

    expect(report.transactions.find((tx) => tx.name === "deployCoordinationPayoutReceiptRegistry")).toMatchObject({
      expectedContract: {
        name: "coordinationPayoutReceiptRegistry",
        address: MANIFEST.contracts.coordinationPayoutReceiptRegistry,
        matches: false,
      },
      passed: false,
    });
    expect(report.summary.passed).toBe(false);
  });

  it("reports manifest contracts in canonical schema order", async () => {
    const report = await verifyDeploymentManifest(SHUFFLED_MANIFEST, FakeManifestClient.ready(SHUFFLED_MANIFEST));

    expect(report.contracts.map((contract) => contract.name)).toEqual(
      DEPLOYMENT_MANIFEST_CONTRACT_FIELDS.filter((field) => SHUFFLED_MANIFEST.contracts[field] !== undefined),
    );
    expect(report.summary.contractCount).toBe(6);
  });

  it("reports manifest transactions in canonical schema order", async () => {
    const report = await verifyDeploymentManifest(SHUFFLED_MANIFEST, FakeManifestClient.ready(SHUFFLED_MANIFEST));

    expect(report.transactions.map((transaction) => transaction.name)).toEqual(
      DEPLOYMENT_MANIFEST_TRANSACTION_FIELDS.filter((field) => SHUFFLED_MANIFEST.transactions[field] !== undefined),
    );
    expect(report.summary.transactionCount).toBe(16);
  });

  it("adds expected-contract evidence to deploy transactions only", async () => {
    const report = await verifyDeploymentManifest(SHUFFLED_MANIFEST, FakeManifestClient.ready(SHUFFLED_MANIFEST));

    for (const transaction of report.transactions.filter((entry) => entry.name.startsWith("deploy"))) {
      expect(transaction.expectedContract, transaction.name).toMatchObject({
        matches: true,
      });
    }
    expect(report.transactions.find((transaction) => transaction.name === "setPolicy")?.expectedContract).toBeUndefined();
    expect(report.transactions.find((transaction) => transaction.name === "smokeExecute")?.expectedContract).toBeUndefined();
  });

  it("formats a concise CI summary", async () => {
    const report = await verifyDeploymentManifest(MANIFEST, FakeManifestClient.ready());

    expect(formatDeploymentManifestVerifySummary(report)).toBe(
      [
        "Base Sepolia manifest verification",
        "network: base-sepolia",
        "chainId: 84532",
        "contracts: 6",
        "transactions: 16",
        "failedChecks: 0",
        "passed: true",
      ].join("\n"),
    );
  });
});

class FakeManifestClient {
  readonly codes = new Map<Address, Hex>();
  readonly receipts = new Map<Hex, { status: "success" | "reverted"; blockNumber: bigint; contractAddress: Address | null }>();

  static ready(manifest: DeploymentManifest = MANIFEST): FakeManifestClient {
    const client = new FakeManifestClient();

    for (const address of Object.values(manifest.contracts)) {
      if (address !== undefined) client.codes.set(address, "0x6000");
    }

    for (const hash of Object.values(manifest.transactions)) {
      if (hash !== undefined) {
        client.receipts.set(hash, {
          status: "success",
          blockNumber: 123n,
          contractAddress: null,
        });
      }
    }

    client.receipts.set(manifest.transactions.deployCapabilityRegistry, {
      status: "success",
      blockNumber: 123n,
      contractAddress: manifest.contracts.capabilityRegistry,
    });
    client.receipts.set(manifest.transactions.deployPolicyEngine, {
      status: "success",
      blockNumber: 123n,
      contractAddress: manifest.contracts.policyEngine,
    });
    client.receipts.set(manifest.transactions.deployReputationRegistry, {
      status: "success",
      blockNumber: 123n,
      contractAddress: manifest.contracts.reputationRegistry,
    });
    client.receipts.set(manifest.transactions.deployAgentAccount, {
      status: "success",
      blockNumber: 123n,
      contractAddress: manifest.contracts.agentAccount,
    });
    client.receipts.set(manifest.transactions.deployTestTargetProtocol, {
      status: "success",
      blockNumber: 123n,
      contractAddress: manifest.contracts.testTargetProtocol,
    });
    if (
      manifest.transactions.deployCoordinationPayoutReceiptRegistry !== undefined &&
      manifest.contracts.coordinationPayoutReceiptRegistry !== undefined
    ) {
      client.receipts.set(manifest.transactions.deployCoordinationPayoutReceiptRegistry, {
        status: "success",
        blockNumber: 123n,
        contractAddress: manifest.contracts.coordinationPayoutReceiptRegistry,
      });
    }

    return client;
  }

  async getChainId(): Promise<number> {
    return MANIFEST.chainId;
  }

  async getCode({ address }: { address: Address }): Promise<Hex | undefined> {
    return this.codes.get(address);
  }

  async getTransactionReceipt({ hash }: { hash: Hex }): Promise<{
    status: "success" | "reverted";
    blockNumber: bigint;
    contractAddress: Address | null;
  }> {
    const receipt = this.receipts.get(hash);
    if (receipt === undefined) throw new Error("receipt not found");
    return receipt;
  }
}
