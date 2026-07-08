import { describe, expect, it } from "vitest";

import {
  formatFundingDemoEvidenceManifestVerifyCliOutput,
  parseFundingDemoEvidenceManifestVerifyCliArgs,
  runFundingDemoEvidenceManifestVerifyCli,
} from "./fundingDemoEvidenceManifestVerify.js";
import type {
  FundingDemoEvidenceManifest,
  FundingDemoEvidenceManifestVerification,
} from "../../operator/fundingDemoEvidenceManifest.js";

const MANIFEST: FundingDemoEvidenceManifest = {
  schemaVersion: 1,
  generatedAt: "2026-07-03T00:00:00.000Z",
  network: "base-sepolia",
  objective: "AgentOS Kernel becomes a credible funding-ready AI x blockchain proof.",
  artifactRoot: "artifacts/funding-demo",
  trustBoundary: {
    ai: "proposes",
    policy: "decides",
    accounts: "execute",
    mainnet: false,
    liveFunds: false,
  },
  evidence: [
    {
      id: "funding-proof",
      label: "Funding-ready proof",
      path: "artifacts/funding-demo/funding-ready-demo.json",
      role: "proof",
      required: true,
    },
  ],
};

const VERIFICATION: FundingDemoEvidenceManifestVerification = {
  passed: true,
  failures: [],
  expected: MANIFEST,
};

describe("parseFundingDemoEvidenceManifestVerifyCliArgs", () => {
  it("parses saved manifest, source paths, output, and format", () => {
    expect(parseFundingDemoEvidenceManifestVerifyCliArgs([
      "--evidence-manifest", "artifacts/demo/evidence-manifest.json",
      "--artifact-root", "artifacts/demo",
      "--deployment-manifest", "deployments/base-sepolia/custom.json",
      "--release-status=docs/releases/custom.json",
      "--output", "artifacts/demo/evidence-manifest-verification.json",
      "--format", "summary",
    ])).toEqual({
      evidenceManifestPath: "artifacts/demo/evidence-manifest.json",
      artifactRoot: "artifacts/demo",
      deploymentManifestPath: "deployments/base-sepolia/custom.json",
      releaseStatusPath: "docs/releases/custom.json",
      outputPath: "artifacts/demo/evidence-manifest-verification.json",
      format: "summary",
    });
  });
});

describe("runFundingDemoEvidenceManifestVerifyCli", () => {
  it("writes verification without RPC or signer env", async () => {
    const outputs: string[] = [];
    const writes: unknown[] = [];
    const env: Record<string, string | undefined> = {};

    await runFundingDemoEvidenceManifestVerifyCli({
      argv: ["--evidence-manifest", "artifacts/funding-demo/evidence-manifest.json", "--output", "artifacts/funding-demo/evidence-manifest-verification.json", "--format", "summary"],
      env,
      readText: async () => JSON.stringify(MANIFEST),
      writeOutput: (output) => outputs.push(output),
      writeText: async (path, contents) => { writes.push({ path, passed: JSON.parse(contents).passed }); },
      mkdirp: async (path) => { writes.push({ mkdir: path }); },
      createManifest: () => MANIFEST,
      pathExists: async () => true,
    });

    expect(writes).toEqual([
      { mkdir: "artifacts/funding-demo" },
      { path: "artifacts/funding-demo/evidence-manifest-verification.json", passed: true },
    ]);
    expect(outputs[0]).toContain("Funding demo evidence manifest verification");
    expect(env.BASE_SEPOLIA_RPC_URL).toBeUndefined();
    expect(env.PRIVATE_KEY).toBeUndefined();
  });

  it("fails closed when a required manifest evidence file is missing", async () => {
    const outputs: string[] = [];
    const writes: unknown[] = [];
    const exitCodes: number[] = [];

    await runFundingDemoEvidenceManifestVerifyCli({
      argv: ["--evidence-manifest", "artifacts/funding-demo/evidence-manifest.json", "--output", "artifacts/funding-demo/evidence-manifest-verification.json", "--format", "summary"],
      readText: async () => JSON.stringify(MANIFEST),
      writeOutput: (output) => outputs.push(output),
      writeText: async (path, contents) => {
        const verification = JSON.parse(contents) as { passed: boolean; failures: string[] };
        writes.push({ path, passed: verification.passed, failures: verification.failures });
      },
      mkdirp: async () => {},
      createManifest: () => MANIFEST,
      pathExists: async (path) => path !== "artifacts/funding-demo/funding-ready-demo.json",
      setExitCode: (code) => exitCodes.push(code),
    });

    expect(writes).toEqual([
      {
        path: "artifacts/funding-demo/evidence-manifest-verification.json",
        passed: false,
        failures: ["required evidence artifact is missing: artifacts/funding-demo/funding-ready-demo.json"],
      },
    ]);
    expect(outputs[0]).toContain("passed: false");
    expect(exitCodes).toEqual([1]);
  });
});

describe("formatFundingDemoEvidenceManifestVerifyCliOutput", () => {
  it("formats JSON and summary output", () => {
    expect(formatFundingDemoEvidenceManifestVerifyCliOutput(VERIFICATION, "json")).toContain("\"passed\": true");
    expect(formatFundingDemoEvidenceManifestVerifyCliOutput(VERIFICATION, "summary")).toContain("passed: true");
  });
});
