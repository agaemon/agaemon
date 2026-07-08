import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createPublicClient as createViemPublicClient, createWalletClient as createViemWalletClient, getAddress, http } from "viem";
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import {
  AGENT_DIRECTORY_ABI,
  createAgentProfileCommitment,
  createRegisterAgentProfileTransaction,
} from "../../agentCore/directory.js";
import { createAgentProfileMemoryIdLabel, createAgentProfileMetadataDocument } from "../../agentCore/profileMetadata.js";
import { createOnChainPolicySimulator, normalizePrivateKey } from "../../base/execution.js";
import {
  readDeploymentManifest,
  requireAgentDirectory,
  requireMemoryRegistry,
} from "../../base/deploymentManifest.js";
import { createMemoryCommitAction, MEMORY_REGISTRY_ABI } from "../../memory/commitment.js";
import type { MemoryCommitment } from "../../memory/commitment.js";
import { publishMemoryContent } from "../../memory/publisher.js";
import type { PublishedMemoryRecord } from "../../memory/publisher.js";
import { buildExecuteTransaction } from "../../transactions/builder.js";

const DEFAULT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";
const DEFAULT_STORAGE_DIR = "storage/memory";
const DEFAULT_MEMORY_PUBLISHER = "local";
const DEFAULT_ROLE_LABEL = "agentos.kernel.operator";
const DEFAULT_PROFILE_NAME = "AgentOS Kernel Operator";
const DEFAULT_PROFILE_DESCRIPTION = "Base Sepolia AgentOS kernel operator profile";

export interface MemoryProfileCliArgs {
  send: boolean;
  manifestPath: string;
  roleLabel?: string | undefined;
  profileName?: string | undefined;
  profileDescription?: string | undefined;
  memoryIdLabel?: string | undefined;
  storageDir?: string | undefined;
  publisher?: string | undefined;
  ipfsApiUrl?: string | undefined;
  ipfsGatewayUrl?: string | undefined;
  ipfsBearerToken?: string | undefined;
}

export interface MemoryProfileCliOptions {
  argv?: readonly string[];
  env?: Record<string, string | undefined>;
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  loadDotEnv?: (path: string, env: Record<string, string | undefined>) => void;
  readDeploymentManifest?: (path: string) => Promise<MemoryProfileManifest>;
  requireAgentDirectory?: (manifest: MemoryProfileManifest) => string;
  requireMemoryRegistry?: (manifest: MemoryProfileManifest) => string;
  createProfileDocument?: (params: CreateProfileDocumentParams) => string;
  publishMemoryContent?: (params: PublishProfileMemoryParams) => Promise<PublishedMemoryRecord>;
  createProfileCommitment?: (params: { roleLabel: string; metadataURI: string }) => { roleHash: Hex; metadataURIHash: Hex };
  createPublicClient?: (rpcUrl: string) => MemoryProfilePublicClient;
  buildMemoryCommitTransaction?: (params: MemoryProfileBuildParams) => Promise<MemoryProfileBuildResult>;
  createRegisterProfileTransaction?: (params: CreateRegisterProfileTransactionParams) => MemoryProfileTransaction;
  callPasses?: (client: MemoryProfilePublicClient, account: string, transaction: MemoryProfileTransaction) => Promise<boolean>;
  createWalletAccount?: (privateKey: string) => { address: string } | unknown;
  createWalletClient?: (params: { account: unknown; rpcUrl: string }) => MemoryProfileWalletClient;
}

interface MemoryProfileManifest {
  network: string;
  chainId: number;
  rpcUrlEnv: string;
  explorerUrl: string;
  owner: string;
  contracts: {
    agentAccount: string;
    reputationRegistry: string;
    reputationHistory: string;
    agentCoordination: string;
  };
}

interface CreateProfileDocumentParams {
  network: string;
  chainId: number;
  agent: string;
  roleLabel: string;
  name: string;
  description: string;
  contracts: {
    agentAccount: string;
    agentDirectory: string;
    memoryRegistry: string;
    reputationRegistry: string;
    reputationHistory: string;
    agentCoordination: string;
  };
}

interface PublishProfileMemoryParams {
  publisher: string;
  memoryIdLabel: string;
  content: string;
  local: { rootDir: string };
  ipfs: {
    apiUrl?: string | undefined;
    gatewayUrl?: string | undefined;
    bearerToken?: string | undefined;
    fileName: string;
  };
}

interface MemoryProfilePublicClient {
  getChainId: () => Promise<number>;
  readContract: (params: unknown) => Promise<unknown>;
  getTransactionCount?: (params: unknown) => Promise<number>;
  waitForTransactionReceipt?: (params: { hash: string }) => Promise<{ blockNumber: bigint; status: string }>;
  call?: (parameters: { account: string; to: string; value: bigint; data: string }) => Promise<unknown>;
}

interface MemoryProfileBuildParams {
  manifest: MemoryProfileManifest;
  publicClient: unknown;
  memoryRegistry: string;
  stored: MemoryCommitment;
}

interface MemoryProfileBuildResult {
  allowed: boolean;
  decision: unknown;
  transaction: null | MemoryProfileTransaction;
}

interface CreateRegisterProfileTransactionParams {
  directory: string;
  agent: string;
  roleHash: Hex;
  metadataURIHash: Hex;
  active: boolean;
}

interface MemoryProfileTransaction {
  to: string;
  value: bigint;
  data: string;
}

interface MemoryProfileWalletClient {
  sendTransaction: (params: unknown) => Promise<string>;
}

if (isMemoryProfileDirectRun(import.meta.url, process.argv)) {
  await runMemoryProfileCli();
}

export async function runMemoryProfileCli(options: MemoryProfileCliOptions = {}): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  validateArgv(argv);
  const args = parseMemoryProfileCliArgs(argv);
  const env = options.env ?? process.env;
  validateEnv(env);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  validateOutputWriter(writeOutput);
  validateExitCodeSetter(setExitCode);
  const loadDotEnv = options.loadDotEnv ?? loadMemoryProfileDotEnv;
  const readManifest: (path: string) => Promise<MemoryProfileManifest> =
    options.readDeploymentManifest ?? (readDeploymentManifest as unknown as (path: string) => Promise<MemoryProfileManifest>);
  const readDirectory = options.requireAgentDirectory ?? ((manifest: MemoryProfileManifest) =>
    requireAgentDirectory(manifest as Parameters<typeof requireAgentDirectory>[0]));
  const readMemoryRegistry = options.requireMemoryRegistry ?? ((manifest: MemoryProfileManifest) =>
    requireMemoryRegistry(manifest as Parameters<typeof requireMemoryRegistry>[0]));
  const createDocument = options.createProfileDocument ?? ((params: CreateProfileDocumentParams) =>
    createAgentProfileMetadataDocument(params as Parameters<typeof createAgentProfileMetadataDocument>[0]));
  const publishContent = options.publishMemoryContent ?? ((params: PublishProfileMemoryParams) =>
    publishMemoryContent(params as Parameters<typeof publishMemoryContent>[0]));
  const createCommitment = options.createProfileCommitment ?? ((params: { roleLabel: string; metadataURI: string }) =>
    createAgentProfileCommitment(params));
  const createClient = options.createPublicClient ?? ((rpcUrl: string) =>
    createViemPublicClient({ chain: baseSepolia, transport: http(rpcUrl) }) as MemoryProfilePublicClient);
  const buildMemory = options.buildMemoryCommitTransaction ?? buildDefaultMemoryProfileTransaction;
  const createRegister = options.createRegisterProfileTransaction ?? ((params: CreateRegisterProfileTransactionParams) =>
    createRegisterAgentProfileTransaction({
      directory: params.directory as Address,
      agent: params.agent as Address,
      roleHash: params.roleHash,
      metadataURIHash: params.metadataURIHash,
      active: params.active,
    }));
  const probeCall = options.callPasses ?? callPasses;
  validateDotEnvLoader(loadDotEnv);
  validateManifestReader(readManifest);
  validateDirectoryReader(readDirectory);
  validateMemoryRegistryReader(readMemoryRegistry);
  validateProfileDocumentFactory(createDocument);
  validateMemoryPublisher(publishContent);
  validateProfileCommitmentFactory(createCommitment);
  validatePublicClientFactory(createClient);
  validateMemoryBuilder(buildMemory);
  validateRegisterTransactionFactory(createRegister);
  validateCallProbe(probeCall);

  loadDotEnv(".env", env);
  const manifest = await readManifest(args.manifestPath);
  const rpcUrl = env[manifest.rpcUrlEnv];
  if (rpcUrl === undefined || rpcUrl.length === 0) throw new Error(`${manifest.rpcUrlEnv} is required`);

  const agent = manifest.contracts.agentAccount;
  const directory = readDirectory(manifest);
  const memoryRegistry = readMemoryRegistry(manifest);
  const roleLabel = args.roleLabel ?? env.AGENT_ROLE_LABEL ?? DEFAULT_ROLE_LABEL;
  const profileName = args.profileName ?? env.AGENT_PROFILE_NAME ?? DEFAULT_PROFILE_NAME;
  const profileDescription = args.profileDescription ?? env.AGENT_PROFILE_DESCRIPTION ?? DEFAULT_PROFILE_DESCRIPTION;
  const memoryIdLabel = args.memoryIdLabel ?? env.AGENT_PROFILE_MEMORY_ID_LABEL ?? createAgentProfileMemoryIdLabel(agent as Address);
  const storageDir = args.storageDir ?? env.LOCAL_MEMORY_STORAGE_DIR ?? DEFAULT_STORAGE_DIR;
  const publisher = args.publisher ?? env.MEMORY_PUBLISHER ?? DEFAULT_MEMORY_PUBLISHER;
  const ipfsApiUrl = readOptional(args.ipfsApiUrl ?? env.IPFS_API_URL);
  const ipfsGatewayUrl = readOptional(args.ipfsGatewayUrl ?? env.IPFS_GATEWAY_URL);
  const ipfsBearerToken = readOptional(args.ipfsBearerToken ?? env.IPFS_AUTH_BEARER_TOKEN);

  const profileDocument = createDocument({
    network: manifest.network,
    chainId: manifest.chainId,
    agent,
    roleLabel,
    name: profileName,
    description: profileDescription,
    contracts: {
      agentAccount: manifest.contracts.agentAccount,
      agentDirectory: directory,
      memoryRegistry,
      reputationRegistry: manifest.contracts.reputationRegistry,
      reputationHistory: manifest.contracts.reputationHistory,
      agentCoordination: manifest.contracts.agentCoordination,
    },
  });
  const stored = await publishContent({
    publisher,
    memoryIdLabel,
    content: profileDocument,
    local: { rootDir: storageDir },
    ipfs: {
      apiUrl: ipfsApiUrl,
      gatewayUrl: ipfsGatewayUrl,
      bearerToken: ipfsBearerToken,
      fileName: "agent-profile.json",
    },
  });
  validatePublishedMemoryRecord(stored);
  const profileCommitment = createCommitment({ roleLabel, metadataURI: stored.storageURI });
  validateProfileCommitment(profileCommitment);
  const publicClient = createClient(rpcUrl);
  const chainId = await publicClient.getChainId();
  if (chainId !== manifest.chainId) throw new Error(`Connected to chain ${chainId}, expected ${manifest.chainId}`);

  const directoryOwner = await publicClient.readContract({
    address: directory,
    abi: AGENT_DIRECTORY_ABI,
    functionName: "owner",
  }) as string;
  const profile = await publicClient.readContract({
    address: directory,
    abi: AGENT_DIRECTORY_ABI,
    functionName: "profileOf",
    args: [agent],
  }) as readonly [Hex, Hex, boolean, boolean];
  const memoryResult = await buildMemory({ manifest, publicClient, memoryRegistry, stored });
  validateMemoryProfileBuildResult(memoryResult);
  const registerTransaction = createRegister({
    directory,
    agent,
    ...profileCommitment,
    active: true,
  });
  validateMemoryProfileTransaction(registerTransaction, "Memory profile register transaction");
  const registerCallable = await probeCall(publicClient, directoryOwner, registerTransaction);

  const baseOutput = {
    mode: args.send ? "send" : "dry-run",
    chainId,
    agent,
    directory,
    directoryOwner,
    directoryOwnerMatchesManifest: getAddress(directoryOwner) === getAddress(manifest.owner),
    memoryRegistry,
    roleLabel,
    profileName,
    profileDescription,
    memoryIdLabel,
    storage: {
      publisher: stored.publisher,
      storageURI: stored.storageURI,
      filePath: stored.filePath,
      cid: stored.cid,
      gatewayURL: stored.gatewayURL,
    },
    localStorage: stored.filePath === undefined ? null : { storageURI: stored.storageURI, filePath: stored.filePath },
    ipfsStorage: stored.cid === undefined ? null : { storageURI: stored.storageURI, cid: stored.cid, gatewayURL: stored.gatewayURL },
    profileDocument,
    profileCommitment,
    memoryCommitment: {
      memoryId: stored.memoryId,
      merkleRoot: stored.merkleRoot,
      contentHash: stored.contentHash,
      storageURIHash: stored.storageURIHash,
    },
    currentProfile: {
      roleHash: profile[0],
      metadataURIHash: profile[1],
      active: profile[2],
      registered: profile[3],
    },
    memoryPolicy: {
      allowed: memoryResult.allowed,
      decision: memoryResult.decision,
    },
    registerCallable,
    memoryTransaction: formatTransaction(memoryResult.transaction),
    registerTransaction: formatTransaction(registerTransaction),
  };

  if (!memoryResult.allowed || memoryResult.transaction === null || !registerCallable) {
    writeOutput(JSON.stringify(baseOutput, null, 2));
    setExitCode(1);
    return;
  }

  if (!args.send) {
    writeOutput(JSON.stringify(baseOutput, null, 2));
    return;
  }

  if (getAddress(directoryOwner) !== getAddress(manifest.owner)) {
    throw new Error(`Directory owner ${directoryOwner} does not match manifest owner ${manifest.owner}`);
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
    }) as MemoryProfileWalletClient);
  const account = createAccount(rawPrivateKey) as { address: string };
  if (getAddress(account.address) !== getAddress(directoryOwner)) {
    throw new Error(`PRIVATE_KEY address ${account.address} does not match directory owner ${directoryOwner}`);
  }
  if (typeof publicClient.getTransactionCount !== "function" || typeof publicClient.waitForTransactionReceipt !== "function") {
    throw new Error("Public client must support nonce and receipt reads when --send is used");
  }
  const walletClient = createWallet({ account, rpcUrl });
  const nonce = await publicClient.getTransactionCount({ address: account.address, blockTag: "pending" });
  const memoryHash = await walletClient.sendTransaction({
    account,
    chain: baseSepolia,
    nonce,
    to: memoryResult.transaction.to,
    value: memoryResult.transaction.value,
    data: memoryResult.transaction.data,
  });
  const memoryReceipt = await publicClient.waitForTransactionReceipt({ hash: memoryHash });
  const registerHash = await walletClient.sendTransaction({
    account,
    chain: baseSepolia,
    nonce: nonce + 1,
    to: registerTransaction.to,
    value: registerTransaction.value,
    data: registerTransaction.data,
  });
  const registerReceipt = await publicClient.waitForTransactionReceipt({ hash: registerHash });
  const nextMemory = await publicClient.readContract({
    address: memoryRegistry,
    abi: MEMORY_REGISTRY_ABI,
    functionName: "commitments",
    args: [agent, stored.memoryId],
    blockNumber: registerReceipt.blockNumber,
  }) as readonly [Hex, Hex, Hex, bigint, bigint, bigint];
  const nextProfile = await publicClient.readContract({
    address: directory,
    abi: AGENT_DIRECTORY_ABI,
    functionName: "profileOf",
    args: [agent],
    blockNumber: registerReceipt.blockNumber,
  }) as readonly [Hex, Hex, boolean, boolean];

  writeOutput(JSON.stringify({
    ...baseOutput,
    memoryHash,
    memoryExplorerUrl: `${manifest.explorerUrl}/tx/${memoryHash}`,
    registerHash,
    registerExplorerUrl: `${manifest.explorerUrl}/tx/${registerHash}`,
    memoryReceipt: {
      blockNumber: memoryReceipt.blockNumber.toString(),
      status: memoryReceipt.status,
    },
    registerReceipt: {
      blockNumber: registerReceipt.blockNumber.toString(),
      status: registerReceipt.status,
    },
    nextMemory: {
      merkleRoot: nextMemory[0],
      contentHash: nextMemory[1],
      storageURIHash: nextMemory[2],
      version: nextMemory[3].toString(),
      blockNumber: nextMemory[4].toString(),
      timestamp: nextMemory[5].toString(),
    },
    nextProfile: {
      roleHash: nextProfile[0],
      metadataURIHash: nextProfile[1],
      active: nextProfile[2],
      registered: nextProfile[3],
    },
  }, null, 2));
}

export function parseMemoryProfileCliArgs(argv: readonly string[]): MemoryProfileCliArgs {
  validateArgv(argv);
  const values = parseValues(argv, [
    "--manifest",
    "--role-label",
    "--profile-name",
    "--profile-description",
    "--memory-id-label",
    "--storage-dir",
    "--publisher",
    "--ipfs-api-url",
    "--ipfs-gateway-url",
    "--ipfs-auth-bearer-token",
  ], ["--send"]);
  return {
    send: values.booleans.has("--send"),
    manifestPath: values.options.get("--manifest") ?? DEFAULT_MANIFEST_PATH,
    roleLabel: values.options.get("--role-label"),
    profileName: values.options.get("--profile-name"),
    profileDescription: values.options.get("--profile-description"),
    memoryIdLabel: values.options.get("--memory-id-label"),
    storageDir: values.options.get("--storage-dir"),
    publisher: values.options.get("--publisher"),
    ipfsApiUrl: values.options.get("--ipfs-api-url"),
    ipfsGatewayUrl: values.options.get("--ipfs-gateway-url"),
    ipfsBearerToken: values.options.get("--ipfs-auth-bearer-token"),
  };
}

export function isMemoryProfileDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

export function loadMemoryProfileDotEnv(path: string, env: Record<string, string | undefined>): void {
  loadDotEnvFile(path, env);
}

async function buildDefaultMemoryProfileTransaction(params: MemoryProfileBuildParams): Promise<MemoryProfileBuildResult> {
  return buildExecuteTransaction({
    agent: params.manifest.contracts.agentAccount as `0x${string}`,
    action: createMemoryCommitAction({ registry: params.memoryRegistry as Address, ...params.stored }),
    simulatePolicy: createOnChainPolicySimulator(
      params.publicClient as Parameters<typeof createOnChainPolicySimulator>[0],
      params.manifest as Parameters<typeof createOnChainPolicySimulator>[1],
    ),
  });
}

async function callPasses(client: MemoryProfilePublicClient, account: string, transaction: MemoryProfileTransaction): Promise<boolean> {
  if (typeof client.call !== "function") {
    throw new Error("Public client must support call probes for memory profile checks");
  }
  try {
    await client.call({ account, to: transaction.to, value: transaction.value, data: transaction.data });
    return true;
  } catch {
    return false;
  }
}

function formatTransaction(transaction: null | MemoryProfileTransaction): null | { to: string; value: string; data: string } {
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

function readOptional(value: string | undefined): string | undefined {
  if (value === undefined || value.length === 0) return undefined;
  return value;
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

function validateOptions(options: unknown): asserts options is MemoryProfileCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Memory profile options must be an object");
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
): asserts readManifest is (path: string) => Promise<MemoryProfileManifest> {
  if (typeof readManifest !== "function") throw new Error("Deployment manifest reader must be a function");
}

function validateDirectoryReader(
  readDirectory: unknown,
): asserts readDirectory is (manifest: MemoryProfileManifest) => string {
  if (typeof readDirectory !== "function") throw new Error("Agent directory reader must be a function");
}

function validateMemoryRegistryReader(
  readMemoryRegistry: unknown,
): asserts readMemoryRegistry is (manifest: MemoryProfileManifest) => string {
  if (typeof readMemoryRegistry !== "function") throw new Error("Memory registry reader must be a function");
}

function validateProfileDocumentFactory(
  createDocument: unknown,
): asserts createDocument is (params: CreateProfileDocumentParams) => string {
  if (typeof createDocument !== "function") throw new Error("Profile document factory must be a function");
}

function validateMemoryPublisher(
  publishContent: unknown,
): asserts publishContent is (params: PublishProfileMemoryParams) => Promise<PublishedMemoryRecord> {
  if (typeof publishContent !== "function") throw new Error("Memory profile publisher must be a function");
}

function validateProfileCommitmentFactory(
  createCommitment: unknown,
): asserts createCommitment is (params: { roleLabel: string; metadataURI: string }) => { roleHash: Hex; metadataURIHash: Hex } {
  if (typeof createCommitment !== "function") throw new Error("Profile commitment factory must be a function");
}

function validatePublicClientFactory(
  createClient: unknown,
): asserts createClient is (rpcUrl: string) => MemoryProfilePublicClient {
  if (typeof createClient !== "function") throw new Error("Public client factory must be a function");
}

function validateMemoryBuilder(
  buildMemory: unknown,
): asserts buildMemory is (params: MemoryProfileBuildParams) => Promise<MemoryProfileBuildResult> {
  if (typeof buildMemory !== "function") throw new Error("Memory profile builder must be a function");
}

function validateRegisterTransactionFactory(
  createRegister: unknown,
): asserts createRegister is (params: CreateRegisterProfileTransactionParams) => MemoryProfileTransaction {
  if (typeof createRegister !== "function") throw new Error("Register profile transaction factory must be a function");
}

function validateCallProbe(
  probeCall: unknown,
): asserts probeCall is (client: MemoryProfilePublicClient, account: string, transaction: MemoryProfileTransaction) => Promise<boolean> {
  if (typeof probeCall !== "function") throw new Error("Memory profile call probe must be a function");
}

function validatePublishedMemoryRecord(stored: unknown): asserts stored is PublishedMemoryRecord {
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) {
    throw new Error("Memory profile published record must be an object");
  }
  const record = stored as Record<string, unknown>;
  validateNonEmptyString(record.publisher, "Memory profile published record publisher must not be empty");
  validateNonEmptyString(record.storageURI, "Memory profile published record storageURI must not be empty");
  validateNonEmptyString(record.memoryId, "Memory profile published record memoryId must not be empty");
  validateNonEmptyString(record.merkleRoot, "Memory profile published record merkleRoot must not be empty");
  validateNonEmptyString(record.contentHash, "Memory profile published record contentHash must not be empty");
  validateNonEmptyString(record.storageURIHash, "Memory profile published record storageURIHash must not be empty");
  validateOptionalString(record.filePath, "Memory profile published record filePath must be a string");
  validateOptionalString(record.cid, "Memory profile published record cid must be a string");
  validateOptionalString(record.gatewayURL, "Memory profile published record gatewayURL must be a string");
}

function validateProfileCommitment(commitment: unknown): asserts commitment is { roleHash: Hex; metadataURIHash: Hex } {
  if (typeof commitment !== "object" || commitment === null || Array.isArray(commitment)) {
    throw new Error("Memory profile commitment must be an object");
  }
  const record = commitment as Record<string, unknown>;
  validateNonEmptyString(record.roleHash, "Memory profile commitment roleHash must not be empty");
  validateNonEmptyString(record.metadataURIHash, "Memory profile commitment metadataURIHash must not be empty");
}

function validateMemoryProfileBuildResult(result: unknown): asserts result is MemoryProfileBuildResult {
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    throw new Error("Memory profile build result must be an object");
  }
  const record = result as Record<string, unknown>;
  if (typeof record.allowed !== "boolean") throw new Error("Memory profile build result allowed must be a boolean");
  if (record.decision === undefined) throw new Error("Memory profile build result decision must not be undefined");
  validateMemoryProfileTransaction(record.transaction, "Memory profile build result transaction", true);
}

function validateMemoryProfileTransaction(transaction: unknown, label: string, nullable = false): void {
  if (nullable && transaction === null) return;
  if (typeof transaction !== "object" || transaction === null || Array.isArray(transaction)) {
    throw new Error(`${label} must be an object${nullable ? " or null" : ""}`);
  }
  const record = transaction as Record<string, unknown>;
  validateNonEmptyString(record.to, `${label} to must not be empty`);
  if (typeof record.value !== "bigint") throw new Error(`${label} value must be a bigint`);
  validateNonEmptyString(record.data, `${label} data must not be empty`);
}

function validateOptionalString(value: unknown, message: string): void {
  if (value !== undefined && typeof value !== "string") throw new Error(message);
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
