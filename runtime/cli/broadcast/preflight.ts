import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createPublicClient, http } from "viem";
import type { Address } from "viem";
import { baseSepolia } from "viem/chains";

import { createAgentProposalExecutionBroadcastPreflight } from "../../broadcast/preflight.js";
import { validateBroadcastCliPreflightReport } from "../../broadcast/cliReportValidation.js";
import { readDeploymentManifest as readBaseDeploymentManifest } from "../../base/deploymentManifest.js";

import type { AgentProposalExecutionBroadcastPreflightClient } from "../../broadcast/preflight.js";

const DEFAULT_DEPLOYMENT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";

export interface BroadcastPreflightCliArgs {
  deploymentManifestPath: string;
  signedPayloadPath: string;
  payloadPath: string;
  readinessPath: string;
  previewPath: string;
  runbookPath: string;
  executionManifestPath: string;
  bundlePath: string;
  approvalPath: string;
  manifestPath: string;
  proposalPath: string;
  summaryPath: string;
}

export interface BroadcastPreflightCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  loadDotEnv?: (path: string) => void;
  env?: Record<string, string | undefined>;
  readDeploymentManifest?: (path: string) => Promise<BroadcastPreflightDeploymentManifest>;
  createClient?: (rpcUrl: string) => AgentProposalExecutionBroadcastPreflightClient;
  readText?: (path: string) => Promise<string>;
  createPreflight?: (params: unknown) => Promise<BroadcastPreflightReport>;
}

interface BroadcastPreflightDeploymentManifest {
  rpcUrlEnv: string;
}

interface BroadcastPreflightReport {
  passed: boolean;
  failures: readonly string[];
  checks: readonly unknown[];
}

if (isBroadcastPreflightDirectRun(import.meta.url, process.argv)) await runBroadcastPreflightCli();

export async function runBroadcastPreflightCli(options: BroadcastPreflightCliOptions = {}): Promise<void> {
  validateBroadcastPreflightOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const loadDotEnvFile = options.loadDotEnv ?? loadDotEnv;
  const env = options.env ?? process.env;
  const readDeploymentManifest = options.readDeploymentManifest ?? readBaseDeploymentManifest;
  const createClient = options.createClient ?? createViemBroadcastPreflightClient;
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const createPreflight = options.createPreflight ?? ((params: unknown) =>
    createAgentProposalExecutionBroadcastPreflight(
      params as Parameters<typeof createAgentProposalExecutionBroadcastPreflight>[0],
    ) as Promise<BroadcastPreflightReport>);

  validateBroadcastPreflightOutputWriter(writeOutput);
  validateBroadcastPreflightArgv(argv);
  const args = parseBroadcastPreflightCliArgs(argv);
  validateBroadcastPreflightDotenvLoader(loadDotEnvFile);
  loadDotEnvFile(".env");

  validateBroadcastPreflightManifestReader(readDeploymentManifest);
  const deploymentManifest = await readDeploymentManifest(args.deploymentManifestPath);
  const rpcUrl = env[deploymentManifest.rpcUrlEnv];
  if (rpcUrl === undefined || rpcUrl.length === 0) throw new Error(`${deploymentManifest.rpcUrlEnv} is required`);

  validateBroadcastPreflightClientFactory(createClient);
  validateBroadcastPreflightTextReader(readText);
  validateBroadcastPreflightCreator(createPreflight);
  const client = createClient(rpcUrl);
  const report = await createPreflight({
    signedPayloadPath: args.signedPayloadPath,
    signedPayloadJson: await readText(args.signedPayloadPath),
    payloadPath: args.payloadPath,
    payloadJson: await readText(args.payloadPath),
    readinessPath: args.readinessPath,
    readinessJson: await readText(args.readinessPath),
    previewPath: args.previewPath,
    previewJson: await readText(args.previewPath),
    runbookPath: args.runbookPath,
    runbookMarkdown: await readText(args.runbookPath),
    executionManifestPath: args.executionManifestPath,
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
    client,
  });
  validateBroadcastCliPreflightReport(report);

  writeOutput(JSON.stringify({
    deploymentManifest: args.deploymentManifestPath,
    signedPayload: args.signedPayloadPath,
    payload: args.payloadPath,
    readiness: args.readinessPath,
    preview: args.previewPath,
    runbook: args.runbookPath,
    executionManifest: args.executionManifestPath,
    bundle: args.bundlePath,
    approval: args.approvalPath,
    manifest: args.manifestPath,
    proposal: args.proposalPath,
    summary: args.summaryPath,
    ...report,
  }, null, 2));

  if (!report.passed) {
    validateBroadcastPreflightExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseBroadcastPreflightCliArgs(argv: readonly string[]): BroadcastPreflightCliArgs {
  validateBroadcastPreflightArgv(argv);
  const values = new Map<string, string>();
  const flags = [
    "--deployment-manifest",
    "--signed-payload",
    "--payload",
    "--readiness",
    "--preview",
    "--runbook",
    "--execution-manifest",
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
      setBroadcastPreflightOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--deployment-manifest|--signed-payload|--payload|--readiness|--preview|--runbook|--execution-manifest|--bundle|--approval|--manifest|--proposal|--summary)=(.*)$/u);
    if (equals !== null) {
      setBroadcastPreflightOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  const signedPayloadPath = values.get("--signed-payload");
  if (signedPayloadPath === undefined) throw new Error("--signed-payload is required");
  const payloadPath = values.get("--payload");
  if (payloadPath === undefined) throw new Error("--payload is required");
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
    deploymentManifestPath: values.get("--deployment-manifest") ?? DEFAULT_DEPLOYMENT_MANIFEST_PATH,
    signedPayloadPath,
    payloadPath,
    readinessPath,
    previewPath,
    runbookPath,
    executionManifestPath,
    bundlePath,
    approvalPath,
    manifestPath,
    proposalPath,
    summaryPath,
  };
}

export function isBroadcastPreflightDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateBroadcastPreflightArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function createViemBroadcastPreflightClient(rpcUrl: string): AgentProposalExecutionBroadcastPreflightClient {
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  return {
    getChainId: () => publicClient.getChainId(),
    getTransactionCount: ({ address, blockTag }) =>
      publicClient.getTransactionCount({ address: address as Address, blockTag }),
  };
}

function setBroadcastPreflightOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function validateBroadcastPreflightOptions(options: unknown): asserts options is BroadcastPreflightCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Broadcast preflight options must be an object");
  }
}

function validateBroadcastPreflightArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) throw new Error(message);
}

function validateBroadcastPreflightOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateBroadcastPreflightExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") throw new Error("Exit code setter must be a function");
}

function validateBroadcastPreflightDotenvLoader(loadDotEnvFile: unknown): asserts loadDotEnvFile is (path: string) => void {
  if (typeof loadDotEnvFile !== "function") throw new Error("Dotenv loader must be a function");
}

function validateBroadcastPreflightManifestReader(
  readDeploymentManifest: unknown,
): asserts readDeploymentManifest is (path: string) => Promise<BroadcastPreflightDeploymentManifest> {
  if (typeof readDeploymentManifest !== "function") throw new Error("Deployment manifest reader must be a function");
}

function validateBroadcastPreflightClientFactory(
  createClient: unknown,
): asserts createClient is (rpcUrl: string) => AgentProposalExecutionBroadcastPreflightClient {
  if (typeof createClient !== "function") throw new Error("Broadcast preflight client factory must be a function");
}

function validateBroadcastPreflightTextReader(readText: unknown): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") throw new Error("Text reader must be a function");
}

function validateBroadcastPreflightCreator(
  createPreflight: unknown,
): asserts createPreflight is (params: unknown) => Promise<BroadcastPreflightReport> {
  if (typeof createPreflight !== "function") throw new Error("Broadcast preflight creator must be a function");
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
    const value = line.slice(separator + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
