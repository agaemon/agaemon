import { describe, expect, it } from "vitest";

import {
  formatBaseSepoliaReleaseAutomationSummary,
  runBaseSepoliaReleaseAutomation,
} from "./automation.js";

const READINESS_RUN_URL = "https://github.com/sagaratalatti/agentos-kernel/actions/runs/28364588809";

describe("release automation summary fixture integration", () => {
  it("renders a concise successful fixture automation summary", async () => {
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

    expect(formatBaseSepoliaReleaseAutomationSummary(report)).toBe([
      "Base Sepolia release automation",
      "manifest: deployments/base-sepolia/latest.json",
      "checkpoint: artifacts/base-sepolia-readiness-checkpoint.json",
      "releaseDir: docs/releases",
      `readinessRunUrl: ${READINESS_RUN_URL}`,
      "steps: 8",
      "passed: 8",
      "failed: 0",
      "overall: passed",
      "- readiness-checkpoint: passed",
      "- checkpoint-verify: passed",
      "- release-note: passed",
      "- release-index: passed",
      "- release-status: passed",
      "- release-status-verify: passed",
      "- release-summary: passed",
      "- local-preflight: passed",
    ].join("\n"));
  });

  it("renders failed fixture automation summaries with failed step stderr", async () => {
    const report = await runBaseSepoliaReleaseAutomation({
      manifestPath: "deployments/base-sepolia/latest.json",
      checkpointPath: "artifacts/base-sepolia-readiness-checkpoint.json",
      releaseDir: "docs/releases",
      envExamplePath: ".env.example",
      readinessRunUrl: READINESS_RUN_URL,
      runner: async (step) => ({
        exitCode: step.name === "release-status-verify" ? 1 : 0,
        signal: null,
        stdout: `${step.name} stdout`,
        stderr: step.name === "release-status-verify" ? "stale status" : "",
      }),
    });

    expect(formatBaseSepoliaReleaseAutomationSummary(report)).toBe([
      "Base Sepolia release automation",
      "manifest: deployments/base-sepolia/latest.json",
      "checkpoint: artifacts/base-sepolia-readiness-checkpoint.json",
      "releaseDir: docs/releases",
      `readinessRunUrl: ${READINESS_RUN_URL}`,
      "steps: 6",
      "passed: 5",
      "failed: 1",
      "overall: failed",
      "- readiness-checkpoint: passed",
      "- checkpoint-verify: passed",
      "- release-note: passed",
      "- release-index: passed",
      "- release-status: passed",
      "- release-status-verify: failed (stale status)",
    ].join("\n"));
  });
});
