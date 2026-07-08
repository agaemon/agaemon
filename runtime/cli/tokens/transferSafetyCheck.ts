import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createPublicClient as createViemPublicClient, http, isAddress, parseUnits } from "viem";
import { baseSepolia } from "viem/chains";

import { createAction } from "../../core/action.js";
import { createOnChainPolicySimulator } from "../../base/execution.js";
import { readDeploymentManifest, requireTestErc20Token } from "../../base/deploymentManifest.js";
import { createErc20TransferAction, ERC20_TRANSFER_CAPABILITY } from "../../tokens/transfer.js";
import { buildExecuteTransaction } from "../../transactions/builder.js";
import {
  requireReportNumber,
  requireReportObject,
  requireReportString,
  validateReportChecks,
} from "../../valueTransfer/reportValidation.js";

const DEFAULT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";
const UNKNOWN_TARGET = "0x000000000000000000000000000000000000dEaD";

export interface TokenTransferSafetyCheckCliArgs {
  manifestPath: string;
  recipient?: string | undefined;
}

export interface TokenTransferSafetyCheckCliOptions {
  argv?: readonly string[];
  env?: Record<string, string | undefined>;
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  loadDotEnv?: (path: string, env: Record<string, string | undefined>) => void;
  readDeploymentManifest?: (path: string) => Promise<TokenSafetyManifest>;
  requireToken?: (manifest: TokenSafetyManifest) => string;
  createPublicClient?: (rpcUrl: string) => unknown;
  buildSafetyTransaction?: (params: TokenSafetyBuildParams) => Promise<TokenSafetyBuildResult>;
}

interface TokenSafetyManifest {
  chainId: number;
  rpcUrlEnv: string;
  owner: string;
  contracts: { agentAccount: string };
}

interface TokenSafetyBuildParams {
  kind: "allowed" | "unknownToken" | "overLimit" | "invalidCalldata";
  manifest: TokenSafetyManifest;
  publicClient: unknown;
  token: string;
  recipient: string;
}

interface TokenSafetyBuildResult {
  allowed: boolean;
  decision: { code: string };
  transaction: unknown;
}

if (isTokenTransferSafetyCheckDirectRun(import.meta.url, process.argv)) {
  await runTokenTransferSafetyCheckCli();
}

export async function runTokenTransferSafetyCheckCli(
  options: TokenTransferSafetyCheckCliOptions = {},
): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const env = options.env ?? process.env;
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const loadDotEnv = options.loadDotEnv ?? loadTokenTransferSafetyCheckDotEnv;
  const readManifest = options.readDeploymentManifest ?? readDeploymentManifest;
  const readToken = options.requireToken ?? ((manifest: TokenSafetyManifest) =>
    requireTestErc20Token(manifest as Parameters<typeof requireTestErc20Token>[0]));
  const createClient = options.createPublicClient ?? ((rpcUrl: string) =>
    createViemPublicClient({ chain: baseSepolia, transport: http(rpcUrl) }));
  const buildSafety = options.buildSafetyTransaction ?? buildDefaultSafetyTransaction;

  validateOutputWriter(writeOutput);
  validateArgv(argv);
  const args = parseTokenTransferSafetyCheckCliArgs(argv);
  validateEnv(env);
  validateDotEnvLoader(loadDotEnv);
  validateManifestReader(readManifest);
  validateTokenReader(readToken);
  validatePublicClientFactory(createClient);
  validateSafetyBuilder(buildSafety);

  loadDotEnv(".env", env);
  const manifest = await readManifest(args.manifestPath);
  const rpcUrl = env[manifest.rpcUrlEnv];
  if (rpcUrl === undefined || rpcUrl.length === 0) throw new Error(`${manifest.rpcUrlEnv} is required`);

  const recipient = args.recipient ?? manifest.owner;
  if (!isAddress(recipient)) throw new Error("--recipient must be an address");

  const token = readToken(manifest);
  const publicClient = createClient(rpcUrl);
  const allowed = await buildSafety({ kind: "allowed", manifest, publicClient, token, recipient });
  const unknownToken = await buildSafety({ kind: "unknownToken", manifest, publicClient, token, recipient });
  const overLimit = await buildSafety({ kind: "overLimit", manifest, publicClient, token, recipient });
  const invalidCalldata = await buildSafety({ kind: "invalidCalldata", manifest, publicClient, token, recipient });

  const checks = {
    allowedTransfer: allowed.allowed && allowed.decision.code === "Allowed",
    unknownTokenDenied: !unknownToken.allowed && unknownToken.decision.code === "CapabilityDenied",
    overLimitDenied: !overLimit.allowed && overLimit.decision.code === "TokenActionAmountExceeded",
    invalidCalldataDenied: !invalidCalldata.allowed && invalidCalldata.decision.code === "InvalidTokenTransfer",
  };

  const report = { chainId: manifest.chainId, agent: manifest.contracts.agentAccount, token, checks };
  validateTokenTransferSafetyReport(report);
  writeOutput(JSON.stringify(report, null, 2));
  if (!Object.values(checks).every(Boolean)) {
    validateExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseTokenTransferSafetyCheckCliArgs(argv: readonly string[]): TokenTransferSafetyCheckCliArgs {
  validateArgv(argv);
  const values = parseValues(argv, ["--manifest", "--recipient"]);
  return {
    manifestPath: values.get("--manifest") ?? DEFAULT_MANIFEST_PATH,
    recipient: values.get("--recipient"),
  };
}

export function isTokenTransferSafetyCheckDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

export function loadTokenTransferSafetyCheckDotEnv(path: string, env: Record<string, string | undefined>): void {
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

async function buildDefaultSafetyTransaction(params: TokenSafetyBuildParams): Promise<TokenSafetyBuildResult> {
  const simulatePolicy = createOnChainPolicySimulator(
    params.publicClient as Parameters<typeof createOnChainPolicySimulator>[0],
    params.manifest as Parameters<typeof createOnChainPolicySimulator>[1],
  );
  let action;
  if (params.kind === "unknownToken") {
    action = createErc20TransferAction({ token: UNKNOWN_TARGET, recipient: params.recipient as `0x${string}`, amount: parseUnits("1", 18) });
  } else if (params.kind === "overLimit") {
    action = createErc20TransferAction({ token: params.token as `0x${string}`, recipient: params.recipient as `0x${string}`, amount: parseUnits("11", 18) });
  } else if (params.kind === "invalidCalldata") {
    action = createAction({
      capability: ERC20_TRANSFER_CAPABILITY,
      target: params.token as `0x${string}`,
      data: "0x095ea7b300000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001",
    });
  } else {
    action = createErc20TransferAction({ token: params.token as `0x${string}`, recipient: params.recipient as `0x${string}`, amount: parseUnits("1", 18) });
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

function validateOptions(options: unknown): asserts options is TokenTransferSafetyCheckCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Token transfer safety check options must be an object");
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

function validateManifestReader(readManifest: unknown): asserts readManifest is (path: string) => Promise<TokenSafetyManifest> {
  if (typeof readManifest !== "function") throw new Error("Deployment manifest reader must be a function");
}

function validateTokenReader(readToken: unknown): asserts readToken is (manifest: TokenSafetyManifest) => string {
  if (typeof readToken !== "function") throw new Error("Token reader must be a function");
}

function validatePublicClientFactory(createClient: unknown): asserts createClient is (rpcUrl: string) => unknown {
  if (typeof createClient !== "function") throw new Error("Public client factory must be a function");
}

function validateSafetyBuilder(buildSafety: unknown): asserts buildSafety is (params: TokenSafetyBuildParams) => Promise<TokenSafetyBuildResult> {
  if (typeof buildSafety !== "function") throw new Error("Token transfer safety transaction builder must be a function");
}

function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function validateTokenTransferSafetyReport(output: unknown): void {
  const report = requireReportObject(output, "Token transfer safety report must be an object");
  requireReportNumber(report.chainId, "Token transfer safety report chainId must be a number");
  requireReportString(report.agent, "Token transfer safety report agent must be a string");
  requireReportString(report.token, "Token transfer safety report token must be a string");
  validateReportChecks(report.checks, "Token transfer safety");
}
