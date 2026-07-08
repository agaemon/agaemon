import { createServer } from "node:http";

import {
  validateAgentOsSdkExampleCatalog,
  validateAgentOsSdkExampleCatalogVerification,
} from "./exampleCatalog.js";

import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type {
  AgentOsSdkExampleCatalog,
  AgentOsSdkExampleCatalogVerification,
} from "./exampleCatalog.js";

export interface AgentOsSdkIntegrationTrustBoundary {
  statement: "AI proposes. Policy decides. Accounts execute.";
  callClass: "local-only";
  readOnly: true;
  mainnet: false;
  liveFunds: false;
  signing: false;
  transactionSubmission: false;
}

export interface AgentOsSdkIntegrationApiResponse {
  schemaVersion: 1;
  generatedAt: string;
  trustBoundary: AgentOsSdkIntegrationTrustBoundary;
  catalog: AgentOsSdkExampleCatalog;
  verification: AgentOsSdkExampleCatalogVerification;
}

export interface AgentOsSdkIntegrationServerHealth {
  schemaVersion: 1;
  status: "ok";
  service: "agentos-sdk-integration";
  routes: ["/api/sdk/examples", "/api/sdk/examples/verify", "/healthz"];
  trustBoundary: AgentOsSdkIntegrationTrustBoundary;
}

export interface AgentOsSdkIntegrationHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface CreateAgentOsSdkIntegrationApiResponseParams {
  catalog: AgentOsSdkExampleCatalog;
  verification: AgentOsSdkExampleCatalogVerification;
}

export interface CreateAgentOsSdkIntegrationHttpResponseParams
  extends CreateAgentOsSdkIntegrationApiResponseParams {
  method: string | undefined;
  url: string | undefined;
}

export interface CreateAgentOsSdkIntegrationServerParams {
  catalog: AgentOsSdkExampleCatalog;
  verification: AgentOsSdkExampleCatalogVerification;
}

const TRUST_BOUNDARY: AgentOsSdkIntegrationTrustBoundary = {
  statement: "AI proposes. Policy decides. Accounts execute.",
  callClass: "local-only",
  readOnly: true,
  mainnet: false,
  liveFunds: false,
  signing: false,
  transactionSubmission: false,
};

export function createAgentOsSdkIntegrationApiResponse(
  params: CreateAgentOsSdkIntegrationApiResponseParams,
): AgentOsSdkIntegrationApiResponse {
  validateAgentOsSdkExampleCatalog(params.catalog);
  validateAgentOsSdkExampleCatalogVerification(params.verification);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    trustBoundary: TRUST_BOUNDARY,
    catalog: params.catalog,
    verification: params.verification,
  };
}

export function createAgentOsSdkIntegrationServerHealth(): AgentOsSdkIntegrationServerHealth {
  return {
    schemaVersion: 1,
    status: "ok",
    service: "agentos-sdk-integration",
    routes: ["/api/sdk/examples", "/api/sdk/examples/verify", "/healthz"],
    trustBoundary: TRUST_BOUNDARY,
  };
}

export function createAgentOsSdkIntegrationHttpResponse(
  params: CreateAgentOsSdkIntegrationHttpResponseParams,
): AgentOsSdkIntegrationHttpResponse {
  const method = params.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    return jsonResponse(405, {
      error: "method_not_allowed",
      trustBoundary: TRUST_BOUNDARY,
    }, { allow: "GET, HEAD" });
  }

  const pathname = readPathname(params.url);
  if (pathname === "/api/sdk/examples") {
    return jsonResponse(200, createAgentOsSdkIntegrationApiResponse(params), {}, method);
  }
  if (pathname === "/api/sdk/examples/verify") {
    validateAgentOsSdkExampleCatalogVerification(params.verification);
    return jsonResponse(200, {
      schemaVersion: 1,
      verification: params.verification,
      trustBoundary: TRUST_BOUNDARY,
    }, {}, method);
  }
  if (pathname === "/healthz") {
    return jsonResponse(200, createAgentOsSdkIntegrationServerHealth(), {}, method);
  }

  return jsonResponse(404, {
    error: "not_found",
    trustBoundary: TRUST_BOUNDARY,
  }, {}, method);
}

export function createAgentOsSdkIntegrationServer(
  params: CreateAgentOsSdkIntegrationServerParams,
): Server {
  validateAgentOsSdkExampleCatalog(params.catalog);
  validateAgentOsSdkExampleCatalogVerification(params.verification);

  return createServer((request: IncomingMessage, response: ServerResponse) => {
    const result = createAgentOsSdkIntegrationHttpResponse({
      method: request.method,
      url: request.url,
      catalog: params.catalog,
      verification: params.verification,
    });

    response.writeHead(result.status, result.headers);
    response.end(result.body);
  });
}

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
  method = "GET",
): AgentOsSdkIntegrationHttpResponse {
  return {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
    body: method === "HEAD" ? "" : `${JSON.stringify(body, null, 2)}\n`,
  };
}

function readPathname(url: string | undefined): string {
  if (url === undefined || url.trim().length === 0) return "/";
  return new URL(url, "http://127.0.0.1").pathname;
}
