import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createPublicClient, http, isAddress } from "viem";
import type { Address, Hex } from "viem";
import { baseSepolia } from "viem/chains";

import { readDeploymentManifest as readBaseDeploymentManifest } from "../../base/deploymentManifest.js";
import { createAgentProposalExecutionReadiness } from "../../proposalExecution/readiness.js";
import { validateProposalExecutionReadinessReport } from "../../proposalExecution/reportValidation.js";

import type { AgentProposalExecutionReadinessClient } from "../../proposalExecution/readiness.js";

const DEFAULT_DEPLOYMENT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";

export interface ProposalExecutionReadinessCliArgs {
  signer: string;
  deploymentManifestPath: string;
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

export interface ProposalExecutionReadinessCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  loadDotEnv?: (path: string) => void;
  env?: Record<string, string | undefined>;
  readDeploymentManifest?: (path: string) => Promise<ProposalExecutionReadinessDeploymentManifest>;
  createClient?: (rpcUrl: string) => AgentProposalExecutionReadinessClient;
  readText?: (path: string) => Promise<string>;
  createReadiness?: (params: unknown) => Promise<ProposalExecutionReadinessReport>;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface ProposalExecutionReadinessDeploymentManifest {
  chainId: number;
  rpcUrlEnv: string;
}

interface ProposalExecutionReadinessReport {
  passed: boolean;
  failures: readonly string[];
  checks: readonly unknown[];
}

if (isProposalExecutionReadinessDirectRun(import.meta.url, process.argv)) await runProposalExecutionReadinessCli();

export async function runProposalExecutionReadinessCli(
  options: ProposalExecutionReadinessCliOptions = {},
): Promise<void> {
  validateProposalExecutionReadinessOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const loadDotEnvFile = options.loadDotEnv ?? loadDotEnv;
  const env = options.env ?? process.env;
  const readManifest = options.readDeploymentManifest ?? readBaseDeploymentManifest;
  const createClient = options.createClient ?? createViemReadinessClient;
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const createReadiness = options.createReadiness ?? ((params: unknown) =>
    createAgentProposalExecutionReadiness(
      params as Parameters<typeof createAgentProposalExecutionReadiness>[0],
    ) as Promise<ProposalExecutionReadinessReport>);
  const mkdirp = options.mkdirp ?? ((dir: string) => mkdir(dir, { recursive: true }).then(() => undefined));
  const writeText = options.writeText ?? writeFile;

  validateProposalExecutionReadinessOutputWriter(writeOutput);
  validateProposalExecutionReadinessArgv(argv);
  const args = parseProposalExecutionReadinessCliArgs(argv);
  validateProposalExecutionReadinessDotenvLoader(loadDotEnvFile);
  loadDotEnvFile(".env");

  if (!isAddress(args.signer)) throw new Error("--signer must be an EVM address");

  validateProposalExecutionReadinessManifestReader(readManifest);
  const deploymentManifest = await readManifest(args.deploymentManifestPath);
  const rpcUrl = env[deploymentManifest.rpcUrlEnv];
  if (rpcUrl === undefined || rpcUrl.length === 0) throw new Error(`${deploymentManifest.rpcUrlEnv} is required`);

  validateProposalExecutionReadinessClientFactory(createClient);
  validateProposalExecutionReadinessTextReader(readText);
  validateProposalExecutionReadinessCreator(createReadiness);
  const client = createClient(rpcUrl);
  const readiness = await createReadiness({
    signer: args.signer,
    expectedChainId: deploymentManifest.chainId,
    client,
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
  validateProposalExecutionReadinessReport(readiness);

  const output = {
    deploymentManifest: args.deploymentManifestPath,
    preview: args.previewPath,
    runbook: args.runbookPath,
    executionManifest: args.executionManifestPath,
    bundle: args.bundlePath,
    approval: args.approvalPath,
    manifest: args.manifestPath,
    proposal: args.proposalPath,
    summary: args.summaryPath,
    ...readiness,
  };
  validateProposalExecutionReadinessReport(output);

  if (args.outputPath !== undefined) {
    validateProposalExecutionReadinessDirectoryCreator(mkdirp);
    validateProposalExecutionReadinessTextWriter(writeText);
    await mkdirp(dirname(args.outputPath));
    await writeText(args.outputPath, `${JSON.stringify(output, null, 2)}\n`);
  }
  writeOutput(JSON.stringify(output, null, 2));

  if (!readiness.passed) {
    validateProposalExecutionReadinessExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseProposalExecutionReadinessCliArgs(argv: readonly string[]): ProposalExecutionReadinessCliArgs {
  validateProposalExecutionReadinessArgv(argv);
  const values = new Map<string, string>();
  const flags = [
    "--signer",
    "--deployment-manifest",
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
      setProposalExecutionReadinessOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(
      /^(--signer|--deployment-manifest|--preview|--runbook|--execution-manifest|--bundle|--approval|--manifest|--proposal|--summary|--output)=(.*)$/u,
    );
    if (equals !== null) {
      setProposalExecutionReadinessOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  const signer = values.get("--signer");
  if (signer === undefined) throw new Error("--signer is required");
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
    signer,
    deploymentManifestPath: values.get("--deployment-manifest") ?? DEFAULT_DEPLOYMENT_MANIFEST_PATH,
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

export function isProposalExecutionReadinessDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateProposalExecutionReadinessArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function createViemReadinessClient(rpcUrl: string): AgentProposalExecutionReadinessClient {
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  return {
    getChainId: () => publicClient.getChainId(),
    getTransactionCount: ({ address, blockTag }) =>
      publicClient.getTransactionCount({ address: address as Address, blockTag }),
    estimateGas: ({ account, to, value, data }) =>
      publicClient.estimateGas({
        account: account as Address,
        to: to as Address,
        value,
        data: data as Hex,
      }),
  };
}

function setProposalExecutionReadinessOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  values.set(name, value);
}

function validateProposalExecutionReadinessOptions(options: unknown): asserts options is ProposalExecutionReadinessCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Proposal execution readiness options must be an object");
  }
}

function validateProposalExecutionReadinessArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) throw new Error(message);
}

function validateProposalExecutionReadinessOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateProposalExecutionReadinessExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") throw new Error("Exit code setter must be a function");
}

function validateProposalExecutionReadinessDotenvLoader(loadDotEnvFile: unknown): asserts loadDotEnvFile is (path: string) => void {
  if (typeof loadDotEnvFile !== "function") throw new Error("Dotenv loader must be a function");
}

function validateProposalExecutionReadinessManifestReader(
  readManifest: unknown,
): asserts readManifest is (path: string) => Promise<ProposalExecutionReadinessDeploymentManifest> {
  if (typeof readManifest !== "function") throw new Error("Deployment manifest reader must be a function");
}

function validateProposalExecutionReadinessClientFactory(
  createClient: unknown,
): asserts createClient is (rpcUrl: string) => AgentProposalExecutionReadinessClient {
  if (typeof createClient !== "function") throw new Error("Readiness client factory must be a function");
}

function validateProposalExecutionReadinessTextReader(readText: unknown): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") throw new Error("Text reader must be a function");
}

function validateProposalExecutionReadinessCreator(
  createReadiness: unknown,
): asserts createReadiness is (params: unknown) => Promise<ProposalExecutionReadinessReport> {
  if (typeof createReadiness !== "function") throw new Error("Proposal execution readiness creator must be a function");
}

function validateProposalExecutionReadinessDirectoryCreator(mkdirp: unknown): asserts mkdirp is (dir: string) => Promise<void> {
  if (typeof mkdirp !== "function") throw new Error("Directory creator must be a function");
}

function validateProposalExecutionReadinessTextWriter(
  writeText: unknown,
): asserts writeText is (path: string, contents: string) => Promise<void> {
  if (typeof writeText !== "function") throw new Error("Text writer must be a function");
}

function loadDotEnv(path: string): void {
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch {
    return;
  }

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = stripQuotes(line.slice(separator + 1).trim());
    if (key.length > 0 && process.env[key] === undefined) process.env[key] = value;
  }
}

function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
