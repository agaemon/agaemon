import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createAgentProposalExecutionSigningPayload } from "../../proposalExecution/signingPayload.js";
import { validateProposalExecutionSigningPayloadCliResult } from "../../proposalExecution/reportValidation.js";

export interface ProposalExecutionSigningPayloadCliArgs {
  readinessPath: string;
  previewPath: string;
  runbookPath: string;
  executionManifestPath: string;
  bundlePath: string;
  approvalPath: string;
  manifestPath: string;
  proposalPath: string;
  summaryPath: string;
  outputPath?: string | undefined;
}

export interface ProposalExecutionSigningPayloadCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createPayload?: (params: unknown) => ProposalExecutionSigningPayloadResult;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface ProposalExecutionSigningPayloadResult {
  passed: boolean;
  failures: readonly string[];
  verification: unknown;
  payload: unknown;
}

if (isProposalExecutionSigningPayloadDirectRun(import.meta.url, process.argv)) {
  await runProposalExecutionSigningPayloadCli();
}

export async function runProposalExecutionSigningPayloadCli(
  options: ProposalExecutionSigningPayloadCliOptions = {},
): Promise<void> {
  validateProposalExecutionSigningPayloadOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const createPayload = options.createPayload ?? ((params: unknown) =>
    createAgentProposalExecutionSigningPayload(
      params as Parameters<typeof createAgentProposalExecutionSigningPayload>[0],
    ) as ProposalExecutionSigningPayloadResult);
  const mkdirp = options.mkdirp ?? ((dir: string) => mkdir(dir, { recursive: true }).then(() => undefined));
  const writeText = options.writeText ?? writeFile;

  validateProposalExecutionSigningPayloadOutputWriter(writeOutput);
  validateProposalExecutionSigningPayloadArgv(argv);
  const args = parseProposalExecutionSigningPayloadCliArgs(argv);
  validateProposalExecutionSigningPayloadTextReader(readText);
  validateProposalExecutionSigningPayloadCreator(createPayload);

  const result = createPayload({
    readinessPath: args.readinessPath,
    readinessJson: await readText(args.readinessPath),
    previewPath: args.previewPath,
    previewJson: await readText(args.previewPath),
    runbookPath: args.runbookPath,
    runbookMarkdown: await readText(args.runbookPath),
    executionManifestJson: await readText(args.executionManifestPath),
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
  validateProposalExecutionSigningPayloadCliResult(result);

  const output = {
    readiness: args.readinessPath,
    preview: args.previewPath,
    runbook: args.runbookPath,
    executionManifest: args.executionManifestPath,
    bundle: args.bundlePath,
    approval: args.approvalPath,
    manifest: args.manifestPath,
    proposal: args.proposalPath,
    summary: args.summaryPath,
    ...result,
  };
  validateProposalExecutionSigningPayloadCliResult(output);

  if (result.passed && args.outputPath !== undefined) {
    validateProposalExecutionSigningPayloadDirectoryCreator(mkdirp);
    validateProposalExecutionSigningPayloadTextWriter(writeText);
    await mkdirp(dirname(args.outputPath));
    await writeText(args.outputPath, `${JSON.stringify(result.payload, null, 2)}\n`);
  }
  writeOutput(JSON.stringify(output, null, 2));

  if (!result.passed) {
    validateProposalExecutionSigningPayloadExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseProposalExecutionSigningPayloadCliArgs(
  argv: readonly string[],
): ProposalExecutionSigningPayloadCliArgs {
  validateProposalExecutionSigningPayloadArgv(argv);
  const values = new Map<string, string>();
  const flags = [
    "--readiness",
    "--preview",
    "--runbook",
    "--execution-manifest",
    "--bundle",
    "--approval",
    "--manifest",
    "--proposal",
    "--summary",
    "--output",
  ] as const;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if ((flags as readonly string[]).includes(arg)) {
      setProposalExecutionSigningPayloadOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(
      /^(--readiness|--preview|--runbook|--execution-manifest|--bundle|--approval|--manifest|--proposal|--summary|--output)=(.*)$/u,
    );
    if (equals !== null) {
      setProposalExecutionSigningPayloadOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  const readinessPath = values.get("--readiness");
  if (readinessPath === undefined) throw new Error("--readiness is required");
  const previewPath = values.get("--preview");
  if (previewPath === undefined) throw new Error("--preview is required");
  const runbookPath = values.get("--runbook");
  if (runbookPath === undefined) throw new Error("--runbook is required");
  const executionManifestPath = values.get("--execution-manifest");
  if (executionManifestPath === undefined) throw new Error("--execution-manifest is required");
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
    readinessPath,
    previewPath,
    runbookPath,
    executionManifestPath,
    bundlePath,
    approvalPath,
    manifestPath,
    proposalPath,
    summaryPath,
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
  };
}

export function isProposalExecutionSigningPayloadDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateProposalExecutionSigningPayloadArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setProposalExecutionSigningPayloadOption(
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

function validateProposalExecutionSigningPayloadOptions(
  options: unknown,
): asserts options is ProposalExecutionSigningPayloadCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Proposal execution signing payload options must be an object");
  }
}

function validateProposalExecutionSigningPayloadArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) throw new Error(message);
}

function validateProposalExecutionSigningPayloadOutputWriter(
  writeOutput: unknown,
): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateProposalExecutionSigningPayloadExitCodeSetter(
  setExitCode: unknown,
): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") throw new Error("Exit code setter must be a function");
}

function validateProposalExecutionSigningPayloadTextReader(
  readText: unknown,
): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") throw new Error("Text reader must be a function");
}

function validateProposalExecutionSigningPayloadCreator(
  createPayload: unknown,
): asserts createPayload is (params: unknown) => ProposalExecutionSigningPayloadResult {
  if (typeof createPayload !== "function") throw new Error("Proposal execution signing payload creator must be a function");
}

function validateProposalExecutionSigningPayloadDirectoryCreator(mkdirp: unknown): asserts mkdirp is (dir: string) => Promise<void> {
  if (typeof mkdirp !== "function") throw new Error("Directory creator must be a function");
}

function validateProposalExecutionSigningPayloadTextWriter(
  writeText: unknown,
): asserts writeText is (path: string, contents: string) => Promise<void> {
  if (typeof writeText !== "function") throw new Error("Text writer must be a function");
}
