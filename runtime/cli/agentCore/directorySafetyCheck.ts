import { readFileSync } from "node:fs";

import { createPublicClient, getAddress, http } from "viem";
import type { Address, Hex } from "viem";
import { baseSepolia } from "viem/chains";

import {
  AGENT_DIRECTORY_ABI,
  createAgentProfileCommitment,
  createRegisterAgentProfileTransaction,
  createSetAgentActiveTransaction,
} from "../../agentCore/directory.js";
import { readDeploymentManifest, requireAgentDirectory, resolveDeploymentAgentProfile } from "../../base/deploymentManifest.js";
import {
  isDirectRun,
  parseValues,
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
const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

interface CallClient {
  call(parameters: { account: Address; to: Address; value: bigint; data: Hex }): Promise<unknown>;
}

export interface AgentDirectorySafetyCheckCliArgs {
  manifestPath: string;
}

export type AgentDirectorySafetyCheckCliOptions = AgentCoreRunnerOptions<AgentDirectorySafetyCheckCliArgs>;

if (isAgentDirectorySafetyCheckDirectRun(import.meta.url, process.argv)) {
  await runAgentDirectorySafetyCheckCli();
}

export async function runAgentDirectorySafetyCheckCli(
  options: AgentDirectorySafetyCheckCliOptions = {},
): Promise<void> {
  await runInjectedOrDefault(options, parseAgentDirectorySafetyCheckCliArgs, main, validateAgentDirectorySafetyReport);
}

export function parseAgentDirectorySafetyCheckCliArgs(argv: readonly string[]): AgentDirectorySafetyCheckCliArgs {
  const values = parseValues(argv, ["--manifest"]);
  return { manifestPath: values.options.get("--manifest") ?? DEFAULT_MANIFEST_PATH };
}

export function isAgentDirectorySafetyCheckDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  return isDirectRun(moduleUrl, argv);
}

async function main(): Promise<void> {
  loadDotEnv(".env");

  const manifestPath = readFlag("--manifest") ?? DEFAULT_MANIFEST_PATH;
  const manifest = await readDeploymentManifest(manifestPath);
  const rpcUrl = process.env[manifest.rpcUrlEnv];
  if (rpcUrl === undefined || rpcUrl.length === 0) throw new Error(`${manifest.rpcUrlEnv} is required`);

  const directory = requireAgentDirectory(manifest);
  const agent = manifest.contracts.agentAccount;
  const { roleLabel, metadataURI } = resolveDeploymentAgentProfile(manifest);
  const commitment = createAgentProfileCommitment({ roleLabel, metadataURI });

  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  const chainId = await publicClient.getChainId();
  if (chainId !== manifest.chainId) throw new Error(`Connected to chain ${chainId}, expected ${manifest.chainId}`);

  const owner = (await publicClient.readContract({
    address: directory,
    abi: AGENT_DIRECTORY_ABI,
    functionName: "owner",
  })) as Address;
  const profile = (await publicClient.readContract({
    address: directory,
    abi: AGENT_DIRECTORY_ABI,
    functionName: "profileOf",
    args: [agent],
  })) as readonly [Hex, Hex, boolean, boolean];

  const register = createRegisterAgentProfileTransaction({ directory, agent, ...commitment, active: true });
  const unauthorizedRegisterDenied = !(await callPasses(publicClient, UNAUTHORIZED_CALLER, register));
  const registerCallable = await callPasses(publicClient, owner, register);
  const setInactiveCallable = await callPasses(
    publicClient,
    owner,
    createSetAgentActiveTransaction({ directory, agent, active: false }),
  );
  const zeroAgentDenied = !(await callPasses(
    publicClient,
    owner,
    createRegisterAgentProfileTransaction({
      directory,
      agent: ZERO_ADDRESS,
      ...commitment,
      active: true,
    }),
  ));
  const zeroMetadataDenied = !(await callPasses(
    publicClient,
    owner,
    createRegisterAgentProfileTransaction({
      directory,
      agent,
      roleHash: commitment.roleHash,
      metadataURIHash: ZERO_BYTES32,
      active: true,
    }),
  ));

  const checks = {
    ownerMatchesManifestOwner: getAddress(owner) === getAddress(manifest.owner),
    profileRegistered: profile[3],
    profileActive: profile[2],
    roleHashMatches: profile[0] === commitment.roleHash,
    metadataURIHashMatches: profile[1] === commitment.metadataURIHash,
    registerCallable,
    setInactiveCallable,
    unauthorizedRegisterDenied,
    zeroAgentDenied,
    zeroMetadataDenied,
  };

  console.log(
    JSON.stringify(
      {
        chainId,
        directory,
        owner,
        agent,
        roleLabel,
        metadataURI,
        desired: commitment,
        profile: {
          roleHash: profile[0],
          metadataURIHash: profile[1],
          active: profile[2],
          registered: profile[3],
        },
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

function validateAgentDirectorySafetyReport(output: unknown): void {
  const report = requireObject(output, "Agent directory safety report must be an object");
  requireNumber(report.chainId, "Agent directory safety chainId must be a number");
  requireString(report.directory, "Agent directory safety directory must be a string");
  requireString(report.owner, "Agent directory safety owner must be a string");
  requireString(report.agent, "Agent directory safety agent must be a string");
  if (report.roleLabel !== undefined) requireString(report.roleLabel, "Agent directory safety roleLabel must be a string");
  if (report.metadataURI !== undefined) {
    requireString(report.metadataURI, "Agent directory safety metadataURI must be a string");
  }
  requireObject(report.profile, "Agent directory safety profile must be an object");
  validateChecksEvidence(report.checks, "Agent directory safety");
}
