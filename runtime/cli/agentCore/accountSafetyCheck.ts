import { readFileSync } from "node:fs";

import { createPublicClient, getAddress, http } from "viem";
import type { Address, Hex } from "viem";
import { baseSepolia } from "viem/chains";

import {
  AGENT_ACCOUNT_ABI,
  createDelegateTransaction,
  createPauseTransaction,
  createUnpauseTransaction,
} from "../../agentCore/account.js";
import { readDeploymentManifest } from "../../base/deploymentManifest.js";
import {
  isDirectRun,
  parseValues,
  requireBoolean,
  requireNumber,
  requireObject,
  requireString,
  runInjectedOrDefault,
  validateChecksEvidence,
} from "./runnerShared.js";
import type { AgentCoreRunnerOptions } from "./runnerShared.js";

const DEFAULT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";
const UNAUTHORIZED_CALLER = "0x000000000000000000000000000000000000dEaD";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

interface CallClient {
  call(parameters: { account: Address; to: Address; value: bigint; data: Hex }): Promise<unknown>;
}

export interface AgentAccountSafetyCheckCliArgs {
  manifestPath: string;
}

export type AgentAccountSafetyCheckCliOptions = AgentCoreRunnerOptions<AgentAccountSafetyCheckCliArgs>;

if (isAgentAccountSafetyCheckDirectRun(import.meta.url, process.argv)) {
  await runAgentAccountSafetyCheckCli();
}

export async function runAgentAccountSafetyCheckCli(options: AgentAccountSafetyCheckCliOptions = {}): Promise<void> {
  await runInjectedOrDefault(options, parseAgentAccountSafetyCheckCliArgs, main, validateAgentAccountSafetyReport);
}

export function parseAgentAccountSafetyCheckCliArgs(argv: readonly string[]): AgentAccountSafetyCheckCliArgs {
  const values = parseValues(argv, ["--manifest"]);
  return { manifestPath: values.options.get("--manifest") ?? DEFAULT_MANIFEST_PATH };
}

export function isAgentAccountSafetyCheckDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  return isDirectRun(moduleUrl, argv);
}

async function main(): Promise<void> {
  loadDotEnv(".env");

  const manifestPath = readFlag("--manifest") ?? DEFAULT_MANIFEST_PATH;
  const manifest = await readDeploymentManifest(manifestPath);
  const rpcUrl = process.env[manifest.rpcUrlEnv];
  if (rpcUrl === undefined || rpcUrl.length === 0) throw new Error(`${manifest.rpcUrlEnv} is required`);

  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  const chainId = await publicClient.getChainId();
  if (chainId !== manifest.chainId) throw new Error(`Connected to chain ${chainId}, expected ${manifest.chainId}`);

  const agent = manifest.contracts.agentAccount;
  const owner = (await publicClient.readContract({
    address: agent,
    abi: AGENT_ACCOUNT_ABI,
    functionName: "owner",
  })) as Address;
  const paused = (await publicClient.readContract({
    address: agent,
    abi: AGENT_ACCOUNT_ABI,
    functionName: "paused",
  })) as boolean;
  const capabilities = (await publicClient.readContract({
    address: agent,
    abi: AGENT_ACCOUNT_ABI,
    functionName: "capabilities",
  })) as Address;
  const policyEngine = (await publicClient.readContract({
    address: agent,
    abi: AGENT_ACCOUNT_ABI,
    functionName: "policyEngine",
  })) as Address;
  const reputationRegistry = (await publicClient.readContract({
    address: agent,
    abi: AGENT_ACCOUNT_ABI,
    functionName: "reputationRegistry",
  })) as Address;
  const reputation = (await publicClient.readContract({
    address: agent,
    abi: AGENT_ACCOUNT_ABI,
    functionName: "reputation",
  })) as bigint;

  const delegateCandidate = owner;
  const delegateCallable = await callPasses(
    publicClient,
    owner,
    createDelegateTransaction({ agent, delegate: delegateCandidate }),
  );
  const pauseCallable = await callPasses(publicClient, owner, createPauseTransaction({ agent }));
  const unpauseCallable = await callPasses(publicClient, owner, createUnpauseTransaction({ agent }));
  const unauthorizedPauseDenied = !(await callPasses(publicClient, UNAUTHORIZED_CALLER, createPauseTransaction({ agent })));
  const zeroDelegateDenied = !(await callPasses(
    publicClient,
    owner,
    createDelegateTransaction({ agent, delegate: ZERO_ADDRESS }),
  ));

  const checks = {
    ownerMatchesManifestOwner: getAddress(owner) === getAddress(manifest.owner),
    capabilitiesMatchManifest: getAddress(capabilities) === getAddress(manifest.contracts.capabilityRegistry),
    policyEngineMatchesManifest: getAddress(policyEngine) === getAddress(manifest.contracts.policyEngine),
    reputationRegistryMatchesManifest: getAddress(reputationRegistry) === getAddress(manifest.contracts.reputationRegistry),
    delegateCallable,
    pauseCallable,
    unpauseCallable,
    unauthorizedPauseDenied,
    zeroDelegateDenied,
  };

  console.log(
    JSON.stringify(
      {
        chainId,
        agent,
        owner,
        paused,
        capabilities,
        policyEngine,
        reputationRegistry,
        reputation: reputation.toString(),
        checks,
      },
      null,
      2,
    ),
  );

  if (!Object.values(checks).every(Boolean)) process.exitCode = 1;
}

async function callPasses(client: CallClient, account: Address, transaction: { to: Address; value: bigint; data: Hex }) {
  try {
    await client.call({
      account,
      to: transaction.to,
      value: transaction.value,
      data: transaction.data,
    });
    return true;
  } catch {
    return false;
  }
}

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
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

function validateAgentAccountSafetyReport(output: unknown): void {
  const report = requireObject(output, "Agent account safety report must be an object");
  requireNumber(report.chainId, "Agent account safety chainId must be a number");
  requireString(report.agent, "Agent account safety agent must be a string");
  requireString(report.owner, "Agent account safety owner must be a string");
  requireBoolean(report.paused, "Agent account safety paused must be a boolean");
  requireString(report.capabilities, "Agent account safety capabilities must be a string");
  requireString(report.policyEngine, "Agent account safety policyEngine must be a string");
  requireString(report.reputationRegistry, "Agent account safety reputationRegistry must be a string");
  requireString(report.reputation, "Agent account safety reputation must be a string");
  validateChecksEvidence(report.checks, "Agent account safety");
}
