import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createFundingDemoEvidenceManifest,
  formatFundingDemoEvidenceManifestVerificationSummary,
  validateFundingDemoEvidenceManifestVerification,
  verifyFundingDemoEvidenceManifest,
} from "../../operator/fundingDemoEvidenceManifest.js";

import type {
  CreateFundingDemoEvidenceManifestParams,
  FundingDemoEvidenceManifest,
  FundingDemoEvidenceManifestVerification,
  VerifyFundingDemoEvidenceManifestParams,
} from "../../operator/fundingDemoEvidenceManifest.js";

const DEFAULT_EVIDENCE_MANIFEST_PATH = "artifacts/funding-demo/evidence-manifest.json";
const DEFAULT_ARTIFACT_ROOT = "artifacts/funding-demo";
const DEFAULT_DEPLOYMENT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";
const DEFAULT_RELEASE_STATUS_PATH = "docs/releases/latest.json";

export type FundingDemoEvidenceManifestVerifyCliFormat = "json" | "summary";

export interface FundingDemoEvidenceManifestVerifyCliArgs {
  evidenceManifestPath: string;
  artifactRoot: string;
  deploymentManifestPath: string;
  releaseStatusPath: string;
  outputPath?: string | undefined;
  format: FundingDemoEvidenceManifestVerifyCliFormat;
}

export interface FundingDemoEvidenceManifestVerifyCliOptions {
  argv?: readonly string[] | undefined;
  env?: Record<string, string | undefined> | undefined;
  writeOutput?: (output: string) => void;
  readText?: (path: string) => Promise<string>;
  writeText?: (path: string, contents: string) => Promise<void>;
  mkdirp?: (path: string) => Promise<void>;
  pathExists?: (path: string) => Promise<boolean>;
  createManifest?: (params: CreateFundingDemoEvidenceManifestParams) => FundingDemoEvidenceManifest;
  verifyManifest?: (params: VerifyFundingDemoEvidenceManifestParams) => FundingDemoEvidenceManifestVerification;
  setExitCode?: (code: number) => void;
}

if (isFundingDemoEvidenceManifestVerifyDirectRun(import.meta.url, process.argv)) {
  await runFundingDemoEvidenceManifestVerifyCli();
}

export async function runFundingDemoEvidenceManifestVerifyCli(
  options: FundingDemoEvidenceManifestVerifyCliOptions = {},
): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const writeText = options.writeText ?? writeFile;
  const mkdirp = options.mkdirp ?? ((path: string) => mkdir(path, { recursive: true }));
  const pathExists = options.pathExists ?? defaultPathExists;
  const createManifest = options.createManifest ?? createFundingDemoEvidenceManifest;
  const verifyManifest = options.verifyManifest ?? verifyFundingDemoEvidenceManifest;
  const setExitCode = options.setExitCode ?? ((code: number) => { process.exitCode = code; });

  validateStringArray(argv, "CLI argv must be an array of strings");
  validateOutputWriter(writeOutput);
  validateTextReader(readText);
  validateTextWriter(writeText);
  validateDirectoryCreator(mkdirp);
  validatePathExists(pathExists);
  validateManifestCreator(createManifest);
  validateManifestVerifier(verifyManifest);

  const args = parseFundingDemoEvidenceManifestVerifyCliArgs(argv);
  const savedManifestJson = await readText(args.evidenceManifestPath);
  const expected = createManifest({
    artifactRoot: args.artifactRoot,
    deploymentManifestPath: args.deploymentManifestPath,
    releaseStatusPath: args.releaseStatusPath,
  });
  const missingEvidencePaths = await collectMissingEvidencePaths(expected, pathExists);
  const verification = verifyManifest({
    saved: JSON.parse(savedManifestJson) as FundingDemoEvidenceManifest,
    expected,
    missingEvidencePaths,
  });
  validateFundingDemoEvidenceManifestVerification(verification);

  if (args.outputPath !== undefined) {
    await mkdirp(dirname(args.outputPath));
    await writeText(args.outputPath, `${JSON.stringify(verification, null, 2)}\n`);
  }

  writeOutput(formatFundingDemoEvidenceManifestVerifyCliOutput(verification, args.format));
  if (!verification.passed) setExitCode(1);
}

export function parseFundingDemoEvidenceManifestVerifyCliArgs(
  argv: readonly string[],
): FundingDemoEvidenceManifestVerifyCliArgs {
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
      /^(--evidence-manifest|--artifact-root|--deployment-manifest|--release-status|--output|--format)=(.*)$/u,
    );
    if (equals !== null) {
      setOption(values, equals[1]!, equals[2]!);
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }

  return {
    evidenceManifestPath: values.get("--evidence-manifest") ?? DEFAULT_EVIDENCE_MANIFEST_PATH,
    artifactRoot: values.get("--artifact-root") ?? DEFAULT_ARTIFACT_ROOT,
    deploymentManifestPath: values.get("--deployment-manifest") ?? DEFAULT_DEPLOYMENT_MANIFEST_PATH,
    releaseStatusPath: values.get("--release-status") ?? DEFAULT_RELEASE_STATUS_PATH,
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
    format: readFormat(values.get("--format") ?? "json"),
  };
}

export function formatFundingDemoEvidenceManifestVerifyCliOutput(
  verification: FundingDemoEvidenceManifestVerification,
  format: FundingDemoEvidenceManifestVerifyCliFormat,
): string {
  validateFormat(format);
  validateFundingDemoEvidenceManifestVerification(verification);
  return format === "summary"
    ? formatFundingDemoEvidenceManifestVerificationSummary(verification)
    : JSON.stringify(verification, null, 2);
}

export function isFundingDemoEvidenceManifestVerifyDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateStringArray(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function isValueFlag(arg: string): boolean {
  return arg === "--evidence-manifest" || arg === "--artifact-root" ||
    arg === "--deployment-manifest" || arg === "--release-status" ||
    arg === "--output" || arg === "--format";
}

function setOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function readFormat(value: string): FundingDemoEvidenceManifestVerifyCliFormat {
  validateFormat(value, "--format must be json or summary");
  return value;
}

function validateFormat(
  value: unknown,
  message = "Funding demo evidence manifest verification output format must be json or summary",
): asserts value is FundingDemoEvidenceManifestVerifyCliFormat {
  if (value !== "json" && value !== "summary") throw new Error(message);
}

function validateOptions(options: unknown): asserts options is FundingDemoEvidenceManifestVerifyCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Funding demo evidence manifest verification options must be an object");
  }
}

function validateStringArray(value: unknown, message: string): asserts value is readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) throw new Error(message);
}

function validateOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateTextReader(readText: unknown): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") throw new Error("Text reader must be a function");
}

function validateTextWriter(writeText: unknown): asserts writeText is (path: string, contents: string) => Promise<void> {
  if (typeof writeText !== "function") throw new Error("Text writer must be a function");
}

function validateDirectoryCreator(mkdirp: unknown): asserts mkdirp is (path: string) => Promise<void> {
  if (typeof mkdirp !== "function") throw new Error("Directory creator must be a function");
}

function validatePathExists(pathExists: unknown): asserts pathExists is (path: string) => Promise<boolean> {
  if (typeof pathExists !== "function") throw new Error("Path-exists checker must be a function");
}

function validateManifestCreator(
  createManifest: unknown,
): asserts createManifest is (params: CreateFundingDemoEvidenceManifestParams) => FundingDemoEvidenceManifest {
  if (typeof createManifest !== "function") throw new Error("Funding demo evidence manifest creator must be a function");
}

function validateManifestVerifier(
  verifyManifest: unknown,
): asserts verifyManifest is (
  params: VerifyFundingDemoEvidenceManifestParams,
) => FundingDemoEvidenceManifestVerification {
  if (typeof verifyManifest !== "function") throw new Error("Funding demo evidence manifest verifier must be a function");
}

async function collectMissingEvidencePaths(
  manifest: FundingDemoEvidenceManifest,
  pathExists: (path: string) => Promise<boolean>,
): Promise<string[]> {
  const checks = await Promise.all(manifest.evidence.map(async (entry) => ({
    path: entry.path,
    exists: await pathExists(entry.path),
  })));

  return checks.filter((check) => !check.exists).map((check) => check.path);
}

async function defaultPathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
