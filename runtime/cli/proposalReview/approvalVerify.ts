import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyAgentProposalReviewApproval } from "../../proposalReview/approvalVerify.js";
import { validateProposalReviewApprovalVerificationCliReport } from "../../proposalReview/reportValidation.js";

export interface ProposalReviewApprovalVerifyCliArgs {
  approvalPath: string;
  manifestPath: string;
  proposalPath: string;
  summaryPath: string;
}

export interface ProposalReviewApprovalVerifyCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyApproval?: (params: unknown) => ProposalReviewApprovalVerifyCliResult;
}

interface ProposalReviewApprovalVerifyCliResult {
  passed: boolean;
  failures: readonly string[];
  manifestVerification: unknown;
}

if (isProposalReviewApprovalVerifyDirectRun(import.meta.url, process.argv)) {
  await runProposalReviewApprovalVerifyCli();
}

export async function runProposalReviewApprovalVerifyCli(
  options: ProposalReviewApprovalVerifyCliOptions = {},
): Promise<void> {
  validateProposalReviewApprovalVerifyOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const verifyApproval = options.verifyApproval ?? ((params: unknown) =>
    verifyAgentProposalReviewApproval(
      params as Parameters<typeof verifyAgentProposalReviewApproval>[0],
    ) as ProposalReviewApprovalVerifyCliResult);

  validateProposalReviewApprovalVerifyOutputWriter(writeOutput);
  validateProposalReviewApprovalVerifyArgv(argv);
  const args = parseProposalReviewApprovalVerifyCliArgs(argv);
  validateProposalReviewApprovalVerifyTextReader(readText);
  validateProposalReviewApprovalVerifyVerifier(verifyApproval);

  const verification = verifyApproval({
    approvalJson: await readText(args.approvalPath),
    manifestPath: args.manifestPath,
    manifestJson: await readText(args.manifestPath),
    proposalPath: args.proposalPath,
    proposalJson: await readText(args.proposalPath),
    summaryPath: args.summaryPath,
    summaryMarkdown: await readText(args.summaryPath),
  });
  validateProposalReviewApprovalVerificationCliReport(verification);

  writeOutput(
    JSON.stringify(
      {
        approval: args.approvalPath,
        manifest: args.manifestPath,
        proposal: args.proposalPath,
        summary: args.summaryPath,
        ...verification,
        verificationScope: "local-record-consistency",
        reviewerAuthentication: "not-verified",
      },
      null,
      2,
    ),
  );

  if (!verification.passed) {
    validateProposalReviewApprovalVerifyExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseProposalReviewApprovalVerifyCliArgs(
  argv: readonly string[],
): ProposalReviewApprovalVerifyCliArgs {
  validateProposalReviewApprovalVerifyArgv(argv);
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (arg === "--approval" || arg === "--manifest" || arg === "--proposal" || arg === "--summary") {
      setProposalReviewApprovalVerifyOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--approval|--manifest|--proposal|--summary)=(.*)$/u);
    if (equals !== null) {
      setProposalReviewApprovalVerifyOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  const approvalPath = values.get("--approval");
  if (approvalPath === undefined) throw new Error("--approval is required");
  const manifestPath = values.get("--manifest");
  if (manifestPath === undefined) throw new Error("--manifest is required");
  const proposalPath = values.get("--proposal");
  if (proposalPath === undefined) throw new Error("--proposal is required");
  const summaryPath = values.get("--summary");
  if (summaryPath === undefined) throw new Error("--summary is required");

  return { approvalPath, manifestPath, proposalPath, summaryPath };
}

export function isProposalReviewApprovalVerifyDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateProposalReviewApprovalVerifyArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setProposalReviewApprovalVerifyOption(
  values: Map<string, string>,
  name: string,
  rawValue: string | undefined,
): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  values.set(name, value);
}

function validateProposalReviewApprovalVerifyOptions(
  options: unknown,
): asserts options is ProposalReviewApprovalVerifyCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Proposal review approval verification options must be an object");
  }
}

function validateProposalReviewApprovalVerifyArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) {
    throw new Error(message);
  }
}

function validateProposalReviewApprovalVerifyOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") {
    throw new Error("Output writer must be a function");
  }
}

function validateProposalReviewApprovalVerifyExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") {
    throw new Error("Exit code setter must be a function");
  }
}

function validateProposalReviewApprovalVerifyTextReader(readText: unknown): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") {
    throw new Error("Text reader must be a function");
  }
}

function validateProposalReviewApprovalVerifyVerifier(
  verifyApproval: unknown,
): asserts verifyApproval is (params: unknown) => ProposalReviewApprovalVerifyCliResult {
  if (typeof verifyApproval !== "function") {
    throw new Error("Proposal review approval verifier must be a function");
  }
}
