import { describe, expect, it } from "vitest";

import {
  formatLaunchGateVerifyCliOutput,
  parseLaunchGateVerifyCliArgs,
  runLaunchGateVerifyCli,
} from "./gateVerify.js";
import type { BaseSepoliaLaunchGateVerification } from "../../launch/gateVerify.js";

const PASSING_VERIFICATION: BaseSepoliaLaunchGateVerification = {
  passed: true,
  failures: [],
};

describe("parseLaunchGateVerifyCliArgs", () => {
  it("parses launch gate, manifest, health, and format options", () => {
    expect(parseLaunchGateVerifyCliArgs([
      "--launch-gate", "artifacts/custom-gate.json",
      "--manifest=deployments/base-sepolia/custom.json",
      "--health", "artifacts/custom-health.json",
      "--local-preflight=artifacts/custom-local-preflight.json",
      "--security-evidence", "artifacts/custom-security-evidence.json",
      "--economic-payout-summary-verification", "artifacts/custom-economic-payout-summary-verification.json",
      "--output", "artifacts/custom-launch-gate-verification.json",
      "--format", "summary",
    ])).toEqual({
      launchGatePath: "artifacts/custom-gate.json",
      manifestPath: "deployments/base-sepolia/custom.json",
      healthPath: "artifacts/custom-health.json",
      localPreflightPath: "artifacts/custom-local-preflight.json",
      securityEvidencePath: "artifacts/custom-security-evidence.json",
      economicPayoutSummaryVerificationPath: "artifacts/custom-economic-payout-summary-verification.json",
      outputPath: "artifacts/custom-launch-gate-verification.json",
      format: "summary",
    });
  });
});

describe("runLaunchGateVerifyCli", () => {
  it("verifies a saved launch gate report without RPC", async () => {
    const outputs: string[] = [];
    const verifyParams: unknown[] = [];
    const writes: Array<{ path: string; contents: string }> = [];
    let exitCode: number | undefined;

    await runLaunchGateVerifyCli({
      argv: [
        "--launch-gate",
        "artifacts/gate.json",
        "--health",
        "artifacts/health.json",
        "--local-preflight",
        "artifacts/local-preflight.json",
        "--security-evidence",
        "artifacts/security-evidence.json",
        "--economic-payout-summary-verification",
        "artifacts/economic-payout-summary-verification.json",
        "--output",
        "artifacts/launch-gate-verification.json",
      ],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => { exitCode = code; },
      readText: async (path) => JSON.stringify({ path }),
      writeText: async (path, contents) => { writes.push({ path, contents }); },
      verifyGate: (_report, params) => {
        verifyParams.push(params);
        return PASSING_VERIFICATION;
      },
    });

    expect(exitCode).toBeUndefined();
    expect(outputs[0]).toContain("\"passed\": true");
    expect(writes).toEqual([
      {
        path: "artifacts/launch-gate-verification.json",
        contents: `${JSON.stringify(PASSING_VERIFICATION, null, 2)}\n`,
      },
    ]);
    expect(verifyParams[0]).toMatchObject({
      localPreflight: { path: "artifacts/local-preflight.json" },
      securityEvidence: { path: "artifacts/security-evidence.json" },
      economicPayoutSummaryVerification: { path: "artifacts/economic-payout-summary-verification.json" },
    });
  });

  it("sets exit code for failed launch gate verification", async () => {
    let exitCode: number | undefined;

    await runLaunchGateVerifyCli({
      argv: [],
      writeOutput: () => {},
      setExitCode: (code) => { exitCode = code; },
      readText: async (path) => JSON.stringify({ path }),
      verifyGate: () => ({ passed: false, failures: ["launch gate decision must be go"] }),
    });

    expect(exitCode).toBe(1);
  });

  it("rejects malformed injected verification before output or exit-code mutation", async () => {
    const outputs: string[] = [];
    let exitCode: number | undefined;

    await expect(runLaunchGateVerifyCli({
      argv: [],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => { exitCode = code; },
      readText: async (path) => JSON.stringify({ path }),
      verifyGate: () => ({ passed: "yes", failures: [] }) as unknown as BaseSepoliaLaunchGateVerification,
    })).rejects.toThrow("launch gate verification passed must be a boolean");

    expect(outputs).toEqual([]);
    expect(exitCode).toBeUndefined();
  });
});

describe("formatLaunchGateVerifyCliOutput", () => {
  it("formats summary output", () => {
    expect(formatLaunchGateVerifyCliOutput(PASSING_VERIFICATION, "summary")).toContain("Base Sepolia launch gate verification");
  });
});
