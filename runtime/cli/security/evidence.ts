import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createBaseSecurityEvidenceReport,
  formatBaseSecurityEvidenceSummary,
  validateBaseSecurityEvidenceReport,
} from "../../security/evidence.js";

import type {
  BaseSecurityEvidenceReport,
  CreateBaseSecurityEvidenceReportParams,
  SecurityEvidenceSource,
} from "../../security/evidence.js";

export type SecurityEvidenceCliFormat = "json" | "summary";

export interface SecurityEvidenceCliArgs {
  testDir: string;
  runtimeDir: string;
  outputPath?: string | undefined;
  format: SecurityEvidenceCliFormat;
}

export interface SecurityEvidenceCliOptions {
  argv?: readonly string[] | undefined;
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readSources?: (testDir: string) => Promise<SecurityEvidenceSource[]>;
  readRuntimeSources?: (runtimeDir: string) => Promise<SecurityEvidenceSource[]>;
  writeText?: (path: string, contents: string) => Promise<void>;
  mkdirp?: (path: string) => Promise<void>;
  createReport?: (params: CreateBaseSecurityEvidenceReportParams) => BaseSecurityEvidenceReport;
}

if (isSecurityEvidenceDirectRun(import.meta.url, process.argv)) await runSecurityEvidenceCli();

export async function runSecurityEvidenceCli(options: SecurityEvidenceCliOptions = {}): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => { process.exitCode = code; });
  const readSources = options.readSources ?? readSolidityTestSources;
  const readRuntimeSources = options.readRuntimeSources ?? readRuntimeTestSources;
  const writeText = options.writeText ?? writeFile;
  const mkdirp = options.mkdirp ?? ((path: string) => mkdir(path, { recursive: true }));
  const createReport = options.createReport ?? createBaseSecurityEvidenceReport;

  validateStringArray(argv, "CLI argv must be an array of strings");
  const args = parseSecurityEvidenceCliArgs(argv);
  validateOutputWriter(writeOutput);
  validateSourceReader(readSources);
  validateSourceReader(readRuntimeSources);
  const [solidityTests, runtimeTests] = await Promise.all([
    readSources(args.testDir),
    readRuntimeSources(args.runtimeDir),
  ]);
  const report = createReport({ solidityTests, runtimeTests });
  validateBaseSecurityEvidenceReport(report);

  if (args.outputPath !== undefined) {
    validateTextWriter(writeText);
    validateDirectoryCreator(mkdirp);
    await mkdirp(dirname(args.outputPath));
    await writeText(args.outputPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  writeOutput(formatSecurityEvidenceCliOutput(report, args.format));

  if (!report.passed) {
    validateExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseSecurityEvidenceCliArgs(argv: readonly string[]): SecurityEvidenceCliArgs {
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
    const equals = arg.match(/^(--test-dir|--runtime-dir|--output|--format)=(.*)$/u);
    if (equals !== null) {
      setOption(values, equals[1]!, equals[2]!);
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }

  return {
    testDir: values.get("--test-dir") ?? "test",
    runtimeDir: values.get("--runtime-dir") ?? "runtime",
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
    format: readFormat(values.get("--format") ?? "json"),
  };
}

export function formatSecurityEvidenceCliOutput(
  report: BaseSecurityEvidenceReport,
  format: SecurityEvidenceCliFormat,
): string {
  validateBaseSecurityEvidenceReport(report);
  validateFormat(format);
  return format === "summary" ? formatBaseSecurityEvidenceSummary(report) : JSON.stringify(report, null, 2);
}

export async function readSolidityTestSources(testDir: string): Promise<SecurityEvidenceSource[]> {
  validateNonEmptyString(testDir, "test directory must not be empty");
  const files = await collectFiles(testDir, ".sol");
  return Promise.all(
    files.map(async (path) => ({
      path,
      contents: await readFile(path, "utf8"),
    })),
  );
}

export async function readRuntimeTestSources(runtimeDir: string): Promise<SecurityEvidenceSource[]> {
  validateNonEmptyString(runtimeDir, "runtime directory must not be empty");
  const files = await collectFiles(runtimeDir, ".test.ts");
  return Promise.all(
    files.map(async (path) => ({
      path,
      contents: await readFile(path, "utf8"),
    })),
  );
}

export function isSecurityEvidenceDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateStringArray(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

async function collectFiles(dir: string, suffix: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return collectFiles(path, suffix);
      return entry.isFile() && path.endsWith(suffix) ? [path] : [];
    }),
  );
  return files.flat().sort();
}

function isValueFlag(arg: string): boolean {
  return arg === "--test-dir" || arg === "--runtime-dir" || arg === "--output" || arg === "--format";
}

function setOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function readFormat(value: string): SecurityEvidenceCliFormat {
  validateFormat(value, "--format must be json or summary");
  return value;
}

function validateFormat(
  value: unknown,
  message = "Security evidence output format must be json or summary",
): asserts value is SecurityEvidenceCliFormat {
  if (value !== "json" && value !== "summary") throw new Error(message);
}

function validateOptions(options: unknown): asserts options is SecurityEvidenceCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Security evidence options must be an object");
  }
}

function validateStringArray(value: unknown, message: string): asserts value is readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) throw new Error(message);
}

function validateNonEmptyString(value: unknown, message: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(message);
}

function validateOutputWriter(value: unknown): asserts value is (output: string) => void {
  if (typeof value !== "function") throw new Error("Output writer must be a function");
}

function validateExitCodeSetter(value: unknown): asserts value is (code: number) => void {
  if (typeof value !== "function") throw new Error("Exit code setter must be a function");
}

function validateSourceReader(value: unknown): asserts value is (testDir: string) => Promise<SecurityEvidenceSource[]> {
  if (typeof value !== "function") throw new Error("Security evidence source reader must be a function");
}

function validateTextWriter(value: unknown): asserts value is (path: string, contents: string) => Promise<void> {
  if (typeof value !== "function") throw new Error("Text writer must be a function");
}

function validateDirectoryCreator(value: unknown): asserts value is (path: string) => Promise<void> {
  if (typeof value !== "function") throw new Error("Directory creator must be a function");
}
