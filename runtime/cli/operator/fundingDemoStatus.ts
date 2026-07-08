import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createFundingDemoStatus,
  formatFundingDemoStatusSummary,
  validateFundingDemoStatus,
} from "../../operator/fundingDemoStatus.js";

import type { FundingDemoEvidenceManifestVerification } from "../../operator/fundingDemoEvidenceManifest.js";
import type { FundingDemoReviewIndexVerification } from "../../operator/fundingDemoReviewIndex.js";
import type {
  CreateFundingDemoStatusParams,
  FundingDemoStatus,
} from "../../operator/fundingDemoStatus.js";
import type {
  FundingReadyOperatorDemoReport,
  FundingReadyOperatorDemoVerification,
} from "../../operator/fundingReadyDemo.js";

const DEFAULT_FUNDING_PROOF_PATH = "artifacts/funding-demo/funding-ready-demo.json";
const DEFAULT_FUNDING_PROOF_VERIFICATION_PATH = "artifacts/funding-demo/funding-ready-demo-verification.json";
const DEFAULT_REVIEW_INDEX_VERIFICATION_PATH = "artifacts/funding-demo/index-verification.json";
const DEFAULT_EVIDENCE_MANIFEST_VERIFICATION_PATH = "artifacts/funding-demo/evidence-manifest-verification.json";

export type FundingDemoStatusCliFormat = "json" | "summary";

export interface FundingDemoStatusCliArgs {
  fundingProofPath: string;
  fundingProofVerificationPath: string;
  reviewIndexVerificationPath: string;
  evidenceManifestVerificationPath: string;
  outputPath?: string | undefined;
  format: FundingDemoStatusCliFormat;
}

export interface FundingDemoStatusCliOptions {
  argv?: readonly string[] | undefined;
  env?: Record<string, string | undefined> | undefined;
  writeOutput?: (output: string) => void;
  readText?: (path: string) => Promise<string>;
  writeText?: (path: string, contents: string) => Promise<void>;
  mkdirp?: (path: string) => Promise<void>;
  createStatus?: (params: CreateFundingDemoStatusParams) => FundingDemoStatus;
  setExitCode?: (code: number) => void;
}

if (isFundingDemoStatusDirectRun(import.meta.url, process.argv)) await runFundingDemoStatusCli();

export async function runFundingDemoStatusCli(options: FundingDemoStatusCliOptions = {}): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const writeText = options.writeText ?? writeFile;
  const mkdirp = options.mkdirp ?? ((path: string) => mkdir(path, { recursive: true }));
  const createStatus = options.createStatus ?? createFundingDemoStatus;
  const setExitCode = options.setExitCode ?? ((code: number) => { process.exitCode = code; });

  validateStringArray(argv, "CLI argv must be an array of strings");
  validateOutputWriter(writeOutput);
  validateTextReader(readText);
  validateTextWriter(writeText);
  validateDirectoryCreator(mkdirp);
  validateStatusCreator(createStatus);

  const args = parseFundingDemoStatusCliArgs(argv);
  const [
    fundingProofJson,
    fundingProofVerificationJson,
    reviewIndexVerificationJson,
    evidenceManifestVerificationJson,
  ] = await Promise.all([
    readText(args.fundingProofPath),
    readText(args.fundingProofVerificationPath),
    readText(args.reviewIndexVerificationPath),
    readText(args.evidenceManifestVerificationPath),
  ]);
  const status = createStatus({
    fundingProof: JSON.parse(fundingProofJson) as FundingReadyOperatorDemoReport,
    fundingProofVerification: JSON.parse(fundingProofVerificationJson) as FundingReadyOperatorDemoVerification,
    reviewIndexVerification: JSON.parse(reviewIndexVerificationJson) as FundingDemoReviewIndexVerification,
    evidenceManifestVerification: JSON.parse(
      evidenceManifestVerificationJson,
    ) as FundingDemoEvidenceManifestVerification,
    sources: {
      "funding-proof": { path: args.fundingProofPath },
      "funding-proof-verification": { path: args.fundingProofVerificationPath },
      "review-index-verification": { path: args.reviewIndexVerificationPath },
      "evidence-manifest-verification": { path: args.evidenceManifestVerificationPath },
    },
  });
  validateFundingDemoStatus(status);

  if (args.outputPath !== undefined) {
    await mkdirp(dirname(args.outputPath));
    await writeText(args.outputPath, `${JSON.stringify(status, null, 2)}\n`);
  }

  writeOutput(formatFundingDemoStatusCliOutput(status, args.format));
  if (!status.passed) setExitCode(1);
}

export function parseFundingDemoStatusCliArgs(argv: readonly string[]): FundingDemoStatusCliArgs {
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
      /^(--funding-proof|--funding-proof-verification|--review-index-verification|--evidence-manifest-verification|--output|--format)=(.*)$/u,
    );
    if (equals !== null) {
      setOption(values, equals[1]!, equals[2]!);
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }

  return {
    fundingProofPath: values.get("--funding-proof") ?? DEFAULT_FUNDING_PROOF_PATH,
    fundingProofVerificationPath: values.get("--funding-proof-verification") ??
      DEFAULT_FUNDING_PROOF_VERIFICATION_PATH,
    reviewIndexVerificationPath: values.get("--review-index-verification") ??
      DEFAULT_REVIEW_INDEX_VERIFICATION_PATH,
    evidenceManifestVerificationPath: values.get("--evidence-manifest-verification") ??
      DEFAULT_EVIDENCE_MANIFEST_VERIFICATION_PATH,
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
    format: readFormat(values.get("--format") ?? "json"),
  };
}

export function formatFundingDemoStatusCliOutput(
  status: FundingDemoStatus,
  format: FundingDemoStatusCliFormat,
): string {
  validateFormat(format);
  validateFundingDemoStatus(status);
  return format === "summary" ? formatFundingDemoStatusSummary(status) : JSON.stringify(status, null, 2);
}

export function isFundingDemoStatusDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateStringArray(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function isValueFlag(arg: string): boolean {
  return arg === "--funding-proof" || arg === "--funding-proof-verification" ||
    arg === "--review-index-verification" || arg === "--evidence-manifest-verification" ||
    arg === "--output" || arg === "--format";
}

function setOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function readFormat(value: string): FundingDemoStatusCliFormat {
  validateFormat(value, "--format must be json or summary");
  return value;
}

function validateFormat(
  value: unknown,
  message = "Funding demo status output format must be json or summary",
): asserts value is FundingDemoStatusCliFormat {
  if (value !== "json" && value !== "summary") throw new Error(message);
}

function validateOptions(options: unknown): asserts options is FundingDemoStatusCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Funding demo status options must be an object");
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

function validateStatusCreator(
  createStatus: unknown,
): asserts createStatus is (params: CreateFundingDemoStatusParams) => FundingDemoStatus {
  if (typeof createStatus !== "function") throw new Error("Funding demo status creator must be a function");
}
