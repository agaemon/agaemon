import { decodeFunctionData, zeroHash } from "viem";
import type { Address, Hex } from "viem";
import { describe, expect, it } from "vitest";

import { PAYOUT_CAPABILITY, PAYOUT_RULE_ABI } from "./rule.js";
import {
  createCoordinationAssignmentPayoutAction,
  reconcileCoordinationAssignmentPayout,
} from "./coordination.js";
import type {
  CoordinationAssignmentPayoutAssignment,
  CoordinationAssignmentPayoutRuleState,
} from "./coordination.js";
import type { PolicyDecision } from "../core/policy.js";

const assignee = "0x0000000000000000000000000000000000000a11" as Address;
const owner = "0x0000000000000000000000000000000000000b0b" as Address;
const adapter = "0x0000000000000000000000000000000000000c00" as Address;
const resultHash = "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex;

describe("createCoordinationAssignmentPayoutAction", () => {
  it("builds a PAYOUT action to the assignee for an assignee-completed assignment", () => {
    const action = createCoordinationAssignmentPayoutAction({
      assignmentId: 3n,
      assignment: {
        assignee,
        statusCode: 2,
        completedBy: assignee,
        resultHash,
      },
      adapter,
      amountWei: 1_000_000_000_000n,
    });

    const decoded = decodeFunctionData({
      abi: PAYOUT_RULE_ABI,
      data: action.data,
    });

    expect(action.capability).toBe(PAYOUT_CAPABILITY);
    expect(action.target).toBe(adapter);
    expect(action.value).toBe(1_000_000_000_000n);
    expect(action.usesBorrowing).toBe(false);
    expect(decoded.functionName).toBe("payout");
    expect(decoded.args).toStrictEqual([assignee]);
  });

  it("rejects assignments that are not completed", () => {
    expect(() =>
      createCoordinationAssignmentPayoutAction({
        assignmentId: 3n,
        assignment: {
          assignee,
          statusCode: 1,
          completedBy: assignee,
          resultHash,
        },
        adapter,
        amountWei: 1_000_000_000_000n,
      }),
    ).toThrow("assignment 3 is not completed");
  });

  it("rejects owner-completed assignments", () => {
    expect(() =>
      createCoordinationAssignmentPayoutAction({
        assignmentId: 3n,
        assignment: {
          assignee,
          statusCode: 2,
          completedBy: owner,
          resultHash,
        },
        adapter,
        amountWei: 1_000_000_000_000n,
      }),
    ).toThrow("assignment 3 was not completed by the assignee");
  });

  it("rejects zero payout amounts", () => {
    expect(() =>
      createCoordinationAssignmentPayoutAction({
        assignmentId: 3n,
        assignment: {
          assignee,
          statusCode: 2,
          completedBy: assignee,
          resultHash,
        },
        adapter,
        amountWei: 0n,
      }),
    ).toThrow("coordination payout amount must be greater than zero");
  });

  it("rejects completed assignments without result evidence", () => {
    expect(() =>
      createCoordinationAssignmentPayoutAction({
        assignmentId: 3n,
        assignment: {
          assignee,
          statusCode: 2,
          completedBy: assignee,
          resultHash: zeroHash,
        },
        adapter,
        amountWei: 1_000_000_000_000n,
      }),
    ).toThrow("assignment 3 has no result evidence");
  });
});

describe("reconcileCoordinationAssignmentPayout", () => {
  const completedAssignment = {
    assignee,
    statusCode: 2,
    completedBy: assignee,
    resultHash,
  } satisfies CoordinationAssignmentPayoutAssignment;
  const enabledRule = {
    maxActionValue: 2_000_000_000_000n,
    maxDailyValue: 5_000_000_000_000n,
    enabled: true,
    dailyPaid: 0n,
  } satisfies CoordinationAssignmentPayoutRuleState;
  const allowedPolicy = {
    allowed: true,
    code: "Allowed",
  } satisfies PolicyDecision;
  const recordedReceipt = {
    agent: assignee,
    recipient: assignee,
    amountWei: 1_000_000_000_000n,
    payoutTxHash: "0x2222222222222222222222222222222222222222222222222222222222222222" as Hex,
    blockNumber: 123n,
    timestamp: 456n,
    recorded: true,
  };

  it("classifies an eligible assignment as paid when daily payout evidence exactly matches the amount", () => {
    const result = reconcileCoordinationAssignmentPayout({
      assignmentId: 3n,
      assignment: completedAssignment,
      amountWei: 1_000_000_000_000n,
      payoutRule: {
        ...enabledRule,
        dailyPaid: 1_000_000_000_000n,
      },
      policyDecision: allowedPolicy,
    });

    expect(result.status).toBe("paid");
    expect(result.reason).toBe("daily-payout-exact-amount");
    expect(result.evidenceSource).toBe("payout-adapter-daily-bucket");
    expect(result.recipient).toBe(assignee);
  });

  it("classifies an eligible assignment as unpaid when rule and policy allow payout", () => {
    const result = reconcileCoordinationAssignmentPayout({
      assignmentId: 3n,
      assignment: completedAssignment,
      amountWei: 1_000_000_000_000n,
      payoutRule: enabledRule,
      policyDecision: allowedPolicy,
    });

    expect(result.status).toBe("unpaid");
    expect(result.reason).toBe("ready-for-payout");
    expect(result.evidenceSource).toBe("payout-adapter-daily-bucket");
    expect(result.budget).toEqual({
      passed: true,
      failures: [],
      amountWei: "1000000000000",
      maxActionWei: "2000000000000",
      maxPeriodWei: "5000000000000",
      periodSpentWei: "0",
      remainingPeriodWei: "4000000000000",
    });
  });

  it("classifies disabled assignee payout rules as blocked", () => {
    const result = reconcileCoordinationAssignmentPayout({
      assignmentId: 3n,
      assignment: completedAssignment,
      amountWei: 1_000_000_000_000n,
      payoutRule: {
        ...enabledRule,
        enabled: false,
      },
      policyDecision: allowedPolicy,
    });

    expect(result.status).toBe("blocked");
    expect(result.reason).toBe("payout-rule-disabled");
  });

  it("classifies daily limit exhaustion as blocked", () => {
    const result = reconcileCoordinationAssignmentPayout({
      assignmentId: 3n,
      assignment: completedAssignment,
      amountWei: 1_000_000_000_000n,
      payoutRule: {
        ...enabledRule,
        maxDailyValue: 1_200_000_000_000n,
        dailyPaid: 500_000_000_000n,
      },
      policyDecision: allowedPolicy,
    });

    expect(result.status).toBe("blocked");
    expect(result.reason).toBe("payout-daily-limit-exceeded");
    expect(result.budget.failures).toEqual(["budget spend exceeds remaining period budget"]);
  });

  it("classifies policy denial as blocked", () => {
    const result = reconcileCoordinationAssignmentPayout({
      assignmentId: 3n,
      assignment: completedAssignment,
      amountWei: 1_000_000_000_000n,
      payoutRule: enabledRule,
      policyDecision: {
        allowed: false,
        code: "DailyValueExceeded",
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.reason).toBe("policy-denied");
    expect(result.policyDecision?.code).toBe("DailyValueExceeded");
  });

  it("prefers matching assignment payout receipt evidence over daily payout buckets", () => {
    const result = reconcileCoordinationAssignmentPayout({
      assignmentId: 3n,
      assignment: completedAssignment,
      amountWei: 1_000_000_000_000n,
      payoutRule: enabledRule,
      payoutReceipt: recordedReceipt,
      policyDecision: allowedPolicy,
    });

    expect(result.status).toBe("paid");
    expect(result.reason).toBe("assignment-payout-receipt-recorded");
    expect(result.evidenceSource).toBe("coordination-payout-receipt-registry");
    expect(result.receipt?.payoutTxHash).toBe(recordedReceipt.payoutTxHash);
  });

  it("blocks when a recorded assignment payout receipt does not match the expected payout", () => {
    const result = reconcileCoordinationAssignmentPayout({
      assignmentId: 3n,
      assignment: completedAssignment,
      amountWei: 1_000_000_000_000n,
      payoutRule: enabledRule,
      payoutReceipt: {
        ...recordedReceipt,
        amountWei: 2_000_000_000_000n,
      },
      policyDecision: allowedPolicy,
    });

    expect(result.status).toBe("blocked");
    expect(result.reason).toBe("payout-receipt-mismatch");
    expect(result.evidenceSource).toBe("coordination-payout-receipt-registry");
  });

  it("classifies owner-completed assignments as blocked", () => {
    const result = reconcileCoordinationAssignmentPayout({
      assignmentId: 3n,
      assignment: {
        ...completedAssignment,
        completedBy: owner,
      },
      amountWei: 1_000_000_000_000n,
      payoutRule: enabledRule,
      policyDecision: allowedPolicy,
    });

    expect(result.status).toBe("blocked");
    expect(result.reason).toBe("assignment-not-completed-by-assignee");
  });
});
