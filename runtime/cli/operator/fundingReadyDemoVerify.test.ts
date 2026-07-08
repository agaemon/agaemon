import { describe, expect, it } from "vitest";

import type {
  CreateFundingReadyOperatorDemoReportParams,
  FundingReadyOperatorDemoReport,
  FundingReadyOperatorDemoVerification,
} from "../../operator/fundingReadyDemo.js";
import {
  formatFundingReadyOperatorDemoVerifyCliOutput,
  parseFundingReadyOperatorDemoVerifyCliArgs,
  runFundingReadyOperatorDemoVerifyCli,
} from "./fundingReadyDemoVerify.js";

const REPORT: FundingReadyOperatorDemoReport = {
  schemaVersion: 1,
  generatedAt: "2026-07-03T00:00:00.000Z",
  network: "base-sepolia",
  objective: "AgentOS Kernel becomes a credible funding-ready AI x blockchain proof.",
  passed: true,
  summary: { checks: 7, passed: 7, failed: 0 },
  economicAbuseSignals: { count: 0, amountWei: "0" },
  trustBoundary: {
    ai: "proposes",
    policy: "decides",
    accounts: "execute",
    mainnet: false,
    liveFunds: false,
  },
  evidence: {
    launchGate: { path: "artifacts/base-sepolia-launch-gate.json" },
    health: { path: "artifacts/base-sepolia-health.json" },
    releaseStatus: { path: "docs/releases/latest.json" },
    eventIndex: { path: "artifacts/base-event-index.json" },
    eventIndexVerification: { path: "artifacts/base-event-index-verification.json" },
    economicPayoutSummaryVerification: { path: "artifacts/economic-payout-summary-verification.json" },
    dashboard: { path: "artifacts/operator-dashboard.json" },
    dashboardVerification: { path: "artifacts/operator-dashboard-verification.json" },
  },
  checks: [
    { id: "launch-gate", label: "Launch gate is go", passed: true, failures: [] },
    { id: "health", label: "Monitoring and health evidence is passing", passed: true, failures: [] },
    {
      id: "release-status",
      label: "Release status has a latest verified readiness run",
      passed: true,
      failures: [],
    },
    {
      id: "event-index",
      label: "Indexed events are verified and economic events are visible",
      passed: true,
      failures: [],
    },
    { id: "economic-evidence", label: "Economic evidence is verified and visible", passed: true, failures: [] },
    { id: "dashboard", label: "Operator dashboard presents the full proof", passed: true, failures: [] },
    {
      id: "trust-boundary",
      label: "AI proposes, policy decides, accounts execute",
      passed: true,
      failures: [],
    },
  ],
};

const VERIFICATION: FundingReadyOperatorDemoVerification = {
  passed: true,
  failures: [],
  expected: REPORT,
};

describe("parseFundingReadyOperatorDemoVerifyCliArgs", () => {
  it("parses saved proof, source evidence, output, and format paths", () => {
    expect(parseFundingReadyOperatorDemoVerifyCliArgs([
      "--demo", "artifacts/custom-demo.json",
      "--launch-gate", "artifacts/launch.json",
      "--health=artifacts/health.json",
      "--release-status", "docs/releases/custom.json",
      "--event-index", "artifacts/events.json",
      "--event-index-verification=artifacts/events-verify.json",
      "--economic-payout-summary-verification", "artifacts/economic-verify.json",
      "--dashboard", "artifacts/dashboard.json",
      "--dashboard-verification=artifacts/dashboard-verify.json",
      "--output", "artifacts/funding-ready-demo-verification.json",
      "--format", "summary",
    ])).toEqual({
      demoPath: "artifacts/custom-demo.json",
      launchGatePath: "artifacts/launch.json",
      healthPath: "artifacts/health.json",
      releaseStatusPath: "docs/releases/custom.json",
      eventIndexPath: "artifacts/events.json",
      eventIndexVerificationPath: "artifacts/events-verify.json",
      economicPayoutSummaryVerificationPath: "artifacts/economic-verify.json",
      dashboardPath: "artifacts/dashboard.json",
      dashboardVerificationPath: "artifacts/dashboard-verify.json",
      outputPath: "artifacts/funding-ready-demo-verification.json",
      format: "summary",
    });
  });
});

describe("runFundingReadyOperatorDemoVerifyCli", () => {
  it("verifies a saved proof locally without RPC or PRIVATE_KEY", async () => {
    const outputs: string[] = [];
    const writes: unknown[] = [];
    const createParams: CreateFundingReadyOperatorDemoReportParams[] = [];
    const env: Record<string, string | undefined> = {};

    await runFundingReadyOperatorDemoVerifyCli({
      argv: ["--output", "artifacts/funding-ready-demo-verification.json", "--format", "summary"],
      env,
      writeOutput: (output) => outputs.push(output),
      readText: async (path) => path === "artifacts/funding-ready-demo.json"
        ? JSON.stringify(REPORT)
        : JSON.stringify({ path, passed: true }),
      writeText: async (path, contents) => { writes.push({ path, contents }); },
      createReport: (params) => {
        createParams.push(params);
        return REPORT;
      },
      verifyReport: () => VERIFICATION,
    });

    expect(createParams[0]).toMatchObject({
      launchGatePath: "artifacts/base-sepolia-launch-gate.json",
      healthPath: "artifacts/base-sepolia-health.json",
      releaseStatusPath: "docs/releases/latest.json",
      eventIndexPath: "artifacts/base-event-index.json",
      eventIndexVerificationPath: "artifacts/base-event-index-verification.json",
      economicPayoutSummaryVerificationPath: "artifacts/economic-payout-summary-verification.json",
      dashboardPath: "artifacts/operator-dashboard.json",
      dashboardVerificationPath: "artifacts/operator-dashboard-verification.json",
    });
    expect(writes).toEqual([
      {
        path: "artifacts/funding-ready-demo-verification.json",
        contents: `${JSON.stringify(VERIFICATION, null, 2)}\n`,
      },
    ]);
    expect(outputs[0]).toContain("passed: true");
    expect(env.BASE_SEPOLIA_RPC_URL).toBeUndefined();
    expect(env.PRIVATE_KEY).toBeUndefined();
  });

  it("sets exit code when the saved proof is stale", async () => {
    let exitCode: number | undefined;
    const failed: FundingReadyOperatorDemoVerification = {
      passed: false,
      failures: ["funding-ready operator demo proof is stale"],
      expected: REPORT,
    };

    await runFundingReadyOperatorDemoVerifyCli({
      argv: ["--format", "summary"],
      writeOutput: () => {},
      readText: async () => JSON.stringify(REPORT),
      createReport: () => REPORT,
      verifyReport: () => failed,
      setExitCode: (code) => { exitCode = code; },
    });

    expect(exitCode).toBe(1);
  });
});

describe("formatFundingReadyOperatorDemoVerifyCliOutput", () => {
  it("formats JSON and summary output", () => {
    expect(formatFundingReadyOperatorDemoVerifyCliOutput(VERIFICATION, "json")).toContain("\"passed\": true");
    expect(formatFundingReadyOperatorDemoVerifyCliOutput(VERIFICATION, "summary")).toContain("passed: true");
  });
});
