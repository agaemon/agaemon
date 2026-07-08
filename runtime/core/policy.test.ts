import { describe, expect, it } from "vitest";

import { POLICY_DECISION_CODES } from "./policy.js";

describe("policy decision codes", () => {
  it("keeps the runtime policy code set stable and unique", () => {
    expect(POLICY_DECISION_CODES).toEqual([
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
    ]);
    expect(new Set(POLICY_DECISION_CODES).size).toBe(POLICY_DECISION_CODES.length);
  });
});
