import { readFileSync } from "node:fs";

import { createPublicClient, getAddress, http } from "viem";
import type { Address, Hex } from "viem";
import { baseSepolia } from "viem/chains";

import { AGENT_COORDINATION_ABI, ASSIGNMENT_STATUS } from "../../agentCore/coordination.js";
import { AGENT_DIRECTORY_ABI } from "../../agentCore/directory.js";
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
  validateChecksEvidence,
} from "./runnerShared.js";
import type { ReputationRunnerOptions } from "./runnerShared.js";

const DEFAULT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";
const DEFAULT_ACTION_LABEL = "agentos.kernel.directory-profile-registered";
const DEFAULT_EVIDENCE_URI = "agentos://base-sepolia/reputation-history/directory-profile/v1";
const DEFAULT_DELTA = "1";
const DEFAULT_OUTCOME_ACTION_LABEL = "agentos.coordination.assignment.completed";
const UNAUTHORIZED_CALLER = "0x000000000000000000000000000000000000dEaD";
const UNREGISTERED_AGENT = "0x000000000000000000000000000000000000bEEF";
const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

interface CallClient {
  call(parameters: { account: Address; to: Address; value: bigint; data: Hex }): Promise<unknown>;
}

interface CoordinationReadClient {
  readContract(parameters: {
    address: Address;
    abi: typeof AGENT_COORDINATION_ABI;
    functionName: "assignmentOf" | "assignmentMemoryResultOf";
    args: [bigint];
  }): Promise<unknown>;
}

export interface ReputationHistorySafetyCheckCliArgs {
  manifestPath: string;
}

export type ReputationHistorySafetyCheckCliOptions = ReputationRunnerOptions<ReputationHistorySafetyCheckCliArgs>;

if (isReputationHistorySafetyCheckDirectRun(import.meta.url, process.argv)) {
  await runReputationHistorySafetyCheckCli();
}

export async function runReputationHistorySafetyCheckCli(
  options: ReputationHistorySafetyCheckCliOptions = {},
): Promise<void> {
  await runInjectedOrDefault(
    options,
    parseReputationHistorySafetyCheckCliArgs,
    main,
    validateReputationHistorySafetyReport,
  );
}

export function parseReputationHistorySafetyCheckCliArgs(argv: readonly string[]): ReputationHistorySafetyCheckCliArgs {
  const values = parseValues(argv, ["--manifest"]);
  return { manifestPath: values.options.get("--manifest") ?? DEFAULT_MANIFEST_PATH };
}

export function isReputationHistorySafetyCheckDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  return isDirectRun(moduleUrl, argv);
}

async function main(): Promise<void> {
  loadDotEnv(".env");

  const manifestPath = readFlag("--manifest") ?? DEFAULT_MANIFEST_PATH;
  const manifest = await readDeploymentManifest(manifestPath);
  const rpcUrl = process.env[manifest.rpcUrlEnv];
  if (rpcUrl === undefined || rpcUrl.length === 0) throw new Error(`${manifest.rpcUrlEnv} is required`);

  const history = requireReputationHistory(manifest);
  const directory = requireAgentDirectory(manifest);
  const coordination = requireAgentCoordination(manifest);
  const agent = manifest.contracts.agentAccount;
  const actionLabel = process.env.REPUTATION_EVENT_ACTION_LABEL ?? DEFAULT_ACTION_LABEL;
  const evidenceURI = process.env.REPUTATION_EVENT_EVIDENCE_URI ?? DEFAULT_EVIDENCE_URI;
  const scoreDelta = parseReputationDelta(process.env.REPUTATION_EVENT_DELTA ?? DEFAULT_DELTA);
  const outcomeActionLabel = process.env.COORDINATION_OUTCOME_ACTION_LABEL ?? DEFAULT_OUTCOME_ACTION_LABEL;
  const outcomeScoreDelta = parseReputationDelta(process.env.COORDINATION_OUTCOME_REPUTATION_DELTA ?? DEFAULT_DELTA);
  const assignmentId = readEnvBigInt("COORDINATION_ASSIGNMENT_ID") ?? 0n;
  const commitment = createReputationEventCommitment({ actionLabel, evidenceURI });

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
  const coordinationOutcome = await readCompletedCoordinationOutcome(publicClient, coordination, assignmentId);

  const record = createRecordReputationEventTransaction({ history, agent, ...commitment, scoreDelta });
  const outcomeRecord = createCoordinationOutcomeReputationTransaction({
    history,
    actionLabel: outcomeActionLabel,
    scoreDelta: outcomeScoreDelta,
    ...coordinationOutcome,
  });
  const recordCallable = await callPasses(publicClient, owner, record);
  const outcomeRecordCallable = await callPasses(publicClient, owner, outcomeRecord);
  const unauthorizedOutcomeRecordDenied = !(await callPasses(publicClient, UNAUTHORIZED_CALLER, outcomeRecord));
  const unauthorizedRecordDenied = !(await callPasses(publicClient, UNAUTHORIZED_CALLER, record));
  const zeroActionDenied = !(await callPasses(
    publicClient,
    owner,
    createRecordReputationEventTransaction({
      history,
      agent,
      actionHash: ZERO_BYTES32,
      evidenceHash: commitment.evidenceHash,
      scoreDelta,
    }),
  ));
  const zeroEvidenceDenied = !(await callPasses(
    publicClient,
    owner,
    createRecordReputationEventTransaction({
      history,
      agent,
      actionHash: commitment.actionHash,
      evidenceHash: ZERO_BYTES32,
      scoreDelta,
    }),
  ));
  const zeroDeltaDenied = !(await callPasses(
    publicClient,
    owner,
    createRecordReputationEventTransaction({
      history,
      agent,
      ...commitment,
      scoreDelta: 0n,
    }),
  ));
  const unregisteredAgentDenied = !(await callPasses(
    publicClient,
    owner,
    createRecordReputationEventTransaction({
      history,
      agent: UNREGISTERED_AGENT,
      ...commitment,
      scoreDelta,
    }),
  ));

  const checks = {
    ownerMatchesManifestOwner: getAddress(owner) === getAddress(manifest.owner),
    directoryMatchesManifest: getAddress(linkedDirectory) === getAddress(directory),
    agentProfileRegistered: profile[3],
    agentProfileActive: profile[2],
    eventCountReadable: eventCount >= 0n,
    recordCallable,
    unauthorizedRecordDenied,
    zeroActionDenied,
    zeroEvidenceDenied,
    zeroDeltaDenied,
    unregisteredAgentDenied,
    coordinationOutcomeCompletedByAssignee: getAddress(coordinationOutcome.completedBy) === getAddress(coordinationOutcome.assignee),
    coordinationOutcomeRecordCallable: outcomeRecordCallable,
    unauthorizedOutcomeRecordDenied,
  };

  console.log(
    JSON.stringify(
      {
        chainId,
        history,
        owner,
        directory,
        linkedDirectory,
        coordination,
        assignmentId: assignmentId.toString(),
        agent,
        actionLabel,
        evidenceURI,
        scoreDelta: scoreDelta.toString(),
        desired: commitment,
        coordinationOutcome: {
          ...coordinationOutcome,
          assignmentId: coordinationOutcome.assignmentId.toString(),
          evidenceHash: createCoordinationOutcomeEvidenceHash(coordinationOutcome),
          actionLabel: outcomeActionLabel,
          scoreDelta: outcomeScoreDelta.toString(),
        },
        profile: {
          roleHash: profile[0],
          metadataURIHash: profile[1],
          active: profile[2],
          registered: profile[3],
        },
        eventCount: eventCount.toString(),
        checks,
      },
      null,
      2,
    ),
  );

  if (!Object.values(checks).every(Boolean)) process.exitCode = 1;
}

type AssignmentRecord = readonly [Address, Address, Hex, Hex, number, Address, Address, Hex, Hex, bigint, bigint];
type AssignmentMemoryResultRecord = readonly [Hex, Hex];

async function readCompletedCoordinationOutcome(
  client: CoordinationReadClient,
  coordination: Address,
  assignmentId: bigint,
) {
  const assignment = (await client.readContract({
    address: coordination,
    abi: AGENT_COORDINATION_ABI,
    functionName: "assignmentOf",
    args: [assignmentId],
  })) as AssignmentRecord;
  const memoryResult = (await client.readContract({
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
    completedBy: assignment[6],
    resultHash: assignment[7],
    resultMemoryId: memoryResult[0],
    resultMerkleRoot: memoryResult[1],
  };
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

function readEnvBigInt(name: string): bigint | undefined {
  const value = process.env[name];
  if (value === undefined || value.length === 0) return undefined;
  try {
    return BigInt(value);
  } catch {
    throw new Error(`${name} must be an integer`);
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

function validateReputationHistorySafetyReport(output: unknown): void {
  const report = requireObject(output, "Reputation history safety report must be an object");
  requireNumber(report.chainId, "Reputation history safety chainId must be a number");
  requireString(report.history, "Reputation history safety history must be a string");
  requireString(report.owner, "Reputation history safety owner must be a string");
  requireString(report.directory, "Reputation history safety directory must be a string");
  requireString(report.linkedDirectory, "Reputation history safety linkedDirectory must be a string");
  requireString(report.agent, "Reputation history safety agent must be a string");
  requireString(report.eventCount, "Reputation history safety eventCount must be a string");
  validateChecksEvidence(report.checks, "Reputation history safety");
}
