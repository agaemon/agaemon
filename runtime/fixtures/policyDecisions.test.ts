import { describe, expect, it } from "vitest";

import { createAction } from "../core/action.js";
import { buildExecuteTransaction } from "../transactions/builder.js";
import {
  createPolicyDecisionFixtureSimulator,
  getPolicyDecisionFixture,
  getPolicyDecisionFixtureKey,
  POLICY_DECISION_FIXTURE_IDS,
  POLICY_DECISION_FIXTURES,
  POLICY_FIXTURE_AGENT,
  POLICY_FIXTURE_CAPABILITIES,
  POLICY_FIXTURE_TARGETS,
} from "./policyDecisions.js";

describe("policy decision fixtures", () => {
  it("keeps fixture ids and expected decisions stable", () => {
    expect(POLICY_DECISION_FIXTURE_IDS).toEqual([
      "allowed-swap",
      "denied-capability",
      "denied-borrowing",
      "denied-action-value",
      "allowed-memory",
    ]);
    expect(POLICY_DECISION_FIXTURES.map((fixture) => fixture.id)).toEqual(POLICY_DECISION_FIXTURE_IDS);
    expect(POLICY_DECISION_FIXTURES.map((fixture) => fixture.decision)).toEqual([
      { allowed: true, code: "Allowed" },
      { allowed: false, code: "CapabilityDenied" },
      { allowed: false, code: "BorrowingDenied" },
      { allowed: false, code: "ActionValueExceeded" },
      { allowed: true, code: "Allowed" },
    ]);
  });

  it("uses unique deterministic keys for fixture actions", () => {
    const keys = POLICY_DECISION_FIXTURES.map(getPolicyDecisionFixtureKey);

    expect(new Set(keys).size).toBe(POLICY_DECISION_FIXTURES.length);
    expect(keys[0]).toBe(
      [
        POLICY_FIXTURE_AGENT.toLowerCase(),
        POLICY_FIXTURE_CAPABILITIES.swap.toLowerCase(),
        POLICY_FIXTURE_TARGETS.allowedSwap.toLowerCase(),
        "123",
        "0x1234",
        "0",
      ].join("|"),
    );
  });

  it("returns expected policy decisions for every fixture action", async () => {
    const simulatePolicy = createPolicyDecisionFixtureSimulator();

    for (const fixture of POLICY_DECISION_FIXTURES) {
      await expect(simulatePolicy({ agent: fixture.agent, action: fixture.action })).resolves.toEqual(fixture.decision);
    }
  });

  it("returns a deterministic fallback for actions outside the fixture set", async () => {
    const simulatePolicy = createPolicyDecisionFixtureSimulator();

    await expect(
      simulatePolicy({
        agent: POLICY_FIXTURE_AGENT,
        action: createAction({
          capability: POLICY_FIXTURE_CAPABILITIES.swap,
          target: POLICY_FIXTURE_TARGETS.unknown,
          data: "0x9999",
        }),
      }),
    ).resolves.toEqual({ allowed: false, code: "PolicyNotConfigured" });
  });

  it("allows targeted decision overrides for fixture-backed tests", async () => {
    const fixture = getPolicyDecisionFixture("denied-action-value");
    const simulatePolicy = createPolicyDecisionFixtureSimulator({
      decisions: {
        "denied-action-value": { allowed: false, code: "DailyValueExceeded" },
      },
    });

    await expect(simulatePolicy({ agent: fixture.agent, action: fixture.action })).resolves.toEqual({
      allowed: false,
      code: "DailyValueExceeded",
    });
  });

  it("plugs fixture decisions into the transaction builder", async () => {
    const simulatePolicy = createPolicyDecisionFixtureSimulator();
    const allowed = getPolicyDecisionFixture("allowed-swap");
    const denied = getPolicyDecisionFixture("denied-capability");

    const allowedResult = await buildExecuteTransaction({
      agent: allowed.agent,
      action: allowed.action,
      simulatePolicy,
    });
    const deniedResult = await buildExecuteTransaction({
      agent: denied.agent,
      action: denied.action,
      simulatePolicy,
    });

    expect(allowedResult.allowed).toBe(true);
    expect(allowedResult.transaction?.to).toBe(POLICY_FIXTURE_AGENT);
    expect(allowedResult.transaction?.value).toBe(allowed.action.value);
    expect(deniedResult.allowed).toBe(false);
    expect(deniedResult.decision).toEqual(denied.decision);
    expect(deniedResult.transaction).toBeNull();
  });
});
