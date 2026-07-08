import type { Address } from "viem";

import { createReputationAdjustTransaction } from "./registry.js";
import type { ExecuteTransaction } from "../transactions/builder.js";

export interface CreateReputationScoreSyncTransactionParams {
  registry: Address;
  agent: Address;
  registryScore: bigint;
  historyScore: bigint;
}

export function sumReputationHistoryScore(deltas: readonly bigint[]): bigint {
  const score = deltas.reduce((total, delta) => total + delta, 0n);
  if (score < 0n) throw new Error("history score must not be negative");
  return score;
}

export function createReputationScoreSyncTransaction(
  params: CreateReputationScoreSyncTransactionParams,
): ExecuteTransaction | null {
  if (params.historyScore < 0n) throw new Error("history score must not be negative");

  const delta = params.historyScore - params.registryScore;
  if (delta === 0n) return null;

  return createReputationAdjustTransaction({
    registry: params.registry,
    agent: params.agent,
    delta,
  });
}
