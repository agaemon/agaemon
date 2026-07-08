import { readFileSync } from "node:fs";

import { createPublicClient, createWalletClient, getAddress, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import {
  AGENT_DIRECTORY_ABI,
  createAgentProfileCommitment,
  createRegisterAgentProfileTransaction,
  createSetAgentActiveTransaction,
} from "../../agentCore/directory.js";
import { normalizePrivateKey } from "../../base/execution.js";
import { readDeploymentManifest, requireAgentDirectory, resolveDeploymentAgentProfile } from "../../base/deploymentManifest.js";
import {
  isDirectRun,
  parseValues,
  requireBoolean,
  requireNumber,
  requireObject,
  requireString,
  runInjectedOrDefault,
  validateReceiptEvidence,
  validateTransactionEvidence,
} from "./runnerShared.js";
import type { AgentCoreRunnerOptions } from "./runnerShared.js";

const DEFAULT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";

export interface AgentDirectoryCliArgs {
  send: boolean;
  register: boolean;
  activate: boolean;
  deactivate: boolean;
  manifestPath: string;
  roleLabel?: string | undefined;
  metadataURI?: string | undefined;
}

export type AgentDirectoryCliOptions = AgentCoreRunnerOptions<AgentDirectoryCliArgs>;

if (isAgentDirectoryDirectRun(import.meta.url, process.argv)) {
  await runAgentDirectoryCli();
}

export async function runAgentDirectoryCli(options: AgentDirectoryCliOptions = {}): Promise<void> {
  await runInjectedOrDefault(options, parseAgentDirectoryCliArgs, main, validateAgentDirectoryReport);
}

export function parseAgentDirectoryCliArgs(argv: readonly string[]): AgentDirectoryCliArgs {
  const values = parseValues(argv, ["--manifest", "--role-label", "--metadata-uri"], [
    "--send",
    "--register",
    "--activate",
    "--deactivate",
  ]);
  const register = values.booleans.has("--register");
  const activate = values.booleans.has("--activate");
  const deactivate = values.booleans.has("--deactivate");
  const operationCount = Number(register) + Number(activate) + Number(deactivate);
  if (operationCount > 1) throw new Error("Choose only one operation: --register, --activate, or --deactivate");
  if (values.booleans.has("--send") && operationCount === 0) {
    throw new Error("--send requires --register, --activate, or --deactivate");
  }
  return {
    send: values.booleans.has("--send"),
    register,
    activate,
    deactivate,
    manifestPath: values.options.get("--manifest") ?? DEFAULT_MANIFEST_PATH,
    roleLabel: values.options.get("--role-label"),
    metadataURI: values.options.get("--metadata-uri"),
  };
}

export function isAgentDirectoryDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  return isDirectRun(moduleUrl, argv);
}

async function main(): Promise<void> {
  loadDotEnv(".env");

  const shouldSend = process.argv.includes("--send");
  const shouldRegister = process.argv.includes("--register");
  const shouldActivate = process.argv.includes("--activate");
  const shouldDeactivate = process.argv.includes("--deactivate");
  const operationCount = Number(shouldRegister) + Number(shouldActivate) + Number(shouldDeactivate);
  if (operationCount > 1) throw new Error("Choose only one operation: --register, --activate, or --deactivate");
  if (shouldSend && operationCount === 0) throw new Error("--send requires --register, --activate, or --deactivate");

  const manifestPath = readFlag("--manifest") ?? DEFAULT_MANIFEST_PATH;
  const manifest = await readDeploymentManifest(manifestPath);
  const rpcUrl = process.env[manifest.rpcUrlEnv];
  if (rpcUrl === undefined || rpcUrl.length === 0) throw new Error(`${manifest.rpcUrlEnv} is required`);

  const directory = requireAgentDirectory(manifest);
  const agent = manifest.contracts.agentAccount;
  const expectedProfile = resolveDeploymentAgentProfile(manifest);
  const roleLabel = readFlag("--role-label") ?? expectedProfile.roleLabel;
  const metadataURI = readFlag("--metadata-uri") ?? expectedProfile.metadataURI;
  const commitment = createAgentProfileCommitment({ roleLabel, metadataURI });

  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  const chainId = await publicClient.getChainId();
  if (chainId !== manifest.chainId) throw new Error(`Connected to chain ${chainId}, expected ${manifest.chainId}`);

  const owner = (await publicClient.readContract({
    address: directory,
    abi: AGENT_DIRECTORY_ABI,
    functionName: "owner",
  })) as `0x${string}`;
  const profile = (await publicClient.readContract({
    address: directory,
    abi: AGENT_DIRECTORY_ABI,
    functionName: "profileOf",
    args: [agent],
  })) as readonly [`0x${string}`, `0x${string}`, boolean, boolean];

  const transaction = shouldRegister
    ? createRegisterAgentProfileTransaction({ directory, agent, ...commitment, active: true })
    : shouldActivate
      ? createSetAgentActiveTransaction({ directory, agent, active: true })
      : shouldDeactivate
        ? createSetAgentActiveTransaction({ directory, agent, active: false })
        : null;

  const baseOutput = {
    mode: shouldSend ? "send" : "dry-run",
    chainId,
    directory,
    owner,
    ownerMatchesManifest: getAddress(owner) === getAddress(manifest.owner),
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
  };

  if (transaction === null) {
    console.log(JSON.stringify({ ...baseOutput, operation: null, transaction: null }, null, 2));
    return;
  }

  if (getAddress(owner) !== getAddress(manifest.owner)) {
    throw new Error(`Directory owner ${owner} does not match manifest owner ${manifest.owner}`);
  }

  await publicClient.call({
    account: owner,
    to: transaction.to,
    value: transaction.value,
    data: transaction.data,
  });

  const operation = shouldRegister ? "register" : shouldActivate ? "activate" : "deactivate";
  const outputWithTransaction = {
    ...baseOutput,
    operation,
    transaction: {
      to: transaction.to,
      value: transaction.value.toString(),
      data: transaction.data,
    },
    simulation: "passed",
  };

  if (!shouldSend) {
    console.log(JSON.stringify(outputWithTransaction, null, 2));
    return;
  }

  const rawPrivateKey = process.env.PRIVATE_KEY;
  if (rawPrivateKey === undefined || rawPrivateKey.length === 0) {
    throw new Error("PRIVATE_KEY is required when --send is used");
  }

  const account = privateKeyToAccount(normalizePrivateKey(rawPrivateKey));
  if (getAddress(account.address) !== getAddress(owner)) {
    throw new Error(`PRIVATE_KEY address ${account.address} does not match directory owner ${owner}`);
  }

  const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http(rpcUrl) });
  const hash = await walletClient.sendTransaction({
    account,
    chain: baseSepolia,
    to: transaction.to,
    value: transaction.value,
    data: transaction.data,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  console.log(
    JSON.stringify(
      {
        ...outputWithTransaction,
        hash,
        explorerUrl: `${manifest.explorerUrl}/tx/${hash}`,
        receipt: {
          blockNumber: receipt.blockNumber.toString(),
          status: receipt.status,
        },
      },
      null,
      2,
    ),
  );
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

function validateAgentDirectoryReport(output: unknown): void {
  const report = requireObject(output, "Agent directory report must be an object");
  requireString(report.mode, "Agent directory report mode must be a string");
  requireNumber(report.chainId, "Agent directory report chainId must be a number");
  requireString(report.directory, "Agent directory report directory must be a string");
  requireString(report.owner, "Agent directory report owner must be a string");
  requireBoolean(report.ownerMatchesManifest, "Agent directory report ownerMatchesManifest must be a boolean");
  requireString(report.agent, "Agent directory report agent must be a string");
  requireObject(report.profile, "Agent directory profile must be an object");
  validateTransactionEvidence(report.transaction, "Agent directory");
  if (report.operation !== null && report.operation !== undefined) {
    requireString(report.operation, "Agent directory operation must be a string");
  }
  if (report.simulation !== undefined) requireString(report.simulation, "Agent directory simulation must be a string");
  if (report.hash !== undefined) {
    requireString(report.hash, "Agent directory hash must be a string");
    validateReceiptEvidence(report.receipt, "Agent directory");
  }
}
