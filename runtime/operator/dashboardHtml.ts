import { validateOperatorDashboardSnapshot } from "./dashboard.js";

import type { OperatorDashboardSnapshot } from "./dashboard.js";

export function renderOperatorDashboardHtml(snapshot: OperatorDashboardSnapshot): string {
  validateOperatorDashboardSnapshot(snapshot);
  const eventIndex = snapshot.eventIndex;
  const payoutSummary = snapshot.economics?.payoutSummary;
  const balances = snapshot.economics?.balances;
  const memoryStorage = snapshot.memoryStorage;

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>AgentOS Operator Dashboard</title>",
    "<style>",
    css(),
    "</style>",
    "</head>",
    "<body>",
    '<main class="shell">',
    '<section class="hero">',
    '<div>',
    '<p class="meta">Base Sepolia / testnet only</p>',
    "<h1>AgentOS Operator Dashboard</h1>",
    `<p class="lede">Generated ${escapeHtml(snapshot.generatedAt)} from verified local evidence. AI proposes, policy decides, accounts execute.</p>`,
    "</div>",
    `<div class="decision ${snapshot.launch.passed ? "ok" : "bad"}">${escapeHtml(snapshot.launch.decision)}</div>`,
    "</section>",
    '<section class="grid">',
    panel("Launch gate", snapshot.launch.passed ? "go" : "no-go", [
      `failed checks: ${snapshot.launch.failedChecks}`,
      sourceLine(snapshot.launch.source.path),
    ]),
    panel("Health", snapshot.health.passed ? "passed" : "failed", [
      `failed checks: ${snapshot.health.failedChecks}`,
      `warnings: ${snapshot.health.warnings}`,
      sourceLine(snapshot.health.source.path),
    ]),
    panel("Agent profile", shortAddress(snapshot.agent.address), [
      snapshot.agent.roleLabel,
      snapshot.agent.metadataURI,
      sourceLine(snapshot.agent.source.path),
    ]),
    panel("Release", snapshot.release.latestCommitSha?.slice(0, 12) ?? "none", [
      snapshot.release.latestGeneratedAt ?? "no generatedAt",
      snapshot.release.latestReadinessRunUrl ?? "no readiness run",
      sourceLine(snapshot.release.source.path),
    ]),
    eventIndex === undefined
      ? panel("Event index", "not supplied", ["No event-index evidence was supplied."])
      : panel("Event index", eventIndex.verified ? "verified" : "unverified", [
          `${eventIndex.indexedEventCount} indexed / ${eventIndex.economicEventCount} economic`,
          ...eventIndex.economicContracts.map((entry) => `${entry.contract}: ${entry.eventCount}`),
          ...(eventIndex.storeSha256 === undefined ? [] : [`store sha256: ${eventIndex.storeSha256}`]),
          sourceLine(eventIndex.source.path),
          sourceLine(eventIndex.verificationSource.path),
        ]),
    payoutSummary === undefined
      ? panel("Payout evidence", "not supplied", ["No payout summary was supplied."])
      : panel("Payout evidence", payoutSummary.verified ? "verified" : "unverified", [
          `assignments: ${payoutSummary.totalAssignments} total, ${payoutSummary.paidAssignments} paid, ${payoutSummary.unpaidAssignments} unpaid, ${payoutSummary.blockedAssignments} blocked`,
          `amounts wei: ${payoutSummary.totalAmountWei} total, ${payoutSummary.paidAmountWei} paid`,
          `budget failures: ${payoutSummary.budgetFailureCount}`,
          `abuse signals: ${payoutSummary.abuseSignalCount}`,
          `abuse signal wei: ${payoutSummary.abuseSignalAmountWei}`,
          sourceLine(payoutSummary.source.path),
          ...(payoutSummary.verificationSource === undefined ? [] : [sourceLine(payoutSummary.verificationSource.path)]),
        ]),
    balances === undefined
      ? panel("Balances", "not supplied", ["No health balance evidence was supplied."])
      : panel("Balances", "health sourced", [
          `owner wei: ${balances.ownerBalanceWei}`,
          `agent wei: ${balances.agentBalanceWei}`,
          sourceLine(balances.source.path),
        ]),
    memoryStorage === undefined
      ? panel("Memory storage", "not supplied", ["No memory storage binding was supplied."])
      : panel("Memory storage", memoryStorage.verified ? "verified" : "unverified", [
          memoryStorage.memoryIdLabel,
          `publisher: ${memoryStorage.publisher}`,
          `storage: ${memoryStorage.storageURI}`,
          `content hash: ${memoryStorage.contentHash}`,
          sourceLine(memoryStorage.source.path),
          sourceLine(memoryStorage.verificationSource.path),
          ...(memoryStorage.migration === undefined
            ? []
            : [
                `migration: ${memoryStorage.migration.verified ? "verified" : "unverified"}`,
                sourceLine(memoryStorage.migration.source.path),
                `from: ${memoryStorage.migration.fromSource.path}`,
                `to: ${memoryStorage.migration.toSource.path}`,
              ]),
        ]),
    "</section>",
    '<section class="boundary">',
    "<h2>Trust Boundary</h2>",
    "<p>AI proposes, policy decides, accounts execute. This dashboard is a local read-only artifact; it does not sign, send, touch mainnet, or move live funds.</p>",
    '<p class="source">Rendered artifact: artifacts/funding-demo/operator-dashboard.html</p>',
    "</section>",
    "</main>",
    "</body>",
    "</html>",
  ].join("\n");
}

export function formatOperatorDashboardHtmlSummary(
  snapshot: OperatorDashboardSnapshot,
  outputPath: string,
): string {
  validateOperatorDashboardSnapshot(snapshot);
  return [
    "Operator dashboard HTML",
    `output: ${outputPath}`,
    `launch: ${snapshot.launch.decision}`,
    `health: ${snapshot.health.passed ? "passed" : "failed"}`,
    `eventIndex: ${snapshot.eventIndex?.verified === true ? "verified" : "not-supplied"}`,
    `memoryStorage: ${snapshot.memoryStorage?.verified === true ? "verified" : "not-supplied"}`,
    "trustBoundary: AI proposes, policy decides, accounts execute",
  ].join("\n");
}

function panel(title: string, value: string, lines: string[]): string {
  return [
    '<article class="panel">',
    `<h2>${escapeHtml(title)}</h2>`,
    `<p class="value">${escapeHtml(value)}</p>`,
    "<ul>",
    ...lines.map((line) => `<li>${escapeHtml(line)}</li>`),
    "</ul>",
    "</article>",
  ].join("\n");
}

function sourceLine(path: string): string {
  return `source: ${path}`;
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function css(): string {
  return [
    ":root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f6f8fb; color: #121821; }",
    "* { box-sizing: border-box; }",
    "body { margin: 0; background: #f6f8fb; }",
    ".shell { width: min(1120px, calc(100% - 32px)); margin: 0 auto; padding: 32px 0; }",
    ".hero { display: flex; justify-content: space-between; gap: 24px; align-items: flex-end; padding: 32px 0 24px; border-bottom: 1px solid #d8dee8; }",
    ".meta { margin: 0 0 10px; color: #5c6b7a; font-size: 13px; font-weight: 700; text-transform: uppercase; }",
    "h1 { margin: 0; font-size: 38px; line-height: 1.1; font-weight: 760; letter-spacing: 0; }",
    ".lede { max-width: 720px; margin: 14px 0 0; color: #52606f; font-size: 16px; line-height: 1.6; }",
    ".decision { min-width: 132px; padding: 18px 22px; border-radius: 8px; text-align: center; font-size: 24px; font-weight: 780; text-transform: uppercase; border: 1px solid #cdd6e2; }",
    ".decision.ok { background: #e7f8ef; color: #12683a; border-color: #a9dec0; }",
    ".decision.bad { background: #fff0f0; color: #a52424; border-color: #efb5b5; }",
    ".grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin: 24px 0; }",
    ".panel { min-height: 210px; background: #ffffff; border: 1px solid #dce3ec; border-radius: 8px; padding: 18px; box-shadow: 0 10px 24px rgba(20, 30, 45, 0.06); }",
    ".panel h2, .boundary h2 { margin: 0 0 14px; font-size: 14px; line-height: 1.25; text-transform: uppercase; color: #52606f; letter-spacing: 0; }",
    ".value { margin: 0 0 14px; color: #121821; font-size: 24px; line-height: 1.15; font-weight: 760; overflow-wrap: anywhere; }",
    "ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; }",
    "li { color: #3b4653; font-size: 13px; line-height: 1.45; overflow-wrap: anywhere; }",
    ".boundary { background: #121821; color: #ffffff; border-radius: 8px; padding: 22px; margin-top: 16px; }",
    ".boundary h2 { color: #b7c5d8; }",
    ".boundary p { max-width: 860px; margin: 0; line-height: 1.6; }",
    ".boundary .source { margin-top: 12px; color: #b7c5d8; font-size: 13px; }",
    "@media (max-width: 920px) { .hero { align-items: flex-start; flex-direction: column; } .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }",
    "@media (max-width: 560px) { .shell { width: min(100% - 20px, 1120px); padding: 18px 0; } h1 { font-size: 30px; } .grid { grid-template-columns: 1fr; } .panel { min-height: auto; } }",
  ].join("\n");
}
