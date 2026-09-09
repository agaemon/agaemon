import { AGENT_ACCOUNT_REVOCATION_CHECKS } from "../agentCore/account.js";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  createBaseSepoliaHealthReport,
  formatBaseSepoliaHealthSummary,
} from "./health.js";
import type { DeploymentManifestVerifyReport } from "../base/manifestVerifier.js";

const MANIFEST = JSON.stringify({
  network: "base-sepolia",
  chainId: 84532,
  rpcUrlEnv: "BASE_SEPOLIA_RPC_URL",
  explorerUrl: "https://sepolia.basescan.org",
  deployedAt: "2026-06-25T04:01:18Z",
  owner: "0x3124475af0ba367fFf33a5DC9BcE78c41f493713",
  contracts: {
    capabilityRegistry: "0x0000000000000000000000000000000000001001",
    policyEngine: "0x0000000000000000000000000000000000001002",
    reputationRegistry: "0x0000000000000000000000000000000000001003",
    agentAccount: "0x0000000000000000000000000000000000001004",
    testTargetProtocol: "0x0000000000000000000000000000000000001005",
  },
  transactions: {
    deployCapabilityRegistry: "0x1111111111111111111111111111111111111111111111111111111111111111",
    deployPolicyEngine: "0x2222222222222222222222222222222222222222222222222222222222222222",
    deployReputationRegistry: "0x3333333333333333333333333333333333333333333333333333333333333333",
    deployAgentAccount: "0x4444444444444444444444444444444444444444444444444444444444444444",
    deployTestTargetProtocol: "0x5555555555555555555555555555555555555555555555555555555555555555",
    setCapability: "0x6666666666666666666666666666666666666666666666666666666666666666",
    setPolicy: "0x7777777777777777777777777777777777777777777777777777777777777777",
    smokeExecute: "0x8888888888888888888888888888888888888888888888888888888888888888",
  },
  smokeTest: {
    capability: "0x497a7733c30c446bed91d579fce5ede8c3e0fbcdbe90a491d0a07e91d5b88b71",
    targetWasCalled: true,
  },
}, null, 2);

const RELEASE_STATUS = JSON.stringify({
  schemaVersion: 1,
  network: "base-sepolia",
  releaseCount: 1,
  latest: {
    note: "base-sepolia-2026-06-25-4c7e8c2.md",
    generatedAt: "2026-06-25T08:05:49.658Z",
    commitSha: "4c7e8c241f7daedade7a864af3692723fc6978dd",
    shortCommitSha: "4c7e8c2",
    manifestSha256: createHash("sha256").update(MANIFEST).digest("hex"),
    readinessRunUrl: "https://github.com/sagaratalatti/agentos-kernel/actions/runs/28155970869",
    readinessRunId: "28155970869",
    checksSummary: "12 passed, 0 failed",
  },
  releases: [
    {
      note: "base-sepolia-2026-06-25-4c7e8c2.md",
      generatedAt: "2026-06-25T08:05:49.658Z",
      commitSha: "4c7e8c241f7daedade7a864af3692723fc6978dd",
      readinessRunUrl: "https://github.com/sagaratalatti/agentos-kernel/actions/runs/28155970869",
    },
  ],
}, null, 2);

const AGENT_ACCOUNT_SAFETY = {
  chainId: 84532,
  agent: "0x0000000000000000000000000000000000001004",
  owner: "0x3124475af0ba367fFf33a5DC9BcE78c41f493713",
  paused: false,
  capabilities: "0x0000000000000000000000000000000000001001",
  policyEngine: "0x0000000000000000000000000000000000001002",
  reputationRegistry: "0x0000000000000000000000000000000000001003",
  reputation: "0",
  checks: {
    ownerMatchesManifestOwner: true,
    capabilitiesMatchManifest: true,
    policyEngineMatchesManifest: true,
    reputationRegistryMatchesManifest: true,
    delegateCallable: true,
    revokeDelegateCallable: true,
    unauthorizedRevokeDelegateDenied: true,
    zeroRevokeDelegateDenied: true,
    pauseCallable: true,
    unpauseCallable: true,
    unauthorizedPauseDenied: true,
    zeroDelegateDenied: true,
  },
};

const OPERATOR_ACCOUNT_STATE = {
  owner: "0x3124475af0ba367fFf33a5DC9BcE78c41f493713",
  ownerBalanceWei: "1000000000000000000",
  ownerPendingNonce: 7,
  agentAccount: "0x0000000000000000000000000000000000001004",
  agentBalanceWei: "0",
};

describe("createBaseSepoliaHealthReport", () => {
  it.each(AGENT_ACCOUNT_REVOCATION_CHECKS)("requires boolean %s and rejects failed evidence", (name) => {
    const params = {
      generatedAt: "2026-07-02T00:00:00.000Z",
      manifestPath: "deployments/base-sepolia/latest.json", manifestContents: MANIFEST,
      releaseStatusPath: "docs/releases/latest.json", releaseStatusJson: RELEASE_STATUS,
    };
    for (const value of [undefined, "true", null]) {
      const checks = { ...AGENT_ACCOUNT_SAFETY.checks, [name]: value };
      expect(() => createBaseSepoliaHealthReport({ ...params, agentAccountSafety: { ...AGENT_ACCOUNT_SAFETY, checks } }))
        .toThrow(`Missing or invalid ${name}`);
    }
    const report = createBaseSepoliaHealthReport({ ...params, agentAccountSafety: {
      ...AGENT_ACCOUNT_SAFETY, checks: { ...AGENT_ACCOUNT_SAFETY.checks, [name]: false },
    } });
    expect(report.checks.find((check) => check.id === "agent-account-safety")).toMatchObject({ passed: false });
    expect(report.passed).toBe(false);
  });

  it("passes with current local evidence and a passing live manifest verification", () => {
    const report = createBaseSepoliaHealthReport({
      generatedAt: "2026-07-02T00:00:00.000Z",
      manifestPath: "deployments/base-sepolia/latest.json",
      manifestContents: MANIFEST,
      releaseStatusPath: "docs/releases/latest.json",
      releaseStatusJson: RELEASE_STATUS,
      manifestVerification: {
        network: "base-sepolia",
        chainId: { expected: 84532, actual: 84532, passed: true },
        contracts: [],
        transactions: [],
        summary: {
          contractCount: 5,
          transactionCount: 8,
          failedChecks: 0,
          passed: true,
        },
      },
    });

    expect(report.passed).toBe(true);
    expect(report.summary).toEqual({ checks: 5, passed: 5, failed: 0, warnings: 0 });
    expect(report.checks.map((check) => check.id)).toEqual([
      "manifest-shape",
      "release-status-schema",
      "release-manifest-sha",
      "release-freshness",
      "live-manifest-verification",
    ]);
    expect(formatBaseSepoliaHealthSummary(report)).toContain("overall: passed");
  });

  it("fails when the release status points at a stale manifest hash", () => {
    const status = RELEASE_STATUS.replace(
      createHash("sha256").update(MANIFEST).digest("hex"),
      "0".repeat(64),
    );

    const report = createBaseSepoliaHealthReport({
      generatedAt: "2026-07-02T00:00:00.000Z",
      manifestPath: "deployments/base-sepolia/latest.json",
      manifestContents: MANIFEST,
      releaseStatusPath: "docs/releases/latest.json",
      releaseStatusJson: status,
    });

    expect(report.passed).toBe(false);
    expect(report.checks.find((check) => check.id === "release-manifest-sha")).toMatchObject({
      passed: false,
      severity: "critical",
      failures: ["release manifest SHA-256 does not match current manifest"],
    });
  });

  it("fails stale releases with a remediation note", () => {
    const report = createBaseSepoliaHealthReport({
      generatedAt: "2026-07-20T00:00:00.000Z",
      maxReleaseAgeDays: 14,
      manifestPath: "deployments/base-sepolia/latest.json",
      manifestContents: MANIFEST,
      releaseStatusPath: "docs/releases/latest.json",
      releaseStatusJson: RELEASE_STATUS,
    });

    expect(report.checks.find((check) => check.id === "release-freshness")).toMatchObject({
      passed: false,
      severity: "warning",
      remediation: "Refresh release evidence or record why launch proceeds with an older readiness run.",
    });
    expect(report.summary.warnings).toBe(1);
  });

  it("rejects malformed injected live manifest verification reports", () => {
    expect(() =>
      createBaseSepoliaHealthReport({
        manifestPath: "deployments/base-sepolia/latest.json",
        manifestContents: MANIFEST,
        releaseStatusPath: "docs/releases/latest.json",
        releaseStatusJson: RELEASE_STATUS,
        manifestVerification: { summary: { passed: "yes" } } as unknown as DeploymentManifestVerifyReport,
      }),
    ).toThrow("manifest verification summary passed must be a boolean");
  });

  it("passes saved agent account safety evidence", () => {
    const report = createBaseSepoliaHealthReport({
      generatedAt: "2026-07-02T00:00:00.000Z",
      manifestPath: "deployments/base-sepolia/latest.json",
      manifestContents: MANIFEST,
      releaseStatusPath: "docs/releases/latest.json",
      releaseStatusJson: RELEASE_STATUS,
      agentAccountSafety: AGENT_ACCOUNT_SAFETY,
    });

    expect(report.checks.find((check) => check.id === "agent-account-safety")).toMatchObject({
      passed: true,
      severity: "critical",
      failures: [],
    });
  });

  it("fails saved agent account safety evidence when the agent is paused", () => {
    const report = createBaseSepoliaHealthReport({
      generatedAt: "2026-07-02T00:00:00.000Z",
      manifestPath: "deployments/base-sepolia/latest.json",
      manifestContents: MANIFEST,
      releaseStatusPath: "docs/releases/latest.json",
      releaseStatusJson: RELEASE_STATUS,
      agentAccountSafety: { ...AGENT_ACCOUNT_SAFETY, paused: true },
    });

    expect(report.checks.find((check) => check.id === "agent-account-safety")).toMatchObject({
      passed: false,
      failures: ["agent account must be unpaused"],
    });
  });

  it("fails saved agent account safety evidence when a safety check failed", () => {
    const report = createBaseSepoliaHealthReport({
      generatedAt: "2026-07-02T00:00:00.000Z",
      manifestPath: "deployments/base-sepolia/latest.json",
      manifestContents: MANIFEST,
      releaseStatusPath: "docs/releases/latest.json",
      releaseStatusJson: RELEASE_STATUS,
      agentAccountSafety: {
        ...AGENT_ACCOUNT_SAFETY,
        checks: { ...AGENT_ACCOUNT_SAFETY.checks, delegateCallable: false },
      },
    });

    expect(report.checks.find((check) => check.id === "agent-account-safety")).toMatchObject({
      passed: false,
      failures: ["agent account safety check delegateCallable failed"],
    });
  });

  it("rejects malformed saved agent account safety evidence", () => {
    expect(() =>
      createBaseSepoliaHealthReport({
        manifestPath: "deployments/base-sepolia/latest.json",
        manifestContents: MANIFEST,
        releaseStatusPath: "docs/releases/latest.json",
        releaseStatusJson: RELEASE_STATUS,
        agentAccountSafety: { ...AGENT_ACCOUNT_SAFETY, paused: "false" },
      }),
    ).toThrow("agent account safety paused must be a boolean");
  });

  it("passes live operator account state evidence", () => {
    const report = createBaseSepoliaHealthReport({
      generatedAt: "2026-07-02T00:00:00.000Z",
      manifestPath: "deployments/base-sepolia/latest.json",
      manifestContents: MANIFEST,
      releaseStatusPath: "docs/releases/latest.json",
      releaseStatusJson: RELEASE_STATUS,
      operatorAccountState: OPERATOR_ACCOUNT_STATE,
    });

    expect(report.operator).toEqual(OPERATOR_ACCOUNT_STATE);
    expect(report.checks.find((check) => check.id === "operator-account-state")).toMatchObject({
      passed: true,
      severity: "warning",
      failures: [],
    });
  });

  it("warns when the manifest owner has no gas balance", () => {
    const report = createBaseSepoliaHealthReport({
      generatedAt: "2026-07-02T00:00:00.000Z",
      manifestPath: "deployments/base-sepolia/latest.json",
      manifestContents: MANIFEST,
      releaseStatusPath: "docs/releases/latest.json",
      releaseStatusJson: RELEASE_STATUS,
      operatorAccountState: { ...OPERATOR_ACCOUNT_STATE, ownerBalanceWei: "0" },
    });

    expect(report.checks.find((check) => check.id === "operator-account-state")).toMatchObject({
      passed: false,
      severity: "warning",
      failures: ["manifest owner balance is zero"],
    });
  });

  it("rejects malformed live operator account state evidence", () => {
    expect(() =>
      createBaseSepoliaHealthReport({
        manifestPath: "deployments/base-sepolia/latest.json",
        manifestContents: MANIFEST,
        releaseStatusPath: "docs/releases/latest.json",
        releaseStatusJson: RELEASE_STATUS,
        operatorAccountState: { ...OPERATOR_ACCOUNT_STATE, ownerPendingNonce: "7" },
      }),
    ).toThrow("operator account state ownerPendingNonce must be a non-negative integer");
  });
});
