import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  formatBaseSepoliaHealthVerificationSummary,
  verifyBaseSepoliaHealthReport,
} from "./healthVerify.js";
import type { BaseSepoliaHealthReport } from "./health.js";

const MANIFEST = JSON.stringify({ network: "base-sepolia", chainId: 84532 }, null, 2);
const MANIFEST_SHA = createHash("sha256").update(MANIFEST).digest("hex");

const HEALTH: BaseSepoliaHealthReport = {
  schemaVersion: 1,
  generatedAt: "2026-07-02T00:00:00.000Z",
  manifest: {
    path: "deployments/base-sepolia/latest.json",
    sha256: MANIFEST_SHA,
    network: "base-sepolia",
    chainId: 84532,
    contractCount: 5,
    transactionCount: 8,
  },
  release: { statusPath: "docs/releases/latest.json" },
  passed: true,
  summary: { checks: 4, passed: 4, failed: 0, warnings: 0 },
  checks: [
    {
      id: "manifest-shape",
      label: "Deployment manifest shape",
      severity: "critical",
      passed: true,
      failures: [],
      remediation: "Regenerate deployments/base-sepolia/latest.json from the deployment scripts.",
    },
  ],
};

describe("verifyBaseSepoliaHealthReport", () => {
  it("passes a saved health report that matches current manifest and status paths", () => {
    expect(verifyBaseSepoliaHealthReport(HEALTH, {
      manifestPath: "deployments/base-sepolia/latest.json",
      manifestContents: MANIFEST,
      releaseStatusPath: "docs/releases/latest.json",
    })).toEqual({ passed: true, failures: [] });
  });

  it("fails malformed health reports without throwing", () => {
    expect(verifyBaseSepoliaHealthReport({ ...HEALTH, passed: "yes" })).toEqual({
      passed: false,
      failures: ["health report passed must be a boolean"],
    });
  });

  it("fails saved reports that did not pass", () => {
    const verification = verifyBaseSepoliaHealthReport({
      ...HEALTH,
      passed: false,
      summary: { checks: 4, passed: 3, failed: 1, warnings: 0 },
    });

    expect(verification.failures).toContain("health report must be passed");
  });

  it("fails when the saved report no longer matches current manifest evidence", () => {
    const verification = verifyBaseSepoliaHealthReport(HEALTH, {
      manifestPath: "deployments/base-sepolia/latest.json",
      manifestContents: JSON.stringify({ network: "base-sepolia", chainId: 84532, changed: true }),
      releaseStatusPath: "docs/releases/latest.json",
    });

    expect(verification.failures).toContain("health report manifest SHA-256 does not match current manifest");
  });

  it("formats readable verifier summaries", () => {
    expect(formatBaseSepoliaHealthVerificationSummary({
      passed: false,
      failures: ["health report must be passed"],
    })).toBe([
      "Base Sepolia health verification",
      "passed: false",
      "failures: 1",
      "- health report must be passed",
    ].join("\n"));
  });
});
