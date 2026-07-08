import { validateOperatorDashboardSnapshot } from "./dashboard.js";
import { validateFundingDemoEvidenceManifest } from "./fundingDemoEvidenceManifest.js";
import {
  validateFundingReadyOperatorDemoReport,
  validateFundingReadyOperatorDemoVerification,
} from "./fundingReadyDemo.js";

import type { OperatorDashboardSnapshot } from "./dashboard.js";
import type { FundingDemoEvidenceManifest } from "./fundingDemoEvidenceManifest.js";
import type {
  FundingReadyOperatorDemoReport,
  FundingReadyOperatorDemoVerification,
} from "./fundingReadyDemo.js";

export interface FundingDemoReviewIndexParams {
  manifest: FundingDemoEvidenceManifest;
  fundingProof: FundingReadyOperatorDemoReport;
  fundingProofVerification: FundingReadyOperatorDemoVerification;
  dashboard: OperatorDashboardSnapshot;
  outputPath?: string | undefined;
}

export interface VerifyFundingDemoReviewIndexParams {
  savedHtml: string;
  expectedHtml: string;
}

export interface FundingDemoReviewIndexVerification {
  passed: boolean;
  failures: string[];
  expectedHtml: string;
}

export function renderFundingDemoReviewIndexHtml(params: FundingDemoReviewIndexParams): string {
  validateFundingDemoReviewIndexParams(params);
  const proof = params.fundingProof;
  const verification = params.fundingProofVerification;
  const manifest = params.manifest;
  const dashboard = params.dashboard;

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>AgentOS Funding Demo Review</title>",
    "<style>",
    css(),
    "</style>",
    "</head>",
    "<body>",
    '<main class="shell">',
    '<section class="hero">',
    '<p class="meta">Base Sepolia / testnet only</p>',
    "<h1>AgentOS Funding Demo Review</h1>",
    `<p class="lede">${escapeHtml(proof.objective)} AI proposes, policy decides, accounts execute.</p>`,
    "</section>",
    '<section class="status-grid">',
    metric("overall", proof.passed ? "passed" : "failed"),
    metric("proof verification", verification.passed ? "passed" : "failed"),
    metric("launch", dashboard.launch.decision),
    metric("evidence files", String(manifest.evidence.length)),
    metric("event index", dashboard.eventIndex?.verified === true ? "verified" : "not supplied"),
    metric("economic abuse signals", String(proof.economicAbuseSignals.count)),
    metric("economic abuse signal wei", proof.economicAbuseSignals.amountWei),
    metric("memory migration", dashboard.memoryStorage?.migration?.verified === true ? "verified" : "not supplied"),
    "</section>",
    '<section class="section">',
    "<h2>Funding Proof Checks</h2>",
    '<div class="checks">',
    ...proof.checks.map((check) => [
      `<article class="check ${check.passed ? "ok" : "bad"}">`,
      `<h3>${escapeHtml(check.id)}</h3>`,
      `<p>${escapeHtml(check.label)}</p>`,
      `<strong>${check.passed ? "passed" : "failed"}</strong>`,
      ...check.failures.map((failure) => `<p class="failure">${escapeHtml(failure)}</p>`),
      "</article>",
    ].join("\n")),
    "</div>",
    "</section>",
    '<section class="section">',
    "<h2>Evidence Bundle</h2>",
    "<table>",
    "<thead><tr><th>Artifact</th><th>Role</th><th>Path</th></tr></thead>",
    "<tbody>",
    ...manifest.evidence.map((entry) => [
      "<tr>",
      `<td>${escapeHtml(entry.label)}</td>`,
      `<td>${escapeHtml(entry.role)}</td>`,
      `<td><code>${escapeHtml(entry.path)}</code></td>`,
      "</tr>",
    ].join("")),
    "</tbody>",
    "</table>",
    "</section>",
    '<section class="boundary">',
    "<h2>Trust Boundary</h2>",
    "<p>AI proposes, policy decides, accounts execute. This local artifact does not sign, send, touch mainnet, or move live funds.</p>",
    "</section>",
    "</main>",
    "</body>",
    "</html>",
  ].join("\n");
}

export function formatFundingDemoReviewIndexSummary(params: FundingDemoReviewIndexParams): string {
  validateFundingDemoReviewIndexParams(params);
  return [
    "Funding demo review index",
    `output: ${params.outputPath ?? "artifacts/funding-demo/index.html"}`,
    `network: ${params.fundingProof.network}`,
    `overall: ${params.fundingProof.passed ? "passed" : "failed"}`,
    `proofVerification: ${params.fundingProofVerification.passed ? "passed" : "failed"}`,
    `evidence: ${params.manifest.evidence.length} files`,
    `economicAbuseSignals: count=${params.fundingProof.economicAbuseSignals.count} amountWei=${params.fundingProof.economicAbuseSignals.amountWei}`,
    "trustBoundary: AI proposes, policy decides, accounts execute",
  ].join("\n");
}

export function verifyFundingDemoReviewIndex(
  params: VerifyFundingDemoReviewIndexParams,
): FundingDemoReviewIndexVerification {
  requireString(params.savedHtml, "saved funding demo review index HTML");
  requireString(params.expectedHtml, "expected funding demo review index HTML");
  const failures = params.savedHtml === params.expectedHtml ? [] : ["funding demo review index is stale"];

  return {
    passed: failures.length === 0,
    failures,
    expectedHtml: params.expectedHtml,
  };
}

export function formatFundingDemoReviewIndexVerificationSummary(
  verification: FundingDemoReviewIndexVerification,
): string {
  validateFundingDemoReviewIndexVerification(verification);
  return [
    "Funding demo review index verification",
    `passed: ${verification.passed}`,
    `failures: ${verification.failures.length}`,
    ...verification.failures.map((failure) => `- ${failure}`),
  ].join("\n");
}

export function validateFundingDemoReviewIndexVerification(
  verification: unknown,
): asserts verification is FundingDemoReviewIndexVerification {
  const record = requireRecord(verification, "funding demo review index verification");
  requireBoolean(record.passed, "funding demo review index verification passed");
  if (!Array.isArray(record.failures) || record.failures.some((failure) => typeof failure !== "string")) {
    throw new Error("funding demo review index verification failures must be an array of strings");
  }
  requireString(record.expectedHtml, "funding demo review index verification expectedHtml");
}

function validateFundingDemoReviewIndexParams(params: FundingDemoReviewIndexParams): void {
  validateFundingDemoEvidenceManifest(params.manifest);
  validateFundingReadyOperatorDemoReport(params.fundingProof);
  validateFundingReadyOperatorDemoVerification(params.fundingProofVerification);
  validateOperatorDashboardSnapshot(params.dashboard);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);

  return value;
}

function requireBoolean(value: unknown, label: string): void {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean`);
}

function metric(label: string, value: string): string {
  return [
    '<article class="metric">',
    `<span>${escapeHtml(label)}: ${escapeHtml(value)}</span>`,
    `<strong>${escapeHtml(value)}</strong>`,
    "</article>",
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function css(): string {
  return [
    ":root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f6f8fb; color: #121821; }",
    "* { box-sizing: border-box; }",
    "body { margin: 0; background: #f6f8fb; }",
    ".shell { width: min(1120px, calc(100% - 32px)); margin: 0 auto; padding: 32px 0; }",
    ".hero { padding: 28px 0 22px; border-bottom: 1px solid #d8dee8; }",
    ".meta { margin: 0 0 10px; color: #5c6b7a; font-size: 13px; font-weight: 700; text-transform: uppercase; }",
    "h1 { margin: 0; font-size: 38px; line-height: 1.1; font-weight: 760; letter-spacing: 0; }",
    ".lede { max-width: 780px; margin: 14px 0 0; color: #52606f; font-size: 16px; line-height: 1.6; }",
    ".status-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin: 24px 0; }",
    ".metric, .check, .section { background: #ffffff; border: 1px solid #dce3ec; border-radius: 8px; box-shadow: 0 10px 24px rgba(20, 30, 45, 0.06); }",
    ".metric { min-height: 118px; padding: 18px; display: grid; align-content: space-between; }",
    ".metric span, .section h2 { color: #52606f; font-size: 13px; font-weight: 760; text-transform: uppercase; }",
    ".metric strong { font-size: 24px; line-height: 1.15; overflow-wrap: anywhere; }",
    ".section { padding: 18px; margin: 16px 0; }",
    ".checks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }",
    ".check { padding: 14px; box-shadow: none; }",
    ".check h3 { margin: 0 0 8px; font-size: 16px; }",
    ".check p { margin: 0 0 8px; color: #52606f; line-height: 1.45; }",
    ".check.ok strong { color: #12683a; }",
    ".check.bad strong, .failure { color: #a52424; }",
    "table { width: 100%; border-collapse: collapse; }",
    "th, td { border-bottom: 1px solid #e3e8f0; padding: 10px 8px; text-align: left; vertical-align: top; font-size: 13px; }",
    "code { overflow-wrap: anywhere; white-space: normal; }",
    ".boundary { background: #121821; color: #ffffff; border-radius: 8px; padding: 22px; margin-top: 16px; }",
    ".boundary h2 { margin: 0 0 10px; color: #b7c5d8; font-size: 14px; text-transform: uppercase; }",
    ".boundary p { margin: 0; line-height: 1.6; }",
    "@media (max-width: 760px) { .status-grid, .checks { grid-template-columns: 1fr; } h1 { font-size: 30px; } .shell { width: min(100% - 20px, 1120px); padding: 18px 0; } }",
  ].join("\n");
}
