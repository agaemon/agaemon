import { describe, expect, it } from "vitest";

import {
  formatFundingDemoEvidenceManifestCliOutput,
  parseFundingDemoEvidenceManifestCliArgs,
  runFundingDemoEvidenceManifestCli,
} from "./fundingDemoEvidenceManifest.js";
import type { FundingDemoEvidenceManifest } from "../../operator/fundingDemoEvidenceManifest.js";

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

describe("parseFundingDemoEvidenceManifestCliArgs", () => {
  it("parses artifact root, source paths, output, and format", () => {
    expect(parseFundingDemoEvidenceManifestCliArgs([
      "--artifact-root", "artifacts/demo",
      "--manifest", "deployments/base-sepolia/custom.json",
      "--release-status=docs/releases/custom.json",
      "--output", "artifacts/demo/evidence-manifest.json",
      "--format", "summary",
    ])).toEqual({
      artifactRoot: "artifacts/demo",
      deploymentManifestPath: "deployments/base-sepolia/custom.json",
      releaseStatusPath: "docs/releases/custom.json",
      outputPath: "artifacts/demo/evidence-manifest.json",
      format: "summary",
    });
  });
});

describe("runFundingDemoEvidenceManifestCli", () => {
  it("writes the local evidence manifest without RPC or signer env", async () => {
    const outputs: string[] = [];
    const writes: unknown[] = [];
    const env: Record<string, string | undefined> = {};

    await runFundingDemoEvidenceManifestCli({
      argv: ["--output", "artifacts/funding-demo/evidence-manifest.json", "--format", "summary"],
      env,
      writeOutput: (output) => outputs.push(output),
      writeText: async (path, contents) => { writes.push({ path, evidence: JSON.parse(contents).evidence.length }); },
      mkdirp: async (path) => { writes.push({ mkdir: path }); },
      createManifest: () => MANIFEST,
    });

    expect(writes).toEqual([
      { mkdir: "artifacts/funding-demo" },
      { path: "artifacts/funding-demo/evidence-manifest.json", evidence: 1 },
    ]);
    expect(outputs[0]).toContain("Funding demo evidence manifest");
    expect(env.BASE_SEPOLIA_RPC_URL).toBeUndefined();
    expect(env.PRIVATE_KEY).toBeUndefined();
  });
});

describe("formatFundingDemoEvidenceManifestCliOutput", () => {
  it("formats JSON and summary output", () => {
    expect(formatFundingDemoEvidenceManifestCliOutput(MANIFEST, "json")).toContain("\"schemaVersion\": 1");
    expect(formatFundingDemoEvidenceManifestCliOutput(MANIFEST, "summary")).toContain("evidence: 1 files");
  });
});
