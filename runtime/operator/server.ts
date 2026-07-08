import { createServer } from "node:http";

import { validateOperatorDashboardSnapshot } from "./dashboard.js";
import { renderOperatorDashboardHtml } from "./dashboardHtml.js";

import type { Server } from "node:http";
import type { OperatorDashboardSnapshot } from "./dashboard.js";

const TRUST_BOUNDARY = {
  statement: "AI proposes. Policy decides. Accounts execute.",
  callClass: "local-only",
  readOnly: true,
  mainnet: false,
  liveFunds: false,
  signing: false,
  transactionSubmission: false,
} as const;

export interface OperatorDashboardApiResponse {
  schemaVersion: 1;
  generatedAt: string;
  source: { path: string };
  trustBoundary: typeof TRUST_BOUNDARY;
  dashboard: OperatorDashboardSnapshot;
}

export interface OperatorDashboardServerHealth {
  schemaVersion: 1;
  status: "ok";
  service: "agentos-operator-dashboard";
  source: { path: string };
  trustBoundary: typeof TRUST_BOUNDARY;
}

export interface OperatorDashboardHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface CreateOperatorDashboardApiResponseParams {
  snapshot: OperatorDashboardSnapshot;
  dashboardPath: string;
}

export interface CreateOperatorDashboardHttpResponseParams extends CreateOperatorDashboardApiResponseParams {
  method: string | undefined;
  url: string | undefined;
}

export interface CreateOperatorDashboardServerParams extends CreateOperatorDashboardApiResponseParams {}

export function createOperatorDashboardApiResponse(
  params: CreateOperatorDashboardApiResponseParams,
): OperatorDashboardApiResponse {
  validateDashboardServerParams(params);
  return {
    schemaVersion: 1,
    generatedAt: params.snapshot.generatedAt,
    source: { path: params.dashboardPath },
    trustBoundary: TRUST_BOUNDARY,
    dashboard: params.snapshot,
  };
}

export function createOperatorDashboardServerHealth(dashboardPath: string): OperatorDashboardServerHealth {
  requireNonEmptyString(dashboardPath, "dashboard path");
  return {
    schemaVersion: 1,
    status: "ok",
    service: "agentos-operator-dashboard",
    source: { path: dashboardPath },
    trustBoundary: TRUST_BOUNDARY,
  };
}

export function createOperatorDashboardHttpResponse(
  params: CreateOperatorDashboardHttpResponseParams,
): OperatorDashboardHttpResponse {
  validateDashboardServerParams(params);
  const method = params.method ?? "GET";
  const pathname = readPathname(params.url ?? "/");

  if (method !== "GET" && method !== "HEAD") {
    return jsonResponse(405, {
      error: "method_not_allowed",
      trustBoundary: TRUST_BOUNDARY,
    }, { allow: "GET, HEAD" });
  }

  if (pathname === "/") {
    return {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
      body: method === "HEAD" ? "" : renderOperatorDashboardHtml(params.snapshot),
    };
  }

  if (pathname === "/api/dashboard") {
    return jsonResponse(200, createOperatorDashboardApiResponse(params), {}, method === "HEAD");
  }

  if (pathname === "/healthz") {
    return jsonResponse(200, createOperatorDashboardServerHealth(params.dashboardPath), {}, method === "HEAD");
  }

  return jsonResponse(404, {
    error: "not_found",
    trustBoundary: TRUST_BOUNDARY,
  }, {}, method === "HEAD");
}

export function createOperatorDashboardServer(params: CreateOperatorDashboardServerParams): Server {
  validateDashboardServerParams(params);
  return createServer((request, response) => {
    const dashboardResponse = createOperatorDashboardHttpResponse({
      ...params,
      method: request.method,
      url: request.url,
    });
    response.statusCode = dashboardResponse.status;
    for (const [name, value] of Object.entries(dashboardResponse.headers)) {
      response.setHeader(name, value);
    }
    response.end(dashboardResponse.body);
  });
}

function jsonResponse(
  status: number,
  payload: unknown,
  headers: Record<string, string> = {},
  emptyBody = false,
): OperatorDashboardHttpResponse {
  return {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
    body: emptyBody ? "" : `${JSON.stringify(payload, null, 2)}\n`,
  };
}

function readPathname(url: string): string {
  try {
    return new URL(url, "http://127.0.0.1").pathname;
  } catch {
    return "/";
  }
}

function validateDashboardServerParams(
  params: unknown,
): asserts params is CreateOperatorDashboardApiResponseParams {
  if (typeof params !== "object" || params === null || Array.isArray(params)) {
    throw new Error("operator dashboard server params must be an object");
  }
  const record = params as Record<string, unknown>;
  validateOperatorDashboardSnapshot(record.snapshot);
  requireNonEmptyString(record.dashboardPath, "dashboard path");
}

function requireNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

