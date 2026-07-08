import { describe, expect, it } from "vitest";

import {
  createBaseSecurityEvidenceReport,
  formatBaseSecurityEvidenceSummary,
} from "./evidence.js";
import type { BaseSecurityEvidenceReport } from "./evidence.js";

const FUZZ_SOURCE = `
contract PolicyEngineFuzzTest {
  function testFuzzPolicyLimit(uint256 value) public {}
}
`;

const UNIT_SOURCE = `
contract AgentAccountTest {
  function testUnauthorizedDelegateIsDenied() public {}
}
`;

const RUNTIME_FIXTURE_SOURCE = `
describe("verifyAgentProposalExecutionSigningPayloadPreflight", () => {
  it("returns failed payload checks when saved signing payload evidence is stale", () => {});
  it("rejects malformed proposal JSON", () => {});
  it("rejects edited report markdown", () => {});
  it("rejects signer drift when decoded fields differ", () => {});
  it("rejects manifest drift", () => {});
  it("rejects signed transactions whose decoded fields differ from the unsigned payload", () => {});
});
`;

describe("createBaseSecurityEvidenceReport", () => {
  it("passes when Solidity tests include fuzz coverage and runtime adversarial fixtures", () => {
    const report = createBaseSecurityEvidenceReport({
      generatedAt: "2026-07-02T00:00:00.000Z",
      solidityTests: [{ path: "test/PolicyEngineFuzz.t.sol", contents: FUZZ_SOURCE }],
      runtimeTests: [{ path: "runtime/proposalExecution/signingPayloadPreflight.test.ts", contents: RUNTIME_FIXTURE_SOURCE }],
    });

    expect(report.passed).toBe(true);
    expect(report.summary).toEqual({ checks: 2, passed: 2, failed: 0 });
    expect(report.fuzzTests).toEqual({ count: 1, paths: ["test/PolicyEngineFuzz.t.sol"] });
    expect(report.invariantTests).toEqual({ count: 0, paths: [] });
    expect(report.runtimeFixtures).toEqual({
      count: 1,
      paths: ["runtime/proposalExecution/signingPayloadPreflight.test.ts"],
    });
    expect(report.runtimeFixtureCategories).toEqual({
      staleArtifacts: {
        count: 1,
        paths: ["runtime/proposalExecution/signingPayloadPreflight.test.ts"],
      },
      malformedInputs: {
        count: 1,
        paths: ["runtime/proposalExecution/signingPayloadPreflight.test.ts"],
      },
      editedEvidence: {
        count: 1,
        paths: ["runtime/proposalExecution/signingPayloadPreflight.test.ts"],
      },
      mismatchDrift: {
        count: 1,
        paths: ["runtime/proposalExecution/signingPayloadPreflight.test.ts"],
      },
      unsupportedChainOrManifest: {
        count: 1,
        paths: ["runtime/proposalExecution/signingPayloadPreflight.test.ts"],
      },
    });
  });

  it("fails when Solidity tests do not include fuzz or invariant coverage", () => {
    const report = createBaseSecurityEvidenceReport({
      solidityTests: [{ path: "test/AgentAccount.t.sol", contents: UNIT_SOURCE }],
      runtimeTests: [{ path: "runtime/proposalExecution/signingPayloadPreflight.test.ts", contents: RUNTIME_FIXTURE_SOURCE }],
    });

    expect(report.passed).toBe(false);
    expect(report.checks.find((check) => check.id === "forge-adversarial-coverage")).toEqual({
      id: "forge-adversarial-coverage",
      label: "Foundry fuzz or invariant coverage",
      passed: false,
      failures: ["no Solidity fuzz or invariant tests found"],
    });
  });

  it("fails when runtime adversarial fixtures are absent", () => {
    const report = createBaseSecurityEvidenceReport({
      solidityTests: [{ path: "test/PolicyEngineFuzz.t.sol", contents: FUZZ_SOURCE }],
      runtimeTests: [{ path: "runtime/proposalExecution/readiness.test.ts", contents: "it('passes current readiness', () => {})" }],
    });

    expect(report.passed).toBe(false);
    expect(report.runtimeFixtures).toEqual({ count: 0, paths: [] });
    expect(report.checks.find((check) => check.id === "runtime-adversarial-fixtures")).toEqual({
      id: "runtime-adversarial-fixtures",
      label: "Runtime adversarial fixture coverage",
      passed: false,
      failures: ["no runtime adversarial fixtures found"],
    });
  });

  it("rejects malformed source inputs before reporting", () => {
    expect(() => createBaseSecurityEvidenceReport({
      solidityTests: [{ path: "", contents: FUZZ_SOURCE }],
      runtimeTests: [],
    })).toThrow("security evidence source 0 path must be a non-empty string");
  });
});

describe("formatBaseSecurityEvidenceSummary", () => {
  it("renders security evidence counts and check status", () => {
    const report = createBaseSecurityEvidenceReport({
      generatedAt: "2026-07-02T00:00:00.000Z",
      solidityTests: [{ path: "test/PolicyEngineFuzz.t.sol", contents: FUZZ_SOURCE }],
      runtimeTests: [{ path: "runtime/proposalExecution/signingPayloadPreflight.test.ts", contents: RUNTIME_FIXTURE_SOURCE }],
    });

    expect(formatBaseSecurityEvidenceSummary(report)).toBe([
      "Base security evidence",
      "generatedAt: 2026-07-02T00:00:00.000Z",
      "checks: 2",
      "passed: 2",
      "failed: 0",
      "fuzzTests: 1",
      "invariantTests: 0",
      "runtimeFixtures: 1",
      "runtimeFixtureCategories:",
      "  staleArtifacts: 1",
      "  malformedInputs: 1",
      "  editedEvidence: 1",
      "  mismatchDrift: 1",
      "  unsupportedChainOrManifest: 1",
      "overall: passed",
      "- forge-adversarial-coverage: passed",
      "- runtime-adversarial-fixtures: passed",
    ].join("\n"));
  });

  it("rejects malformed reports before formatting", () => {
    expect(() => formatBaseSecurityEvidenceSummary({
      schemaVersion: 1,
      generatedAt: "2026-07-02T00:00:00.000Z",
      passed: "yes",
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
      checks: [],
    } as unknown as BaseSecurityEvidenceReport)).toThrow("security evidence report passed must be a boolean");
  });
});
