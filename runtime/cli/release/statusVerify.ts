import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatBaseSepoliaReleaseStatusSnapshotVerificationSummary,
  verifyBaseSepoliaReleaseStatusSnapshot,
} from "../../release/status.js";

import type { BaseSepoliaReleaseStatusSnapshotVerification } from "../../release/status.js";

export interface ReleaseStatusVerifyCliReport extends BaseSepoliaReleaseStatusSnapshotVerification {
  status: string;
}

export type ReleaseStatusVerifyCliFormat = "json" | "summary";

export interface ReleaseStatusVerifyCliArgs {
  statusPath: string;
  format: ReleaseStatusVerifyCliFormat;
}

export interface ReleaseStatusVerifyCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyStatus?: typeof verifyBaseSepoliaReleaseStatusSnapshot;
}

if (isReleaseStatusVerifyDirectRun(import.meta.url, process.argv)) await runReleaseStatusVerifyCli();

export async function runReleaseStatusVerifyCli(options: ReleaseStatusVerifyCliOptions = {}): Promise<void> {
  validateReleaseStatusVerifyOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const verifyStatus = options.verifyStatus ?? verifyBaseSepoliaReleaseStatusSnapshot;

  validateReleaseStatusVerifyOutputWriter(writeOutput);
  validateReleaseStatusVerifyArgv(argv);
  const args = parseReleaseStatusVerifyCliArgs(argv);
  validateReleaseStatusVerifyTextReader(readText);
  const json = await readText(args.statusPath);
  validateReleaseStatusJson(json);
  validateReleaseStatusVerifyVerifier(verifyStatus);
  const verification = verifyStatus(json);
  validateReleaseStatusVerificationResult(verification);
  const report: ReleaseStatusVerifyCliReport = {
    status: args.statusPath,
    ...verification,
  };

  writeOutput(formatReleaseStatusVerifyCliOutput(report, args.format));

  if (!verification.passed) {
    validateReleaseStatusVerifyExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseReleaseStatusVerifyCliArgs(argv: readonly string[]): ReleaseStatusVerifyCliArgs {
  validateReleaseStatusVerifyArgv(argv);
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (arg === "--status" || arg === "--format") {
      setReleaseStatusVerifyOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--status|--format)=(.*)$/u);
    if (equals !== null) {
      setReleaseStatusVerifyOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  return {
    statusPath: values.get("--status") ?? "docs/releases/latest.json",
    format: readReleaseStatusVerifyCliFormat(values.get("--format") ?? "json"),
  };
}

export function formatReleaseStatusVerifyCliOutput(
  report: ReleaseStatusVerifyCliReport,
  format: ReleaseStatusVerifyCliFormat,
): string {
  validateReleaseStatusVerifyCliFormat(format, "Release status verification output format must be json or summary");
  validateReleaseStatusVerifyReport(report);

  if (format === "json") return JSON.stringify(report, null, 2);

  return [
    "Base Sepolia release status verification",
    `status: ${report.status}`,
    formatBaseSepoliaReleaseStatusSnapshotVerificationSummary(report).split("\n").slice(1).join("\n"),
  ].join("\n");
}

export function isReleaseStatusVerifyDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateReleaseStatusVerifyArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setReleaseStatusVerifyOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  values.set(name, value);
}

function readReleaseStatusVerifyCliFormat(value: string): ReleaseStatusVerifyCliFormat {
  validateReleaseStatusVerifyCliFormat(value, "--format must be json or summary");
  return value;
}

function validateReleaseStatusVerifyCliFormat(
  value: unknown,
  message: string,
): asserts value is ReleaseStatusVerifyCliFormat {
  if (value !== "json" && value !== "summary") {
    throw new Error(message);
  }
}

function validateReleaseStatusVerifyOptions(options: unknown): asserts options is ReleaseStatusVerifyCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Release status verification options must be an object");
  }
}

function validateReleaseStatusVerifyArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) {
    throw new Error(message);
  }
}

function validateReleaseStatusVerifyOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") {
    throw new Error("Output writer must be a function");
  }
}

function validateReleaseStatusVerifyExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") {
    throw new Error("Exit code setter must be a function");
  }
}

function validateReleaseStatusVerifyTextReader(readText: unknown): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") {
    throw new Error("Text reader must be a function");
  }
}

function validateReleaseStatusVerifyVerifier(
  verifyStatus: unknown,
): asserts verifyStatus is typeof verifyBaseSepoliaReleaseStatusSnapshot {
  if (typeof verifyStatus !== "function") {
    throw new Error("Release status verifier must be a function");
  }
}

function validateReleaseStatusJson(json: unknown): asserts json is string {
  if (typeof json !== "string") {
    throw new Error("Release status JSON must be a string");
  }

  if (json.trim() === "") {
    throw new Error("Release status JSON must not be empty");
  }
}

function validateReleaseStatusVerifyReport(report: unknown): asserts report is ReleaseStatusVerifyCliReport {
  validateReleaseStatusVerificationResult(report);
  const reportRecord = report as unknown as Record<string, unknown>;

  validateReleaseStatusVerifyReportPath(reportRecord.status, "status");
}

function validateReleaseStatusVerificationResult(
  verification: unknown,
): asserts verification is BaseSepoliaReleaseStatusSnapshotVerification {
  if (typeof verification !== "object" || verification === null || Array.isArray(verification)) {
    throw new Error("Release status verification report must be an object");
  }

  if (!("passed" in verification) || typeof verification.passed !== "boolean") {
    throw new Error("Release status verification report passed must be a boolean");
  }

  if (!("failures" in verification) || !Array.isArray(verification.failures)) {
    throw new Error("Release status verification report failures must be an array");
  }

  verification.failures.forEach((failure, index) => {
    if (typeof failure !== "string") {
      throw new Error(`Release status verification report failure ${index} must be a string`);
    }

    if (failure.trim() === "") {
      throw new Error(`Release status verification report failure ${index} must not be empty`);
    }
  });
}

function validateReleaseStatusVerifyReportPath(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`Release status verification report ${field} must be a string`);
  }

  if (value.trim() === "") {
    throw new Error(`Release status verification report ${field} must not be empty`);
  }
}
