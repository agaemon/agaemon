import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatFundingDemoReviewIndexVerificationSummary,
  renderFundingDemoReviewIndexHtml,
  validateFundingDemoReviewIndexVerification,
  verifyFundingDemoReviewIndex,
} from "../../operator/fundingDemoReviewIndex.js";

import type { OperatorDashboardSnapshot } from "../../operator/dashboard.js";
import type { FundingDemoEvidenceManifest } from "../../operator/fundingDemoEvidenceManifest.js";
import type {
  FundingReadyOperatorDemoReport,
  FundingReadyOperatorDemoVerification,
} from "../../operator/fundingReadyDemo.js";
import type {
  FundingDemoReviewIndexParams,
  FundingDemoReviewIndexVerification,
  VerifyFundingDemoReviewIndexParams,
} from "../../operator/fundingDemoReviewIndex.js";

const DEFAULT_REVIEW_INDEX_PATH = "artifacts/funding-demo/index.html";
const DEFAULT_EVIDENCE_MANIFEST_PATH = "artifacts/funding-demo/evidence-manifest.json";
const DEFAULT_FUNDING_PROOF_PATH = "artifacts/funding-demo/funding-ready-demo.json";
const DEFAULT_FUNDING_PROOF_VERIFICATION_PATH = "artifacts/funding-demo/funding-ready-demo-verification.json";
const DEFAULT_DASHBOARD_PATH = "artifacts/funding-demo/operator-dashboard.json";

export type FundingDemoReviewIndexVerifyCliFormat = "json" | "summary";

export interface FundingDemoReviewIndexVerifyCliArgs {
  reviewIndexPath: string;
  evidenceManifestPath: string;
  fundingProofPath: string;
  fundingProofVerificationPath: string;
  dashboardPath: string;
  outputPath?: string | undefined;
  format: FundingDemoReviewIndexVerifyCliFormat;
}

export interface FundingDemoReviewIndexVerifyCliOptions {
  argv?: readonly string[] | undefined;
  env?: Record<string, string | undefined> | undefined;
  writeOutput?: (output: string) => void;
  readText?: (path: string) => Promise<string>;
  writeText?: (path: string, contents: string) => Promise<void>;
  mkdirp?: (path: string) => Promise<void>;
  renderHtml?: (params: FundingDemoReviewIndexParams) => string;
  verifyReviewIndex?: (params: VerifyFundingDemoReviewIndexParams) => FundingDemoReviewIndexVerification;
  setExitCode?: (code: number) => void;
}

if (isFundingDemoReviewIndexVerifyDirectRun(import.meta.url, process.argv)) {
  await runFundingDemoReviewIndexVerifyCli();
}

export async function runFundingDemoReviewIndexVerifyCli(
  options: FundingDemoReviewIndexVerifyCliOptions = {},
): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const writeText = options.writeText ?? writeFile;
  const mkdirp = options.mkdirp ?? ((path: string) => mkdir(path, { recursive: true }));
  const renderHtml = options.renderHtml ?? renderFundingDemoReviewIndexHtml;
  const verifyReviewIndex = options.verifyReviewIndex ?? verifyFundingDemoReviewIndex;
  const setExitCode = options.setExitCode ?? ((code: number) => { process.exitCode = code; });

  validateStringArray(argv, "CLI argv must be an array of strings");
  validateOutputWriter(writeOutput);
  const args = parseFundingDemoReviewIndexVerifyCliArgs(argv);
  const [savedHtml, manifestJson, proofJson, proofVerificationJson, dashboardJson] = await Promise.all([
    readText(args.reviewIndexPath),
    readText(args.evidenceManifestPath),
    readText(args.fundingProofPath),
    readText(args.fundingProofVerificationPath),
    readText(args.dashboardPath),
  ]);
  const params = {
    manifest: JSON.parse(manifestJson) as FundingDemoEvidenceManifest,
    fundingProof: JSON.parse(proofJson) as FundingReadyOperatorDemoReport,
    fundingProofVerification: JSON.parse(proofVerificationJson) as FundingReadyOperatorDemoVerification,
    dashboard: JSON.parse(dashboardJson) as OperatorDashboardSnapshot,
  };
  const expectedHtml = renderHtml(params);
  const verification = verifyReviewIndex({ savedHtml, expectedHtml });
  validateFundingDemoReviewIndexVerification(verification);

  if (args.outputPath !== undefined) {
    await mkdirp(dirname(args.outputPath));
    await writeText(args.outputPath, `${JSON.stringify(verification, null, 2)}\n`);
  }

  writeOutput(formatFundingDemoReviewIndexVerifyCliOutput(verification, args.format));
  if (!verification.passed) setExitCode(1);
}

export function parseFundingDemoReviewIndexVerifyCliArgs(
  argv: readonly string[],
): FundingDemoReviewIndexVerifyCliArgs {
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
      /^(--review-index|--evidence-manifest|--funding-proof|--funding-proof-verification|--dashboard|--output|--format)=(.*)$/u,
    );
    if (equals !== null) {
      setOption(values, equals[1]!, equals[2]!);
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }

  return {
    reviewIndexPath: values.get("--review-index") ?? DEFAULT_REVIEW_INDEX_PATH,
    evidenceManifestPath: values.get("--evidence-manifest") ?? DEFAULT_EVIDENCE_MANIFEST_PATH,
    fundingProofPath: values.get("--funding-proof") ?? DEFAULT_FUNDING_PROOF_PATH,
    fundingProofVerificationPath: values.get("--funding-proof-verification") ??
      DEFAULT_FUNDING_PROOF_VERIFICATION_PATH,
    dashboardPath: values.get("--dashboard") ?? DEFAULT_DASHBOARD_PATH,
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
    format: readFormat(values.get("--format") ?? "json"),
  };
}

export function formatFundingDemoReviewIndexVerifyCliOutput(
  verification: FundingDemoReviewIndexVerification,
  format: FundingDemoReviewIndexVerifyCliFormat,
): string {
  validateFormat(format);
  validateFundingDemoReviewIndexVerification(verification);
  return format === "summary"
    ? formatFundingDemoReviewIndexVerificationSummary(verification)
    : JSON.stringify(verification, null, 2);
}

export function isFundingDemoReviewIndexVerifyDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateStringArray(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function isValueFlag(arg: string): boolean {
  return arg === "--review-index" || arg === "--evidence-manifest" ||
    arg === "--funding-proof" || arg === "--funding-proof-verification" ||
    arg === "--dashboard" || arg === "--output" || arg === "--format";
}

function setOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function readFormat(value: string): FundingDemoReviewIndexVerifyCliFormat {
  validateFormat(value, "--format must be json or summary");
  return value;
}

function validateFormat(
  value: unknown,
  message = "Funding demo review index verification output format must be json or summary",
): asserts value is FundingDemoReviewIndexVerifyCliFormat {
  if (value !== "json" && value !== "summary") throw new Error(message);
}

function validateOptions(options: unknown): asserts options is FundingDemoReviewIndexVerifyCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Funding demo review index verification options must be an object");
  }
}

function validateStringArray(value: unknown, message: string): asserts value is readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) throw new Error(message);
}

function validateOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}
