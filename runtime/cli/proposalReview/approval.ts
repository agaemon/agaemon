import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createAgentProposalReviewApproval } from "../../proposalReview/approval.js";
import { validateProposalReviewApprovalCliResult } from "../../proposalReview/reportValidation.js";

export interface ProposalReviewApprovalCliArgs {
  manifestPath: string;
  proposalPath: string;
  summaryPath: string;
  reviewer: string;
  decision: string;
  outputPath?: string | undefined;
  generatedAt?: string | undefined;
}

export interface ProposalReviewApprovalCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createApproval?: (params: unknown) => ProposalReviewApprovalCliResult;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface ProposalReviewApprovalCliResult {
  passed: boolean;
  approval: ProposalReviewApprovalCliArtifact | null;
  failures: readonly string[];
  manifestVerification: unknown;
}

interface ProposalReviewApprovalCliArtifact {
  manifest: { path: string };
  reviewer: string;
  decision: string;
}

if (isProposalReviewApprovalDirectRun(import.meta.url, process.argv)) await runProposalReviewApprovalCli();

export async function runProposalReviewApprovalCli(options: ProposalReviewApprovalCliOptions = {}): Promise<void> {
  validateProposalReviewApprovalOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const createApproval = options.createApproval ?? ((params: unknown) =>
    createAgentProposalReviewApproval(
      params as Parameters<typeof createAgentProposalReviewApproval>[0],
    ) as ProposalReviewApprovalCliResult);
  const mkdirp = options.mkdirp ?? (async (dir: string) => {
    await mkdir(dir, { recursive: true });
  });
  const writeText = options.writeText ?? writeFile;

  validateProposalReviewApprovalOutputWriter(writeOutput);
  validateProposalReviewApprovalArgv(argv);
  const args = parseProposalReviewApprovalCliArgs(argv);
  validateProposalReviewApprovalTextReader(readText);
  validateProposalReviewApprovalCreator(createApproval);

  const result = createApproval({
    manifestPath: args.manifestPath,
    manifestJson: await readText(args.manifestPath),
    proposalPath: args.proposalPath,
    proposalJson: await readText(args.proposalPath),
    summaryPath: args.summaryPath,
    summaryMarkdown: await readText(args.summaryPath),
    reviewer: args.reviewer,
    decision: args.decision,
    generatedAt: args.generatedAt,
  });
  validateProposalReviewApprovalCliResult(result);

  if (result.passed && result.approval !== null) {
    if (args.outputPath === undefined) {
      writeOutput(JSON.stringify(result.approval, null, 2));
    } else {
      validateProposalReviewApprovalDirectoryCreator(mkdirp);
      validateProposalReviewApprovalTextWriter(writeText);
      await mkdirp(dirname(args.outputPath));
      await writeText(args.outputPath, `${JSON.stringify(result.approval, null, 2)}\n`);
      writeOutput(
        JSON.stringify(
          {
            output: args.outputPath,
            manifest: result.approval.manifest.path,
            reviewer: result.approval.reviewer,
            decision: result.approval.decision,
            passed: true,
            recordType: "local-review-acknowledgement",
            reviewerAuthentication: "not-verified",
          },
          null,
          2,
        ),
      );
    }
    return;
  }

  writeOutput(
    JSON.stringify(
      {
        manifest: args.manifestPath,
        proposal: args.proposalPath,
        summary: args.summaryPath,
        passed: false,
        failures: result.failures,
        manifestVerification: result.manifestVerification,
      },
      null,
      2,
    ),
  );
  validateProposalReviewApprovalExitCodeSetter(setExitCode);
  setExitCode(1);
}

export function parseProposalReviewApprovalCliArgs(argv: readonly string[]): ProposalReviewApprovalCliArgs {
  validateProposalReviewApprovalArgv(argv);
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (
      arg === "--manifest" ||
      arg === "--proposal" ||
      arg === "--summary" ||
      arg === "--reviewer" ||
      arg === "--decision" ||
      arg === "--output" ||
      arg === "--generated-at"
    ) {
      setProposalReviewApprovalOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--manifest|--proposal|--summary|--reviewer|--decision|--output|--generated-at)=(.*)$/u);
    if (equals !== null) {
      setProposalReviewApprovalOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  const manifestPath = values.get("--manifest");
  if (manifestPath === undefined) throw new Error("--manifest is required");
  const proposalPath = values.get("--proposal");
  if (proposalPath === undefined) throw new Error("--proposal is required");
  const summaryPath = values.get("--summary");
  if (summaryPath === undefined) throw new Error("--summary is required");
  const reviewer = values.get("--reviewer");
  if (reviewer === undefined) throw new Error("--reviewer is required");
  const decision = values.get("--decision");
  if (decision === undefined) throw new Error("--decision is required");

  return {
    manifestPath,
    proposalPath,
    summaryPath,
    reviewer,
    decision,
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
    ...(values.has("--generated-at") ? { generatedAt: values.get("--generated-at")! } : {}),
  };
}

export function isProposalReviewApprovalDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateProposalReviewApprovalArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setProposalReviewApprovalOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  values.set(name, value);
}

function validateProposalReviewApprovalOptions(options: unknown): asserts options is ProposalReviewApprovalCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Proposal review approval options must be an object");
  }
}

function validateProposalReviewApprovalArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) {
    throw new Error(message);
  }
}

function validateProposalReviewApprovalOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") {
    throw new Error("Output writer must be a function");
  }
}

function validateProposalReviewApprovalExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") {
    throw new Error("Exit code setter must be a function");
  }
}

function validateProposalReviewApprovalTextReader(readText: unknown): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") {
    throw new Error("Text reader must be a function");
  }
}

function validateProposalReviewApprovalCreator(
  createApproval: unknown,
): asserts createApproval is (params: unknown) => ProposalReviewApprovalCliResult {
  if (typeof createApproval !== "function") {
    throw new Error("Proposal review approval creator must be a function");
  }
}

function validateProposalReviewApprovalDirectoryCreator(mkdirp: unknown): asserts mkdirp is (dir: string) => Promise<void> {
  if (typeof mkdirp !== "function") {
    throw new Error("Directory creator must be a function");
  }
}

function validateProposalReviewApprovalTextWriter(
  writeText: unknown,
): asserts writeText is (path: string, contents: string) => Promise<void> {
  if (typeof writeText !== "function") {
    throw new Error("Text writer must be a function");
  }
}
