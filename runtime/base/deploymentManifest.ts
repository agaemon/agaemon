import { readFile } from "node:fs/promises";
import type { Address, Hex } from "viem";
import { isAddress, isHex } from "viem";

export const DEFAULT_AGENT_ROLE_LABEL = "agentos.kernel.operator";
export const DEFAULT_AGENT_METADATA_URI = "agentos://base-sepolia/agent-account/v1";

export const DEPLOYMENT_MANIFEST_REQUIRED_FIELDS = [
  "network",
  "chainId",
  "rpcUrlEnv",
  "explorerUrl",
  "owner",
  "contracts",
  "transactions",
  "smokeTest",
] as const;

export const DEPLOYMENT_MANIFEST_OPTIONAL_FIELDS = [
  "deployedAt",
  "agentProfile",
] as const;

export const DEPLOYMENT_MANIFEST_FIELDS = [
  ...DEPLOYMENT_MANIFEST_REQUIRED_FIELDS,
  ...DEPLOYMENT_MANIFEST_OPTIONAL_FIELDS,
] as const;

export type DeploymentManifestRequiredField = typeof DEPLOYMENT_MANIFEST_REQUIRED_FIELDS[number];
export type DeploymentManifestOptionalField = typeof DEPLOYMENT_MANIFEST_OPTIONAL_FIELDS[number];
export type DeploymentManifestField = typeof DEPLOYMENT_MANIFEST_FIELDS[number];

export const DEPLOYMENT_AGENT_PROFILE_FIELDS = [
  "roleLabel",
  "metadataURI",
] as const;

export type DeploymentAgentProfileField = typeof DEPLOYMENT_AGENT_PROFILE_FIELDS[number];

export const DEPLOYMENT_MANIFEST_SMOKE_TEST_FIELDS = [
  "capability",
  "targetWasCalled",
] as const;

export type DeploymentManifestSmokeTestField = typeof DEPLOYMENT_MANIFEST_SMOKE_TEST_FIELDS[number];

export const DEPLOYMENT_MANIFEST_REQUIRED_CONTRACT_FIELDS = [
  "capabilityRegistry",
  "policyEngine",
  "reputationRegistry",
  "agentAccount",
  "testTargetProtocol",
] as const;

export const DEPLOYMENT_MANIFEST_OPTIONAL_CONTRACT_FIELDS = [
  "treasuryPaymentAdapter",
  "testErc20Token",
  "mockSwapAdapter",
  "memoryRegistry",
  "payoutRuleAdapter",
  "coordinationPayoutReceiptRegistry",
  "agentDirectory",
  "reputationHistory",
  "agentCoordination",
] as const;

export const DEPLOYMENT_MANIFEST_CONTRACT_FIELDS = [
  ...DEPLOYMENT_MANIFEST_REQUIRED_CONTRACT_FIELDS,
  ...DEPLOYMENT_MANIFEST_OPTIONAL_CONTRACT_FIELDS,
] as const;

export type DeploymentManifestRequiredContractField =
  typeof DEPLOYMENT_MANIFEST_REQUIRED_CONTRACT_FIELDS[number];
export type DeploymentManifestOptionalContractField =
  typeof DEPLOYMENT_MANIFEST_OPTIONAL_CONTRACT_FIELDS[number];
export type DeploymentManifestContractField = typeof DEPLOYMENT_MANIFEST_CONTRACT_FIELDS[number];

export const DEPLOYMENT_MANIFEST_REQUIRED_TRANSACTION_FIELDS = [
  "deployCapabilityRegistry",
  "deployPolicyEngine",
  "deployReputationRegistry",
  "deployAgentAccount",
  "deployTestTargetProtocol",
  "setCapability",
  "setPolicy",
  "smokeExecute",
] as const;

export const DEPLOYMENT_MANIFEST_OPTIONAL_TRANSACTION_FIELDS = [
  "deployTreasuryPaymentAdapter",
  "configurePaymentCapability",
  "paymentExecute",
  "deployTestErc20Token",
  "mintTestErc20Token",
  "configureTokenCapability",
  "configureTokenPolicy",
  "tokenTransferExecute",
  "deployMockSwapAdapter",
  "fundMockSwapAdapter",
  "configureSwapCapability",
  "configureSwapPolicy",
  "swapExecute",
  "deployMemoryRegistry",
  "configureMemoryCapability",
  "memoryCommitExecute",
  "memoryStoreCommitExecute",
  "reputationAdjustExecute",
  "deployPayoutRuleAdapter",
  "configurePayoutCapability",
  "configurePayoutRule",
  "payoutExecute",
  "agentDelegateExecute",
  "deployAgentDirectory",
  "registerAgentProfile",
  "agentProfileMemoryCommitExecute",
  "registerAgentProfileMemory",
  "agentProfileIpfsMemoryCommitExecute",
  "registerAgentProfileIpfsMemory",
  "deployReputationHistory",
  "recordReputationEvent",
  "deployAgentCoordination",
  "createCoordinationAssignment",
  "configureCoordinationAcceptanceCapability",
  "configureCoordinationCompletionCapability",
  "acceptCoordinationAssignmentAsAgent",
  "commitCoordinationResultMemoryAsAgent",
  "completeCoordinationAssignmentWithMemoryAsAgent",
  "recordCoordinationOutcomeReputation",
  "syncReputationScoreFromHistory",
  "configureCoordinationAssigneePayoutRule",
  "coordinationAssignmentPayoutExecute",
  "deployCoordinationPayoutReceiptRegistry",
  "recordCoordinationPayoutReceipt",
] as const;

export const DEPLOYMENT_MANIFEST_TRANSACTION_FIELDS = [
  ...DEPLOYMENT_MANIFEST_REQUIRED_TRANSACTION_FIELDS,
  ...DEPLOYMENT_MANIFEST_OPTIONAL_TRANSACTION_FIELDS,
] as const;

export type DeploymentManifestRequiredTransactionField =
  typeof DEPLOYMENT_MANIFEST_REQUIRED_TRANSACTION_FIELDS[number];
export type DeploymentManifestOptionalTransactionField =
  typeof DEPLOYMENT_MANIFEST_OPTIONAL_TRANSACTION_FIELDS[number];
export type DeploymentManifestTransactionField = typeof DEPLOYMENT_MANIFEST_TRANSACTION_FIELDS[number];

export interface DeploymentAgentProfile {
  roleLabel: string;
  metadataURI: string;
}

export interface DeploymentManifest {
  network: string;
  chainId: number;
  rpcUrlEnv: string;
  explorerUrl: string;
  deployedAt?: string | undefined;
  owner: Address;
  agentProfile?: DeploymentAgentProfile | undefined;
  contracts: {
    capabilityRegistry: Address;
    policyEngine: Address;
    reputationRegistry: Address;
    agentAccount: Address;
    testTargetProtocol: Address;
    treasuryPaymentAdapter?: Address | undefined;
    testErc20Token?: Address | undefined;
    mockSwapAdapter?: Address | undefined;
    memoryRegistry?: Address | undefined;
    payoutRuleAdapter?: Address | undefined;
    coordinationPayoutReceiptRegistry?: Address | undefined;
    agentDirectory?: Address | undefined;
    reputationHistory?: Address | undefined;
    agentCoordination?: Address | undefined;
  };
  transactions: {
    deployCapabilityRegistry: Hex;
    deployPolicyEngine: Hex;
    deployReputationRegistry: Hex;
    deployAgentAccount: Hex;
    deployTestTargetProtocol: Hex;
    setCapability: Hex;
    setPolicy: Hex;
    smokeExecute: Hex;
    deployTreasuryPaymentAdapter?: Hex | undefined;
    configurePaymentCapability?: Hex | undefined;
    paymentExecute?: Hex | undefined;
    deployTestErc20Token?: Hex | undefined;
    mintTestErc20Token?: Hex | undefined;
    configureTokenCapability?: Hex | undefined;
    configureTokenPolicy?: Hex | undefined;
    tokenTransferExecute?: Hex | undefined;
    deployMockSwapAdapter?: Hex | undefined;
    fundMockSwapAdapter?: Hex | undefined;
    configureSwapCapability?: Hex | undefined;
    configureSwapPolicy?: Hex | undefined;
    swapExecute?: Hex | undefined;
    deployMemoryRegistry?: Hex | undefined;
    configureMemoryCapability?: Hex | undefined;
    memoryCommitExecute?: Hex | undefined;
    memoryStoreCommitExecute?: Hex | undefined;
    reputationAdjustExecute?: Hex | undefined;
    deployPayoutRuleAdapter?: Hex | undefined;
    configurePayoutCapability?: Hex | undefined;
    configurePayoutRule?: Hex | undefined;
    payoutExecute?: Hex | undefined;
    agentDelegateExecute?: Hex | undefined;
    deployAgentDirectory?: Hex | undefined;
    registerAgentProfile?: Hex | undefined;
    agentProfileMemoryCommitExecute?: Hex | undefined;
    registerAgentProfileMemory?: Hex | undefined;
    agentProfileIpfsMemoryCommitExecute?: Hex | undefined;
    registerAgentProfileIpfsMemory?: Hex | undefined;
    deployReputationHistory?: Hex | undefined;
    recordReputationEvent?: Hex | undefined;
    deployAgentCoordination?: Hex | undefined;
    createCoordinationAssignment?: Hex | undefined;
    configureCoordinationAcceptanceCapability?: Hex | undefined;
    configureCoordinationCompletionCapability?: Hex | undefined;
    acceptCoordinationAssignmentAsAgent?: Hex | undefined;
    commitCoordinationResultMemoryAsAgent?: Hex | undefined;
    completeCoordinationAssignmentWithMemoryAsAgent?: Hex | undefined;
    recordCoordinationOutcomeReputation?: Hex | undefined;
    syncReputationScoreFromHistory?: Hex | undefined;
    configureCoordinationAssigneePayoutRule?: Hex | undefined;
    coordinationAssignmentPayoutExecute?: Hex | undefined;
    deployCoordinationPayoutReceiptRegistry?: Hex | undefined;
    recordCoordinationPayoutReceipt?: Hex | undefined;
  };
  smokeTest: {
    capability: Hex;
    targetWasCalled: boolean;
  };
}

export async function readDeploymentManifest(path: string): Promise<DeploymentManifest> {
  const raw = await readFile(path, "utf8");
  return parseDeploymentManifest(JSON.parse(raw) as unknown);
}

export function parseDeploymentManifest(value: unknown): DeploymentManifest {
  const manifest = requireObject(value, "manifest");
  const contracts = requireObject(manifest.contracts, "contracts");
  const transactions = requireObject(manifest.transactions, "transactions");
  const smokeTest = requireObject(manifest.smokeTest, "smokeTest");

  return {
    network: requireString(manifest.network, "network"),
    chainId: requireNumber(manifest.chainId, "chainId"),
    rpcUrlEnv: requireString(manifest.rpcUrlEnv, "rpcUrlEnv"),
    explorerUrl: requireString(manifest.explorerUrl, "explorerUrl"),
    deployedAt: optionalString(manifest.deployedAt, "deployedAt"),
    owner: requireAddress(manifest.owner, "owner"),
    agentProfile: optionalAgentProfile(manifest.agentProfile, "agentProfile"),
    contracts: {
      capabilityRegistry: requireAddress(contracts.capabilityRegistry, "contracts.capabilityRegistry"),
      policyEngine: requireAddress(contracts.policyEngine, "contracts.policyEngine"),
      reputationRegistry: requireAddress(contracts.reputationRegistry, "contracts.reputationRegistry"),
      agentAccount: requireAddress(contracts.agentAccount, "contracts.agentAccount"),
      testTargetProtocol: requireAddress(contracts.testTargetProtocol, "contracts.testTargetProtocol"),
      treasuryPaymentAdapter: optionalAddress(contracts.treasuryPaymentAdapter, "contracts.treasuryPaymentAdapter"),
      testErc20Token: optionalAddress(contracts.testErc20Token, "contracts.testErc20Token"),
      mockSwapAdapter: optionalAddress(contracts.mockSwapAdapter, "contracts.mockSwapAdapter"),
      memoryRegistry: optionalAddress(contracts.memoryRegistry, "contracts.memoryRegistry"),
      payoutRuleAdapter: optionalAddress(contracts.payoutRuleAdapter, "contracts.payoutRuleAdapter"),
      coordinationPayoutReceiptRegistry: optionalAddress(
        contracts.coordinationPayoutReceiptRegistry,
        "contracts.coordinationPayoutReceiptRegistry",
      ),
      agentDirectory: optionalAddress(contracts.agentDirectory, "contracts.agentDirectory"),
      reputationHistory: optionalAddress(contracts.reputationHistory, "contracts.reputationHistory"),
      agentCoordination: optionalAddress(contracts.agentCoordination, "contracts.agentCoordination"),
    },
    transactions: {
      deployCapabilityRegistry: requireHash(transactions.deployCapabilityRegistry, "transactions.deployCapabilityRegistry"),
      deployPolicyEngine: requireHash(transactions.deployPolicyEngine, "transactions.deployPolicyEngine"),
      deployReputationRegistry: requireHash(transactions.deployReputationRegistry, "transactions.deployReputationRegistry"),
      deployAgentAccount: requireHash(transactions.deployAgentAccount, "transactions.deployAgentAccount"),
      deployTestTargetProtocol: requireHash(
        transactions.deployTestTargetProtocol,
        "transactions.deployTestTargetProtocol",
      ),
      setCapability: requireHash(transactions.setCapability, "transactions.setCapability"),
      setPolicy: requireHash(transactions.setPolicy, "transactions.setPolicy"),
      smokeExecute: requireHash(transactions.smokeExecute, "transactions.smokeExecute"),
      deployTreasuryPaymentAdapter: optionalHash(
        transactions.deployTreasuryPaymentAdapter,
        "transactions.deployTreasuryPaymentAdapter",
      ),
      configurePaymentCapability: optionalHash(
        transactions.configurePaymentCapability,
        "transactions.configurePaymentCapability",
      ),
      paymentExecute: optionalHash(transactions.paymentExecute, "transactions.paymentExecute"),
      deployTestErc20Token: optionalHash(transactions.deployTestErc20Token, "transactions.deployTestErc20Token"),
      mintTestErc20Token: optionalHash(transactions.mintTestErc20Token, "transactions.mintTestErc20Token"),
      configureTokenCapability: optionalHash(transactions.configureTokenCapability, "transactions.configureTokenCapability"),
      configureTokenPolicy: optionalHash(transactions.configureTokenPolicy, "transactions.configureTokenPolicy"),
      tokenTransferExecute: optionalHash(transactions.tokenTransferExecute, "transactions.tokenTransferExecute"),
      deployMockSwapAdapter: optionalHash(transactions.deployMockSwapAdapter, "transactions.deployMockSwapAdapter"),
      fundMockSwapAdapter: optionalHash(transactions.fundMockSwapAdapter, "transactions.fundMockSwapAdapter"),
      configureSwapCapability: optionalHash(transactions.configureSwapCapability, "transactions.configureSwapCapability"),
      configureSwapPolicy: optionalHash(transactions.configureSwapPolicy, "transactions.configureSwapPolicy"),
      swapExecute: optionalHash(transactions.swapExecute, "transactions.swapExecute"),
      deployMemoryRegistry: optionalHash(transactions.deployMemoryRegistry, "transactions.deployMemoryRegistry"),
      configureMemoryCapability: optionalHash(
        transactions.configureMemoryCapability,
        "transactions.configureMemoryCapability",
      ),
      memoryCommitExecute: optionalHash(transactions.memoryCommitExecute, "transactions.memoryCommitExecute"),
      memoryStoreCommitExecute: optionalHash(
        transactions.memoryStoreCommitExecute,
        "transactions.memoryStoreCommitExecute",
      ),
      reputationAdjustExecute: optionalHash(
        transactions.reputationAdjustExecute,
        "transactions.reputationAdjustExecute",
      ),
      deployPayoutRuleAdapter: optionalHash(transactions.deployPayoutRuleAdapter, "transactions.deployPayoutRuleAdapter"),
      configurePayoutCapability: optionalHash(
        transactions.configurePayoutCapability,
        "transactions.configurePayoutCapability",
      ),
      configurePayoutRule: optionalHash(transactions.configurePayoutRule, "transactions.configurePayoutRule"),
      payoutExecute: optionalHash(transactions.payoutExecute, "transactions.payoutExecute"),
      agentDelegateExecute: optionalHash(transactions.agentDelegateExecute, "transactions.agentDelegateExecute"),
      deployAgentDirectory: optionalHash(transactions.deployAgentDirectory, "transactions.deployAgentDirectory"),
      registerAgentProfile: optionalHash(transactions.registerAgentProfile, "transactions.registerAgentProfile"),
      agentProfileMemoryCommitExecute: optionalHash(
        transactions.agentProfileMemoryCommitExecute,
        "transactions.agentProfileMemoryCommitExecute",
      ),
      registerAgentProfileMemory: optionalHash(
        transactions.registerAgentProfileMemory,
        "transactions.registerAgentProfileMemory",
      ),
      agentProfileIpfsMemoryCommitExecute: optionalHash(
        transactions.agentProfileIpfsMemoryCommitExecute,
        "transactions.agentProfileIpfsMemoryCommitExecute",
      ),
      registerAgentProfileIpfsMemory: optionalHash(
        transactions.registerAgentProfileIpfsMemory,
        "transactions.registerAgentProfileIpfsMemory",
      ),
      deployReputationHistory: optionalHash(
        transactions.deployReputationHistory,
        "transactions.deployReputationHistory",
      ),
      recordReputationEvent: optionalHash(transactions.recordReputationEvent, "transactions.recordReputationEvent"),
      deployAgentCoordination: optionalHash(
        transactions.deployAgentCoordination,
        "transactions.deployAgentCoordination",
      ),
      createCoordinationAssignment: optionalHash(
        transactions.createCoordinationAssignment,
        "transactions.createCoordinationAssignment",
      ),
      configureCoordinationAcceptanceCapability: optionalHash(
        transactions.configureCoordinationAcceptanceCapability,
        "transactions.configureCoordinationAcceptanceCapability",
      ),
      configureCoordinationCompletionCapability: optionalHash(
        transactions.configureCoordinationCompletionCapability,
        "transactions.configureCoordinationCompletionCapability",
      ),
      acceptCoordinationAssignmentAsAgent: optionalHash(
        transactions.acceptCoordinationAssignmentAsAgent,
        "transactions.acceptCoordinationAssignmentAsAgent",
      ),
      commitCoordinationResultMemoryAsAgent: optionalHash(
        transactions.commitCoordinationResultMemoryAsAgent,
        "transactions.commitCoordinationResultMemoryAsAgent",
      ),
      completeCoordinationAssignmentWithMemoryAsAgent: optionalHash(
        transactions.completeCoordinationAssignmentWithMemoryAsAgent,
        "transactions.completeCoordinationAssignmentWithMemoryAsAgent",
      ),
      recordCoordinationOutcomeReputation: optionalHash(
        transactions.recordCoordinationOutcomeReputation,
        "transactions.recordCoordinationOutcomeReputation",
      ),
      syncReputationScoreFromHistory: optionalHash(
        transactions.syncReputationScoreFromHistory,
        "transactions.syncReputationScoreFromHistory",
      ),
      configureCoordinationAssigneePayoutRule: optionalHash(
        transactions.configureCoordinationAssigneePayoutRule,
        "transactions.configureCoordinationAssigneePayoutRule",
      ),
      coordinationAssignmentPayoutExecute: optionalHash(
        transactions.coordinationAssignmentPayoutExecute,
        "transactions.coordinationAssignmentPayoutExecute",
      ),
      deployCoordinationPayoutReceiptRegistry: optionalHash(
        transactions.deployCoordinationPayoutReceiptRegistry,
        "transactions.deployCoordinationPayoutReceiptRegistry",
      ),
      recordCoordinationPayoutReceipt: optionalHash(
        transactions.recordCoordinationPayoutReceipt,
        "transactions.recordCoordinationPayoutReceipt",
      ),
    },
    smokeTest: {
      capability: requireBytes32(smokeTest.capability, "smokeTest.capability"),
      targetWasCalled: requireBoolean(smokeTest.targetWasCalled, "smokeTest.targetWasCalled"),
    },
  };
}

export function resolveDeploymentAgentProfile(
  manifest: DeploymentManifest,
  environment: Record<string, string | undefined> = process.env,
): DeploymentAgentProfile {
  return {
    roleLabel: environment.AGENT_ROLE_LABEL ?? manifest.agentProfile?.roleLabel ?? DEFAULT_AGENT_ROLE_LABEL,
    metadataURI: environment.AGENT_METADATA_URI ?? manifest.agentProfile?.metadataURI ?? DEFAULT_AGENT_METADATA_URI,
  };
}

export function requireTreasuryPaymentAdapter(manifest: DeploymentManifest): Address {
  const adapter = manifest.contracts.treasuryPaymentAdapter;
  if (adapter === undefined) {
    throw new Error("Deployment manifest is missing contracts.treasuryPaymentAdapter");
  }

  return adapter;
}

export function requireTestErc20Token(manifest: DeploymentManifest): Address {
  const token = manifest.contracts.testErc20Token;
  if (token === undefined) {
    throw new Error("Deployment manifest is missing contracts.testErc20Token");
  }

  return token;
}

export function requireMockSwapAdapter(manifest: DeploymentManifest): Address {
  const adapter = manifest.contracts.mockSwapAdapter;
  if (adapter === undefined) {
    throw new Error("Deployment manifest is missing contracts.mockSwapAdapter");
  }

  return adapter;
}

export function requireMemoryRegistry(manifest: DeploymentManifest): Address {
  const registry = manifest.contracts.memoryRegistry;
  if (registry === undefined) {
    throw new Error("Deployment manifest is missing contracts.memoryRegistry");
  }

  return registry;
}

export function requirePayoutRuleAdapter(manifest: DeploymentManifest): Address {
  const adapter = manifest.contracts.payoutRuleAdapter;
  if (adapter === undefined) {
    throw new Error("Deployment manifest is missing contracts.payoutRuleAdapter");
  }

  return adapter;
}

export function requireCoordinationPayoutReceiptRegistry(manifest: DeploymentManifest): Address {
  const registry = manifest.contracts.coordinationPayoutReceiptRegistry;
  if (registry === undefined) {
    throw new Error("Deployment manifest is missing contracts.coordinationPayoutReceiptRegistry");
  }

  return registry;
}

export function requireAgentDirectory(manifest: DeploymentManifest): Address {
  const directory = manifest.contracts.agentDirectory;
  if (directory === undefined) {
    throw new Error("Deployment manifest is missing contracts.agentDirectory");
  }

  return directory;
}

export function requireReputationHistory(manifest: DeploymentManifest): Address {
  const history = manifest.contracts.reputationHistory;
  if (history === undefined) {
    throw new Error("Deployment manifest is missing contracts.reputationHistory");
  }

  return history;
}

export function requireAgentCoordination(manifest: DeploymentManifest): Address {
  const coordination = manifest.contracts.agentCoordination;
  if (coordination === undefined) {
    throw new Error("Deployment manifest is missing contracts.agentCoordination");
  }

  return coordination;
}

function requireObject(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid deployment manifest: ${field} must be an object`);
  }

  return value as Record<string, unknown>;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid deployment manifest: ${field} must be a non-empty string`);
  }

  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  return requireString(value, field);
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Invalid deployment manifest: ${field} must be an integer`);
  }

  return value;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Invalid deployment manifest: ${field} must be a boolean`);
  }

  return value;
}

function optionalAgentProfile(value: unknown, field: string): DeploymentAgentProfile | undefined {
  if (value === undefined) return undefined;
  const profile = requireObject(value, field);

  return {
    roleLabel: requireString(profile.roleLabel, `${field}.roleLabel`),
    metadataURI: requireString(profile.metadataURI, `${field}.metadataURI`),
  };
}

function requireAddress(value: unknown, field: string): Address {
  if (typeof value !== "string" || !isAddress(value)) {
    throw new Error(`Invalid deployment manifest: ${field} must be an address`);
  }

  return value;
}

function optionalAddress(value: unknown, field: string): Address | undefined {
  if (value === undefined) return undefined;
  return requireAddress(value, field);
}

function requireHash(value: unknown, field: string): Hex {
  if (typeof value !== "string" || !isHex(value, { strict: true }) || value.length !== 66) {
    throw new Error(`Invalid deployment manifest: ${field} must be a transaction hash`);
  }

  return value;
}

function optionalHash(value: unknown, field: string): Hex | undefined {
  if (value === undefined) return undefined;
  return requireHash(value, field);
}

function requireBytes32(value: unknown, field: string): Hex {
  if (typeof value !== "string" || !isHex(value, { strict: true }) || value.length !== 66) {
    throw new Error(`Invalid deployment manifest: ${field} must be bytes32`);
  }

  return value;
}
