import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatReadinessCheckpointVerificationSummary,
  readReadinessCheckpoint,
  verifyReadinessCheckpoint,
} from "../../base/checkpoint.js";

import type {
  ReadinessCheckpointVerification,
  VerifyReadinessCheckpointParams,
} from "../../base/checkpoint.js";

export interface CheckpointVerifyCliReport extends ReadinessCheckpointVerification {
  checkpoint: string;
  manifest?: string | undefined;
  requireRunUrl: boolean;
}

export type CheckpointVerifyCliFormat = "json" | "summary";

export interface CheckpointVerifyCliArgs {
  checkpointPath: string;
  manifestPath?: string | undefined;
  requireRunUrl: boolean;
  format: CheckpointVerifyCliFormat;
}

export interface CheckpointVerifyCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readCheckpoint?: (path: string) => Promise<unknown>;
  readManifestText?: (path: string) => Promise<string>;
  verifyCheckpoint?: (checkpoint: unknown, params?: VerifyReadinessCheckpointParams) => ReadinessCheckpointVerification;
}

if (isCheckpointVerifyDirectRun(import.meta.url, process.argv)) await runCheckpointVerifyCli();

export async function runCheckpointVerifyCli(options: CheckpointVerifyCliOptions = {}): Promise<void> {
  validateCheckpointVerifyOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readCheckpoint = options.readCheckpoint ?? readReadinessCheckpoint;
  const readManifestText = options.readManifestText ?? readCheckpointVerifyManifestText;
  const verifyCheckpoint = options.verifyCheckpoint ?? verifyReadinessCheckpoint;

  validateCheckpointVerifyOutputWriter(writeOutput);
  validateCheckpointVerifyArgv(argv);
  const args = parseCheckpointVerifyCliArgs(argv);
  validateCheckpointVerifyCheckpointReader(readCheckpoint);
  const checkpoint = await readCheckpoint(args.checkpointPath);
  const manifestContents = args.manifestPath === undefined ? undefined : await readManifestText(args.manifestPath);
  validateCheckpointVerifyVerifier(verifyCheckpoint);
  const verification = verifyCheckpoint(checkpoint, {
    ...(manifestContents === undefined ? {} : { manifestContents }),
    requireRunUrl: args.requireRunUrl,
  });
  validateCheckpointVerificationResult(verification);
  const report: CheckpointVerifyCliReport = {
    checkpoint: args.checkpointPath,
    ...(args.manifestPath === undefined ? {} : { manifest: args.manifestPath }),
    requireRunUrl: args.requireRunUrl,
    ...verification,
  };

  writeOutput(formatCheckpointVerifyCliOutput(report, args.format));

  if (!verification.passed) {
    validateCheckpointVerifyExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function formatCheckpointVerifyCliOutput(
  report: CheckpointVerifyCliReport,
  format: CheckpointVerifyCliFormat,
): string {
  validateCheckpointVerifyCliFormat(format, "Checkpoint verification output format must be json or summary");
  validateCheckpointVerifyReport(report);

  if (format === "json") return JSON.stringify(report, null, 2);

  return [
    "Base Sepolia readiness checkpoint verification",
    `checkpoint: ${report.checkpoint}`,
    ...(report.manifest === undefined ? [] : [`manifest: ${report.manifest}`]),
    `requireRunUrl: ${report.requireRunUrl}`,
    formatReadinessCheckpointVerificationSummary(report).split("\n").slice(1).join("\n"),
  ].join("\n");
}

export function parseCheckpointVerifyCliArgs(argv: readonly string[]): CheckpointVerifyCliArgs {
  validateCheckpointVerifyArgv(argv);
  const values = new Map<string, string>();
  let requireRunUrl = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (arg === "--require-run-url") {
      if (requireRunUrl) throw new Error("Duplicate argument: --require-run-url");
      requireRunUrl = true;
      continue;
    }

    if (arg === "--checkpoint" || arg === "--manifest" || arg === "--format") {
      setCheckpointVerifyOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--checkpoint|--manifest|--format)=(.*)$/u);
    if (equals !== null) {
      setCheckpointVerifyOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  const checkpointPath = values.get("--checkpoint");
  if (checkpointPath === undefined) throw new Error("--checkpoint is required");
  const format = readCheckpointVerifyCliFormat(values.get("--format") ?? "json");

  return {
    checkpointPath,
    ...(values.has("--manifest") ? { manifestPath: values.get("--manifest")! } : {}),
    requireRunUrl,
    format,
  };
}

export function isCheckpointVerifyDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateCheckpointVerifyArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

async function readCheckpointVerifyManifestText(path: string): Promise<string> {
  return readFile(path, "utf8");
}

function setCheckpointVerifyOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  values.set(name, value);
}

function readCheckpointVerifyCliFormat(value: string): CheckpointVerifyCliFormat {
  validateCheckpointVerifyCliFormat(value, "--format must be json or summary");
  return value;
}

function validateCheckpointVerifyCliFormat(
  value: unknown,
  message: string,
): asserts value is CheckpointVerifyCliFormat {
  if (value !== "json" && value !== "summary") {
    throw new Error(message);
  }
}

function validateCheckpointVerifyOptions(options: unknown): asserts options is CheckpointVerifyCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Checkpoint verify options must be an object");
  }
}

function validateCheckpointVerifyArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) {
    throw new Error(message);
  }
}

function validateCheckpointVerifyOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") {
    throw new Error("Output writer must be a function");
  }
}

function validateCheckpointVerifyExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") {
    throw new Error("Exit code setter must be a function");
  }
}

function validateCheckpointVerifyCheckpointReader(
  readCheckpoint: unknown,
): asserts readCheckpoint is (path: string) => Promise<unknown> {
  if (typeof readCheckpoint !== "function") {
    throw new Error("Checkpoint reader must be a function");
  }
}

function validateCheckpointVerifyVerifier(
  verifyCheckpoint: unknown,
): asserts verifyCheckpoint is (
  checkpoint: unknown,
  params?: VerifyReadinessCheckpointParams,
) => ReadinessCheckpointVerification {
  if (typeof verifyCheckpoint !== "function") {
    throw new Error("Checkpoint verifier must be a function");
  }
}

function validateCheckpointVerifyReport(report: unknown): asserts report is CheckpointVerifyCliReport {
  validateCheckpointVerificationResult(report);
  const reportRecord = report as unknown as Record<string, unknown>;

  if (typeof reportRecord.checkpoint !== "string") {
    throw new Error("Checkpoint verification report checkpoint must be a string");
  }

  if (reportRecord.checkpoint.trim() === "") {
    throw new Error("Checkpoint verification report checkpoint must not be empty");
  }

  if (reportRecord.manifest !== undefined) {
    if (typeof reportRecord.manifest !== "string") {
      throw new Error("Checkpoint verification report manifest must be a string");
    }

    if (reportRecord.manifest.trim() === "") {
      throw new Error("Checkpoint verification report manifest must not be empty");
    }
  }

  if (typeof reportRecord.requireRunUrl !== "boolean") {
    throw new Error("Checkpoint verification report requireRunUrl must be a boolean");
  }
}

function validateCheckpointVerificationResult(
  verification: unknown,
): asserts verification is ReadinessCheckpointVerification {
  if (typeof verification !== "object" || verification === null || Array.isArray(verification)) {
    throw new Error("Checkpoint verification report must be an object");
  }

  if (!("passed" in verification) || typeof verification.passed !== "boolean") {
    throw new Error("Checkpoint verification report passed must be a boolean");
  }

  if (!("failures" in verification) || !Array.isArray(verification.failures)) {
    throw new Error("Checkpoint verification report failures must be an array");
  }

  verification.failures.forEach((failure, index) => {
    if (typeof failure !== "string") {
      throw new Error(`Checkpoint verification report failure ${index} must be a string`);
    }

    if (failure.trim() === "") {
      throw new Error(`Checkpoint verification report failure ${index} must not be empty`);
    }
  });
}
