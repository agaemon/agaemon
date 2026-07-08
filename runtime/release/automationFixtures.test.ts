import { describe, expect, it } from "vitest";

import { runBaseSepoliaReleaseAutomation } from "./automation.js";

const READINESS_RUN_URL = "https://github.com/sagaratalatti/agentos-kernel/actions/runs/28364117820";

describe("release automation fixture integration", () => {
  it("includes readiness run provenance in a successful fixture automation report", async () => {
    const report = await runBaseSepoliaReleaseAutomation({
      manifestPath: "deployments/base-sepolia/latest.json",
      checkpointPath: "artifacts/base-sepolia-readiness-checkpoint.json",
      releaseDir: "docs/releases",
      envExamplePath: ".env.example",
      readinessRunUrl: READINESS_RUN_URL,
      runner: async (step) => ({
        exitCode: 0,
        signal: null,
        stdout: `${step.name} ok`,
        stderr: "",
      }),
    });

    expect(report).toMatchObject({
      manifestPath: "deployments/base-sepolia/latest.json",
      checkpointPath: "artifacts/base-sepolia-readiness-checkpoint.json",
      releaseDir: "docs/releases",
      envExamplePath: ".env.example",
      readinessRunUrl: READINESS_RUN_URL,
      passed: true,
    });
    expect(report.steps.map((step) => ({ name: step.name, passed: step.passed }))).toEqual([
      { name: "readiness-checkpoint", passed: true },
      { name: "checkpoint-verify", passed: true },
      { name: "release-note", passed: true },
      { name: "release-index", passed: true },
      { name: "release-status", passed: true },
      { name: "release-status-verify", passed: true },
      { name: "release-summary", passed: true },
      { name: "local-preflight", passed: true },
    ]);
  });

  it("keeps failed fixture automation reports local and stops before downstream steps", async () => {
    const calls: string[] = [];

    const report = await runBaseSepoliaReleaseAutomation({
      manifestPath: "deployments/base-sepolia/latest.json",
      checkpointPath: "artifacts/base-sepolia-readiness-checkpoint.json",
      releaseDir: "docs/releases",
      envExamplePath: ".env.example",
      readinessRunUrl: READINESS_RUN_URL,
      runner: async (step) => {
        calls.push(step.name);
        return {
          exitCode: step.name === "release-status-verify" ? 1 : 0,
          signal: null,
          stdout: `${step.name} stdout`,
          stderr: step.name === "release-status-verify" ? "stale status" : "",
        };
      },
    });

    expect(calls).toEqual([
      "readiness-checkpoint",
      "checkpoint-verify",
      "release-note",
      "release-index",
      "release-status",
      "release-status-verify",
    ]);
    expect(report).toMatchObject({
      readinessRunUrl: READINESS_RUN_URL,
      passed: false,
      steps: [
        { name: "readiness-checkpoint", passed: true },
        { name: "checkpoint-verify", passed: true },
        { name: "release-note", passed: true },
        { name: "release-index", passed: true },
        { name: "release-status", passed: true },
        {
          name: "release-status-verify",
          passed: false,
          exitCode: 1,
          stdout: "release-status-verify stdout",
          stderr: "stale status",
        },
      ],
    });
  });
});
