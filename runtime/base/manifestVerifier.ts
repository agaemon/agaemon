import { getAddress } from "viem";

import {
  DEPLOYMENT_MANIFEST_CONTRACT_FIELDS,
  DEPLOYMENT_MANIFEST_TRANSACTION_FIELDS,
} from "./deploymentManifest.js";

import type {
  DeploymentManifest,
  DeploymentManifestContractField,
  DeploymentManifestTransactionField,
} from "./deploymentManifest.js";
import type { Address, Hex } from "viem";

export interface DeploymentManifestVerifyClient {
  getChainId(): Promise<number>;
  getCode(parameters: { address: Address }): Promise<Hex | undefined>;
  getTransactionReceipt(parameters: { hash: Hex }): Promise<DeploymentManifestVerifyReceipt>;
}

export interface DeploymentManifestVerifyReceipt {
  status: "success" | "reverted";
  blockNumber: bigint;
  contractAddress?: Address | null | undefined;
}

export interface DeploymentManifestVerifyReport {
  network: string;
  chainId: {
    expected: number;
    actual: number;
    passed: boolean;
  };
  contracts: ContractVerification[];
  transactions: TransactionVerification[];
  summary: {
    contractCount: number;
    transactionCount: number;
    failedChecks: number;
    passed: boolean;
  };
}

export interface ContractVerification {
  name: ManifestContractName;
  address: Address;
  deployed: boolean;
  bytecodeBytes: number;
  passed: boolean;
}

export interface TransactionVerification {
  name: ManifestTransactionName;
  hash: Hex;
  status: "success" | "reverted" | "missing";
  blockNumber: string | null;
  contractAddress: Address | null;
  expectedContract?: {
    name: ManifestContractName;
    address: Address;
    matches: boolean;
  };
  passed: boolean;
}

type ManifestContractName = DeploymentManifestContractField;
type ManifestTransactionName = DeploymentManifestTransactionField;

const DEPLOY_TRANSACTION_CONTRACTS: Partial<Record<ManifestTransactionName, ManifestContractName>> = {
  deployCapabilityRegistry: "capabilityRegistry",
  deployPolicyEngine: "policyEngine",
  deployReputationRegistry: "reputationRegistry",
  deployAgentAccount: "agentAccount",
  deployTestTargetProtocol: "testTargetProtocol",
  deployTreasuryPaymentAdapter: "treasuryPaymentAdapter",
  deployTestErc20Token: "testErc20Token",
  deployMockSwapAdapter: "mockSwapAdapter",
  deployMemoryRegistry: "memoryRegistry",
  deployPayoutRuleAdapter: "payoutRuleAdapter",
  deployAgentDirectory: "agentDirectory",
  deployReputationHistory: "reputationHistory",
  deployAgentCoordination: "agentCoordination",
  deployCoordinationPayoutReceiptRegistry: "coordinationPayoutReceiptRegistry",
};

export async function verifyDeploymentManifest(
  manifest: DeploymentManifest,
  client: DeploymentManifestVerifyClient,
): Promise<DeploymentManifestVerifyReport> {
  const actualChainId = await client.getChainId();
  const chainId = {
    expected: manifest.chainId,
    actual: actualChainId,
    passed: actualChainId === manifest.chainId,
  };

  const contracts = await Promise.all(
    manifestContractEntries(manifest).map(async ([name, address]) => {
      const code = await client.getCode({ address });
      const bytecodeBytes = bytecodeLength(code);

      return {
        name,
        address,
        deployed: bytecodeBytes > 0,
        bytecodeBytes,
        passed: bytecodeBytes > 0,
      };
    }),
  );

  const transactions = await Promise.all(
    manifestTransactionEntries(manifest).map(async ([name, hash]) => verifyTransaction(manifest, client, name, hash)),
  );

  const failedChecks =
    (chainId.passed ? 0 : 1) +
    contracts.filter((contract) => !contract.passed).length +
    transactions.filter((transaction) => !transaction.passed).length;

  return {
    network: manifest.network,
    chainId,
    contracts,
    transactions,
    summary: {
      contractCount: contracts.length,
      transactionCount: transactions.length,
      failedChecks,
      passed: failedChecks === 0,
    },
  };
}

export function formatDeploymentManifestVerifySummary(report: DeploymentManifestVerifyReport): string {
  return [
    "Base Sepolia manifest verification",
    `network: ${report.network}`,
    `chainId: ${report.chainId.actual}`,
    `contracts: ${report.summary.contractCount}`,
    `transactions: ${report.summary.transactionCount}`,
    `failedChecks: ${report.summary.failedChecks}`,
    `passed: ${report.summary.passed}`,
  ].join("\n");
}

async function verifyTransaction(
  manifest: DeploymentManifest,
  client: DeploymentManifestVerifyClient,
  name: ManifestTransactionName,
  hash: Hex,
): Promise<TransactionVerification> {
  try {
    const receipt = await client.getTransactionReceipt({ hash });
    const contractAddress = receipt.contractAddress ?? null;
    const expectedContract = expectedContractForTransaction(manifest, name, contractAddress);
    const passed = receipt.status === "success" && (expectedContract?.matches ?? true);

    return {
      name,
      hash,
      status: receipt.status,
      blockNumber: receipt.blockNumber.toString(),
      contractAddress,
      ...(expectedContract === undefined ? {} : { expectedContract }),
      passed,
    };
  } catch {
    return {
      name,
      hash,
      status: "missing",
      blockNumber: null,
      contractAddress: null,
      passed: false,
    };
  }
}

function expectedContractForTransaction(
  manifest: DeploymentManifest,
  name: ManifestTransactionName,
  actualContractAddress: Address | null,
): TransactionVerification["expectedContract"] {
  const contractName = DEPLOY_TRANSACTION_CONTRACTS[name];
  if (contractName === undefined) return undefined;

  const expectedAddress = manifest.contracts[contractName];
  if (expectedAddress === undefined) return undefined;

  return {
    name: contractName,
    address: expectedAddress,
    matches: actualContractAddress !== null && getAddress(actualContractAddress) === getAddress(expectedAddress),
  };
}

function manifestContractEntries(manifest: DeploymentManifest): Array<[ManifestContractName, Address]> {
  const entries: Array<[ManifestContractName, Address]> = [];

  for (const name of DEPLOYMENT_MANIFEST_CONTRACT_FIELDS) {
    const address = manifest.contracts[name];
    if (address !== undefined) entries.push([name, address]);
  }

  return entries;
}

function manifestTransactionEntries(manifest: DeploymentManifest): Array<[ManifestTransactionName, Hex]> {
  const entries: Array<[ManifestTransactionName, Hex]> = [];

  for (const name of DEPLOYMENT_MANIFEST_TRANSACTION_FIELDS) {
    const hash = manifest.transactions[name];
    if (hash !== undefined) entries.push([name, hash]);
  }

  return entries;
}

function bytecodeLength(code: Hex | undefined): number {
  if (code === undefined || code === "0x") return 0;
  return (code.length - 2) / 2;
}
