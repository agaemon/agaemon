import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createPublicClient as createViemPublicClient,
  createWalletClient as createViemWalletClient,
  formatEther,
  http,
  isAddress,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import { createOnChainPolicySimulator, normalizePrivateKey } from "../../base/execution.js";
import { readDeploymentManifest, requirePayoutRuleAdapter } from "../../base/deploymentManifest.js";
import { createPayoutRuleAction, PAYOUT_RULE_ABI } from "../../payouts/rule.js";
import { buildExecuteTransaction } from "../../transactions/builder.js";
import {
  requireReportBoolean,
  requireReportNumber,
  requireReportObject,
  requireReportString,
  validateReportDecision,
  validateReportReceipt,
  validateReportTransaction,
} from "../../valueTransfer/reportValidation.js";

const DEFAULT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";
const DEFAULT_AMOUNT_ETH = "0.000001";

export interface PayoutsPayoutCliArgs {
  send: boolean;
  manifestPath: string;
  recipient?: string | undefined;
  amountEth: string;
}

export interface PayoutsPayoutCliOptions {
  argv?: readonly string[];
  env?: Record<string, string | undefined>;
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  loadDotEnv?: (path: string, env: Record<string, string | undefined>) => void;
  readDeploymentManifest?: (path: string) => Promise<PayoutManifest>;
  requireAdapter?: (manifest: PayoutManifest) => string;
  createPublicClient?: (rpcUrl: string) => PayoutPublicClient;
  readPayoutRule?: (params: PayoutRuleReadParams) => Promise<PayoutRule>;
  buildPayoutTransaction?: (params: PayoutBuildParams) => Promise<PayoutBuildResult>;
  simulateExecution?: (params: PayoutExecutionSimulationParams) => Promise<boolean>;
  createWalletAccount?: (privateKey: string) => unknown;
  createWalletClient?: (params: PayoutWalletClientParams) => PayoutWalletClient;
}

interface PayoutManifest {
  chainId: number;
  rpcUrlEnv: string;
  explorerUrl: string;
  owner: string;
  contracts: { agentAccount: string };
}

interface PayoutPublicClient {
  getChainId: () => Promise<number>;
  readContract?: (params: unknown) => Promise<PayoutRule>;
  call?: (params: unknown) => Promise<unknown>;
  waitForTransactionReceipt?: (params: { hash: `0x${string}` | string }) => Promise<{ blockNumber: bigint; status: string }>;
}

interface PayoutWalletClient {
  sendTransaction: (params: unknown) => Promise<`0x${string}` | string>;
}

interface PayoutWalletClientParams {
  account: unknown;
  rpcUrl: string;
}

type PayoutRule = readonly [bigint, bigint, boolean];

interface PayoutRuleReadParams {
  publicClient: PayoutPublicClient;
  adapter: string;
  manifest: PayoutManifest;
  recipient: string;
}

interface PayoutBuildParams {
  manifest: PayoutManifest;
  publicClient: unknown;
  adapter: string;
  recipient: string;
  amountWei: bigint;
}

interface PayoutBuildResult {
  allowed: boolean;
  decision: unknown;
  transaction: null | { to: `0x${string}` | string; value: bigint; data: `0x${string}` | string };
}

interface PayoutExecutionSimulationParams {
  publicClient: PayoutPublicClient;
  manifest: PayoutManifest;
  transaction: { to: `0x${string}` | string; value: bigint; data: `0x${string}` | string };
}

if (isPayoutsPayoutDirectRun(import.meta.url, process.argv)) {
  await runPayoutsPayoutCli();
}

export async function runPayoutsPayoutCli(options: PayoutsPayoutCliOptions = {}): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const env = options.env ?? process.env;
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const loadDotEnv = options.loadDotEnv ?? loadPayoutsPayoutDotEnv;
  const readManifest = options.readDeploymentManifest ?? readDeploymentManifest;
  const readAdapter = options.requireAdapter ?? ((manifest: PayoutManifest) =>
    requirePayoutRuleAdapter(manifest as Parameters<typeof requirePayoutRuleAdapter>[0]));
  const createClient = options.createPublicClient ?? ((rpcUrl: string) =>
    createViemPublicClient({ chain: baseSepolia, transport: http(rpcUrl) }) as PayoutPublicClient);
  const readRule = options.readPayoutRule ?? readDefaultPayoutRule;
  const buildPayout = options.buildPayoutTransaction ?? buildDefaultPayoutTransaction;
  const simulateExecution = options.simulateExecution ?? simulateDefaultExecution;
  const createAccount = options.createWalletAccount ?? ((privateKey: string) =>
    privateKeyToAccount(normalizePrivateKey(privateKey)));
  const createWallet = options.createWalletClient ?? ((params: PayoutWalletClientParams) =>
    createViemWalletClient({
      account: params.account as ReturnType<typeof privateKeyToAccount>,
      chain: baseSepolia,
      transport: http(params.rpcUrl),
    }) as PayoutWalletClient);

  validateOutputWriter(writeOutput);
  validateArgv(argv);
  const args = parsePayoutsPayoutCliArgs(argv);
  validateEnv(env);
  validateDotEnvLoader(loadDotEnv);
  validateManifestReader(readManifest);
  validateAdapterReader(readAdapter);
  validatePublicClientFactory(createClient);
  validatePayoutRuleReader(readRule);
  validatePayoutBuilder(buildPayout);
  validateExecutionSimulator(simulateExecution);

  loadDotEnv(".env", env);
  const manifest = await readManifest(args.manifestPath);
  const rpcUrl = env[manifest.rpcUrlEnv];
  if (rpcUrl === undefined || rpcUrl.length === 0) throw new Error(`${manifest.rpcUrlEnv} is required`);

  const recipient = args.recipient ?? env.PAYOUT_RECIPIENT ?? env.PAYMENT_RECIPIENT ?? manifest.owner;
  if (!isAddress(recipient)) throw new Error("--recipient must be an address");

  const amountWei = parseEther(args.amountEth);
  const adapter = readAdapter(manifest);
  const publicClient = createClient(rpcUrl);
  const chainId = await publicClient.getChainId();
  if (chainId !== manifest.chainId) throw new Error(`Connected to chain ${chainId}, expected ${manifest.chainId}`);

  const rule = await readRule({ publicClient, adapter, manifest, recipient });
  const result = await buildPayout({ manifest, publicClient, adapter, recipient, amountWei });
  const baseOutput = {
    mode: args.send ? "send" : "dry-run",
    chainId,
    agent: manifest.contracts.agentAccount,
    adapter,
    recipient,
    amountEth: formatEther(amountWei),
    rule: formatRule(rule),
    allowed: result.allowed,
    decision: result.decision,
    transaction: formatTransaction(result.transaction),
  };

  if (!result.allowed || result.transaction === null) {
    validatePayoutReport(baseOutput);
    writeOutput(JSON.stringify(baseOutput, null, 2));
    validateExitCodeSetter(setExitCode);
    setExitCode(1);
    return;
  }

  const executionPassed = await simulateExecution({ publicClient, manifest, transaction: result.transaction });
  if (!executionPassed) {
    const rejectedOutput = { ...baseOutput, executionSimulation: "rejected" };
    validatePayoutReport(rejectedOutput);
    writeOutput(JSON.stringify(rejectedOutput, null, 2));
    validateExitCodeSetter(setExitCode);
    setExitCode(1);
    return;
  }

  const simulatedOutput = { ...baseOutput, executionSimulation: "passed" };
  if (!args.send) {
    validatePayoutReport(simulatedOutput);
    writeOutput(JSON.stringify(simulatedOutput, null, 2));
    return;
  }

  const rawPrivateKey = env.PRIVATE_KEY;
  if (rawPrivateKey === undefined || rawPrivateKey.length === 0) {
    throw new Error("PRIVATE_KEY is required when --send is used");
  }

  validateWalletAccountFactory(createAccount);
  validateWalletClientFactory(createWallet);
  const account = createAccount(rawPrivateKey);
  const walletClient = createWallet({ account, rpcUrl });
  const hash = await walletClient.sendTransaction({
    account,
    chain: baseSepolia,
    to: result.transaction.to,
    value: result.transaction.value,
    data: result.transaction.data,
  });
  if (typeof publicClient.waitForTransactionReceipt !== "function") {
    throw new Error("Public client must support transaction receipt waits when --send is used");
  }
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const sentOutput = {
    ...simulatedOutput,
    hash,
    explorerUrl: `${manifest.explorerUrl}/tx/${hash}`,
    receipt: {
      blockNumber: receipt.blockNumber.toString(),
      status: receipt.status,
    },
  };
  validatePayoutReport(sentOutput);
  writeOutput(JSON.stringify(sentOutput, null, 2));
}

export function parsePayoutsPayoutCliArgs(argv: readonly string[]): PayoutsPayoutCliArgs {
  validateArgv(argv);
  const values = parseValues(argv, ["--manifest", "--recipient", "--amount-eth"], ["--send"]);
  return {
    send: values.booleans.has("--send"),
    manifestPath: values.options.get("--manifest") ?? DEFAULT_MANIFEST_PATH,
    recipient: values.options.get("--recipient"),
    amountEth: values.options.get("--amount-eth") ?? DEFAULT_AMOUNT_ETH,
  };
}

export function isPayoutsPayoutDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

export function loadPayoutsPayoutDotEnv(path: string, env: Record<string, string | undefined>): void {
  validateEnv(env);
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch {
    return;
  }

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = stripQuotes(line.slice(separator + 1).trim());
    if (key.length > 0 && env[key] === undefined) env[key] = value;
  }
}

async function readDefaultPayoutRule(params: PayoutRuleReadParams): Promise<PayoutRule> {
  if (typeof params.publicClient.readContract !== "function") throw new Error("Public client must support payout rule reads");
  return params.publicClient.readContract({
    address: params.adapter,
    abi: PAYOUT_RULE_ABI,
    functionName: "payoutRules",
    args: [params.manifest.contracts.agentAccount, params.recipient],
  });
}

async function buildDefaultPayoutTransaction(params: PayoutBuildParams): Promise<PayoutBuildResult> {
  return buildExecuteTransaction({
    agent: params.manifest.contracts.agentAccount as `0x${string}`,
    action: createPayoutRuleAction({
      adapter: params.adapter as `0x${string}`,
      recipient: params.recipient as `0x${string}`,
      amountWei: params.amountWei,
    }),
    simulatePolicy: createOnChainPolicySimulator(
      params.publicClient as Parameters<typeof createOnChainPolicySimulator>[0],
      params.manifest as Parameters<typeof createOnChainPolicySimulator>[1],
    ),
  });
}

async function simulateDefaultExecution(params: PayoutExecutionSimulationParams): Promise<boolean> {
  if (typeof params.publicClient.call !== "function") throw new Error("Public client must support calls for payout execution simulation");
  try {
    await params.publicClient.call({
      account: params.manifest.owner,
      to: params.transaction.to,
      value: params.transaction.value,
      data: params.transaction.data,
    });
    return true;
  } catch {
    return false;
  }
}

function formatRule(rule: PayoutRule): { maxActionValue: string; maxDailyValue: string; enabled: boolean } {
  return { maxActionValue: rule[0].toString(), maxDailyValue: rule[1].toString(), enabled: rule[2] };
}

function formatTransaction(transaction: PayoutBuildResult["transaction"]): null | { to: string; value: string; data: string } {
  return transaction === null ? null : { to: transaction.to, value: transaction.value.toString(), data: transaction.data };
}

function validatePayoutReport(output: unknown): void {
  const report = requireReportObject(output, "Payout report must be an object");
  requireReportString(report.mode, "Payout report mode must be a string");
  requireReportNumber(report.chainId, "Payout report chainId must be a number");
  requireReportString(report.agent, "Payout report agent must be a string");
  requireReportString(report.adapter, "Payout report adapter must be a string");
  requireReportString(report.recipient, "Payout report recipient must be a string");
  requireReportString(report.amountEth, "Payout report amountEth must be a string");
  validatePayoutRule(report.rule, "Payout report rule");
  requireReportBoolean(report.allowed, "Payout report allowed must be a boolean");
  validateReportDecision(report.decision, "Payout report");
  validateReportTransaction(report.transaction, "Payout");
  if (report.executionSimulation !== undefined) {
    requireReportString(report.executionSimulation, "Payout report executionSimulation must be a string");
  }
  if (report.hash !== undefined) {
    requireReportString(report.hash, "Payout report hash must be a string");
    requireReportString(report.explorerUrl, "Payout report explorerUrl must be a string");
    validateReportReceipt(report.receipt, "Payout");
  }
}

function validatePayoutRule(value: unknown, label: string): void {
  const rule = requireReportObject(value, `${label} must be an object`);
  requireReportString(rule.maxActionValue, `${label} maxActionValue must be a string`);
  requireReportString(rule.maxDailyValue, `${label} maxDailyValue must be a string`);
  requireReportBoolean(rule.enabled, `${label} enabled must be a boolean`);
}

function parseValues(
  argv: readonly string[],
  valueFlags: readonly string[],
  booleanFlags: readonly string[],
): { options: Map<string, string>; booleans: Set<string> } {
  const options = new Map<string, string>();
  const booleans = new Set<string>();
  const valuePattern = new RegExp(`^(${valueFlags.join("|")})=(.*)$`, "u");

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (booleanFlags.includes(arg)) {
      if (booleans.has(arg)) throw new Error(`Duplicate argument: ${arg}`);
      booleans.add(arg);
      continue;
    }
    if (valueFlags.includes(arg)) {
      setOption(options, arg, argv[index + 1]);
      index += 1;
      continue;
    }
    const equals = arg.match(valuePattern);
    if (equals !== null) {
      setOption(options, equals[1]!, equals[2]!);
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }
  return { options, booleans };
}

function setOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function validateOptions(options: unknown): asserts options is PayoutsPayoutCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) throw new Error("Payouts payout options must be an object");
}

function validateArgv(argv: unknown, message = "CLI argv must be an array of strings"): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) throw new Error(message);
}

function validateEnv(env: unknown): asserts env is Record<string, string | undefined> {
  if (typeof env !== "object" || env === null || Array.isArray(env)) throw new Error("Environment must be an object");
  for (const value of Object.values(env)) {
    if (value !== undefined && typeof value !== "string") throw new Error("Environment values must be strings when defined");
  }
}

function validateOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") throw new Error("Exit code setter must be a function");
}

function validateDotEnvLoader(loadDotEnv: unknown): asserts loadDotEnv is (path: string, env: Record<string, string | undefined>) => void {
  if (typeof loadDotEnv !== "function") throw new Error("Dotenv loader must be a function");
}

function validateManifestReader(readManifest: unknown): asserts readManifest is (path: string) => Promise<PayoutManifest> {
  if (typeof readManifest !== "function") throw new Error("Deployment manifest reader must be a function");
}

function validateAdapterReader(readAdapter: unknown): asserts readAdapter is (manifest: PayoutManifest) => string {
  if (typeof readAdapter !== "function") throw new Error("Payout adapter reader must be a function");
}

function validatePublicClientFactory(createClient: unknown): asserts createClient is (rpcUrl: string) => PayoutPublicClient {
  if (typeof createClient !== "function") throw new Error("Public client factory must be a function");
}

function validatePayoutRuleReader(readRule: unknown): asserts readRule is (params: PayoutRuleReadParams) => Promise<PayoutRule> {
  if (typeof readRule !== "function") throw new Error("Payout rule reader must be a function");
}

function validatePayoutBuilder(buildPayout: unknown): asserts buildPayout is (params: PayoutBuildParams) => Promise<PayoutBuildResult> {
  if (typeof buildPayout !== "function") throw new Error("Payout transaction builder must be a function");
}

function validateExecutionSimulator(simulateExecution: unknown): asserts simulateExecution is (params: PayoutExecutionSimulationParams) => Promise<boolean> {
  if (typeof simulateExecution !== "function") throw new Error("Payout execution simulator must be a function");
}

function validateWalletAccountFactory(createAccount: unknown): asserts createAccount is (privateKey: string) => unknown {
  if (typeof createAccount !== "function") throw new Error("Wallet account factory must be a function");
}

function validateWalletClientFactory(createWallet: unknown): asserts createWallet is (params: PayoutWalletClientParams) => PayoutWalletClient {
  if (typeof createWallet !== "function") throw new Error("Wallet client factory must be a function");
}

function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
