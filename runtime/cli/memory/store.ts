import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createPublicClient as createViemPublicClient, createWalletClient as createViemWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import { createOnChainPolicySimulator, normalizePrivateKey } from "../../base/execution.js";
import { readDeploymentManifest, requireMemoryRegistry } from "../../base/deploymentManifest.js";
import { createMemoryCommitAction } from "../../memory/commitment.js";
import type { MemoryCommitment } from "../../memory/commitment.js";
import { storeLocalMemoryContent } from "../../memory/localStorage.js";
import { buildExecuteTransaction } from "../../transactions/builder.js";

const DEFAULT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";
const DEFAULT_STORAGE_DIR = "storage/memory";
const DEFAULT_MEMORY_ID_LABEL = "agentos.memory.local-smoke";
const DEFAULT_CONTENT = "AgentOS local memory storage smoke test";

export interface MemoryStoreCliArgs {
  send: boolean;
  manifestPath: string;
  storageDir?: string | undefined;
  memoryIdLabel: string;
  content: string;
}

export interface StoredMemoryRecord extends MemoryCommitment {
  storageURI: string;
  filePath: string;
}

export interface MemoryStoreCliOptions {
  argv?: readonly string[];
  env?: Record<string, string | undefined>;
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  loadDotEnv?: (path: string, env: Record<string, string | undefined>) => void;
  readDeploymentManifest?: (path: string) => Promise<MemoryStoreManifest>;
  requireMemoryRegistry?: (manifest: MemoryStoreManifest) => string;
  storeLocalMemoryContent?: (params: { rootDir: string; memoryIdLabel: string; content: string }) => Promise<StoredMemoryRecord>;
  createPublicClient?: (rpcUrl: string) => MemoryStorePublicClient;
  buildMemoryStoreTransaction?: (params: MemoryStoreBuildParams) => Promise<MemoryStoreBuildResult>;
  createWalletAccount?: (privateKey: string) => unknown;
  createWalletClient?: (params: { account: unknown; rpcUrl: string }) => MemoryStoreWalletClient;
}

interface MemoryStoreManifest {
  chainId: number;
  rpcUrlEnv: string;
  explorerUrl: string;
  contracts: { agentAccount: string };
}

interface MemoryStorePublicClient {
  getChainId: () => Promise<number>;
  waitForTransactionReceipt?: (params: { hash: string }) => Promise<{ blockNumber: bigint; status: string }>;
}

interface MemoryStoreWalletClient {
  sendTransaction: (params: unknown) => Promise<string>;
}

interface MemoryStoreBuildParams {
  manifest: MemoryStoreManifest;
  publicClient: unknown;
  registry: string;
  stored: StoredMemoryRecord;
}

interface MemoryStoreBuildResult {
  allowed: boolean;
  decision: unknown;
  transaction: null | { to: string; value: bigint; data: string };
}

if (isMemoryStoreDirectRun(import.meta.url, process.argv)) {
  await runMemoryStoreCli();
}

export async function runMemoryStoreCli(options: MemoryStoreCliOptions = {}): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  validateArgv(argv);
  const args = parseMemoryStoreCliArgs(argv);
  const env = options.env ?? process.env;
  validateEnv(env);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  validateOutputWriter(writeOutput);
  validateExitCodeSetter(setExitCode);
  const loadDotEnv = options.loadDotEnv ?? loadMemoryStoreDotEnv;
  const readManifest = options.readDeploymentManifest ?? readDeploymentManifest;
  const readRegistry = options.requireMemoryRegistry ?? ((manifest: MemoryStoreManifest) =>
    requireMemoryRegistry(manifest as Parameters<typeof requireMemoryRegistry>[0]));
  const storeContent = options.storeLocalMemoryContent ?? storeLocalMemoryContent;
  const createClient = options.createPublicClient ?? ((rpcUrl: string) =>
    createViemPublicClient({ chain: baseSepolia, transport: http(rpcUrl) }) as MemoryStorePublicClient);
  const buildStore = options.buildMemoryStoreTransaction ?? buildDefaultMemoryStoreTransaction;
  validateDotEnvLoader(loadDotEnv);
  validateManifestReader(readManifest);
  validateRegistryReader(readRegistry);
  validateLocalMemoryStore(storeContent);
  validatePublicClientFactory(createClient);
  validateStoreBuilder(buildStore);

  loadDotEnv(".env", env);
  const manifest = await readManifest(args.manifestPath);
  const rpcUrl = env[manifest.rpcUrlEnv];
  if (rpcUrl === undefined || rpcUrl.length === 0) throw new Error(`${manifest.rpcUrlEnv} is required`);

  const registry = readRegistry(manifest);
  const stored = await storeContent({
    rootDir: args.storageDir ?? env.LOCAL_MEMORY_STORAGE_DIR ?? DEFAULT_STORAGE_DIR,
    memoryIdLabel: args.memoryIdLabel,
    content: args.content,
  });
  validateStoredMemoryRecord(stored);
  const publicClient = createClient(rpcUrl);
  const chainId = await publicClient.getChainId();
  if (chainId !== manifest.chainId) throw new Error(`Connected to chain ${chainId}, expected ${manifest.chainId}`);

  const result = await buildStore({ manifest, publicClient, registry, stored });
  validateMemoryStoreBuildResult(result);
  const baseOutput = {
    mode: args.send ? "send" : "dry-run",
    chainId,
    agent: manifest.contracts.agentAccount,
    registry,
    localStorage: {
      storageURI: stored.storageURI,
      filePath: stored.filePath,
    },
    commitment: {
      memoryId: stored.memoryId,
      merkleRoot: stored.merkleRoot,
      contentHash: stored.contentHash,
      storageURIHash: stored.storageURIHash,
    },
    allowed: result.allowed,
    decision: result.decision,
    transaction: formatTransaction(result.transaction),
  };

  if (!result.allowed || result.transaction === null) {
    writeOutput(JSON.stringify(baseOutput, null, 2));
    setExitCode(1);
    return;
  }

  if (!args.send) {
    writeOutput(JSON.stringify(baseOutput, null, 2));
    return;
  }

  const rawPrivateKey = env.PRIVATE_KEY;
  if (rawPrivateKey === undefined || rawPrivateKey.length === 0) {
    throw new Error("PRIVATE_KEY is required when --send is used");
  }
  const createAccount = options.createWalletAccount ?? ((privateKey: string) =>
    privateKeyToAccount(normalizePrivateKey(privateKey)));
  const createWallet = options.createWalletClient ?? ((params: { account: unknown; rpcUrl: string }) =>
    createViemWalletClient({
      account: params.account as ReturnType<typeof privateKeyToAccount>,
      chain: baseSepolia,
      transport: http(params.rpcUrl),
    }) as MemoryStoreWalletClient);
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

  writeOutput(JSON.stringify({
    ...baseOutput,
    hash,
    explorerUrl: `${manifest.explorerUrl}/tx/${hash}`,
    receipt: {
      blockNumber: receipt.blockNumber.toString(),
      status: receipt.status,
    },
  }, null, 2));
}

export function parseMemoryStoreCliArgs(argv: readonly string[]): MemoryStoreCliArgs {
  validateArgv(argv);
  const values = parseValues(argv, ["--manifest", "--storage-dir", "--memory-id-label", "--content"], ["--send"]);
  return {
    send: values.booleans.has("--send"),
    manifestPath: values.options.get("--manifest") ?? DEFAULT_MANIFEST_PATH,
    storageDir: values.options.get("--storage-dir"),
    memoryIdLabel: values.options.get("--memory-id-label") ?? DEFAULT_MEMORY_ID_LABEL,
    content: values.options.get("--content") ?? DEFAULT_CONTENT,
  };
}

export function isMemoryStoreDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

export function loadMemoryStoreDotEnv(path: string, env: Record<string, string | undefined>): void {
  loadDotEnvFile(path, env);
}

async function buildDefaultMemoryStoreTransaction(params: MemoryStoreBuildParams): Promise<MemoryStoreBuildResult> {
  return buildExecuteTransaction({
    agent: params.manifest.contracts.agentAccount as `0x${string}`,
    action: createMemoryCommitAction({ registry: params.registry as `0x${string}`, ...params.stored }),
    simulatePolicy: createOnChainPolicySimulator(
      params.publicClient as Parameters<typeof createOnChainPolicySimulator>[0],
      params.manifest as Parameters<typeof createOnChainPolicySimulator>[1],
    ),
  });
}

function formatTransaction(transaction: MemoryStoreBuildResult["transaction"]): null | { to: string; value: string; data: string } {
  return transaction === null ? null : { to: transaction.to, value: transaction.value.toString(), data: transaction.data };
}

function parseValues(argv: readonly string[], valueFlags: readonly string[], booleanFlags: readonly string[]) {
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

function validateOptions(options: unknown): asserts options is MemoryStoreCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Memory store options must be an object");
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
): asserts readManifest is (path: string) => Promise<MemoryStoreManifest> {
  if (typeof readManifest !== "function") throw new Error("Deployment manifest reader must be a function");
}

function validateRegistryReader(
  readRegistry: unknown,
): asserts readRegistry is (manifest: MemoryStoreManifest) => string {
  if (typeof readRegistry !== "function") throw new Error("Memory registry reader must be a function");
}

function validateLocalMemoryStore(
  storeContent: unknown,
): asserts storeContent is (params: { rootDir: string; memoryIdLabel: string; content: string }) => Promise<StoredMemoryRecord> {
  if (typeof storeContent !== "function") throw new Error("Local memory store must be a function");
}

function validatePublicClientFactory(
  createClient: unknown,
): asserts createClient is (rpcUrl: string) => MemoryStorePublicClient {
  if (typeof createClient !== "function") throw new Error("Public client factory must be a function");
}

function validateStoreBuilder(
  buildStore: unknown,
): asserts buildStore is (params: MemoryStoreBuildParams) => Promise<MemoryStoreBuildResult> {
  if (typeof buildStore !== "function") throw new Error("Memory store builder must be a function");
}

function validateStoredMemoryRecord(stored: unknown): asserts stored is StoredMemoryRecord {
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) {
    throw new Error("Memory store record must be an object");
  }
  const record = stored as Record<string, unknown>;
  validateNonEmptyString(record.memoryId, "Memory store record memoryId must not be empty");
  validateNonEmptyString(record.merkleRoot, "Memory store record merkleRoot must not be empty");
  validateNonEmptyString(record.contentHash, "Memory store record contentHash must not be empty");
  validateNonEmptyString(record.storageURIHash, "Memory store record storageURIHash must not be empty");
  validateNonEmptyString(record.storageURI, "Memory store record storageURI must not be empty");
  validateNonEmptyString(record.filePath, "Memory store record filePath must not be empty");
}

function validateMemoryStoreBuildResult(result: unknown): asserts result is MemoryStoreBuildResult {
  validateBuildResult(result, "Memory store build result");
}

function validateBuildResult(result: unknown, label: string): asserts result is MemoryStoreBuildResult {
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    throw new Error(`${label} must be an object`);
  }
  const record = result as Record<string, unknown>;
  if (typeof record.allowed !== "boolean") throw new Error(`${label} allowed must be a boolean`);
  if (record.decision === undefined) throw new Error(`${label} decision must not be undefined`);
  validateTransaction(record.transaction, label);
}

function validateTransaction(transaction: unknown, label: string): void {
  if (transaction === null) return;
  if (typeof transaction !== "object" || transaction === null || Array.isArray(transaction)) {
    throw new Error(`${label} transaction must be an object or null`);
  }
  const record = transaction as Record<string, unknown>;
  validateNonEmptyString(record.to, `${label} transaction to must not be empty`);
  if (typeof record.value !== "bigint") throw new Error(`${label} transaction value must be a bigint`);
  validateNonEmptyString(record.data, `${label} transaction data must not be empty`);
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
