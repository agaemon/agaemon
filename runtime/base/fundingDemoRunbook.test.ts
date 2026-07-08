import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const RUNBOOK_PATH = "docs/demo/funding-ready-operator-demo.md";

describe("funding-ready operator demo runbook", () => {
  it("generates verified economic evidence before running the launch gate", () => {
    const runbook = readFileSync(RUNBOOK_PATH, "utf8");
    const economicVerification = "npm run base:economic-payout-summary-verify";
    const launchGate = "npm run base:launch-gate --";
    const launchGateVerify = "npm run base:launch-gate-verify --";
    const economicEvidenceFlag = "--economic-payout-summary-verification artifacts/funding-demo/economic-payout-summary-verification.json";

    expect(runbook.indexOf(economicVerification)).toBeGreaterThan(-1);
    expect(runbook.indexOf(launchGate)).toBeGreaterThan(runbook.indexOf(economicVerification));
    expect(commandLine(runbook, launchGate)).toContain(economicEvidenceFlag);
    expect(commandLine(runbook, launchGateVerify)).toContain(economicEvidenceFlag);
  });

  it("documents the GitHub Actions funding demo workflow boundary", () => {
    const runbook = readFileSync(RUNBOOK_PATH, "utf8");

    expect(runbook).toContain(".github/workflows/base-sepolia-funding-demo.yml");
    expect(runbook).toContain("BASE_SEPOLIA_FUNDING_DEMO_FROM_BLOCK");
    expect(runbook).toContain("BASE_SEPOLIA_FUNDING_DEMO_TO_BLOCK");
    expect(runbook).toContain("npm run base:operator-dashboard-html");
    expect(runbook).toContain("npm run base:funding-demo-status");
    expect(runbook).toContain("npm run base:funding-demo-status-verify");
    expect(runbook).toContain("status.json");
    expect(runbook).toContain("status-verification.json");
    expect(runbook).toContain("No mainnet, no live funds, no signer secret, and no transaction submission.");
  });
});

function commandLine(text: string, prefix: string): string {
  return text.split("\n").find((line) => line.startsWith(prefix)) ?? "";
}
