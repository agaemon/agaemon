import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type ProposalExecutionReadinessVerifyCliModule = typeof import("./readinessVerify.js") & {
  isProposalExecutionReadinessVerifyDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseProposalExecutionReadinessVerifyCliArgs?: (argv: readonly string[]) => ReadinessVerifyCliArgs;
  runProposalExecutionReadinessVerifyCli?: (options?: ReadinessVerifyRunnerOptions) => Promise<void>;
};

interface ReadinessVerifyCliArgs {
  readinessPath: string;
  previewPath: string;
  runbookPath: string;
  executionManifestPath: string;
  bundlePath: string;
  approvalPath: string;
  manifestPath: string;
  proposalPath: string;
  summaryPath: string;
}

interface ReadinessVerifyRunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyReadiness?: (params: unknown) => VerificationResult;
}

interface VerificationResult {
  passed: boolean;
  failures: readonly string[];
}

const READINESS_VERIFY_ARGS = [
  "--readiness",
  "artifacts/readiness.json",
  "--preview",
  "artifacts/preview.json",
  "--runbook",
  "artifacts/runbook.md",
  "--execution-manifest",
  "artifacts/execution-manifest.json",
  "--bundle",
  "artifacts/bundle.json",
  "--approval",
  "artifacts/approval.json",
  "--manifest",
  "artifacts/manifest.json",
  "--proposal",
  "artifacts/proposal.json",
  "--summary",
  "artifacts/summary.md",
] as const;

describe("isProposalExecutionReadinessVerifyDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./readinessVerify.js") as ProposalExecutionReadinessVerifyCliModule;
    const scriptPath = resolve("runtime/cli/proposalExecution/readinessVerify.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isProposalExecutionReadinessVerifyDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isProposalExecutionReadinessVerifyDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isProposalExecutionReadinessVerifyDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/proposalExecution/readiness.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./readinessVerify.js") as ProposalExecutionReadinessVerifyCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/proposalExecution/readinessVerify.ts")).href;

    expect(() => module.isProposalExecutionReadinessVerifyDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseProposalExecutionReadinessVerifyCliArgs", () => {
  it("requires readiness and execution artifact paths", async () => {
    const module = await import("./readinessVerify.js") as ProposalExecutionReadinessVerifyCliModule;

    expect(() => module.parseProposalExecutionReadinessVerifyCliArgs?.([])).toThrow("--readiness is required");
    expect(() => module.parseProposalExecutionReadinessVerifyCliArgs?.(["--readiness", "readiness.json"])).toThrow(
      "--preview is required",
    );
  });

  it("parses split and equals-form readiness verification flags", async () => {
    const module = await import("./readinessVerify.js") as ProposalExecutionReadinessVerifyCliModule;

    expect(module.parseProposalExecutionReadinessVerifyCliArgs?.([
      "--readiness=artifacts/readiness.json",
      "--preview",
      "artifacts/preview.json",
      "--runbook=artifacts/runbook.md",
      "--execution-manifest",
      "artifacts/execution-manifest.json",
      "--bundle=artifacts/bundle.json",
      "--approval",
      "artifacts/approval.json",
      "--manifest=artifacts/manifest.json",
      "--proposal",
      "artifacts/proposal.json",
      "--summary",
      " artifacts/summary.md ",
    ])).toEqual({
      readinessPath: "artifacts/readiness.json",
      previewPath: "artifacts/preview.json",
      runbookPath: "artifacts/runbook.md",
      executionManifestPath: "artifacts/execution-manifest.json",
      bundlePath: "artifacts/bundle.json",
      approvalPath: "artifacts/approval.json",
      manifestPath: "artifacts/manifest.json",
      proposalPath: "artifacts/proposal.json",
      summaryPath: "artifacts/summary.md",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./readinessVerify.js") as ProposalExecutionReadinessVerifyCliModule;

    expect(() => module.parseProposalExecutionReadinessVerifyCliArgs?.([
      "--readiness",
      "a.json",
      "--readiness",
      "b.json",
    ])).toThrow("Duplicate argument: --readiness");
    expect(() => module.parseProposalExecutionReadinessVerifyCliArgs?.(["--summary"])).toThrow(
      "--summary requires a value",
    );
    expect(() => module.parseProposalExecutionReadinessVerifyCliArgs?.(["--readiness", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runProposalExecutionReadinessVerifyCli", () => {
  it("prints injected readiness verification reports", async () => {
    const module = await import("./readinessVerify.js") as ProposalExecutionReadinessVerifyCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runProposalExecutionReadinessVerifyCli?.({
      argv: READINESS_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      verifyReadiness: (params) => {
        calls.push(`verify:${typeof params}`);
        return { passed: true, failures: [] };
      },
    });

    expect(outputs).toEqual([JSON.stringify({
      readiness: "artifacts/readiness.json",
      preview: "artifacts/preview.json",
      runbook: "artifacts/runbook.md",
      executionManifest: "artifacts/execution-manifest.json",
      bundle: "artifacts/bundle.json",
      approval: "artifacts/approval.json",
      manifest: "artifacts/manifest.json",
      proposal: "artifacts/proposal.json",
      summary: "artifacts/summary.md",
      passed: true,
      failures: [],
    }, null, 2)]);
    expect(calls.at(-1)).toBe("verify:object");
  });

  it("sets exit code after failed readiness verification output", async () => {
    const module = await import("./readinessVerify.js") as ProposalExecutionReadinessVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runProposalExecutionReadinessVerifyCli?.({
      argv: READINESS_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifyReadiness: () => ({ passed: false, failures: ["readiness pendingNonce must be a non-negative integer"] }),
    });

    expect(outputs).toHaveLength(1);
    expect(JSON.parse(outputs[0]!)).toMatchObject({
      readiness: "artifacts/readiness.json",
      passed: false,
      failures: ["readiness pendingNonce must be a non-negative integer"],
    });
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed injected readiness verification reports before output or exit-code mutation", async () => {
    const module = await import("./readinessVerify.js") as ProposalExecutionReadinessVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await expect(module.runProposalExecutionReadinessVerifyCli?.({
      argv: READINESS_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifyReadiness: () => ({ passed: false, failures: "none" } as unknown as VerificationResult),
    })).rejects.toThrow("Proposal execution readiness verification report failures must be an array");
    expect(outputs).toEqual([]);
    expect(exitCodes).toEqual([]);
  });
});
