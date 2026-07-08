import { describe, expect, it } from "vitest";

import {
  formatSecurityEvidenceCliOutput,
  parseSecurityEvidenceCliArgs,
  runSecurityEvidenceCli,
} from "./evidence.js";
import type {
  BaseSecurityEvidenceReport,
  CreateBaseSecurityEvidenceReportParams,
  SecurityEvidenceSource,
} from "../../security/evidence.js";

const REPORT: BaseSecurityEvidenceReport = {
  schemaVersion: 1,
  generatedAt: "2026-07-02T00:00:00.000Z",
  passed: true,
  summary: { checks: 1, passed: 1, failed: 0 },
  fuzzTests: { count: 1, paths: ["test/PolicyEngineFuzz.t.sol"] },
  invariantTests: { count: 0, paths: [] },
  runtimeFixtures: { count: 1, paths: ["runtime/proposalExecution/signingPayloadPreflight.test.ts"] },
  runtimeFixtureCategories: {
    staleArtifacts: { count: 1, paths: ["runtime/proposalExecution/signingPayloadPreflight.test.ts"] },
    malformedInputs: { count: 1, paths: ["runtime/proposalExecution/signingPayloadPreflight.test.ts"] },
    editedEvidence: { count: 1, paths: ["runtime/proposalExecution/signingPayloadPreflight.test.ts"] },
    mismatchDrift: { count: 1, paths: ["runtime/proposalExecution/signingPayloadPreflight.test.ts"] },
    unsupportedChainOrManifest: { count: 1, paths: ["runtime/proposalExecution/signingPayloadPreflight.test.ts"] },
  },
  checks: [
    {
      id: "forge-adversarial-coverage",
      label: "Foundry fuzz or invariant coverage",
      passed: true,
      failures: [],
    },
    {
      id: "runtime-adversarial-fixtures",
      label: "Runtime adversarial fixture coverage",
      passed: true,
      failures: [],
    },
  ],
};

describe("parseSecurityEvidenceCliArgs", () => {
  it("parses custom test directory, output, and format flags", () => {
    expect(parseSecurityEvidenceCliArgs([
      "--test-dir",
      "contracts/test",
      "--runtime-dir=runtime",
      "--output=artifacts/security.json",
      "--format",
      "summary",
    ])).toEqual({
      testDir: "contracts/test",
      runtimeDir: "runtime",
      outputPath: "artifacts/security.json",
      format: "summary",
    });
  });
});

describe("runSecurityEvidenceCli", () => {
  it("writes a JSON security evidence artifact and renders requested summary output", async () => {
    const outputs: string[] = [];
    const writes: Array<{ path: string; contents: string }> = [];
    const mkdirs: string[] = [];
    const createParams: CreateBaseSecurityEvidenceReportParams[] = [];

    await runSecurityEvidenceCli({
      argv: ["--test-dir", "contracts/test", "--runtime-dir", "runtime", "--output", "artifacts/security.json", "--format", "summary"],
      writeOutput: (output) => outputs.push(output),
      readSources: async (testDir) => [{ path: `${testDir}/PolicyEngineFuzz.t.sol`, contents: "function testFuzzPolicyLimit(uint256 value) public {}" }],
      readRuntimeSources: async (runtimeDir) => [{
        path: `${runtimeDir}/proposalExecution/signingPayloadPreflight.test.ts`,
        contents: "it('returns failed payload checks when saved signing payload evidence is stale', () => {})",
      }],
      writeText: async (path, contents) => { writes.push({ path, contents }); },
      mkdirp: async (path) => { mkdirs.push(path); },
      createReport: (params) => {
        createParams.push(params);
        return REPORT;
      },
    });

    expect(createParams[0]?.solidityTests).toEqual([
      {
        path: "contracts/test/PolicyEngineFuzz.t.sol",
        contents: "function testFuzzPolicyLimit(uint256 value) public {}",
      },
    ]);
    expect(createParams[0]?.runtimeTests).toEqual([
      {
        path: "runtime/proposalExecution/signingPayloadPreflight.test.ts",
        contents: "it('returns failed payload checks when saved signing payload evidence is stale', () => {})",
      },
    ]);
    expect(outputs).toEqual([formatSecurityEvidenceCliOutput(REPORT, "summary")]);
    expect(mkdirs).toEqual(["artifacts"]);
    expect(writes).toEqual([
      { path: "artifacts/security.json", contents: `${JSON.stringify(REPORT, null, 2)}\n` },
    ]);
  });

  it("sets exit code for failed security evidence", async () => {
    let exitCode: number | undefined;

    await runSecurityEvidenceCli({
      argv: [],
      writeOutput: () => {},
      setExitCode: (code) => { exitCode = code; },
      readSources: async (): Promise<SecurityEvidenceSource[]> => [],
      readRuntimeSources: async (): Promise<SecurityEvidenceSource[]> => [],
      createReport: () => ({ ...REPORT, passed: false, summary: { checks: 1, passed: 0, failed: 1 } }),
    });

    expect(exitCode).toBe(1);
  });
});

describe("formatSecurityEvidenceCliOutput", () => {
  it("keeps JSON as the default output", () => {
    expect(formatSecurityEvidenceCliOutput(REPORT, "json")).toBe(JSON.stringify(REPORT, null, 2));
  });
});
