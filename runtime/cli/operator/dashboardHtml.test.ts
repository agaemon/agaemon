import { describe, expect, it } from "vitest";

import {
  formatOperatorDashboardHtmlCliOutput,
  parseOperatorDashboardHtmlCliArgs,
  runOperatorDashboardHtmlCli,
} from "./dashboardHtml.js";
import type { OperatorDashboardSnapshot } from "../../operator/dashboard.js";

const SNAPSHOT: OperatorDashboardSnapshot = {
  schemaVersion: 1,
  generatedAt: "2026-07-03T00:00:00.000Z",
  launch: {
    decision: "go",
    passed: true,
    failedChecks: 0,
    source: { path: "artifacts/base-sepolia-launch-gate.json" },
  },
  health: {
    passed: true,
    failedChecks: 0,
    warnings: 0,
    source: { path: "artifacts/base-sepolia-health.json" },
  },
  agent: {
    address: "0x0000000000000000000000000000000000001004",
    roleLabel: "agentos.kernel.operator",
    metadataURI: "agentos://base-sepolia/agent-account/v1",
    source: { path: "deployments/base-sepolia/latest.json" },
  },
  release: {
    latestCommitSha: "a".repeat(40),
    latestGeneratedAt: "2026-07-02T00:00:00.000Z",
    latestReadinessRunUrl: "https://github.com/sagaratalatti/agentos-kernel/actions/runs/1",
    source: { path: "docs/releases/latest.json" },
  },
};

describe("parseOperatorDashboardHtmlCliArgs", () => {
  it("parses dashboard, output, and format", () => {
    expect(parseOperatorDashboardHtmlCliArgs([
      "--dashboard",
      "artifacts/funding-demo/operator-dashboard.json",
      "--output=artifacts/funding-demo/operator-dashboard.html",
      "--format",
      "summary",
    ])).toEqual({
      dashboardPath: "artifacts/funding-demo/operator-dashboard.json",
      outputPath: "artifacts/funding-demo/operator-dashboard.html",
      format: "summary",
    });
  });
});

describe("runOperatorDashboardHtmlCli", () => {
  it("writes local dashboard HTML without RPC or signer env", async () => {
    const outputs: string[] = [];
    const writes: unknown[] = [];
    const env: Record<string, string | undefined> = {};

    await runOperatorDashboardHtmlCli({
      argv: ["--output", "artifacts/operator-dashboard.html", "--format", "summary"],
      env,
      readText: async () => JSON.stringify(SNAPSHOT),
      writeOutput: (output) => outputs.push(output),
      writeText: async (path, contents) => { writes.push({ path, hasHtml: contents.includes("<!doctype html>") }); },
      mkdirp: async (path) => { writes.push({ mkdir: path }); },
    });

    expect(writes).toEqual([
      { mkdir: "artifacts" },
      { path: "artifacts/operator-dashboard.html", hasHtml: true },
    ]);
    expect(outputs[0]).toContain("Operator dashboard HTML");
    expect(env.BASE_SEPOLIA_RPC_URL).toBeUndefined();
    expect(env.PRIVATE_KEY).toBeUndefined();
  });
});

describe("formatOperatorDashboardHtmlCliOutput", () => {
  it("formats HTML and summary output", () => {
    expect(formatOperatorDashboardHtmlCliOutput(SNAPSHOT, "html", "artifacts/operator-dashboard.html")).toContain("<!doctype html>");
    expect(formatOperatorDashboardHtmlCliOutput(SNAPSHOT, "summary", "artifacts/operator-dashboard.html")).toContain("output: artifacts/operator-dashboard.html");
  });
});
