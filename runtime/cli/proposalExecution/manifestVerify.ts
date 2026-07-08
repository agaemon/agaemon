import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyAgentProposalExecutionManifest } from "../../proposalExecution/manifestVerify.js";
import { validateProposalExecutionManifestVerificationReport } from "../../proposalExecution/reportValidation.js";

export interface ProposalExecutionManifestVerifyCliArgs {
  executionManifestPath: string;
  previewPath: string;
  runbookPath: string;
  bundlePath: string;
  approvalPath: string;
  manifestPath: string;
  proposalPath: string;
  summaryPath: string;
}

export interface ProposalExecutionManifestVerifyCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyManifest?: (params: unknown) => ProposalExecutionManifestVerification;
}

interface ProposalExecutionManifestVerification {
  passed: boolean;
  failures: readonly string[];
}

if (isProposalExecutionManifestVerifyDirectRun(import.meta.url, process.argv)) await runProposalExecutionManifestVerifyCli();

export async function runProposalExecutionManifestVerifyCli(
  options: ProposalExecutionManifestVerifyCliOptions = {},
): Promise<void> {
  validateProposalExecutionManifestVerifyOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const verifyManifest = options.verifyManifest ?? ((params: unknown) =>
    verifyAgentProposalExecutionManifest(
      params as Parameters<typeof verifyAgentProposalExecutionManifest>[0],
    ) as ProposalExecutionManifestVerification);

  validateProposalExecutionManifestVerifyOutputWriter(writeOutput);
  validateProposalExecutionManifestVerifyArgv(argv);
  const args = parseProposalExecutionManifestVerifyCliArgs(argv);
  validateProposalExecutionManifestVerifyTextReader(readText);
  validateProposalExecutionManifestVerifier(verifyManifest);

  const verification = verifyManifest({
    executionManifestJson: await readText(args.executionManifestPath),
    previewPath: args.previewPath,
    previewJson: await readText(args.previewPath),
    runbookPath: args.runbookPath,
    runbookMarkdown: await readText(args.runbookPath),
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
    executionManifest: args.executionManifestPath,
    preview: args.previewPath,
    runbook: args.runbookPath,
    bundle: args.bundlePath,
    approval: args.approvalPath,
    manifest: args.manifestPath,
    proposal: args.proposalPath,
    summary: args.summaryPath,
    ...verification,
  };
  validateProposalExecutionManifestVerificationReport(report);
  writeOutput(JSON.stringify(report, null, 2));

  if (!verification.passed) {
    validateProposalExecutionManifestVerifyExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseProposalExecutionManifestVerifyCliArgs(
  argv: readonly string[],
): ProposalExecutionManifestVerifyCliArgs {
  validateProposalExecutionManifestVerifyArgv(argv);
  const values = new Map<string, string>();
  const flags = [
    "--execution-manifest",
    "--preview",
    "--runbook",
    "--bundle",
    "--approval",
    "--manifest",
    "--proposal",
    "--summary",
  ] as const;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if ((flags as readonly string[]).includes(arg)) {
      setProposalExecutionManifestVerifyOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(
      /^(--execution-manifest|--preview|--runbook|--bundle|--approval|--manifest|--proposal|--summary)=(.*)$/u,
    );
    if (equals !== null) {
      setProposalExecutionManifestVerifyOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  const executionManifestPath = values.get("--execution-manifest");
  if (executionManifestPath === undefined) throw new Error("--execution-manifest is required");
  const previewPath = values.get("--preview");
  if (previewPath === undefined) throw new Error("--preview is required");
  const runbookPath = values.get("--runbook");
  if (runbookPath === undefined) throw new Error("--runbook is required");
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

  return {
    executionManifestPath,
    previewPath,
    runbookPath,
    bundlePath,
    approvalPath,
    manifestPath,
    proposalPath,
    summaryPath,
  };
}

export function isProposalExecutionManifestVerifyDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateProposalExecutionManifestVerifyArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setProposalExecutionManifestVerifyOption(
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

function validateProposalExecutionManifestVerifyOptions(
  options: unknown,
): asserts options is ProposalExecutionManifestVerifyCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Proposal execution manifest verification options must be an object");
  }
}

function validateProposalExecutionManifestVerifyArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) throw new Error(message);
}

function validateProposalExecutionManifestVerifyOutputWriter(
  writeOutput: unknown,
): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateProposalExecutionManifestVerifyExitCodeSetter(
  setExitCode: unknown,
): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") throw new Error("Exit code setter must be a function");
}

function validateProposalExecutionManifestVerifyTextReader(
  readText: unknown,
): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") throw new Error("Text reader must be a function");
}

function validateProposalExecutionManifestVerifier(
  verifyManifest: unknown,
): asserts verifyManifest is (params: unknown) => ProposalExecutionManifestVerification {
  if (typeof verifyManifest !== "function") throw new Error("Proposal execution manifest verifier must be a function");
}
