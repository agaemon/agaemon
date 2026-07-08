import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createMemoryStorageBinding,
  verifyMemoryStorageBinding,
} from "../../memory/storageBinding.js";
import {
  createLocalMemoryStorageAdapter,
  storeAndVerifyMemoryRecord,
} from "../../memory/storageAdapter.js";

import type {
  CreateMemoryStorageBindingParams,
  MemoryStorageBinding,
  MemoryStorageBindingVerification,
  VerifyMemoryStorageBindingParams,
} from "../../memory/storageBinding.js";
import type {
  MemoryStorageAdapter,
  StoreAndVerifyMemoryRecordParams,
  StoredMemoryRecordVerificationResult,
} from "../../memory/storageAdapter.js";

const DEFAULT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";
const DEFAULT_STORAGE_DIR = "storage/memory";
const DEFAULT_MEMORY_ID_LABEL = "agentos.memory.binding-smoke";
const DEFAULT_CONTENT = "AgentOS memory storage binding smoke test";

export type MemoryStorageBindingCliFormat = "json" | "summary";

export interface MemoryStorageBindingCliArgs {
  manifestPath: string;
  storageDir: string;
  memoryIdLabel: string;
  content: string;
  outputPath?: string | undefined;
  format: MemoryStorageBindingCliFormat;
}

export interface MemoryStorageBindingCliReport {
  schemaVersion: 1;
  manifestPath: string;
  storageDir: string;
  memoryIdLabel: string;
  binding: MemoryStorageBinding;
  verification: MemoryStorageBindingVerification;
}

export interface MemoryStorageBindingCliOptions {
  argv?: readonly string[] | undefined;
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  writeText?: (path: string, contents: string) => Promise<void>;
  mkdirp?: (path: string) => Promise<void>;
  createAdapter?: (rootDir: string) => MemoryStorageAdapter;
  storeAndVerify?: (params: StoreAndVerifyMemoryRecordParams) => Promise<StoredMemoryRecordVerificationResult>;
  createBinding?: (params: CreateMemoryStorageBindingParams) => MemoryStorageBinding;
  verifyBinding?: (params: VerifyMemoryStorageBindingParams) => MemoryStorageBindingVerification;
}

if (isMemoryStorageBindingDirectRun(import.meta.url, process.argv)) await runMemoryStorageBindingCli();

export function parseMemoryStorageBindingCliArgs(argv: readonly string[]): MemoryStorageBindingCliArgs {
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
    const equals = arg.match(/^(--manifest|--storage-dir|--memory-id-label|--content|--output|--format)=(.*)$/u);
    if (equals !== null) {
      setOption(values, equals[1]!, equals[2]!);
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }

  return {
    manifestPath: values.get("--manifest") ?? DEFAULT_MANIFEST_PATH,
    storageDir: values.get("--storage-dir") ?? DEFAULT_STORAGE_DIR,
    memoryIdLabel: values.get("--memory-id-label") ?? DEFAULT_MEMORY_ID_LABEL,
    content: values.get("--content") ?? DEFAULT_CONTENT,
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
    format: readFormat(values.get("--format") ?? "json"),
  };
}

export async function runMemoryStorageBindingCli(
  options: MemoryStorageBindingCliOptions = {},
): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => { process.exitCode = code; });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const writeText = options.writeText ?? writeFile;
  const mkdirp = options.mkdirp ?? ((path: string) => mkdir(path, { recursive: true }));
  const createAdapter = options.createAdapter ?? ((rootDir: string) => createLocalMemoryStorageAdapter({ rootDir }));
  const storeAndVerify = options.storeAndVerify ?? storeAndVerifyMemoryRecord;
  const createBinding = options.createBinding ?? createMemoryStorageBinding;
  const verifyBinding = options.verifyBinding ?? verifyMemoryStorageBinding;

  validateOutputWriter(writeOutput);
  validateExitCodeSetter(setExitCode);
  validateTextReader(readText);
  validateTextWriter(writeText);
  validateDirectoryCreator(mkdirp);
  validateAdapterFactory(createAdapter);
  validateStoreAndVerify(storeAndVerify);
  validateBindingCreator(createBinding);
  validateBindingVerifier(verifyBinding);
  const args = parseMemoryStorageBindingCliArgs(argv);

  const deploymentManifestJson = await readText(args.manifestPath);
  validateNonEmptyString(deploymentManifestJson, "Deployment manifest JSON must not be empty");
  const adapter = createAdapter(args.storageDir);
  const storageVerification = await storeAndVerify({
    adapter,
    memoryIdLabel: args.memoryIdLabel,
    content: args.content,
  });
  validateStorageVerification(storageVerification);
  const binding = createBinding({
    deploymentManifestPath: args.manifestPath,
    deploymentManifestJson,
    memoryIdLabel: args.memoryIdLabel,
    verification: storageVerification,
  });
  validateBinding(binding);
  const verification = verifyBinding({
    binding,
    deploymentManifestJson,
    verification: storageVerification,
  });
  validateBindingVerification(verification);
  const report: MemoryStorageBindingCliReport = {
    schemaVersion: 1,
    manifestPath: args.manifestPath,
    storageDir: args.storageDir,
    memoryIdLabel: args.memoryIdLabel,
    binding,
    verification,
  };

  if (args.outputPath !== undefined) {
    await mkdirp(dirname(args.outputPath));
    await writeText(args.outputPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  writeOutput(formatMemoryStorageBindingCliOutput(report, args.format));
  if (!verification.passed) setExitCode(1);
}

export function formatMemoryStorageBindingCliOutput(
  report: MemoryStorageBindingCliReport,
  format: MemoryStorageBindingCliFormat,
): string {
  validateFormat(format);
  validateReport(report);
  if (format === "json") return JSON.stringify(report, null, 2);
  return [
    "Memory storage binding",
    `manifest: ${report.manifestPath}`,
    `storage: ${report.binding.record.storageURI}`,
    `overall: ${report.verification.passed ? "passed" : "failed"}`,
    ...report.verification.failures.map((failure) => `failure: ${failure}`),
  ].join("\n");
}

export function isMemoryStorageBindingDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateStringArray(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function isValueFlag(arg: string): boolean {
  return arg === "--manifest" || arg === "--storage-dir" || arg === "--memory-id-label" ||
    arg === "--content" || arg === "--output" || arg === "--format";
}

function setOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function readFormat(value: string): MemoryStorageBindingCliFormat {
  validateFormat(value, "--format must be json or summary");
  return value;
}

function validateFormat(
  value: unknown,
  message = "Memory storage binding output format must be json or summary",
): asserts value is MemoryStorageBindingCliFormat {
  if (value !== "json" && value !== "summary") throw new Error(message);
}

function validateOptions(options: unknown): asserts options is MemoryStorageBindingCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Memory storage binding options must be an object");
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

function validateTextReader(readText: unknown): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") throw new Error("Text reader must be a function");
}

function validateTextWriter(writeText: unknown): asserts writeText is (path: string, contents: string) => Promise<void> {
  if (typeof writeText !== "function") throw new Error("Text writer must be a function");
}

function validateDirectoryCreator(mkdirp: unknown): asserts mkdirp is (path: string) => Promise<void> {
  if (typeof mkdirp !== "function") throw new Error("Directory creator must be a function");
}

function validateAdapterFactory(createAdapter: unknown): asserts createAdapter is (rootDir: string) => MemoryStorageAdapter {
  if (typeof createAdapter !== "function") throw new Error("Memory storage adapter factory must be a function");
}

function validateStoreAndVerify(
  storeAndVerify: unknown,
): asserts storeAndVerify is (params: StoreAndVerifyMemoryRecordParams) => Promise<StoredMemoryRecordVerificationResult> {
  if (typeof storeAndVerify !== "function") throw new Error("Memory storage verifier must be a function");
}

function validateBindingCreator(
  createBinding: unknown,
): asserts createBinding is (params: CreateMemoryStorageBindingParams) => MemoryStorageBinding {
  if (typeof createBinding !== "function") throw new Error("Memory storage binding creator must be a function");
}

function validateBindingVerifier(
  verifyBinding: unknown,
): asserts verifyBinding is (params: VerifyMemoryStorageBindingParams) => MemoryStorageBindingVerification {
  if (typeof verifyBinding !== "function") throw new Error("Memory storage binding verifier must be a function");
}

function validateStorageVerification(value: unknown): asserts value is StoredMemoryRecordVerificationResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Stored memory verification must be an object");
  }
  const record = value as StoredMemoryRecordVerificationResult;
  if (record.ok !== true) throw new Error("Stored memory verification must be ok");
  validateNonEmptyString(record.record.storageURI, "Stored memory verification storageURI must not be empty");
  validateNonEmptyString(record.record.contentHash, "Stored memory verification contentHash must not be empty");
}

function validateBinding(value: unknown): asserts value is MemoryStorageBinding {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Memory storage binding must be an object");
  }
  const binding = value as MemoryStorageBinding;
  if (binding.schemaVersion !== 1) throw new Error("Memory storage binding schemaVersion must be 1");
  validateNonEmptyString(binding.memoryIdLabel, "Memory storage binding memoryIdLabel must not be empty");
  validateNonEmptyString(binding.record.storageURI, "Memory storage binding storageURI must not be empty");
}

function validateBindingVerification(value: unknown): asserts value is MemoryStorageBindingVerification {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Memory storage binding verification must be an object");
  }
  const verification = value as MemoryStorageBindingVerification;
  if (typeof verification.passed !== "boolean") {
    throw new Error("Memory storage binding verification passed must be a boolean");
  }
  if (!Array.isArray(verification.failures) || verification.failures.some((failure) => typeof failure !== "string")) {
    throw new Error("Memory storage binding verification failures must be strings");
  }
}

function validateReport(report: unknown): asserts report is MemoryStorageBindingCliReport {
  if (typeof report !== "object" || report === null || Array.isArray(report)) {
    throw new Error("Memory storage binding report must be an object");
  }
  const candidate = report as MemoryStorageBindingCliReport;
  if (candidate.schemaVersion !== 1) throw new Error("Memory storage binding report schemaVersion must be 1");
  validateNonEmptyString(candidate.manifestPath, "Memory storage binding report manifest path must not be empty");
  validateNonEmptyString(candidate.storageDir, "Memory storage binding report storage dir must not be empty");
  validateNonEmptyString(candidate.memoryIdLabel, "Memory storage binding report memory ID label must not be empty");
  validateBinding(candidate.binding);
  validateBindingVerification(candidate.verification);
}

function validateNonEmptyString(value: unknown, message: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) throw new Error(message);
}
