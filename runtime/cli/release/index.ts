import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createBaseSepoliaReleaseIndex,
  formatBaseSepoliaReleaseIndexSummary,
  isBaseSepoliaReleaseNoteFilename,
  verifyBaseSepoliaReleaseIndex,
} from "../../release/index.js";

import type { BaseSepoliaReleaseNoteSource } from "../../release/index.js";
import type { BaseSepoliaReleaseIndexReport } from "../../release/index.js";

export type ReleaseIndexCliReport = BaseSepoliaReleaseIndexReport;

export type ReleaseIndexCliFormat = "json" | "summary";

export interface ReleaseIndexCliArgs {
  releaseDir: string;
  outputPath: string;
  manifestPath?: string | undefined;
  check: boolean;
  format: ReleaseIndexCliFormat;
}

export interface ReleaseIndexCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  readReleaseNotes?: (dir: string) => Promise<BaseSepoliaReleaseNoteSource[]>;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
  createIndex?: typeof createBaseSepoliaReleaseIndex;
  verifyIndex?: typeof verifyBaseSepoliaReleaseIndex;
}

if (isReleaseIndexDirectRun(import.meta.url, process.argv)) await runReleaseIndexCli();

export async function runReleaseIndexCli(options: ReleaseIndexCliOptions = {}): Promise<void> {
  validateReleaseIndexOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const loadReleaseNotes = options.readReleaseNotes ?? readReleaseNotes;
  const mkdirp = options.mkdirp ?? ((path: string) => mkdir(path, { recursive: true }));
  const writeText = options.writeText ?? writeFile;
  const createIndex = options.createIndex ?? createBaseSepoliaReleaseIndex;
  const verifyIndex = options.verifyIndex ?? verifyBaseSepoliaReleaseIndex;

  validateReleaseIndexOutputWriter(writeOutput);
  validateReleaseIndexArgv(argv);
  const args = parseReleaseIndexCliArgs(argv);
  validateReleaseIndexTextReader(readText);
  validateReleaseIndexNotesReader(loadReleaseNotes);
  const manifestContents = args.manifestPath === undefined ? undefined : await readText(args.manifestPath);
  const notes = await loadReleaseNotes(args.releaseDir);
  validateReleaseIndexNotes(notes);

  if (args.check) {
    const current = await readText(args.outputPath);
    validateReleaseIndexVerifier(verifyIndex);
    const verification = verifyIndex(current, notes, { manifestContents });
    validateReleaseIndexVerificationResult(verification);
    writeOutput(formatReleaseIndexCliOutput({
      output: args.outputPath,
      notes: notes.length,
      ...(args.manifestPath === undefined ? {} : { manifest: args.manifestPath }),
      passed: verification.passed,
      failures: verification.failures,
    }, args.format));
    if (!verification.passed) {
      validateReleaseIndexExitCodeSetter(setExitCode);
      setExitCode(1);
    }
    return;
  }

  validateReleaseIndexCreator(createIndex);
  const markdown = createIndex(notes, { manifestContents });
  validateReleaseIndexMarkdown(markdown);
  validateReleaseIndexDirectoryCreator(mkdirp);
  validateReleaseIndexTextWriter(writeText);
  await mkdirp(dirname(args.outputPath));
  await writeText(args.outputPath, markdown);
  writeOutput(formatReleaseIndexCliOutput({
    output: args.outputPath,
    notes: notes.length,
    ...(args.manifestPath === undefined ? {} : { manifest: args.manifestPath }),
    written: true,
  }, args.format));
}

export function parseReleaseIndexCliArgs(argv: readonly string[]): ReleaseIndexCliArgs {
  validateReleaseIndexArgv(argv);
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
      setReleaseIndexOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--dir|--output|--manifest|--format)=(.*)$/u);
    if (equals !== null) {
      setReleaseIndexOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  const releaseDir = values.get("--dir") ?? "docs/releases";
  const outputPath = values.get("--output") ?? join(releaseDir, "README.md");

  return {
    releaseDir,
    outputPath,
    ...(values.has("--manifest") ? { manifestPath: values.get("--manifest")! } : {}),
    check,
    format: readReleaseIndexCliFormat(values.get("--format") ?? "json"),
  };
}

export function formatReleaseIndexCliOutput(report: ReleaseIndexCliReport, format: ReleaseIndexCliFormat): string {
  validateReleaseIndexCliFormat(format, "Release index output format must be json or summary");
  validateReleaseIndexReport(report);

  if (format === "json") return JSON.stringify(report, null, 2);
  return formatBaseSepoliaReleaseIndexSummary(report);
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

export function isReleaseIndexDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateReleaseIndexArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setReleaseIndexOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  values.set(name, value);
}

function readReleaseIndexCliFormat(value: string): ReleaseIndexCliFormat {
  validateReleaseIndexCliFormat(value, "--format must be json or summary");
  return value;
}

function validateReleaseIndexCliFormat(
  value: unknown,
  message: string,
): asserts value is ReleaseIndexCliFormat {
  if (value !== "json" && value !== "summary") {
    throw new Error(message);
  }
}

function validateReleaseIndexOptions(options: unknown): asserts options is ReleaseIndexCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Release index options must be an object");
  }
}

function validateReleaseIndexArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) {
    throw new Error(message);
  }
}

function validateReleaseIndexOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") {
    throw new Error("Output writer must be a function");
  }
}

function validateReleaseIndexExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") {
    throw new Error("Exit code setter must be a function");
  }
}

function validateReleaseIndexTextReader(readText: unknown): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") {
    throw new Error("Text reader must be a function");
  }
}

function validateReleaseIndexNotesReader(
  loadReleaseNotes: unknown,
): asserts loadReleaseNotes is (dir: string) => Promise<BaseSepoliaReleaseNoteSource[]> {
  if (typeof loadReleaseNotes !== "function") {
    throw new Error("Release note reader must be a function");
  }
}

function validateReleaseIndexDirectoryCreator(mkdirp: unknown): asserts mkdirp is (dir: string) => Promise<void> {
  if (typeof mkdirp !== "function") {
    throw new Error("Directory creator must be a function");
  }
}

function validateReleaseIndexTextWriter(
  writeText: unknown,
): asserts writeText is (path: string, contents: string) => Promise<void> {
  if (typeof writeText !== "function") {
    throw new Error("Text writer must be a function");
  }
}

function validateReleaseIndexCreator(createIndex: unknown): asserts createIndex is typeof createBaseSepoliaReleaseIndex {
  if (typeof createIndex !== "function") {
    throw new Error("Release index creator must be a function");
  }
}

function validateReleaseIndexVerifier(verifyIndex: unknown): asserts verifyIndex is typeof verifyBaseSepoliaReleaseIndex {
  if (typeof verifyIndex !== "function") {
    throw new Error("Release index verifier must be a function");
  }
}

function validateReleaseIndexMarkdown(markdown: unknown): asserts markdown is string {
  if (typeof markdown !== "string") {
    throw new Error("Release index markdown must be a string");
  }

  if (markdown.trim() === "") {
    throw new Error("Release index markdown must not be empty");
  }
}

function validateReleaseIndexNotes(notes: unknown): asserts notes is BaseSepoliaReleaseNoteSource[] {
  if (!Array.isArray(notes)) {
    throw new Error("Release index notes must be an array");
  }

  notes.forEach((note, index) => {
    if (typeof note !== "object" || note === null || Array.isArray(note)) {
      throw new Error(`Release index note ${index} must be an object`);
    }

    const noteRecord = note as Record<string, unknown>;
    validateReleaseIndexNoteText(noteRecord.path, "path");
    validateReleaseIndexNoteText(noteRecord.markdown, "markdown");
  });
}

function validateReleaseIndexNoteText(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`Release index note ${field} must be a string`);
  }

  if (value.trim() === "") {
    throw new Error(`Release index note ${field} must not be empty`);
  }
}

function validateReleaseIndexReport(report: unknown): asserts report is ReleaseIndexCliReport {
  if (typeof report !== "object" || report === null || Array.isArray(report)) {
    throw new Error("Release index report must be an object");
  }

  const reportRecord = report as Record<string, unknown>;
  validateReleaseIndexReportPath(reportRecord.output, "output");

  if (reportRecord.manifest !== undefined) {
    validateReleaseIndexReportPath(reportRecord.manifest, "manifest");
  }

  if (!Number.isInteger(reportRecord.notes) || (reportRecord.notes as number) < 0) {
    throw new Error("Release index report notes must be a non-negative integer");
  }

  if ("written" in reportRecord) {
    if (typeof reportRecord.written !== "boolean") {
      throw new Error("Release index report written must be a boolean");
    }
    return;
  }

  validateReleaseIndexVerificationResult(report);
}

function validateReleaseIndexVerificationResult(
  verification: unknown,
): asserts verification is { passed: boolean; failures: string[] } {
  if (typeof verification !== "object" || verification === null || Array.isArray(verification)) {
    throw new Error("Release index verification report must be an object");
  }

  if (!("passed" in verification) || typeof verification.passed !== "boolean") {
    throw new Error("Release index verification report passed must be a boolean");
  }

  if (!("failures" in verification) || !Array.isArray(verification.failures)) {
    throw new Error("Release index verification report failures must be an array");
  }

  verification.failures.forEach((failure, index) => {
    if (typeof failure !== "string") {
      throw new Error(`Release index verification report failure ${index} must be a string`);
    }

    if (failure.trim() === "") {
      throw new Error(`Release index verification report failure ${index} must not be empty`);
    }
  });
}

function validateReleaseIndexReportPath(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`Release index report ${field} must be a string`);
  }

  if (value.trim() === "") {
    throw new Error(`Release index report ${field} must not be empty`);
  }
}
