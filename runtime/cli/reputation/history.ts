import { readFileSync } from "node:fs";

import { createPublicClient, createWalletClient, getAddress, http, isAddress, keccak256, stringToHex } from "viem";
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import { AGENT_COORDINATION_ABI, ASSIGNMENT_STATUS } from "../../agentCore/coordination.js";
import { AGENT_DIRECTORY_ABI } from "../../agentCore/directory.js";
import { normalizePrivateKey } from "../../base/execution.js";
import {
  readDeploymentManifest,
  requireAgentCoordination,
  requireAgentDirectory,
  requireReputationHistory,
} from "../../base/deploymentManifest.js";
import { parseReputationDelta } from "../../reputation/registry.js";
import {
  createCoordinationOutcomeEvidenceHash,
  createCoordinationOutcomeReputationTransaction,
  createRecordReputationEventTransaction,
  createReputationEventCommitment,
  REPUTATION_HISTORY_ABI,
} from "../../reputation/history.js";
import {
  isDirectRun,
  parseValues,
  requireNumber,
  requireObject,
  requireString,
  runInjectedOrDefault,
  validateReceiptEvidence,
  validateTransactionEvidence,
} from "./runnerShared.js";
import type { ReputationRunnerOptions } from "./runnerShared.js";

const DEFAULT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";
const DEFAULT_ACTION_LABEL = "agentos.kernel.directory-profile-registered";
const DEFAULT_EVIDENCE_URI = "agentos://base-sepolia/reputation-history/directory-profile/v1";
const DEFAULT_DELTA = "1";
const DEFAULT_OUTCOME_ACTION_LABEL = "agentos.coordination.assignment.completed";

export interface ReputationHistoryCliArgs {
  send: boolean;
  record: boolean;
  recordCoordinationOutcome: boolean;
  manifestPath: string;
  agent?: string | undefined;
  actionLabel?: string | undefined;
  evidenceURI?: string | undefined;
  delta?: string | undefined;
  outcomeActionLabel?: string | undefined;
  assignmentId?: string | undefined;
}

export type ReputationHistoryCliOptions = ReputationRunnerOptions<ReputationHistoryCliArgs>;

if (isReputationHistoryDirectRun(import.meta.url, process.argv)) {
  await runReputationHistoryCli();
}

export async function runReputationHistoryCli(options: ReputationHistoryCliOptions = {}): Promise<void> {
  await runInjectedOrDefault(options, parseReputationHistoryCliArgs, main, validateReputationHistoryReport);
}

export function parseReputationHistoryCliArgs(argv: readonly string[]): ReputationHistoryCliArgs {
  const values = parseValues(
    argv,
    ["--manifest", "--agent", "--action-label", "--evidence-uri", "--delta", "--outcome-action-label", "--assignment-id"],
    ["--send", "--record", "--record-coordination-outcome"],
  );
  const record = values.booleans.has("--record");
  const recordCoordinationOutcome = values.booleans.has("--record-coordination-outcome");
  if (record && recordCoordinationOutcome) throw new Error("choose only one action: --record or --record-coordination-outcome");
  if (values.booleans.has("--send") && !record && !recordCoordinationOutcome) {
    throw new Error("--send requires --record or --record-coordination-outcome");
  }
  return {
    send: values.booleans.has("--send"),
    record,
    recordCoordinationOutcome,
    manifestPath: values.options.get("--manifest") ?? DEFAULT_MANIFEST_PATH,
    agent: values.options.get("--agent"),
    actionLabel: values.options.get("--action-label"),
    evidenceURI: values.options.get("--evidence-uri"),
    delta: values.options.get("--delta"),
    outcomeActionLabel: values.options.get("--outcome-action-label"),
    assignmentId: values.options.get("--assignment-id"),
  };
}

export function isReputationHistoryDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  return isDirectRun(moduleUrl, argv);
}

async function main(): Promise<void> {
  loadDotEnv(".env");

  const shouldSend = process.argv.includes("--send");
  const shouldRecord = process.argv.includes("--record");
  const shouldRecordCoordinationOutcome = process.argv.includes("--record-coordination-outcome");
  if (shouldRecord && shouldRecordCoordinationOutcome) {
    throw new Error("choose only one action: --record or --record-coordination-outcome");
  }
  if (shouldSend && !shouldRecord && !shouldRecordCoordinationOutcome) {
    throw new Error("--send requires --record or --record-coordination-outcome");
  }

  const manifestPath = readFlag("--manifest") ?? DEFAULT_MANIFEST_PATH;
  const manifest = await readDeploymentManifest(manifestPath);
  const rpcUrl = process.env[manifest.rpcUrlEnv];
  if (rpcUrl === undefined || rpcUrl.length === 0) throw new Error(`${manifest.rpcUrlEnv} is required`);

  const history = requireReputationHistory(manifest);
  const directory = requireAgentDirectory(manifest);
  const coordination = shouldRecordCoordinationOutcome ? requireAgentCoordination(manifest) : null;
  const actionLabel = readFlag("--action-label") ?? process.env.REPUTATION_EVENT_ACTION_LABEL ?? DEFAULT_ACTION_LABEL;
  const evidenceURI = readFlag("--evidence-uri") ?? process.env.REPUTATION_EVENT_EVIDENCE_URI ?? DEFAULT_EVIDENCE_URI;
  const commitment = createReputationEventCommitment({ actionLabel, evidenceURI });
  const outcomeActionLabel =
    readFlag("--outcome-action-label") ?? process.env.COORDINATION_OUTCOME_ACTION_LABEL ?? DEFAULT_OUTCOME_ACTION_LABEL;
  const assignmentId = readBigIntFlag("--assignment-id") ?? readEnvBigInt("COORDINATION_ASSIGNMENT_ID");
  if (shouldRecordCoordinationOutcome && assignmentId === undefined) {
    throw new Error("COORDINATION_ASSIGNMENT_ID or --assignment-id is required for coordination outcome events");
  }

  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  const chainId = await publicClient.getChainId();
  if (chainId !== manifest.chainId) throw new Error(`Connected to chain ${chainId}, expected ${manifest.chainId}`);

  const owner = (await publicClient.readContract({
    address: history,
    abi: REPUTATION_HISTORY_ABI,
    functionName: "owner",
  })) as Address;
  const linkedDirectory = (await publicClient.readContract({
    address: history,
    abi: REPUTATION_HISTORY_ABI,
    functionName: "agentDirectory",
  })) as Address;
  const coordinationOutcome = coordination === null || assignmentId === undefined
    ? null
    : await readCompletedCoordinationOutcome(publicClient, coordination, assignmentId);
  const agent = shouldRecordCoordinationOutcome
    ? coordinationOutcome!.assignee
    : readAddressFlag("--agent") ?? manifest.contracts.agentAccount;
  const profile = (await publicClient.readContract({
    address: directory,
    abi: AGENT_DIRECTORY_ABI,
    functionName: "profileOf",
    args: [agent],
  })) as readonly [Hex, Hex, boolean, boolean];
  const eventCount = (await publicClient.readContract({
    address: history,
    abi: REPUTATION_HISTORY_ABI,
    functionName: "eventCountOf",
    args: [agent],
  })) as bigint;
  const latestEvent = eventCount === 0n
    ? null
    : formatEvent((await publicClient.readContract({
        address: history,
        abi: REPUTATION_HISTORY_ABI,
        functionName: "eventOf",
        args: [agent, eventCount - 1n],
      })) as readonly [Hex, Hex, bigint, bigint]);

  const baseOutput = {
    mode: shouldSend ? "send" : "dry-run",
    chainId,
    history,
    owner,
    ownerMatchesManifest: getAddress(owner) === getAddress(manifest.owner),
    directory,
    linkedDirectory,
    directoryMatchesManifest: getAddress(linkedDirectory) === getAddress(directory),
    coordination,
    assignmentId: assignmentId?.toString() ?? null,
    agent,
    actionLabel,
    evidenceURI,
    desired: commitment,
    coordinationOutcome: coordinationOutcome === null ? null : formatCoordinationOutcome(coordinationOutcome),
    profile: {
      roleHash: profile[0],
      metadataURIHash: profile[1],
      active: profile[2],
      registered: profile[3],
    },
    eventCount: eventCount.toString(),
    latestEvent,
  };

  if (!shouldRecord && !shouldRecordCoordinationOutcome) {
    console.log(JSON.stringify({ ...baseOutput, transaction: null }, null, 2));
    return;
  }

  if (getAddress(owner) !== getAddress(manifest.owner)) {
    throw new Error(`History owner ${owner} does not match manifest owner ${manifest.owner}`);
  }
  if (getAddress(linkedDirectory) !== getAddress(directory)) {
    throw new Error(`History directory ${linkedDirectory} does not match manifest directory ${directory}`);
  }

  const delta = parseReputationDelta(
    readFlag("--delta")
      ?? (shouldRecordCoordinationOutcome
        ? process.env.COORDINATION_OUTCOME_REPUTATION_DELTA
        : process.env.REPUTATION_EVENT_DELTA)
      ?? DEFAULT_DELTA,
  );
  const transaction = shouldRecordCoordinationOutcome
    ? createCoordinationOutcomeReputationTransaction({
        history,
        actionLabel: outcomeActionLabel,
        scoreDelta: delta,
        ...coordinationOutcome!,
      })
    : createRecordReputationEventTransaction({
        history,
        agent,
        ...commitment,
        scoreDelta: delta,
      });
  await publicClient.call({
    account: owner,
    to: transaction.to,
    value: transaction.value,
    data: transaction.data,
  });

  const outputWithTransaction = {
    ...baseOutput,
    operation: shouldRecordCoordinationOutcome ? "record-coordination-outcome" : "record",
    scoreDelta: delta.toString(),
    outcomeCommitment:
      shouldRecordCoordinationOutcome && coordinationOutcome !== null
        ? {
            actionHash: keccak256(stringToHex(outcomeActionLabel)),
            actionLabel: outcomeActionLabel,
            evidenceHash: createCoordinationOutcomeEvidenceHash(coordinationOutcome),
          }
        : null,
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
    throw new Error(`PRIVATE_KEY address ${account.address} does not match reputation history owner ${owner}`);
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
  const nextEventCount = (await publicClient.readContract({
    address: history,
    abi: REPUTATION_HISTORY_ABI,
    functionName: "eventCountOf",
    args: [agent],
    blockNumber: receipt.blockNumber,
  })) as bigint;

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
        nextEventCount: nextEventCount.toString(),
      },
      null,
      2,
    ),
  );
}

type AssignmentRecord = readonly [Address, Address, Hex, Hex, number, Address, Address, Hex, Hex, bigint, bigint];
type AssignmentMemoryResultRecord = readonly [Hex, Hex];

interface CoordinationReadClient {
  readContract(parameters: {
    address: Address;
    abi: typeof AGENT_COORDINATION_ABI;
    functionName: "assignmentOf" | "assignmentMemoryResultOf";
    args: [bigint];
  }): Promise<unknown>;
}

async function readCompletedCoordinationOutcome(
  publicClient: CoordinationReadClient,
  coordination: Address,
  assignmentId: bigint,
) {
  const assignment = (await publicClient.readContract({
    address: coordination,
    abi: AGENT_COORDINATION_ABI,
    functionName: "assignmentOf",
    args: [assignmentId],
  })) as AssignmentRecord;
  const memoryResult = (await publicClient.readContract({
    address: coordination,
    abi: AGENT_COORDINATION_ABI,
    functionName: "assignmentMemoryResultOf",
    args: [assignmentId],
  })) as AssignmentMemoryResultRecord;

  if (assignment[4] !== ASSIGNMENT_STATUS.Completed) throw new Error("coordination assignment must be completed");
  if (getAddress(assignment[6]) !== getAddress(assignment[1])) {
    throw new Error("coordination assignment must be completed by the assignee");
  }

  return {
    coordination,
    assignmentId,
    assignee: assignment[1],
    resultHash: assignment[7],
    resultMemoryId: memoryResult[0],
    resultMerkleRoot: memoryResult[1],
  };
}

function formatEvent(event: readonly [Hex, Hex, bigint, bigint]) {
  return {
    actionHash: event[0],
    evidenceHash: event[1],
    scoreDelta: event[2].toString(),
    timestamp: event[3].toString(),
  };
}

function formatCoordinationOutcome(outcome: Awaited<ReturnType<typeof readCompletedCoordinationOutcome>>) {
  return {
    ...outcome,
    assignmentId: outcome.assignmentId.toString(),
  };
}

function readEnvBigInt(name: string): bigint | undefined {
  const value = process.env[name];
  if (value === undefined || value.length === 0) return undefined;
  return parseBigInt(name, value);
}

function readBigIntFlag(name: string): bigint | undefined {
  const value = readFlag(name);
  if (value === undefined) return undefined;
  return parseBigInt(name, value);
}

function parseBigInt(name: string, value: string): bigint {
  try {
    return BigInt(value);
  } catch {
    throw new Error(`${name} must be an integer`);
  }
}

function readAddressFlag(name: string): Address | undefined {
  const value = readFlag(name);
  if (value === undefined) return undefined;
  if (!isAddress(value)) throw new Error(`${name} must be an address`);
  return value;
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

function validateReputationHistoryReport(output: unknown): void {
  const report = requireObject(output, "Reputation history report must be an object");
  requireString(report.mode, "Reputation history report mode must be a string");
  requireNumber(report.chainId, "Reputation history report chainId must be a number");
  requireString(report.history, "Reputation history report history must be a string");
  requireString(report.owner, "Reputation history report owner must be a string");
  requireString(report.directory, "Reputation history report directory must be a string");
  requireString(report.linkedDirectory, "Reputation history report linkedDirectory must be a string");
  requireString(report.agent, "Reputation history report agent must be a string");
  requireString(report.eventCount, "Reputation history report eventCount must be a string");
  validateTransactionEvidence(report.transaction, "Reputation history");
  if (report.operation !== undefined) requireString(report.operation, "Reputation history operation must be a string");
  if (report.scoreDelta !== undefined) requireString(report.scoreDelta, "Reputation history scoreDelta must be a string");
  if (report.simulation !== undefined) requireString(report.simulation, "Reputation history simulation must be a string");
  if (report.hash !== undefined) {
    requireString(report.hash, "Reputation history hash must be a string");
    validateReceiptEvidence(report.receipt, "Reputation history");
    requireString(report.nextEventCount, "Reputation history nextEventCount must be a string");
  }
}
