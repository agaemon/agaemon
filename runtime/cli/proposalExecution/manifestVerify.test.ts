import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type ProposalExecutionManifestVerifyCliModule = typeof import("./manifestVerify.js") & {
  isProposalExecutionManifestVerifyDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseProposalExecutionManifestVerifyCliArgs?: (argv: readonly string[]) => ManifestVerifyCliArgs;
  runProposalExecutionManifestVerifyCli?: (options?: ManifestVerifyRunnerOptions) => Promise<void>;
};

interface ManifestVerifyCliArgs {
  executionManifestPath: string;
  previewPath: string;
  runbookPath: string;
  bundlePath: string;
  approvalPath: string;
  manifestPath: string;
  proposalPath: string;
  summaryPath: string;
}

interface ManifestVerifyRunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyManifest?: (params: unknown) => VerificationResult;
}

interface VerificationResult {
  passed: boolean;
  failures: readonly string[];
}

const MANIFEST_VERIFY_ARGS = [
  "--execution-manifest",
  "artifacts/execution-manifest.json",
  "--preview",
  "artifacts/preview.json",
  "--runbook",
  "artifacts/runbook.md",
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

describe("isProposalExecutionManifestVerifyDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./manifestVerify.js") as ProposalExecutionManifestVerifyCliModule;
    const scriptPath = resolve("runtime/cli/proposalExecution/manifestVerify.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isProposalExecutionManifestVerifyDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isProposalExecutionManifestVerifyDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isProposalExecutionManifestVerifyDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/proposalExecution/previewVerify.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./manifestVerify.js") as ProposalExecutionManifestVerifyCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/proposalExecution/manifestVerify.ts")).href;

    expect(() => module.isProposalExecutionManifestVerifyDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseProposalExecutionManifestVerifyCliArgs", () => {
  it("requires execution manifest, preview, runbook, bundle, approval, manifest, proposal, and summary paths", async () => {
    const module = await import("./manifestVerify.js") as ProposalExecutionManifestVerifyCliModule;

    expect(() => module.parseProposalExecutionManifestVerifyCliArgs?.([])).toThrow("--execution-manifest is required");
    expect(() => module.parseProposalExecutionManifestVerifyCliArgs?.([
      "--execution-manifest",
      "execution-manifest.json",
    ])).toThrow("--preview is required");
  });

  it("parses split and equals-form execution manifest verification flags", async () => {
    const module = await import("./manifestVerify.js") as ProposalExecutionManifestVerifyCliModule;

    expect(module.parseProposalExecutionManifestVerifyCliArgs?.([
      "--execution-manifest=artifacts/execution-manifest.json",
      "--preview",
      "artifacts/preview.json",
      "--runbook=artifacts/runbook.md",
      "--bundle",
      "artifacts/bundle.json",
      "--approval=artifacts/approval.json",
      "--manifest",
      "artifacts/manifest.json",
      "--proposal=artifacts/proposal.json",
      "--summary",
      " artifacts/summary.md ",
    ])).toEqual({
      executionManifestPath: "artifacts/execution-manifest.json",
      previewPath: "artifacts/preview.json",
      runbookPath: "artifacts/runbook.md",
      bundlePath: "artifacts/bundle.json",
      approvalPath: "artifacts/approval.json",
      manifestPath: "artifacts/manifest.json",
      proposalPath: "artifacts/proposal.json",
      summaryPath: "artifacts/summary.md",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./manifestVerify.js") as ProposalExecutionManifestVerifyCliModule;

    expect(() => module.parseProposalExecutionManifestVerifyCliArgs?.([
      "--execution-manifest",
      "a.json",
      "--execution-manifest",
      "b.json",
    ])).toThrow("Duplicate argument: --execution-manifest");
    expect(() => module.parseProposalExecutionManifestVerifyCliArgs?.(["--summary"])).toThrow(
      "--summary requires a value",
    );
    expect(() => module.parseProposalExecutionManifestVerifyCliArgs?.([
      "--execution-manifest",
      "a.json",
      "--unknown",
    ])).toThrow("Unsupported argument: --unknown");
  });
});

describe("runProposalExecutionManifestVerifyCli", () => {
  it("prints injected execution manifest verification reports", async () => {
    const module = await import("./manifestVerify.js") as ProposalExecutionManifestVerifyCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runProposalExecutionManifestVerifyCli?.({
      argv: MANIFEST_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      verifyManifest: (params) => {
        calls.push(`verify:${typeof params}`);
        return { passed: true, failures: [] };
      },
    });

    expect(outputs).toEqual([JSON.stringify({
      executionManifest: "artifacts/execution-manifest.json",
      preview: "artifacts/preview.json",
      runbook: "artifacts/runbook.md",
      bundle: "artifacts/bundle.json",
      approval: "artifacts/approval.json",
      manifest: "artifacts/manifest.json",
      proposal: "artifacts/proposal.json",
      summary: "artifacts/summary.md",
      passed: true,
      failures: [],
    }, null, 2)]);
    expect(calls).toEqual([
      "read:artifacts/execution-manifest.json",
      "read:artifacts/preview.json",
      "read:artifacts/runbook.md",
      "read:artifacts/bundle.json",
      "read:artifacts/approval.json",
      "read:artifacts/manifest.json",
      "read:artifacts/proposal.json",
      "read:artifacts/summary.md",
      "verify:object",
    ]);
  });

  it("sets exit code after failed execution manifest verification output", async () => {
    const module = await import("./manifestVerify.js") as ProposalExecutionManifestVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runProposalExecutionManifestVerifyCli?.({
      argv: MANIFEST_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifyManifest: () => ({ passed: false, failures: ["execution manifest preflight failed"] }),
    });

    expect(outputs).toHaveLength(1);
    expect(JSON.parse(outputs[0]!)).toMatchObject({
      executionManifest: "artifacts/execution-manifest.json",
      passed: false,
      failures: ["execution manifest preflight failed"],
    });
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed injected execution manifest verification reports before output or exit-code mutation", async () => {
    const module = await import("./manifestVerify.js") as ProposalExecutionManifestVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await expect(module.runProposalExecutionManifestVerifyCli?.({
      argv: MANIFEST_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifyManifest: () => ({ passed: false, failures: "none" } as unknown as VerificationResult),
    })).rejects.toThrow("Proposal execution manifest verification report failures must be an array");
    expect(outputs).toEqual([]);
    expect(exitCodes).toEqual([]);
  });

  it("rejects malformed arguments before reads or execution manifest verification", async () => {
    const module = await import("./manifestVerify.js") as ProposalExecutionManifestVerifyCliModule;
    const calls: string[] = [];

    await expect(module.runProposalExecutionManifestVerifyCli?.({
      argv: ["--unknown"],
      writeOutput: () => calls.push("output"),
      readText: async () => {
        calls.push("read");
        return "";
      },
      verifyManifest: () => {
        calls.push("verify");
        return { passed: true, failures: [] };
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });
});
