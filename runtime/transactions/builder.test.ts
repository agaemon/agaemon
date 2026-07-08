import { describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";

import { createAction } from "../core/action.js";
import { buildExecuteTransaction } from "./builder.js";
import type { PolicyDecision } from "../core/policy.js";

const AGENT = "0x0000000000000000000000000000000000000a01" as Address;
const TARGET = "0x0000000000000000000000000000000000000b01" as Address;
const SWAP = `0x${"11".repeat(32)}` as Hex;

describe("buildExecuteTransaction", () => {
  it("returns no transaction when policy simulation denies the action", async () => {
    const action = createAction({
      capability: SWAP,
      target: TARGET,
      data: "0x1234",
    });

    const result = await buildExecuteTransaction({
      agent: AGENT,
      action,
      simulatePolicy: async (): Promise<PolicyDecision> => ({
        allowed: false,
        code: "CapabilityDenied",
      }),
    });

    expect(result.allowed).toBe(false);
    expect(result.transaction).toBeNull();
    expect(result.decision.code).toBe("CapabilityDenied");
  });

  it("returns an execute transaction when policy simulation allows the action", async () => {
    const action = createAction({
      capability: SWAP,
      target: TARGET,
      data: "0x1234",
    });

    const result = await buildExecuteTransaction({
      agent: AGENT,
      action,
      simulatePolicy: async (): Promise<PolicyDecision> => ({
        allowed: true,
        code: "Allowed",
      }),
    });

    expect(result.allowed).toBe(true);
    expect(result.transaction?.to).toBe(AGENT);
    expect(result.transaction?.value).toBe(0n);
    expect(result.transaction?.data).toMatch(/^0x[0-9a-f]+$/);
  });

  it("sets transaction value from the allowed action value", async () => {
    const action = createAction({
      capability: SWAP,
      target: TARGET,
      value: 123n,
      data: "0x1234",
    });

    const result = await buildExecuteTransaction({
      agent: AGENT,
      action,
      simulatePolicy: async (): Promise<PolicyDecision> => ({
        allowed: true,
        code: "Allowed",
      }),
    });

    expect(result.allowed).toBe(true);
    expect(result.transaction?.value).toBe(123n);
  });
});
