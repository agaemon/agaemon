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
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import { createOnChainPolicySimulator, normalizePrivateKey } from "../../base/execution.js";
import { readDeploymentManifest, requireMockSwapAdapter, requireTestErc20Token } from "../../base/deploymentManifest.js";
import { createSwapExactEthForTokenAction } from "../../tokens/swap.js";
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
const DEFAULT_MIN_AMOUNT_OUT = "0.00095";

export interface TokenSwapCliArgs {
  send: boolean;
  manifestPath: string;
  recipient?: string | undefined;
  amountEth: string;
  minAmountOut: string;
}

export interface TokenSwapCliOptions {
  argv?: readonly string[];
  env?: Record<string, string | undefined>;
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  loadDotEnv?: (path: string, env: Record<string, string | undefined>) => void;
  readDeploymentManifest?: (path: string) => Promise<TokenSwapManifest>;
  requireSwapAdapter?: (manifest: TokenSwapManifest) => string;
  requireToken?: (manifest: TokenSwapManifest) => string;
  createPublicClient?: (rpcUrl: string) => TokenSwapPublicClient;
  buildTokenSwapTransaction?: (params: TokenSwapBuildParams) => Promise<TokenSwapBuildResult>;
  createWalletAccount?: (privateKey: string) => unknown;
  createWalletClient?: (params: TokenSwapWalletClientParams) => TokenSwapWalletClient;
}

interface TokenSwapManifest {
  chainId: number;
  rpcUrlEnv: string;
  explorerUrl: string;
  owner: string;
  contracts: { agentAccount: string };
}

interface TokenSwapPublicClient {
  getChainId: () => Promise<number>;
  waitForTransactionReceipt?: (params: { hash: `0x${string}` | string }) => Promise<{ blockNumber: bigint; status: string }>;
}

interface TokenSwapWalletClient {
  sendTransaction: (params: unknown) => Promise<`0x${string}` | string>;
}

interface TokenSwapWalletClientParams {
  account: unknown;
  rpcUrl: string;
}

interface TokenSwapBuildParams {
  manifest: TokenSwapManifest;
  publicClient: unknown;
  adapter: string;
  tokenOut: string;
  recipient: string;
  ethIn: bigint;
  minAmountOut: bigint;
}

interface TokenSwapBuildResult {
  allowed: boolean;
  decision: unknown;
  transaction: null | { to: `0x${string}` | string; value: bigint; data: `0x${string}` | string };
}

if (isTokenSwapDirectRun(import.meta.url, process.argv)) {
  await runTokenSwapCli();
}

export async function runTokenSwapCli(options: TokenSwapCliOptions = {}): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const env = options.env ?? process.env;
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const loadDotEnv = options.loadDotEnv ?? loadTokenSwapDotEnv;
  const readManifest = options.readDeploymentManifest ?? readDeploymentManifest;
  const readAdapter = options.requireSwapAdapter ?? ((manifest: TokenSwapManifest) =>
    requireMockSwapAdapter(manifest as Parameters<typeof requireMockSwapAdapter>[0]));
  const readToken = options.requireToken ?? ((manifest: TokenSwapManifest) =>
    requireTestErc20Token(manifest as Parameters<typeof requireTestErc20Token>[0]));
  const createClient = options.createPublicClient ?? ((rpcUrl: string) =>
    createViemPublicClient({ chain: baseSepolia, transport: http(rpcUrl) }) as TokenSwapPublicClient);
  const buildSwap = options.buildTokenSwapTransaction ?? buildDefaultTokenSwapTransaction;
  const createAccount = options.createWalletAccount ?? ((privateKey: string) =>
    privateKeyToAccount(normalizePrivateKey(privateKey)));
  const createWallet = options.createWalletClient ?? ((params: TokenSwapWalletClientParams) =>
    createViemWalletClient({
      account: params.account as ReturnType<typeof privateKeyToAccount>,
      chain: baseSepolia,
      transport: http(params.rpcUrl),
    }) as TokenSwapWalletClient);

  validateOutputWriter(writeOutput);
  validateArgv(argv);
  const args = parseTokenSwapCliArgs(argv);
  validateEnv(env);
  validateDotEnvLoader(loadDotEnv);
  validateManifestReader(readManifest);
  validateSwapAdapterReader(readAdapter);
  validateTokenReader(readToken);
  validatePublicClientFactory(createClient);
  validateSwapBuilder(buildSwap);

  loadDotEnv(".env", env);
  const manifest = await readManifest(args.manifestPath);
  const rpcUrl = env[manifest.rpcUrlEnv];
  if (rpcUrl === undefined || rpcUrl.length === 0) throw new Error(`${manifest.rpcUrlEnv} is required`);

  const recipient = args.recipient ?? manifest.owner;
  if (!isAddress(recipient)) throw new Error("--recipient must be an address");

  const ethIn = parseEther(args.amountEth);
  const minAmountOut = parseUnits(args.minAmountOut, 18);
  const adapter = readAdapter(manifest);
  const tokenOut = readToken(manifest);
  const publicClient = createClient(rpcUrl);
  const chainId = await publicClient.getChainId();
  if (chainId !== manifest.chainId) throw new Error(`Connected to chain ${chainId}, expected ${manifest.chainId}`);

  const result = await buildSwap({ manifest, publicClient, adapter, tokenOut, recipient, ethIn, minAmountOut });
  const baseOutput = {
    mode: args.send ? "send" : "dry-run",
    chainId,
    agent: manifest.contracts.agentAccount,
    adapter,
    tokenOut,
    recipient,
    amountEth: formatEther(ethIn),
    minAmountOutRaw: minAmountOut.toString(),
    allowed: result.allowed,
    decision: result.decision,
    transaction: formatTransaction(result.transaction),
  };

  if (!result.allowed || result.transaction === null) {
    validateTokenSwapReport(baseOutput);
    writeOutput(JSON.stringify(baseOutput, null, 2));
    validateExitCodeSetter(setExitCode);
    setExitCode(1);
    return;
  }

  if (!args.send) {
    validateTokenSwapReport(baseOutput);
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
  validateTokenSwapReport(sentOutput);
  writeOutput(JSON.stringify(sentOutput, null, 2));
}

export function parseTokenSwapCliArgs(argv: readonly string[]): TokenSwapCliArgs {
  validateArgv(argv);
  const values = parseValues(argv, ["--manifest", "--recipient", "--amount-eth", "--min-amount-out"], ["--send"]);
  return {
    send: values.booleans.has("--send"),
    manifestPath: values.options.get("--manifest") ?? DEFAULT_MANIFEST_PATH,
    recipient: values.options.get("--recipient"),
    amountEth: values.options.get("--amount-eth") ?? DEFAULT_AMOUNT_ETH,
    minAmountOut: values.options.get("--min-amount-out") ?? DEFAULT_MIN_AMOUNT_OUT,
  };
}

export function isTokenSwapDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

export function loadTokenSwapDotEnv(path: string, env: Record<string, string | undefined>): void {
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

async function buildDefaultTokenSwapTransaction(params: TokenSwapBuildParams): Promise<TokenSwapBuildResult> {
  return buildExecuteTransaction({
    agent: params.manifest.contracts.agentAccount as `0x${string}`,
    action: createSwapExactEthForTokenAction({
      adapter: params.adapter as `0x${string}`,
      tokenOut: params.tokenOut as `0x${string}`,
      recipient: params.recipient as `0x${string}`,
      ethIn: params.ethIn,
      minAmountOut: params.minAmountOut,
    }),
    simulatePolicy: createOnChainPolicySimulator(
      params.publicClient as Parameters<typeof createOnChainPolicySimulator>[0],
      params.manifest as Parameters<typeof createOnChainPolicySimulator>[1],
    ),
  });
}

function formatTransaction(transaction: TokenSwapBuildResult["transaction"]): null | { to: string; value: string; data: string } {
  return transaction === null ? null : { to: transaction.to, value: transaction.value.toString(), data: transaction.data };
}

function validateTokenSwapReport(output: unknown): void {
  const report = requireReportObject(output, "Token swap report must be an object");
  requireReportString(report.mode, "Token swap report mode must be a string");
  requireReportNumber(report.chainId, "Token swap report chainId must be a number");
  requireReportString(report.agent, "Token swap report agent must be a string");
  requireReportString(report.adapter, "Token swap report adapter must be a string");
  requireReportString(report.tokenOut, "Token swap report tokenOut must be a string");
  requireReportString(report.recipient, "Token swap report recipient must be a string");
  requireReportString(report.amountEth, "Token swap report amountEth must be a string");
  requireReportString(report.minAmountOutRaw, "Token swap report minAmountOutRaw must be a string");
  requireReportBoolean(report.allowed, "Token swap report allowed must be a boolean");
  validateReportDecision(report.decision, "Token swap report");
  validateReportTransaction(report.transaction, "Token swap");
  if (report.hash !== undefined) {
    requireReportString(report.hash, "Token swap report hash must be a string");
    requireReportString(report.explorerUrl, "Token swap report explorerUrl must be a string");
    validateReportReceipt(report.receipt, "Token swap");
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

function validateOptions(options: unknown): asserts options is TokenSwapCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) throw new Error("Token swap options must be an object");
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

function validateManifestReader(readManifest: unknown): asserts readManifest is (path: string) => Promise<TokenSwapManifest> {
  if (typeof readManifest !== "function") throw new Error("Deployment manifest reader must be a function");
}

function validateSwapAdapterReader(readAdapter: unknown): asserts readAdapter is (manifest: TokenSwapManifest) => string {
  if (typeof readAdapter !== "function") throw new Error("Swap adapter reader must be a function");
}

function validateTokenReader(readToken: unknown): asserts readToken is (manifest: TokenSwapManifest) => string {
  if (typeof readToken !== "function") throw new Error("Token reader must be a function");
}

function validatePublicClientFactory(createClient: unknown): asserts createClient is (rpcUrl: string) => TokenSwapPublicClient {
  if (typeof createClient !== "function") throw new Error("Public client factory must be a function");
}

function validateSwapBuilder(buildSwap: unknown): asserts buildSwap is (params: TokenSwapBuildParams) => Promise<TokenSwapBuildResult> {
  if (typeof buildSwap !== "function") throw new Error("Token swap transaction builder must be a function");
}

function validateWalletAccountFactory(createAccount: unknown): asserts createAccount is (privateKey: string) => unknown {
  if (typeof createAccount !== "function") throw new Error("Wallet account factory must be a function");
}

function validateWalletClientFactory(createWallet: unknown): asserts createWallet is (params: TokenSwapWalletClientParams) => TokenSwapWalletClient {
  if (typeof createWallet !== "function") throw new Error("Wallet client factory must be a function");
}

function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
