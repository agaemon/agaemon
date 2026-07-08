import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyMemoryStorageMigration } from "../../memory/storageMigration.js";

import type {
  MemoryStorageMigrationVerification,
  VerifyMemoryStorageMigrationParams,
} from "../../memory/storageMigration.js";
import type {
  MemoryStorageBinding,
} from "../../memory/storageBinding.js";
import type { MemoryStorageBindingCliReport } from "./storageBinding.js";

export type MemoryStorageMigrationVerifyCliFormat = "json" | "summary";

export interface MemoryStorageMigrationVerifyCliArgs {
  fromPath: string;
  toPath: string;
  outputPath?: string | undefined;
  format: MemoryStorageMigrationVerifyCliFormat;
}

export interface MemoryStorageMigrationVerifyCliReport {
  schemaVersion: 1;
  fromPath: string;
  toPath: string;
  passed: boolean;
  failures: string[];
  from: MemoryStorageBinding;
  to: MemoryStorageBinding;
  verification: MemoryStorageMigrationVerification;
}

export interface MemoryStorageMigrationVerifyCliOptions {
  argv?: readonly string[] | undefined;
  env?: Record<string, string | undefined> | undefined;
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  writeText?: (path: string, contents: string) => Promise<void>;
  mkdirp?: (path: string) => Promise<void>;
  verifyMigration?: (params: VerifyMemoryStorageMigrationParams) => MemoryStorageMigrationVerification;
}

if (isMemoryStorageMigrationVerifyDirectRun(import.meta.url, process.argv)) {
  await runMemoryStorageMigrationVerifyCli();
}

export function parseMemoryStorageMigrationVerifyCliArgs(
  argv: readonly string[],
): MemoryStorageMigrationVerifyCliArgs {
  validateStringArray(argv, "CLI argv must be an array of strings");
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (arg === "--from" || arg === "--to" || arg === "--output" || arg === "--format") {
      setOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }
    const equals = arg.match(/^(--from|--to|--output|--format)=(.*)$/u);
    if (equals !== null) {
      setOption(values, equals[1]!, equals[2]!);
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }

  if (!values.has("--from")) throw new Error("--from requires a value");
  if (!values.has("--to")) throw new Error("--to requires a value");

  return {
    fromPath: values.get("--from")!,
    toPath: values.get("--to")!,
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
    format: readFormat(values.get("--format") ?? "json"),
  };
}

export async function runMemoryStorageMigrationVerifyCli(
  options: MemoryStorageMigrationVerifyCliOptions = {},
): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => { process.exitCode = code; });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const writeText = options.writeText ?? writeFile;
  const mkdirp = options.mkdirp ?? ((path: string) => mkdir(path, { recursive: true }));
  const verifyMigration = options.verifyMigration ?? verifyMemoryStorageMigration;

  validateOutputWriter(writeOutput);
  validateExitCodeSetter(setExitCode);
  validateTextReader(readText);
  validateTextWriter(writeText);
  validateDirectoryCreator(mkdirp);
  validateMigrationVerifier(verifyMigration);

  const args = parseMemoryStorageMigrationVerifyCliArgs(argv);
  const fromReport = parseBindingReport(await readText(args.fromPath), "source");
  const toReport = parseBindingReport(await readText(args.toPath), "target");
  const verification = verifyMigration({
    from: fromReport.binding,
    to: toReport.binding,
  });
  validateMigrationVerification(verification);
  const failures = uniqueFailures(verification.failures);
  const report: MemoryStorageMigrationVerifyCliReport = {
    schemaVersion: 1,
    fromPath: args.fromPath,
    toPath: args.toPath,
    passed: verification.passed && failures.length === 0,
    failures,
    from: fromReport.binding,
    to: toReport.binding,
    verification,
  };

  if (args.outputPath !== undefined) {
    await mkdirp(dirname(args.outputPath));
    await writeText(args.outputPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  writeOutput(formatMemoryStorageMigrationVerifyCliOutput(report, args.format));
  if (!report.passed) setExitCode(1);
}

export function formatMemoryStorageMigrationVerifyCliOutput(
  report: MemoryStorageMigrationVerifyCliReport,
  format: MemoryStorageMigrationVerifyCliFormat,
): string {
  validateFormat(format);
  validateReport(report);
  if (format === "json") return JSON.stringify(report, null, 2);
  return [
    "Memory storage migration verification",
    `from: ${report.fromPath}`,
    `to: ${report.toPath}`,
    `overall: ${report.passed ? "passed" : "failed"}`,
    ...report.failures.map((failure) => `failure: ${failure}`),
  ].join("\n");
}

export function isMemoryStorageMigrationVerifyDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateStringArray(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function parseBindingReport(json: string, label: "source" | "target"): MemoryStorageBindingCliReport {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (error) {
    throw new Error(`${label} memory storage binding report JSON is malformed: ${errorMessage(error)}`);
  }
  validateBindingReport(value, label);
  return value;
}

function setOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function readFormat(value: string): MemoryStorageMigrationVerifyCliFormat {
  validateFormat(value, "--format must be json or summary");
  return value;
}

function validateFormat(
  value: unknown,
  message = "Memory storage migration verification output format must be json or summary",
): asserts value is MemoryStorageMigrationVerifyCliFormat {
  if (value !== "json" && value !== "summary") throw new Error(message);
}

function validateOptions(options: unknown): asserts options is MemoryStorageMigrationVerifyCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Memory storage migration verification options must be an object");
  }
}

function validateBindingReport(value: unknown, label: "source" | "target"): asserts value is MemoryStorageBindingCliReport {
  const report = requireRecord(value, `${label} memory storage binding report`);
  if (report.schemaVersion !== 1) throw new Error(`${label} memory storage binding report schemaVersion must be 1`);
  validateNonEmptyString(report.manifestPath, `${label} memory storage binding report manifest path must not be empty`);
  validateNonEmptyString(report.storageDir, `${label} memory storage binding report storage dir must not be empty`);
  validateNonEmptyString(report.memoryIdLabel, `${label} memory storage binding report memory ID label must not be empty`);
  validateBinding(report.binding, `${label} memory storage binding`);
}

function validateBinding(value: unknown, label: string): asserts value is MemoryStorageBinding {
  const binding = requireRecord(value, label);
  if (binding.schemaVersion !== 1) throw new Error(`${label} schemaVersion must be 1`);
  validateNonEmptyString(binding.memoryIdLabel, `${label} memoryIdLabel must not be empty`);
  validateBindingRecord(binding.record, `${label} record`);
  const verification = requireRecord(binding.verification, `${label} verification`);
  if (typeof verification.ok !== "boolean") throw new Error(`${label} verification ok must be a boolean`);
}

function validateBindingRecord(value: unknown, label: string): void {
  const record = requireRecord(value, label);
  validateNonEmptyString(record.publisher, `${label} publisher must not be empty`);
  validateNonEmptyString(record.storageURI, `${label} storage URI must not be empty`);
  validateHex32(record.memoryId, `${label} memory ID must be bytes32`);
  validateHex32(record.merkleRoot, `${label} merkle root must be bytes32`);
  validateHex32(record.contentHash, `${label} content hash must be bytes32`);
  validateHex32(record.storageURIHash, `${label} storage URI hash must be bytes32`);
}

function validateMigrationVerification(value: unknown): asserts value is MemoryStorageMigrationVerification {
  const verification = requireRecord(value, "Memory storage migration verification");
  if (typeof verification.passed !== "boolean") {
    throw new Error("Memory storage migration verification passed must be a boolean");
  }
  if (!Array.isArray(verification.failures) || verification.failures.some((failure) => typeof failure !== "string")) {
    throw new Error("Memory storage migration verification failures must be strings");
  }
}

function validateReport(report: unknown): asserts report is MemoryStorageMigrationVerifyCliReport {
  const candidate = requireRecord(report, "Memory storage migration verification report");
  if (candidate.schemaVersion !== 1) throw new Error("Memory storage migration verification report schemaVersion must be 1");
  validateNonEmptyString(candidate.fromPath, "Memory storage migration verification report source path must not be empty");
  validateNonEmptyString(candidate.toPath, "Memory storage migration verification report target path must not be empty");
  if (typeof candidate.passed !== "boolean") {
    throw new Error("Memory storage migration verification report passed must be a boolean");
  }
  if (!Array.isArray(candidate.failures) || candidate.failures.some((failure) => typeof failure !== "string")) {
    throw new Error("Memory storage migration verification report failures must be strings");
  }
  validateBinding(candidate.from, "Memory storage migration verification report source binding");
  validateBinding(candidate.to, "Memory storage migration verification report target binding");
  validateMigrationVerification(candidate.verification);
}

function validateHex32(value: unknown, message: string): asserts value is `0x${string}` {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/u.test(value)) throw new Error(message);
}

function validateNonEmptyString(value: unknown, message: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(message);
}

function validateStringArray(argv: unknown, message: string): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) throw new Error(message);
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

function validateMigrationVerifier(
  verifyMigration: unknown,
): asserts verifyMigration is (params: VerifyMemoryStorageMigrationParams) => MemoryStorageMigrationVerification {
  if (typeof verifyMigration !== "function") throw new Error("Memory storage migration verifier must be a function");
}

function uniqueFailures(failures: readonly string[]): string[] {
  return [...new Set(failures)];
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
