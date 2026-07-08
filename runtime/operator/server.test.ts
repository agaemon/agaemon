import { describe, expect, it } from "vitest";

import {
  createOperatorDashboardApiResponse,
  createOperatorDashboardHttpResponse,
  createOperatorDashboardServerHealth,
} from "./server.js";
import type { OperatorDashboardSnapshot } from "./dashboard.js";

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

describe("createOperatorDashboardApiResponse", () => {
  it("wraps a saved dashboard snapshot with a local-only trust boundary", () => {
    expect(createOperatorDashboardApiResponse({
      snapshot: SNAPSHOT,
      dashboardPath: "artifacts/operator-dashboard.json",
    })).toMatchObject({
      schemaVersion: 1,
      source: { path: "artifacts/operator-dashboard.json" },
      dashboard: { launch: { decision: "go" } },
      trustBoundary: {
        statement: "AI proposes. Policy decides. Accounts execute.",
        callClass: "local-only",
        readOnly: true,
        mainnet: false,
        liveFunds: false,
        signing: false,
        transactionSubmission: false,
      },
    });
  });
});

describe("createOperatorDashboardServerHealth", () => {
  it("reports the served dashboard path without requiring RPC or signer authority", () => {
    expect(createOperatorDashboardServerHealth("artifacts/operator-dashboard.json")).toEqual({
      schemaVersion: 1,
      status: "ok",
      service: "agentos-operator-dashboard",
      source: { path: "artifacts/operator-dashboard.json" },
      trustBoundary: {
        statement: "AI proposes. Policy decides. Accounts execute.",
        callClass: "local-only",
        readOnly: true,
        mainnet: false,
        liveFunds: false,
        signing: false,
        transactionSubmission: false,
      },
    });
  });
});

describe("createOperatorDashboardHttpResponse", () => {
  it("serves rendered dashboard HTML at the root route", () => {
    const response = createOperatorDashboardHttpResponse({
      method: "GET",
      url: "/",
      snapshot: SNAPSHOT,
      dashboardPath: "artifacts/operator-dashboard.json",
    });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("<!doctype html>");
    expect(response.body).toContain("AgentOS Operator Dashboard");
  });

  it("serves the typed dashboard API response as JSON", () => {
    const response = createOperatorDashboardHttpResponse({
      method: "GET",
      url: "/api/dashboard",
      snapshot: SNAPSHOT,
      dashboardPath: "artifacts/operator-dashboard.json",
    });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(JSON.parse(response.body)).toMatchObject({
      dashboard: { agent: { address: "0x0000000000000000000000000000000000001004" } },
      trustBoundary: { signing: false, mainnet: false },
    });
  });

  it("serves local-only health without leaking hidden or signing surfaces", () => {
    const response = createOperatorDashboardHttpResponse({
      method: "GET",
      url: "/healthz",
      snapshot: SNAPSHOT,
      dashboardPath: "artifacts/operator-dashboard.json",
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      status: "ok",
      trustBoundary: { transactionSubmission: false, liveFunds: false },
    });
  });

  it("rejects mutation methods before routing", () => {
    const response = createOperatorDashboardHttpResponse({
      method: "POST",
      url: "/api/dashboard",
      snapshot: SNAPSHOT,
      dashboardPath: "artifacts/operator-dashboard.json",
    });

    expect(response.status).toBe(405);
    expect(response.headers.allow).toBe("GET, HEAD");
    expect(JSON.parse(response.body)).toMatchObject({
      error: "method_not_allowed",
      trustBoundary: { readOnly: true, signing: false },
    });
  });

  it("does not route unknown paths to authority-bearing behavior", () => {
    const response = createOperatorDashboardHttpResponse({
      method: "GET",
      url: "/send",
      snapshot: SNAPSHOT,
      dashboardPath: "artifacts/operator-dashboard.json",
    });

    expect(response.status).toBe(404);
    expect(JSON.parse(response.body)).toMatchObject({
      error: "not_found",
      trustBoundary: { transactionSubmission: false, mainnet: false },
    });
  });
});

