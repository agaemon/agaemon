import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createFundingDemoStatus,
  formatFundingDemoStatusVerificationSummary,
  validateFundingDemoStatusVerification,
  verifyFundingDemoStatus,
} from "../../operator/fundingDemoStatus.js";

import type { FundingDemoEvidenceManifestVerification } from "../../operator/fundingDemoEvidenceManifest.js";
import type { FundingDemoReviewIndexVerification } from "../../operator/fundingDemoReviewIndex.js";
import type {
  CreateFundingDemoStatusParams,
  FundingDemoStatus,
  FundingDemoStatusVerification,
  VerifyFundingDemoStatusParams,
} from "../../operator/fundingDemoStatus.js";
import type {
  FundingReadyOperatorDemoReport,
  FundingReadyOperatorDemoVerification,
} from "../../operator/fundingReadyDemo.js";

const DEFAULT_STATUS_PATH = "artifacts/funding-demo/status.json";
const DEFAULT_FUNDING_PROOF_PATH = "artifacts/funding-demo/funding-ready-demo.json";
const DEFAULT_FUNDING_PROOF_VERIFICATION_PATH = "artifacts/funding-demo/funding-ready-demo-verification.json";
const DEFAULT_REVIEW_INDEX_VERIFICATION_PATH = "artifacts/funding-demo/index-verification.json";
const DEFAULT_EVIDENCE_MANIFEST_VERIFICATION_PATH = "artifacts/funding-demo/evidence-manifest-verification.json";

export type FundingDemoStatusVerifyCliFormat = "json" | "summary";

export interface FundingDemoStatusVerifyCliArgs {
  statusPath: string;
  fundingProofPath: string;
  fundingProofVerificationPath: string;
  reviewIndexVerificationPath: string;
  evidenceManifestVerificationPath: string;
  outputPath?: string | undefined;
  format: FundingDemoStatusVerifyCliFormat;
}

export interface FundingDemoStatusVerifyCliOptions {
  argv?: readonly string[] | undefined;
  env?: Record<string, string | undefined> | undefined;
  writeOutput?: (output: string) => void;
  readText?: (path: string) => Promise<string>;
  writeText?: (path: string, contents: string) => Promise<void>;
  mkdirp?: (path: string) => Promise<void>;
  createStatus?: (params: CreateFundingDemoStatusParams) => FundingDemoStatus;
  verifyStatus?: (params: VerifyFundingDemoStatusParams) => FundingDemoStatusVerification;
  setExitCode?: (code: number) => void;
}

if (isFundingDemoStatusVerifyDirectRun(import.meta.url, process.argv)) await runFundingDemoStatusVerifyCli();

export async function runFundingDemoStatusVerifyCli(
  options: FundingDemoStatusVerifyCliOptions = {},
): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const writeText = options.writeText ?? writeFile;
  const mkdirp = options.mkdirp ?? ((path: string) => mkdir(path, { recursive: true }));
  const createStatus = options.createStatus ?? createFundingDemoStatus;
  const verifyStatus = options.verifyStatus ?? verifyFundingDemoStatus;
  const setExitCode = options.setExitCode ?? ((code: number) => { process.exitCode = code; });

  validateStringArray(argv, "CLI argv must be an array of strings");
  validateOutputWriter(writeOutput);
  validateTextReader(readText);
  validateTextWriter(writeText);
  validateDirectoryCreator(mkdirp);
  validateStatusCreator(createStatus);
  validateStatusVerifier(verifyStatus);

  const args = parseFundingDemoStatusVerifyCliArgs(argv);
  const [
    savedStatusJson,
    fundingProofJson,
    fundingProofVerificationJson,
    reviewIndexVerificationJson,
    evidenceManifestVerificationJson,
  ] = await Promise.all([
    readText(args.statusPath),
    readText(args.fundingProofPath),
    readText(args.fundingProofVerificationPath),
    readText(args.reviewIndexVerificationPath),
    readText(args.evidenceManifestVerificationPath),
  ]);
  const expected = createStatus({
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
  const verification = verifyStatus({
    saved: JSON.parse(savedStatusJson) as FundingDemoStatus,
    expected,
  });
  validateFundingDemoStatusVerification(verification);

  if (args.outputPath !== undefined) {
    await mkdirp(dirname(args.outputPath));
    await writeText(args.outputPath, `${JSON.stringify(verification, null, 2)}\n`);
  }

  writeOutput(formatFundingDemoStatusVerifyCliOutput(verification, args.format));
  if (!verification.passed) setExitCode(1);
}

export function parseFundingDemoStatusVerifyCliArgs(argv: readonly string[]): FundingDemoStatusVerifyCliArgs {
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
      /^(--status|--funding-proof|--funding-proof-verification|--review-index-verification|--evidence-manifest-verification|--output|--format)=(.*)$/u,
    );
    if (equals !== null) {
      setOption(values, equals[1]!, equals[2]!);
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }

  return {
    statusPath: values.get("--status") ?? DEFAULT_STATUS_PATH,
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

export function formatFundingDemoStatusVerifyCliOutput(
  verification: FundingDemoStatusVerification,
  format: FundingDemoStatusVerifyCliFormat,
): string {
  validateFormat(format);
  validateFundingDemoStatusVerification(verification);
  return format === "summary"
    ? formatFundingDemoStatusVerificationSummary(verification)
    : JSON.stringify(verification, null, 2);
}

export function isFundingDemoStatusVerifyDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateStringArray(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function isValueFlag(arg: string): boolean {
  return arg === "--status" || arg === "--funding-proof" || arg === "--funding-proof-verification" ||
    arg === "--review-index-verification" || arg === "--evidence-manifest-verification" ||
    arg === "--output" || arg === "--format";
}

function setOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function readFormat(value: string): FundingDemoStatusVerifyCliFormat {
  validateFormat(value, "--format must be json or summary");
  return value;
}

function validateFormat(
  value: unknown,
  message = "Funding demo status verification output format must be json or summary",
): asserts value is FundingDemoStatusVerifyCliFormat {
  if (value !== "json" && value !== "summary") throw new Error(message);
}

function validateOptions(options: unknown): asserts options is FundingDemoStatusVerifyCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Funding demo status verification options must be an object");
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

function validateStatusVerifier(
  verifyStatus: unknown,
): asserts verifyStatus is (params: VerifyFundingDemoStatusParams) => FundingDemoStatusVerification {
  if (typeof verifyStatus !== "function") throw new Error("Funding demo status verifier must be a function");
}
