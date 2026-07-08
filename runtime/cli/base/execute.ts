import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createPublicClient, createWalletClient, http, isAddress, isHash, isHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import {
  DEPLOYMENT_AGENT_PROFILE_FIELDS,
  DEPLOYMENT_MANIFEST_CONTRACT_FIELDS,
  DEPLOYMENT_MANIFEST_FIELDS,
  DEPLOYMENT_MANIFEST_OPTIONAL_CONTRACT_FIELDS,
  DEPLOYMENT_MANIFEST_OPTIONAL_TRANSACTION_FIELDS,
  DEPLOYMENT_MANIFEST_REQUIRED_TRANSACTION_FIELDS,
  DEPLOYMENT_MANIFEST_SMOKE_TEST_FIELDS,
  DEPLOYMENT_MANIFEST_TRANSACTION_FIELDS,
  readDeploymentManifest,
} from "../../base/deploymentManifest.js";
import {
  createOnChainPolicySimulator,
  createSmokeTestAction,
  normalizePrivateKey,
} from "../../base/execution.js";
import { POLICY_DECISION_CODES } from "../../core/policy.js";
import { buildExecuteTransaction } from "../../transactions/builder.js";

import type { DeploymentManifest } from "../../base/deploymentManifest.js";
import type { AgentAction } from "../../core/action.js";
import type { PolicyDecision } from "../../core/policy.js";
import type { SimulatePolicy } from "../../core/policy.js";
import type { BuildExecuteTransactionResult } from "../../transactions/builder.js";
import type { Address, Hex } from "viem";

const DEFAULT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";
const DOTENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const BASE_EXECUTE_DENIED_REPORT_FIELDS = new Set(["mode", "chainId", "allowed", "decision", "transaction"]);
const BASE_EXECUTE_ALLOWED_REPORT_FIELDS = new Set([
  "mode",
  "chainId",
  "agent",
  "target",
  "allowed",
  "decision",
  "transaction",
]);
const BASE_EXECUTE_SENT_REPORT_FIELDS = new Set([
  ...BASE_EXECUTE_ALLOWED_REPORT_FIELDS,
  "hash",
  "explorerUrl",
  "receipt",
]);
const BASE_EXECUTE_POLICY_DECISION_FIELDS = new Set(["allowed", "code"]);
const BASE_EXECUTE_TRANSACTION_FIELDS = new Set(["to", "value", "data"]);
const BASE_EXECUTE_RECEIPT_FIELDS = new Set(["blockNumber", "status"]);
const BASE_EXECUTE_TRANSACTION_RESULT_FIELDS = new Set(["allowed", "decision", "transaction"]);
const BASE_EXECUTE_ACTION_FIELDS = new Set(["capability", "target", "value", "data", "usesBorrowing"]);
const BASE_EXECUTE_MANIFEST_FIELDS = new Set(DEPLOYMENT_MANIFEST_FIELDS);
const BASE_EXECUTE_MANIFEST_AGENT_PROFILE_FIELDS = new Set(DEPLOYMENT_AGENT_PROFILE_FIELDS);
const BASE_EXECUTE_MANIFEST_CONTRACT_FIELDS = new Set(DEPLOYMENT_MANIFEST_CONTRACT_FIELDS);
const BASE_EXECUTE_MANIFEST_TRANSACTION_FIELDS = new Set(DEPLOYMENT_MANIFEST_TRANSACTION_FIELDS);
const BASE_EXECUTE_MANIFEST_SMOKE_TEST_FIELDS = new Set(DEPLOYMENT_MANIFEST_SMOKE_TEST_FIELDS);

export type BaseExecuteCliReport = BaseExecuteDeniedCliReport | BaseExecuteAllowedCliReport | BaseExecuteSentCliReport;

interface BaseExecutePublicClient {
  getChainId(): Promise<number>;
  readContract(parameters: unknown): Promise<unknown>;
  waitForTransactionReceipt(parameters: { hash: Hex }): Promise<{
    blockNumber: bigint;
    status: "success" | "reverted";
  }>;
}

type BaseExecuteAccount = ReturnType<typeof privateKeyToAccount>;

interface BaseExecuteWalletClient {
  sendTransaction(parameters: {
    account: BaseExecuteAccount;
    chain: typeof baseSepolia;
    to: Address;
    value: bigint;
    data: Hex;
  }): Promise<Hex>;
}

interface BaseExecuteWalletClientOptions {
  account: BaseExecuteAccount;
  rpcUrl: string;
}

export interface BaseExecuteCliArgs {
  send: boolean;
  manifestPath: string;
}

export interface BaseExecuteCliOptions {
  argv?: readonly string[];
  env?: Record<string, string | undefined>;
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  loadDotEnv?: (path: string, env: Record<string, string | undefined>) => void;
  readManifest?: (path: string) => Promise<DeploymentManifest>;
  createPublicClient?: (rpcUrl: string) => BaseExecutePublicClient;
  createPolicySimulator?: (client: BaseExecutePublicClient, manifest: DeploymentManifest) => SimulatePolicy;
  createAction?: (manifest: DeploymentManifest) => AgentAction;
  buildTransaction?: typeof buildExecuteTransaction;
  createAccount?: (privateKey: Hex) => BaseExecuteAccount;
  createWalletClient?: (options: BaseExecuteWalletClientOptions) => BaseExecuteWalletClient;
}

export interface BaseExecuteDeniedCliReport {
  mode: "dry-run" | "send";
  chainId: number;
  allowed: false;
  decision: PolicyDecision;
  transaction: null;
}

export interface BaseExecuteAllowedCliReport {
  mode: "dry-run" | "send";
  chainId: number;
  agent: Address;
  target: Address;
  allowed: true;
  decision: PolicyDecision;
  transaction: {
    to: Address;
    value: string;
    data: Hex;
  };
}

export interface BaseExecuteSentCliReport extends BaseExecuteAllowedCliReport {
  mode: "send";
  hash: Hex;
  explorerUrl: string;
  receipt: {
    blockNumber: string;
    status: "success" | "reverted";
  };
}

if (isBaseExecuteDirectRun(import.meta.url, process.argv)) await runBaseExecuteCli();

export async function runBaseExecuteCli(options: BaseExecuteCliOptions = {}): Promise<void> {
  validateBaseExecuteOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const env = options.env ?? process.env;
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const loadDotEnv = options.loadDotEnv ?? loadBaseExecuteDotEnv;
  const readManifest = options.readManifest ?? readDeploymentManifest;
  const createExecutePublicClient = options.createPublicClient ?? createBaseExecutePublicClient;
  const createPolicySimulator = options.createPolicySimulator ?? createOnChainPolicySimulator;
  const createAction = options.createAction ?? createSmokeTestAction;
  const buildTransaction = options.buildTransaction ?? buildExecuteTransaction;
  const createAccount = options.createAccount ?? privateKeyToAccount;
  const createExecuteWalletClient = options.createWalletClient ?? createBaseExecuteWalletClient;

  validateBaseExecuteOutputWriter(writeOutput);
  validateBaseExecuteArgv(argv);
  if (isBaseExecuteCliHelpRequest(argv)) {
    writeOutput(formatBaseExecuteCliUsage());
    return;
  }

  const args = parseBaseExecuteCliArgs(argv);
  validateBaseExecuteEnv(env);
  validateBaseExecuteDotEnvLoader(loadDotEnv);
  loadDotEnv(".env", env);
  validateBaseExecuteEnvValues(env);

  validateBaseExecuteManifestReader(readManifest);
  const manifest = await readManifest(args.manifestPath);
  validateBaseExecuteManifest(manifest);
  const rpcUrl = readRequiredBaseExecuteEnv(env, manifest.rpcUrlEnv);

  validateBaseExecutePublicClientFactory(createExecutePublicClient);
  const publicClient = createExecutePublicClient(rpcUrl);
  validateBaseExecutePublicClient(publicClient);

  const chainId = await publicClient.getChainId();
  validateBaseExecuteConnectedChainId(chainId);
  if (chainId !== manifest.chainId) {
    throw new Error(`Connected to chain ${chainId}, expected ${manifest.chainId}`);
  }

  validateBaseExecuteActionFactory(createAction);
  const action = createAction(manifest);
  validateBaseExecuteAction(action);
  validateBaseExecuteTransactionBuilder(buildTransaction);
  validateBaseExecutePolicySimulatorFactory(createPolicySimulator);
  const simulatePolicy = createPolicySimulator(publicClient, manifest);
  validateBaseExecutePolicySimulator(simulatePolicy);
  const result = await buildTransaction({
    agent: manifest.contracts.agentAccount,
    action,
    simulatePolicy,
  });
  validateBaseExecuteTransactionResult(result);

  if (result.allowed && result.transaction === null) {
    throw new Error("Allowed execution result must include a transaction");
  }

  if (!result.allowed && result.transaction !== null) {
    throw new Error("Denied execution result must not include a transaction");
  }

  if (result.transaction !== null) {
    validateBaseExecuteTransaction(result.transaction);
  }

  if (!result.allowed || result.transaction === null) {
    validateBaseExecuteExitCodeSetter(setExitCode);
    writeOutput(formatBaseExecuteCliOutput({
      mode: args.send ? "send" : "dry-run",
      chainId,
      allowed: false,
      decision: result.decision,
      transaction: null,
    }));
    setExitCode(1);
    return;
  }

  const baseOutput: BaseExecuteAllowedCliReport = {
    mode: args.send ? "send" : "dry-run",
    chainId,
    agent: manifest.contracts.agentAccount,
    target: action.target,
    allowed: true,
    decision: result.decision,
    transaction: {
      to: result.transaction.to,
      value: result.transaction.value.toString(),
      data: result.transaction.data,
    },
  };

  if (!args.send) {
    writeOutput(formatBaseExecuteCliOutput(baseOutput));
    return;
  }

  const rawPrivateKey = readRequiredBaseExecuteEnv(
    env,
    "PRIVATE_KEY",
    "PRIVATE_KEY is required when --send is used",
  );

  validateBaseExecuteAccountFactory(createAccount);
  const account = createAccount(normalizePrivateKey(rawPrivateKey));
  validateBaseExecuteAccount(account);
  validateBaseExecuteWalletClientFactory(createExecuteWalletClient);
  const walletClient = createExecuteWalletClient({ account, rpcUrl });
  validateBaseExecuteWalletClient(walletClient);

  const hash = await walletClient.sendTransaction({
    account,
    chain: baseSepolia,
    to: result.transaction.to,
    value: result.transaction.value,
    data: result.transaction.data,
  });
  validateBaseExecuteSentHash(hash);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  validateBaseExecuteReceipt(receipt);

  writeOutput(formatBaseExecuteCliOutput({
    ...baseOutput,
    mode: "send",
    hash,
    explorerUrl: `${manifest.explorerUrl}/tx/${hash}`,
    receipt: {
      blockNumber: receipt.blockNumber.toString(),
      status: receipt.status,
    },
  }));
}

export function formatBaseExecuteCliOutput(report: BaseExecuteCliReport): string {
  validateBaseExecuteCliReport(report);
  return JSON.stringify(report, null, 2);
}

function createBaseExecutePublicClient(rpcUrl: string): BaseExecutePublicClient {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  }) as BaseExecutePublicClient;
}

function createBaseExecuteWalletClient(options: BaseExecuteWalletClientOptions): BaseExecuteWalletClient {
  return createWalletClient({
    account: options.account,
    chain: baseSepolia,
    transport: http(options.rpcUrl),
  }) as BaseExecuteWalletClient;
}

function validateBaseExecuteManifest(manifest: unknown): asserts manifest is DeploymentManifest {
  if (Array.isArray(manifest)) {
    throw new Error("Deployment manifest must be an object");
  }

  if (
    typeof manifest !== "object" ||
    manifest === null ||
    !("chainId" in manifest) ||
    typeof manifest.chainId !== "number" ||
    !Number.isInteger(manifest.chainId)
  ) {
    throw new Error("Deployment manifest chainId must be an integer");
  }

  validateBaseExecuteObjectFields(
    manifest,
    BASE_EXECUTE_MANIFEST_FIELDS,
    "Deployment manifest must not include unsupported fields",
  );

  const manifestRecord = manifest as Record<string, unknown>;
  validateBaseExecuteNonEmptyString(
    manifestRecord.network,
    "Deployment manifest network must be a non-empty string",
  );

  if (!("owner" in manifest) || typeof manifest.owner !== "string" || !isAddress(manifest.owner)) {
    throw new Error("Deployment manifest owner must be a valid address");
  }

  if ("deployedAt" in manifest && manifest.deployedAt !== undefined) {
    validateBaseExecuteNonEmptyString(
      manifest.deployedAt,
      "Deployment manifest deployedAt must be a non-empty string",
    );
  }

  if ("agentProfile" in manifest && Array.isArray(manifest.agentProfile)) {
    throw new Error("Deployment manifest agentProfile must be an object");
  }

  if ("agentProfile" in manifest && typeof manifest.agentProfile === "object" && manifest.agentProfile !== null) {
    const agentProfile = manifest.agentProfile as Record<string, unknown>;
    validateBaseExecuteObjectFields(
      agentProfile,
      BASE_EXECUTE_MANIFEST_AGENT_PROFILE_FIELDS,
      "Deployment manifest agentProfile must not include unsupported fields",
    );
    validateBaseExecuteNonEmptyString(
      agentProfile.roleLabel,
      "Deployment manifest agentProfile.roleLabel must be a non-empty string",
    );
    validateBaseExecuteNonEmptyString(
      agentProfile.metadataURI,
      "Deployment manifest agentProfile.metadataURI must be a non-empty string",
    );
  }

  if ("transactions" in manifest && Array.isArray(manifest.transactions)) {
    throw new Error("Deployment manifest transactions must be an object");
  }

  if ("transactions" in manifest && typeof manifest.transactions === "object" && manifest.transactions !== null) {
    validateBaseExecuteObjectFields(
      manifest.transactions,
      BASE_EXECUTE_MANIFEST_TRANSACTION_FIELDS,
      "Deployment manifest transactions must not include unsupported fields",
    );
  }

  const transactions = "transactions" in manifest && typeof manifest.transactions === "object" && manifest.transactions !== null
    ? manifest.transactions as Record<string, unknown>
    : undefined;

  for (const field of DEPLOYMENT_MANIFEST_REQUIRED_TRANSACTION_FIELDS) {
    if (transactions === undefined || typeof transactions[field] !== "string" || !isHash(transactions[field])) {
      throw new Error(`Deployment manifest ${field} transaction must be a valid hash`);
    }
  }

  if (transactions !== undefined) {
    for (const field of DEPLOYMENT_MANIFEST_OPTIONAL_TRANSACTION_FIELDS) {
      const value = transactions[field];
      if (value !== undefined && (typeof value !== "string" || !isHash(value))) {
        throw new Error(`Deployment manifest ${field} transaction must be a valid hash`);
      }
    }
  }

  if (
    !("rpcUrlEnv" in manifest) ||
    typeof manifest.rpcUrlEnv !== "string" ||
    !DOTENV_KEY_PATTERN.test(manifest.rpcUrlEnv)
  ) {
    throw new Error("Deployment manifest rpcUrlEnv must be a valid environment key");
  }

  if (!("explorerUrl" in manifest) || typeof manifest.explorerUrl !== "string" || !isBaseExecuteUrl(manifest.explorerUrl)) {
    throw new Error("Deployment manifest explorerUrl must be a valid URL");
  }

  if ("contracts" in manifest && Array.isArray(manifest.contracts)) {
    throw new Error("Deployment manifest contracts must be an object");
  }

  if ("contracts" in manifest && typeof manifest.contracts === "object" && manifest.contracts !== null) {
    validateBaseExecuteObjectFields(
      manifest.contracts,
      BASE_EXECUTE_MANIFEST_CONTRACT_FIELDS,
      "Deployment manifest contracts must not include unsupported fields",
    );
  }

  const contracts = "contracts" in manifest && typeof manifest.contracts === "object" && manifest.contracts !== null
    ? manifest.contracts as Record<string, unknown>
    : undefined;

  if (
    contracts === undefined ||
    typeof contracts.capabilityRegistry !== "string" ||
    !isAddress(contracts.capabilityRegistry)
  ) {
    throw new Error("Deployment manifest capability registry must be a valid address");
  }

  if (
    typeof contracts.reputationRegistry !== "string" ||
    !isAddress(contracts.reputationRegistry)
  ) {
    throw new Error("Deployment manifest reputation registry must be a valid address");
  }

  for (const field of DEPLOYMENT_MANIFEST_OPTIONAL_CONTRACT_FIELDS) {
    const value = contracts[field];
    if (value !== undefined && (typeof value !== "string" || !isAddress(value))) {
      throw new Error("Deployment manifest optional contract addresses must be valid when present");
    }
  }

  if (
    !("contracts" in manifest) ||
    typeof manifest.contracts !== "object" ||
    manifest.contracts === null ||
    !("agentAccount" in manifest.contracts) ||
    typeof manifest.contracts.agentAccount !== "string" ||
    !isAddress(manifest.contracts.agentAccount)
  ) {
    throw new Error("Deployment manifest agent account must be a valid address");
  }

  if (
    !("policyEngine" in manifest.contracts) ||
    typeof manifest.contracts.policyEngine !== "string" ||
    !isAddress(manifest.contracts.policyEngine)
  ) {
    throw new Error("Deployment manifest policy engine must be a valid address");
  }

  if (
    !("testTargetProtocol" in manifest.contracts) ||
    typeof manifest.contracts.testTargetProtocol !== "string" ||
    !isAddress(manifest.contracts.testTargetProtocol)
  ) {
    throw new Error("Deployment manifest smoke-test target must be a valid address");
  }

  if ("smokeTest" in manifest && Array.isArray(manifest.smokeTest)) {
    throw new Error("Deployment manifest smokeTest must be an object");
  }

  if ("smokeTest" in manifest && typeof manifest.smokeTest === "object" && manifest.smokeTest !== null) {
    validateBaseExecuteObjectFields(
      manifest.smokeTest,
      BASE_EXECUTE_MANIFEST_SMOKE_TEST_FIELDS,
      "Deployment manifest smokeTest must not include unsupported fields",
    );
  }

  if (
    !("smokeTest" in manifest) ||
    typeof manifest.smokeTest !== "object" ||
    manifest.smokeTest === null
  ) {
    throw new Error("Deployment manifest smokeTest must be an object");
  }

  if (
    !("capability" in manifest.smokeTest) ||
    typeof manifest.smokeTest.capability !== "string" ||
    !isHex(manifest.smokeTest.capability, { strict: true }) ||
    manifest.smokeTest.capability.length !== 66
  ) {
    throw new Error("Deployment manifest smoke-test capability must be bytes32");
  }
}

function isBaseExecuteUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function validateBaseExecuteConnectedChainId(chainId: unknown): asserts chainId is number {
  if (typeof chainId !== "number" || !Number.isInteger(chainId)) {
    throw new Error("Connected chain ID must be an integer");
  }
}

function validateBaseExecuteCliReport(report: unknown): asserts report is BaseExecuteCliReport {
  if (typeof report !== "object" || report === null || Array.isArray(report)) {
    throw new Error("CLI report must be an object");
  }

  if (!("mode" in report) || (report.mode !== "dry-run" && report.mode !== "send")) {
    throw new Error("CLI report mode must be dry-run or send");
  }

  if (!("allowed" in report) || typeof report.allowed !== "boolean") {
    throw new Error("CLI report allowed flag must be a boolean");
  }

  if (!("chainId" in report) || typeof report.chainId !== "number" || !Number.isInteger(report.chainId)) {
    throw new Error("CLI report chain ID must be an integer");
  }

  if (report.chainId <= 0) {
    throw new Error("CLI report chain ID must be a positive integer");
  }

  if (
    !("decision" in report) ||
    typeof report.decision !== "object" ||
    report.decision === null ||
    Array.isArray(report.decision)
  ) {
    throw new Error("CLI report decision must be an object");
  }

  if (!("allowed" in report.decision) || typeof report.decision.allowed !== "boolean") {
    throw new Error("CLI report decision allowed flag must be a boolean");
  }

  if (
    !("code" in report.decision) ||
    typeof report.decision.code !== "string" ||
    !isBaseExecutePolicyDecisionCode(report.decision.code)
  ) {
    throw new Error("CLI report decision code must be known");
  }

  validateBaseExecuteObjectFields(
    report.decision,
    BASE_EXECUTE_POLICY_DECISION_FIELDS,
    "CLI report decision must not include unsupported fields",
  );
  validateBaseExecutePolicyDecisionCodeConsistency(
    { allowed: report.decision.allowed, code: report.decision.code },
    "Allowed CLI report decision code must be Allowed",
    "Denied CLI report decision code must not be Allowed",
  );

  if (report.allowed !== report.decision.allowed) {
    throw new Error("CLI report allowed flag must match the policy decision");
  }

  if (!("transaction" in report)) {
    throw new Error("CLI report transaction must be present");
  }

  if (report.allowed && report.transaction === null) {
    throw new Error("Allowed CLI report must include a transaction");
  }

  if (!report.allowed && report.transaction !== null) {
    throw new Error("Denied CLI report must not include a transaction");
  }

  if (report.allowed) {
    validateBaseExecuteAllowedCliReportAddresses(report);
    validateBaseExecuteCliReportTransaction(report.transaction);

    if (report.transaction.to.toLowerCase() !== report.agent.toLowerCase()) {
      throw new Error("Allowed CLI report transaction recipient must match the agent address");
    }
  } else if (report.transaction !== null) {
    validateBaseExecuteCliReportTransaction(report.transaction);
  } else if ("agent" in report || "target" in report) {
    throw new Error("Denied CLI report must not include allowed execution identity");
  }

  if (!(report.allowed && report.mode === "send")) {
    validateBaseExecuteNonSentCliReport(report);
  }

  if (report.allowed && report.mode === "send") {
    validateBaseExecuteSentCliReport(report);
  }

  validateBaseExecuteCliReportFields(report);
}

function validateBaseExecuteAllowedCliReportAddresses(
  report: object,
): asserts report is object & { agent: Address; target: Address } {
  if (!("agent" in report) || typeof report.agent !== "string" || !isAddress(report.agent)) {
    throw new Error("Allowed CLI report must include a valid agent address");
  }

  if (!("target" in report) || typeof report.target !== "string" || !isAddress(report.target)) {
    throw new Error("Allowed CLI report must include a valid target address");
  }
}

function validateBaseExecuteCliReportTransaction(
  transaction: unknown,
): asserts transaction is BaseExecuteAllowedCliReport["transaction"] {
  if (
    typeof transaction !== "object" ||
    transaction === null ||
    Array.isArray(transaction)
  ) {
    throw new Error("CLI report transaction must be an object");
  }

  if (
    !("to" in transaction) ||
    typeof transaction.to !== "string" ||
    !isAddress(transaction.to)
  ) {
    throw new Error("CLI report transaction must include a valid recipient address");
  }

  if (!("value" in transaction) || typeof transaction.value !== "string") {
    throw new Error("CLI report transaction value must be a string");
  }

  if (!/^\d+$/u.test(transaction.value)) {
    throw new Error("CLI report transaction value must be a non-negative integer string");
  }

  if (!isBaseExecuteCanonicalDecimalString(transaction.value)) {
    throw new Error("CLI report transaction value must be a canonical non-negative integer string");
  }

  if (!("data" in transaction) || typeof transaction.data !== "string" || !isHex(transaction.data)) {
    throw new Error("CLI report transaction data must be hex calldata");
  }

  validateBaseExecuteObjectFields(
    transaction,
    BASE_EXECUTE_TRANSACTION_FIELDS,
    "CLI report transaction must not include unsupported fields",
  );
}

function validateBaseExecuteNonSentCliReport(report: object): void {
  if ("hash" in report || "explorerUrl" in report || "receipt" in report) {
    throw new Error("Non-sent CLI report must not include sent transaction evidence");
  }
}

function validateBaseExecuteCliReportFields(report: object): void {
  if (
    !("allowed" in report) ||
    typeof report.allowed !== "boolean" ||
    !("mode" in report) ||
    (report.mode !== "dry-run" && report.mode !== "send")
  ) {
    throw new Error("CLI report must not include unsupported fields");
  }

  const allowedFields = report.allowed
    ? report.mode === "send"
      ? BASE_EXECUTE_SENT_REPORT_FIELDS
      : BASE_EXECUTE_ALLOWED_REPORT_FIELDS
    : BASE_EXECUTE_DENIED_REPORT_FIELDS;

  if (Object.keys(report).some((field) => !allowedFields.has(field))) {
    throw new Error("CLI report must not include unsupported fields");
  }
}

function validateBaseExecuteSentCliReport(report: object): void {
  if (!("hash" in report) || typeof report.hash !== "string" || !isHash(report.hash)) {
    throw new Error("Sent CLI report hash must be a valid 32-byte hash");
  }

  if (!("explorerUrl" in report) || typeof report.explorerUrl !== "string" || !isBaseExecuteUrl(report.explorerUrl)) {
    throw new Error("Sent CLI report explorer URL must be a valid URL");
  }

  if (!isBaseExecuteExplorerUrlForHash(report.explorerUrl, report.hash)) {
    throw new Error("Sent CLI report explorer URL must reference the transaction hash");
  }

  if (
    !("receipt" in report) ||
    typeof report.receipt !== "object" ||
    report.receipt === null ||
    Array.isArray(report.receipt)
  ) {
    throw new Error("Sent CLI report receipt must be an object");
  }

  if (!("blockNumber" in report.receipt) || typeof report.receipt.blockNumber !== "string") {
    throw new Error("Sent CLI report receipt block number must be a string");
  }

  if (!/^\d+$/u.test(report.receipt.blockNumber)) {
    throw new Error("Sent CLI report receipt block number must be a non-negative integer string");
  }

  if (!isBaseExecuteCanonicalDecimalString(report.receipt.blockNumber)) {
    throw new Error("Sent CLI report receipt block number must be a canonical non-negative integer string");
  }

  if (!("status" in report.receipt) || (report.receipt.status !== "success" && report.receipt.status !== "reverted")) {
    throw new Error("Sent CLI report receipt status must be success or reverted");
  }

  validateBaseExecuteObjectFields(
    report.receipt,
    BASE_EXECUTE_RECEIPT_FIELDS,
    "Sent CLI report receipt must not include unsupported fields",
  );
}

function validateBaseExecuteObjectFields(
  value: object,
  allowedFields: ReadonlySet<string>,
  message: string,
): void {
  if (Object.keys(value).some((field) => !allowedFields.has(field))) {
    throw new Error(message);
  }
}

function validateBaseExecuteNonEmptyString(value: unknown, message: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(message);
  }
}

function validateBaseExecutePolicyDecisionCodeConsistency(
  decision: PolicyDecision,
  allowedMessage: string,
  deniedMessage: string,
): void {
  if (decision.allowed && decision.code !== "Allowed") {
    throw new Error(allowedMessage);
  }

  if (!decision.allowed && decision.code === "Allowed") {
    throw new Error(deniedMessage);
  }
}

function isBaseExecuteExplorerUrlForHash(explorerUrl: string, hash: string): boolean {
  return new URL(explorerUrl).href.toLowerCase().includes(hash.toLowerCase());
}

function isBaseExecuteCanonicalDecimalString(value: string): boolean {
  return value === "0" || !value.startsWith("0");
}

function validateBaseExecuteOptions(options: unknown): asserts options is BaseExecuteCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Runner options must be an object");
  }
}

function validateBaseExecuteArgv(argv: unknown): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) {
    throw new Error("Argument vector must be an array of strings");
  }
}

function validateBaseExecuteOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") {
    throw new Error("Output writer must be a function");
  }
}

function validateBaseExecuteDotEnvLoader(
  loadDotEnv: unknown,
): asserts loadDotEnv is (path: string, env: Record<string, string | undefined>) => void {
  if (typeof loadDotEnv !== "function") {
    throw new Error("Dotenv loader must be a function");
  }
}

function validateBaseExecuteEnv(env: unknown): asserts env is Record<string, string | undefined> {
  if (typeof env !== "object" || env === null || Array.isArray(env)) {
    throw new Error("Environment must be an object");
  }
}

function validateBaseExecuteEnvValues(env: Record<string, string | undefined>): void {
  if (Object.values(env).some((value) => value !== undefined && typeof value !== "string")) {
    throw new Error("Environment values must be strings when defined");
  }
}

function validateBaseExecuteEnvKey(key: unknown): asserts key is string {
  if (typeof key !== "string" || !DOTENV_KEY_PATTERN.test(key)) {
    throw new Error("Environment key must be a valid environment key");
  }
}

function validateBaseExecuteExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") {
    throw new Error("Exit code setter must be a function");
  }
}

function validateBaseExecuteManifestReader(
  readManifest: unknown,
): asserts readManifest is (path: string) => Promise<DeploymentManifest> {
  if (typeof readManifest !== "function") {
    throw new Error("Manifest reader must be a function");
  }
}

function validateBaseExecutePublicClientFactory(
  createPublicClient: unknown,
): asserts createPublicClient is (rpcUrl: string) => BaseExecutePublicClient {
  if (typeof createPublicClient !== "function") {
    throw new Error("Public client factory must be a function");
  }
}

function validateBaseExecuteActionFactory(
  createAction: unknown,
): asserts createAction is (manifest: DeploymentManifest) => AgentAction {
  if (typeof createAction !== "function") {
    throw new Error("Action factory must be a function");
  }
}

function validateBaseExecutePolicySimulatorFactory(
  createPolicySimulator: unknown,
): asserts createPolicySimulator is (client: BaseExecutePublicClient, manifest: DeploymentManifest) => SimulatePolicy {
  if (typeof createPolicySimulator !== "function") {
    throw new Error("Policy simulator factory must be a function");
  }
}

function validateBaseExecutePolicySimulator(simulatePolicy: unknown): asserts simulatePolicy is SimulatePolicy {
  if (typeof simulatePolicy !== "function") {
    throw new Error("Policy simulator must be a function");
  }
}

function validateBaseExecuteTransactionBuilder(
  buildTransaction: unknown,
): asserts buildTransaction is typeof buildExecuteTransaction {
  if (typeof buildTransaction !== "function") {
    throw new Error("Transaction builder must be a function");
  }
}

function validateBaseExecuteAccountFactory(
  createAccount: unknown,
): asserts createAccount is (privateKey: Hex) => BaseExecuteAccount {
  if (typeof createAccount !== "function") {
    throw new Error("Account factory must be a function");
  }
}

function validateBaseExecuteWalletClientFactory(
  createWalletClient: unknown,
): asserts createWalletClient is (options: BaseExecuteWalletClientOptions) => BaseExecuteWalletClient {
  if (typeof createWalletClient !== "function") {
    throw new Error("Wallet client factory must be a function");
  }
}

function validateBaseExecutePublicClient(client: unknown): asserts client is BaseExecutePublicClient {
  if (
    typeof client !== "object" ||
    client === null ||
    !("getChainId" in client) ||
    typeof client.getChainId !== "function" ||
    !("readContract" in client) ||
    typeof client.readContract !== "function" ||
    !("waitForTransactionReceipt" in client) ||
    typeof client.waitForTransactionReceipt !== "function"
  ) {
    throw new Error("Public client must include RPC methods");
  }
}

function validateBaseExecuteAccount(account: unknown): asserts account is BaseExecuteAccount {
  if (
    typeof account !== "object" ||
    account === null ||
    !("address" in account) ||
    typeof account.address !== "string" ||
    !isAddress(account.address)
  ) {
    throw new Error("Send account must include a valid address");
  }
}

function validateBaseExecuteWalletClient(client: unknown): asserts client is BaseExecuteWalletClient {
  if (
    typeof client !== "object" ||
    client === null ||
    !("sendTransaction" in client) ||
    typeof client.sendTransaction !== "function"
  ) {
    throw new Error("Wallet client must include sendTransaction");
  }
}

function validateBaseExecuteTransactionResult(result: unknown): asserts result is BuildExecuteTransactionResult {
  if (
    typeof result !== "object" ||
    result === null ||
    Array.isArray(result)
  ) {
    throw new Error("Transaction result must be an object");
  }

  if (
    !("allowed" in result) ||
    typeof result.allowed !== "boolean"
  ) {
    throw new Error("Transaction result allowed flag must be a boolean");
  }

  if (
    !("decision" in result) ||
    typeof result.decision !== "object" ||
    result.decision === null ||
    !("allowed" in result.decision) ||
    typeof result.decision.allowed !== "boolean"
  ) {
    throw new Error("Transaction result decision allowed flag must be a boolean");
  }

  if (
    !("code" in result.decision) ||
    typeof result.decision.code !== "string" ||
    !isBaseExecutePolicyDecisionCode(result.decision.code)
  ) {
    throw new Error("Transaction result decision code must be known");
  }

  validateBaseExecuteObjectFields(
    result.decision,
    BASE_EXECUTE_POLICY_DECISION_FIELDS,
    "Transaction result decision must not include unsupported fields",
  );
  validateBaseExecutePolicyDecisionCodeConsistency(
    { allowed: result.decision.allowed, code: result.decision.code },
    "Allowed transaction result decision code must be Allowed",
    "Denied transaction result decision code must not be Allowed",
  );

  if (result.allowed !== result.decision.allowed) {
    throw new Error("Transaction result allowed flag must match the policy decision");
  }

  validateBaseExecuteObjectFields(
    result,
    BASE_EXECUTE_TRANSACTION_RESULT_FIELDS,
    "Transaction result must not include unsupported fields",
  );
}

function isBaseExecutePolicyDecisionCode(value: string): value is PolicyDecision["code"] {
  return POLICY_DECISION_CODES.includes(value as PolicyDecision["code"]);
}

function validateBaseExecuteTransaction(transaction: unknown): asserts transaction is {
  to: Address;
  value: bigint;
  data: Hex;
} {
  if (
    typeof transaction !== "object" ||
    transaction === null ||
    Array.isArray(transaction)
  ) {
    throw new Error("Execution transaction must be an object");
  }

  if (
    !("to" in transaction) ||
    typeof transaction.to !== "string" ||
    !isAddress(transaction.to)
  ) {
    throw new Error("Execution transaction must include a valid recipient address");
  }

  if (!("value" in transaction) || typeof transaction.value !== "bigint") {
    throw new Error("Execution transaction value must be a bigint");
  }

  if (!("data" in transaction) || typeof transaction.data !== "string" || !isHex(transaction.data)) {
    throw new Error("Execution transaction data must be hex calldata");
  }

  validateBaseExecuteObjectFields(
    transaction,
    BASE_EXECUTE_TRANSACTION_FIELDS,
    "Execution transaction must not include unsupported fields",
  );
}

function validateBaseExecuteAction(action: unknown): asserts action is AgentAction {
  if (
    typeof action !== "object" ||
    action === null ||
    Array.isArray(action)
  ) {
    throw new Error("Execution action must be an object");
  }

  if (
    !("capability" in action) ||
    typeof action.capability !== "string" ||
    !isHex(action.capability, { strict: true }) ||
    action.capability.length !== 66
  ) {
    throw new Error("Execution action capability must be bytes32");
  }

  if (
    !("target" in action) ||
    typeof action.target !== "string" ||
    !isAddress(action.target)
  ) {
    throw new Error("Execution action target must be a valid address");
  }

  if (!("value" in action) || typeof action.value !== "bigint") {
    throw new Error("Execution action value must be a bigint");
  }

  if (!("data" in action) || typeof action.data !== "string" || !isHex(action.data, { strict: true })) {
    throw new Error("Execution action data must be hex calldata");
  }

  if (!("usesBorrowing" in action) || typeof action.usesBorrowing !== "boolean") {
    throw new Error("Execution action borrowing flag must be a boolean");
  }

  validateBaseExecuteObjectFields(
    action,
    BASE_EXECUTE_ACTION_FIELDS,
    "Execution action must not include unsupported fields",
  );
}

function validateBaseExecuteSentHash(hash: unknown): asserts hash is Hex {
  if (typeof hash !== "string" || !isHash(hash)) {
    throw new Error("Sent transaction hash must be a valid 32-byte hash");
  }
}

function validateBaseExecuteReceipt(receipt: unknown): asserts receipt is {
  blockNumber: bigint;
  status: "success" | "reverted";
} {
  if (
    typeof receipt !== "object" ||
    receipt === null ||
    Array.isArray(receipt)
  ) {
    throw new Error("Transaction receipt must be an object");
  }

  if (
    !("blockNumber" in receipt) ||
    typeof receipt.blockNumber !== "bigint"
  ) {
    throw new Error("Transaction receipt block number must be a bigint");
  }

  if (!("status" in receipt) || (receipt.status !== "success" && receipt.status !== "reverted")) {
    throw new Error("Transaction receipt status must be success or reverted");
  }

  validateBaseExecuteObjectFields(
    receipt,
    BASE_EXECUTE_RECEIPT_FIELDS,
    "Transaction receipt must not include unsupported fields",
  );
}

export function formatBaseExecuteCliUsage(): string {
  return [
    "Usage: npm run base:execute -- [options]",
    "",
    "Options:",
    `  --manifest <path>  Deployment manifest path (default: ${DEFAULT_MANIFEST_PATH})`,
    "  --send             Send transaction after policy approval (default: dry-run)",
    "  -h, --help         Show this help message",
  ].join("\n");
}

export function isBaseExecuteCliHelpRequest(argv: readonly string[]): boolean {
  return argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h");
}

export function readRequiredBaseExecuteEnv(
  env: Record<string, string | undefined>,
  key: string,
  message = `${key} is required`,
): string {
  validateBaseExecuteEnv(env);
  validateBaseExecuteEnvValues(env);
  validateBaseExecuteEnvKey(key);
  const value = env[key]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(message);
  }

  return value;
}

export function parseBaseExecuteCliArgs(argv: readonly string[]): BaseExecuteCliArgs {
  let send = false;
  let manifestPath = DEFAULT_MANIFEST_PATH;
  let hasManifest = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (arg === "--send") {
      if (send) throw new Error("Duplicate argument: --send");
      send = true;
      continue;
    }

    if (arg === "--manifest") {
      if (hasManifest) throw new Error("Duplicate argument: --manifest");
      const value = argv[index + 1];
      const manifestValue = value?.trim();
      if (manifestValue === undefined || manifestValue.length === 0 || manifestValue.startsWith("--")) {
        throw new Error("--manifest requires a value");
      }

      hasManifest = true;
      manifestPath = manifestValue;
      index += 1;
      continue;
    }

    if (arg.startsWith("--manifest=")) {
      if (hasManifest) throw new Error("Duplicate argument: --manifest");
      const value = arg.slice("--manifest=".length).trim();
      if (value.length === 0 || value.startsWith("--")) {
        throw new Error("--manifest requires a value");
      }

      hasManifest = true;
      manifestPath = value;
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  return { send, manifestPath };
}

export function loadBaseExecuteDotEnv(
  path: string,
  env: Record<string, string | undefined>,
  readText = readBaseExecuteDotEnvFile,
): void {
  let contents: string;
  try {
    contents = readText(path);
  } catch {
    return;
  }

  applyBaseExecuteDotEnv(contents, env);
}

function readBaseExecuteDotEnvFile(path: string): string {
  return readFileSync(path, "utf8");
}

export function applyBaseExecuteDotEnv(contents: string, env: Record<string, string | undefined>): void {
  for (const [key, value] of parseBaseExecuteDotEnv(contents)) {
    if (env[key] === undefined) {
      env[key] = value;
    }
  }
}

export function parseBaseExecuteDotEnv(contents: string): readonly (readonly [string, string])[] {
  const entries: [string, string][] = [];

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator === -1) continue;

    const rawKey = line.slice(0, separator).trim();
    if (rawKey === "export") continue;

    const exportedKey = rawKey.match(/^export\s+(.+)$/u);
    const key = exportedKey?.[1]?.trim() ?? rawKey;
    const value = line.slice(separator + 1).trim();
    if (DOTENV_KEY_PATTERN.test(key)) {
      entries.push([key, stripQuotes(value)]);
    }
  }

  return entries;
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

export function isBaseExecuteDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) {
    throw new Error("Direct-run argv must be an array of strings");
  }

  const scriptPath = argv[1];
  return scriptPath !== undefined && fileURLToPath(moduleUrl) === resolve(scriptPath);
}
