import { describe, expect, it } from "vitest";

import {
  createAgentOsSdkIntegrationApiResponse,
  createAgentOsSdkIntegrationHttpResponse,
  createAgentOsSdkIntegrationServerHealth,
} from "./server.js";
import type { AgentOsSdkExampleCatalog } from "./exampleCatalog.js";

const CATALOG: AgentOsSdkExampleCatalog = {
  schemaVersion: 1,
  generatedAt: "2026-07-04T00:00:00.000Z",
  chainId: 84532,
  trustBoundary: {
    ai: "proposes",
    policy: "decides",
    accounts: "execute",
    callClass: "local-only",
    mainnet: false,
    liveFunds: false,
  },
  examples: [
    {
      id: "treasury-payment-intent",
      title: "Treasury payment intent",
      kind: "intent",
      callClass: "local-only",
      artifact: { objective: "Pay demo recipient" },
    },
  ],
};

describe("createAgentOsSdkIntegrationApiResponse", () => {
  it("wraps the SDK example catalog with local-only integration metadata", () => {
    const response = createAgentOsSdkIntegrationApiResponse({
      catalog: CATALOG,
      verification: { passed: true, failures: [], expected: CATALOG },
    });

    expect(response).toMatchObject({
      schemaVersion: 1,
      catalog: { examples: [{ id: "treasury-payment-intent" }] },
      verification: { passed: true },
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

describe("createAgentOsSdkIntegrationServerHealth", () => {
  it("reports a local-only SDK integration service", () => {
    expect(createAgentOsSdkIntegrationServerHealth()).toEqual({
      schemaVersion: 1,
      status: "ok",
      service: "agentos-sdk-integration",
      routes: ["/api/sdk/examples", "/api/sdk/examples/verify", "/healthz"],
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

describe("createAgentOsSdkIntegrationHttpResponse", () => {
  it("serves the example catalog for external app integration", () => {
    const response = createAgentOsSdkIntegrationHttpResponse({
      method: "GET",
      url: "/api/sdk/examples",
      catalog: CATALOG,
      verification: { passed: true, failures: [], expected: CATALOG },
    });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(JSON.parse(response.body)).toMatchObject({
      catalog: { chainId: 84532 },
      trustBoundary: { readOnly: true, signing: false },
    });
  });

  it("serves catalog verification without requiring RPC or signing", () => {
    const response = createAgentOsSdkIntegrationHttpResponse({
      method: "GET",
      url: "/api/sdk/examples/verify",
      catalog: CATALOG,
      verification: { passed: true, failures: [], expected: CATALOG },
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      verification: { passed: true },
      trustBoundary: { mainnet: false, transactionSubmission: false },
    });
  });

  it("rejects mutation methods before routing", () => {
    const response = createAgentOsSdkIntegrationHttpResponse({
      method: "POST",
      url: "/api/sdk/examples",
      catalog: CATALOG,
      verification: { passed: true, failures: [], expected: CATALOG },
    });

    expect(response.status).toBe(405);
    expect(response.headers.allow).toBe("GET, HEAD");
    expect(JSON.parse(response.body)).toMatchObject({
      error: "method_not_allowed",
      trustBoundary: { readOnly: true, signing: false },
    });
  });

  it("does not route unknown paths to execution behavior", () => {
    const response = createAgentOsSdkIntegrationHttpResponse({
      method: "GET",
      url: "/broadcast",
      catalog: CATALOG,
      verification: { passed: true, failures: [], expected: CATALOG },
    });

    expect(response.status).toBe(404);
    expect(JSON.parse(response.body)).toMatchObject({
      error: "not_found",
      trustBoundary: { mainnet: false, transactionSubmission: false },
    });
  });
});
