import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createPublicClient as createViemPublicClient, http, isAddress, parseEther, parseUnits } from "viem";
import { baseSepolia } from "viem/chains";

import { createAction } from "../../core/action.js";
import { createOnChainPolicySimulator } from "../../base/execution.js";
import { readDeploymentManifest, requireMockSwapAdapter, requireTestErc20Token } from "../../base/deploymentManifest.js";
import { createSwapExactEthForTokenAction, SWAP_EXACT_ETH_FOR_TOKEN_CAPABILITY } from "../../tokens/swap.js";
import { buildExecuteTransaction } from "../../transactions/builder.js";
import {
  requireReportNumber,
  requireReportObject,
  requireReportString,
  validateReportChecks,
} from "../../valueTransfer/reportValidation.js";

const DEFAULT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";
const UNKNOWN_TARGET = "0x000000000000000000000000000000000000dEaD";

export interface TokenSwapSafetyCheckCliArgs {
  manifestPath: string;
  recipient?: string | undefined;
}

export interface TokenSwapSafetyCheckCliOptions {
  argv?: readonly string[];
  env?: Record<string, string | undefined>;
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  loadDotEnv?: (path: string, env: Record<string, string | undefined>) => void;
  readDeploymentManifest?: (path: string) => Promise<TokenSwapSafetyManifest>;
  requireSwapAdapter?: (manifest: TokenSwapSafetyManifest) => string;
  requireToken?: (manifest: TokenSwapSafetyManifest) => string;
  createPublicClient?: (rpcUrl: string) => unknown;
  buildSafetyTransaction?: (params: TokenSwapSafetyBuildParams) => Promise<TokenSwapSafetyBuildResult>;
}

interface TokenSwapSafetyManifest {
  chainId: number;
  rpcUrlEnv: string;
  owner: string;
  contracts: { agentAccount: string };
}

interface TokenSwapSafetyBuildParams {
  kind: "allowed" | "unknownAdapter" | "lowMinOutput" | "overLimit" | "invalidCalldata";
  manifest: TokenSwapSafetyManifest;
  publicClient: unknown;
  adapter: string;
  tokenOut: string;
  recipient: string;
}

interface TokenSwapSafetyBuildResult {
  allowed: boolean;
  decision: { code: string };
  transaction: unknown;
}

if (isTokenSwapSafetyCheckDirectRun(import.meta.url, process.argv)) {
  await runTokenSwapSafetyCheckCli();
}

export async function runTokenSwapSafetyCheckCli(
  options: TokenSwapSafetyCheckCliOptions = {},
): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const env = options.env ?? process.env;
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const loadDotEnv = options.loadDotEnv ?? loadTokenSwapSafetyCheckDotEnv;
  const readManifest = options.readDeploymentManifest ?? readDeploymentManifest;
  const readAdapter = options.requireSwapAdapter ?? ((manifest: TokenSwapSafetyManifest) =>
    requireMockSwapAdapter(manifest as Parameters<typeof requireMockSwapAdapter>[0]));
  const readToken = options.requireToken ?? ((manifest: TokenSwapSafetyManifest) =>
    requireTestErc20Token(manifest as Parameters<typeof requireTestErc20Token>[0]));
  const createClient = options.createPublicClient ?? ((rpcUrl: string) =>
    createViemPublicClient({ chain: baseSepolia, transport: http(rpcUrl) }));
  const buildSafety = options.buildSafetyTransaction ?? buildDefaultSafetyTransaction;

  validateOutputWriter(writeOutput);
  validateArgv(argv);
  const args = parseTokenSwapSafetyCheckCliArgs(argv);
  validateEnv(env);
  validateDotEnvLoader(loadDotEnv);
  validateManifestReader(readManifest);
  validateSwapAdapterReader(readAdapter);
  validateTokenReader(readToken);
  validatePublicClientFactory(createClient);
  validateSafetyBuilder(buildSafety);

  loadDotEnv(".env", env);
  const manifest = await readManifest(args.manifestPath);
  const rpcUrl = env[manifest.rpcUrlEnv];
  if (rpcUrl === undefined || rpcUrl.length === 0) throw new Error(`${manifest.rpcUrlEnv} is required`);

  const recipient = args.recipient ?? manifest.owner;
  if (!isAddress(recipient)) throw new Error("--recipient must be an address");

  const adapter = readAdapter(manifest);
  const tokenOut = readToken(manifest);
  const publicClient = createClient(rpcUrl);
  const allowed = await buildSafety({ kind: "allowed", manifest, publicClient, adapter, tokenOut, recipient });
  const unknownAdapter = await buildSafety({ kind: "unknownAdapter", manifest, publicClient, adapter, tokenOut, recipient });
  const lowMinOutput = await buildSafety({ kind: "lowMinOutput", manifest, publicClient, adapter, tokenOut, recipient });
  const overLimit = await buildSafety({ kind: "overLimit", manifest, publicClient, adapter, tokenOut, recipient });
  const invalidCalldata = await buildSafety({ kind: "invalidCalldata", manifest, publicClient, adapter, tokenOut, recipient });

  const checks = {
    allowedSwap: allowed.allowed && allowed.decision.code === "Allowed",
    unknownAdapterDenied: !unknownAdapter.allowed && unknownAdapter.decision.code === "CapabilityDenied",
    lowMinOutputDenied: !lowMinOutput.allowed && lowMinOutput.decision.code === "SwapMinOutputTooLow",
    overLimitDenied: !overLimit.allowed && overLimit.decision.code === "ActionValueExceeded",
    invalidCalldataDenied: !invalidCalldata.allowed && invalidCalldata.decision.code === "InvalidSwap",
  };

  const report = {
    chainId: manifest.chainId,
    agent: manifest.contracts.agentAccount,
    adapter,
    tokenOut,
    checks,
  };
  validateTokenSwapSafetyReport(report);
  writeOutput(JSON.stringify(report, null, 2));

  if (!Object.values(checks).every(Boolean)) {
    validateExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseTokenSwapSafetyCheckCliArgs(argv: readonly string[]): TokenSwapSafetyCheckCliArgs {
  validateArgv(argv);
  const values = parseValues(argv, ["--manifest", "--recipient"]);
  return {
    manifestPath: values.get("--manifest") ?? DEFAULT_MANIFEST_PATH,
    recipient: values.get("--recipient"),
  };
}

export function isTokenSwapSafetyCheckDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

export function loadTokenSwapSafetyCheckDotEnv(path: string, env: Record<string, string | undefined>): void {
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

async function buildDefaultSafetyTransaction(params: TokenSwapSafetyBuildParams): Promise<TokenSwapSafetyBuildResult> {
  const simulatePolicy = createOnChainPolicySimulator(
    params.publicClient as Parameters<typeof createOnChainPolicySimulator>[0],
    params.manifest as Parameters<typeof createOnChainPolicySimulator>[1],
  );
  const ethIn = parseEther("0.000001");
  const minAmountOut = parseUnits("0.00095", 18);
  let action;
  if (params.kind === "unknownAdapter") {
    action = createSwapExactEthForTokenAction({
      adapter: UNKNOWN_TARGET,
      tokenOut: params.tokenOut as `0x${string}`,
      recipient: params.recipient as `0x${string}`,
      ethIn,
      minAmountOut,
    });
  } else if (params.kind === "lowMinOutput") {
    action = createSwapExactEthForTokenAction({
      adapter: params.adapter as `0x${string}`,
      tokenOut: params.tokenOut as `0x${string}`,
      recipient: params.recipient as `0x${string}`,
      ethIn,
      minAmountOut: parseUnits("0.00094", 18),
    });
  } else if (params.kind === "overLimit") {
    action = createSwapExactEthForTokenAction({
      adapter: params.adapter as `0x${string}`,
      tokenOut: params.tokenOut as `0x${string}`,
      recipient: params.recipient as `0x${string}`,
      ethIn: parseEther("0.06"),
      minAmountOut: parseUnits("57", 18),
    });
  } else if (params.kind === "invalidCalldata") {
    action = createAction({
      capability: SWAP_EXACT_ETH_FOR_TOKEN_CAPABILITY,
      target: params.adapter as `0x${string}`,
      value: ethIn,
      data: "0x",
    });
  } else {
    action = createSwapExactEthForTokenAction({
      adapter: params.adapter as `0x${string}`,
      tokenOut: params.tokenOut as `0x${string}`,
      recipient: params.recipient as `0x${string}`,
      ethIn,
      minAmountOut,
    });
  }
  return buildExecuteTransaction({
    agent: params.manifest.contracts.agentAccount as `0x${string}`,
    action,
    simulatePolicy,
  });
}

function parseValues(argv: readonly string[], flags: readonly string[]): Map<string, string> {
  const values = new Map<string, string>();
  const pattern = new RegExp(`^(${flags.join("|")})=(.*)$`, "u");
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (flags.includes(arg)) {
      setOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }
    const equals = arg.match(pattern);
    if (equals !== null) {
      setOption(values, equals[1]!, equals[2]!);
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }
  return values;
}

function setOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function validateOptions(options: unknown): asserts options is TokenSwapSafetyCheckCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Token swap safety check options must be an object");
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

function validateDotEnvLoader(loadDotEnv: unknown): asserts loadDotEnv is (path: string, env: Record<string, string | undefined>) => void {
  if (typeof loadDotEnv !== "function") throw new Error("Dotenv loader must be a function");
}

function validateManifestReader(readManifest: unknown): asserts readManifest is (path: string) => Promise<TokenSwapSafetyManifest> {
  if (typeof readManifest !== "function") throw new Error("Deployment manifest reader must be a function");
}

function validateSwapAdapterReader(readAdapter: unknown): asserts readAdapter is (manifest: TokenSwapSafetyManifest) => string {
  if (typeof readAdapter !== "function") throw new Error("Swap adapter reader must be a function");
}

function validateTokenReader(readToken: unknown): asserts readToken is (manifest: TokenSwapSafetyManifest) => string {
  if (typeof readToken !== "function") throw new Error("Token reader must be a function");
}

function validatePublicClientFactory(createClient: unknown): asserts createClient is (rpcUrl: string) => unknown {
  if (typeof createClient !== "function") throw new Error("Public client factory must be a function");
}

function validateSafetyBuilder(buildSafety: unknown): asserts buildSafety is (params: TokenSwapSafetyBuildParams) => Promise<TokenSwapSafetyBuildResult> {
  if (typeof buildSafety !== "function") throw new Error("Token swap safety transaction builder must be a function");
}

function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function validateTokenSwapSafetyReport(output: unknown): void {
  const report = requireReportObject(output, "Token swap safety report must be an object");
  requireReportNumber(report.chainId, "Token swap safety report chainId must be a number");
  requireReportString(report.agent, "Token swap safety report agent must be a string");
  requireReportString(report.adapter, "Token swap safety report adapter must be a string");
  requireReportString(report.tokenOut, "Token swap safety report tokenOut must be a string");
  validateReportChecks(report.checks, "Token swap safety");
}
