import { describe, expect, it } from "vitest";

import {
  formatLaunchHealthVerifyCliOutput,
  parseLaunchHealthVerifyCliArgs,
  runLaunchHealthVerifyCli,
} from "./healthVerify.js";
import type { BaseSepoliaHealthVerification } from "../../launch/healthVerify.js";

const PASSING_VERIFICATION: BaseSepoliaHealthVerification = {
  passed: true,
  failures: [],
};

describe("parseLaunchHealthVerifyCliArgs", () => {
  it("parses health, manifest, status, and format options", () => {
    expect(parseLaunchHealthVerifyCliArgs([
      "--health", "artifacts/custom-health.json",
      "--manifest=deployments/base-sepolia/custom.json",
      "--status", "docs/releases/custom.json",
      "--output", "artifacts/custom-health-verification.json",
      "--format", "summary",
    ])).toEqual({
      healthPath: "artifacts/custom-health.json",
      manifestPath: "deployments/base-sepolia/custom.json",
      statusPath: "docs/releases/custom.json",
      outputPath: "artifacts/custom-health-verification.json",
      format: "summary",
    });
  });
});

describe("runLaunchHealthVerifyCli", () => {
  it("verifies a saved health report without RPC", async () => {
    const outputs: string[] = [];
    const writes: Array<{ path: string; contents: string }> = [];
    let exitCode: number | undefined;

    await runLaunchHealthVerifyCli({
      argv: [
        "--health",
        "artifacts/health.json",
        "--manifest",
        "deployments/base-sepolia/latest.json",
        "--output",
        "artifacts/health-verification.json",
      ],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => { exitCode = code; },
      readText: async (path) => JSON.stringify({ path }),
      writeText: async (path, contents) => { writes.push({ path, contents }); },
      verifyHealth: () => PASSING_VERIFICATION,
    });

    expect(exitCode).toBeUndefined();
    expect(outputs[0]).toContain("\"passed\": true");
    expect(writes).toEqual([
      {
        path: "artifacts/health-verification.json",
        contents: `${JSON.stringify(PASSING_VERIFICATION, null, 2)}\n`,
      },
    ]);
  });

  it("sets exit code for failed health verification", async () => {
    let exitCode: number | undefined;

    await runLaunchHealthVerifyCli({
      argv: [],
      writeOutput: () => {},
      setExitCode: (code) => { exitCode = code; },
      readText: async (path) => JSON.stringify({ path }),
      verifyHealth: () => ({ passed: false, failures: ["health report must be passed"] }),
    });

    expect(exitCode).toBe(1);
  });

  it("rejects malformed injected verification before output or exit-code mutation", async () => {
    const outputs: string[] = [];
    let exitCode: number | undefined;

    await expect(runLaunchHealthVerifyCli({
      argv: [],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => { exitCode = code; },
      readText: async (path) => JSON.stringify({ path }),
      verifyHealth: () => ({ passed: "yes", failures: [] }) as unknown as BaseSepoliaHealthVerification,
    })).rejects.toThrow("health verification passed must be a boolean");

    expect(outputs).toEqual([]);
    expect(exitCode).toBeUndefined();
  });
});

describe("formatLaunchHealthVerifyCliOutput", () => {
  it("formats summary output", () => {
    expect(formatLaunchHealthVerifyCliOutput(PASSING_VERIFICATION, "summary")).toContain("Base Sepolia health verification");
  });
});
