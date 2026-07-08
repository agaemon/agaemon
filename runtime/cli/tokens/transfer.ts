import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createPublicClient as createViemPublicClient,
  createWalletClient as createViemWalletClient,
  http,
  isAddress,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import { createOnChainPolicySimulator, normalizePrivateKey } from "../../base/execution.js";
import { readDeploymentManifest, requireTestErc20Token } from "../../base/deploymentManifest.js";
import { createErc20TransferAction } from "../../tokens/transfer.js";
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
const DEFAULT_AMOUNT = "1";

export interface TokenTransferCliArgs {
  send: boolean;
  manifestPath: string;
  recipient?: string | undefined;
  amount: string;
}

export interface TokenTransferCliOptions {
  argv?: readonly string[];
  env?: Record<string, string | undefined>;
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  loadDotEnv?: (path: string, env: Record<string, string | undefined>) => void;
  readDeploymentManifest?: (path: string) => Promise<TokenManifest>;
  requireToken?: (manifest: TokenManifest) => string;
  createPublicClient?: (rpcUrl: string) => TokenPublicClient;
  buildTokenTransferTransaction?: (params: TokenTransferBuildParams) => Promise<TokenTransferBuildResult>;
  createWalletAccount?: (privateKey: string) => unknown;
  createWalletClient?: (params: TokenTransferWalletClientParams) => TokenTransferWalletClient;
}

interface TokenManifest {
  chainId: number;
  rpcUrlEnv: string;
  explorerUrl: string;
  owner: string;
  contracts: { agentAccount: string };
}

interface TokenPublicClient {
  getChainId: () => Promise<number>;
  waitForTransactionReceipt?: (params: { hash: `0x${string}` | string }) => Promise<{ blockNumber: bigint; status: string }>;
}

interface TokenTransferWalletClient {
  sendTransaction: (params: unknown) => Promise<`0x${string}` | string>;
}

interface TokenTransferWalletClientParams {
  account: unknown;
  rpcUrl: string;
}

interface TokenTransferBuildParams {
  manifest: TokenManifest;
  publicClient: unknown;
  token: string;
  recipient: string;
  amount: bigint;
}

interface TokenTransferBuildResult {
  allowed: boolean;
  decision: unknown;
  transaction: null | { to: `0x${string}` | string; value: bigint; data: `0x${string}` | string };
}

if (isTokenTransferDirectRun(import.meta.url, process.argv)) {
  await runTokenTransferCli();
}

export async function runTokenTransferCli(options: TokenTransferCliOptions = {}): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const env = options.env ?? process.env;
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const loadDotEnv = options.loadDotEnv ?? loadTokenTransferDotEnv;
  const readManifest = options.readDeploymentManifest ?? readDeploymentManifest;
  const readToken = options.requireToken ?? ((manifest: TokenManifest) =>
    requireTestErc20Token(manifest as Parameters<typeof requireTestErc20Token>[0]));
  const createClient = options.createPublicClient ?? ((rpcUrl: string) =>
    createViemPublicClient({ chain: baseSepolia, transport: http(rpcUrl) }) as TokenPublicClient);
  const buildTransfer = options.buildTokenTransferTransaction ?? buildDefaultTokenTransferTransaction;
  const createAccount = options.createWalletAccount ?? ((privateKey: string) =>
    privateKeyToAccount(normalizePrivateKey(privateKey)));
  const createWallet = options.createWalletClient ?? ((params: TokenTransferWalletClientParams) =>
    createViemWalletClient({
      account: params.account as ReturnType<typeof privateKeyToAccount>,
      chain: baseSepolia,
      transport: http(params.rpcUrl),
    }) as TokenTransferWalletClient);

  validateOutputWriter(writeOutput);
  validateArgv(argv);
  const args = parseTokenTransferCliArgs(argv);
  validateEnv(env);
  validateDotEnvLoader(loadDotEnv);
  validateManifestReader(readManifest);
  validateTokenReader(readToken);
  validatePublicClientFactory(createClient);
  validateTransferBuilder(buildTransfer);

  loadDotEnv(".env", env);
  const manifest = await readManifest(args.manifestPath);
  const rpcUrl = env[manifest.rpcUrlEnv];
  if (rpcUrl === undefined || rpcUrl.length === 0) throw new Error(`${manifest.rpcUrlEnv} is required`);

  const recipient = args.recipient ?? manifest.owner;
  if (!isAddress(recipient)) throw new Error("--recipient must be an address");

  const amount = parseUnits(args.amount, 18);
  const token = readToken(manifest);
  const publicClient = createClient(rpcUrl);
  const chainId = await publicClient.getChainId();
  if (chainId !== manifest.chainId) throw new Error(`Connected to chain ${chainId}, expected ${manifest.chainId}`);

  const result = await buildTransfer({ manifest, publicClient, token, recipient, amount });
  const baseOutput = {
    mode: args.send ? "send" : "dry-run",
    chainId,
    agent: manifest.contracts.agentAccount,
    token,
    recipient,
    amountRaw: amount.toString(),
    allowed: result.allowed,
    decision: result.decision,
    transaction: formatTransaction(result.transaction),
  };

  if (!result.allowed || result.transaction === null) {
    validateTokenTransferReport(baseOutput);
    writeOutput(JSON.stringify(baseOutput, null, 2));
    validateExitCodeSetter(setExitCode);
    setExitCode(1);
    return;
  }

  if (!args.send) {
    validateTokenTransferReport(baseOutput);
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
  validateTokenTransferReport(sentOutput);
  writeOutput(JSON.stringify(sentOutput, null, 2));
}

export function parseTokenTransferCliArgs(argv: readonly string[]): TokenTransferCliArgs {
  validateArgv(argv);
  const values = parseValues(argv, ["--manifest", "--recipient", "--amount"], ["--send"]);
  return {
    send: values.booleans.has("--send"),
    manifestPath: values.options.get("--manifest") ?? DEFAULT_MANIFEST_PATH,
    recipient: values.options.get("--recipient"),
    amount: values.options.get("--amount") ?? DEFAULT_AMOUNT,
  };
}

export function isTokenTransferDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

export function loadTokenTransferDotEnv(path: string, env: Record<string, string | undefined>): void {
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

async function buildDefaultTokenTransferTransaction(params: TokenTransferBuildParams): Promise<TokenTransferBuildResult> {
  return buildExecuteTransaction({
    agent: params.manifest.contracts.agentAccount as `0x${string}`,
    action: createErc20TransferAction({
      token: params.token as `0x${string}`,
      recipient: params.recipient as `0x${string}`,
      amount: params.amount,
    }),
    simulatePolicy: createOnChainPolicySimulator(
      params.publicClient as Parameters<typeof createOnChainPolicySimulator>[0],
      params.manifest as Parameters<typeof createOnChainPolicySimulator>[1],
    ),
  });
}

function formatTransaction(transaction: TokenTransferBuildResult["transaction"]): null | { to: string; value: string; data: string } {
  return transaction === null ? null : { to: transaction.to, value: transaction.value.toString(), data: transaction.data };
}

function validateTokenTransferReport(output: unknown): void {
  const report = requireReportObject(output, "Token transfer report must be an object");
  requireReportString(report.mode, "Token transfer report mode must be a string");
  requireReportNumber(report.chainId, "Token transfer report chainId must be a number");
  requireReportString(report.agent, "Token transfer report agent must be a string");
  requireReportString(report.token, "Token transfer report token must be a string");
  requireReportString(report.recipient, "Token transfer report recipient must be a string");
  requireReportString(report.amountRaw, "Token transfer report amountRaw must be a string");
  requireReportBoolean(report.allowed, "Token transfer report allowed must be a boolean");
  validateReportDecision(report.decision, "Token transfer report");
  validateReportTransaction(report.transaction, "Token transfer");
  if (report.hash !== undefined) {
    requireReportString(report.hash, "Token transfer report hash must be a string");
    requireReportString(report.explorerUrl, "Token transfer report explorerUrl must be a string");
    validateReportReceipt(report.receipt, "Token transfer");
  }
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

function validateOptions(options: unknown): asserts options is TokenTransferCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) throw new Error("Token transfer options must be an object");
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

function validateManifestReader(readManifest: unknown): asserts readManifest is (path: string) => Promise<TokenManifest> {
  if (typeof readManifest !== "function") throw new Error("Deployment manifest reader must be a function");
}

function validateTokenReader(readToken: unknown): asserts readToken is (manifest: TokenManifest) => string {
  if (typeof readToken !== "function") throw new Error("Token reader must be a function");
}

function validatePublicClientFactory(createClient: unknown): asserts createClient is (rpcUrl: string) => TokenPublicClient {
  if (typeof createClient !== "function") throw new Error("Public client factory must be a function");
}

function validateTransferBuilder(buildTransfer: unknown): asserts buildTransfer is (params: TokenTransferBuildParams) => Promise<TokenTransferBuildResult> {
  if (typeof buildTransfer !== "function") throw new Error("Token transfer transaction builder must be a function");
}

function validateWalletAccountFactory(createAccount: unknown): asserts createAccount is (privateKey: string) => unknown {
  if (typeof createAccount !== "function") throw new Error("Wallet account factory must be a function");
}

function validateWalletClientFactory(createWallet: unknown): asserts createWallet is (params: TokenTransferWalletClientParams) => TokenTransferWalletClient {
  if (typeof createWallet !== "function") throw new Error("Wallet client factory must be a function");
}

function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
