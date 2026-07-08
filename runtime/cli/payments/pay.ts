import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createPublicClient as createViemPublicClient, createWalletClient as createViemWalletClient, formatEther, http, isAddress, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import { createOnChainPolicySimulator, normalizePrivateKey } from "../../base/execution.js";
import { readDeploymentManifest, requireTreasuryPaymentAdapter } from "../../base/deploymentManifest.js";
import { buildExecuteTransaction } from "../../transactions/builder.js";
import { createTreasuryPaymentAction } from "../../payments/treasury.js";
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

export interface PaymentsPayCliArgs {
  send: boolean;
  manifestPath: string;
  recipient?: string | undefined;
  amountEth: string;
}

export interface PaymentsPayCliOptions {
  argv?: readonly string[];
  env?: Record<string, string | undefined>;
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  loadDotEnv?: (path: string, env: Record<string, string | undefined>) => void;
  readDeploymentManifest?: (path: string) => Promise<PaymentManifest>;
  requireAdapter?: (manifest: PaymentManifest) => string;
  createPublicClient?: (rpcUrl: string) => PaymentPublicClient;
  buildPaymentTransaction?: (params: PaymentBuildParams) => Promise<PaymentBuildResult>;
  createWalletAccount?: (privateKey: string) => unknown;
  createWalletClient?: (params: PaymentWalletClientParams) => PaymentWalletClient;
}

interface PaymentManifest {
  chainId: number;
  rpcUrlEnv: string;
  explorerUrl: string;
  owner: string;
  contracts: { agentAccount: string };
}

interface PaymentPublicClient {
  getChainId: () => Promise<number>;
  waitForTransactionReceipt?: (params: { hash: `0x${string}` | string }) => Promise<{ blockNumber: bigint; status: string }>;
}

interface PaymentWalletClient {
  sendTransaction: (params: unknown) => Promise<`0x${string}` | string>;
}

interface PaymentWalletClientParams {
  account: unknown;
  rpcUrl: string;
}

interface PaymentBuildParams {
  manifest: PaymentManifest;
  publicClient: unknown;
  adapter: string;
  recipient: string;
  amountWei: bigint;
}

interface PaymentBuildResult {
  allowed: boolean;
  decision: unknown;
  transaction: null | { to: `0x${string}` | string; value: bigint; data: `0x${string}` | string };
}

if (isPaymentsPayDirectRun(import.meta.url, process.argv)) {
  await runPaymentsPayCli();
}

export async function runPaymentsPayCli(options: PaymentsPayCliOptions = {}): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const env = options.env ?? process.env;
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const loadDotEnv = options.loadDotEnv ?? loadPaymentsPayDotEnv;
  const readManifest = options.readDeploymentManifest ?? readDeploymentManifest;
  const readAdapter = options.requireAdapter ?? ((manifest: PaymentManifest) =>
    requireTreasuryPaymentAdapter(manifest as Parameters<typeof requireTreasuryPaymentAdapter>[0]));
  const createClient = options.createPublicClient ?? ((rpcUrl: string) =>
    createViemPublicClient({ chain: baseSepolia, transport: http(rpcUrl) }) as PaymentPublicClient);
  const buildPayment = options.buildPaymentTransaction ?? buildDefaultPaymentTransaction;
  const createAccount = options.createWalletAccount ?? ((privateKey: string) =>
    privateKeyToAccount(normalizePrivateKey(privateKey)));
  const createWallet = options.createWalletClient ?? ((params: PaymentWalletClientParams) =>
    createViemWalletClient({
      account: params.account as ReturnType<typeof privateKeyToAccount>,
      chain: baseSepolia,
      transport: http(params.rpcUrl),
    }) as PaymentWalletClient);

  validateOutputWriter(writeOutput);
  validateArgv(argv);
  const args = parsePaymentsPayCliArgs(argv);
  validateEnv(env);
  validateDotEnvLoader(loadDotEnv);
  validateManifestReader(readManifest);
  validateAdapterReader(readAdapter);
  validatePublicClientFactory(createClient);
  validatePaymentBuilder(buildPayment);

  loadDotEnv(".env", env);
  const manifest = await readManifest(args.manifestPath);
  const rpcUrl = env[manifest.rpcUrlEnv];
  if (rpcUrl === undefined || rpcUrl.length === 0) throw new Error(`${manifest.rpcUrlEnv} is required`);

  const recipient = args.recipient ?? manifest.owner;
  if (!isAddress(recipient)) throw new Error("--recipient must be an address");

  const amountWei = parseEther(args.amountEth);
  const adapter = readAdapter(manifest);

  const publicClient = createClient(rpcUrl);
  const chainId = await publicClient.getChainId();
  if (chainId !== manifest.chainId) throw new Error(`Connected to chain ${chainId}, expected ${manifest.chainId}`);

  const result = await buildPayment({
    manifest,
    publicClient,
    adapter,
    recipient,
    amountWei,
  });

  const baseOutput = {
    mode: args.send ? "send" : "dry-run",
    chainId,
    agent: manifest.contracts.agentAccount,
    adapter,
    recipient,
    amountEth: formatEther(amountWei),
    allowed: result.allowed,
    decision: result.decision,
    transaction:
      result.transaction === null
        ? null
        : {
            to: result.transaction.to,
            value: result.transaction.value.toString(),
            data: result.transaction.data,
          },
  };

  if (!result.allowed || result.transaction === null) {
    validatePaymentsPayReport(baseOutput);
    writeOutput(JSON.stringify(baseOutput, null, 2));
    validateExitCodeSetter(setExitCode);
    setExitCode(1);
    return;
  }

  if (!args.send) {
    validatePaymentsPayReport(baseOutput);
    writeOutput(JSON.stringify(baseOutput, null, 2));
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
    ...baseOutput,
    hash,
    explorerUrl: `${manifest.explorerUrl}/tx/${hash}`,
    receipt: {
      blockNumber: receipt.blockNumber.toString(),
      status: receipt.status,
    },
  };
  validatePaymentsPayReport(sentOutput);
  writeOutput(JSON.stringify(
    sentOutput,
    null,
    2,
  ));
}

export function parsePaymentsPayCliArgs(argv: readonly string[]): PaymentsPayCliArgs {
  validateArgv(argv);
  const values = parseValues(argv, ["--manifest", "--recipient", "--amount-eth"], ["--send"]);
  return {
    send: values.booleans.has("--send"),
    manifestPath: values.options.get("--manifest") ?? DEFAULT_MANIFEST_PATH,
    recipient: values.options.get("--recipient"),
    amountEth: values.options.get("--amount-eth") ?? DEFAULT_AMOUNT_ETH,
  };
}

export function isPaymentsPayDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

export function loadPaymentsPayDotEnv(path: string, env: Record<string, string | undefined>): void {
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

async function buildDefaultPaymentTransaction(params: PaymentBuildParams): Promise<PaymentBuildResult> {
  const action = createTreasuryPaymentAction({
    adapter: params.adapter as `0x${string}`,
    recipient: params.recipient as `0x${string}`,
    amountWei: params.amountWei,
  });
  return buildExecuteTransaction({
    agent: params.manifest.contracts.agentAccount as `0x${string}`,
    action,
    simulatePolicy: createOnChainPolicySimulator(
      params.publicClient as Parameters<typeof createOnChainPolicySimulator>[0],
      params.manifest as Parameters<typeof createOnChainPolicySimulator>[1],
    ),
  });
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

function validateOptions(options: unknown): asserts options is PaymentsPayCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Payments pay options must be an object");
  }
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

function validateDotEnvLoader(
  loadDotEnv: unknown,
): asserts loadDotEnv is (path: string, env: Record<string, string | undefined>) => void {
  if (typeof loadDotEnv !== "function") throw new Error("Dotenv loader must be a function");
}

function validateManifestReader(
  readManifest: unknown,
): asserts readManifest is (path: string) => Promise<PaymentManifest> {
  if (typeof readManifest !== "function") throw new Error("Deployment manifest reader must be a function");
}

function validateAdapterReader(readAdapter: unknown): asserts readAdapter is (manifest: PaymentManifest) => string {
  if (typeof readAdapter !== "function") throw new Error("Payment adapter reader must be a function");
}

function validatePublicClientFactory(createClient: unknown): asserts createClient is (rpcUrl: string) => PaymentPublicClient {
  if (typeof createClient !== "function") throw new Error("Public client factory must be a function");
}

function validatePaymentBuilder(buildPayment: unknown): asserts buildPayment is (params: PaymentBuildParams) => Promise<PaymentBuildResult> {
  if (typeof buildPayment !== "function") throw new Error("Payment transaction builder must be a function");
}

function validateWalletAccountFactory(createAccount: unknown): asserts createAccount is (privateKey: string) => unknown {
  if (typeof createAccount !== "function") throw new Error("Wallet account factory must be a function");
}

function validateWalletClientFactory(createWallet: unknown): asserts createWallet is (params: PaymentWalletClientParams) => PaymentWalletClient {
  if (typeof createWallet !== "function") throw new Error("Wallet client factory must be a function");
}

function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function validatePaymentsPayReport(output: unknown): void {
  const report = requireReportObject(output, "Payments pay report must be an object");
  requireReportString(report.mode, "Payments pay report mode must be a string");
  requireReportNumber(report.chainId, "Payments pay report chainId must be a number");
  requireReportString(report.agent, "Payments pay report agent must be a string");
  requireReportString(report.adapter, "Payments pay report adapter must be a string");
  requireReportString(report.recipient, "Payments pay report recipient must be a string");
  requireReportString(report.amountEth, "Payments pay report amountEth must be a string");
  requireReportBoolean(report.allowed, "Payments pay report allowed must be a boolean");
  validateReportDecision(report.decision, "Payments pay report");
  validateReportTransaction(report.transaction, "Payments pay");
  if (report.hash !== undefined) {
    requireReportString(report.hash, "Payments pay report hash must be a string");
    requireReportString(report.explorerUrl, "Payments pay report explorerUrl must be a string");
    validateReportReceipt(report.receipt, "Payments pay");
  }
}
