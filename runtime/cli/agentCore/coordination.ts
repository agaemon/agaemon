import { readFileSync } from "node:fs";

import { createPublicClient, createWalletClient, formatEther, getAddress, http, isAddress, isHex, parseEther } from "viem";
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import {
  AGENT_COORDINATION_ABI,
  ASSIGNMENT_STATUS,
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
import { createOnChainPolicySimulator, normalizePrivateKey } from "../../base/execution.js";
import {
  createCoordinationAssignmentPayoutAction,
  reconcileCoordinationAssignmentPayout,
} from "../../payouts/coordination.js";
import {
  COORDINATION_PAYOUT_RECEIPT_ABI,
  createRecordCoordinationPayoutReceiptTransaction,
  formatCoordinationPayoutReceipt,
} from "../../payouts/receipt.js";
import {
  readDeploymentManifest,
  requireAgentCoordination,
  requireAgentDirectory,
  requireCoordinationPayoutReceiptRegistry,
  requireMemoryRegistry,
  requirePayoutRuleAdapter,
  requireReputationHistory,
} from "../../base/deploymentManifest.js";
import { createSingleLeafMemoryCommitment } from "../../memory/commitment.js";
import { PAYOUT_RULE_ABI } from "../../payouts/rule.js";
import { REPUTATION_HISTORY_ABI } from "../../reputation/history.js";
import { buildExecuteTransaction } from "../../transactions/builder.js";
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
import type { AgentCoreRunnerOptions } from "./runnerShared.js";

const DEFAULT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";
const DEFAULT_TASK_LABEL = "agentos.kernel.directory-profile-audit";
const DEFAULT_CONTEXT_URI = "agentos://base-sepolia/coordination/directory-profile-audit/v1";
const DEFAULT_RESULT_URI = "agentos://base-sepolia/coordination/directory-profile-audit/result/v1";
const DEFAULT_CANCELLATION_URI = "agentos://base-sepolia/coordination/directory-profile-audit/cancelled/v1";
const DEFAULT_RESULT_MEMORY_ID_LABEL = "agentos.coordination.directory-profile-audit.result";
const DEFAULT_RESULT_CONTENT = "AgentOS coordination result memory";
const DEFAULT_RESULT_STORAGE_URI = "memory://agentos/base-sepolia/coordination/directory-profile-audit/result/v1";
const DEFAULT_PAYOUT_AMOUNT_ETH = "0.000001";

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
    blockNumber?: bigint;
  }): Promise<unknown>;
}

interface PayoutReadClient {
  readContract(parameters: {
    address: Address;
    abi: typeof PAYOUT_RULE_ABI;
    functionName: "payoutRules" | "dailyPayouts";
    args: [Address, Address] | [Address, Address, bigint];
  }): Promise<unknown>;
}

interface PayoutReceiptReadClient {
  readContract(parameters: {
    address: Address;
    abi: typeof COORDINATION_PAYOUT_RECEIPT_ABI;
    functionName: "receiptOf";
    args: [Address, bigint];
  }): Promise<unknown>;
}

export type AgentCoordinationAction =
  | "assign"
  | "accept"
  | "agent-accept"
  | "complete"
  | "agent-complete"
  | "agent-complete-memory"
  | "payout"
  | "payout-status"
  | "record-payout-receipt"
  | "cancel";

export interface AgentCoordinationCliArgs {
  send: boolean;
  action: AgentCoordinationAction | null;
  manifestPath: string;
  assigner?: string | undefined;
  assignee?: string | undefined;
  taskLabel?: string | undefined;
  contextURI?: string | undefined;
  resultURI?: string | undefined;
  cancellationURI?: string | undefined;
  resultMemoryIdLabel?: string | undefined;
  resultContent?: string | undefined;
  resultStorageURI?: string | undefined;
  amountEth?: string | undefined;
  assignmentId?: string | undefined;
  payoutTxHash?: string | undefined;
}

export type AgentCoordinationCliOptions = AgentCoreRunnerOptions<AgentCoordinationCliArgs>;

if (isAgentCoordinationDirectRun(import.meta.url, process.argv)) {
  await runAgentCoordinationCli();
}

export async function runAgentCoordinationCli(options: AgentCoordinationCliOptions = {}): Promise<void> {
  await runInjectedOrDefault(options, parseAgentCoordinationCliArgs, main, validateAgentCoordinationReport);
}

export function parseAgentCoordinationCliArgs(argv: readonly string[]): AgentCoordinationCliArgs {
  const values = parseValues(
    argv,
    [
      "--manifest",
      "--assigner",
      "--assignee",
      "--task-label",
      "--context-uri",
      "--result-uri",
      "--cancellation-uri",
      "--result-memory-id-label",
      "--result-content",
      "--result-storage-uri",
      "--amount-eth",
      "--assignment-id",
      "--payout-tx-hash",
    ],
    [
      "--send",
      "--assign",
      "--accept",
      "--agent-accept",
      "--complete",
      "--agent-complete",
      "--agent-complete-memory",
      "--payout",
      "--payout-status",
      "--record-payout-receipt",
      "--cancel",
    ],
  );
  const actionFlags: Array<[string, AgentCoordinationAction]> = [
    ["--assign", "assign"],
    ["--accept", "accept"],
    ["--agent-accept", "agent-accept"],
    ["--complete", "complete"],
    ["--agent-complete", "agent-complete"],
    ["--agent-complete-memory", "agent-complete-memory"],
    ["--payout", "payout"],
    ["--payout-status", "payout-status"],
    ["--record-payout-receipt", "record-payout-receipt"],
    ["--cancel", "cancel"],
  ];
  const selected = actionFlags.filter(([flag]) => values.booleans.has(flag)).map(([, action]) => action);
  if (selected.length > 1) throw new Error("choose only one action");
  if (values.booleans.has("--send") && selected[0] === "payout-status") throw new Error("--send is not supported with --payout-status");
  if (values.booleans.has("--send") && selected.length === 0) throw new Error("--send requires an action flag");
  return {
    send: values.booleans.has("--send"),
    action: selected[0] ?? null,
    manifestPath: values.options.get("--manifest") ?? DEFAULT_MANIFEST_PATH,
    assigner: values.options.get("--assigner"),
    assignee: values.options.get("--assignee"),
    taskLabel: values.options.get("--task-label"),
    contextURI: values.options.get("--context-uri"),
    resultURI: values.options.get("--result-uri"),
    cancellationURI: values.options.get("--cancellation-uri"),
    resultMemoryIdLabel: values.options.get("--result-memory-id-label"),
    resultContent: values.options.get("--result-content"),
    resultStorageURI: values.options.get("--result-storage-uri"),
    amountEth: values.options.get("--amount-eth"),
    assignmentId: values.options.get("--assignment-id"),
    payoutTxHash: values.options.get("--payout-tx-hash"),
  };
}

export function isAgentCoordinationDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  return isDirectRun(moduleUrl, argv);
}

async function main(): Promise<void> {
  loadDotEnv(".env");

  const shouldSend = process.argv.includes("--send");
  const shouldAssign = process.argv.includes("--assign");
  const shouldAccept = process.argv.includes("--accept");
  const shouldAgentAccept = process.argv.includes("--agent-accept");
  const shouldComplete = process.argv.includes("--complete");
  const shouldAgentComplete = process.argv.includes("--agent-complete");
  const shouldAgentCompleteMemory = process.argv.includes("--agent-complete-memory");
  const shouldPayout = process.argv.includes("--payout");
  const shouldPayoutStatus = process.argv.includes("--payout-status");
  const shouldRecordPayoutReceipt = process.argv.includes("--record-payout-receipt");
  const shouldCancel = process.argv.includes("--cancel");
  const selectedActions = [
    shouldAssign,
    shouldAccept,
    shouldAgentAccept,
    shouldComplete,
    shouldAgentComplete,
    shouldAgentCompleteMemory,
    shouldPayout,
    shouldPayoutStatus,
    shouldRecordPayoutReceipt,
    shouldCancel,
  ].filter(Boolean).length;
  if (selectedActions > 1) {
    throw new Error(
      "choose only one action: --assign, --accept, --agent-accept, --complete, --agent-complete, --agent-complete-memory, --payout, --payout-status, --record-payout-receipt, or --cancel",
    );
  }
  if (shouldSend && shouldPayoutStatus) throw new Error("--send is not supported with --payout-status");
  if (shouldSend && selectedActions === 0) throw new Error("--send requires an action flag");

  const manifestPath = readFlag("--manifest") ?? DEFAULT_MANIFEST_PATH;
  const manifest = await readDeploymentManifest(manifestPath);
  const rpcUrl = process.env[manifest.rpcUrlEnv];
  if (rpcUrl === undefined || rpcUrl.length === 0) throw new Error(`${manifest.rpcUrlEnv} is required`);

  const coordination = requireAgentCoordination(manifest);
  const directory = requireAgentDirectory(manifest);
  const memoryRegistry = requireMemoryRegistry(manifest);
  const reputationHistory = requireReputationHistory(manifest);
  const assigner = readAddressFlag("--assigner") ?? readEnvAddress("COORDINATION_ASSIGNER") ?? manifest.contracts.agentAccount;
  const assignee = readAddressFlag("--assignee") ?? readEnvAddress("COORDINATION_ASSIGNEE") ?? manifest.contracts.agentAccount;
  const taskLabel = readFlag("--task-label") ?? process.env.COORDINATION_TASK_LABEL ?? DEFAULT_TASK_LABEL;
  const contextURI = readFlag("--context-uri") ?? process.env.COORDINATION_CONTEXT_URI ?? DEFAULT_CONTEXT_URI;
  const resultURI = readFlag("--result-uri") ?? process.env.COORDINATION_RESULT_URI ?? DEFAULT_RESULT_URI;
  const cancellationURI =
    readFlag("--cancellation-uri") ?? process.env.COORDINATION_CANCELLATION_URI ?? DEFAULT_CANCELLATION_URI;
  const resultMemoryIdLabel =
    readFlag("--result-memory-id-label") ?? process.env.COORDINATION_RESULT_MEMORY_ID_LABEL ?? DEFAULT_RESULT_MEMORY_ID_LABEL;
  const resultContent = readFlag("--result-content") ?? process.env.COORDINATION_RESULT_CONTENT ?? DEFAULT_RESULT_CONTENT;
  const resultStorageURI =
    readFlag("--result-storage-uri") ?? process.env.COORDINATION_RESULT_STORAGE_URI ?? DEFAULT_RESULT_STORAGE_URI;
  const payoutAmountEth = readFlag("--amount-eth") ?? process.env.COORDINATION_PAYOUT_AMOUNT_ETH ?? DEFAULT_PAYOUT_AMOUNT_ETH;
  const payoutAmountWei = parseEther(payoutAmountEth);
  const assignmentIdFlag = readBigIntFlag("--assignment-id");
  const assignmentId = assignmentIdFlag ?? readEnvBigInt("COORDINATION_ASSIGNMENT_ID");
  const payoutTxHash = readBytes32Flag("--payout-tx-hash") ?? readEnvBytes32("COORDINATION_PAYOUT_TX_HASH");
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
  const latestAssignment = assignmentCount === 0n
    ? null
    : await readFormattedAssignment(publicClient, coordination, assignmentCount - 1n);
  const selectedAssignment = assignmentId === undefined || assignmentId >= assignmentCount
    ? null
    : await readFormattedAssignment(publicClient, coordination, assignmentId);
  const shouldReadPayoutState = shouldPayout || shouldPayoutStatus;
  const payoutAdapter = shouldReadPayoutState ? requirePayoutRuleAdapter(manifest) : null;
  const payoutReceiptRegistry = shouldPayoutStatus || shouldRecordPayoutReceipt
    ? manifest.contracts.coordinationPayoutReceiptRegistry ?? null
    : null;
  const payoutDay = shouldReadPayoutState ? (await publicClient.getBlock()).timestamp / 86_400n : null;
  const payoutRule = shouldReadPayoutState && selectedAssignment !== null && payoutAdapter !== null && payoutDay !== null
    ? await readPayoutRuleState(
        publicClient,
        payoutAdapter,
        manifest.contracts.agentAccount,
        selectedAssignment.assignee,
        payoutDay,
      )
    : null;

  const baseOutput = {
    mode: shouldSend ? "send" : "dry-run",
    chainId,
    agent: manifest.contracts.agentAccount,
    coordination,
    owner,
    ownerMatchesManifest: getAddress(owner) === getAddress(manifest.owner),
    directory,
    linkedDirectory,
    directoryMatchesManifest: getAddress(linkedDirectory) === getAddress(directory),
    memoryRegistry,
    linkedMemoryRegistry,
    memoryRegistryMatchesManifest: getAddress(linkedMemoryRegistry) === getAddress(memoryRegistry),
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
    },
    assignmentId: assignmentId?.toString() ?? null,
    assignerProfile,
    assigneeProfile,
    assigneeReputationEventCount: assigneeReputationEventCount.toString(),
    assignmentCount: assignmentCount.toString(),
    latestAssignment,
    selectedAssignment,
    payoutReceiptRegistry,
    payout: shouldPayout
      ? {
          adapter: payoutAdapter,
          amountEth: formatEther(payoutAmountWei),
          recipient: selectedAssignment?.assignee ?? null,
          rule: payoutRule === null
            ? null
            : {
                maxActionValue: payoutRule.maxActionValue.toString(),
                maxDailyValue: payoutRule.maxDailyValue.toString(),
                dailyPaid: payoutRule.dailyPaid.toString(),
                enabled: payoutRule.enabled,
              },
        }
      : null,
  };

  if (shouldPayoutStatus) {
    if (payoutAdapter === null || payoutDay === null) throw new Error("payout adapter state is required");
    const payoutStatusAssignmentId = assignmentIdFlag;
    const payoutStatusSelectedAssignment = payoutStatusAssignmentId === undefined || payoutStatusAssignmentId >= assignmentCount
      ? null
      : await readFormattedAssignment(publicClient, coordination, payoutStatusAssignmentId);
    if (payoutStatusAssignmentId !== undefined && payoutStatusSelectedAssignment === null) {
      throw new Error(`assignment ${payoutStatusAssignmentId} was not found`);
    }

    const assignmentIds = payoutStatusAssignmentId === undefined
      ? createAssignmentIdRange(assignmentCount)
      : [payoutStatusAssignmentId];
    const payoutReconciliation = [];
    const simulatePolicy = createOnChainPolicySimulator(publicClient, manifest);
    for (const payoutAssignmentId of assignmentIds) {
      const assignment = payoutAssignmentId === payoutStatusAssignmentId && payoutStatusSelectedAssignment !== null
        ? payoutStatusSelectedAssignment
        : await readFormattedAssignment(publicClient, coordination, payoutAssignmentId);
      if (payoutStatusAssignmentId === undefined && assignment.statusCode !== ASSIGNMENT_STATUS.Completed) continue;

      const rule = await readPayoutRuleState(
        publicClient,
        payoutAdapter,
        manifest.contracts.agentAccount,
        assignment.assignee,
        payoutDay,
      );
      const payoutReceipt = payoutReceiptRegistry === null
        ? null
        : await readPayoutReceiptState(publicClient, payoutReceiptRegistry, coordination, payoutAssignmentId);
      let policyDecision = null;
      try {
        const action = createCoordinationAssignmentPayoutAction({
          assignmentId: payoutAssignmentId,
          assignment,
          adapter: payoutAdapter,
          amountWei: payoutAmountWei,
        });
        policyDecision = (await buildExecuteTransaction({
          agent: manifest.contracts.agentAccount,
          action,
          simulatePolicy,
        })).decision;
      } catch {
        policyDecision = null;
      }

      payoutReconciliation.push(reconcileCoordinationAssignmentPayout({
        assignmentId: payoutAssignmentId,
        assignment,
        amountWei: payoutAmountWei,
        payoutRule: rule,
        payoutReceipt,
        policyDecision,
      }));
    }

    console.log(
      JSON.stringify(
        {
          ...baseOutput,
          operation: "payout-status",
          payoutReconciliationScope: payoutStatusAssignmentId === undefined ? "completed-assignments" : "selected-assignment",
          payoutDay: payoutDay.toString(),
          payoutReconciliation,
          transaction: null,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (selectedActions === 0) {
    console.log(JSON.stringify({ ...baseOutput, transaction: null }, null, 2));
    return;
  }

  if (getAddress(owner) !== getAddress(manifest.owner)) {
    throw new Error(`Coordination owner ${owner} does not match manifest owner ${manifest.owner}`);
  }
  if (getAddress(linkedDirectory) !== getAddress(directory)) {
    throw new Error(`Coordination directory ${linkedDirectory} does not match manifest directory ${directory}`);
  }

  if (
    (
      shouldAccept
      || shouldAgentAccept
      || shouldComplete
      || shouldAgentComplete
      || shouldAgentCompleteMemory
      || shouldPayout
      || shouldRecordPayoutReceipt
      || shouldCancel
    )
      && assignmentId === undefined
  ) {
    throw new Error("COORDINATION_ASSIGNMENT_ID or --assignment-id is required for lifecycle actions");
  }

  if ((shouldPayout || shouldRecordPayoutReceipt) && selectedAssignment === null) {
    throw new Error(`assignment ${assignmentId} was not found`);
  }
  if (shouldRecordPayoutReceipt && payoutTxHash === undefined) {
    throw new Error("COORDINATION_PAYOUT_TX_HASH or --payout-tx-hash is required for payout receipt recording");
  }

  const payoutReceiptRegistryForRecord = shouldRecordPayoutReceipt
    ? requireCoordinationPayoutReceiptRegistry(manifest)
    : null;

  const payoutAction = shouldPayout
    ? createCoordinationAssignmentPayoutAction({
        assignmentId: assignmentId!,
        assignment: selectedAssignment!,
        adapter: payoutAdapter!,
        amountWei: payoutAmountWei,
      })
    : null;
  const isAgentExecutionAction = shouldAgentAccept || shouldAgentComplete || shouldAgentCompleteMemory || shouldPayout;
  const executionResult = isAgentExecutionAction
    ? await buildExecuteTransaction({
        agent: manifest.contracts.agentAccount,
        action: shouldAgentAccept
          ? createCoordinationAcceptanceAction({ coordination, assignmentId: assignmentId! })
          : shouldAgentCompleteMemory
            ? createCoordinationMemoryCompletionAction({
                coordination,
                assignmentId: assignmentId!,
                memoryId: resultMemory.memoryId,
                merkleRoot: resultMemory.merkleRoot,
              })
            : shouldPayout
              ? payoutAction!
              : createCoordinationCompletionAction({ coordination, assignmentId: assignmentId!, resultHash }),
        simulatePolicy: createOnChainPolicySimulator(publicClient, manifest),
      })
    : null;
  if (executionResult !== null && !executionResult.allowed) {
    console.log(
      JSON.stringify(
        {
          ...baseOutput,
          operation: shouldAgentAccept
            ? "agent-accept"
            : shouldAgentCompleteMemory
              ? "agent-complete-memory"
              : shouldPayout
                ? "payout"
                : "agent-complete",
          policyDecision: executionResult.decision,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  const transaction = executionResult?.transaction ?? (shouldAssign
    ? createCoordinationAssignmentTransaction({
        coordination,
        assigner,
        assignee,
        ...commitment,
      })
    : shouldAccept
      ? createAcceptCoordinationAssignmentTransaction({
          coordination,
          assignmentId: assignmentId!,
        })
      : shouldComplete
        ? createCompleteCoordinationAssignmentTransaction({
            coordination,
            assignmentId: assignmentId!,
            resultHash,
          })
        : shouldRecordPayoutReceipt
          ? createRecordCoordinationPayoutReceiptTransaction({
              registry: payoutReceiptRegistryForRecord!,
              coordination,
              assignmentId: assignmentId!,
              agent: manifest.contracts.agentAccount,
              recipient: selectedAssignment!.assignee,
              amountWei: payoutAmountWei,
              payoutTxHash: payoutTxHash!,
            })
          : createCancelCoordinationAssignmentTransaction({
              coordination,
              assignmentId: assignmentId!,
              cancellationHash,
            }));
  const operation = shouldAssign
    ? "assign"
    : shouldAccept
      ? "accept"
      : shouldAgentAccept
        ? "agent-accept"
        : shouldComplete
          ? "complete"
          : shouldAgentComplete
            ? "agent-complete"
            : shouldAgentCompleteMemory
              ? "agent-complete-memory"
              : shouldPayout
                ? "payout"
                : shouldRecordPayoutReceipt
                  ? "record-payout-receipt"
                  : "cancel";
  const outputWithTransaction = {
    ...baseOutput,
    operation,
    policyDecision: executionResult?.decision ?? null,
    transaction: {
      to: transaction.to,
      value: transaction.value.toString(),
      data: transaction.data,
    },
  };

  try {
    await publicClient.call({
      account: isAgentExecutionAction ? manifest.owner : owner,
      to: transaction.to,
      value: transaction.value,
      data: transaction.data,
    });
  } catch {
    console.log(JSON.stringify({ ...outputWithTransaction, executionSimulation: "rejected" }, null, 2));
    process.exitCode = 1;
    return;
  }

  const simulatedOutput = { ...outputWithTransaction, executionSimulation: "passed" };

  if (!shouldSend) {
    console.log(JSON.stringify(simulatedOutput, null, 2));
    return;
  }

  const rawPrivateKey = process.env.PRIVATE_KEY;
  if (rawPrivateKey === undefined || rawPrivateKey.length === 0) {
    throw new Error("PRIVATE_KEY is required when --send is used");
  }

  const account = privateKeyToAccount(normalizePrivateKey(rawPrivateKey));
  if (!isAgentExecutionAction && getAddress(account.address) !== getAddress(owner)) {
    throw new Error(`PRIVATE_KEY address ${account.address} does not match agent coordination owner ${owner}`);
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
  const nextAssignmentCount = (await publicClient.readContract({
    address: coordination,
    abi: AGENT_COORDINATION_ABI,
    functionName: "assignmentCount",
  })) as bigint;
  const nextSelectedAssignmentId = shouldAssign ? nextAssignmentCount - 1n : assignmentId!;
  const nextSelectedAssignment = await readFormattedAssignment(
    publicClient,
    coordination,
    nextSelectedAssignmentId,
  );

  console.log(
    JSON.stringify(
      {
        ...simulatedOutput,
        hash,
        explorerUrl: `${manifest.explorerUrl}/tx/${hash}`,
        receipt: {
          blockNumber: receipt.blockNumber.toString(),
          status: receipt.status,
        },
        nextAssignmentCount: nextAssignmentCount.toString(),
        nextSelectedAssignmentId: nextSelectedAssignmentId.toString(),
        nextSelectedAssignment,
      },
      null,
      2,
    ),
  );
}

async function readAgentProfile(
  publicClient: ProfileReadClient,
  directory: Address,
  agent: Address,
) {
  const profile = (await publicClient.readContract({
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

type AssignmentRecord = readonly [Address, Address, Hex, Hex, number, Address, Address, Hex, Hex, bigint, bigint];
type AssignmentMemoryResultRecord = readonly [Hex, Hex];

async function readFormattedAssignment(
  publicClient: CoordinationReadClient,
  coordination: Address,
  assignmentId: bigint,
  blockNumber?: bigint,
) {
  const block = blockNumber === undefined ? {} : { blockNumber };
  const assignment = formatAssignment((await publicClient.readContract({
    address: coordination,
    abi: AGENT_COORDINATION_ABI,
    functionName: "assignmentOf",
    args: [assignmentId],
    ...block,
  })) as AssignmentRecord);
  const memoryResult = (await publicClient.readContract({
    address: coordination,
    abi: AGENT_COORDINATION_ABI,
    functionName: "assignmentMemoryResultOf",
    args: [assignmentId],
    ...block,
  })) as AssignmentMemoryResultRecord;

  return {
    ...assignment,
    resultMemoryId: memoryResult[0],
    resultMerkleRoot: memoryResult[1],
  };
}

function createAssignmentIdRange(assignmentCount: bigint): bigint[] {
  const assignmentIds = [];
  for (let assignmentId = 0n; assignmentId < assignmentCount; assignmentId += 1n) {
    assignmentIds.push(assignmentId);
  }
  return assignmentIds;
}

async function readPayoutRuleState(
  publicClient: PayoutReadClient,
  adapter: Address,
  agent: Address,
  recipient: Address,
  day: bigint,
) {
  const rule = (await publicClient.readContract({
    address: adapter,
    abi: PAYOUT_RULE_ABI,
    functionName: "payoutRules",
    args: [agent, recipient],
  })) as readonly [bigint, bigint, boolean];
  const dailyPaid = (await publicClient.readContract({
    address: adapter,
    abi: PAYOUT_RULE_ABI,
    functionName: "dailyPayouts",
    args: [agent, recipient, day],
  })) as bigint;

  return {
    maxActionValue: rule[0],
    maxDailyValue: rule[1],
    enabled: rule[2],
    dailyPaid,
  };
}

async function readPayoutReceiptState(
  publicClient: PayoutReceiptReadClient,
  registry: Address,
  coordination: Address,
  assignmentId: bigint,
) {
  const receipt = await publicClient.readContract({
    address: registry,
    abi: COORDINATION_PAYOUT_RECEIPT_ABI,
    functionName: "receiptOf",
    args: [coordination, assignmentId],
  });

  return formatCoordinationPayoutReceipt(receipt as Parameters<typeof formatCoordinationPayoutReceipt>[0]);
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

function readEnvAddress(name: string): Address | undefined {
  const value = process.env[name];
  if (value === undefined || value.length === 0) return undefined;
  if (!isAddress(value)) throw new Error(`${name} must be an address`);
  return value;
}

function readAddressFlag(name: string): Address | undefined {
  const value = readFlag(name);
  if (value === undefined) return undefined;
  if (!isAddress(value)) throw new Error(`${name} must be an address`);
  return value;
}

function readEnvBytes32(name: string): Hex | undefined {
  const value = process.env[name];
  if (value === undefined || value.length === 0) return undefined;
  return parseBytes32(name, value);
}

function readBytes32Flag(name: string): Hex | undefined {
  const value = readFlag(name);
  if (value === undefined) return undefined;
  return parseBytes32(name, value);
}

function parseBytes32(name: string, value: string): Hex {
  if (!isHex(value, { strict: true }) || value.length !== 66) {
    throw new Error(`${name} must be a bytes32 hex value`);
  }
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

function validateAgentCoordinationReport(output: unknown): void {
  const report = requireObject(output, "Agent coordination report must be an object");
  requireString(report.mode, "Agent coordination report mode must be a string");
  requireNumber(report.chainId, "Agent coordination report chainId must be a number");
  requireString(report.agent, "Agent coordination report agent must be a string");
  requireString(report.coordination, "Agent coordination report coordination must be a string");
  requireString(report.owner, "Agent coordination report owner must be a string");
  requireString(report.directory, "Agent coordination report directory must be a string");
  requireString(report.linkedDirectory, "Agent coordination report linkedDirectory must be a string");
  requireString(report.memoryRegistry, "Agent coordination report memoryRegistry must be a string");
  requireString(report.linkedMemoryRegistry, "Agent coordination report linkedMemoryRegistry must be a string");
  requireString(report.reputationHistory, "Agent coordination report reputationHistory must be a string");
  requireString(report.assigner, "Agent coordination report assigner must be a string");
  requireString(report.assignee, "Agent coordination report assignee must be a string");
  requireString(report.assignmentCount, "Agent coordination report assignmentCount must be a string");
  validateTransactionEvidence(report.transaction, "Agent coordination");
  if (report.operation !== undefined) requireString(report.operation, "Agent coordination operation must be a string");
  if (report.executionSimulation !== undefined) {
    requireString(report.executionSimulation, "Agent coordination executionSimulation must be a string");
  }
  if (report.hash !== undefined) {
    requireString(report.hash, "Agent coordination hash must be a string");
    validateReceiptEvidence(report.receipt, "Agent coordination");
    requireString(report.nextAssignmentCount, "Agent coordination nextAssignmentCount must be a string");
    requireString(report.nextSelectedAssignmentId, "Agent coordination nextSelectedAssignmentId must be a string");
  }
}
