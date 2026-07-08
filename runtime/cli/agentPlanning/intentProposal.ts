import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";

import { parseAgentIntentDocument } from "../../agentPlanning/intentCompiler.js";
import { createAgentIntentProposal } from "../../agentPlanning/intentProposal.js";
import {
  validateAgentProposalCliReport,
  validateAgentProposalCliWriteSummary,
} from "../../agentPlanning/reportValidation.js";
import {
  createAgentProposalOutput,
  createAgentProposalWriteSummary,
} from "../../proposal/output.js";
import { createOnChainPolicySimulator } from "../../base/execution.js";
import { readDeploymentManifest } from "../../base/deploymentManifest.js";

const DEFAULT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";

type PlanningManifest = {
  chainId: number;
  rpcUrlEnv: string;
  contracts: {
    agentAccount: string;
  };
};

export interface IntentProposalCliArgs {
  intentPath: string;
  manifestPath: string;
  outputPath?: string | undefined;
}

export interface IntentProposalCliOptions {
  argv?: readonly string[];
  env?: Record<string, string | undefined>;
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  loadDotEnv?: (path: string, env: Record<string, string | undefined>) => void;
  readManifest?: (path: string) => Promise<PlanningManifest>;
  createPublicClient?: (rpcUrl: string) => { getChainId: () => Promise<number> };
  createPolicySimulator?: (publicClient: unknown, manifest: PlanningManifest) => unknown;
  readText?: (path: string) => string;
  parseIntentDocument?: (value: unknown) => Record<string, unknown>;
  createProposal?: (params: unknown) => Promise<{ executable: boolean }>;
  createOutput?: (params: unknown) => unknown;
  createSummary?: (params: unknown) => unknown;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

if (isIntentProposalDirectRun(import.meta.url, process.argv)) await runIntentProposalCli();

export async function runIntentProposalCli(options: IntentProposalCliOptions = {}): Promise<void> {
  validateIntentProposalOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const env = options.env ?? process.env;
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const loadEnv = options.loadDotEnv ?? loadDotEnv;
  const readManifest = options.readManifest ?? (async (path: string) =>
    await readDeploymentManifest(path) as unknown as PlanningManifest);
  const createClient = options.createPublicClient ?? createAgentPlanningPublicClient;
  const createSimulator = options.createPolicySimulator ?? ((publicClient: unknown, manifest: PlanningManifest) =>
    createOnChainPolicySimulator(
      publicClient as Parameters<typeof createOnChainPolicySimulator>[0],
      manifest as unknown as Parameters<typeof createOnChainPolicySimulator>[1],
    ));
  const readText = options.readText ?? ((path: string) => readFileSync(path, "utf8"));
  const parseIntent = options.parseIntentDocument ?? parseAgentIntentDocument;
  const createProposal = options.createProposal ?? (async (params: unknown) =>
    createAgentIntentProposal(params as Parameters<typeof createAgentIntentProposal>[0]));
  const createOutput = options.createOutput ?? ((params: unknown) =>
    createAgentProposalOutput(params as Parameters<typeof createAgentProposalOutput>[0]));
  const createSummary = options.createSummary ?? ((params: unknown) =>
    createAgentProposalWriteSummary(params as Parameters<typeof createAgentProposalWriteSummary>[0]));
  const mkdirp = options.mkdirp ?? (async (dir: string) => {
    await mkdir(dir, { recursive: true });
  });
  const writeText = options.writeText ?? writeFile;

  validateIntentProposalOutputWriter(writeOutput);
  validateIntentProposalArgv(argv);
  const args = parseIntentProposalCliArgs(argv);
  validateIntentProposalEnv(env);
  validateIntentProposalDotEnvLoader(loadEnv);
  loadEnv(".env", env);
  validateIntentProposalManifestReader(readManifest);
  const manifest = await readManifest(args.manifestPath);
  const rpcUrl = env[manifest.rpcUrlEnv];
  if (rpcUrl === undefined || rpcUrl.length === 0) throw new Error(`${manifest.rpcUrlEnv} is required`);

  validateIntentProposalPublicClientFactory(createClient);
  const publicClient = createClient(rpcUrl);
  const chainId = await publicClient.getChainId();
  if (chainId !== manifest.chainId) throw new Error(`Connected to chain ${chainId}, expected ${manifest.chainId}`);

  validateIntentProposalPolicySimulatorFactory(createSimulator);
  validateIntentProposalTextReader(readText);
  validateIntentProposalParser(parseIntent);
  validateIntentProposalCreator(createProposal);
  const document = parseIntent(JSON.parse(readText(args.intentPath)) as unknown);
  const proposal = await createProposal({
    manifest,
    ...document,
    simulatePolicy: createSimulator(publicClient, manifest),
  });

  const output = createOutput({
    chainId,
    manifestPath: args.manifestPath,
    source: { type: "intent", path: args.intentPath },
    proposal,
  });
  validateAgentProposalCliReport(output, "Intent proposal", "intent");

  await writeOrPrintOutput({
    output,
    outputPath: args.outputPath,
    writeOutput,
    mkdirp,
    writeText,
    createSummary: (path) => {
      const summary = createSummary({
        chainId,
        manifestPath: args.manifestPath,
        source: { type: "intent", path: args.intentPath },
        outputPath: path,
        proposal,
      });
      validateAgentProposalCliWriteSummary(summary, "Intent proposal", "intent");
      return summary;
    },
  });

  if (!proposal.executable) {
    validateIntentProposalExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseIntentProposalCliArgs(argv: readonly string[]): IntentProposalCliArgs {
  validateIntentProposalArgv(argv);
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (arg === "--intent" || arg === "--manifest" || arg === "--output") {
      setIntentProposalOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--intent|--manifest|--output)=(.*)$/u);
    if (equals !== null) {
      setIntentProposalOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  const intentPath = values.get("--intent");
  if (intentPath === undefined) throw new Error("--intent is required");

  return {
    intentPath,
    manifestPath: values.get("--manifest") ?? DEFAULT_MANIFEST_PATH,
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
  };
}

async function writeOrPrintOutput(parameters: {
  output: unknown;
  outputPath: string | undefined;
  writeOutput: (output: string) => void;
  mkdirp: (dir: string) => Promise<void>;
  writeText: (path: string, contents: string) => Promise<void>;
  createSummary: (outputPath: string) => unknown;
}): Promise<void> {
  const body = `${JSON.stringify(parameters.output, null, 2)}\n`;
  if (parameters.outputPath === undefined) {
    parameters.writeOutput(body.trimEnd());
    return;
  }

  validateIntentProposalDirectoryCreator(parameters.mkdirp);
  validateIntentProposalTextWriter(parameters.writeText);
  const summary = parameters.createSummary(parameters.outputPath);
  await parameters.mkdirp(dirname(parameters.outputPath));
  await parameters.writeText(parameters.outputPath, body);
  parameters.writeOutput(JSON.stringify(summary, null, 2));
}

export function createAgentPlanningPublicClient(rpcUrl: string): { getChainId: () => Promise<number> } {
  return createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
}

export function isIntentProposalDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateIntentProposalArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setIntentProposalOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  values.set(name, value);
}

function loadDotEnv(path: string, env: Record<string, string | undefined>): void {
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
    if (key.length > 0 && env[key] === undefined) env[key] = value;
  }
}

function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function validateIntentProposalOptions(options: unknown): asserts options is IntentProposalCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Intent proposal options must be an object");
  }
}

function validateIntentProposalArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) {
    throw new Error(message);
  }
}

function validateIntentProposalEnv(env: unknown): asserts env is Record<string, string | undefined> {
  if (typeof env !== "object" || env === null || Array.isArray(env)) {
    throw new Error("Environment must be an object");
  }
}

function validateIntentProposalOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") {
    throw new Error("Output writer must be a function");
  }
}

function validateIntentProposalExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") {
    throw new Error("Exit code setter must be a function");
  }
}

function validateIntentProposalDotEnvLoader(
  loadEnv: unknown,
): asserts loadEnv is (path: string, env: Record<string, string | undefined>) => void {
  if (typeof loadEnv !== "function") {
    throw new Error("Dotenv loader must be a function");
  }
}

function validateIntentProposalManifestReader(readManifest: unknown): asserts readManifest is (path: string) => Promise<PlanningManifest> {
  if (typeof readManifest !== "function") {
    throw new Error("Manifest reader must be a function");
  }
}

function validateIntentProposalPublicClientFactory(
  createClient: unknown,
): asserts createClient is (rpcUrl: string) => { getChainId: () => Promise<number> } {
  if (typeof createClient !== "function") {
    throw new Error("Public client factory must be a function");
  }
}

function validateIntentProposalPolicySimulatorFactory(
  createSimulator: unknown,
): asserts createSimulator is (
  publicClient: unknown,
  manifest: PlanningManifest,
) => unknown {
  if (typeof createSimulator !== "function") {
    throw new Error("Policy simulator factory must be a function");
  }
}

function validateIntentProposalTextReader(readText: unknown): asserts readText is (path: string) => string {
  if (typeof readText !== "function") {
    throw new Error("Text reader must be a function");
  }
}

function validateIntentProposalParser(parseIntent: unknown): asserts parseIntent is (value: unknown) => Record<string, unknown> {
  if (typeof parseIntent !== "function") {
    throw new Error("Intent parser must be a function");
  }
}

function validateIntentProposalCreator(
  createProposal: unknown,
): asserts createProposal is (params: unknown) => Promise<{ executable: boolean }> {
  if (typeof createProposal !== "function") {
    throw new Error("Intent proposal creator must be a function");
  }
}

function validateIntentProposalDirectoryCreator(mkdirp: unknown): asserts mkdirp is (dir: string) => Promise<void> {
  if (typeof mkdirp !== "function") {
    throw new Error("Directory creator must be a function");
  }
}

function validateIntentProposalTextWriter(
  writeText: unknown,
): asserts writeText is (path: string, contents: string) => Promise<void> {
  if (typeof writeText !== "function") {
    throw new Error("Text writer must be a function");
  }
}
