import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createBaseSepoliaReleaseNote,
  defaultBaseSepoliaReleaseNotePath,
  formatBaseSepoliaReleaseNoteCreationSummary,
  writeBaseSepoliaReleaseNote,
} from "../../release/note.js";
import { readReadinessCheckpoint } from "../../base/checkpoint.js";

import type { ReadinessCheckpoint } from "../../base/checkpoint.js";
import type { BaseSepoliaReleaseNoteCreationReport } from "../../release/note.js";

export interface ReleaseNoteCliReport extends BaseSepoliaReleaseNoteCreationReport {}

export type ReleaseNoteCliFormat = "json" | "summary";

export interface ReleaseNoteCliArgs {
  checkpointPath: string;
  manifestPath?: string | undefined;
  outputPath?: string | undefined;
  requireRunUrl: boolean;
  format: ReleaseNoteCliFormat;
}

export interface ReleaseNoteCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  readText?: (path: string) => Promise<string>;
  readCheckpoint?: (path: string) => Promise<ReadinessCheckpoint>;
  createNote?: typeof createBaseSepoliaReleaseNote;
  defaultOutputPath?: (checkpoint: ReadinessCheckpoint) => string;
  writeNote?: (path: string, markdown: string) => Promise<void>;
}

if (isReleaseNoteDirectRun(import.meta.url, process.argv)) await runReleaseNoteCli();

export async function runReleaseNoteCli(options: ReleaseNoteCliOptions = {}): Promise<void> {
  validateReleaseNoteOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const loadCheckpoint = options.readCheckpoint ?? readReadinessCheckpoint;
  const createNote = options.createNote ?? createBaseSepoliaReleaseNote;
  const resolveDefaultOutputPath = options.defaultOutputPath ?? defaultBaseSepoliaReleaseNotePath;
  const writeNote = options.writeNote ?? writeBaseSepoliaReleaseNote;

  validateReleaseNoteOutputWriter(writeOutput);
  validateReleaseNoteArgv(argv);
  const args = parseReleaseNoteCliArgs(argv);
  validateReleaseNoteTextReader(readText);
  validateReleaseNoteCheckpointReader(loadCheckpoint);
  validateReleaseNoteCreator(createNote);
  const manifestContents = args.manifestPath === undefined ? undefined : await readText(args.manifestPath);
  const checkpoint = await loadCheckpoint(args.checkpointPath);
  const markdown = createNote(checkpoint, {
    manifestContents,
    requireRunUrl: args.requireRunUrl,
  });
  validateReleaseNoteMarkdown(markdown);
  validateReleaseNoteDefaultOutputPathResolver(resolveDefaultOutputPath);
  const outputPath = args.outputPath ?? resolveDefaultOutputPath(checkpoint);
  validateReleaseNoteOutputPath(outputPath);

  validateReleaseNoteWriter(writeNote);
  await writeNote(outputPath, markdown);

  writeOutput(formatReleaseNoteCliOutput({
    checkpoint: args.checkpointPath,
    ...(args.manifestPath === undefined ? {} : { manifest: args.manifestPath }),
    output: outputPath,
    requireRunUrl: args.requireRunUrl,
    written: true,
  }, args.format));
}

export function parseReleaseNoteCliArgs(argv: readonly string[]): ReleaseNoteCliArgs {
  validateReleaseNoteArgv(argv);
  const values = new Map<string, string>();
  let allowMissingRunUrl = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (arg === "--allow-missing-run-url") {
      if (allowMissingRunUrl) throw new Error("Duplicate argument: --allow-missing-run-url");
      allowMissingRunUrl = true;
      continue;
    }

    if (arg === "--checkpoint" || arg === "--manifest" || arg === "--output" || arg === "--format") {
      setReleaseNoteOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--checkpoint|--manifest|--output|--format)=(.*)$/u);
    if (equals !== null) {
      setReleaseNoteOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  const checkpointPath = values.get("--checkpoint");
  if (checkpointPath === undefined) throw new Error("--checkpoint is required");

  return {
    checkpointPath,
    ...(values.has("--manifest") ? { manifestPath: values.get("--manifest")! } : {}),
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
    requireRunUrl: !allowMissingRunUrl,
    format: readReleaseNoteCliFormat(values.get("--format") ?? "json"),
  };
}

export function formatReleaseNoteCliOutput(report: ReleaseNoteCliReport, format: ReleaseNoteCliFormat): string {
  validateReleaseNoteCliFormat(format, "Release note output format must be json or summary");
  validateReleaseNoteReport(report);

  if (format === "json") return JSON.stringify(report, null, 2);
  return formatBaseSepoliaReleaseNoteCreationSummary(report);
}

export function isReleaseNoteDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateReleaseNoteArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setReleaseNoteOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  values.set(name, value);
}

function readReleaseNoteCliFormat(value: string): ReleaseNoteCliFormat {
  validateReleaseNoteCliFormat(value, "--format must be json or summary");
  return value;
}

function validateReleaseNoteCliFormat(
  value: unknown,
  message: string,
): asserts value is ReleaseNoteCliFormat {
  if (value !== "json" && value !== "summary") {
    throw new Error(message);
  }
}

function validateReleaseNoteOptions(options: unknown): asserts options is ReleaseNoteCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Release note options must be an object");
  }
}

function validateReleaseNoteArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) {
    throw new Error(message);
  }
}

function validateReleaseNoteOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") {
    throw new Error("Output writer must be a function");
  }
}

function validateReleaseNoteTextReader(readText: unknown): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") {
    throw new Error("Text reader must be a function");
  }
}

function validateReleaseNoteCheckpointReader(
  loadCheckpoint: unknown,
): asserts loadCheckpoint is (path: string) => Promise<ReadinessCheckpoint> {
  if (typeof loadCheckpoint !== "function") {
    throw new Error("Checkpoint reader must be a function");
  }
}

function validateReleaseNoteCreator(createNote: unknown): asserts createNote is typeof createBaseSepoliaReleaseNote {
  if (typeof createNote !== "function") {
    throw new Error("Release note creator must be a function");
  }
}

function validateReleaseNoteDefaultOutputPathResolver(
  resolveDefaultOutputPath: unknown,
): asserts resolveDefaultOutputPath is (checkpoint: ReadinessCheckpoint) => string {
  if (typeof resolveDefaultOutputPath !== "function") {
    throw new Error("Release note default output path resolver must be a function");
  }
}

function validateReleaseNoteWriter(
  writeNote: unknown,
): asserts writeNote is (path: string, markdown: string) => Promise<void> {
  if (typeof writeNote !== "function") {
    throw new Error("Release note writer must be a function");
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

function validateReleaseNoteOutputPath(outputPath: unknown): asserts outputPath is string {
  if (typeof outputPath !== "string") {
    throw new Error("Release note output path must be a string");
  }

  if (outputPath.trim() === "") {
    throw new Error("Release note output path must not be empty");
  }
}

function validateReleaseNoteReport(report: unknown): asserts report is ReleaseNoteCliReport {
  if (typeof report !== "object" || report === null || Array.isArray(report)) {
    throw new Error("Release note report must be an object");
  }

  const reportRecord = report as Record<string, unknown>;
  validateReleaseNoteReportPath(reportRecord.checkpoint, "checkpoint");

  if (reportRecord.manifest !== undefined) {
    validateReleaseNoteReportPath(reportRecord.manifest, "manifest");
  }

  validateReleaseNoteReportPath(reportRecord.output, "output");

  if (typeof reportRecord.requireRunUrl !== "boolean") {
    throw new Error("Release note report requireRunUrl must be a boolean");
  }

  if (typeof reportRecord.written !== "boolean") {
    throw new Error("Release note report written must be a boolean");
  }
}

function validateReleaseNoteReportPath(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`Release note report ${field} must be a string`);
  }

  if (value.trim() === "") {
    throw new Error(`Release note report ${field} must not be empty`);
  }
}
