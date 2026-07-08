import { describe, expect, it } from "vitest";

import { createAgentProposalSummary } from "./summary.js";

const AGENT = "0x0000000000000000000000000000000000000a01";
const TARGET = "0x0000000000000000000000000000000000000b01";
const CAPABILITY = `0x${"11".repeat(32)}`;

const EXECUTABLE_PLAN_ARTIFACT = {
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

const DENIED_INTENT_ARTIFACT = {
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

describe("createAgentProposalSummary", () => {
  it("renders deterministic markdown for a valid executable plan-backed artifact", () => {
    expect(
      createAgentProposalSummary({
        proposalPath: "artifacts/example-agent-proposal.json",
        proposalJson: JSON.stringify(EXECUTABLE_PLAN_ARTIFACT),
      }),
    ).toEqual({
      passed: true,
      failures: [],
      markdown: [
        "# Agent Proposal Review",
        "",
        "| Field | Value |",
        "| --- | --- |",
        "| Proposal | artifacts/example-agent-proposal.json |",
        "| Source | plan: artifacts/example-agent-plan.json |",
        "| Chain ID | 84532 |",
        "| Executable | yes |",
        "| Steps | 1 |",
        "| Allowed Decisions | 1 |",
        "| Denied Decisions | 0 |",
        "| Transactions | 1 |",
        "",
        "| Step | Title | Decision | Target | Value Wei | Transaction |",
        "| --- | --- | --- | --- | --- | --- |",
        `| step-1 | Allowed action | Allowed | ${TARGET} | 123 | present |`,
        "",
      ].join("\n"),
      source: "plan",
      sourcePath: "artifacts/example-agent-plan.json",
      executable: true,
      steps: 1,
      transactions: 1,
    });
  });

  it("renders transaction suppression for a valid denied intent-backed artifact", () => {
    const result = createAgentProposalSummary({
      proposalPath: "artifacts/example-agent-intent-proposal.json",
      proposalJson: JSON.stringify(DENIED_INTENT_ARTIFACT),
    });

    expect(result.passed).toBe(true);
    expect(result.markdown).toContain("| Source | intent: artifacts/example-agent-intents.json |");
    expect(result.markdown).toContain("| Allowed Decisions | 0 |");
    expect(result.markdown).toContain("| Denied Decisions | 1 |");
    expect(result.markdown).toContain("| Transactions | 0 |");
    expect(result.markdown).toContain(`| intent-1 | Denied action | CapabilityDenied | ${TARGET} | 0 | suppressed |`);
    expect(result.executable).toBe(false);
    expect(result.transactions).toBe(0);
  });

  it("rejects invalid artifacts using verifier failures", () => {
    expect(
      createAgentProposalSummary({
        proposalPath: "artifacts/bad-proposal.json",
        proposalJson: JSON.stringify({
          ...EXECUTABLE_PLAN_ARTIFACT,
          executable: false,
        }),
      }),
    ).toEqual({
      passed: false,
      failures: ["non-executable proposals must not expose transaction payloads"],
      markdown: "",
      source: "plan",
      sourcePath: "artifacts/example-agent-plan.json",
      executable: false,
      steps: 1,
      transactions: 1,
    });
  });
});
