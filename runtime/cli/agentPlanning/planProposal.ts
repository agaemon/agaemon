import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";

import {
  createAgentPlanProposal,
  parseAgentPlanProposalDocument,
} from "../../agentPlanning/planProposal.js";
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

export interface PlanProposalCliArgs {
  planPath: string;
  manifestPath: string;
  outputPath?: string | undefined;
}

export interface PlanProposalCliOptions {
  argv?: readonly string[];
  env?: Record<string, string | undefined>;
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  loadDotEnv?: (path: string, env: Record<string, string | undefined>) => void;
  readManifest?: (path: string) => Promise<PlanningManifest>;
  createPublicClient?: (rpcUrl: string) => { getChainId: () => Promise<number> };
  createPolicySimulator?: (publicClient: unknown, manifest: PlanningManifest) => unknown;
  readText?: (path: string) => string;
  parsePlanDocument?: (value: unknown) => Record<string, unknown>;
  createProposal?: (params: unknown) => Promise<{ executable: boolean }>;
  createOutput?: (params: unknown) => unknown;
  createSummary?: (params: unknown) => unknown;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

if (isPlanProposalDirectRun(import.meta.url, process.argv)) await runPlanProposalCli();

export async function runPlanProposalCli(options: PlanProposalCliOptions = {}): Promise<void> {
  validatePlanProposalOptions(options);
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
  const parsePlan = options.parsePlanDocument ?? ((value: unknown) => parseAgentPlanProposalDocument(value) as unknown as Record<string, unknown>);
  const createProposal = options.createProposal ?? (async (params: unknown) =>
    createAgentPlanProposal(params as Parameters<typeof createAgentPlanProposal>[0]));
  const createOutput = options.createOutput ?? ((params: unknown) =>
    createAgentProposalOutput(params as Parameters<typeof createAgentProposalOutput>[0]));
  const createSummary = options.createSummary ?? ((params: unknown) =>
    createAgentProposalWriteSummary(params as Parameters<typeof createAgentProposalWriteSummary>[0]));
  const mkdirp = options.mkdirp ?? (async (dir: string) => {
    await mkdir(dir, { recursive: true });
  });
  const writeText = options.writeText ?? writeFile;

  validatePlanProposalOutputWriter(writeOutput);
  validatePlanProposalArgv(argv);
  const args = parsePlanProposalCliArgs(argv);
  validatePlanProposalEnv(env);
  validatePlanProposalDotEnvLoader(loadEnv);
  loadEnv(".env", env);
  validatePlanProposalManifestReader(readManifest);
  const manifest = await readManifest(args.manifestPath);
  const rpcUrl = env[manifest.rpcUrlEnv];
  if (rpcUrl === undefined || rpcUrl.length === 0) throw new Error(`${manifest.rpcUrlEnv} is required`);

  validatePlanProposalPublicClientFactory(createClient);
  const publicClient = createClient(rpcUrl);
  const chainId = await publicClient.getChainId();
  if (chainId !== manifest.chainId) throw new Error(`Connected to chain ${chainId}, expected ${manifest.chainId}`);

  validatePlanProposalPolicySimulatorFactory(createSimulator);
  validatePlanProposalTextReader(readText);
  validatePlanProposalParser(parsePlan);
  validatePlanProposalCreator(createProposal);
  const document = parsePlan(JSON.parse(readText(args.planPath)) as unknown);
  const proposal = await createProposal({
    agent: manifest.contracts.agentAccount,
    objective: document.objective,
    steps: document.steps,
    simulatePolicy: createSimulator(publicClient, manifest),
  });

  const output = createOutput({
    chainId,
    manifestPath: args.manifestPath,
    source: { type: "plan", path: args.planPath },
    proposal,
  });
  validateAgentProposalCliReport(output, "Plan proposal", "plan");

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
        source: { type: "plan", path: args.planPath },
        outputPath: path,
        proposal,
      });
      validateAgentProposalCliWriteSummary(summary, "Plan proposal", "plan");
      return summary;
    },
  });

  if (!proposal.executable) {
    validatePlanProposalExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parsePlanProposalCliArgs(argv: readonly string[]): PlanProposalCliArgs {
  validatePlanProposalArgv(argv);
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (arg === "--plan" || arg === "--manifest" || arg === "--output") {
      setPlanProposalOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--plan|--manifest|--output)=(.*)$/u);
    if (equals !== null) {
      setPlanProposalOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  const planPath = values.get("--plan");
  if (planPath === undefined) throw new Error("--plan is required");

  return {
    planPath,
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

  validatePlanProposalDirectoryCreator(parameters.mkdirp);
  validatePlanProposalTextWriter(parameters.writeText);
  const summary = parameters.createSummary(parameters.outputPath);
  await parameters.mkdirp(dirname(parameters.outputPath));
  await parameters.writeText(parameters.outputPath, body);
  parameters.writeOutput(JSON.stringify(summary, null, 2));
}

export function createAgentPlanningPublicClient(rpcUrl: string): { getChainId: () => Promise<number> } {
  return createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
}

export function isPlanProposalDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validatePlanProposalArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setPlanProposalOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
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

function validatePlanProposalOptions(options: unknown): asserts options is PlanProposalCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Plan proposal options must be an object");
  }
}

function validatePlanProposalArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) {
    throw new Error(message);
  }
}

function validatePlanProposalEnv(env: unknown): asserts env is Record<string, string | undefined> {
  if (typeof env !== "object" || env === null || Array.isArray(env)) {
    throw new Error("Environment must be an object");
  }
}

function validatePlanProposalOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") {
    throw new Error("Output writer must be a function");
  }
}

function validatePlanProposalExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") {
    throw new Error("Exit code setter must be a function");
  }
}

function validatePlanProposalDotEnvLoader(
  loadEnv: unknown,
): asserts loadEnv is (path: string, env: Record<string, string | undefined>) => void {
  if (typeof loadEnv !== "function") {
    throw new Error("Dotenv loader must be a function");
  }
}

function validatePlanProposalManifestReader(readManifest: unknown): asserts readManifest is (path: string) => Promise<PlanningManifest> {
  if (typeof readManifest !== "function") {
    throw new Error("Manifest reader must be a function");
  }
}

function validatePlanProposalPublicClientFactory(
  createClient: unknown,
): asserts createClient is (rpcUrl: string) => { getChainId: () => Promise<number> } {
  if (typeof createClient !== "function") {
    throw new Error("Public client factory must be a function");
  }
}

function validatePlanProposalPolicySimulatorFactory(
  createSimulator: unknown,
): asserts createSimulator is (
  publicClient: unknown,
  manifest: PlanningManifest,
) => unknown {
  if (typeof createSimulator !== "function") {
    throw new Error("Policy simulator factory must be a function");
  }
}

function validatePlanProposalTextReader(readText: unknown): asserts readText is (path: string) => string {
  if (typeof readText !== "function") {
    throw new Error("Text reader must be a function");
  }
}

function validatePlanProposalParser(parsePlan: unknown): asserts parsePlan is (value: unknown) => Record<string, unknown> {
  if (typeof parsePlan !== "function") {
    throw new Error("Plan parser must be a function");
  }
}

function validatePlanProposalCreator(
  createProposal: unknown,
): asserts createProposal is (params: unknown) => Promise<{ executable: boolean }> {
  if (typeof createProposal !== "function") {
    throw new Error("Plan proposal creator must be a function");
  }
}

function validatePlanProposalDirectoryCreator(mkdirp: unknown): asserts mkdirp is (dir: string) => Promise<void> {
  if (typeof mkdirp !== "function") {
    throw new Error("Directory creator must be a function");
  }
}

function validatePlanProposalTextWriter(
  writeText: unknown,
): asserts writeText is (path: string, contents: string) => Promise<void> {
  if (typeof writeText !== "function") {
    throw new Error("Text writer must be a function");
  }
}
