import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatBaseSepoliaHealthVerificationSummary,
  validateHealthVerification,
  verifyBaseSepoliaHealthReport,
} from "../../launch/healthVerify.js";

import type {
  BaseSepoliaHealthVerification,
  VerifyBaseSepoliaHealthReportParams,
} from "../../launch/healthVerify.js";

const DEFAULT_HEALTH_PATH = "artifacts/base-sepolia-health.json";
const DEFAULT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";
const DEFAULT_STATUS_PATH = "docs/releases/latest.json";

export type LaunchHealthVerifyCliFormat = "json" | "summary";

export interface LaunchHealthVerifyCliArgs {
  healthPath: string;
  manifestPath?: string | undefined;
  statusPath?: string | undefined;
  outputPath?: string | undefined;
  format: LaunchHealthVerifyCliFormat;
}

export interface LaunchHealthVerifyCliOptions {
  argv?: readonly string[] | undefined;
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  writeText?: (path: string, contents: string) => Promise<void>;
  mkdirp?: (path: string) => Promise<void>;
  verifyHealth?: (report: unknown, params?: VerifyBaseSepoliaHealthReportParams) => BaseSepoliaHealthVerification;
}

if (isLaunchHealthVerifyDirectRun(import.meta.url, process.argv)) await runLaunchHealthVerifyCli();

export async function runLaunchHealthVerifyCli(options: LaunchHealthVerifyCliOptions = {}): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => { process.exitCode = code; });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const writeText = options.writeText ?? writeFile;
  const mkdirp = options.mkdirp ?? ((path: string) => mkdir(path, { recursive: true }));
  const verifyHealth = options.verifyHealth ?? verifyBaseSepoliaHealthReport;

  validateStringArray(argv, "CLI argv must be an array of strings");
  const args = parseLaunchHealthVerifyCliArgs(argv);
  validateOutputWriter(writeOutput);
  validateTextReader(readText);
  const [healthJson, manifestContents] = await Promise.all([
    readText(args.healthPath),
    args.manifestPath === undefined ? Promise.resolve(undefined) : readText(args.manifestPath),
  ]);
  const verification = verifyHealth(JSON.parse(healthJson) as unknown, {
    ...(args.manifestPath === undefined ? {} : { manifestPath: args.manifestPath }),
    ...(manifestContents === undefined ? {} : { manifestContents }),
    ...(args.statusPath === undefined ? {} : { releaseStatusPath: args.statusPath }),
  });
  validateHealthVerification(verification);

  if (args.outputPath !== undefined) {
    validateTextWriter(writeText);
    await mkdirp(dirname(args.outputPath));
    await writeText(args.outputPath, `${JSON.stringify(verification, null, 2)}\n`);
  }

  writeOutput(formatLaunchHealthVerifyCliOutput(verification, args.format));

  if (!verification.passed) {
    validateExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseLaunchHealthVerifyCliArgs(argv: readonly string[]): LaunchHealthVerifyCliArgs {
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
    const equals = arg.match(/^(--health|--manifest|--status|--output|--format)=(.*)$/u);
    if (equals !== null) {
      setOption(values, equals[1]!, equals[2]!);
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }

  return {
    healthPath: values.get("--health") ?? DEFAULT_HEALTH_PATH,
    manifestPath: values.get("--manifest") ?? DEFAULT_MANIFEST_PATH,
    statusPath: values.get("--status") ?? DEFAULT_STATUS_PATH,
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
    format: readFormat(values.get("--format") ?? "json"),
  };
}

export function formatLaunchHealthVerifyCliOutput(
  verification: BaseSepoliaHealthVerification,
  format: LaunchHealthVerifyCliFormat,
): string {
  validateHealthVerification(verification);
  validateFormat(format);
  return format === "summary" ? formatBaseSepoliaHealthVerificationSummary(verification) : JSON.stringify(verification, null, 2);
}

export function isLaunchHealthVerifyDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateStringArray(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function isValueFlag(arg: string): boolean {
  return arg === "--health" || arg === "--manifest" || arg === "--status" || arg === "--output" || arg === "--format";
}

function setOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function readFormat(value: string): LaunchHealthVerifyCliFormat {
  validateFormat(value, "--format must be json or summary");
  return value;
}

function validateFormat(value: unknown, message = "Launch health verification output format must be json or summary"): asserts value is LaunchHealthVerifyCliFormat {
  if (value !== "json" && value !== "summary") throw new Error(message);
}

function validateOptions(options: unknown): asserts options is LaunchHealthVerifyCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Launch health verification options must be an object");
  }
}

function validateStringArray(value: unknown, message: string): asserts value is readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) throw new Error(message);
}

function validateOutputWriter(value: unknown): asserts value is (output: string) => void {
  if (typeof value !== "function") throw new Error("Output writer must be a function");
}

function validateExitCodeSetter(value: unknown): asserts value is (code: number) => void {
  if (typeof value !== "function") throw new Error("Exit code setter must be a function");
}

function validateTextReader(value: unknown): asserts value is (path: string) => Promise<string> {
  if (typeof value !== "function") throw new Error("Text reader must be a function");
}

function validateTextWriter(value: unknown): asserts value is (path: string, contents: string) => Promise<void> {
  if (typeof value !== "function") throw new Error("Text writer must be a function");
}
