import { encodeFunctionData } from "viem";
import type { Address, Hex } from "viem";

import type { AgentAction } from "../core/action.js";
import type { PolicyDecision, SimulatePolicy } from "../core/policy.js";

const AGENT_ABI = [
  {
    type: "function",
    name: "execute",
    stateMutability: "payable",
    inputs: [
      {
        name: "action",
        type: "tuple",
        components: [
          { name: "capability", type: "bytes32" },
          { name: "target", type: "address" },
          { name: "value", type: "uint256" },
          { name: "data", type: "bytes" },
          { name: "usesBorrowing", type: "bool" },
        ],
      },
    ],
    outputs: [{ name: "result", type: "bytes" }],
  },
] as const;

export interface ExecuteTransaction {
  to: Address;
  value: bigint;
  data: Hex;
}

export interface BuildExecuteTransactionParams {
  agent: Address;
  action: AgentAction;
  simulatePolicy: SimulatePolicy;
}

export type BuildExecuteTransactionResult =
  | {
      allowed: true;
      decision: PolicyDecision;
      transaction: ExecuteTransaction;
    }
  | {
      allowed: false;
      decision: PolicyDecision;
      transaction: null;
    };

export async function buildExecuteTransaction(
  params: BuildExecuteTransactionParams,
): Promise<BuildExecuteTransactionResult> {
  const decision = await params.simulatePolicy({
    agent: params.agent,
    action: params.action,
  });

  if (!decision.allowed) {
    return {
      allowed: false,
      decision,
      transaction: null,
    };
  }

  return {
    allowed: true,
    decision,
    transaction: {
      to: params.agent,
      value: params.action.value,
      data: encodeFunctionData({
        abi: AGENT_ABI,
        functionName: "execute",
        args: [params.action],
      }),
    },
  };
}
