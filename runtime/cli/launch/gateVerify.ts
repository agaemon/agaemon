import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatBaseSepoliaLaunchGateVerificationSummary,
  validateLaunchGateVerification,
  verifyBaseSepoliaLaunchGateReport,
} from "../../launch/gateVerify.js";

import type {
  BaseSepoliaLaunchGateVerification,
  VerifyBaseSepoliaLaunchGateReportParams,
} from "../../launch/gateVerify.js";

const DEFAULT_LAUNCH_GATE_PATH = "artifacts/base-sepolia-launch-gate.json";
const DEFAULT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";
const DEFAULT_HEALTH_PATH = "artifacts/base-sepolia-health.json";

export type LaunchGateVerifyCliFormat = "json" | "summary";

export interface LaunchGateVerifyCliArgs {
  launchGatePath: string;
  manifestPath?: string | undefined;
  healthPath?: string | undefined;
  localPreflightPath?: string | undefined;
  securityEvidencePath?: string | undefined;
  economicPayoutSummaryVerificationPath?: string | undefined;
  outputPath?: string | undefined;
  format: LaunchGateVerifyCliFormat;
}

export interface LaunchGateVerifyCliOptions {
  argv?: readonly string[] | undefined;
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  writeText?: (path: string, contents: string) => Promise<void>;
  mkdirp?: (path: string) => Promise<void>;
  verifyGate?: (report: unknown, params?: VerifyBaseSepoliaLaunchGateReportParams) => BaseSepoliaLaunchGateVerification;
}

if (isLaunchGateVerifyDirectRun(import.meta.url, process.argv)) await runLaunchGateVerifyCli();

export async function runLaunchGateVerifyCli(options: LaunchGateVerifyCliOptions = {}): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => { process.exitCode = code; });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const writeText = options.writeText ?? writeFile;
  const mkdirp = options.mkdirp ?? ((path: string) => mkdir(path, { recursive: true }));
  const verifyGate = options.verifyGate ?? verifyBaseSepoliaLaunchGateReport;

  validateStringArray(argv, "CLI argv must be an array of strings");
  const args = parseLaunchGateVerifyCliArgs(argv);
  validateOutputWriter(writeOutput);
  validateTextReader(readText);
  const [
    gateJson,
    manifestContents,
    healthJson,
    localPreflightJson,
    securityEvidenceJson,
    economicPayoutSummaryVerificationJson,
  ] = await Promise.all([
    readText(args.launchGatePath),
    args.manifestPath === undefined ? Promise.resolve(undefined) : readText(args.manifestPath),
    args.healthPath === undefined ? Promise.resolve(undefined) : readText(args.healthPath),
    args.localPreflightPath === undefined ? Promise.resolve(undefined) : readText(args.localPreflightPath),
    args.securityEvidencePath === undefined ? Promise.resolve(undefined) : readText(args.securityEvidencePath),
    args.economicPayoutSummaryVerificationPath === undefined
      ? Promise.resolve(undefined)
      : readText(args.economicPayoutSummaryVerificationPath),
  ]);
  const verification = verifyGate(JSON.parse(gateJson) as unknown, {
    ...(manifestContents === undefined ? {} : { manifestContents }),
    ...(healthJson === undefined ? {} : { health: JSON.parse(healthJson) as unknown }),
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
  validateLaunchGateVerification(verification);

  if (args.outputPath !== undefined) {
    validateTextWriter(writeText);
    await mkdirp(dirname(args.outputPath));
    await writeText(args.outputPath, `${JSON.stringify(verification, null, 2)}\n`);
  }

  writeOutput(formatLaunchGateVerifyCliOutput(verification, args.format));

  if (!verification.passed) {
    validateExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseLaunchGateVerifyCliArgs(argv: readonly string[]): LaunchGateVerifyCliArgs {
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
    const equals = arg.match(/^(--launch-gate|--manifest|--health|--local-preflight|--security-evidence|--economic-payout-summary-verification|--output|--format)=(.*)$/u);
    if (equals !== null) {
      setOption(values, equals[1]!, equals[2]!);
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }

  return {
    launchGatePath: values.get("--launch-gate") ?? DEFAULT_LAUNCH_GATE_PATH,
    manifestPath: values.get("--manifest") ?? DEFAULT_MANIFEST_PATH,
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

export function formatLaunchGateVerifyCliOutput(
  verification: BaseSepoliaLaunchGateVerification,
  format: LaunchGateVerifyCliFormat,
): string {
  validateLaunchGateVerification(verification);
  validateFormat(format);
  return format === "summary" ? formatBaseSepoliaLaunchGateVerificationSummary(verification) : JSON.stringify(verification, null, 2);
}

export function isLaunchGateVerifyDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateStringArray(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function isValueFlag(arg: string): boolean {
  return arg === "--launch-gate" || arg === "--manifest" || arg === "--health" ||
    arg === "--local-preflight" || arg === "--security-evidence" ||
    arg === "--economic-payout-summary-verification" || arg === "--output" || arg === "--format";
}

function setOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function readFormat(value: string): LaunchGateVerifyCliFormat {
  validateFormat(value, "--format must be json or summary");
  return value;
}

function validateFormat(value: unknown, message = "Launch gate verification output format must be json or summary"): asserts value is LaunchGateVerifyCliFormat {
  if (value !== "json" && value !== "summary") throw new Error(message);
}

function validateOptions(options: unknown): asserts options is LaunchGateVerifyCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Launch gate verification options must be an object");
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
