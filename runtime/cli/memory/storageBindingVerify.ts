import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyMemoryStorageBinding } from "../../memory/storageBinding.js";
import {
  createLocalMemoryStorageAdapter,
  verifyStoredMemoryRecord,
} from "../../memory/storageAdapter.js";

import type {
  MemoryStorageBinding,
  MemoryStorageBindingVerification,
  VerifyMemoryStorageBindingParams,
} from "../../memory/storageBinding.js";
import type {
  MemoryStorageAdapter,
  StoredMemoryRecord,
  StoredMemoryRecordVerificationResult,
  VerifyStoredMemoryRecordParams,
} from "../../memory/storageAdapter.js";
import type { MemoryStorageBindingCliReport } from "./storageBinding.js";

const DEFAULT_BINDING_PATH = "artifacts/memory-storage-binding.json";

export type MemoryStorageBindingVerifyCliFormat = "json" | "summary";

export interface MemoryStorageBindingVerifyCliArgs {
  bindingPath: string;
  manifestPath?: string | undefined;
  storageDir?: string | undefined;
  outputPath?: string | undefined;
  format: MemoryStorageBindingVerifyCliFormat;
}

export interface MemoryStorageBindingVerifyCliReport {
  schemaVersion: 1;
  bindingPath: string;
  manifestPath: string;
  storageDir: string;
  passed: boolean;
  failures: string[];
  bindingVerification: MemoryStorageBindingVerification | null;
  storageVerification?: {
    ok: boolean;
    checks: StoredMemoryRecordVerificationResult["verification"]["checks"];
  } | undefined;
}

export interface MemoryStorageBindingVerifyCliOptions {
  argv?: readonly string[] | undefined;
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  writeText?: (path: string, contents: string) => Promise<void>;
  mkdirp?: (path: string) => Promise<void>;
  createAdapter?: (rootDir: string) => MemoryStorageAdapter;
  verifyStored?: (params: VerifyStoredMemoryRecordParams) => Promise<StoredMemoryRecordVerificationResult>;
  verifyBinding?: (params: VerifyMemoryStorageBindingParams) => MemoryStorageBindingVerification;
}

if (isMemoryStorageBindingVerifyDirectRun(import.meta.url, process.argv)) {
  await runMemoryStorageBindingVerifyCli();
}

export function parseMemoryStorageBindingVerifyCliArgs(
  argv: readonly string[],
): MemoryStorageBindingVerifyCliArgs {
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
    const equals = arg.match(/^(--binding|--manifest|--storage-dir|--output|--format)=(.*)$/u);
    if (equals !== null) {
      setOption(values, equals[1]!, equals[2]!);
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }

  return {
    bindingPath: values.get("--binding") ?? DEFAULT_BINDING_PATH,
    ...(values.has("--manifest") ? { manifestPath: values.get("--manifest")! } : {}),
    ...(values.has("--storage-dir") ? { storageDir: values.get("--storage-dir")! } : {}),
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
    format: readFormat(values.get("--format") ?? "json"),
  };
}

export async function runMemoryStorageBindingVerifyCli(
  options: MemoryStorageBindingVerifyCliOptions = {},
): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => { process.exitCode = code; });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const writeText = options.writeText ?? writeFile;
  const mkdirp = options.mkdirp ?? ((path: string) => mkdir(path, { recursive: true }));
  const createAdapter = options.createAdapter ?? ((rootDir: string) => createLocalMemoryStorageAdapter({ rootDir }));
  const verifyStored = options.verifyStored ?? verifyStoredMemoryRecord;
  const verifyBinding = options.verifyBinding ?? verifyMemoryStorageBinding;

  validateOutputWriter(writeOutput);
  validateExitCodeSetter(setExitCode);
  validateTextReader(readText);
  validateTextWriter(writeText);
  validateDirectoryCreator(mkdirp);
  validateAdapterFactory(createAdapter);
  validateStoredVerifier(verifyStored);
  validateBindingVerifier(verifyBinding);

  const args = parseMemoryStorageBindingVerifyCliArgs(argv);
  const sourceReport = parseBindingReport(await readText(args.bindingPath));
  const manifestPath = args.manifestPath ?? sourceReport.manifestPath;
  const storageDir = args.storageDir ?? sourceReport.storageDir;
  const deploymentManifestJson = await readText(manifestPath);
  validateNonEmptyString(deploymentManifestJson, "Deployment manifest JSON must not be empty");

  const adapter = createAdapter(storageDir);
  const storage = await verifyStoredBindingRecord({
    adapter,
    binding: sourceReport.binding,
    memoryIdLabel: sourceReport.memoryIdLabel,
    verifyStored,
  });
  const bindingVerification = storage.verification === null
    ? null
    : verifyBinding({
      binding: sourceReport.binding,
      deploymentManifestJson,
      verification: storage.verification,
    });
  if (bindingVerification !== null) validateBindingVerification(bindingVerification);

  const failures = [
    ...storage.failures,
    ...(bindingVerification?.failures ?? []),
  ];
  const report: MemoryStorageBindingVerifyCliReport = {
    schemaVersion: 1,
    bindingPath: args.bindingPath,
    manifestPath,
    storageDir,
    passed: failures.length === 0 && bindingVerification?.passed === true,
    failures: uniqueFailures(failures),
    bindingVerification,
    ...(storage.verification === null ? {} : {
      storageVerification: {
        ok: storage.verification.ok,
        checks: storage.verification.verification.checks,
      },
    }),
  };

  if (args.outputPath !== undefined) {
    await mkdirp(dirname(args.outputPath));
    await writeText(args.outputPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  writeOutput(formatMemoryStorageBindingVerifyCliOutput(report, args.format));
  if (!report.passed) setExitCode(1);
}

export function formatMemoryStorageBindingVerifyCliOutput(
  report: MemoryStorageBindingVerifyCliReport,
  format: MemoryStorageBindingVerifyCliFormat,
): string {
  validateFormat(format);
  validateReport(report);
  if (format === "json") return JSON.stringify(report, null, 2);
  return [
    "Memory storage binding verification",
    `binding: ${report.bindingPath}`,
    `manifest: ${report.manifestPath}`,
    `overall: ${report.passed ? "passed" : "failed"}`,
    ...report.failures.map((failure) => `failure: ${failure}`),
  ].join("\n");
}

export function isMemoryStorageBindingVerifyDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateStringArray(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

interface StoredBindingRecordVerification {
  verification: StoredMemoryRecordVerificationResult | null;
  failures: string[];
}

async function verifyStoredBindingRecord(params: {
  adapter: MemoryStorageAdapter;
  binding: MemoryStorageBinding;
  memoryIdLabel: string;
  verifyStored: (params: VerifyStoredMemoryRecordParams) => Promise<StoredMemoryRecordVerificationResult>;
}): Promise<StoredBindingRecordVerification> {
  if (params.binding.record.publisher !== "local") {
    return {
      verification: null,
      failures: ["only local memory storage bindings can be verified by this command"],
    };
  }

  try {
    const verification = await params.verifyStored({
      adapter: params.adapter,
      memoryIdLabel: params.memoryIdLabel,
      record: params.binding.record as StoredMemoryRecord,
    });
    validateStorageVerification(verification);
    return { verification, failures: [] };
  } catch (error) {
    return { verification: null, failures: [errorMessage(error)] };
  }
}

function parseBindingReport(json: string): MemoryStorageBindingCliReport {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (error) {
    throw new Error(`Memory storage binding report JSON is malformed: ${errorMessage(error)}`);
  }
  validateBindingReport(value);
  return value;
}

function isValueFlag(arg: string): boolean {
  return arg === "--binding" || arg === "--manifest" || arg === "--storage-dir" ||
    arg === "--output" || arg === "--format";
}

function setOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function readFormat(value: string): MemoryStorageBindingVerifyCliFormat {
  validateFormat(value, "--format must be json or summary");
  return value;
}

function validateFormat(
  value: unknown,
  message = "Memory storage binding verification output format must be json or summary",
): asserts value is MemoryStorageBindingVerifyCliFormat {
  if (value !== "json" && value !== "summary") throw new Error(message);
}

function validateOptions(options: unknown): asserts options is MemoryStorageBindingVerifyCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Memory storage binding verification options must be an object");
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

function validateStoredVerifier(
  verifyStored: unknown,
): asserts verifyStored is (params: VerifyStoredMemoryRecordParams) => Promise<StoredMemoryRecordVerificationResult> {
  if (typeof verifyStored !== "function") throw new Error("Stored memory verifier must be a function");
}

function validateBindingVerifier(
  verifyBinding: unknown,
): asserts verifyBinding is (params: VerifyMemoryStorageBindingParams) => MemoryStorageBindingVerification {
  if (typeof verifyBinding !== "function") throw new Error("Memory storage binding verifier must be a function");
}

function validateBindingReport(value: unknown): asserts value is MemoryStorageBindingCliReport {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Memory storage binding report must be an object");
  }
  const report = value as MemoryStorageBindingCliReport;
  if (report.schemaVersion !== 1) throw new Error("Memory storage binding report schemaVersion must be 1");
  validateNonEmptyString(report.manifestPath, "Memory storage binding report manifest path must not be empty");
  validateNonEmptyString(report.storageDir, "Memory storage binding report storage dir must not be empty");
  validateNonEmptyString(report.memoryIdLabel, "Memory storage binding report memory ID label must not be empty");
  validateBinding(report.binding);
}

function validateBinding(value: unknown): asserts value is MemoryStorageBinding {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Memory storage binding must be an object");
  }
  const binding = value as MemoryStorageBinding;
  if (binding.schemaVersion !== 1) throw new Error("Memory storage binding schemaVersion must be 1");
  validateNonEmptyString(binding.memoryIdLabel, "Memory storage binding memoryIdLabel must not be empty");
  validateNonEmptyString(binding.record.publisher, "Memory storage binding publisher must not be empty");
  validateNonEmptyString(binding.record.storageURI, "Memory storage binding storageURI must not be empty");
}

function validateStorageVerification(value: unknown): asserts value is StoredMemoryRecordVerificationResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Stored memory verification must be an object");
  }
  const verification = value as StoredMemoryRecordVerificationResult;
  if (verification.ok !== true) throw new Error("Stored memory verification must be ok");
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

function validateReport(report: unknown): asserts report is MemoryStorageBindingVerifyCliReport {
  if (typeof report !== "object" || report === null || Array.isArray(report)) {
    throw new Error("Memory storage binding verification report must be an object");
  }
  const candidate = report as MemoryStorageBindingVerifyCliReport;
  if (candidate.schemaVersion !== 1) {
    throw new Error("Memory storage binding verification report schemaVersion must be 1");
  }
  validateNonEmptyString(candidate.bindingPath, "Memory storage binding verification report binding path must not be empty");
  validateNonEmptyString(candidate.manifestPath, "Memory storage binding verification report manifest path must not be empty");
  validateNonEmptyString(candidate.storageDir, "Memory storage binding verification report storage dir must not be empty");
  if (typeof candidate.passed !== "boolean") {
    throw new Error("Memory storage binding verification report passed must be a boolean");
  }
  if (!Array.isArray(candidate.failures) || candidate.failures.some((failure) => typeof failure !== "string")) {
    throw new Error("Memory storage binding verification report failures must be strings");
  }
  if (candidate.bindingVerification !== null) validateBindingVerification(candidate.bindingVerification);
}

function validateNonEmptyString(value: unknown, message: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) throw new Error(message);
}

function uniqueFailures(failures: string[]): string[] {
  return [...new Set(failures)];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
