import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createPublicClient as createViemPublicClient, http, keccak256, stringToHex } from "viem";
import type { Hex } from "viem";
import { baseSepolia } from "viem/chains";

import { AGENT_DIRECTORY_ABI, createAgentProfileCommitment } from "../../agentCore/directory.js";
import { createAgentProfileMemoryIdLabel } from "../../agentCore/profileMetadata.js";
import {
  readDeploymentManifest,
  requireAgentDirectory,
  requireMemoryRegistry,
} from "../../base/deploymentManifest.js";
import {
  readPublishedMemoryContent,
  verifyPublishedMemoryContent,
} from "../../memory/contentVerifier.js";
import type { PublishedMemoryVerification } from "../../memory/contentVerifier.js";
import { MEMORY_REGISTRY_ABI } from "../../memory/commitment.js";

const DEFAULT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";
const DEFAULT_STORAGE_DIR = "storage/memory";
const DEFAULT_ROLE_LABEL = "agentos.kernel.operator";

export interface MemoryProfileVerifyCliArgs {
  manifestPath: string;
  metadataURI?: string | undefined;
  roleLabel?: string | undefined;
  memoryIdLabel?: string | undefined;
  storageDir?: string | undefined;
  ipfsGatewayUrl?: string | undefined;
}

export interface MemoryProfileVerifyCliOptions {
  argv?: readonly string[];
  env?: Record<string, string | undefined>;
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  loadDotEnv?: (path: string, env: Record<string, string | undefined>) => void;
  readDeploymentManifest?: (path: string) => Promise<MemoryProfileVerifyManifest>;
  requireAgentDirectory?: (manifest: MemoryProfileVerifyManifest) => string;
  requireMemoryRegistry?: (manifest: MemoryProfileVerifyManifest) => string;
  readPublishedMemoryContent?: (params: { storageURI: string; localRootDir: string; ipfsGatewayUrl?: string | undefined }) => Promise<string>;
  verifyPublishedMemoryContent?: (params: {
    memoryIdLabel: string;
    storageURI: string;
    content: string;
    commitment: { memoryId: Hex; merkleRoot: Hex; contentHash: Hex; storageURIHash: Hex };
  }) => PublishedMemoryVerification;
  createPublicClient?: (rpcUrl: string) => MemoryProfileVerifyPublicClient;
}

interface MemoryProfileVerifyManifest {
  chainId: number;
  rpcUrlEnv: string;
  owner?: string;
  contracts: { agentAccount: string };
}

interface MemoryProfileVerifyPublicClient {
  getChainId: () => Promise<number>;
  readContract: (params: unknown) => Promise<unknown>;
}

if (isMemoryProfileVerifyDirectRun(import.meta.url, process.argv)) {
  await runMemoryProfileVerifyCli();
}

export async function runMemoryProfileVerifyCli(options: MemoryProfileVerifyCliOptions = {}): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  validateArgv(argv);
  const args = parseMemoryProfileVerifyCliArgs(argv);
  const env = options.env ?? process.env;
  validateEnv(env);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  validateOutputWriter(writeOutput);
  validateExitCodeSetter(setExitCode);
  const loadDotEnv = options.loadDotEnv ?? loadMemoryProfileVerifyDotEnv;
  const readManifest = options.readDeploymentManifest ?? readDeploymentManifest;
  const readDirectory = options.requireAgentDirectory ?? ((manifest: MemoryProfileVerifyManifest) =>
    requireAgentDirectory(manifest as Parameters<typeof requireAgentDirectory>[0]));
  const readMemoryRegistry = options.requireMemoryRegistry ?? ((manifest: MemoryProfileVerifyManifest) =>
    requireMemoryRegistry(manifest as Parameters<typeof requireMemoryRegistry>[0]));
  const readContent = options.readPublishedMemoryContent ?? readPublishedMemoryContent;
  const verifyContent = options.verifyPublishedMemoryContent ?? verifyPublishedMemoryContent;
  const createClient = options.createPublicClient ?? ((rpcUrl: string) =>
    createViemPublicClient({ chain: baseSepolia, transport: http(rpcUrl) }) as MemoryProfileVerifyPublicClient);
  validateDotEnvLoader(loadDotEnv);
  validateManifestReader(readManifest);
  validateDirectoryReader(readDirectory);
  validateMemoryRegistryReader(readMemoryRegistry);
  validatePublishedContentReader(readContent);
  validatePublishedContentVerifier(verifyContent);
  validatePublicClientFactory(createClient);

  loadDotEnv(".env", env);
  const manifest = await readManifest(args.manifestPath);
  const rpcUrl = env[manifest.rpcUrlEnv];
  if (rpcUrl === undefined || rpcUrl.length === 0) throw new Error(`${manifest.rpcUrlEnv} is required`);

  const agent = manifest.contracts.agentAccount;
  const directory = readDirectory(manifest);
  const memoryRegistry = readMemoryRegistry(manifest);
  const roleLabel = args.roleLabel ?? env.AGENT_ROLE_LABEL ?? DEFAULT_ROLE_LABEL;
  const storageURI = args.metadataURI ?? env.AGENT_METADATA_URI;
  if (storageURI === undefined || storageURI.length === 0) {
    throw new Error("AGENT_METADATA_URI is required");
  }
  const memoryIdLabel = args.memoryIdLabel ?? env.AGENT_PROFILE_MEMORY_ID_LABEL ?? createAgentProfileMemoryIdLabel(agent as `0x${string}`);
  const localRootDir = args.storageDir ?? env.LOCAL_MEMORY_STORAGE_DIR ?? DEFAULT_STORAGE_DIR;
  const ipfsGatewayUrl = args.ipfsGatewayUrl ?? env.IPFS_GATEWAY_URL;

  const content = await readContent({ storageURI, localRootDir, ipfsGatewayUrl });
  validateNonEmptyString(content, "Memory profile verification content must not be empty");
  const memoryId = keccak256(stringToHex(memoryIdLabel));
  const profileCommitment = createAgentProfileCommitment({ roleLabel, metadataURI: storageURI });
  const publicClient = createClient(rpcUrl);
  const chainId = await publicClient.getChainId();
  if (chainId !== manifest.chainId) throw new Error(`Connected to chain ${chainId}, expected ${manifest.chainId}`);

  const profile = await publicClient.readContract({
    address: directory,
    abi: AGENT_DIRECTORY_ABI,
    functionName: "profileOf",
    args: [agent],
  }) as readonly [Hex, Hex, boolean, boolean];
  const memory = await publicClient.readContract({
    address: memoryRegistry,
    abi: MEMORY_REGISTRY_ABI,
    functionName: "commitments",
    args: [agent, memoryId],
  }) as readonly [Hex, Hex, Hex, bigint, bigint, bigint];

  const verification = verifyContent({
    memoryIdLabel,
    storageURI,
    content,
    commitment: {
      memoryId,
      merkleRoot: memory[0],
      contentHash: memory[1],
      storageURIHash: memory[2],
    },
  });
  validateMemoryProfileVerificationResult(verification);
  const checks = {
    profileRegistered: profile[3],
    profileActive: profile[2],
    roleHashMatches: profile[0] === profileCommitment.roleHash,
    directoryMetadataURIHashMatches: profile[1] === verification.computed.storageURIHash,
    memoryCommitmentExists: memory[3] > 0n,
    ...verification.checks,
  };
  const ok = Object.values(checks).every(Boolean);

  writeOutput(JSON.stringify({
    chainId,
    agent,
    directory,
    memoryRegistry,
    roleLabel,
    storageURI,
    memoryIdLabel,
    content: {
      bytes: Buffer.byteLength(content, "utf8"),
      contentHash: verification.computed.contentHash,
    },
    directoryProfile: {
      roleHash: profile[0],
      metadataURIHash: profile[1],
      active: profile[2],
      registered: profile[3],
    },
    memoryCommitment: {
      memoryId,
      merkleRoot: memory[0],
      contentHash: memory[1],
      storageURIHash: memory[2],
      version: memory[3].toString(),
      blockNumber: memory[4].toString(),
      timestamp: memory[5].toString(),
    },
    computed: verification.computed,
    checks,
    ok,
  }, null, 2));

  if (!ok) setExitCode(1);
}

export function parseMemoryProfileVerifyCliArgs(argv: readonly string[]): MemoryProfileVerifyCliArgs {
  validateArgv(argv);
  const values = parseValues(argv, [
    "--manifest",
    "--metadata-uri",
    "--role-label",
    "--memory-id-label",
    "--storage-dir",
    "--ipfs-gateway-url",
  ]);
  return {
    manifestPath: values.get("--manifest") ?? DEFAULT_MANIFEST_PATH,
    metadataURI: values.get("--metadata-uri"),
    roleLabel: values.get("--role-label"),
    memoryIdLabel: values.get("--memory-id-label"),
    storageDir: values.get("--storage-dir"),
    ipfsGatewayUrl: values.get("--ipfs-gateway-url"),
  };
}

export function isMemoryProfileVerifyDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

export function loadMemoryProfileVerifyDotEnv(path: string, env: Record<string, string | undefined>): void {
  loadDotEnvFile(path, env);
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

function validateOptions(options: unknown): asserts options is MemoryProfileVerifyCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Memory profile verification options must be an object");
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
): asserts readManifest is (path: string) => Promise<MemoryProfileVerifyManifest> {
  if (typeof readManifest !== "function") throw new Error("Deployment manifest reader must be a function");
}

function validateDirectoryReader(
  readDirectory: unknown,
): asserts readDirectory is (manifest: MemoryProfileVerifyManifest) => string {
  if (typeof readDirectory !== "function") throw new Error("Agent directory reader must be a function");
}

function validateMemoryRegistryReader(
  readMemoryRegistry: unknown,
): asserts readMemoryRegistry is (manifest: MemoryProfileVerifyManifest) => string {
  if (typeof readMemoryRegistry !== "function") throw new Error("Memory registry reader must be a function");
}

function validatePublishedContentReader(
  readContent: unknown,
): asserts readContent is (params: { storageURI: string; localRootDir: string; ipfsGatewayUrl?: string | undefined }) => Promise<string> {
  if (typeof readContent !== "function") throw new Error("Published memory content reader must be a function");
}

function validatePublishedContentVerifier(
  verifyContent: unknown,
): asserts verifyContent is (params: {
  memoryIdLabel: string;
  storageURI: string;
  content: string;
  commitment: { memoryId: Hex; merkleRoot: Hex; contentHash: Hex; storageURIHash: Hex };
}) => PublishedMemoryVerification {
  if (typeof verifyContent !== "function") throw new Error("Published memory content verifier must be a function");
}

function validatePublicClientFactory(
  createClient: unknown,
): asserts createClient is (rpcUrl: string) => MemoryProfileVerifyPublicClient {
  if (typeof createClient !== "function") throw new Error("Public client factory must be a function");
}

function validateMemoryProfileVerificationResult(
  verification: unknown,
): asserts verification is PublishedMemoryVerification {
  if (typeof verification !== "object" || verification === null || Array.isArray(verification)) {
    throw new Error("Memory profile verification result must be an object");
  }
  const record = verification as Record<string, unknown>;
  if (typeof record.ok !== "boolean") throw new Error("Memory profile verification result ok must be a boolean");
  validateCommitment(record.computed, "Memory profile verification result computed");
  validateCommitment(record.expected, "Memory profile verification result expected");
  if (typeof record.checks !== "object" || record.checks === null || Array.isArray(record.checks)) {
    throw new Error("Memory profile verification result checks must be an object");
  }
  const checks = record.checks as Record<string, unknown>;
  for (const field of ["memoryIdMatches", "merkleRootMatches", "contentHashMatches", "storageURIHashMatches"] as const) {
    if (typeof checks[field] !== "boolean") {
      throw new Error(`Memory profile verification result check ${field} must be a boolean`);
    }
  }
}

function validateCommitment(commitment: unknown, label: string): void {
  if (typeof commitment !== "object" || commitment === null || Array.isArray(commitment)) {
    throw new Error(`${label} must be an object`);
  }
  const record = commitment as Record<string, unknown>;
  validateNonEmptyString(record.memoryId, `${label} memoryId must not be empty`);
  validateNonEmptyString(record.merkleRoot, `${label} merkleRoot must not be empty`);
  validateNonEmptyString(record.contentHash, `${label} contentHash must not be empty`);
  validateNonEmptyString(record.storageURIHash, `${label} storageURIHash must not be empty`);
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
