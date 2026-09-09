import { describe, expect, it } from "vitest";

import { verifyAgentProposalArtifact } from "./verify.js";

const AGENT = "0x0000000000000000000000000000000000000a01";
const TARGET = "0x0000000000000000000000000000000000000b01";
const CAPABILITY = `0x${"11".repeat(32)}`;

const VALID_EXECUTABLE_PLAN_ARTIFACT = {
  mode: "dry-run",
  chainId: 84532,
  manifest: "deployments/base-sepolia/latest.json",
  plan: "artifacts/example-agent-plan.json",
  objective: "Dry-run a structured plan",
  agent: AGENT,
  executable: true,
  steps: [
    {
      id: "step-1",
      title: "Allowed action",
      action: {
        capability: CAPABILITY,
        target: TARGET,
        valueWei: "123",
        data: "0x1234",
        usesBorrowing: false,
      },
      decision: {
        allowed: true,
        code: "Allowed",
      },
      transaction: {
        to: AGENT,
        value: "123",
        data: "0xabcd",
      },
    },
  ],
};

const VALID_DENIED_INTENT_ARTIFACT = {
  mode: "dry-run",
  chainId: 84532,
  manifest: "deployments/base-sepolia/latest.json",
  intent: "artifacts/example-agent-intents.json",
  objective: "Dry-run operator intents",
  agent: AGENT,
  executable: false,
  steps: [
    {
      id: "intent-1",
      title: "Denied action",
      action: {
        capability: CAPABILITY,
        target: TARGET,
        valueWei: "0",
        data: "0x1234",
        usesBorrowing: false,
      },
      decision: {
        allowed: false,
        code: "CapabilityDenied",
      },
      transaction: null,
    },
  ],
};

describe("verifyAgentProposalArtifact", () => {
  it("rejects legacy executable multi-step evidence", () => {
    const artifact = structuredClone(VALID_EXECUTABLE_PLAN_ARTIFACT);
    artifact.steps.push({ ...artifact.steps[0]!, id: "step-2" });
    expect(verifyAgentProposalArtifact(JSON.stringify(artifact)).passed).toBe(false);
  });

  it.each([undefined, "single-step-policy-allowed", "sequence-verified"])(
    "rejects executable multi-step claims regardless of metadata (%s)", (validationStatus) => {
      const artifact = {
        ...VALID_EXECUTABLE_PLAN_ARTIFACT, validationStatus,
        steps: [VALID_EXECUTABLE_PLAN_ARTIFACT.steps[0], VALID_EXECUTABLE_PLAN_ARTIFACT.steps[0]],
      };
      expect(verifyAgentProposalArtifact(JSON.stringify(artifact)).failures).toContain(
        "multi-step proposals require sequence validation and cannot be executable",
      );
    },
  );

  it("accepts unverified diagnostic sequences but rejects contradictory metadata", () => {
    const step = { ...VALID_EXECUTABLE_PLAN_ARTIFACT.steps[0]!, transaction: null };
    const artifact = {
      ...VALID_EXECUTABLE_PLAN_ARTIFACT, executable: false,
      validationStatus: "sequence-unverified", steps: [step, { ...step, id: "step-2" }],
    };
    expect(verifyAgentProposalArtifact(JSON.stringify(artifact)).passed).toBe(true);
    artifact.validationStatus = "policy-denied";
    expect(verifyAgentProposalArtifact(JSON.stringify(artifact)).failures).toContain(
      "validationStatus must match independent policy checks",
    );
  });

  it("accepts a valid plan-backed executable proposal artifact", () => {
    expect(verifyAgentProposalArtifact(JSON.stringify(VALID_EXECUTABLE_PLAN_ARTIFACT))).toEqual({
      passed: true,
      failures: [],
      source: "plan",
      sourcePath: "artifacts/example-agent-plan.json",
      chainId: 84532,
      executable: true,
      steps: 1,
      transactions: 1,
    });
  });

  it("accepts a valid intent-backed denied proposal artifact with suppressed transactions", () => {
    expect(verifyAgentProposalArtifact(JSON.stringify(VALID_DENIED_INTENT_ARTIFACT))).toMatchObject({
      passed: true,
      source: "intent",
      sourcePath: "artifacts/example-agent-intents.json",
      executable: false,
      transactions: 0,
    });
  });

  it("rejects denied artifacts that expose transaction payloads", () => {
    const artifact = structuredClone(VALID_DENIED_INTENT_ARTIFACT) as unknown as {
      steps: Array<{ transaction: unknown }>;
    };
    artifact.steps[0]!.transaction = {
      to: AGENT,
      value: "0",
      data: "0xabcd",
    };

    expect(verifyAgentProposalArtifact(JSON.stringify(artifact)).failures).toContain(
      "non-executable proposals must not expose transaction payloads",
    );
  });

  it("rejects executable artifacts with denied decisions or missing transactions", () => {
    const artifact = structuredClone(VALID_EXECUTABLE_PLAN_ARTIFACT) as unknown as {
      steps: Array<{ decision: unknown; transaction: unknown }>;
    };
    artifact.steps[0]!.decision = {
      allowed: false,
      code: "CapabilityDenied",
    };
    artifact.steps[0]!.transaction = null;

    expect(verifyAgentProposalArtifact(JSON.stringify(artifact)).failures).toEqual([
      "executable proposals must only contain allowed decisions",
      "executable proposals must include transaction payloads for every step",
    ]);
  });
});
