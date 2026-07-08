import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type ProposalExecutionPackageVerifyCliModule = typeof import("./packageVerify.js") & {
  isProposalExecutionPackageVerifyDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseProposalExecutionPackageVerifyCliArgs?: (argv: readonly string[]) => PackageVerifyCliArgs;
  runProposalExecutionPackageVerifyCli?: (options?: PackageVerifyRunnerOptions) => Promise<void>;
};

interface PackageVerifyCliArgs {
  previewPath: string;
  runbookPath: string;
  bundlePath: string;
  approvalPath: string;
  manifestPath: string;
  proposalPath: string;
  summaryPath: string;
}

interface PackageVerifyRunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyPackage?: (params: unknown) => VerificationResult;
}

interface VerificationResult {
  passed: boolean;
  failures: readonly string[];
}

const PACKAGE_VERIFY_ARGS = [
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

describe("isProposalExecutionPackageVerifyDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./packageVerify.js") as ProposalExecutionPackageVerifyCliModule;
    const scriptPath = resolve("runtime/cli/proposalExecution/packageVerify.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isProposalExecutionPackageVerifyDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isProposalExecutionPackageVerifyDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isProposalExecutionPackageVerifyDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/proposalExecution/handoffVerify.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./packageVerify.js") as ProposalExecutionPackageVerifyCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/proposalExecution/packageVerify.ts")).href;

    expect(() => module.isProposalExecutionPackageVerifyDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseProposalExecutionPackageVerifyCliArgs", () => {
  it("requires preview, runbook, bundle, approval, manifest, proposal, and summary paths", async () => {
    const module = await import("./packageVerify.js") as ProposalExecutionPackageVerifyCliModule;

    expect(() => module.parseProposalExecutionPackageVerifyCliArgs?.([])).toThrow("--preview is required");
    expect(() => module.parseProposalExecutionPackageVerifyCliArgs?.(["--preview", "preview.json"])).toThrow(
      "--runbook is required",
    );
  });

  it("parses split and equals-form package verification flags", async () => {
    const module = await import("./packageVerify.js") as ProposalExecutionPackageVerifyCliModule;

    expect(module.parseProposalExecutionPackageVerifyCliArgs?.([
      "--preview=artifacts/preview.json",
      "--runbook",
      "artifacts/runbook.md",
      "--bundle=artifacts/bundle.json",
      "--approval",
      "artifacts/approval.json",
      "--manifest=artifacts/manifest.json",
      "--proposal",
      "artifacts/proposal.json",
      "--summary",
      " artifacts/summary.md ",
    ])).toEqual({
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
    const module = await import("./packageVerify.js") as ProposalExecutionPackageVerifyCliModule;

    expect(() => module.parseProposalExecutionPackageVerifyCliArgs?.([
      "--preview",
      "a.json",
      "--preview",
      "b.json",
    ])).toThrow("Duplicate argument: --preview");
    expect(() => module.parseProposalExecutionPackageVerifyCliArgs?.(["--summary"])).toThrow(
      "--summary requires a value",
    );
    expect(() => module.parseProposalExecutionPackageVerifyCliArgs?.(["--preview", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runProposalExecutionPackageVerifyCli", () => {
  it("prints injected package verification reports", async () => {
    const module = await import("./packageVerify.js") as ProposalExecutionPackageVerifyCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runProposalExecutionPackageVerifyCli?.({
      argv: PACKAGE_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      verifyPackage: (params) => {
        calls.push(`verify:${typeof params}`);
        return { passed: true, failures: [] };
      },
    });

    expect(outputs).toEqual([JSON.stringify({
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

  it("sets exit code after failed package verification output", async () => {
    const module = await import("./packageVerify.js") as ProposalExecutionPackageVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runProposalExecutionPackageVerifyCli?.({
      argv: PACKAGE_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifyPackage: () => ({ passed: false, failures: ["package verification failed"] }),
    });

    expect(outputs).toHaveLength(1);
    expect(JSON.parse(outputs[0]!)).toMatchObject({
      preview: "artifacts/preview.json",
      passed: false,
      failures: ["package verification failed"],
    });
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed injected package verification reports before output or exit-code mutation", async () => {
    const module = await import("./packageVerify.js") as ProposalExecutionPackageVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await expect(module.runProposalExecutionPackageVerifyCli?.({
      argv: PACKAGE_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifyPackage: () => ({ passed: false, failures: "none" } as unknown as VerificationResult),
    })).rejects.toThrow("Proposal execution package verification report failures must be an array");
    expect(outputs).toEqual([]);
    expect(exitCodes).toEqual([]);
  });

  it("rejects malformed arguments before reads or package verification", async () => {
    const module = await import("./packageVerify.js") as ProposalExecutionPackageVerifyCliModule;
    const calls: string[] = [];

    await expect(module.runProposalExecutionPackageVerifyCli?.({
      argv: ["--unknown"],
      writeOutput: () => calls.push("output"),
      readText: async () => {
        calls.push("read");
        return "";
      },
      verifyPackage: () => ({ passed: true, failures: [] }),
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });
});
