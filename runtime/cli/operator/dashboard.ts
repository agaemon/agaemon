import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readDeploymentManifest } from "../../base/deploymentManifest.js";
import {
  createOperatorDashboardSnapshot,
  formatOperatorDashboardSnapshotSummary,
  validateOperatorDashboardSnapshot,
} from "../../operator/dashboard.js";

import type { DeploymentManifest } from "../../base/deploymentManifest.js";
import type {
  CreateOperatorDashboardSnapshotParams,
  OperatorDashboardSnapshot,
} from "../../operator/dashboard.js";

const DEFAULT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";
const DEFAULT_LAUNCH_GATE_PATH = "artifacts/base-sepolia-launch-gate.json";
const DEFAULT_HEALTH_PATH = "artifacts/base-sepolia-health.json";
const DEFAULT_RELEASE_STATUS_PATH = "docs/releases/latest.json";

export type OperatorDashboardCliFormat = "json" | "summary";

export interface OperatorDashboardCliArgs {
  manifestPath: string;
  launchGatePath: string;
  healthPath: string;
  releaseStatusPath: string;
  eventIndexPath?: string | undefined;
  eventIndexVerificationPath?: string | undefined;
  economicPayoutSummaryPath?: string | undefined;
  economicPayoutSummaryVerificationPath?: string | undefined;
  memoryStorageBindingPath?: string | undefined;
  memoryStorageBindingVerificationPath?: string | undefined;
  memoryStorageMigrationVerificationPath?: string | undefined;
  outputPath?: string | undefined;
  format: OperatorDashboardCliFormat;
}

export interface OperatorDashboardCliOptions {
  argv?: readonly string[] | undefined;
  env?: Record<string, string | undefined> | undefined;
  writeOutput?: (output: string) => void;
  readText?: (path: string) => Promise<string>;
  readManifest?: (path: string) => Promise<DeploymentManifest>;
  writeText?: (path: string, contents: string) => Promise<void>;
  mkdirp?: (path: string) => Promise<void>;
  createSnapshot?: (params: CreateOperatorDashboardSnapshotParams) => OperatorDashboardSnapshot;
}

if (isOperatorDashboardDirectRun(import.meta.url, process.argv)) await runOperatorDashboardCli();

export async function runOperatorDashboardCli(options: OperatorDashboardCliOptions = {}): Promise<void> {
  validateOperatorDashboardOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const readManifest = options.readManifest ?? readDeploymentManifest;
  const writeText = options.writeText ?? writeFile;
  const mkdirp = options.mkdirp ?? ((path: string) => mkdir(path, { recursive: true }));
  const createSnapshot = options.createSnapshot ?? createOperatorDashboardSnapshot;

  validateStringArray(argv, "CLI argv must be an array of strings");
  validateOutputWriter(writeOutput);
  const args = parseOperatorDashboardCliArgs(argv);
  const [
    manifest,
    launchGateJson,
    healthJson,
    releaseStatusJson,
    eventIndexJson,
    eventIndexVerificationJson,
    economicPayoutSummaryJson,
    economicPayoutSummaryVerificationJson,
    memoryStorageBindingJson,
    memoryStorageBindingVerificationJson,
    memoryStorageMigrationVerificationJson,
  ] =
    await Promise.all([
      readManifest(args.manifestPath),
      readText(args.launchGatePath),
      readText(args.healthPath),
      readText(args.releaseStatusPath),
      args.eventIndexPath === undefined ? Promise.resolve(undefined) : readText(args.eventIndexPath),
      args.eventIndexVerificationPath === undefined
        ? Promise.resolve(undefined)
        : readText(args.eventIndexVerificationPath),
      args.economicPayoutSummaryPath === undefined
        ? Promise.resolve(undefined)
        : readText(args.economicPayoutSummaryPath),
      args.economicPayoutSummaryVerificationPath === undefined
        ? Promise.resolve(undefined)
        : readText(args.economicPayoutSummaryVerificationPath),
      args.memoryStorageBindingPath === undefined
        ? Promise.resolve(undefined)
        : readText(args.memoryStorageBindingPath),
      args.memoryStorageBindingVerificationPath === undefined
        ? Promise.resolve(undefined)
        : readText(args.memoryStorageBindingVerificationPath),
      args.memoryStorageMigrationVerificationPath === undefined
        ? Promise.resolve(undefined)
        : readText(args.memoryStorageMigrationVerificationPath),
    ]);

  const snapshot = createSnapshot({
    manifestPath: args.manifestPath,
    manifest,
    launchGatePath: args.launchGatePath,
    launchGate: JSON.parse(launchGateJson) as CreateOperatorDashboardSnapshotParams["launchGate"],
    healthPath: args.healthPath,
    health: JSON.parse(healthJson) as CreateOperatorDashboardSnapshotParams["health"],
    releaseStatusPath: args.releaseStatusPath,
    releaseStatusJson,
    ...(args.eventIndexPath === undefined || eventIndexJson === undefined
      ? {}
      : { eventIndexPath: args.eventIndexPath, eventIndex: JSON.parse(eventIndexJson) }),
    ...(args.eventIndexVerificationPath === undefined || eventIndexVerificationJson === undefined
      ? {}
      : {
          eventIndexVerificationPath: args.eventIndexVerificationPath,
          eventIndexVerification: JSON.parse(eventIndexVerificationJson),
        }),
    ...(args.economicPayoutSummaryPath === undefined || economicPayoutSummaryJson === undefined
      ? {}
      : {
          economicPayoutSummaryPath: args.economicPayoutSummaryPath,
          economicPayoutSummary: JSON.parse(economicPayoutSummaryJson),
        }),
    ...(args.economicPayoutSummaryVerificationPath === undefined || economicPayoutSummaryVerificationJson === undefined
      ? {}
      : {
          economicPayoutSummaryVerificationPath: args.economicPayoutSummaryVerificationPath,
          economicPayoutSummaryVerification: JSON.parse(economicPayoutSummaryVerificationJson),
        }),
    ...(args.memoryStorageBindingPath === undefined || memoryStorageBindingJson === undefined
      ? {}
      : {
          memoryStorageBindingPath: args.memoryStorageBindingPath,
          memoryStorageBinding: JSON.parse(memoryStorageBindingJson),
        }),
    ...(args.memoryStorageBindingVerificationPath === undefined || memoryStorageBindingVerificationJson === undefined
      ? {}
      : {
          memoryStorageBindingVerificationPath: args.memoryStorageBindingVerificationPath,
          memoryStorageBindingVerification: JSON.parse(memoryStorageBindingVerificationJson),
        }),
    ...(args.memoryStorageMigrationVerificationPath === undefined || memoryStorageMigrationVerificationJson === undefined
      ? {}
      : {
          memoryStorageMigrationVerificationPath: args.memoryStorageMigrationVerificationPath,
          memoryStorageMigrationVerification: JSON.parse(memoryStorageMigrationVerificationJson),
        }),
  });
  validateOperatorDashboardSnapshot(snapshot);

  if (args.outputPath !== undefined) {
    await mkdirp(dirname(args.outputPath));
    await writeText(args.outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  }

  writeOutput(formatOperatorDashboardCliOutput(snapshot, args.format));
}

export function parseOperatorDashboardCliArgs(argv: readonly string[]): OperatorDashboardCliArgs {
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
      /^(--manifest|--launch-gate|--health|--release-status|--event-index|--event-index-verification|--economic-payout-summary|--economic-payout-summary-verification|--memory-storage-binding|--memory-storage-binding-verification|--memory-storage-migration-verification|--output|--format)=(.*)$/u,
    );
    if (equals !== null) {
      setOption(values, equals[1]!, equals[2]!);
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }

  if (values.has("--event-index") !== values.has("--event-index-verification")) {
    throw new Error("--event-index and --event-index-verification must be provided together");
  }
  if (values.has("--economic-payout-summary-verification") && !values.has("--economic-payout-summary")) {
    throw new Error("--economic-payout-summary-verification requires --economic-payout-summary");
  }
  if (values.has("--memory-storage-binding") !== values.has("--memory-storage-binding-verification")) {
    throw new Error("--memory-storage-binding and --memory-storage-binding-verification must be provided together");
  }
  if (values.has("--memory-storage-migration-verification") && !values.has("--memory-storage-binding")) {
    throw new Error("--memory-storage-migration-verification requires --memory-storage-binding");
  }

  return {
    manifestPath: values.get("--manifest") ?? DEFAULT_MANIFEST_PATH,
    launchGatePath: values.get("--launch-gate") ?? DEFAULT_LAUNCH_GATE_PATH,
    healthPath: values.get("--health") ?? DEFAULT_HEALTH_PATH,
    releaseStatusPath: values.get("--release-status") ?? DEFAULT_RELEASE_STATUS_PATH,
    ...(values.has("--event-index") ? { eventIndexPath: values.get("--event-index")! } : {}),
    ...(values.has("--event-index-verification")
      ? { eventIndexVerificationPath: values.get("--event-index-verification")! }
      : {}),
    ...(values.has("--economic-payout-summary")
      ? { economicPayoutSummaryPath: values.get("--economic-payout-summary")! }
      : {}),
    ...(values.has("--economic-payout-summary-verification")
      ? { economicPayoutSummaryVerificationPath: values.get("--economic-payout-summary-verification")! }
      : {}),
    ...(values.has("--memory-storage-binding")
      ? { memoryStorageBindingPath: values.get("--memory-storage-binding")! }
      : {}),
    ...(values.has("--memory-storage-binding-verification")
      ? { memoryStorageBindingVerificationPath: values.get("--memory-storage-binding-verification")! }
      : {}),
    ...(values.has("--memory-storage-migration-verification")
      ? { memoryStorageMigrationVerificationPath: values.get("--memory-storage-migration-verification")! }
      : {}),
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
    format: readFormat(values.get("--format") ?? "json"),
  };
}

export function formatOperatorDashboardCliOutput(
  snapshot: OperatorDashboardSnapshot,
  format: OperatorDashboardCliFormat,
): string {
  validateFormat(format);
  validateOperatorDashboardSnapshot(snapshot);
  return format === "summary" ? formatOperatorDashboardSnapshotSummary(snapshot) : JSON.stringify(snapshot, null, 2);
}

export function isOperatorDashboardDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateStringArray(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function isValueFlag(arg: string): boolean {
  return arg === "--manifest" || arg === "--launch-gate" || arg === "--health" || arg === "--release-status" ||
    arg === "--event-index" || arg === "--event-index-verification" || arg === "--economic-payout-summary" ||
    arg === "--economic-payout-summary-verification" || arg === "--memory-storage-binding" ||
    arg === "--memory-storage-binding-verification" || arg === "--memory-storage-migration-verification" ||
    arg === "--output" || arg === "--format";
}

function setOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function readFormat(value: string): OperatorDashboardCliFormat {
  validateFormat(value, "--format must be json or summary");
  return value;
}

function validateFormat(value: unknown, message = "Operator dashboard output format must be json or summary"): asserts value is OperatorDashboardCliFormat {
  if (value !== "json" && value !== "summary") throw new Error(message);
}

function validateOperatorDashboardOptions(options: unknown): asserts options is OperatorDashboardCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Operator dashboard options must be an object");
  }
}

function validateStringArray(value: unknown, message: string): asserts value is readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) throw new Error(message);
}

function validateOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}
