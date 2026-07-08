import { describe, expect, it } from "vitest";

import type {
  CreateFundingReadyOperatorDemoReportParams,
  FundingReadyOperatorDemoReport,
} from "../../operator/fundingReadyDemo.js";
import {
  formatFundingReadyOperatorDemoCliOutput,
  parseFundingReadyOperatorDemoCliArgs,
  runFundingReadyOperatorDemoCli,
} from "./fundingReadyDemo.js";

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

describe("parseFundingReadyOperatorDemoCliArgs", () => {
  it("parses source evidence, output, and format paths", () => {
    expect(parseFundingReadyOperatorDemoCliArgs([
      "--launch-gate", "artifacts/launch.json",
      "--health=artifacts/health.json",
      "--release-status", "docs/releases/custom.json",
      "--event-index", "artifacts/events.json",
      "--event-index-verification=artifacts/events-verify.json",
      "--economic-payout-summary-verification", "artifacts/economic-verify.json",
      "--dashboard", "artifacts/dashboard.json",
      "--dashboard-verification=artifacts/dashboard-verify.json",
      "--output", "artifacts/funding-ready-demo.json",
      "--format", "summary",
    ])).toEqual({
      launchGatePath: "artifacts/launch.json",
      healthPath: "artifacts/health.json",
      releaseStatusPath: "docs/releases/custom.json",
      eventIndexPath: "artifacts/events.json",
      eventIndexVerificationPath: "artifacts/events-verify.json",
      economicPayoutSummaryVerificationPath: "artifacts/economic-verify.json",
      dashboardPath: "artifacts/dashboard.json",
      dashboardVerificationPath: "artifacts/dashboard-verify.json",
      outputPath: "artifacts/funding-ready-demo.json",
      format: "summary",
    });
  });
});

describe("runFundingReadyOperatorDemoCli", () => {
  it("writes a local funding-ready proof without RPC or PRIVATE_KEY", async () => {
    const outputs: string[] = [];
    const writes: unknown[] = [];
    const createParams: CreateFundingReadyOperatorDemoReportParams[] = [];
    const env: Record<string, string | undefined> = {};

    await runFundingReadyOperatorDemoCli({
      argv: ["--output", "artifacts/funding-ready-demo.json", "--format", "summary"],
      env,
      writeOutput: (output) => outputs.push(output),
      readText: async (path) => JSON.stringify({ path, passed: true }),
      writeText: async (path, contents) => { writes.push({ path, contents }); },
      createReport: (params) => {
        createParams.push(params);
        return REPORT;
      },
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
        path: "artifacts/funding-ready-demo.json",
        contents: `${JSON.stringify(REPORT, null, 2)}\n`,
      },
    ]);
    expect(outputs[0]).toContain("overall: passed");
    expect(env.BASE_SEPOLIA_RPC_URL).toBeUndefined();
    expect(env.PRIVATE_KEY).toBeUndefined();
  });

  it("sets exit code when the proof fails", async () => {
    let exitCode: number | undefined;
    const failed = {
      ...REPORT,
      passed: false,
      summary: { checks: 7, passed: 6, failed: 1 },
      checks: REPORT.checks.map((check) => check.id === "launch-gate"
        ? { ...check, passed: false, failures: ["launch gate decision must be go"] }
        : check),
    };

    await runFundingReadyOperatorDemoCli({
      argv: ["--format", "summary"],
      writeOutput: () => {},
      readText: async (path) => JSON.stringify({ path, passed: true }),
      createReport: () => failed,
      setExitCode: (code) => { exitCode = code; },
    });

    expect(exitCode).toBe(1);
  });
});

describe("formatFundingReadyOperatorDemoCliOutput", () => {
  it("formats JSON and summary output", () => {
    expect(formatFundingReadyOperatorDemoCliOutput(REPORT, "json")).toContain("\"passed\": true");
    expect(formatFundingReadyOperatorDemoCliOutput(REPORT, "summary")).toContain("overall: passed");
    expect(formatFundingReadyOperatorDemoCliOutput(REPORT, "summary")).toContain("economicAbuseSignals: count=0 amountWei=0");
  });
});
