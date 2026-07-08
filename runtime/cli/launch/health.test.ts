import { describe, expect, it } from "vitest";

import {
  formatLaunchHealthCliOutput,
  parseLaunchHealthCliArgs,
  runLaunchHealthCli,
} from "./health.js";
import type { BaseSepoliaHealthReport } from "../../launch/health.js";

const HEALTH_REPORT: BaseSepoliaHealthReport = {
  schemaVersion: 1,
  generatedAt: "2026-07-02T00:00:00.000Z",
  manifest: {
    path: "deployments/base-sepolia/latest.json",
    sha256: "a".repeat(64),
    network: "base-sepolia",
    chainId: 84532,
    contractCount: 5,
    transactionCount: 8,
  },
  release: { statusPath: "docs/releases/latest.json" },
  passed: true,
  summary: { checks: 4, passed: 4, failed: 0, warnings: 0 },
  checks: [
    {
      id: "manifest-shape",
      label: "Deployment manifest shape",
      severity: "critical",
      passed: true,
      failures: [],
      remediation: "Regenerate deployments/base-sepolia/latest.json from the deployment scripts.",
    },
  ],
};

describe("parseLaunchHealthCliArgs", () => {
  it("parses custom paths, output, format, and live-check flags", () => {
    expect(parseLaunchHealthCliArgs([
      "--manifest", "deployments/base-sepolia/custom.json",
      "--status=docs/releases/custom.json",
      "--output", "artifacts/health.json",
      "--agent-account-safety", "artifacts/agent-account-safety.json",
      "--format", "summary",
      "--max-release-age-days", "7",
      "--skip-live",
    ])).toEqual({
      manifestPath: "deployments/base-sepolia/custom.json",
      statusPath: "docs/releases/custom.json",
      outputPath: "artifacts/health.json",
      agentAccountSafetyPath: "artifacts/agent-account-safety.json",
      format: "summary",
      maxReleaseAgeDays: 7,
      skipLive: true,
    });
  });
});

describe("runLaunchHealthCli", () => {
  it("writes a health report and does not require PRIVATE_KEY", async () => {
    const outputs: string[] = [];
    const writes: Array<{ path: string; contents: string }> = [];
    const healthParams: unknown[] = [];
    let exitCode: number | undefined;

    await runLaunchHealthCli({
      argv: [
        "--skip-live",
        "--output",
        "artifacts/base-sepolia-health.json",
        "--agent-account-safety",
        "artifacts/agent-account-safety.json",
      ],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => { exitCode = code; },
      readText: async (path) => path.endsWith("agent-account-safety.json")
        ? JSON.stringify({ path })
        : `${path} contents`,
      writeText: async (path, contents) => { writes.push({ path, contents }); },
      createHealthReport: (params) => {
        healthParams.push(params);
        return HEALTH_REPORT;
      },
    });

    expect(exitCode).toBeUndefined();
    expect(outputs[0]).toContain("\"passed\": true");
    expect(writes).toEqual([
      { path: "artifacts/base-sepolia-health.json", contents: `${JSON.stringify(HEALTH_REPORT, null, 2)}\n` },
    ]);
    expect(healthParams[0]).toMatchObject({
      agentAccountSafety: { path: "artifacts/agent-account-safety.json" },
    });
  });

  it("forwards live operator balances and owner pending nonce into health reports", async () => {
    const healthParams: unknown[] = [];

    await runLaunchHealthCli({
      argv: [],
      env: { BASE_SEPOLIA_RPC_URL: "https://example.invalid" },
      writeOutput: () => {},
      loadDotEnv: () => {},
      readText: async (path) => `${path} contents`,
      readManifest: async () => ({
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
          deployCapabilityRegistry: `0x${"11".repeat(32)}`,
          deployPolicyEngine: `0x${"22".repeat(32)}`,
          deployReputationRegistry: `0x${"33".repeat(32)}`,
          deployAgentAccount: `0x${"44".repeat(32)}`,
          deployTestTargetProtocol: `0x${"55".repeat(32)}`,
          setCapability: `0x${"66".repeat(32)}`,
          setPolicy: `0x${"77".repeat(32)}`,
          smokeExecute: `0x${"88".repeat(32)}`,
        },
        smokeTest: {
          capability: `0x${"99".repeat(32)}`,
          targetWasCalled: true,
        },
      }),
      createPublicClient: () => ({
        getChainId: async () => 84532,
        getCode: async () => "0x01",
        getTransactionReceipt: async () => ({ status: "success", blockNumber: 1n }),
        getBalance: async ({ address }) => address.endsWith("1004") ? 0n : 1000000000000000000n,
        getTransactionCount: async () => 7,
      }),
      verifyManifest: async () => ({
        network: "base-sepolia",
        chainId: { expected: 84532, actual: 84532, passed: true },
        contracts: [],
        transactions: [],
        summary: { contractCount: 0, transactionCount: 0, failedChecks: 0, passed: true },
      }),
      createHealthReport: (params) => {
        healthParams.push(params);
        return HEALTH_REPORT;
      },
    });

    expect(healthParams[0]).toMatchObject({
      operatorAccountState: {
        owner: "0x3124475af0ba367fFf33a5DC9BcE78c41f493713",
        ownerBalanceWei: "1000000000000000000",
        ownerPendingNonce: 7,
        agentAccount: "0x0000000000000000000000000000000000001004",
        agentBalanceWei: "0",
      },
    });
  });

  it("rejects malformed injected health reports before output or exit-code mutation", async () => {
    const outputs: string[] = [];
    let exitCode: number | undefined;

    await expect(runLaunchHealthCli({
      argv: ["--skip-live"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => { exitCode = code; },
      readText: async (path) => `${path} contents`,
      createHealthReport: () => ({ ...HEALTH_REPORT, passed: "yes" }) as unknown as BaseSepoliaHealthReport,
    })).rejects.toThrow("health report passed must be a boolean");

    expect(outputs).toEqual([]);
    expect(exitCode).toBeUndefined();
  });
});

describe("formatLaunchHealthCliOutput", () => {
  it("formats summary output", () => {
    expect(formatLaunchHealthCliOutput(HEALTH_REPORT, "summary")).toContain("Base Sepolia health");
  });
});
