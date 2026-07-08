import type { Address, Hex } from "viem";

export interface AgentAction {
  capability: Hex;
  target: Address;
  value: bigint;
  data: Hex;
  usesBorrowing: boolean;
}

export interface AgentActionInput {
  capability: Hex;
  target: Address;
  value?: bigint;
  data?: Hex;
  usesBorrowing?: boolean;
}

export function createAction(input: AgentActionInput): AgentAction {
  return {
    capability: input.capability,
    target: input.target,
    value: input.value ?? 0n,
    data: input.data ?? "0x",
    usesBorrowing: input.usesBorrowing ?? false,
  };
}
