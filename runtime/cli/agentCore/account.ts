import { readFileSync } from "node:fs";

import { BaseError, ContractFunctionRevertedError, createPublicClient, createWalletClient, getAddress, http, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import {
  AGENT_ACCOUNT_ABI,
  createDelegateTransaction,
  createRevokeDelegateTransaction,
  createPauseTransaction,
  createUnpauseTransaction,
  resolveAgentAccountOperation,
} from "../../agentCore/account.js";
import { normalizePrivateKey } from "../../base/execution.js";
import { readDeploymentManifest } from "../../base/deploymentManifest.js";
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

interface AgentAccountReadClient {
  readContract(parameters: {
    address: `0x${string}`;
    abi: typeof AGENT_ACCOUNT_ABI;
    functionName:
      | "owner"
      | "paused"
      | "capabilities"
      | "policyEngine"
      | "reputationRegistry"
      | "reputation"
      | "delegates";
    args?: readonly [`0x${string}`];
  }): Promise<unknown>;
}

export interface AgentAccountCliArgs {
  send: boolean;
  manifestPath: string;
  delegate?: string | undefined;
  revokeDelegate?: string | undefined;
  pause: boolean;
  unpause: boolean;
}

export type AgentAccountCliOptions = AgentCoreRunnerOptions<AgentAccountCliArgs>;

if (isAgentAccountDirectRun(import.meta.url, process.argv)) {
  await runAgentAccountCli();
}

export async function runAgentAccountCli(options: AgentAccountCliOptions = {}): Promise<void> {
  await runInjectedOrDefault(options, parseAgentAccountCliArgs,
    () => main(parseAgentAccountCliArgs(options.argv ?? process.argv.slice(2))), validateAgentAccountReport);
}

export function parseAgentAccountCliArgs(argv: readonly string[]): AgentAccountCliArgs {
  const values = parseValues(argv, ["--manifest", "--delegate", "--revoke-delegate"], ["--send", "--pause", "--unpause"]);
  const delegate = readAddress(values.options.get("--delegate"), "--delegate");
  const revokeDelegate = readAddress(values.options.get("--revoke-delegate"), "--revoke-delegate");
  if (revokeDelegate === "0x0000000000000000000000000000000000000000") {
    throw new Error("--revoke-delegate must be a nonzero address");
  }
  const pause = values.booleans.has("--pause");
  const unpause = values.booleans.has("--unpause");
  resolveAgentAccountOperation({ delegate, revokeDelegate, pause, unpause, send: values.booleans.has("--send") });
  return {
    send: values.booleans.has("--send"),
    manifestPath: values.options.get("--manifest") ?? DEFAULT_MANIFEST_PATH,
    delegate,
    ...(revokeDelegate === undefined ? {} : { revokeDelegate }),
    pause,
    unpause,
  };
}

export function isAgentAccountDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  return isDirectRun(moduleUrl, argv);
}

async function main(args: AgentAccountCliArgs): Promise<void> {
  loadDotEnv(".env");

  const shouldSend = args.send;
  const manifestPath = args.manifestPath;
  const manifest = await readDeploymentManifest(manifestPath);
  const rpcUrl = process.env[manifest.rpcUrlEnv];
  if (rpcUrl === undefined || rpcUrl.length === 0) throw new Error(`${manifest.rpcUrlEnv} is required`);

  const agent = manifest.contracts.agentAccount;
  const delegate = readAddress(args.delegate, "--delegate");
  const revokeDelegate = readAddress(args.revokeDelegate, "--revoke-delegate");
  const envDelegate = readOptionalEnvAddress("AGENT_DELEGATE");
  const shouldPause = args.pause;
  const shouldUnpause = args.unpause;
  const operation = resolveAgentAccountOperation({
    delegate,
    revokeDelegate,
    envDelegate,
    pause: shouldPause,
    send: shouldSend,
    unpause: shouldUnpause,
  });

  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  const chainId = await publicClient.getChainId();
  if (chainId !== manifest.chainId) throw new Error(`Connected to chain ${chainId}, expected ${manifest.chainId}`);

  const state = await readAgentState(publicClient, manifest, revokeDelegate ?? delegate ?? envDelegate);
  const baseOutput = {
    mode: shouldSend ? "send" : "dry-run",
    chainId,
    agent,
    ...state,
    ...(operation?.name === "revokeDelegate"
      ? { delegateAllowed: undefined, delegateAllowedBefore: state.delegateAllowed }
      : {}),
  };

  const transaction =
    operation?.name === "delegate"
      ? createDelegateTransaction({ agent, delegate: operation.delegate })
      : operation?.name === "revokeDelegate"
        ? createRevokeDelegateTransaction({ agent, delegate: operation.delegate })
        : operation?.name === "pause"
          ? createPauseTransaction({ agent })
          : operation?.name === "unpause"
            ? createUnpauseTransaction({ agent })
            : null;

  if (transaction === null) {
    console.log(JSON.stringify({ ...baseOutput, operation: null, transaction: null }, null, 2));
    return;
  }
  if (operation === null) throw new Error("Missing agent account operation");

  if (getAddress(state.owner) !== getAddress(manifest.owner)) {
    throw new Error(`Agent owner ${state.owner} does not match manifest owner ${manifest.owner}`);
  }

  if (operation.name === "revokeDelegate") {
    try {
      await publicClient.simulateContract({
        address: agent, abi: AGENT_ACCOUNT_ABI, functionName: "revokeDelegate",
        args: [operation.delegate], account: state.owner,
      });
    } catch (error) {
      const revert = error instanceof BaseError
        ? error.walk((cause) => cause instanceof ContractFunctionRevertedError)
        : undefined;
      if (revert instanceof ContractFunctionRevertedError) {
        throw new Error("Revocation preflight reverted; verify that this account supports revokeDelegate. No transaction sent.", { cause: error });
      }
      throw error;
    }
  } else {
    await publicClient.call({
      account: state.owner,
      to: transaction.to,
      value: transaction.value,
      data: transaction.data,
    });
  }

  const outputWithTransaction = {
    ...baseOutput,
    operation: operation.name,
    delegate: operation.name === "delegate" || operation.name === "revokeDelegate" ? operation.delegate : undefined,
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
  if (getAddress(account.address) !== getAddress(state.owner)) {
    throw new Error(`PRIVATE_KEY address ${account.address} does not match agent owner ${state.owner}`);
  }

  const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http(rpcUrl) });
  const hash = await walletClient.sendTransaction({
    account,
    chain: baseSepolia,
    to: transaction.to,
    value: transaction.value,
    data: transaction.data,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash }).catch((error: unknown) => {
    if (operation.name === "revokeDelegate") {
      throw new Error(`Revocation transaction ${hash} receipt could not be obtained; confirmation is unknown`, { cause: error });
    }
    throw error;
  });
  if (operation.name === "revokeDelegate") {
    if (receipt.status !== "success") throw new Error(`Revocation transaction ${hash} reverted`);
    try {
      const allowed = await publicClient.readContract({
        address: agent, abi: AGENT_ACCOUNT_ABI, functionName: "delegates",
        args: [operation.delegate], blockNumber: receipt.blockNumber,
      });
      if (allowed !== false) throw new Error("Delegate remains authorized");
    } catch (error) {
      throw new Error(`Revocation transaction ${hash} could not be verified; inspect receipt and delegate state`, { cause: error });
    }
  }

  console.log(
    JSON.stringify(
      {
        ...outputWithTransaction,
        hash,
        ...(operation.name === "revokeDelegate" ? {
          delegateAllowedAfter: false,
          revocationConfirmed: true,
          verifiedAtBlock: receipt.blockNumber.toString(),
        } : {}),
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

async function readAgentState(
  client: AgentAccountReadClient,
  manifest: Awaited<ReturnType<typeof readDeploymentManifest>>,
  delegate: `0x${string}` | undefined,
): Promise<{
  owner: `0x${string}`;
  paused: boolean;
  capabilities: `0x${string}`;
  policyEngine: `0x${string}`;
  reputationRegistry: `0x${string}`;
  reputation: string;
  delegateAllowed?: boolean;
}> {
  const agent = manifest.contracts.agentAccount;
  const [owner, paused, capabilities, policyEngine, reputationRegistry, reputation] = await Promise.all([
    client.readContract({ address: agent, abi: AGENT_ACCOUNT_ABI, functionName: "owner" }) as Promise<`0x${string}`>,
    client.readContract({ address: agent, abi: AGENT_ACCOUNT_ABI, functionName: "paused" }) as Promise<boolean>,
    client.readContract({ address: agent, abi: AGENT_ACCOUNT_ABI, functionName: "capabilities" }) as Promise<`0x${string}`>,
    client.readContract({ address: agent, abi: AGENT_ACCOUNT_ABI, functionName: "policyEngine" }) as Promise<`0x${string}`>,
    client.readContract({ address: agent, abi: AGENT_ACCOUNT_ABI, functionName: "reputationRegistry" }) as Promise<`0x${string}`>,
    client.readContract({ address: agent, abi: AGENT_ACCOUNT_ABI, functionName: "reputation" }) as Promise<bigint>,
  ]);

  const state = {
    owner,
    paused,
    capabilities,
    policyEngine,
    reputationRegistry,
    reputation: reputation.toString(),
  };

  if (delegate === undefined) return state;

  const delegateAllowed = (await client.readContract({
    address: agent,
    abi: AGENT_ACCOUNT_ABI,
    functionName: "delegates",
    args: [delegate],
  })) as boolean;

  return { ...state, delegateAllowed };
}

function readAddress(value: string | undefined, name: string): `0x${string}` | undefined {
  if (value === undefined) return undefined;
  if (!isAddress(value)) throw new Error(`${name} must be an address`);
  return value;
}

function readOptionalEnvAddress(name: string): `0x${string}` | undefined {
  const value = process.env[name];
  if (value === undefined || value.length === 0) return undefined;
  if (!isAddress(value)) throw new Error(`${name} must be an address`);
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

function validateAgentAccountReport(output: unknown): void {
  const report = requireObject(output, "Agent account report must be an object");
  requireString(report.mode, "Agent account report mode must be a string");
  requireNumber(report.chainId, "Agent account report chainId must be a number");
  requireString(report.agent, "Agent account report agent must be a string");
  requireString(report.owner, "Agent account report owner must be a string");
  requireBoolean(report.paused, "Agent account report paused must be a boolean");
  requireString(report.capabilities, "Agent account report capabilities must be a string");
  requireString(report.policyEngine, "Agent account report policyEngine must be a string");
  requireString(report.reputationRegistry, "Agent account report reputationRegistry must be a string");
  requireString(report.reputation, "Agent account report reputation must be a string");
  validateTransactionEvidence(report.transaction, "Agent account");
  if (report.operation !== null && report.operation !== undefined) {
    requireString(report.operation, "Agent account operation must be a string");
  }
  if (report.simulation !== undefined) requireString(report.simulation, "Agent account simulation must be a string");
  if (report.hash !== undefined) {
    requireString(report.hash, "Agent account hash must be a string");
    validateReceiptEvidence(report.receipt, "Agent account");
  }
}
