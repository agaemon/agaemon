import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createBaseSepoliaReleaseStatus,
  formatBaseSepoliaReleaseStatusSummary,
  verifyBaseSepoliaReleaseStatus,
} from "../../release/status.js";
import { isBaseSepoliaReleaseNoteFilename } from "../../release/index.js";

import type { BaseSepoliaReleaseNoteSource } from "../../release/index.js";
import type { BaseSepoliaReleaseStatusReport } from "../../release/status.js";

export type ReleaseStatusCliReport = BaseSepoliaReleaseStatusReport;

export type ReleaseStatusCliFormat = "json" | "summary";

export interface ReleaseStatusCliArgs {
  releaseDir: string;
  outputPath: string;
  manifestPath?: string | undefined;
  check: boolean;
  format: ReleaseStatusCliFormat;
}

export interface ReleaseStatusCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  readReleaseNotes?: (dir: string) => Promise<BaseSepoliaReleaseNoteSource[]>;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
  createStatus?: typeof createBaseSepoliaReleaseStatus;
  verifyStatus?: typeof verifyBaseSepoliaReleaseStatus;
}

if (isReleaseStatusDirectRun(import.meta.url, process.argv)) await runReleaseStatusCli();

export async function runReleaseStatusCli(options: ReleaseStatusCliOptions = {}): Promise<void> {
  validateReleaseStatusOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const loadReleaseNotes = options.readReleaseNotes ?? readReleaseNotes;
  const mkdirp = options.mkdirp ?? ((path: string) => mkdir(path, { recursive: true }));
  const writeText = options.writeText ?? writeFile;
  const createStatus = options.createStatus ?? createBaseSepoliaReleaseStatus;
  const verifyStatus = options.verifyStatus ?? verifyBaseSepoliaReleaseStatus;

  validateReleaseStatusOutputWriter(writeOutput);
  validateReleaseStatusArgv(argv);
  const args = parseReleaseStatusCliArgs(argv);
  validateReleaseStatusTextReader(readText);
  validateReleaseStatusNotesReader(loadReleaseNotes);
  const manifestContents = args.manifestPath === undefined ? undefined : await readText(args.manifestPath);
  const notes = await loadReleaseNotes(args.releaseDir);
  validateReleaseStatusNotes(notes);

  if (args.check) {
    const current = await readText(args.outputPath);
    validateReleaseStatusVerifier(verifyStatus);
    const verification = verifyStatus(current, notes, { manifestContents });
    validateReleaseStatusVerificationResult(verification);
    writeOutput(formatReleaseStatusCliOutput({
      output: args.outputPath,
      notes: notes.length,
      ...(args.manifestPath === undefined ? {} : { manifest: args.manifestPath }),
      passed: verification.passed,
      failures: verification.failures,
    }, args.format));
    if (!verification.passed) {
      validateReleaseStatusExitCodeSetter(setExitCode);
      setExitCode(1);
    }
    return;
  }

  validateReleaseStatusCreator(createStatus);
  const json = createStatus(notes, { manifestContents });
  validateReleaseStatusJson(json);
  validateReleaseStatusDirectoryCreator(mkdirp);
  validateReleaseStatusTextWriter(writeText);
  await mkdirp(dirname(args.outputPath));
  await writeText(args.outputPath, json);
  writeOutput(formatReleaseStatusCliOutput({
    output: args.outputPath,
    notes: notes.length,
    ...(args.manifestPath === undefined ? {} : { manifest: args.manifestPath }),
    written: true,
  }, args.format));
}

export function parseReleaseStatusCliArgs(argv: readonly string[]): ReleaseStatusCliArgs {
  validateReleaseStatusArgv(argv);
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

    if (arg === "--dir" || arg === "--output" || arg === "--manifest" || arg === "--format") {
      setReleaseStatusOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--dir|--output|--manifest|--format)=(.*)$/u);
    if (equals !== null) {
      setReleaseStatusOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  const releaseDir = values.get("--dir") ?? "docs/releases";
  const outputPath = values.get("--output") ?? join(releaseDir, "latest.json");

  return {
    releaseDir,
    outputPath,
    ...(values.has("--manifest") ? { manifestPath: values.get("--manifest")! } : {}),
    check,
    format: readReleaseStatusCliFormat(values.get("--format") ?? "json"),
  };
}

export function formatReleaseStatusCliOutput(report: ReleaseStatusCliReport, format: ReleaseStatusCliFormat): string {
  validateReleaseStatusCliFormat(format, "Release status output format must be json or summary");
  validateReleaseStatusReport(report);

  if (format === "json") return JSON.stringify(report, null, 2);
  return formatBaseSepoliaReleaseStatusSummary(report);
}

async function readReleaseNotes(dir: string): Promise<BaseSepoliaReleaseNoteSource[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const markdownFiles = entries
    .filter((entry) => entry.isFile() && isBaseSepoliaReleaseNoteFilename(entry.name))
    .map((entry) => entry.name)
    .sort();

  return Promise.all(
    markdownFiles.map(async (file) => ({
      path: basename(file),
      markdown: await readFile(join(dir, file), "utf8"),
    })),
  );
}

export function isReleaseStatusDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateReleaseStatusArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setReleaseStatusOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  values.set(name, value);
}

function readReleaseStatusCliFormat(value: string): ReleaseStatusCliFormat {
  validateReleaseStatusCliFormat(value, "--format must be json or summary");
  return value;
}

function validateReleaseStatusCliFormat(
  value: unknown,
  message: string,
): asserts value is ReleaseStatusCliFormat {
  if (value !== "json" && value !== "summary") {
    throw new Error(message);
  }
}

function validateReleaseStatusOptions(options: unknown): asserts options is ReleaseStatusCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Release status options must be an object");
  }
}

function validateReleaseStatusArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) {
    throw new Error(message);
  }
}

function validateReleaseStatusOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") {
    throw new Error("Output writer must be a function");
  }
}

function validateReleaseStatusExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") {
    throw new Error("Exit code setter must be a function");
  }
}

function validateReleaseStatusTextReader(readText: unknown): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") {
    throw new Error("Text reader must be a function");
  }
}

function validateReleaseStatusNotesReader(
  loadReleaseNotes: unknown,
): asserts loadReleaseNotes is (dir: string) => Promise<BaseSepoliaReleaseNoteSource[]> {
  if (typeof loadReleaseNotes !== "function") {
    throw new Error("Release note reader must be a function");
  }
}

function validateReleaseStatusDirectoryCreator(mkdirp: unknown): asserts mkdirp is (dir: string) => Promise<void> {
  if (typeof mkdirp !== "function") {
    throw new Error("Directory creator must be a function");
  }
}

function validateReleaseStatusTextWriter(
  writeText: unknown,
): asserts writeText is (path: string, contents: string) => Promise<void> {
  if (typeof writeText !== "function") {
    throw new Error("Text writer must be a function");
  }
}

function validateReleaseStatusCreator(createStatus: unknown): asserts createStatus is typeof createBaseSepoliaReleaseStatus {
  if (typeof createStatus !== "function") {
    throw new Error("Release status creator must be a function");
  }
}

function validateReleaseStatusVerifier(verifyStatus: unknown): asserts verifyStatus is typeof verifyBaseSepoliaReleaseStatus {
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

  try {
    JSON.parse(json);
  } catch (error) {
    throw new Error(`Release status JSON must be valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function validateReleaseStatusNotes(notes: unknown): asserts notes is BaseSepoliaReleaseNoteSource[] {
  if (!Array.isArray(notes)) {
    throw new Error("Release status notes must be an array");
  }

  notes.forEach((note, index) => {
    if (typeof note !== "object" || note === null || Array.isArray(note)) {
      throw new Error(`Release status note ${index} must be an object`);
    }

    const noteRecord = note as Record<string, unknown>;
    validateReleaseStatusNoteText(noteRecord.path, "path");
    validateReleaseStatusNoteText(noteRecord.markdown, "markdown");
  });
}

function validateReleaseStatusNoteText(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`Release status note ${field} must be a string`);
  }

  if (value.trim() === "") {
    throw new Error(`Release status note ${field} must not be empty`);
  }
}

function validateReleaseStatusReport(report: unknown): asserts report is ReleaseStatusCliReport {
  if (typeof report !== "object" || report === null || Array.isArray(report)) {
    throw new Error("Release status report must be an object");
  }

  const reportRecord = report as Record<string, unknown>;
  validateReleaseStatusReportPath(reportRecord.output, "output");

  if (reportRecord.manifest !== undefined) {
    validateReleaseStatusReportPath(reportRecord.manifest, "manifest");
  }

  if (!Number.isInteger(reportRecord.notes) || (reportRecord.notes as number) < 0) {
    throw new Error("Release status report notes must be a non-negative integer");
  }

  if ("written" in reportRecord) {
    if (typeof reportRecord.written !== "boolean") {
      throw new Error("Release status report written must be a boolean");
    }
    return;
  }

  validateReleaseStatusVerificationResult(report);
}

function validateReleaseStatusVerificationResult(
  verification: unknown,
): asserts verification is { passed: boolean; failures: string[] } {
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

function validateReleaseStatusReportPath(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`Release status report ${field} must be a string`);
  }

  if (value.trim() === "") {
    throw new Error(`Release status report ${field} must not be empty`);
  }
}
