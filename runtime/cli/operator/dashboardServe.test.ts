import { describe, expect, it } from "vitest";

import {
  formatOperatorDashboardServeCliOutput,
  parseOperatorDashboardServeCliArgs,
  runOperatorDashboardServeCli,
} from "./dashboardServe.js";
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

describe("parseOperatorDashboardServeCliArgs", () => {
  it("parses dashboard path, host, and port", () => {
    expect(parseOperatorDashboardServeCliArgs([
      "--dashboard",
      "artifacts/funding-demo/operator-dashboard.json",
      "--host=0.0.0.0",
      "--port",
      "9090",
    ])).toEqual({
      dashboardPath: "artifacts/funding-demo/operator-dashboard.json",
      host: "0.0.0.0",
      port: 9090,
    });
  });

  it("rejects invalid ports", () => {
    expect(() => parseOperatorDashboardServeCliArgs(["--port", "not-a-port"])).toThrow("--port must be an integer from 0 to 65535");
  });
});

describe("runOperatorDashboardServeCli", () => {
  it("starts a local read-only dashboard server without RPC or signer env", async () => {
    const outputs: string[] = [];
    const listens: unknown[] = [];
    const env: Record<string, string | undefined> = {};

    await runOperatorDashboardServeCli({
      argv: ["--dashboard", "artifacts/operator-dashboard.json", "--host", "127.0.0.1", "--port", "8787"],
      env,
      readText: async () => JSON.stringify(SNAPSHOT),
      writeOutput: (output) => outputs.push(output),
      listen: async (server, port, host) => {
        listens.push({ hasServer: typeof server.close === "function", port, host });
      },
    });

    expect(listens).toEqual([{ hasServer: true, port: 8787, host: "127.0.0.1" }]);
    expect(outputs[0]).toContain("Operator dashboard server");
    expect(outputs[0]).toContain("url: http://127.0.0.1:8787/");
    expect(outputs[0]).toContain("api: http://127.0.0.1:8787/api/dashboard");
    expect(env.BASE_SEPOLIA_RPC_URL).toBeUndefined();
    expect(env.PRIVATE_KEY).toBeUndefined();
  });
});

describe("formatOperatorDashboardServeCliOutput", () => {
  it("summarizes the served read-only routes", () => {
    expect(formatOperatorDashboardServeCliOutput({
      dashboardPath: "artifacts/operator-dashboard.json",
      host: "127.0.0.1",
      port: 8787,
    })).toContain("health: http://127.0.0.1:8787/healthz");
  });
});

