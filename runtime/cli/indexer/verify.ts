import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readDeploymentManifest } from "../../base/deploymentManifest.js";
import {
  formatAgentOsEventIndexVerificationSummary,
  verifyAgentOsEventIndex,
} from "../../indexer/verify.js";

import type { DeploymentManifest } from "../../base/deploymentManifest.js";
import type { AgentOsEventIndex } from "../../indexer/events.js";
import type {
  AgentOsEventIndexVerification,
  VerifyAgentOsEventIndexParams,
} from "../../indexer/verify.js";

const DEFAULT_INDEX_PATH = "artifacts/base-event-index.json";
const DEFAULT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";

export type EventIndexVerifyCliFormat = "json" | "summary";

export interface EventIndexVerifyCliArgs {
  indexPath: string;
  manifestPath: string;
  fromBlock?: bigint | undefined;
  toBlock?: bigint | undefined;
  expectedSha256?: string | undefined;
  outputPath?: string | undefined;
  format: EventIndexVerifyCliFormat;
}

export interface EventIndexVerifyCliOptions {
  argv?: readonly string[] | undefined;
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  readManifest?: (path: string) => Promise<DeploymentManifest>;
  writeText?: (path: string, contents: string) => Promise<void>;
  mkdirp?: (path: string) => Promise<void>;
  verifyIndex?: (params: VerifyAgentOsEventIndexParams) => AgentOsEventIndexVerification;
}

if (isEventIndexVerifyDirectRun(import.meta.url, process.argv)) await runEventIndexVerifyCli();

export async function runEventIndexVerifyCli(options: EventIndexVerifyCliOptions = {}): Promise<void> {
  validateEventIndexVerifyOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => { process.exitCode = code; });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const readManifest = options.readManifest ?? readDeploymentManifest;
  const writeText = options.writeText ?? writeFile;
  const mkdirp = options.mkdirp ?? ((path: string) => mkdir(path, { recursive: true }));
  const verifyIndex = options.verifyIndex ?? verifyAgentOsEventIndex;

  validateStringArray(argv, "CLI argv must be an array of strings");
  validateOutputWriter(writeOutput);
  const args = parseEventIndexVerifyCliArgs(argv);
  const [indexJson, manifest] = await Promise.all([
    readText(args.indexPath),
    readManifest(args.manifestPath),
  ]);
  const store = {
    path: args.indexPath,
    sha256: createHash("sha256").update(indexJson).digest("hex"),
  };
  const verification = verifyIndex({
    index: JSON.parse(indexJson) as AgentOsEventIndex,
    manifest,
    expectedManifestPath: args.manifestPath,
    ...(args.fromBlock === undefined ? {} : { expectedFromBlock: args.fromBlock }),
    ...(args.toBlock === undefined ? {} : { expectedToBlock: args.toBlock }),
    store,
    ...(args.expectedSha256 === undefined ? {} : { expectedStoreSha256: args.expectedSha256 }),
  });

  if (args.outputPath !== undefined) {
    await mkdirp(dirname(args.outputPath));
    await writeText(args.outputPath, `${JSON.stringify(verification, null, 2)}\n`);
  }

  writeOutput(formatEventIndexVerifyCliOutput(verification, args.format));

  if (!verification.passed) {
    validateExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseEventIndexVerifyCliArgs(argv: readonly string[]): EventIndexVerifyCliArgs {
  validateStringArray(argv, "CLI argv must be an array of strings");
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (isValueFlag(arg)) {
      setOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }
    const equals = arg.match(/^(--index|--manifest|--from-block|--to-block|--expected-sha256|--output|--format)=(.*)$/u);
    if (equals !== null) {
      setOption(values, equals[1]!, equals[2]!);
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }

  return {
    indexPath: values.get("--index") ?? DEFAULT_INDEX_PATH,
    manifestPath: values.get("--manifest") ?? DEFAULT_MANIFEST_PATH,
    ...(values.has("--from-block") ? { fromBlock: readBlock(values.get("--from-block")!, "--from-block") } : {}),
    ...(values.has("--to-block") ? { toBlock: readBlock(values.get("--to-block")!, "--to-block") } : {}),
    ...(values.has("--expected-sha256") ? { expectedSha256: values.get("--expected-sha256")! } : {}),
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
    format: readFormat(values.get("--format") ?? "json"),
  };
}

export function formatEventIndexVerifyCliOutput(
  report: AgentOsEventIndexVerification,
  format: EventIndexVerifyCliFormat,
): string {
  validateFormat(format);
  return format === "summary" ? formatAgentOsEventIndexVerificationSummary(report) : JSON.stringify(report, null, 2);
}

export function isEventIndexVerifyDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateStringArray(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function isValueFlag(arg: string): boolean {
  return arg === "--index" || arg === "--manifest" || arg === "--from-block" || arg === "--to-block" ||
    arg === "--expected-sha256" || arg === "--output" || arg === "--format";
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

function readFormat(value: string): EventIndexVerifyCliFormat {
  validateFormat(value, "--format must be json or summary");
  return value;
}

function validateFormat(value: unknown, message = "Event index verify output format must be json or summary"): asserts value is EventIndexVerifyCliFormat {
  if (value !== "json" && value !== "summary") throw new Error(message);
}

function validateEventIndexVerifyOptions(options: unknown): asserts options is EventIndexVerifyCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Event index verify options must be an object");
  }
}

function validateStringArray(value: unknown, message: string): asserts value is readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) throw new Error(message);
}

function validateOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") throw new Error("Exit code setter must be a function");
}
