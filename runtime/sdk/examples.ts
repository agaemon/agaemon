import {
  createCoordinationAcceptanceAction,
  createCoordinationCompletionAction,
  createCoordinationEvidenceHash,
} from "../agentCore/coordination.js";
import {
  createMemoryCommitAction,
  createSingleLeafMemoryCommitment,
} from "../memory/commitment.js";
import {
  createReputationScoreSyncTransaction,
  sumReputationHistoryScore,
} from "../reputation/scoreSync.js";

import type { Address } from "viem";
import type { AgentIntentDocument } from "../agentPlanning/intentCompiler.js";
import type { AgentPlanProposalDocument } from "../agentPlanning/planProposal.js";
import type { MemoryCommitment } from "../memory/commitment.js";
import type { ExecuteTransaction } from "../transactions/builder.js";

export interface TreasuryPaymentIntentExampleParams {
  recipient: Address;
  amountWei: string;
}

export interface Erc20TransferIntentExampleParams {
  recipient: Address;
  amountRaw: string;
}

export interface SwapIntentExampleParams {
  recipient: Address;
  ethInWei: string;
  minAmountOut: string;
}

export interface MemoryCommitPlanExampleParams {
  registry: Address;
  memoryIdLabel: string;
  content: string;
  storageURI: string;
}

export interface MemoryCommitPlanExample {
  plan: AgentPlanProposalDocument;
  commitment: MemoryCommitment;
}

export interface ReputationScoreSyncExampleParams {
  registry: Address;
  agent: Address;
  registryScore: bigint;
  historyDeltas: readonly bigint[];
}

export interface ReputationScoreSyncExample {
  historyScore: bigint;
  transaction: ExecuteTransaction | null;
}

export interface CoordinationLifecyclePlanExampleParams {
  coordination: Address;
  assignmentId: bigint;
  resultURI: string;
}

export interface CoordinationLifecyclePlanExample {
  plan: AgentPlanProposalDocument;
  resultHash: `0x${string}`;
}

export function createAgentOsTreasuryPaymentIntentExample(
  params: TreasuryPaymentIntentExampleParams,
): AgentIntentDocument {
  return {
    objective: "Pay a recipient from the agent treasury",
    intents: [
      {
        id: "treasury-payment-1",
        title: "Pay recipient",
        type: "treasury-payment",
        recipient: params.recipient,
        amountWei: params.amountWei,
      },
    ],
  };
}

export function createAgentOsErc20TransferIntentExample(
  params: Erc20TransferIntentExampleParams,
): AgentIntentDocument {
  return {
    objective: "Transfer an ERC20 token",
    intents: [
      {
        id: "erc20-transfer-1",
        title: "Transfer ERC20 token",
        type: "erc20-transfer",
        recipient: params.recipient,
        amountRaw: params.amountRaw,
      },
    ],
  };
}

export function createAgentOsSwapIntentExample(params: SwapIntentExampleParams): AgentIntentDocument {
  return {
    objective: "Swap exact ETH for token",
    intents: [
      {
        id: "swap-exact-eth-for-token-1",
        title: "Swap exact ETH for token",
        type: "swap-exact-eth-for-token",
        recipient: params.recipient,
        ethInWei: params.ethInWei,
        minAmountOut: params.minAmountOut,
      },
    ],
  };
}

export function createAgentOsMemoryCommitPlanExample(
  params: MemoryCommitPlanExampleParams,
): MemoryCommitPlanExample {
  const commitment = createSingleLeafMemoryCommitment(params);

  return {
    commitment,
    plan: {
      objective: "Commit verifiable agent memory",
      steps: [
        {
          id: "memory-commit-1",
          title: "Commit memory",
          action: createMemoryCommitAction({
            registry: params.registry,
            ...commitment,
          }),
        },
      ],
    },
  };
}

export function createAgentOsReputationScoreSyncExample(
  params: ReputationScoreSyncExampleParams,
): ReputationScoreSyncExample {
  const historyScore = sumReputationHistoryScore(params.historyDeltas);

  return {
    historyScore,
    transaction: createReputationScoreSyncTransaction({
      registry: params.registry,
      agent: params.agent,
      registryScore: params.registryScore,
      historyScore,
    }),
  };
}

export function createAgentOsCoordinationLifecyclePlanExample(
  params: CoordinationLifecyclePlanExampleParams,
): CoordinationLifecyclePlanExample {
  const resultHash = createCoordinationEvidenceHash(params.resultURI);

  return {
    resultHash,
    plan: {
      objective: "Accept and complete a coordination assignment",
      steps: [
        {
          id: "coordination-accept-1",
          title: "Accept assignment",
          action: createCoordinationAcceptanceAction({
            coordination: params.coordination,
            assignmentId: params.assignmentId,
          }),
        },
        {
          id: "coordination-complete-1",
          title: "Complete assignment",
          action: createCoordinationCompletionAction({
            coordination: params.coordination,
            assignmentId: params.assignmentId,
            resultHash,
          }),
        },
      ],
    },
  };
}
