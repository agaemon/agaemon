import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createFundingReadyOperatorDemoReport,
  formatFundingReadyOperatorDemoVerificationSummary,
  validateFundingReadyOperatorDemoVerification,
  verifyFundingReadyOperatorDemoReport,
} from "../../operator/fundingReadyDemo.js";
import type {
  CreateFundingReadyOperatorDemoReportParams,
  FundingReadyOperatorDemoReport,
  FundingReadyOperatorDemoVerification,
  VerifyFundingReadyOperatorDemoReportParams,
} from "../../operator/fundingReadyDemo.js";

const DEFAULT_DEMO_PATH = "artifacts/funding-ready-demo.json";
const DEFAULT_LAUNCH_GATE_PATH = "artifacts/base-sepolia-launch-gate.json";
const DEFAULT_HEALTH_PATH = "artifacts/base-sepolia-health.json";
const DEFAULT_RELEASE_STATUS_PATH = "docs/releases/latest.json";
const DEFAULT_EVENT_INDEX_PATH = "artifacts/base-event-index.json";
const DEFAULT_EVENT_INDEX_VERIFICATION_PATH = "artifacts/base-event-index-verification.json";
const DEFAULT_ECONOMIC_PAYOUT_SUMMARY_VERIFICATION_PATH = "artifacts/economic-payout-summary-verification.json";
const DEFAULT_DASHBOARD_PATH = "artifacts/operator-dashboard.json";
const DEFAULT_DASHBOARD_VERIFICATION_PATH = "artifacts/operator-dashboard-verification.json";

export type FundingReadyOperatorDemoVerifyCliFormat = "json" | "summary";

export interface FundingReadyOperatorDemoVerifyCliArgs {
  demoPath: string;
  launchGatePath: string;
  healthPath: string;
  releaseStatusPath: string;
  eventIndexPath: string;
  eventIndexVerificationPath: string;
  economicPayoutSummaryVerificationPath: string;
  dashboardPath: string;
  dashboardVerificationPath: string;
  outputPath?: string | undefined;
  format: FundingReadyOperatorDemoVerifyCliFormat;
}

export interface FundingReadyOperatorDemoVerifyCliOptions {
  argv?: readonly string[] | undefined;
  env?: Record<string, string | undefined> | undefined;
  writeOutput?: (output: string) => void;
  readText?: (path: string) => Promise<string>;
  writeText?: (path: string, contents: string) => Promise<void>;
  mkdirp?: (path: string) => Promise<void>;
  createReport?: (params: CreateFundingReadyOperatorDemoReportParams) => FundingReadyOperatorDemoReport;
  verifyReport?: (params: VerifyFundingReadyOperatorDemoReportParams) => FundingReadyOperatorDemoVerification;
  setExitCode?: (code: number) => void;
}

if (isFundingReadyOperatorDemoVerifyDirectRun(import.meta.url, process.argv)) {
  await runFundingReadyOperatorDemoVerifyCli();
}

export function parseFundingReadyOperatorDemoVerifyCliArgs(
  argv: readonly string[],
): FundingReadyOperatorDemoVerifyCliArgs {
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
    const equals = arg.match(
      /^(--demo|--launch-gate|--health|--release-status|--event-index|--event-index-verification|--economic-payout-summary-verification|--dashboard|--dashboard-verification|--output|--format)=(.*)$/u,
    );
    if (equals !== null) {
      setOption(values, equals[1]!, equals[2]!);
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }

  return {
    demoPath: values.get("--demo") ?? DEFAULT_DEMO_PATH,
    launchGatePath: values.get("--launch-gate") ?? DEFAULT_LAUNCH_GATE_PATH,
    healthPath: values.get("--health") ?? DEFAULT_HEALTH_PATH,
    releaseStatusPath: values.get("--release-status") ?? DEFAULT_RELEASE_STATUS_PATH,
    eventIndexPath: values.get("--event-index") ?? DEFAULT_EVENT_INDEX_PATH,
    eventIndexVerificationPath: values.get("--event-index-verification") ?? DEFAULT_EVENT_INDEX_VERIFICATION_PATH,
    economicPayoutSummaryVerificationPath: values.get("--economic-payout-summary-verification") ??
      DEFAULT_ECONOMIC_PAYOUT_SUMMARY_VERIFICATION_PATH,
    dashboardPath: values.get("--dashboard") ?? DEFAULT_DASHBOARD_PATH,
    dashboardVerificationPath: values.get("--dashboard-verification") ?? DEFAULT_DASHBOARD_VERIFICATION_PATH,
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
    format: readFormat(values.get("--format") ?? "json"),
  };
}

export async function runFundingReadyOperatorDemoVerifyCli(
  options: FundingReadyOperatorDemoVerifyCliOptions = {},
): Promise<void> {
  validateFundingReadyOperatorDemoVerifyCliOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const writeText = options.writeText ?? writeFile;
  const mkdirp = options.mkdirp ?? ((path: string) => mkdir(path, { recursive: true }));
  const createReport = options.createReport ?? createFundingReadyOperatorDemoReport;
  const verifyReport = options.verifyReport ?? verifyFundingReadyOperatorDemoReport;
  const setExitCode = options.setExitCode ?? ((code: number) => { process.exitCode = code; });

  validateOutputWriter(writeOutput);
  const args = parseFundingReadyOperatorDemoVerifyCliArgs(argv);
  const [
    savedDemoJson,
    launchGateJson,
    healthJson,
    releaseStatusJson,
    eventIndexJson,
    eventIndexVerificationJson,
    economicPayoutSummaryVerificationJson,
    dashboardJson,
    dashboardVerificationJson,
  ] = await Promise.all([
    readText(args.demoPath),
    readText(args.launchGatePath),
    readText(args.healthPath),
    readText(args.releaseStatusPath),
    readText(args.eventIndexPath),
    readText(args.eventIndexVerificationPath),
    readText(args.economicPayoutSummaryVerificationPath),
    readText(args.dashboardPath),
    readText(args.dashboardVerificationPath),
  ]);
  const expected = createReport({
    launchGatePath: args.launchGatePath,
    launchGate: JSON.parse(launchGateJson) as CreateFundingReadyOperatorDemoReportParams["launchGate"],
    healthPath: args.healthPath,
    health: JSON.parse(healthJson) as CreateFundingReadyOperatorDemoReportParams["health"],
    releaseStatusPath: args.releaseStatusPath,
    releaseStatusJson,
    eventIndexPath: args.eventIndexPath,
    eventIndex: JSON.parse(eventIndexJson) as CreateFundingReadyOperatorDemoReportParams["eventIndex"],
    eventIndexVerificationPath: args.eventIndexVerificationPath,
    eventIndexVerification: JSON.parse(eventIndexVerificationJson) as CreateFundingReadyOperatorDemoReportParams["eventIndexVerification"],
    economicPayoutSummaryVerificationPath: args.economicPayoutSummaryVerificationPath,
    economicPayoutSummaryVerification: JSON.parse(economicPayoutSummaryVerificationJson) as CreateFundingReadyOperatorDemoReportParams["economicPayoutSummaryVerification"],
    dashboardPath: args.dashboardPath,
    dashboard: JSON.parse(dashboardJson) as CreateFundingReadyOperatorDemoReportParams["dashboard"],
    dashboardVerificationPath: args.dashboardVerificationPath,
    dashboardVerification: JSON.parse(dashboardVerificationJson) as CreateFundingReadyOperatorDemoReportParams["dashboardVerification"],
  });
  const verification = verifyReport({
    saved: JSON.parse(savedDemoJson) as FundingReadyOperatorDemoReport,
    expected,
  });
  validateFundingReadyOperatorDemoVerification(verification);

  if (args.outputPath !== undefined) {
    await mkdirp(dirname(args.outputPath));
    await writeText(args.outputPath, `${JSON.stringify(verification, null, 2)}\n`);
  }

  writeOutput(formatFundingReadyOperatorDemoVerifyCliOutput(verification, args.format));
  if (!verification.passed) setExitCode(1);
}

export function formatFundingReadyOperatorDemoVerifyCliOutput(
  verification: FundingReadyOperatorDemoVerification,
  format: FundingReadyOperatorDemoVerifyCliFormat,
): string {
  validateFormat(format);
  validateFundingReadyOperatorDemoVerification(verification);
  return format === "summary"
    ? formatFundingReadyOperatorDemoVerificationSummary(verification)
    : JSON.stringify(verification, null, 2);
}

export function isFundingReadyOperatorDemoVerifyDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateStringArray(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function isValueFlag(arg: string): boolean {
  return arg === "--demo" || arg === "--launch-gate" || arg === "--health" || arg === "--release-status" ||
    arg === "--event-index" || arg === "--event-index-verification" ||
    arg === "--economic-payout-summary-verification" || arg === "--dashboard" ||
    arg === "--dashboard-verification" || arg === "--output" || arg === "--format";
}

function setOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function readFormat(value: string): FundingReadyOperatorDemoVerifyCliFormat {
  validateFormat(value, "--format must be json or summary");
  return value;
}

function validateFormat(
  value: unknown,
  message = "Funding-ready operator demo verification output format must be json or summary",
): asserts value is FundingReadyOperatorDemoVerifyCliFormat {
  if (value !== "json" && value !== "summary") throw new Error(message);
}

function validateFundingReadyOperatorDemoVerifyCliOptions(
  options: unknown,
): asserts options is FundingReadyOperatorDemoVerifyCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Funding-ready operator demo verification options must be an object");
  }
}

function validateStringArray(value: unknown, message: string): asserts value is readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) throw new Error(message);
}

function validateOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}
