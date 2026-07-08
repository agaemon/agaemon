import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createFundingDemoEvidenceManifest,
  formatFundingDemoEvidenceManifestSummary,
} from "../../operator/fundingDemoEvidenceManifest.js";

import type {
  CreateFundingDemoEvidenceManifestParams,
  FundingDemoEvidenceManifest,
} from "../../operator/fundingDemoEvidenceManifest.js";

const DEFAULT_ARTIFACT_ROOT = "artifacts/funding-demo";
const DEFAULT_DEPLOYMENT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";
const DEFAULT_RELEASE_STATUS_PATH = "docs/releases/latest.json";

export type FundingDemoEvidenceManifestCliFormat = "json" | "summary";

export interface FundingDemoEvidenceManifestCliArgs {
  artifactRoot: string;
  deploymentManifestPath: string;
  releaseStatusPath: string;
  outputPath?: string | undefined;
  format: FundingDemoEvidenceManifestCliFormat;
}

export interface FundingDemoEvidenceManifestCliOptions {
  argv?: readonly string[] | undefined;
  env?: Record<string, string | undefined> | undefined;
  writeOutput?: (output: string) => void;
  writeText?: (path: string, contents: string) => Promise<void>;
  mkdirp?: (path: string) => Promise<void>;
  createManifest?: (params: CreateFundingDemoEvidenceManifestParams) => FundingDemoEvidenceManifest;
}

if (isFundingDemoEvidenceManifestDirectRun(import.meta.url, process.argv)) {
  await runFundingDemoEvidenceManifestCli();
}

export async function runFundingDemoEvidenceManifestCli(
  options: FundingDemoEvidenceManifestCliOptions = {},
): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const writeText = options.writeText ?? writeFile;
  const mkdirp = options.mkdirp ?? ((path: string) => mkdir(path, { recursive: true }));
  const createManifest = options.createManifest ?? createFundingDemoEvidenceManifest;

  validateStringArray(argv, "CLI argv must be an array of strings");
  validateOutputWriter(writeOutput);
  validateTextWriter(writeText);
  validateDirectoryCreator(mkdirp);
  validateManifestCreator(createManifest);

  const args = parseFundingDemoEvidenceManifestCliArgs(argv);
  const manifest = createManifest({
    artifactRoot: args.artifactRoot,
    deploymentManifestPath: args.deploymentManifestPath,
    releaseStatusPath: args.releaseStatusPath,
  });

  if (args.outputPath !== undefined) {
    await mkdirp(dirname(args.outputPath));
    await writeText(args.outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  writeOutput(formatFundingDemoEvidenceManifestCliOutput(manifest, args.format));
}

export function parseFundingDemoEvidenceManifestCliArgs(
  argv: readonly string[],
): FundingDemoEvidenceManifestCliArgs {
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
    const equals = arg.match(/^(--artifact-root|--manifest|--release-status|--output|--format)=(.*)$/u);
    if (equals !== null) {
      setOption(values, equals[1]!, equals[2]!);
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }

  return {
    artifactRoot: values.get("--artifact-root") ?? DEFAULT_ARTIFACT_ROOT,
    deploymentManifestPath: values.get("--manifest") ?? DEFAULT_DEPLOYMENT_MANIFEST_PATH,
    releaseStatusPath: values.get("--release-status") ?? DEFAULT_RELEASE_STATUS_PATH,
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
    format: readFormat(values.get("--format") ?? "json"),
  };
}

export function formatFundingDemoEvidenceManifestCliOutput(
  manifest: FundingDemoEvidenceManifest,
  format: FundingDemoEvidenceManifestCliFormat,
): string {
  validateFormat(format);
  return format === "summary" ? formatFundingDemoEvidenceManifestSummary(manifest) : JSON.stringify(manifest, null, 2);
}

export function isFundingDemoEvidenceManifestDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateStringArray(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function isValueFlag(arg: string): boolean {
  return arg === "--artifact-root" || arg === "--manifest" || arg === "--release-status" ||
    arg === "--output" || arg === "--format";
}

function setOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function readFormat(value: string): FundingDemoEvidenceManifestCliFormat {
  validateFormat(value, "--format must be json or summary");
  return value;
}

function validateFormat(
  value: unknown,
  message = "Funding demo evidence manifest output format must be json or summary",
): asserts value is FundingDemoEvidenceManifestCliFormat {
  if (value !== "json" && value !== "summary") throw new Error(message);
}

function validateOptions(options: unknown): asserts options is FundingDemoEvidenceManifestCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Funding demo evidence manifest options must be an object");
  }
}

function validateStringArray(value: unknown, message: string): asserts value is readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) throw new Error(message);
}

function validateOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateTextWriter(writeText: unknown): asserts writeText is (path: string, contents: string) => Promise<void> {
  if (typeof writeText !== "function") throw new Error("Text writer must be a function");
}

function validateDirectoryCreator(mkdirp: unknown): asserts mkdirp is (path: string) => Promise<void> {
  if (typeof mkdirp !== "function") throw new Error("Directory creator must be a function");
}

function validateManifestCreator(
  createManifest: unknown,
): asserts createManifest is (params: CreateFundingDemoEvidenceManifestParams) => FundingDemoEvidenceManifest {
  if (typeof createManifest !== "function") throw new Error("Funding demo evidence manifest creator must be a function");
}
