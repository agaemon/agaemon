import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readDeploymentManifest } from "../../base/deploymentManifest.js";
import {
  createManifestVerifyPublicClient,
  loadManifestVerifyDotEnv,
  readRequiredManifestVerifyEnv,
} from "../base/manifestVerify.js";
import { verifyDeploymentManifest } from "../../base/manifestVerifier.js";
import {
  createBaseSepoliaHealthReport,
  formatBaseSepoliaHealthSummary,
  validateHealthReport,
} from "../../launch/health.js";

import type { DeploymentManifest } from "../../base/deploymentManifest.js";
import type {
  DeploymentManifestVerifyClient,
  DeploymentManifestVerifyReport,
} from "../../base/manifestVerifier.js";
import type {
  BaseSepoliaHealthReport,
  CreateBaseSepoliaHealthReportParams,
  OperatorAccountState,
} from "../../launch/health.js";
import type { Address } from "viem";

const DEFAULT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";
const DEFAULT_STATUS_PATH = "docs/releases/latest.json";

export type LaunchHealthCliFormat = "json" | "summary";

export interface LaunchHealthCliArgs {
  manifestPath: string;
  statusPath: string;
  outputPath?: string | undefined;
  agentAccountSafetyPath?: string | undefined;
  format: LaunchHealthCliFormat;
  maxReleaseAgeDays?: number | undefined;
  skipLive: boolean;
}

export interface LaunchHealthCliOptions {
  argv?: readonly string[] | undefined;
  env?: Record<string, string | undefined> | undefined;
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  writeText?: (path: string, contents: string) => Promise<void>;
  mkdirp?: (path: string) => Promise<void>;
  loadDotEnv?: (path: string, env: Record<string, string | undefined>) => void;
  readManifest?: (path: string) => Promise<DeploymentManifest>;
  createPublicClient?: (rpcUrl: string) => LaunchHealthPublicClient;
  verifyManifest?: (manifest: DeploymentManifest, client: DeploymentManifestVerifyClient) => Promise<DeploymentManifestVerifyReport>;
  createHealthReport?: (params: CreateBaseSepoliaHealthReportParams) => BaseSepoliaHealthReport;
}

export interface LaunchHealthPublicClient extends DeploymentManifestVerifyClient {
  getBalance(parameters: { address: Address }): Promise<bigint>;
  getTransactionCount(parameters: { address: Address; blockTag: "pending" }): Promise<number>;
}

if (isLaunchHealthDirectRun(import.meta.url, process.argv)) await runLaunchHealthCli();

export async function runLaunchHealthCli(options: LaunchHealthCliOptions = {}): Promise<void> {
  validateLaunchHealthOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const env = options.env ?? process.env;
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => { process.exitCode = code; });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const writeText = options.writeText ?? writeFile;
  const mkdirp = options.mkdirp ?? ((path: string) => mkdir(path, { recursive: true }));
  const loadDotEnv = options.loadDotEnv ?? loadManifestVerifyDotEnv;
  const readManifest = options.readManifest ?? readDeploymentManifest;
  const createPublicClient = options.createPublicClient ??
    ((rpcUrl: string) => createManifestVerifyPublicClient(rpcUrl) as LaunchHealthPublicClient);
  const verifyManifest = options.verifyManifest ?? verifyDeploymentManifest;
  const createHealthReport = options.createHealthReport ?? createBaseSepoliaHealthReport;

  validateStringArray(argv, "CLI argv must be an array of strings");
  const args = parseLaunchHealthCliArgs(argv);
  validateOutputWriter(writeOutput);
  validateTextReader(readText);
  const [manifestContents, releaseStatusJson, agentAccountSafetyJson] = await Promise.all([
    readText(args.manifestPath),
    readText(args.statusPath),
    args.agentAccountSafetyPath === undefined ? Promise.resolve(undefined) : readText(args.agentAccountSafetyPath),
  ]);

  let manifestVerification: DeploymentManifestVerifyReport | undefined;
  let operatorAccountState: OperatorAccountState | undefined;
  if (!args.skipLive) {
    validateEnv(env);
    loadDotEnv(".env", env);
    const manifest = await readManifest(args.manifestPath);
    const rpcUrl = readRequiredManifestVerifyEnv(env, manifest.rpcUrlEnv);
    const publicClient = createPublicClient(rpcUrl);
    manifestVerification = await verifyManifest(manifest, publicClient);
    operatorAccountState = await readOperatorAccountState(manifest, publicClient);
  }

  const report = createHealthReport({
    manifestPath: args.manifestPath,
    manifestContents,
    releaseStatusPath: args.statusPath,
    releaseStatusJson,
    ...(agentAccountSafetyJson === undefined ? {} : { agentAccountSafety: JSON.parse(agentAccountSafetyJson) as unknown }),
    ...(args.maxReleaseAgeDays === undefined ? {} : { maxReleaseAgeDays: args.maxReleaseAgeDays }),
    ...(manifestVerification === undefined ? {} : { manifestVerification }),
    ...(operatorAccountState === undefined ? {} : { operatorAccountState }),
  });
  validateHealthReport(report);

  if (args.outputPath !== undefined) {
    validateTextWriter(writeText);
    await mkdirp(dirname(args.outputPath));
    await writeText(args.outputPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  writeOutput(formatLaunchHealthCliOutput(report, args.format));

  if (!report.passed) {
    validateExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseLaunchHealthCliArgs(argv: readonly string[]): LaunchHealthCliArgs {
  validateStringArray(argv, "CLI argv must be an array of strings");
  const values = new Map<string, string>();
  let skipLive = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (arg === "--skip-live") {
      if (skipLive) throw new Error("Duplicate argument: --skip-live");
      skipLive = true;
      continue;
    }
    if (isHealthValueFlag(arg)) {
      setOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }
    const equals = arg.match(/^(--manifest|--status|--output|--agent-account-safety|--format|--max-release-age-days)=(.*)$/u);
    if (equals !== null) {
      setOption(values, equals[1]!, equals[2]!);
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }

  return {
    manifestPath: values.get("--manifest") ?? DEFAULT_MANIFEST_PATH,
    statusPath: values.get("--status") ?? DEFAULT_STATUS_PATH,
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
    ...(values.has("--agent-account-safety") ? { agentAccountSafetyPath: values.get("--agent-account-safety")! } : {}),
    format: readFormat(values.get("--format") ?? "json"),
    ...(values.has("--max-release-age-days")
      ? { maxReleaseAgeDays: readPositiveNumber(values.get("--max-release-age-days")!, "--max-release-age-days") }
      : {}),
    skipLive,
  };
}

export function formatLaunchHealthCliOutput(report: BaseSepoliaHealthReport, format: LaunchHealthCliFormat): string {
  validateHealthReport(report);
  validateFormat(format);
  return format === "summary" ? formatBaseSepoliaHealthSummary(report) : JSON.stringify(report, null, 2);
}

export function isLaunchHealthDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateStringArray(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function isHealthValueFlag(arg: string): boolean {
  return arg === "--manifest" || arg === "--status" || arg === "--output" || arg === "--agent-account-safety" ||
    arg === "--format" || arg === "--max-release-age-days";
}

async function readOperatorAccountState(
  manifest: DeploymentManifest,
  client: LaunchHealthPublicClient,
): Promise<OperatorAccountState> {
  const [ownerBalanceWei, agentBalanceWei, ownerPendingNonce] = await Promise.all([
    client.getBalance({ address: manifest.owner }),
    client.getBalance({ address: manifest.contracts.agentAccount }),
    client.getTransactionCount({ address: manifest.owner, blockTag: "pending" }),
  ]);

  return {
    owner: manifest.owner,
    ownerBalanceWei: ownerBalanceWei.toString(),
    ownerPendingNonce,
    agentAccount: manifest.contracts.agentAccount,
    agentBalanceWei: agentBalanceWei.toString(),
  };
}

function setOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function readFormat(value: string): LaunchHealthCliFormat {
  validateFormat(value, "--format must be json or summary");
  return value;
}

function validateFormat(value: unknown, message = "Launch health output format must be json or summary"): asserts value is LaunchHealthCliFormat {
  if (value !== "json" && value !== "summary") throw new Error(message);
}

function readPositiveNumber(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${field} must be a positive number`);
  return parsed;
}

function validateLaunchHealthOptions(options: unknown): asserts options is LaunchHealthCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Launch health options must be an object");
  }
}

function validateEnv(env: unknown): asserts env is Record<string, string | undefined> {
  if (typeof env !== "object" || env === null || Array.isArray(env)) throw new Error("Environment must be an object");
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
