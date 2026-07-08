import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatFundingDemoReviewIndexSummary,
  renderFundingDemoReviewIndexHtml,
} from "../../operator/fundingDemoReviewIndex.js";

import type { OperatorDashboardSnapshot } from "../../operator/dashboard.js";
import type { FundingDemoEvidenceManifest } from "../../operator/fundingDemoEvidenceManifest.js";
import type {
  FundingReadyOperatorDemoReport,
  FundingReadyOperatorDemoVerification,
} from "../../operator/fundingReadyDemo.js";
import type { FundingDemoReviewIndexParams } from "../../operator/fundingDemoReviewIndex.js";

const DEFAULT_EVIDENCE_MANIFEST_PATH = "artifacts/funding-demo/evidence-manifest.json";
const DEFAULT_FUNDING_PROOF_PATH = "artifacts/funding-demo/funding-ready-demo.json";
const DEFAULT_FUNDING_PROOF_VERIFICATION_PATH = "artifacts/funding-demo/funding-ready-demo-verification.json";
const DEFAULT_DASHBOARD_PATH = "artifacts/funding-demo/operator-dashboard.json";
const DEFAULT_OUTPUT_PATH = "artifacts/funding-demo/index.html";

export type FundingDemoReviewIndexCliFormat = "html" | "summary";

export interface FundingDemoReviewIndexCliArgs {
  evidenceManifestPath: string;
  fundingProofPath: string;
  fundingProofVerificationPath: string;
  dashboardPath: string;
  outputPath?: string | undefined;
  format: FundingDemoReviewIndexCliFormat;
}

export interface FundingDemoReviewIndexCliOptions {
  argv?: readonly string[] | undefined;
  env?: Record<string, string | undefined> | undefined;
  writeOutput?: (output: string) => void;
  readText?: (path: string) => Promise<string>;
  writeText?: (path: string, contents: string) => Promise<void>;
  mkdirp?: (path: string) => Promise<void>;
  renderHtml?: (params: FundingDemoReviewIndexParams) => string;
}

if (isFundingDemoReviewIndexDirectRun(import.meta.url, process.argv)) await runFundingDemoReviewIndexCli();

export async function runFundingDemoReviewIndexCli(
  options: FundingDemoReviewIndexCliOptions = {},
): Promise<void> {
  validateFundingDemoReviewIndexOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const writeText = options.writeText ?? writeFile;
  const mkdirp = options.mkdirp ?? ((path: string) => mkdir(path, { recursive: true }));
  const renderHtml = options.renderHtml ?? renderFundingDemoReviewIndexHtml;

  validateStringArray(argv, "CLI argv must be an array of strings");
  validateOutputWriter(writeOutput);
  const args = parseFundingDemoReviewIndexCliArgs(argv);
  const [manifestJson, proofJson, proofVerificationJson, dashboardJson] = await Promise.all([
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
  const html = renderHtml(params);
  const outputPath = args.outputPath ?? DEFAULT_OUTPUT_PATH;

  if (args.outputPath !== undefined) {
    await mkdirp(dirname(args.outputPath));
    await writeText(args.outputPath, html);
  }

  writeOutput(formatFundingDemoReviewIndexCliOutput(params, args.format, outputPath, html));
}

export function parseFundingDemoReviewIndexCliArgs(argv: readonly string[]): FundingDemoReviewIndexCliArgs {
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
      /^(--evidence-manifest|--funding-proof|--funding-proof-verification|--dashboard|--output|--format)=(.*)$/u,
    );
    if (equals !== null) {
      setOption(values, equals[1]!, equals[2]!);
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }

  return {
    evidenceManifestPath: values.get("--evidence-manifest") ?? DEFAULT_EVIDENCE_MANIFEST_PATH,
    fundingProofPath: values.get("--funding-proof") ?? DEFAULT_FUNDING_PROOF_PATH,
    fundingProofVerificationPath: values.get("--funding-proof-verification") ??
      DEFAULT_FUNDING_PROOF_VERIFICATION_PATH,
    dashboardPath: values.get("--dashboard") ?? DEFAULT_DASHBOARD_PATH,
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
    format: readFormat(values.get("--format") ?? "html"),
  };
}

export function formatFundingDemoReviewIndexCliOutput(
  params: FundingDemoReviewIndexParams,
  format: FundingDemoReviewIndexCliFormat,
  outputPath = DEFAULT_OUTPUT_PATH,
  html = renderFundingDemoReviewIndexHtml(params),
): string {
  validateFormat(format);
  return format === "summary"
    ? formatFundingDemoReviewIndexSummary({ ...params, outputPath })
    : html;
}

export function isFundingDemoReviewIndexDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateStringArray(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function isValueFlag(arg: string): boolean {
  return arg === "--evidence-manifest" || arg === "--funding-proof" ||
    arg === "--funding-proof-verification" || arg === "--dashboard" ||
    arg === "--output" || arg === "--format";
}

function setOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function readFormat(value: string): FundingDemoReviewIndexCliFormat {
  validateFormat(value, "--format must be html or summary");
  return value;
}

function validateFormat(
  value: unknown,
  message = "Funding demo review index output format must be html or summary",
): asserts value is FundingDemoReviewIndexCliFormat {
  if (value !== "html" && value !== "summary") throw new Error(message);
}

function validateFundingDemoReviewIndexOptions(options: unknown): asserts options is FundingDemoReviewIndexCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Funding demo review index options must be an object");
  }
}

function validateStringArray(value: unknown, message: string): asserts value is readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) throw new Error(message);
}

function validateOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}
