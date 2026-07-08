import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatBaseSepoliaLocalPreflightSummary,
  verifyBaseSepoliaLocalPreflight,
} from "../../base/localPreflight.js";
import { isBaseSepoliaReleaseNoteFilename } from "../../release/index.js";

import type {
  BaseSepoliaLocalPreflightInput,
  BaseSepoliaLocalPreflightReport,
} from "../../base/localPreflight.js";
import type { BaseSepoliaReleaseNoteSource } from "../../release/index.js";

export interface LocalPreflightCliReport extends BaseSepoliaLocalPreflightReport {
  releaseDir: string;
  manifest: string;
  envExample: string;
  index: string;
  status: string;
  summary: string;
  notes: number;
}

export type LocalPreflightCliFormat = "json" | "summary";

export interface LocalPreflightCliArgs {
  releaseDir: string;
  manifestPath: string;
  envExamplePath: string;
  indexPath: string;
  statusPath: string;
  summaryPath: string;
  outputPath?: string | undefined;
  format: LocalPreflightCliFormat;
}

export interface LocalPreflightCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  writeText?: (path: string, contents: string) => Promise<void>;
  mkdirp?: (path: string) => Promise<void>;
  readReleaseNotes?: (dir: string) => Promise<BaseSepoliaReleaseNoteSource[]>;
  verifyPreflight?: (input: BaseSepoliaLocalPreflightInput) => BaseSepoliaLocalPreflightReport;
}

const LOCAL_PREFLIGHT_VALUE_FLAGS = new Set([
  "--dir",
  "--manifest",
  "--env-example",
  "--index",
  "--status",
  "--summary",
  "--output",
  "--format",
]);

if (isLocalPreflightDirectRun(import.meta.url, process.argv)) await runLocalPreflightCli();

export async function runLocalPreflightCli(options: LocalPreflightCliOptions = {}): Promise<void> {
  validateLocalPreflightOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? readLocalPreflightText;
  const writeText = options.writeText ?? writeFile;
  const mkdirp = options.mkdirp ?? ((path: string) => mkdir(path, { recursive: true }));
  const readNotes = options.readReleaseNotes ?? readLocalPreflightReleaseNotes;
  const verifyPreflight = options.verifyPreflight ?? verifyBaseSepoliaLocalPreflight;

  validateLocalPreflightOutputWriter(writeOutput);
  validateLocalPreflightArgv(argv);
  const args = parseLocalPreflightCliArgs(argv);
  validateLocalPreflightTextReader(readText);
  validateLocalPreflightReleaseNotesReader(readNotes);
  validateLocalPreflightVerifier(verifyPreflight);
  const [
    envExampleContents,
    manifestContents,
    releaseNotes,
    releaseIndexMarkdown,
    releaseStatusJson,
    releaseSummaryMarkdown,
  ] = await Promise.all([
    readText(args.envExamplePath),
    readText(args.manifestPath),
    readNotes(args.releaseDir),
    readText(args.indexPath),
    readText(args.statusPath),
    readText(args.summaryPath),
  ]);
  validateLocalPreflightReleaseNotes(releaseNotes);

  const report = verifyPreflight({
    envExampleContents,
    releaseNotes,
    releaseIndexMarkdown,
    releaseStatusJson,
    releaseSummaryMarkdown,
    manifestContents,
  });
  validateLocalPreflightReport(report);
  const cliReport: LocalPreflightCliReport = {
    releaseDir: args.releaseDir,
    manifest: args.manifestPath,
    envExample: args.envExamplePath,
    index: args.indexPath,
    status: args.statusPath,
    summary: args.summaryPath,
    notes: releaseNotes.length,
    ...report,
  };

  if (args.outputPath !== undefined) {
    validateLocalPreflightTextWriter(writeText);
    validateLocalPreflightDirectoryCreator(mkdirp);
    await mkdirp(dirname(args.outputPath));
    await writeText(args.outputPath, `${JSON.stringify(cliReport, null, 2)}\n`);
  }

  writeOutput(formatLocalPreflightCliOutput(cliReport, args.format));

  if (!report.passed) {
    validateLocalPreflightExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function formatLocalPreflightCliOutput(
  report: LocalPreflightCliReport,
  format: LocalPreflightCliFormat,
): string {
  validateLocalPreflightCliReport(report);
  validateLocalPreflightCliFormat(format, "Local preflight output format must be json or summary");
  if (format === "json") return JSON.stringify(report, null, 2);

  return [
    "Base Sepolia local preflight",
    `releaseDir: ${report.releaseDir}`,
    `manifest: ${report.manifest}`,
    `envExample: ${report.envExample}`,
    `index: ${report.index}`,
    `status: ${report.status}`,
    `summary: ${report.summary}`,
    `notes: ${report.notes}`,
    formatBaseSepoliaLocalPreflightSummary(report).split("\n").slice(1).join("\n"),
  ].join("\n");
}

export function parseLocalPreflightCliArgs(argv: readonly string[]): LocalPreflightCliArgs {
  validateLocalPreflightArgv(argv);
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (LOCAL_PREFLIGHT_VALUE_FLAGS.has(arg)) {
      setLocalPreflightOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--dir|--manifest|--env-example|--index|--status|--summary|--output|--format)=(.*)$/u);
    if (equals !== null) {
      setLocalPreflightOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  const releaseDir = values.get("--dir") ?? "docs/releases";

  return {
    releaseDir,
    manifestPath: values.get("--manifest") ?? "deployments/base-sepolia/latest.json",
    envExamplePath: values.get("--env-example") ?? ".env.example",
    indexPath: values.get("--index") ?? join(releaseDir, "README.md"),
    statusPath: values.get("--status") ?? join(releaseDir, "latest.json"),
    summaryPath: values.get("--summary") ?? join(releaseDir, "CURRENT.md"),
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
    format: readLocalPreflightCliFormat(values.get("--format") ?? "json"),
  };
}

export async function readLocalPreflightReleaseNotes(dir: string): Promise<BaseSepoliaReleaseNoteSource[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const markdownFiles = entries
    .filter((entry) => entry.isFile() && isBaseSepoliaReleaseNoteFilename(entry.name))
    .map((entry) => entry.name)
    .sort();

  return Promise.all(
    markdownFiles.map(async (file) => ({
      path: basename(file),
      markdown: await readLocalPreflightText(join(dir, file)),
    })),
  );
}

export function isLocalPreflightDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateLocalPreflightArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

async function readLocalPreflightText(path: string): Promise<string> {
  return readFile(path, "utf8");
}

function setLocalPreflightOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  values.set(name, value);
}

function readLocalPreflightCliFormat(value: string): LocalPreflightCliFormat {
  validateLocalPreflightCliFormat(value, "--format must be json or summary");
  return value;
}

function validateLocalPreflightCliFormat(
  value: unknown,
  message: string,
): asserts value is LocalPreflightCliFormat {
  if (value !== "json" && value !== "summary") {
    throw new Error(message);
  }
}

function validateLocalPreflightOptions(options: unknown): asserts options is LocalPreflightCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Local preflight options must be an object");
  }
}

function validateLocalPreflightCliReport(report: unknown): asserts report is LocalPreflightCliReport {
  if (!isLocalPreflightRecord(report)) {
    throw new Error("Local preflight report must be an object");
  }

  validateLocalPreflightNonEmptyString(report.releaseDir, "Local preflight report releaseDir must not be empty");
  validateLocalPreflightNonEmptyString(report.manifest, "Local preflight report manifest must not be empty");
  validateLocalPreflightNonEmptyString(report.envExample, "Local preflight report envExample must not be empty");
  validateLocalPreflightNonEmptyString(report.index, "Local preflight report index must not be empty");
  validateLocalPreflightNonEmptyString(report.status, "Local preflight report status must not be empty");
  validateLocalPreflightNonEmptyString(report.summary, "Local preflight report summary must not be empty");
  if (typeof report.notes !== "number" || !Number.isInteger(report.notes) || report.notes < 0) {
    throw new Error("Local preflight report notes must be a non-negative integer");
  }
  validateLocalPreflightReport(report);
}

function validateLocalPreflightReport(report: unknown): asserts report is BaseSepoliaLocalPreflightReport {
  if (!isLocalPreflightRecord(report)) {
    throw new Error("Local preflight report must be an object");
  }
  if (typeof report.passed !== "boolean") {
    throw new Error("Local preflight report passed must be a boolean");
  }
  if (!Array.isArray(report.checks)) {
    throw new Error("Local preflight report checks must be an array");
  }
  report.checks.forEach(validateLocalPreflightCheck);
}

function validateLocalPreflightCheck(check: unknown, index: number): void {
  if (!isLocalPreflightRecord(check)) {
    throw new Error(`Local preflight report check ${index} must be an object`);
  }
  validateLocalPreflightNonEmptyString(check.name, `Local preflight report check ${index} name must not be empty`);
  if (typeof check.passed !== "boolean") {
    throw new Error(`Local preflight report check ${index} passed must be a boolean`);
  }
  if (!Array.isArray(check.failures)) {
    throw new Error(`Local preflight report check ${index} failures must be an array`);
  }
  check.failures.forEach((failure, failureIndex) => {
    validateLocalPreflightNonEmptyString(
      failure,
      `Local preflight report check ${index} failure ${failureIndex} must not be empty`,
    );
  });
}

function validateLocalPreflightReleaseNotes(notes: unknown): asserts notes is BaseSepoliaReleaseNoteSource[] {
  if (!Array.isArray(notes)) {
    throw new Error("Local preflight release notes must be an array");
  }
  notes.forEach((note) => {
    if (!isLocalPreflightRecord(note)) {
      throw new Error("Local preflight release note must be an object");
    }
    validateLocalPreflightNonEmptyString(note.path, "Local preflight release note path must not be empty");
    validateLocalPreflightNonEmptyString(note.markdown, "Local preflight release note markdown must not be empty");
  });
}

function validateLocalPreflightNonEmptyString(value: unknown, message: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(message);
  }
}

function isLocalPreflightRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateLocalPreflightArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) {
    throw new Error(message);
  }
}

function validateLocalPreflightOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") {
    throw new Error("Output writer must be a function");
  }
}

function validateLocalPreflightExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") {
    throw new Error("Exit code setter must be a function");
  }
}

function validateLocalPreflightTextReader(
  readText: unknown,
): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") {
    throw new Error("Text reader must be a function");
  }
}

function validateLocalPreflightTextWriter(
  writeText: unknown,
): asserts writeText is (path: string, contents: string) => Promise<void> {
  if (typeof writeText !== "function") {
    throw new Error("Text writer must be a function");
  }
}

function validateLocalPreflightDirectoryCreator(
  mkdirp: unknown,
): asserts mkdirp is (path: string) => Promise<void> {
  if (typeof mkdirp !== "function") {
    throw new Error("Directory creator must be a function");
  }
}

function validateLocalPreflightReleaseNotesReader(
  readNotes: unknown,
): asserts readNotes is (dir: string) => Promise<BaseSepoliaReleaseNoteSource[]> {
  if (typeof readNotes !== "function") {
    throw new Error("Release notes reader must be a function");
  }
}

function validateLocalPreflightVerifier(
  verifyPreflight: unknown,
): asserts verifyPreflight is (input: BaseSepoliaLocalPreflightInput) => BaseSepoliaLocalPreflightReport {
  if (typeof verifyPreflight !== "function") {
    throw new Error("Local preflight verifier must be a function");
  }
}
