import type { Address } from "viem";

import type { AgentAction } from "./action.js";

export const POLICY_DECISION_CODES = [
  "Allowed",
  "PolicyNotConfigured",
  "CapabilityDenied",
  "ActionValueExceeded",
  "DailyValueExceeded",
  "BorrowingDenied",
  "TokenPolicyNotConfigured",
  "InvalidTokenTransfer",
  "TokenActionAmountExceeded",
  "TokenDailyAmountExceeded",
  "SwapPolicyNotConfigured",
  "InvalidSwap",
  "SwapMinOutputTooLow",
] as const;

export type PolicyDecisionCode = (typeof POLICY_DECISION_CODES)[number];

export interface PolicyDecision {
  allowed: boolean;
  code: PolicyDecisionCode;
}

export type SimulatePolicy = (request: {
  agent: Address;
  action: AgentAction;
}) => Promise<PolicyDecision>;
