import { describe, expect, it } from "vitest";

import { BASE_READINESS_SCRIPTS } from "./readiness.js";
import { formatReadinessCheckpointSummary } from "./checkpoint.js";

import type { ReadinessCheckpoint } from "./checkpoint.js";

describe("readiness checkpoint summary fixtures", () => {
  it("renders a reproducible passing checkpoint summary", () => {
    expect(formatReadinessCheckpointSummary(createCheckpoint())).toBe([
      "Base Sepolia readiness checkpoint",
      "generatedAt: 2026-06-25T06:30:00.000Z",
      "commit: 0123456789abcdef0123456789abcdef01234567",
      "manifest: deployments/base-sepolia/latest.json",
      "manifestSha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "network: base-sepolia",
      "chainId: 84532",
      "readinessRunUrl: https://github.com/sagaratalatti/agentos-kernel/actions/runs/28151904383",
      `checks: ${BASE_READINESS_SCRIPTS.length}`,
      `passed: ${BASE_READINESS_SCRIPTS.length}`,
      "failed: 0",
      "overall: passed",
      ...BASE_READINESS_SCRIPTS.map((script) => `- ${script.name}: passed`),
    ].join("\n"));
  });

  it("keeps failed checkpoint checks readable", () => {
    expect(formatReadinessCheckpointSummary(createCheckpoint({ failedCheck: "swap" }))).toBe([
      "Base Sepolia readiness checkpoint",
      "generatedAt: 2026-06-25T06:30:00.000Z",
      "commit: 0123456789abcdef0123456789abcdef01234567",
      "manifest: deployments/base-sepolia/latest.json",
      "manifestSha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "network: base-sepolia",
      "chainId: 84532",
      "readinessRunUrl: https://github.com/sagaratalatti/agentos-kernel/actions/runs/28151904383",
      `checks: ${BASE_READINESS_SCRIPTS.length}`,
      `passed: ${BASE_READINESS_SCRIPTS.length - 1}`,
      "failed: 1",
      "overall: failed",
      ...BASE_READINESS_SCRIPTS.map((script) => `- ${script.name}: ${script.name === "swap" ? "failed" : "passed"}`),
    ].join("\n"));
  });
});

function createCheckpoint(options: { failedCheck?: string | undefined } = {}): ReadinessCheckpoint {
  const failed = options.failedCheck === undefined ? 0 : 1;

  return {
    schemaVersion: 1,
    generatedAt: "2026-06-25T06:30:00.000Z",
    commit: {
      sha: "0123456789abcdef0123456789abcdef01234567",
    },
    manifest: {
      path: "deployments/base-sepolia/latest.json",
      sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      network: "base-sepolia",
      chainId: 84532,
      deployedAt: "2026-06-25T04:01:18Z",
    },
    readiness: {
      runUrl: "https://github.com/sagaratalatti/agentos-kernel/actions/runs/28151904383",
      summary: {
        checks: BASE_READINESS_SCRIPTS.length,
        passed: BASE_READINESS_SCRIPTS.length - failed,
        failed,
        overall: failed === 0 ? "passed" : "failed",
      },
      checks: BASE_READINESS_SCRIPTS.map((script) => ({
        name: script.name,
        script: script.script,
        command: `npm run ${script.script}`,
        passed: script.name !== options.failedCheck,
        exitCode: script.name === options.failedCheck ? 1 : 0,
        signal: null,
        stdout: script.name === options.failedCheck ? "" : "ok",
        stderr: script.name === options.failedCheck ? `${script.name} failed` : "",
      })),
    },
  };
}
