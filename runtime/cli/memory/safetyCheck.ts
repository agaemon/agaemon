import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createPublicClient as createViemPublicClient, http, keccak256, parseEther, stringToHex } from "viem";
import { baseSepolia } from "viem/chains";

import { createAction } from "../../core/action.js";
import { createOnChainPolicySimulator } from "../../base/execution.js";
import { readDeploymentManifest, requireMemoryRegistry } from "../../base/deploymentManifest.js";
import {
  createMemoryCommitAction,
  createSingleLeafMemoryCommitment,
  MEMORY_COMMIT_CAPABILITY,
} from "../../memory/commitment.js";
import type { MemoryCommitment } from "../../memory/commitment.js";
import { buildExecuteTransaction } from "../../transactions/builder.js";

const DEFAULT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";
const UNKNOWN_TARGET = "0x000000000000000000000000000000000000dEaD";
const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

export interface MemorySafetyCheckCliArgs {
  manifestPath: string;
}

export interface MemorySafetyCheckCliOptions {
  argv?: readonly string[];
  env?: Record<string, string | undefined>;
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  loadDotEnv?: (path: string, env: Record<string, string | undefined>) => void;
  readDeploymentManifest?: (path: string) => Promise<MemorySafetyManifest>;
  requireMemoryRegistry?: (manifest: MemorySafetyManifest) => string;
  createPublicClient?: (rpcUrl: string) => MemorySafetyPublicClient;
  buildSafetyTransaction?: (params: MemorySafetyBuildParams) => Promise<MemorySafetyBuildResult>;
  callInvalidCommitment?: (params: { publicClient: MemorySafetyPublicClient; manifest: MemorySafetyManifest; transaction: { to: string; value: bigint; data: string } }) => Promise<boolean>;
}

interface MemorySafetyManifest {
  chainId: number;
  rpcUrlEnv: string;
  owner: string;
  contracts: { agentAccount: string };
}

interface MemorySafetyPublicClient {
  call?: (params: { account: string; to: string; value: bigint; data: string }) => Promise<unknown>;
}

interface MemorySafetyBuildParams {
  kind: "allowed" | "unknownRegistry" | "overLimit" | "invalidCommitment";
  manifest: MemorySafetyManifest;
  publicClient: MemorySafetyPublicClient;
  registry: string;
  commitment: MemoryCommitment;
}

interface MemorySafetyBuildResult {
  allowed: boolean;
  decision: { code: string };
  transaction: null | { to: string; value: bigint; data: string };
}

if (isMemorySafetyCheckDirectRun(import.meta.url, process.argv)) {
  await runMemorySafetyCheckCli();
}

export async function runMemorySafetyCheckCli(options: MemorySafetyCheckCliOptions = {}): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  validateArgv(argv);
  const args = parseMemorySafetyCheckCliArgs(argv);
  const env = options.env ?? process.env;
  validateEnv(env);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  validateOutputWriter(writeOutput);
  validateExitCodeSetter(setExitCode);
  const loadDotEnv = options.loadDotEnv ?? loadMemorySafetyCheckDotEnv;
  const readManifest = options.readDeploymentManifest ?? readDeploymentManifest;
  const readRegistry = options.requireMemoryRegistry ?? ((manifest: MemorySafetyManifest) =>
    requireMemoryRegistry(manifest as Parameters<typeof requireMemoryRegistry>[0]));
  const createClient = options.createPublicClient ?? ((rpcUrl: string) =>
    createViemPublicClient({ chain: baseSepolia, transport: http(rpcUrl) }) as MemorySafetyPublicClient);
  const buildSafety = options.buildSafetyTransaction ?? buildDefaultSafetyTransaction;
  const callInvalid = options.callInvalidCommitment ?? callInvalidCommitment;
  validateDotEnvLoader(loadDotEnv);
  validateManifestReader(readManifest);
  validateRegistryReader(readRegistry);
  validatePublicClientFactory(createClient);
  validateSafetyBuilder(buildSafety);
  validateInvalidCommitmentChecker(callInvalid);

  loadDotEnv(".env", env);
  const manifest = await readManifest(args.manifestPath);
  const rpcUrl = env[manifest.rpcUrlEnv];
  if (rpcUrl === undefined || rpcUrl.length === 0) throw new Error(`${manifest.rpcUrlEnv} is required`);

  const registry = readRegistry(manifest);
  const publicClient = createClient(rpcUrl);
  const commitment = createSingleLeafMemoryCommitment({
    memoryIdLabel: "agentos.memory.smoke",
    content: "AgentOS memory commitment smoke test",
    storageURI: "memory://agentos/base-sepolia/smoke-test",
  });

  const allowed = await buildSafety({ kind: "allowed", manifest, publicClient, registry, commitment });
  validateMemorySafetyBuildResult(allowed);
  const unknownRegistry = await buildSafety({ kind: "unknownRegistry", manifest, publicClient, registry, commitment });
  validateMemorySafetyBuildResult(unknownRegistry);
  const overLimit = await buildSafety({ kind: "overLimit", manifest, publicClient, registry, commitment });
  validateMemorySafetyBuildResult(overLimit);
  const invalid = await buildSafety({ kind: "invalidCommitment", manifest, publicClient, registry, commitment });
  validateMemorySafetyBuildResult(invalid);
  const invalidCommitmentRejected = invalid.transaction === null
    ? false
    : !(await callInvalid({ publicClient, manifest, transaction: invalid.transaction }));

  const checks = {
    allowedCommit: allowed.allowed && allowed.decision.code === "Allowed",
    unknownRegistryDenied: !unknownRegistry.allowed && unknownRegistry.decision.code === "CapabilityDenied",
    overLimitDenied: !overLimit.allowed && overLimit.decision.code === "ActionValueExceeded",
    invalidCommitmentRejected,
  };

  writeOutput(JSON.stringify({
    chainId: manifest.chainId,
    agent: manifest.contracts.agentAccount,
    registry,
    checks,
  }, null, 2));

  if (!Object.values(checks).every(Boolean)) setExitCode(1);
}

export function parseMemorySafetyCheckCliArgs(argv: readonly string[]): MemorySafetyCheckCliArgs {
  validateArgv(argv);
  const values = parseValues(argv, ["--manifest"]);
  return { manifestPath: values.get("--manifest") ?? DEFAULT_MANIFEST_PATH };
}

export function isMemorySafetyCheckDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

export function loadMemorySafetyCheckDotEnv(path: string, env: Record<string, string | undefined>): void {
  loadDotEnvFile(path, env);
}

async function buildDefaultSafetyTransaction(params: MemorySafetyBuildParams): Promise<MemorySafetyBuildResult> {
  const simulatePolicy = createOnChainPolicySimulator(
    params.publicClient as Parameters<typeof createOnChainPolicySimulator>[0],
    params.manifest as Parameters<typeof createOnChainPolicySimulator>[1],
  );
  let action;
  if (params.kind === "unknownRegistry") {
    action = createMemoryCommitAction({ registry: UNKNOWN_TARGET, ...params.commitment });
  } else if (params.kind === "overLimit") {
    action = createAction({
      capability: MEMORY_COMMIT_CAPABILITY,
      target: params.registry as `0x${string}`,
      value: parseEther("0.06"),
      data: createMemoryCommitAction({ registry: params.registry as `0x${string}`, ...params.commitment }).data,
    });
  } else if (params.kind === "invalidCommitment") {
    action = createMemoryCommitAction({
      registry: params.registry as `0x${string}`,
      memoryId: ZERO_BYTES32,
      merkleRoot: keccak256(stringToHex("root")),
      contentHash: keccak256(stringToHex("content")),
      storageURIHash: keccak256(stringToHex("memory://agentos/invalid")),
    });
  } else {
    action = createMemoryCommitAction({ registry: params.registry as `0x${string}`, ...params.commitment });
  }
  return buildExecuteTransaction({
    agent: params.manifest.contracts.agentAccount as `0x${string}`,
    action,
    simulatePolicy,
  });
}

async function callInvalidCommitment(params: {
  publicClient: MemorySafetyPublicClient;
  manifest: MemorySafetyManifest;
  transaction: { to: string; value: bigint; data: string };
}): Promise<boolean> {
  if (typeof params.publicClient.call !== "function") {
    throw new Error("Public client must support call probes for memory safety checks");
  }
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

function loadDotEnvFile(path: string, env: Record<string, string | undefined>): void {
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

function validateArgv(argv: unknown, message = "CLI argv must be an array of strings"): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) throw new Error(message);
}

function validateEnv(env: unknown): asserts env is Record<string, string | undefined> {
  if (typeof env !== "object" || env === null || Array.isArray(env)) throw new Error("Environment must be an object");
}

function validateOptions(options: unknown): asserts options is MemorySafetyCheckCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Memory safety check options must be an object");
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
): asserts readManifest is (path: string) => Promise<MemorySafetyManifest> {
  if (typeof readManifest !== "function") throw new Error("Deployment manifest reader must be a function");
}

function validateRegistryReader(
  readRegistry: unknown,
): asserts readRegistry is (manifest: MemorySafetyManifest) => string {
  if (typeof readRegistry !== "function") throw new Error("Memory registry reader must be a function");
}

function validatePublicClientFactory(
  createClient: unknown,
): asserts createClient is (rpcUrl: string) => MemorySafetyPublicClient {
  if (typeof createClient !== "function") throw new Error("Public client factory must be a function");
}

function validateSafetyBuilder(
  buildSafety: unknown,
): asserts buildSafety is (params: MemorySafetyBuildParams) => Promise<MemorySafetyBuildResult> {
  if (typeof buildSafety !== "function") throw new Error("Memory safety check builder must be a function");
}

function validateInvalidCommitmentChecker(
  callInvalid: unknown,
): asserts callInvalid is (params: {
  publicClient: MemorySafetyPublicClient;
  manifest: MemorySafetyManifest;
  transaction: { to: string; value: bigint; data: string };
}) => Promise<boolean> {
  if (typeof callInvalid !== "function") throw new Error("Invalid commitment checker must be a function");
}

function validateMemorySafetyBuildResult(result: unknown): asserts result is MemorySafetyBuildResult {
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    throw new Error("Memory safety check build result must be an object");
  }
  const record = result as Record<string, unknown>;
  if (typeof record.allowed !== "boolean") {
    throw new Error("Memory safety check build result allowed must be a boolean");
  }
  if (typeof record.decision !== "object" || record.decision === null || Array.isArray(record.decision)) {
    throw new Error("Memory safety check build result decision must be an object");
  }
  const decision = record.decision as Record<string, unknown>;
  validateNonEmptyString(decision.code, "Memory safety check build result decision code must not be empty");
  validateTransaction(record.transaction);
}

function validateTransaction(transaction: unknown): void {
  if (transaction === null) return;
  if (typeof transaction !== "object" || transaction === null || Array.isArray(transaction)) {
    throw new Error("Memory safety check build result transaction must be an object or null");
  }
  const record = transaction as Record<string, unknown>;
  validateNonEmptyString(record.to, "Memory safety check build result transaction to must not be empty");
  if (typeof record.value !== "bigint") {
    throw new Error("Memory safety check build result transaction value must be a bigint");
  }
  validateNonEmptyString(record.data, "Memory safety check build result transaction data must not be empty");
}

function validateNonEmptyString(value: unknown, message: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(message);
}

function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
