import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatBaseSepoliaReleaseNoteVerificationSummary,
  verifyBaseSepoliaReleaseNote,
} from "../../release/noteVerifier.js";

import type { BaseSepoliaReleaseNoteVerification } from "../../release/noteVerifier.js";

export interface ReleaseNoteVerifyCliReport extends BaseSepoliaReleaseNoteVerification {
  release: string;
  manifest?: string | undefined;
}

export type ReleaseNoteVerifyCliFormat = "json" | "summary";

export interface ReleaseNoteVerifyCliArgs {
  releasePath: string;
  manifestPath?: string | undefined;
  format: ReleaseNoteVerifyCliFormat;
}

export interface ReleaseNoteVerifyCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyNote?: typeof verifyBaseSepoliaReleaseNote;
}

if (isReleaseNoteVerifyDirectRun(import.meta.url, process.argv)) await runReleaseNoteVerifyCli();

export async function runReleaseNoteVerifyCli(options: ReleaseNoteVerifyCliOptions = {}): Promise<void> {
  validateReleaseNoteVerifyOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const verifyNote = options.verifyNote ?? verifyBaseSepoliaReleaseNote;

  validateReleaseNoteVerifyOutputWriter(writeOutput);
  validateReleaseNoteVerifyArgv(argv);
  const args = parseReleaseNoteVerifyCliArgs(argv);
  validateReleaseNoteVerifyTextReader(readText);
  const markdown = await readText(args.releasePath);
  validateReleaseNoteMarkdown(markdown);
  const manifestContents = args.manifestPath === undefined ? undefined : await readText(args.manifestPath);
  validateReleaseNoteVerifier(verifyNote);
  const verification = verifyNote(markdown, { manifestContents });
  validateReleaseNoteVerificationResult(verification);
  const report: ReleaseNoteVerifyCliReport = {
    release: args.releasePath,
    ...(args.manifestPath === undefined ? {} : { manifest: args.manifestPath }),
    ...verification,
  };

  writeOutput(formatReleaseNoteVerifyCliOutput(report, args.format));

  if (!verification.passed) {
    validateReleaseNoteVerifyExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseReleaseNoteVerifyCliArgs(argv: readonly string[]): ReleaseNoteVerifyCliArgs {
  validateReleaseNoteVerifyArgv(argv);
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (arg === "--release" || arg === "--manifest" || arg === "--format") {
      setReleaseNoteVerifyOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--release|--manifest|--format)=(.*)$/u);
    if (equals !== null) {
      setReleaseNoteVerifyOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  const releasePath = values.get("--release");
  if (releasePath === undefined) throw new Error("--release is required");

  return {
    releasePath,
    ...(values.has("--manifest") ? { manifestPath: values.get("--manifest")! } : {}),
    format: readReleaseNoteVerifyCliFormat(values.get("--format") ?? "json"),
  };
}

export function formatReleaseNoteVerifyCliOutput(
  report: ReleaseNoteVerifyCliReport,
  format: ReleaseNoteVerifyCliFormat,
): string {
  validateReleaseNoteVerifyCliFormat(format, "Release note verification output format must be json or summary");
  validateReleaseNoteVerifyReport(report);

  if (format === "json") return JSON.stringify(report, null, 2);

  return [
    "Base Sepolia release note verification",
    `release: ${report.release}`,
    ...(report.manifest === undefined ? [] : [`manifest: ${report.manifest}`]),
    formatBaseSepoliaReleaseNoteVerificationSummary(report).split("\n").slice(1).join("\n"),
  ].join("\n");
}

export function isReleaseNoteVerifyDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateReleaseNoteVerifyArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setReleaseNoteVerifyOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  values.set(name, value);
}

function readReleaseNoteVerifyCliFormat(value: string): ReleaseNoteVerifyCliFormat {
  validateReleaseNoteVerifyCliFormat(value, "--format must be json or summary");
  return value;
}

function validateReleaseNoteVerifyCliFormat(
  value: unknown,
  message: string,
): asserts value is ReleaseNoteVerifyCliFormat {
  if (value !== "json" && value !== "summary") {
    throw new Error(message);
  }
}

function validateReleaseNoteVerifyOptions(options: unknown): asserts options is ReleaseNoteVerifyCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Release note verification options must be an object");
  }
}

function validateReleaseNoteVerifyArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) {
    throw new Error(message);
  }
}

function validateReleaseNoteVerifyOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") {
    throw new Error("Output writer must be a function");
  }
}

function validateReleaseNoteVerifyExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") {
    throw new Error("Exit code setter must be a function");
  }
}

function validateReleaseNoteVerifyTextReader(readText: unknown): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") {
    throw new Error("Text reader must be a function");
  }
}

function validateReleaseNoteVerifier(
  verifyNote: unknown,
): asserts verifyNote is typeof verifyBaseSepoliaReleaseNote {
  if (typeof verifyNote !== "function") {
    throw new Error("Release note verifier must be a function");
  }
}

function validateReleaseNoteMarkdown(markdown: unknown): asserts markdown is string {
  if (typeof markdown !== "string") {
    throw new Error("Release note markdown must be a string");
  }

  if (markdown.trim() === "") {
    throw new Error("Release note markdown must not be empty");
  }
}

function validateReleaseNoteVerifyReport(report: unknown): asserts report is ReleaseNoteVerifyCliReport {
  validateReleaseNoteVerificationResult(report);
  const reportRecord = report as unknown as Record<string, unknown>;

  validateReleaseNoteVerifyReportPath(reportRecord.release, "release");

  if (reportRecord.manifest !== undefined) {
    validateReleaseNoteVerifyReportPath(reportRecord.manifest, "manifest");
  }
}

function validateReleaseNoteVerificationResult(
  verification: unknown,
): asserts verification is BaseSepoliaReleaseNoteVerification {
  if (typeof verification !== "object" || verification === null || Array.isArray(verification)) {
    throw new Error("Release note verification report must be an object");
  }

  if (!("passed" in verification) || typeof verification.passed !== "boolean") {
    throw new Error("Release note verification report passed must be a boolean");
  }

  if (!("failures" in verification) || !Array.isArray(verification.failures)) {
    throw new Error("Release note verification report failures must be an array");
  }

  verification.failures.forEach((failure, index) => {
    if (typeof failure !== "string") {
      throw new Error(`Release note verification report failure ${index} must be a string`);
    }

    if (failure.trim() === "") {
      throw new Error(`Release note verification report failure ${index} must not be empty`);
    }
  });
}

function validateReleaseNoteVerifyReportPath(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`Release note verification report ${field} must be a string`);
  }

  if (value.trim() === "") {
    throw new Error(`Release note verification report ${field} must not be empty`);
  }
}
