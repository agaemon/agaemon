import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BASE_COMMAND_REFERENCE_SOURCE_DIRECTORIES,
  BASE_COMMAND_REFERENCE_SOURCE_FILES,
} from "./commandReferences.js";

const WORKFLOW_PATH = ".github/workflows/base-sepolia-manifest-verify.yml";
const RELEASE_NOTE_WORKFLOW_PATH = ".github/workflows/base-sepolia-release-note-verify.yml";
const HEALTH_WORKFLOW_PATH = ".github/workflows/base-sepolia-health.yml";
const LAUNCH_GATE_WORKFLOW_PATH = ".github/workflows/base-sepolia-launch-gate.yml";
const FUNDING_DEMO_WORKFLOW_PATH = ".github/workflows/base-sepolia-funding-demo.yml";

function readManifestWorkflow(): string {
  return readFileSync(WORKFLOW_PATH, "utf8");
}

function readReleaseNoteWorkflow(): string {
  return readFileSync(RELEASE_NOTE_WORKFLOW_PATH, "utf8");
}

function readHealthWorkflow(): string {
  return readFileSync(HEALTH_WORKFLOW_PATH, "utf8");
}

function readLaunchGateWorkflow(): string {
  return readFileSync(LAUNCH_GATE_WORKFLOW_PATH, "utf8");
}

function readFundingDemoWorkflow(): string {
  return readFileSync(FUNDING_DEMO_WORKFLOW_PATH, "utf8");
}

describe("Base Sepolia manifest workflow runtime coverage", () => {
  it("triggers for every runtime file change", () => {
    expect(readManifestWorkflow()).toContain('- "runtime/**"');
  });

  it("triggers for every command-reference source change", () => {
    const workflow = readManifestWorkflow();

    for (const sourceFile of BASE_COMMAND_REFERENCE_SOURCE_FILES) {
      expect(workflow).toContain(`- "${sourceFile}"`);
    }
    for (const sourceDirectory of BASE_COMMAND_REFERENCE_SOURCE_DIRECTORIES) {
      expect(workflow).toContain(`- "${sourceDirectory}/**"`);
    }
    expect(workflow).toContain('- "package-lock.json"');
    expect(workflow).toContain('- "package.json"');
  });

  it("runs the complete runtime Vitest suite", () => {
    expect(readManifestWorkflow()).toContain("run: npm test -- runtime");
  });
});

describe("Base Sepolia release note workflow runtime coverage", () => {
  it("triggers for every release-note runtime dependency change", () => {
    const workflow = readReleaseNoteWorkflow();

    expect(workflow).toContain('- "runtime/env/**"');
    expect(workflow).toContain('- "runtime/base/localPreflight*"');
    expect(workflow).toContain('- "runtime/base/layout.test.ts"');
    expect(workflow).toContain('- "runtime/base/readiness.ts"');
    expect(workflow).toContain('- "runtime/release/**"');
    expect(workflow).toContain('- "runtime/cli/env/**"');
    expect(workflow).toContain('- "runtime/cli/base/localPreflight.ts"');
    expect(workflow).toContain('- "runtime/cli/release/**"');
  });

  it("runs release, env, and local preflight runtime tests without a hand-maintained file list", () => {
    expect(readReleaseNoteWorkflow()).toContain(
      "run: npm test -- runtime/release runtime/env runtime/base/localPreflight.test.ts runtime/base/layout.test.ts",
    );
  });
});

describe("Base Sepolia health workflow runtime coverage", () => {
  it("supports manual and scheduled health checks", () => {
    const workflow = readHealthWorkflow();

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("schedule:");
    expect(workflow).toContain("cron:");
  });

  it("generates, verifies, and uploads the Base Sepolia health report", () => {
    const workflow = readHealthWorkflow();

    expect(workflow).toContain("BASE_SEPOLIA_RPC_URL: ${{ secrets.BASE_SEPOLIA_RPC_URL }}");
    expect(workflow).toContain("run: mkdir -p artifacts && npm run --silent base:agent-account-safety-check > artifacts/base-agent-account-safety.json");
    expect(workflow).toContain("run: npm run base:health -- --manifest deployments/base-sepolia/latest.json --status docs/releases/latest.json --agent-account-safety artifacts/base-agent-account-safety.json --output artifacts/base-sepolia-health.json");
    expect(workflow).toContain("run: npm run base:health-verify -- --health artifacts/base-sepolia-health.json --manifest deployments/base-sepolia/latest.json --status docs/releases/latest.json --output artifacts/base-sepolia-health-verification.json");
    expect(workflow).toContain("name: base-sepolia-health");
    expect(workflow).toContain("artifacts/base-agent-account-safety.json");
    expect(workflow).toContain("artifacts/base-sepolia-health.json");
    expect(workflow).toContain("artifacts/base-sepolia-health-verification.json");
  });

  it("writes a GitHub Actions summary for the health report", () => {
    const workflow = readHealthWorkflow();
    const verifyStepIndex = workflow.indexOf("name: Verify Base Sepolia health report");
    const summaryStepIndex = workflow.indexOf("name: Summarize Base Sepolia health report");

    expect(workflow).toContain("name: Summarize Base Sepolia health report");
    expect(verifyStepIndex).toBeGreaterThanOrEqual(0);
    expect(summaryStepIndex).toBeGreaterThanOrEqual(0);
    expect(workflow).toContain("id: verify-health");
    expect(workflow).toContain("HEALTH_VERIFICATION_STATUS: ${{ steps.verify-health.outcome }}");
    expect(workflow).toContain("if: always()");
    expect(workflow).toContain("artifacts/base-sepolia-health.json");
    expect(workflow).toContain("artifacts/base-sepolia-health-verification.json");
    expect(workflow).toContain("GITHUB_STEP_SUMMARY");
    expect(workflow).toContain("Base Sepolia Health");
    expect(workflow).toContain("Health");
    expect(workflow).toContain("Checks");
    expect(workflow).toContain("Failed Checks");
    expect(workflow).toContain("Saved-Health Verification");
    expect(workflow).toContain("Verification Failures");
    expect(summaryStepIndex).toBeGreaterThan(verifyStepIndex);
  });
});

describe("Base Sepolia launch gate workflow runtime coverage", () => {
  it("supports manual launch gate checks with the live RPC secret", () => {
    const workflow = readLaunchGateWorkflow();

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("BASE_SEPOLIA_RPC_URL: ${{ secrets.BASE_SEPOLIA_RPC_URL }}");
  });

  it("generates and verifies the complete launch gate evidence bundle", () => {
    const workflow = readLaunchGateWorkflow();

    expect(workflow).toContain("run: npm run base:readiness-checkpoint -- --output artifacts/base-sepolia-readiness-checkpoint.json");
    expect(workflow).toContain("run: npm run base:local-preflight -- --dir docs/releases --manifest deployments/base-sepolia/latest.json --env-example .env.example --output artifacts/base-sepolia-local-preflight.json");
    expect(workflow).toContain("run: npm run base:health -- --manifest deployments/base-sepolia/latest.json --status docs/releases/latest.json --output artifacts/base-sepolia-health.json");
    expect(workflow).toContain("run: npm run base:health-verify -- --health artifacts/base-sepolia-health.json --manifest deployments/base-sepolia/latest.json --status docs/releases/latest.json");
    expect(workflow).toContain("run: npm run base:security-evidence -- --test-dir test --runtime-dir runtime --output artifacts/base-security-evidence.json --format summary");
    expect(workflow).toContain("run: npm run base:funding-demo-reconciliations -- --output artifacts/coordination-payout-reconciliations.json --format summary");
    expect(workflow).toContain("run: npm run base:economic-payout-summary -- --reconciliations artifacts/coordination-payout-reconciliations.json --output artifacts/economic-payout-summary.json --format summary");
    expect(workflow).toContain("run: npm run base:economic-payout-summary-verify -- --summary artifacts/economic-payout-summary.json --reconciliations artifacts/coordination-payout-reconciliations.json --output artifacts/economic-payout-summary-verification.json --format summary");
    expect(workflow).toContain("run: npm run base:launch-gate -- --manifest deployments/base-sepolia/latest.json --checkpoint artifacts/base-sepolia-readiness-checkpoint.json --local-preflight artifacts/base-sepolia-local-preflight.json --status docs/releases/latest.json --health artifacts/base-sepolia-health.json --security-evidence artifacts/base-security-evidence.json --economic-payout-summary-verification artifacts/economic-payout-summary-verification.json --output artifacts/base-sepolia-launch-gate.json --format summary");
    expect(workflow).toContain("run: npm run base:launch-gate-verify -- --launch-gate artifacts/base-sepolia-launch-gate.json --manifest deployments/base-sepolia/latest.json --health artifacts/base-sepolia-health.json --local-preflight artifacts/base-sepolia-local-preflight.json --security-evidence artifacts/base-security-evidence.json --economic-payout-summary-verification artifacts/economic-payout-summary-verification.json --output artifacts/base-sepolia-launch-gate-verification.json --format summary");
    expect(workflow).toContain("run: npm run base:funding-demo-evidence-manifest -- --artifact-root artifacts --manifest deployments/base-sepolia/latest.json --release-status docs/releases/latest.json --output artifacts/evidence-manifest.json --format summary");
    expect(workflow).toContain("run: npm run base:funding-demo-evidence-manifest-verify -- --evidence-manifest artifacts/evidence-manifest.json --artifact-root artifacts --deployment-manifest deployments/base-sepolia/latest.json --release-status docs/releases/latest.json --output artifacts/evidence-manifest-verification.json --format summary");
  });

  it("uploads the launch gate evidence bundle for operator review", () => {
    const workflow = readLaunchGateWorkflow();

    expect(workflow).toContain("name: base-sepolia-launch-gate");
    expect(workflow).toContain("artifacts/base-sepolia-readiness-checkpoint.json");
    expect(workflow).toContain("artifacts/base-sepolia-local-preflight.json");
    expect(workflow).toContain("artifacts/base-sepolia-health.json");
    expect(workflow).toContain("artifacts/base-security-evidence.json");
    expect(workflow).toContain("artifacts/coordination-payout-reconciliations.json");
    expect(workflow).toContain("artifacts/economic-payout-summary.json");
    expect(workflow).toContain("artifacts/economic-payout-summary-verification.json");
    expect(workflow).toContain("artifacts/base-sepolia-launch-gate.json");
    expect(workflow).toContain("artifacts/base-sepolia-launch-gate-verification.json");
    expect(workflow).toContain("artifacts/evidence-manifest.json");
    expect(workflow).toContain("artifacts/evidence-manifest-verification.json");
  });

  it("writes a GitHub Actions summary for the launch gate decision", () => {
    const workflow = readLaunchGateWorkflow();
    const verifyStepIndex = workflow.indexOf("name: Verify Base Sepolia launch gate");
    const summaryStepIndex = workflow.indexOf("name: Summarize Base Sepolia launch gate");

    expect(workflow).toContain("name: Summarize Base Sepolia launch gate");
    expect(verifyStepIndex).toBeGreaterThanOrEqual(0);
    expect(summaryStepIndex).toBeGreaterThanOrEqual(0);
    expect(workflow).toContain("if: always()");
    expect(workflow).toContain("artifacts/base-sepolia-launch-gate.json");
    expect(workflow).toContain("artifacts/base-sepolia-launch-gate-verification.json");
    expect(workflow).toContain("GITHUB_STEP_SUMMARY");
    expect(workflow).toContain("Base Sepolia Launch Gate");
    expect(workflow).toContain("Decision");
    expect(workflow).toContain("Checks");
    expect(workflow).toContain("Failed Checks");
    expect(workflow).toContain("Verification");
    expect(workflow).toContain("Verification Failures");
    expect(summaryStepIndex).toBeGreaterThan(verifyStepIndex);
  });
});

describe("Base Sepolia funding demo workflow runtime coverage", () => {
  it("supports manual funding demo proof generation with the live RPC secret", () => {
    const workflow = readFundingDemoWorkflow();

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("BASE_SEPOLIA_RPC_URL: ${{ secrets.BASE_SEPOLIA_RPC_URL }}");
    expect(workflow).toContain("BASE_SEPOLIA_FUNDING_DEMO_FROM_BLOCK: ${{ vars.BASE_SEPOLIA_FUNDING_DEMO_FROM_BLOCK || '43258341' }}");
    expect(workflow).toContain("BASE_SEPOLIA_FUNDING_DEMO_TO_BLOCK: ${{ vars.BASE_SEPOLIA_FUNDING_DEMO_TO_BLOCK || '43258350' }}");
  });

  it("generates and verifies the complete funding demo proof bundle", () => {
    const workflow = readFundingDemoWorkflow();

    expect(workflow).toContain("run: mkdir -p artifacts/funding-demo");
    expect(workflow).toContain("run: npm run base:readiness-checkpoint -- --output artifacts/funding-demo/base-sepolia-readiness-checkpoint.json");
    expect(workflow).toContain("run: npm run base:local-preflight -- --dir docs/releases --manifest deployments/base-sepolia/latest.json --env-example .env.example --output artifacts/funding-demo/base-sepolia-local-preflight.json");
    expect(workflow).toContain("run: npm run --silent base:agent-account-safety-check > artifacts/funding-demo/base-agent-account-safety.json");
    expect(workflow).toContain("run: npm run base:health -- --manifest deployments/base-sepolia/latest.json --status docs/releases/latest.json --agent-account-safety artifacts/funding-demo/base-agent-account-safety.json --output artifacts/funding-demo/base-sepolia-health.json");
    expect(workflow).toContain("run: npm run base:security-evidence -- --test-dir test --runtime-dir runtime --output artifacts/funding-demo/base-security-evidence.json --format summary");
    expect(workflow).toContain("run: npm run base:funding-demo-reconciliations -- --output artifacts/funding-demo/coordination-payout-reconciliations.json --format summary");
    expect(workflow).toContain("run: npm run base:economic-payout-summary -- --reconciliations artifacts/funding-demo/coordination-payout-reconciliations.json --output artifacts/funding-demo/economic-payout-summary.json --format summary");
    expect(workflow).toContain("run: npm run base:launch-gate -- --manifest deployments/base-sepolia/latest.json --checkpoint artifacts/funding-demo/base-sepolia-readiness-checkpoint.json --local-preflight artifacts/funding-demo/base-sepolia-local-preflight.json --status docs/releases/latest.json --health artifacts/funding-demo/base-sepolia-health.json --security-evidence artifacts/funding-demo/base-security-evidence.json --economic-payout-summary-verification artifacts/funding-demo/economic-payout-summary-verification.json --output artifacts/funding-demo/base-sepolia-launch-gate.json --format summary");
    expect(workflow).toContain("run: npm run base:event-index -- --manifest deployments/base-sepolia/latest.json --from-block \"$BASE_SEPOLIA_FUNDING_DEMO_FROM_BLOCK\" --to-block \"$BASE_SEPOLIA_FUNDING_DEMO_TO_BLOCK\" --output artifacts/funding-demo/base-event-index.json --format summary");
    expect(workflow).toContain("run: npm run base:memory-storage-binding -- --manifest deployments/base-sepolia/latest.json --storage-dir artifacts/funding-demo/memory-store --memory-id-label agentos.memory.funding-demo --content \"AgentOS funding demo memory evidence\" --output artifacts/funding-demo/memory-storage-binding.json --format summary");
    expect(workflow).toContain("run: npm run base:memory-storage-binding -- --manifest deployments/base-sepolia/latest.json --storage-dir artifacts/funding-demo/memory-store-migrated --memory-id-label agentos.memory.funding-demo --content \"AgentOS funding demo memory evidence\" --output artifacts/funding-demo/memory-storage-binding-migrated.json --format summary");
    expect(workflow).toContain("run: npm run base:memory-storage-migration-verify -- --from artifacts/funding-demo/memory-storage-binding.json --to artifacts/funding-demo/memory-storage-binding-migrated.json --output artifacts/funding-demo/memory-storage-migration-verification.json --format summary");
    expect(workflow).toContain("run: npm run base:operator-dashboard -- --manifest deployments/base-sepolia/latest.json --launch-gate artifacts/funding-demo/base-sepolia-launch-gate.json --health artifacts/funding-demo/base-sepolia-health.json --release-status docs/releases/latest.json --event-index artifacts/funding-demo/base-event-index.json --event-index-verification artifacts/funding-demo/base-event-index-verification.json --economic-payout-summary artifacts/funding-demo/economic-payout-summary.json --economic-payout-summary-verification artifacts/funding-demo/economic-payout-summary-verification.json --memory-storage-binding artifacts/funding-demo/memory-storage-binding.json --memory-storage-binding-verification artifacts/funding-demo/memory-storage-binding-verification.json --memory-storage-migration-verification artifacts/funding-demo/memory-storage-migration-verification.json --output artifacts/funding-demo/operator-dashboard.json --format summary");
    expect(workflow).toContain("run: npm run base:operator-dashboard-verify -- --dashboard artifacts/funding-demo/operator-dashboard.json --manifest deployments/base-sepolia/latest.json --launch-gate artifacts/funding-demo/base-sepolia-launch-gate.json --health artifacts/funding-demo/base-sepolia-health.json --release-status docs/releases/latest.json --event-index artifacts/funding-demo/base-event-index.json --event-index-verification artifacts/funding-demo/base-event-index-verification.json --economic-payout-summary artifacts/funding-demo/economic-payout-summary.json --economic-payout-summary-verification artifacts/funding-demo/economic-payout-summary-verification.json --memory-storage-binding artifacts/funding-demo/memory-storage-binding.json --memory-storage-binding-verification artifacts/funding-demo/memory-storage-binding-verification.json --memory-storage-migration-verification artifacts/funding-demo/memory-storage-migration-verification.json --output artifacts/funding-demo/operator-dashboard-verification.json --format summary");
    expect(workflow).toContain("run: npm run base:operator-dashboard-html -- --dashboard artifacts/funding-demo/operator-dashboard.json --output artifacts/funding-demo/operator-dashboard.html --format summary");
    expect(workflow).toContain("run: npm run base:funding-proof-demo -- --launch-gate artifacts/funding-demo/base-sepolia-launch-gate.json --health artifacts/funding-demo/base-sepolia-health.json --release-status docs/releases/latest.json --event-index artifacts/funding-demo/base-event-index.json --event-index-verification artifacts/funding-demo/base-event-index-verification.json --economic-payout-summary-verification artifacts/funding-demo/economic-payout-summary-verification.json --dashboard artifacts/funding-demo/operator-dashboard.json --dashboard-verification artifacts/funding-demo/operator-dashboard-verification.json --output artifacts/funding-demo/funding-ready-demo.json --format summary");
    expect(workflow).toContain("run: npm run base:funding-demo-review-index -- --evidence-manifest artifacts/funding-demo/evidence-manifest.json --funding-proof artifacts/funding-demo/funding-ready-demo.json --funding-proof-verification artifacts/funding-demo/funding-ready-demo-verification.json --dashboard artifacts/funding-demo/operator-dashboard.json --output artifacts/funding-demo/index.html --format summary");
    expect(workflow).toContain("run: npm run base:funding-demo-review-index-verify -- --review-index artifacts/funding-demo/index.html --evidence-manifest artifacts/funding-demo/evidence-manifest.json --funding-proof artifacts/funding-demo/funding-ready-demo.json --funding-proof-verification artifacts/funding-demo/funding-ready-demo-verification.json --dashboard artifacts/funding-demo/operator-dashboard.json --output artifacts/funding-demo/index-verification.json --format summary");
    expect(workflow).toContain("run: npm run base:funding-demo-evidence-manifest-verify -- --evidence-manifest artifacts/funding-demo/evidence-manifest.json --artifact-root artifacts/funding-demo --deployment-manifest deployments/base-sepolia/latest.json --release-status docs/releases/latest.json --output artifacts/funding-demo/evidence-manifest-verification.json --format summary");
    expect(workflow).toContain("run: npm run base:funding-demo-status -- --funding-proof artifacts/funding-demo/funding-ready-demo.json --funding-proof-verification artifacts/funding-demo/funding-ready-demo-verification.json --review-index-verification artifacts/funding-demo/index-verification.json --evidence-manifest-verification artifacts/funding-demo/evidence-manifest-verification.json --output artifacts/funding-demo/status.json --format summary");
    expect(workflow).toContain("run: npm run base:funding-demo-status-verify -- --status artifacts/funding-demo/status.json --funding-proof artifacts/funding-demo/funding-ready-demo.json --funding-proof-verification artifacts/funding-demo/funding-ready-demo-verification.json --review-index-verification artifacts/funding-demo/index-verification.json --evidence-manifest-verification artifacts/funding-demo/evidence-manifest-verification.json --output artifacts/funding-demo/status-verification.json --format summary");
  });

  it("uploads and summarizes the funding demo proof bundle for operator review", () => {
    const workflow = readFundingDemoWorkflow();

    expect(workflow).toContain("name: base-sepolia-funding-demo");
    expect(workflow).toContain("artifacts/funding-demo/**");
    expect(workflow).toContain("name: Summarize Base Sepolia funding demo");
    expect(workflow).toContain("GITHUB_STEP_SUMMARY");
    expect(workflow).toContain("Base Sepolia Funding Demo");
    expect(workflow).toContain("Funding Proof");
    expect(workflow).toContain("Evidence Manifest Verification");
    expect(workflow).toContain("Funding Demo Status");
    expect(workflow).toContain("Funding Demo Status Verification");
    expect(workflow).toContain("Event Index Store SHA-256");
    expect(workflow).toContain("Economic Abuse Signals");
  });
});
