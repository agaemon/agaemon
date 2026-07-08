import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readDeploymentManifest } from "../../base/deploymentManifest.js";
import {
  loadManifestVerifyDotEnv,
  readRequiredManifestVerifyEnv,
} from "../base/manifestVerify.js";
import {
  createAgentOsEventIndexPublicClient,
  formatAgentOsEventIndexSummary,
  replayAgentOsEventIndex,
  writeAgentOsEventIndex,
} from "../../indexer/replay.js";

import type { DeploymentManifest } from "../../base/deploymentManifest.js";
import type { AgentOsEventIndex, AgentOsEventIndexStoreMetadata } from "../../indexer/events.js";
import type {
  AgentOsEventIndexLogClient,
  ReplayAgentOsEventIndexParams,
} from "../../indexer/replay.js";

const DEFAULT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";
const DEFAULT_OUTPUT_PATH = "artifacts/base-event-index.json";

export type EventIndexReplayCliFormat = "json" | "summary";

export interface EventIndexReplayCliArgs {
  manifestPath: string;
  outputPath: string;
  fromBlock: bigint;
  toBlock?: bigint | undefined;
  format: EventIndexReplayCliFormat;
}

export interface EventIndexReplayCliOptions {
  argv?: readonly string[] | undefined;
  env?: Record<string, string | undefined> | undefined;
  writeOutput?: (output: string) => void;
  loadDotEnv?: (path: string, env: Record<string, string | undefined>) => void;
  readManifest?: (path: string) => Promise<DeploymentManifest>;
  createClient?: (rpcUrl: string) => AgentOsEventIndexLogClient;
  replayIndex?: (params: ReplayAgentOsEventIndexParams) => Promise<AgentOsEventIndex>;
  writeIndex?: (params: Parameters<typeof writeAgentOsEventIndex>[0]) =>
    Promise<AgentOsEventIndexStoreMetadata | void>;
}

if (isEventIndexReplayDirectRun(import.meta.url, process.argv)) await runEventIndexReplayCli();

export async function runEventIndexReplayCli(options: EventIndexReplayCliOptions = {}): Promise<void> {
  validateEventIndexReplayOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const env = options.env ?? process.env;
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const loadDotEnv = options.loadDotEnv ?? loadManifestVerifyDotEnv;
  const readManifest = options.readManifest ?? readDeploymentManifest;
  const createClient = options.createClient ?? createAgentOsEventIndexPublicClient;
  const replayIndex = options.replayIndex ?? replayAgentOsEventIndex;
  const writeIndex = options.writeIndex ?? writeAgentOsEventIndex;

  validateStringArray(argv, "CLI argv must be an array of strings");
  validateEnv(env);
  validateOutputWriter(writeOutput);
  const args = parseEventIndexReplayCliArgs(argv);

  loadDotEnv(".env", env);
  const manifest = await readManifest(args.manifestPath);
  const rpcUrl = readRequiredManifestVerifyEnv(env, manifest.rpcUrlEnv);
  const index = await replayIndex({
    manifest,
    manifestPath: args.manifestPath,
    fromBlock: args.fromBlock,
    ...(args.toBlock === undefined ? {} : { toBlock: args.toBlock }),
    client: createClient(rpcUrl),
  });

  const store = await writeIndex({ path: args.outputPath, index });
  writeOutput(formatEventIndexReplayCliOutput(index, args.format, store ?? undefined));
}

export function parseEventIndexReplayCliArgs(argv: readonly string[]): EventIndexReplayCliArgs {
  validateStringArray(argv, "CLI argv must be an array of strings");
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (isEventIndexValueFlag(arg)) {
      setOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }
    const equals = arg.match(/^(--manifest|--output|--from-block|--to-block|--format)=(.*)$/u);
    if (equals !== null) {
      setOption(values, equals[1]!, equals[2]!);
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }

  const fromBlock = values.get("--from-block");
  if (fromBlock === undefined) throw new Error("--from-block is required");

  return {
    manifestPath: values.get("--manifest") ?? DEFAULT_MANIFEST_PATH,
    outputPath: values.get("--output") ?? DEFAULT_OUTPUT_PATH,
    fromBlock: readBlock(fromBlock, "--from-block"),
    ...(values.has("--to-block") ? { toBlock: readBlock(values.get("--to-block")!, "--to-block") } : {}),
    format: readFormat(values.get("--format") ?? "json"),
  };
}

export function formatEventIndexReplayCliOutput(
  index: AgentOsEventIndex,
  format: EventIndexReplayCliFormat,
  store?: AgentOsEventIndexStoreMetadata | undefined,
): string {
  validateFormat(format);
  return format === "summary" ? formatAgentOsEventIndexSummary(index, store) : JSON.stringify(index, null, 2);
}

export function isEventIndexReplayDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateStringArray(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function isEventIndexValueFlag(arg: string): boolean {
  return arg === "--manifest" || arg === "--output" || arg === "--from-block" || arg === "--to-block" ||
    arg === "--format";
}

function setOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function readBlock(value: string, flag: string): bigint {
  if (!/^\d+$/u.test(value)) throw new Error(`${flag} must be a non-negative integer`);
  return BigInt(value);
}

function readFormat(value: string): EventIndexReplayCliFormat {
  validateFormat(value, "--format must be json or summary");
  return value;
}

function validateFormat(
  value: unknown,
  message = "Event index replay output format must be json or summary",
): asserts value is EventIndexReplayCliFormat {
  if (value !== "json" && value !== "summary") throw new Error(message);
}

function validateEventIndexReplayOptions(options: unknown): asserts options is EventIndexReplayCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Event index replay options must be an object");
  }
}

function validateStringArray(value: unknown, message: string): asserts value is readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) throw new Error(message);
}

function validateEnv(value: unknown): asserts value is Record<string, string | undefined> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Environment must be an object");
}

function validateOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}
