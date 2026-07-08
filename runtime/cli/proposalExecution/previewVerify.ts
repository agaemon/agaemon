import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyAgentProposalExecutionPreview } from "../../proposalExecution/previewVerify.js";
import { validateProposalExecutionPreviewVerificationReport } from "../../proposalExecution/reportValidation.js";

export interface ProposalExecutionPreviewVerifyCliArgs {
  previewPath: string;
  bundlePath: string;
  approvalPath: string;
  manifestPath: string;
  proposalPath: string;
  summaryPath: string;
}

export interface ProposalExecutionPreviewVerifyCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyPreview?: (params: unknown) => ProposalExecutionPreviewVerification;
}

interface ProposalExecutionPreviewVerification {
  passed: boolean;
  failures: readonly string[];
}

if (isProposalExecutionPreviewVerifyDirectRun(import.meta.url, process.argv)) await runProposalExecutionPreviewVerifyCli();

export async function runProposalExecutionPreviewVerifyCli(
  options: ProposalExecutionPreviewVerifyCliOptions = {},
): Promise<void> {
  validateProposalExecutionPreviewVerifyOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const verifyPreview = options.verifyPreview ?? ((params: unknown) =>
    verifyAgentProposalExecutionPreview(
      params as Parameters<typeof verifyAgentProposalExecutionPreview>[0],
    ) as ProposalExecutionPreviewVerification);

  validateProposalExecutionPreviewVerifyOutputWriter(writeOutput);
  validateProposalExecutionPreviewVerifyArgv(argv);
  const args = parseProposalExecutionPreviewVerifyCliArgs(argv);
  validateProposalExecutionPreviewVerifyTextReader(readText);
  validateProposalExecutionPreviewVerifier(verifyPreview);

  const verification = verifyPreview({
    previewJson: await readText(args.previewPath),
    bundlePath: args.bundlePath,
    bundleJson: await readText(args.bundlePath),
    approvalPath: args.approvalPath,
    approvalJson: await readText(args.approvalPath),
    manifestPath: args.manifestPath,
    manifestJson: await readText(args.manifestPath),
    proposalPath: args.proposalPath,
    proposalJson: await readText(args.proposalPath),
    summaryPath: args.summaryPath,
    summaryMarkdown: await readText(args.summaryPath),
  });

  const report = {
    preview: args.previewPath,
    bundle: args.bundlePath,
    approval: args.approvalPath,
    manifest: args.manifestPath,
    proposal: args.proposalPath,
    summary: args.summaryPath,
    ...verification,
  };
  validateProposalExecutionPreviewVerificationReport(report);
  writeOutput(JSON.stringify(report, null, 2));

  if (!verification.passed) {
    validateProposalExecutionPreviewVerifyExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseProposalExecutionPreviewVerifyCliArgs(
  argv: readonly string[],
): ProposalExecutionPreviewVerifyCliArgs {
  validateProposalExecutionPreviewVerifyArgv(argv);
  const values = new Map<string, string>();
  const flags = ["--preview", "--bundle", "--approval", "--manifest", "--proposal", "--summary"] as const;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if ((flags as readonly string[]).includes(arg)) {
      setProposalExecutionPreviewVerifyOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--preview|--bundle|--approval|--manifest|--proposal|--summary)=(.*)$/u);
    if (equals !== null) {
      setProposalExecutionPreviewVerifyOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  const previewPath = values.get("--preview");
  if (previewPath === undefined) throw new Error("--preview is required");
  const bundlePath = values.get("--bundle");
  if (bundlePath === undefined) throw new Error("--bundle is required");
  const approvalPath = values.get("--approval");
  if (approvalPath === undefined) throw new Error("--approval is required");
  const manifestPath = values.get("--manifest");
  if (manifestPath === undefined) throw new Error("--manifest is required");
  const proposalPath = values.get("--proposal");
  if (proposalPath === undefined) throw new Error("--proposal is required");
  const summaryPath = values.get("--summary");
  if (summaryPath === undefined) throw new Error("--summary is required");

  return { previewPath, bundlePath, approvalPath, manifestPath, proposalPath, summaryPath };
}

export function isProposalExecutionPreviewVerifyDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateProposalExecutionPreviewVerifyArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setProposalExecutionPreviewVerifyOption(
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

function validateProposalExecutionPreviewVerifyOptions(
  options: unknown,
): asserts options is ProposalExecutionPreviewVerifyCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Proposal execution preview verification options must be an object");
  }
}

function validateProposalExecutionPreviewVerifyArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) throw new Error(message);
}

function validateProposalExecutionPreviewVerifyOutputWriter(
  writeOutput: unknown,
): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateProposalExecutionPreviewVerifyExitCodeSetter(
  setExitCode: unknown,
): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") throw new Error("Exit code setter must be a function");
}

function validateProposalExecutionPreviewVerifyTextReader(
  readText: unknown,
): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") throw new Error("Text reader must be a function");
}

function validateProposalExecutionPreviewVerifier(
  verifyPreview: unknown,
): asserts verifyPreview is (params: unknown) => ProposalExecutionPreviewVerification {
  if (typeof verifyPreview !== "function") throw new Error("Proposal execution preview verifier must be a function");
}
