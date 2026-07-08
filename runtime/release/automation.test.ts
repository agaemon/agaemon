import { describe, expect, it } from "vitest";

import {
  buildBaseSepoliaReleaseAutomationSteps,
  runBaseSepoliaReleaseAutomation,
} from "./automation.js";

const READINESS_RUN_URL = "https://github.com/sagaratalatti/agentos-kernel/actions/runs/28199999999";

describe("buildBaseSepoliaReleaseAutomationSteps", () => {
  it("builds the full Base Sepolia release-evidence sequence in deterministic order", () => {
    expect(
      buildBaseSepoliaReleaseAutomationSteps({
        manifestPath: "deployments/base-sepolia/custom.json",
        checkpointPath: "artifacts/custom-checkpoint.json",
        releaseDir: "docs/releases",
        envExamplePath: ".env.example",
        readinessRunUrl: READINESS_RUN_URL,
      }),
    ).toEqual([
      {
        name: "readiness-checkpoint",
        script: "base:readiness-checkpoint",
        command: "npm",
        args: [
          "run",
          "base:readiness-checkpoint",
          "--",
          "--output",
          "artifacts/custom-checkpoint.json",
          "--manifest",
          "deployments/base-sepolia/custom.json",
          "--readiness-run-url",
          READINESS_RUN_URL,
        ],
      },
      {
        name: "checkpoint-verify",
        script: "base:checkpoint-verify",
        command: "npm",
        args: [
          "run",
          "base:checkpoint-verify",
          "--",
          "--checkpoint",
          "artifacts/custom-checkpoint.json",
          "--manifest",
          "deployments/base-sepolia/custom.json",
          "--require-run-url",
        ],
      },
      {
        name: "release-note",
        script: "base:release-note",
        command: "npm",
        args: [
          "run",
          "base:release-note",
          "--",
          "--checkpoint",
          "artifacts/custom-checkpoint.json",
          "--manifest",
          "deployments/base-sepolia/custom.json",
        ],
      },
      {
        name: "release-index",
        script: "base:release-index",
        command: "npm",
        args: ["run", "base:release-index", "--", "--dir", "docs/releases", "--manifest", "deployments/base-sepolia/custom.json"],
      },
      {
        name: "release-status",
        script: "base:release-status",
        command: "npm",
        args: ["run", "base:release-status", "--", "--dir", "docs/releases", "--manifest", "deployments/base-sepolia/custom.json"],
      },
      {
        name: "release-status-verify",
        script: "base:release-status-verify",
        command: "npm",
        args: ["run", "base:release-status-verify", "--", "--status", "docs/releases/latest.json"],
      },
      {
        name: "release-summary",
        script: "base:release-summary",
        command: "npm",
        args: [
          "run",
          "base:release-summary",
          "--",
          "--status",
          "docs/releases/latest.json",
          "--output",
          "docs/releases/CURRENT.md",
        ],
      },
      {
        name: "local-preflight",
        script: "base:local-preflight",
        command: "npm",
        args: [
          "run",
          "base:local-preflight",
          "--",
          "--dir",
          "docs/releases",
          "--manifest",
          "deployments/base-sepolia/custom.json",
          "--env-example",
          ".env.example",
        ],
      },
    ]);
  });
});

describe("runBaseSepoliaReleaseAutomation", () => {
  it("runs steps sequentially and stops after the first failed child command", async () => {
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
          exitCode: step.name === "release-note" ? 1 : 0,
          signal: null,
          stdout: `${step.name} stdout`,
          stderr: step.name === "release-note" ? "release-note failed" : "",
        };
      },
    });

    expect(calls).toEqual(["readiness-checkpoint", "checkpoint-verify", "release-note"]);
    expect(report).toMatchObject({
      passed: false,
      steps: [
        { name: "readiness-checkpoint", passed: true },
        { name: "checkpoint-verify", passed: true },
        {
          name: "release-note",
          passed: false,
          exitCode: 1,
          stderr: "release-note failed",
        },
      ],
    });
  });
});
