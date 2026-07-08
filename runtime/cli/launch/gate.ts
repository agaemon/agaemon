import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createBaseSepoliaLaunchGateReport,
  formatBaseSepoliaLaunchGateSummary,
  validateLaunchGateReport,
} from "../../launch/gate.js";

import type {
  BaseSepoliaLaunchGateReport,
  CreateBaseSepoliaLaunchGateReportParams,
} from "../../launch/gate.js";

const DEFAULT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";
const DEFAULT_CHECKPOINT_PATH = "artifacts/base-sepolia-readiness-checkpoint.json";
const DEFAULT_STATUS_PATH = "docs/releases/latest.json";
const DEFAULT_HEALTH_PATH = "artifacts/base-sepolia-health.json";

export type LaunchGateCliFormat = "json" | "summary";

export interface LaunchGateCliArgs {
  manifestPath: string;
  checkpointPath: string;
  statusPath: string;
  healthPath: string;
  localPreflightPath?: string | undefined;
  securityEvidencePath?: string | undefined;
  economicPayoutSummaryVerificationPath?: string | undefined;
  outputPath?: string | undefined;
  format: LaunchGateCliFormat;
}

export interface LaunchGateCliOptions {
  argv?: readonly string[] | undefined;
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  writeText?: (path: string, contents: string) => Promise<void>;
  mkdirp?: (path: string) => Promise<void>;
  createGateReport?: (params: CreateBaseSepoliaLaunchGateReportParams) => BaseSepoliaLaunchGateReport;
}

if (isLaunchGateDirectRun(import.meta.url, process.argv)) await runLaunchGateCli();

export async function runLaunchGateCli(options: LaunchGateCliOptions = {}): Promise<void> {
  validateLaunchGateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => { process.exitCode = code; });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const writeText = options.writeText ?? writeFile;
  const mkdirp = options.mkdirp ?? ((path: string) => mkdir(path, { recursive: true }));
  const createGateReport = options.createGateReport ?? createBaseSepoliaLaunchGateReport;

  validateStringArray(argv, "CLI argv must be an array of strings");
  const args = parseLaunchGateCliArgs(argv);
  validateOutputWriter(writeOutput);
  validateTextReader(readText);
  const [
    manifestContents,
    checkpointJson,
    statusJson,
    healthJson,
    localPreflightJson,
    securityEvidenceJson,
    economicPayoutSummaryVerificationJson,
  ] = await Promise.all([
    readText(args.manifestPath),
    readText(args.checkpointPath),
    readText(args.statusPath),
    readText(args.healthPath),
    args.localPreflightPath === undefined ? Promise.resolve(undefined) : readText(args.localPreflightPath),
    args.securityEvidencePath === undefined ? Promise.resolve(undefined) : readText(args.securityEvidencePath),
    args.economicPayoutSummaryVerificationPath === undefined
      ? Promise.resolve(undefined)
      : readText(args.economicPayoutSummaryVerificationPath),
  ]);

  const report = createGateReport({
    manifestPath: args.manifestPath,
    manifestContents,
    checkpoint: JSON.parse(checkpointJson) as unknown,
    releaseStatusPath: args.statusPath,
    releaseStatusJson: statusJson,
    health: JSON.parse(healthJson) as unknown,
    ...(localPreflightJson === undefined
      ? {}
      : { localPreflight: JSON.parse(localPreflightJson) as unknown }),
    ...(securityEvidenceJson === undefined
      ? {}
      : { securityEvidence: JSON.parse(securityEvidenceJson) as unknown }),
    ...(economicPayoutSummaryVerificationJson === undefined
      ? {}
      : { economicPayoutSummaryVerification: JSON.parse(economicPayoutSummaryVerificationJson) as unknown }),
  });
  validateLaunchGateReport(report);

  if (args.outputPath !== undefined) {
    validateTextWriter(writeText);
    await mkdirp(dirname(args.outputPath));
    await writeText(args.outputPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  writeOutput(formatLaunchGateCliOutput(report, args.format));

  if (!report.passed) {
    validateExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseLaunchGateCliArgs(argv: readonly string[]): LaunchGateCliArgs {
  validateStringArray(argv, "CLI argv must be an array of strings");
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (isGateValueFlag(arg)) {
      setOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }
    const equals = arg.match(/^(--manifest|--checkpoint|--status|--health|--local-preflight|--security-evidence|--economic-payout-summary-verification|--output|--format)=(.*)$/u);
    if (equals !== null) {
      setOption(values, equals[1]!, equals[2]!);
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }

  return {
    manifestPath: values.get("--manifest") ?? DEFAULT_MANIFEST_PATH,
    checkpointPath: values.get("--checkpoint") ?? DEFAULT_CHECKPOINT_PATH,
    statusPath: values.get("--status") ?? DEFAULT_STATUS_PATH,
    healthPath: values.get("--health") ?? DEFAULT_HEALTH_PATH,
    ...(values.has("--local-preflight") ? { localPreflightPath: values.get("--local-preflight")! } : {}),
    ...(values.has("--security-evidence") ? { securityEvidencePath: values.get("--security-evidence")! } : {}),
    ...(values.has("--economic-payout-summary-verification")
      ? { economicPayoutSummaryVerificationPath: values.get("--economic-payout-summary-verification")! }
      : {}),
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
    format: readFormat(values.get("--format") ?? "json"),
  };
}

export function formatLaunchGateCliOutput(report: BaseSepoliaLaunchGateReport, format: LaunchGateCliFormat): string {
  validateLaunchGateReport(report);
  validateFormat(format);
  return format === "summary" ? formatBaseSepoliaLaunchGateSummary(report) : JSON.stringify(report, null, 2);
}

export function isLaunchGateDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateStringArray(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function isGateValueFlag(arg: string): boolean {
  return arg === "--manifest" || arg === "--checkpoint" || arg === "--status" || arg === "--health" ||
    arg === "--local-preflight" || arg === "--security-evidence" ||
    arg === "--economic-payout-summary-verification" || arg === "--output" || arg === "--format";
}

function setOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function readFormat(value: string): LaunchGateCliFormat {
  validateFormat(value, "--format must be json or summary");
  return value;
}

function validateFormat(value: unknown, message = "Launch gate output format must be json or summary"): asserts value is LaunchGateCliFormat {
  if (value !== "json" && value !== "summary") throw new Error(message);
}

function validateLaunchGateOptions(options: unknown): asserts options is LaunchGateCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Launch gate options must be an object");
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
