import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createReadinessCheckpoint,
  formatReadinessCheckpointSummary,
  writeReadinessCheckpoint,
} from "../../base/checkpoint.js";

import type { CreateReadinessCheckpointParams, ReadinessCheckpoint } from "../../base/checkpoint.js";

export type CheckpointCliFormat = "json" | "summary";

export interface CheckpointCliArgs {
  manifestPath?: string | undefined;
  outputPath?: string | undefined;
  readinessRunUrl?: string | undefined;
  format: CheckpointCliFormat;
}

export interface CheckpointCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  writeError?: (output: string) => void;
  setExitCode?: (code: number) => void;
  createCheckpoint?: (params: CreateReadinessCheckpointParams) => Promise<ReadinessCheckpoint>;
  writeCheckpoint?: (path: string, checkpoint: ReadinessCheckpoint) => Promise<void>;
}

if (isCheckpointDirectRun(import.meta.url, process.argv)) await runCheckpointCli();

export async function runCheckpointCli(options: CheckpointCliOptions = {}): Promise<void> {
  validateCheckpointOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const writeError = options.writeError ?? ((output: string) => console.error(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const createCheckpoint = options.createCheckpoint ?? createReadinessCheckpoint;
  const writeCheckpoint = options.writeCheckpoint ?? writeReadinessCheckpoint;

  validateCheckpointOutputWriter(writeOutput);
  validateCheckpointErrorWriter(writeError);
  validateCheckpointArgv(argv);
  const args = parseCheckpointCliArgs(argv);
  validateCheckpointCreator(createCheckpoint);
  const checkpoint = await createCheckpoint({
    ...(args.manifestPath === undefined ? {} : { manifestPath: args.manifestPath }),
    ...(args.readinessRunUrl === undefined ? {} : { readinessRunUrl: args.readinessRunUrl }),
  });
  validateCheckpointCliCheckpoint(checkpoint);

  if (args.outputPath !== undefined) {
    validateCheckpointWriter(writeCheckpoint);
    await writeCheckpoint(args.outputPath, checkpoint);
  }

  writeOutput(formatCheckpointCliOutput(checkpoint, args.format, args.outputPath));

  if (checkpoint.readiness.summary.failed > 0) {
    writeError("\nFailed readiness checks:");
    for (const result of checkpoint.readiness.checks.filter((check) => !check.passed)) {
      writeError(`\n${result.name} (${result.script}) exited with ${result.exitCode ?? result.signal ?? "unknown"}`);
      const output = result.stderr.trim() || result.stdout.trim();
      if (output.length > 0) writeError(output);
    }
    validateCheckpointExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function formatCheckpointCliOutput(
  checkpoint: ReadinessCheckpoint,
  format: CheckpointCliFormat,
  outputPath?: string | undefined,
): string {
  validateCheckpointCliFormat(format, "Checkpoint output format must be json or summary");
  validateCheckpointOutputPath(outputPath);
  validateCheckpointOutputCheckpoint(checkpoint);

  if (format === "json") return JSON.stringify(checkpoint, null, 2);

  return [
    formatReadinessCheckpointSummary(checkpoint),
    ...(outputPath === undefined ? [] : [`checkpoint: ${outputPath}`]),
  ].join("\n");
}

export function parseCheckpointCliArgs(argv: readonly string[]): CheckpointCliArgs {
  validateCheckpointArgv(argv);
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (arg === "--manifest" || arg === "--output" || arg === "--readiness-run-url" || arg === "--format") {
      const value = argv[index + 1];
      setCheckpointOption(values, arg, value);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--manifest|--output|--readiness-run-url|--format)=(.*)$/u);
    if (equals !== null) {
      const name = equals[1]!;
      const value = equals[2]!;
      setCheckpointOption(values, name, value);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  const outputPath = values.get("--output");
  const format = readCheckpointCliFormat(values.get("--format") ?? (outputPath === undefined ? "json" : "summary"));

  return {
    ...(values.has("--manifest") ? { manifestPath: values.get("--manifest")! } : {}),
    ...(outputPath === undefined ? {} : { outputPath }),
    ...(values.has("--readiness-run-url") ? { readinessRunUrl: values.get("--readiness-run-url")! } : {}),
    format,
  };
}

export function isCheckpointDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateCheckpointArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setCheckpointOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  values.set(name, value);
}

function readCheckpointCliFormat(value: string): CheckpointCliFormat {
  validateCheckpointCliFormat(value, "--format must be json or summary");
  return value;
}

function validateCheckpointCliFormat(
  value: unknown,
  message: string,
): asserts value is CheckpointCliFormat {
  if (value !== "json" && value !== "summary") {
    throw new Error(message);
  }
}

function validateCheckpointOptions(options: unknown): asserts options is CheckpointCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Checkpoint options must be an object");
  }
}

function validateCheckpointArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) {
    throw new Error(message);
  }
}

function validateCheckpointOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") {
    throw new Error("Output writer must be a function");
  }
}

function validateCheckpointErrorWriter(writeError: unknown): asserts writeError is (output: string) => void {
  if (typeof writeError !== "function") {
    throw new Error("Error writer must be a function");
  }
}

function validateCheckpointExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") {
    throw new Error("Exit code setter must be a function");
  }
}

function validateCheckpointCreator(
  createCheckpoint: unknown,
): asserts createCheckpoint is (params: CreateReadinessCheckpointParams) => Promise<ReadinessCheckpoint> {
  if (typeof createCheckpoint !== "function") {
    throw new Error("Checkpoint creator must be a function");
  }
}

function validateCheckpointWriter(
  writeCheckpoint: unknown,
): asserts writeCheckpoint is (path: string, checkpoint: ReadinessCheckpoint) => Promise<void> {
  if (typeof writeCheckpoint !== "function") {
    throw new Error("Checkpoint writer must be a function");
  }
}

function validateCheckpointOutputPath(outputPath: unknown): asserts outputPath is string | undefined {
  if (outputPath === undefined) return;

  if (typeof outputPath !== "string") {
    throw new Error("Checkpoint output path must be a string");
  }

  if (outputPath.trim() === "") {
    throw new Error("Checkpoint output path must not be empty");
  }
}

function validateCheckpointOutputCheckpoint(checkpoint: unknown): asserts checkpoint is ReadinessCheckpoint {
  validateCheckpointShape(checkpoint, "Checkpoint output checkpoint", "Checkpoint output readiness");
}

function validateCheckpointCliCheckpoint(checkpoint: unknown): asserts checkpoint is ReadinessCheckpoint {
  validateCheckpointShape(checkpoint, "Checkpoint CLI checkpoint", "Checkpoint CLI readiness");

  for (const check of checkpoint.readiness.checks) {
    if (!check.passed) validateCheckpointCliFailedCheck(check);
  }
}

function validateCheckpointShape(
  checkpoint: unknown,
  checkpointLabel: string,
  readinessLabel: string,
): asserts checkpoint is ReadinessCheckpoint {
  if (typeof checkpoint !== "object" || checkpoint === null || Array.isArray(checkpoint)) {
    throw new Error(`${checkpointLabel} must be an object`);
  }

  const readiness = "readiness" in checkpoint ? checkpoint.readiness : undefined;
  if (typeof readiness !== "object" || readiness === null || Array.isArray(readiness)) {
    throw new Error(`${readinessLabel} must be an object`);
  }

  validateCheckpointSummary(readiness, readinessLabel);
  validateCheckpointChecks(readiness, readinessLabel);
}

function validateCheckpointSummary(readiness: object, readinessLabel: string): void {
  const summary = "summary" in readiness ? readiness.summary : undefined;
  if (typeof summary !== "object" || summary === null || Array.isArray(summary)) {
    throw new Error(`${readinessLabel} summary must be an object`);
  }
  const summaryRecord = summary as Record<string, unknown>;

  for (const field of ["checks", "passed", "failed"] as const) {
    if (typeof summaryRecord[field] !== "number") {
      throw new Error(`${readinessLabel} summary ${field} must be a number`);
    }
  }
}

function validateCheckpointChecks(
  readiness: object,
  readinessLabel: string,
): asserts readiness is { checks: ReadinessCheckpoint["readiness"]["checks"] } {
  const checks = "checks" in readiness ? readiness.checks : undefined;
  if (!Array.isArray(checks)) {
    throw new Error(`${readinessLabel} checks must be an array`);
  }

  for (const check of checks) {
    if (typeof check !== "object" || check === null || Array.isArray(check)) {
      throw new Error(`${readinessLabel} check must be an object`);
    }

    if (!("name" in check) || typeof check.name !== "string") {
      throw new Error(`${readinessLabel} check name must be a string`);
    }

    if (!("passed" in check) || typeof check.passed !== "boolean") {
      throw new Error(`${readinessLabel} check ${check.name} passed must be a boolean`);
    }

    if (check.name.trim() === "") {
      if (readinessLabel === "Checkpoint CLI readiness" && !check.passed) {
        throw new Error("Checkpoint CLI failed check name must not be empty");
      }

      throw new Error(`${readinessLabel} check name must not be empty`);
    }
  }
}

function validateCheckpointCliFailedCheck(
  check: ReadinessCheckpoint["readiness"]["checks"][number],
): void {
  if (check.name.trim() === "") {
    throw new Error("Checkpoint CLI failed check name must not be empty");
  }

  if (typeof check.script !== "string") {
    throw new Error(`Checkpoint CLI failed check ${check.name} script must be a string`);
  }

  if (check.script.trim() === "") {
    throw new Error(`Checkpoint CLI failed check ${check.name} script must not be empty`);
  }

  if (!(typeof check.exitCode === "number" || check.exitCode === null)) {
    throw new Error(`Checkpoint CLI failed check ${check.name} exitCode must be a number or null`);
  }

  if (!(typeof check.signal === "string" || check.signal === null)) {
    throw new Error(`Checkpoint CLI failed check ${check.name} signal must be a string or null`);
  }

  if (typeof check.stdout !== "string") {
    throw new Error(`Checkpoint CLI failed check ${check.name} stdout must be a string`);
  }

  if (typeof check.stderr !== "string") {
    throw new Error(`Checkpoint CLI failed check ${check.name} stderr must be a string`);
  }
}
