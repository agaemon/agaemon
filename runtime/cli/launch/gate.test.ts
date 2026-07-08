import { describe, expect, it } from "vitest";

import {
  formatLaunchGateCliOutput,
  parseLaunchGateCliArgs,
  runLaunchGateCli,
} from "./gate.js";
import type { BaseSepoliaLaunchGateReport } from "../../launch/gate.js";

const GATE_REPORT: BaseSepoliaLaunchGateReport = {
  schemaVersion: 1,
  generatedAt: "2026-07-02T00:00:00.000Z",
  manifestPath: "deployments/base-sepolia/latest.json",
  manifestSha256: "a".repeat(64),
  releaseStatusPath: "docs/releases/latest.json",
  commitSha: "098e51d098e51d098e51d098e51d098e51d098e5",
  readinessRunUrl: "https://github.com/sagaratalatti/agentos-kernel/actions/runs/28155970869",
  decision: "go",
  passed: true,
  summary: { checks: 4, passed: 4, failed: 0 },
  checks: [
    { id: "readiness-checkpoint", label: "Readiness checkpoint", passed: true, failures: [] },
  ],
};

describe("parseLaunchGateCliArgs", () => {
  it("parses custom evidence paths, output, and format", () => {
    expect(parseLaunchGateCliArgs([
      "--manifest", "deployments/base-sepolia/custom.json",
      "--checkpoint=artifacts/checkpoint.json",
      "--status", "docs/releases/custom.json",
      "--health", "artifacts/health.json",
      "--local-preflight", "artifacts/preflight.json",
      "--security-evidence", "artifacts/security-evidence.json",
      "--economic-payout-summary-verification", "artifacts/economic-payout-summary-verification.json",
      "--output", "artifacts/gate.json",
      "--format", "summary",
    ])).toEqual({
      manifestPath: "deployments/base-sepolia/custom.json",
      checkpointPath: "artifacts/checkpoint.json",
      statusPath: "docs/releases/custom.json",
      healthPath: "artifacts/health.json",
      localPreflightPath: "artifacts/preflight.json",
      securityEvidencePath: "artifacts/security-evidence.json",
      economicPayoutSummaryVerificationPath: "artifacts/economic-payout-summary-verification.json",
      outputPath: "artifacts/gate.json",
      format: "summary",
    });
  });
});

describe("runLaunchGateCli", () => {
  it("writes a launch gate report and leaves exit code unset for go decisions", async () => {
    const outputs: string[] = [];
    const writes: Array<{ path: string; contents: string }> = [];
    const createParams: unknown[] = [];
    let exitCode: number | undefined;

    await runLaunchGateCli({
      argv: [
        "--local-preflight",
        "artifacts/base-sepolia-local-preflight.json",
        "--security-evidence",
        "artifacts/base-security-evidence.json",
        "--economic-payout-summary-verification",
        "artifacts/economic-payout-summary-verification.json",
        "--output",
        "artifacts/base-sepolia-launch-gate.json",
      ],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => { exitCode = code; },
      readText: async (path) => JSON.stringify({ path }),
      writeText: async (path, contents) => { writes.push({ path, contents }); },
      createGateReport: (params) => {
        createParams.push(params);
        return GATE_REPORT;
      },
    });

    expect(exitCode).toBeUndefined();
    expect(outputs[0]).toContain("\"decision\": \"go\"");
    expect(writes).toEqual([
      { path: "artifacts/base-sepolia-launch-gate.json", contents: `${JSON.stringify(GATE_REPORT, null, 2)}\n` },
    ]);
    expect(createParams[0]).toMatchObject({
      localPreflight: { path: "artifacts/base-sepolia-local-preflight.json" },
      securityEvidence: { path: "artifacts/base-security-evidence.json" },
      economicPayoutSummaryVerification: { path: "artifacts/economic-payout-summary-verification.json" },
    });
  });

  it("sets exit code for no-go decisions", async () => {
    let exitCode: number | undefined;

    await runLaunchGateCli({
      argv: [],
      writeOutput: () => {},
      setExitCode: (code) => { exitCode = code; },
      readText: async (path) => JSON.stringify({ path }),
      createGateReport: () => ({ ...GATE_REPORT, passed: false, decision: "no-go" }),
    });

    expect(exitCode).toBe(1);
  });

  it("rejects malformed injected gate reports before output or exit-code mutation", async () => {
    const outputs: string[] = [];
    let exitCode: number | undefined;

    await expect(runLaunchGateCli({
      argv: [],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => { exitCode = code; },
      readText: async (path) => JSON.stringify({ path }),
      createGateReport: () => ({ ...GATE_REPORT, passed: "yes" }) as unknown as BaseSepoliaLaunchGateReport,
    })).rejects.toThrow("launch gate report passed must be a boolean");

    expect(outputs).toEqual([]);
    expect(exitCode).toBeUndefined();
  });
});

describe("formatLaunchGateCliOutput", () => {
  it("formats summary output", () => {
    expect(formatLaunchGateCliOutput(GATE_REPORT, "summary")).toContain("Base Sepolia launch gate");
  });
});
