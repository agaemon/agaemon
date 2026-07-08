import { readFileSync } from "node:fs";

import { createPublicClient, getAddress, http } from "viem";
import type { Address, Hex } from "viem";
import { baseSepolia } from "viem/chains";

import {
  AGENT_COORDINATION_ABI,
  createAcceptCoordinationAssignmentTransaction,
  createAgentCoordinationCommitment,
  createCancelCoordinationAssignmentTransaction,
  createCoordinationAcceptanceAction,
  createCoordinationAssignmentTransaction,
  createCoordinationCompletionAction,
  createCoordinationEvidenceHash,
  createCoordinationMemoryCompletionAction,
  createCoordinationMemoryResultHash,
  createCompleteCoordinationAssignmentTransaction,
} from "../../agentCore/coordination.js";
import { AGENT_DIRECTORY_ABI } from "../../agentCore/directory.js";
import { createOnChainPolicySimulator } from "../../base/execution.js";
import {
  readDeploymentManifest,
  requireAgentCoordination,
  requireAgentDirectory,
  requireMemoryRegistry,
  requireReputationHistory,
} from "../../base/deploymentManifest.js";
import { createSingleLeafMemoryCommitment, MEMORY_REGISTRY_ABI } from "../../memory/commitment.js";
import { REPUTATION_HISTORY_ABI } from "../../reputation/history.js";
import { buildExecuteTransaction } from "../../transactions/builder.js";
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
const DEFAULT_TASK_LABEL = "agentos.kernel.directory-profile-audit";
const DEFAULT_CONTEXT_URI = "agentos://base-sepolia/coordination/directory-profile-audit/v1";
const DEFAULT_RESULT_URI = "agentos://base-sepolia/coordination/directory-profile-audit/result/v1";
const DEFAULT_CANCELLATION_URI = "agentos://base-sepolia/coordination/directory-profile-audit/cancelled/v1";
const DEFAULT_RESULT_MEMORY_ID_LABEL = "agentos.coordination.directory-profile-audit.result";
const DEFAULT_RESULT_CONTENT = "AgentOS coordination result memory";
const DEFAULT_RESULT_STORAGE_URI = "memory://agentos/base-sepolia/coordination/directory-profile-audit/result/v1";
const UNAUTHORIZED_CALLER = "0x000000000000000000000000000000000000dEaD";
const UNREGISTERED_AGENT = "0x000000000000000000000000000000000000bEEF";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

interface CallClient {
  call(parameters: { account: Address; to: Address; value: bigint; data: Hex }): Promise<unknown>;
}

interface ProfileReadClient {
  readContract(parameters: {
    address: Address;
    abi: typeof AGENT_DIRECTORY_ABI;
    functionName: "profileOf";
    args: [Address];
  }): Promise<unknown>;
}

interface CoordinationReadClient {
  readContract(parameters: {
    address: Address;
    abi: typeof AGENT_COORDINATION_ABI;
    functionName: "assignmentOf" | "assignmentMemoryResultOf";
    args: [bigint];
  }): Promise<unknown>;
}

export interface AgentCoordinationSafetyCheckCliArgs {
  manifestPath: string;
}

export type AgentCoordinationSafetyCheckCliOptions = AgentCoreRunnerOptions<AgentCoordinationSafetyCheckCliArgs>;

if (isAgentCoordinationSafetyCheckDirectRun(import.meta.url, process.argv)) {
  await runAgentCoordinationSafetyCheckCli();
}

export async function runAgentCoordinationSafetyCheckCli(
  options: AgentCoordinationSafetyCheckCliOptions = {},
): Promise<void> {
  await runInjectedOrDefault(
    options,
    parseAgentCoordinationSafetyCheckCliArgs,
    main,
    validateAgentCoordinationSafetyReport,
  );
}

export function parseAgentCoordinationSafetyCheckCliArgs(argv: readonly string[]): AgentCoordinationSafetyCheckCliArgs {
  const values = parseValues(argv, ["--manifest"]);
  return { manifestPath: values.options.get("--manifest") ?? DEFAULT_MANIFEST_PATH };
}

export function isAgentCoordinationSafetyCheckDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  return isDirectRun(moduleUrl, argv);
}

async function main(): Promise<void> {
  loadDotEnv(".env");

  const manifestPath = readFlag("--manifest") ?? DEFAULT_MANIFEST_PATH;
  const manifest = await readDeploymentManifest(manifestPath);
  const rpcUrl = process.env[manifest.rpcUrlEnv];
  if (rpcUrl === undefined || rpcUrl.length === 0) throw new Error(`${manifest.rpcUrlEnv} is required`);

  const coordination = requireAgentCoordination(manifest);
  const directory = requireAgentDirectory(manifest);
  const memoryRegistry = requireMemoryRegistry(manifest);
  const reputationHistory = requireReputationHistory(manifest);
  const assigner = manifest.contracts.agentAccount;
  const assignee = manifest.contracts.agentAccount;
  const taskLabel = process.env.COORDINATION_TASK_LABEL ?? DEFAULT_TASK_LABEL;
  const contextURI = process.env.COORDINATION_CONTEXT_URI ?? DEFAULT_CONTEXT_URI;
  const resultURI = process.env.COORDINATION_RESULT_URI ?? DEFAULT_RESULT_URI;
  const cancellationURI = process.env.COORDINATION_CANCELLATION_URI ?? DEFAULT_CANCELLATION_URI;
  const resultMemoryIdLabel = process.env.COORDINATION_RESULT_MEMORY_ID_LABEL ?? DEFAULT_RESULT_MEMORY_ID_LABEL;
  const resultContent = process.env.COORDINATION_RESULT_CONTENT ?? DEFAULT_RESULT_CONTENT;
  const resultStorageURI = process.env.COORDINATION_RESULT_STORAGE_URI ?? DEFAULT_RESULT_STORAGE_URI;
  const configuredAssignmentId = readEnvBigInt("COORDINATION_ASSIGNMENT_ID");
  const commitment = createAgentCoordinationCommitment({ taskLabel, contextURI });
  const resultHash = createCoordinationEvidenceHash(resultURI);
  const cancellationHash = createCoordinationEvidenceHash(cancellationURI);
  const resultMemory = createSingleLeafMemoryCommitment({
    memoryIdLabel: resultMemoryIdLabel,
    content: resultContent,
    storageURI: resultStorageURI,
  });
  const memoryBackedResultHash = createCoordinationMemoryResultHash({
    memoryId: resultMemory.memoryId,
    merkleRoot: resultMemory.merkleRoot,
  });

  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  const chainId = await publicClient.getChainId();
  if (chainId !== manifest.chainId) throw new Error(`Connected to chain ${chainId}, expected ${manifest.chainId}`);

  const owner = (await publicClient.readContract({
    address: coordination,
    abi: AGENT_COORDINATION_ABI,
    functionName: "owner",
  })) as Address;
  const linkedDirectory = (await publicClient.readContract({
    address: coordination,
    abi: AGENT_COORDINATION_ABI,
    functionName: "agentDirectory",
  })) as Address;
  const linkedMemoryRegistry = (await publicClient.readContract({
    address: coordination,
    abi: AGENT_COORDINATION_ABI,
    functionName: "memoryRegistry",
  })) as Address;
  const assignerProfile = await readAgentProfile(publicClient, directory, assigner);
  const assigneeProfile = await readAgentProfile(publicClient, directory, assignee);
  const assigneeReputationEventCount = (await publicClient.readContract({
    address: reputationHistory,
    abi: REPUTATION_HISTORY_ABI,
    functionName: "eventCountOf",
    args: [assignee],
  })) as bigint;
  const assignmentCount = (await publicClient.readContract({
    address: coordination,
    abi: AGENT_COORDINATION_ABI,
    functionName: "assignmentCount",
  })) as bigint;
  const lifecycleAssignmentId = configuredAssignmentId ?? (assignmentCount === 0n ? undefined : assignmentCount - 1n);
  const lifecycleAssignment = lifecycleAssignmentId === undefined || lifecycleAssignmentId >= assignmentCount
    ? null
    : await readFormattedAssignment(publicClient, coordination, lifecycleAssignmentId);
  const resultMemoryCommitment = formatMemoryCommitment((await publicClient.readContract({
    address: memoryRegistry,
    abi: MEMORY_REGISTRY_ABI,
    functionName: "commitments",
    args: [assignee, resultMemory.memoryId],
  })) as MemoryCommitmentRecord);

  const assignment = createCoordinationAssignmentTransaction({ coordination, assigner, assignee, ...commitment });
  const assignmentCallable = await callPasses(publicClient, owner, assignment);
  const unauthorizedAssignmentDenied = !(await callPasses(publicClient, UNAUTHORIZED_CALLER, assignment));
  const zeroAssignerDenied = !(await callPasses(
    publicClient,
    owner,
    createCoordinationAssignmentTransaction({
      coordination,
      assigner: ZERO_ADDRESS,
      assignee,
      ...commitment,
    }),
  ));
  const zeroTaskDenied = !(await callPasses(
    publicClient,
    owner,
    createCoordinationAssignmentTransaction({
      coordination,
      assigner,
      assignee,
      taskHash: ZERO_BYTES32,
      contextHash: commitment.contextHash,
    }),
  ));
  const zeroContextDenied = !(await callPasses(
    publicClient,
    owner,
    createCoordinationAssignmentTransaction({
      coordination,
      assigner,
      assignee,
      taskHash: commitment.taskHash,
      contextHash: ZERO_BYTES32,
    }),
  ));
  const unregisteredAssigneeDenied = !(await callPasses(
    publicClient,
    owner,
    createCoordinationAssignmentTransaction({
      coordination,
      assigner,
      assignee: UNREGISTERED_AGENT,
      ...commitment,
    }),
  ));
  const acceptTransaction = lifecycleAssignmentId === undefined
    ? null
    : createAcceptCoordinationAssignmentTransaction({ coordination, assignmentId: lifecycleAssignmentId });
  const completeTransaction = lifecycleAssignmentId === undefined
    ? null
    : createCompleteCoordinationAssignmentTransaction({ coordination, assignmentId: lifecycleAssignmentId, resultHash });
  const cancelTransaction = lifecycleAssignmentId === undefined
    ? null
    : createCancelCoordinationAssignmentTransaction({
        coordination,
        assignmentId: lifecycleAssignmentId,
        cancellationHash,
      });
  const zeroResultTransaction = lifecycleAssignmentId === undefined
    ? null
    : createCompleteCoordinationAssignmentTransaction({
        coordination,
        assignmentId: lifecycleAssignmentId,
        resultHash: ZERO_BYTES32,
      });
  const zeroCancellationTransaction = lifecycleAssignmentId === undefined
    ? null
    : createCancelCoordinationAssignmentTransaction({
        coordination,
        assignmentId: lifecycleAssignmentId,
        cancellationHash: ZERO_BYTES32,
      });
  const acceptCallable = acceptTransaction === null ? false : await callPasses(publicClient, owner, acceptTransaction);
  const completeCallable =
    completeTransaction === null ? false : await callPasses(publicClient, owner, completeTransaction);
  const cancelCallable = cancelTransaction === null ? false : await callPasses(publicClient, owner, cancelTransaction);
  const unauthorizedAcceptDenied = acceptTransaction === null
    ? false
    : !(await callPasses(publicClient, UNAUTHORIZED_CALLER, acceptTransaction));
  const unauthorizedCompleteDenied = completeTransaction === null
    ? false
    : !(await callPasses(publicClient, UNAUTHORIZED_CALLER, completeTransaction));
  const unauthorizedCancelDenied = cancelTransaction === null
    ? false
    : !(await callPasses(publicClient, UNAUTHORIZED_CALLER, cancelTransaction));
  const zeroResultDenied = zeroResultTransaction === null
    ? false
    : !(await callPasses(publicClient, owner, zeroResultTransaction));
  const zeroCancellationDenied = zeroCancellationTransaction === null
    ? false
    : !(await callPasses(publicClient, owner, zeroCancellationTransaction));
  const agentAcceptResult = lifecycleAssignmentId === undefined
    ? null
    : await buildExecuteTransaction({
        agent: manifest.contracts.agentAccount,
        action: createCoordinationAcceptanceAction({ coordination, assignmentId: lifecycleAssignmentId }),
        simulatePolicy: createOnChainPolicySimulator(publicClient, manifest),
      });
  const agentAcceptCallable = agentAcceptResult?.allowed === true
    ? await callPasses(publicClient, manifest.owner, agentAcceptResult.transaction)
    : false;
  const agentCompleteResult = lifecycleAssignmentId === undefined
    ? null
    : await buildExecuteTransaction({
        agent: manifest.contracts.agentAccount,
        action: createCoordinationCompletionAction({
          coordination,
          assignmentId: lifecycleAssignmentId,
          resultHash,
        }),
        simulatePolicy: createOnChainPolicySimulator(publicClient, manifest),
      });
  const agentCompleteCallable = agentCompleteResult?.allowed === true
    ? await callPasses(publicClient, manifest.owner, agentCompleteResult.transaction)
    : false;
  const agentCompleteMemoryResult = lifecycleAssignmentId === undefined
    ? null
    : await buildExecuteTransaction({
        agent: manifest.contracts.agentAccount,
        action: createCoordinationMemoryCompletionAction({
          coordination,
          assignmentId: lifecycleAssignmentId,
          memoryId: resultMemory.memoryId,
          merkleRoot: resultMemory.merkleRoot,
        }),
        simulatePolicy: createOnChainPolicySimulator(publicClient, manifest),
      });
  const agentCompleteMemoryCallable = agentCompleteMemoryResult?.allowed === true
    ? await callPasses(publicClient, manifest.owner, agentCompleteMemoryResult.transaction)
    : false;

  const checks = {
    ownerMatchesManifestOwner: getAddress(owner) === getAddress(manifest.owner),
    directoryMatchesManifest: getAddress(linkedDirectory) === getAddress(directory),
    memoryRegistryMatchesManifest: getAddress(linkedMemoryRegistry) === getAddress(memoryRegistry),
    assignerProfileRegistered: assignerProfile.registered,
    assignerProfileActive: assignerProfile.active,
    assigneeProfileRegistered: assigneeProfile.registered,
    assigneeProfileActive: assigneeProfile.active,
    assigneeReputationEventCountReadable: assigneeReputationEventCount >= 0n,
    assignmentCountReadable: assignmentCount >= 0n,
    assignmentCallable,
    unauthorizedAssignmentDenied,
    zeroAssignerDenied,
    zeroTaskDenied,
    zeroContextDenied,
    unregisteredAssigneeDenied,
    lifecycleAssignmentAvailable: lifecycleAssignment !== null,
    acceptCallableWhenCreated: lifecycleAssignment?.statusCode === 0 ? acceptCallable : true,
    completeCallableWhenAccepted: lifecycleAssignment?.statusCode === 1 ? completeCallable : true,
    cancelCallableWhenOpen:
      lifecycleAssignment?.statusCode === 0 || lifecycleAssignment?.statusCode === 1 ? cancelCallable : true,
    terminalLifecycleDenied:
      lifecycleAssignment?.statusCode === 2 || lifecycleAssignment?.statusCode === 3
        ? !acceptCallable && !completeCallable && !cancelCallable
        : true,
    unauthorizedAcceptDenied,
    unauthorizedCompleteDenied,
    unauthorizedCancelDenied,
    zeroResultDenied,
    zeroCancellationDenied,
    coordinationAcceptPolicyAllowed: agentAcceptResult?.allowed === true,
    agentAcceptCallableWhenCreated: lifecycleAssignment?.statusCode === 0 ? agentAcceptCallable : true,
    agentAcceptDeniedWhenTerminal:
      lifecycleAssignment?.statusCode === 2 || lifecycleAssignment?.statusCode === 3 ? !agentAcceptCallable : true,
    coordinationCompletePolicyAllowed: agentCompleteResult?.allowed === true,
    agentCompleteCallableWhenAccepted: lifecycleAssignment?.statusCode === 1 ? agentCompleteCallable : true,
    agentCompleteDeniedWhenTerminal:
      lifecycleAssignment?.statusCode === 2 || lifecycleAssignment?.statusCode === 3 ? !agentCompleteCallable : true,
    resultMemoryCommitmentExists: resultMemoryCommitment.version !== "0",
    resultMemoryCommitmentRootMatches: resultMemoryCommitment.merkleRoot === resultMemory.merkleRoot,
    coordinationCompleteMemoryPolicyAllowed: agentCompleteMemoryResult?.allowed === true,
    agentCompleteMemoryCallableWhenAccepted:
      lifecycleAssignment?.statusCode === 1 ? agentCompleteMemoryCallable : true,
    agentCompleteMemoryDeniedWhenTerminal:
      lifecycleAssignment?.statusCode === 2 || lifecycleAssignment?.statusCode === 3
        ? !agentCompleteMemoryCallable
        : true,
    completedAssignmentAcceptedByAssignee:
      lifecycleAssignment?.statusCode === 2 ? getAddress(lifecycleAssignment.acceptedBy) === getAddress(assignee) : true,
    completedAssignmentCompletedByAssignee:
      lifecycleAssignment?.statusCode === 2 ? getAddress(lifecycleAssignment.completedBy) === getAddress(assignee) : true,
    completedAssignmentMemoryResultMatches:
      lifecycleAssignment?.statusCode === 2
        ? lifecycleAssignment.resultMemoryId === resultMemory.memoryId
          && lifecycleAssignment.resultMerkleRoot === resultMemory.merkleRoot
          && lifecycleAssignment.resultHash === memoryBackedResultHash
        : true,
  };

  console.log(
    JSON.stringify(
      {
        chainId,
        coordination,
        owner,
        directory,
        linkedDirectory,
        memoryRegistry,
        linkedMemoryRegistry,
        reputationHistory,
        assigner,
        assignee,
        taskLabel,
        contextURI,
        resultURI,
        cancellationURI,
        desired: commitment,
        lifecycleEvidence: {
          resultHash,
          cancellationHash,
        },
        memoryBackedResult: {
          memoryIdLabel: resultMemoryIdLabel,
          storageURI: resultStorageURI,
          memoryId: resultMemory.memoryId,
          merkleRoot: resultMemory.merkleRoot,
          contentHash: resultMemory.contentHash,
          storageURIHash: resultMemory.storageURIHash,
          resultHash: memoryBackedResultHash,
          commitment: resultMemoryCommitment,
        },
        assignerProfile,
        assigneeProfile,
        assigneeReputationEventCount: assigneeReputationEventCount.toString(),
        assignmentCount: assignmentCount.toString(),
        lifecycleAssignmentId: lifecycleAssignmentId?.toString() ?? null,
        lifecycleAssignment,
        agentAcceptPolicyDecision: agentAcceptResult?.decision ?? null,
        agentCompletePolicyDecision: agentCompleteResult?.decision ?? null,
        agentCompleteMemoryPolicyDecision: agentCompleteMemoryResult?.decision ?? null,
        checks,
      },
      null,
      2,
    ),
  );

  if (!Object.values(checks).every(Boolean)) process.exitCode = 1;
}

async function readAgentProfile(client: ProfileReadClient, directory: Address, agent: Address) {
  const profile = (await client.readContract({
    address: directory,
    abi: AGENT_DIRECTORY_ABI,
    functionName: "profileOf",
    args: [agent],
  })) as readonly [Hex, Hex, boolean, boolean];

  return {
    roleHash: profile[0],
    metadataURIHash: profile[1],
    active: profile[2],
    registered: profile[3],
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

type AssignmentRecord = readonly [Address, Address, Hex, Hex, number, Address, Address, Hex, Hex, bigint, bigint];
type AssignmentMemoryResultRecord = readonly [Hex, Hex];
type MemoryCommitmentRecord = readonly [Hex, Hex, Hex, bigint, bigint, bigint];

async function readFormattedAssignment(
  client: CoordinationReadClient,
  coordination: Address,
  assignmentId: bigint,
) {
  const assignment = formatAssignment((await client.readContract({
    address: coordination,
    abi: AGENT_COORDINATION_ABI,
    functionName: "assignmentOf",
    args: [assignmentId],
  })) as AssignmentRecord);
  const memoryResult = (await client.readContract({
    address: coordination,
    abi: AGENT_COORDINATION_ABI,
    functionName: "assignmentMemoryResultOf",
    args: [assignmentId],
  })) as AssignmentMemoryResultRecord;

  return {
    ...assignment,
    resultMemoryId: memoryResult[0],
    resultMerkleRoot: memoryResult[1],
  };
}

function formatAssignment(assignment: AssignmentRecord) {
  return {
    assigner: assignment[0],
    assignee: assignment[1],
    taskHash: assignment[2],
    contextHash: assignment[3],
    statusCode: assignment[4],
    status: formatAssignmentStatus(assignment[4]),
    acceptedBy: assignment[5],
    completedBy: assignment[6],
    resultHash: assignment[7],
    cancellationHash: assignment[8],
    createdAt: assignment[9].toString(),
    updatedAt: assignment[10].toString(),
  };
}

function formatMemoryCommitment(commitment: MemoryCommitmentRecord) {
  return {
    merkleRoot: commitment[0],
    contentHash: commitment[1],
    storageURIHash: commitment[2],
    version: commitment[3].toString(),
    blockNumber: commitment[4].toString(),
    timestamp: commitment[5].toString(),
  };
}

function formatAssignmentStatus(status: number): string {
  switch (status) {
    case 0:
      return "Created";
    case 1:
      return "Accepted";
    case 2:
      return "Completed";
    case 3:
      return "Cancelled";
    default:
      return `Unknown(${status})`;
  }
}

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
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

function validateAgentCoordinationSafetyReport(output: unknown): void {
  const report = requireObject(output, "Agent coordination safety report must be an object");
  requireNumber(report.chainId, "Agent coordination safety chainId must be a number");
  requireString(report.coordination, "Agent coordination safety coordination must be a string");
  requireString(report.owner, "Agent coordination safety owner must be a string");
  requireString(report.directory, "Agent coordination safety directory must be a string");
  requireString(report.linkedDirectory, "Agent coordination safety linkedDirectory must be a string");
  requireString(report.memoryRegistry, "Agent coordination safety memoryRegistry must be a string");
  requireString(report.linkedMemoryRegistry, "Agent coordination safety linkedMemoryRegistry must be a string");
  requireString(report.reputationHistory, "Agent coordination safety reputationHistory must be a string");
  requireString(report.assigner, "Agent coordination safety assigner must be a string");
  requireString(report.assignee, "Agent coordination safety assignee must be a string");
  requireString(report.assignmentCount, "Agent coordination safety assignmentCount must be a string");
  validateChecksEvidence(report.checks, "Agent coordination safety");
}
