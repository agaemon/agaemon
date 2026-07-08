import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createBaseSepoliaReleaseSummary,
  formatBaseSepoliaReleaseSummaryReport,
  verifyBaseSepoliaReleaseSummary,
} from "../../release/summary.js";

import type { BaseSepoliaReleaseSummaryReport } from "../../release/summary.js";

export type ReleaseSummaryCliReport = BaseSepoliaReleaseSummaryReport;

export type ReleaseSummaryCliFormat = "json" | "summary";

export interface ReleaseSummaryCliArgs {
  statusPath: string;
  outputPath: string;
  check: boolean;
  format: ReleaseSummaryCliFormat;
}

export interface ReleaseSummaryCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
  createSummary?: typeof createBaseSepoliaReleaseSummary;
  verifySummary?: typeof verifyBaseSepoliaReleaseSummary;
}

if (isReleaseSummaryDirectRun(import.meta.url, process.argv)) await runReleaseSummaryCli();

export async function runReleaseSummaryCli(options: ReleaseSummaryCliOptions = {}): Promise<void> {
  validateReleaseSummaryOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const mkdirp = options.mkdirp ?? ((path: string) => mkdir(path, { recursive: true }));
  const writeText = options.writeText ?? writeFile;
  const createSummary = options.createSummary ?? createBaseSepoliaReleaseSummary;
  const verifySummary = options.verifySummary ?? verifyBaseSepoliaReleaseSummary;

  validateReleaseSummaryOutputWriter(writeOutput);
  validateReleaseSummaryArgv(argv);
  const args = parseReleaseSummaryCliArgs(argv);
  validateReleaseSummaryTextReader(readText);
  const statusJson = await readText(args.statusPath);
  validateReleaseSummaryStatusJson(statusJson);

  if (args.check) {
    const current = await readText(args.outputPath);
    validateReleaseSummaryVerifier(verifySummary);
    const verification = verifySummary(current, statusJson);
    validateReleaseSummaryVerificationResult(verification);
    writeOutput(formatReleaseSummaryCliOutput({
      status: args.statusPath,
      output: args.outputPath,
      passed: verification.passed,
      failures: verification.failures,
    }, args.format));
    if (!verification.passed) {
      validateReleaseSummaryExitCodeSetter(setExitCode);
      setExitCode(1);
    }
    return;
  }

  validateReleaseSummaryCreator(createSummary);
  const markdown = createSummary(statusJson);
  validateReleaseSummaryMarkdown(markdown);
  validateReleaseSummaryDirectoryCreator(mkdirp);
  validateReleaseSummaryTextWriter(writeText);
  await mkdirp(dirname(args.outputPath));
  await writeText(args.outputPath, markdown);
  writeOutput(formatReleaseSummaryCliOutput({
    status: args.statusPath,
    output: args.outputPath,
    written: true,
  }, args.format));
}

export function parseReleaseSummaryCliArgs(argv: readonly string[]): ReleaseSummaryCliArgs {
  validateReleaseSummaryArgv(argv);
  const values = new Map<string, string>();
  let check = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (arg === "--check") {
      if (check) throw new Error("Duplicate argument: --check");
      check = true;
      continue;
    }

    if (arg === "--status" || arg === "--output" || arg === "--format") {
      setReleaseSummaryOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--status|--output|--format)=(.*)$/u);
    if (equals !== null) {
      setReleaseSummaryOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  return {
    statusPath: values.get("--status") ?? "docs/releases/latest.json",
    outputPath: values.get("--output") ?? "docs/releases/CURRENT.md",
    check,
    format: readReleaseSummaryCliFormat(values.get("--format") ?? "json"),
  };
}

export function formatReleaseSummaryCliOutput(report: ReleaseSummaryCliReport, format: ReleaseSummaryCliFormat): string {
  validateReleaseSummaryCliFormat(format, "Release summary output format must be json or summary");
  validateReleaseSummaryReport(report);

  if (format === "json") return JSON.stringify(report, null, 2);
  return formatBaseSepoliaReleaseSummaryReport(report);
}

export function isReleaseSummaryDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateReleaseSummaryArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setReleaseSummaryOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  values.set(name, value);
}

function readReleaseSummaryCliFormat(value: string): ReleaseSummaryCliFormat {
  validateReleaseSummaryCliFormat(value, "--format must be json or summary");
  return value;
}

function validateReleaseSummaryCliFormat(
  value: unknown,
  message: string,
): asserts value is ReleaseSummaryCliFormat {
  if (value !== "json" && value !== "summary") {
    throw new Error(message);
  }
}

function validateReleaseSummaryOptions(options: unknown): asserts options is ReleaseSummaryCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Release summary options must be an object");
  }
}

function validateReleaseSummaryArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) {
    throw new Error(message);
  }
}

function validateReleaseSummaryOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") {
    throw new Error("Output writer must be a function");
  }
}

function validateReleaseSummaryExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") {
    throw new Error("Exit code setter must be a function");
  }
}

function validateReleaseSummaryTextReader(readText: unknown): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") {
    throw new Error("Text reader must be a function");
  }
}

function validateReleaseSummaryDirectoryCreator(mkdirp: unknown): asserts mkdirp is (dir: string) => Promise<void> {
  if (typeof mkdirp !== "function") {
    throw new Error("Directory creator must be a function");
  }
}

function validateReleaseSummaryTextWriter(
  writeText: unknown,
): asserts writeText is (path: string, contents: string) => Promise<void> {
  if (typeof writeText !== "function") {
    throw new Error("Text writer must be a function");
  }
}

function validateReleaseSummaryCreator(createSummary: unknown): asserts createSummary is typeof createBaseSepoliaReleaseSummary {
  if (typeof createSummary !== "function") {
    throw new Error("Release summary creator must be a function");
  }
}

function validateReleaseSummaryVerifier(verifySummary: unknown): asserts verifySummary is typeof verifyBaseSepoliaReleaseSummary {
  if (typeof verifySummary !== "function") {
    throw new Error("Release summary verifier must be a function");
  }
}

function validateReleaseSummaryStatusJson(statusJson: unknown): asserts statusJson is string {
  if (typeof statusJson !== "string") {
    throw new Error("Release summary status JSON must be a string");
  }

  if (statusJson.trim() === "") {
    throw new Error("Release summary status JSON must not be empty");
  }
}

function validateReleaseSummaryMarkdown(markdown: unknown): asserts markdown is string {
  if (typeof markdown !== "string") {
    throw new Error("Release summary markdown must be a string");
  }

  if (markdown.trim() === "") {
    throw new Error("Release summary markdown must not be empty");
  }
}

function validateReleaseSummaryReport(report: unknown): asserts report is ReleaseSummaryCliReport {
  if (typeof report !== "object" || report === null || Array.isArray(report)) {
    throw new Error("Release summary report must be an object");
  }

  const reportRecord = report as Record<string, unknown>;
  validateReleaseSummaryReportPath(reportRecord.status, "status");
  validateReleaseSummaryReportPath(reportRecord.output, "output");

  if ("written" in reportRecord) {
    if (typeof reportRecord.written !== "boolean") {
      throw new Error("Release summary report written must be a boolean");
    }
    return;
  }

  validateReleaseSummaryVerificationResult(report);
}

function validateReleaseSummaryVerificationResult(
  verification: unknown,
): asserts verification is { passed: boolean; failures: string[] } {
  if (typeof verification !== "object" || verification === null || Array.isArray(verification)) {
    throw new Error("Release summary verification report must be an object");
  }

  if (!("passed" in verification) || typeof verification.passed !== "boolean") {
    throw new Error("Release summary verification report passed must be a boolean");
  }

  if (!("failures" in verification) || !Array.isArray(verification.failures)) {
    throw new Error("Release summary verification report failures must be an array");
  }

  verification.failures.forEach((failure, index) => {
    if (typeof failure !== "string") {
      throw new Error(`Release summary verification report failure ${index} must be a string`);
    }

    if (failure.trim() === "") {
      throw new Error(`Release summary verification report failure ${index} must not be empty`);
    }
  });
}

function validateReleaseSummaryReportPath(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`Release summary report ${field} must be a string`);
  }

  if (value.trim() === "") {
    throw new Error(`Release summary report ${field} must not be empty`);
  }
}
