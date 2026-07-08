import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type ProposalExecutionHandoffVerifyCliModule = typeof import("./handoffVerify.js") & {
  isProposalExecutionHandoffVerifyDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseProposalExecutionHandoffVerifyCliArgs?: (argv: readonly string[]) => HandoffVerifyCliArgs;
  runProposalExecutionHandoffVerifyCli?: (options?: HandoffVerifyRunnerOptions) => Promise<void>;
};

interface HandoffVerifyCliArgs {
  previewPath: string;
  runbookPath: string;
  executionManifestPath: string;
  bundlePath: string;
  approvalPath: string;
  manifestPath: string;
  proposalPath: string;
  summaryPath: string;
}

interface HandoffVerifyRunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyHandoff?: (params: unknown) => VerificationResult;
}

interface VerificationResult {
  passed: boolean;
  failures: readonly string[];
}

const HANDOFF_VERIFY_ARGS = [
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

describe("isProposalExecutionHandoffVerifyDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./handoffVerify.js") as ProposalExecutionHandoffVerifyCliModule;
    const scriptPath = resolve("runtime/cli/proposalExecution/handoffVerify.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isProposalExecutionHandoffVerifyDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isProposalExecutionHandoffVerifyDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isProposalExecutionHandoffVerifyDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/proposalExecution/packageVerify.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./handoffVerify.js") as ProposalExecutionHandoffVerifyCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/proposalExecution/handoffVerify.ts")).href;

    expect(() => module.isProposalExecutionHandoffVerifyDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseProposalExecutionHandoffVerifyCliArgs", () => {
  it("requires preview, runbook, execution-manifest, bundle, approval, manifest, proposal, and summary paths", async () => {
    const module = await import("./handoffVerify.js") as ProposalExecutionHandoffVerifyCliModule;

    expect(() => module.parseProposalExecutionHandoffVerifyCliArgs?.([])).toThrow("--preview is required");
    expect(() => module.parseProposalExecutionHandoffVerifyCliArgs?.(["--preview", "preview.json"])).toThrow(
      "--runbook is required",
    );
  });

  it("parses split and equals-form handoff verification flags", async () => {
    const module = await import("./handoffVerify.js") as ProposalExecutionHandoffVerifyCliModule;

    expect(module.parseProposalExecutionHandoffVerifyCliArgs?.([
      "--preview=artifacts/preview.json",
      "--runbook",
      "artifacts/runbook.md",
      "--execution-manifest=artifacts/execution-manifest.json",
      "--bundle",
      "artifacts/bundle.json",
      "--approval=artifacts/approval.json",
      "--manifest",
      "artifacts/manifest.json",
      "--proposal=artifacts/proposal.json",
      "--summary",
      " artifacts/summary.md ",
    ])).toEqual({
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
    const module = await import("./handoffVerify.js") as ProposalExecutionHandoffVerifyCliModule;

    expect(() => module.parseProposalExecutionHandoffVerifyCliArgs?.([
      "--preview",
      "a.json",
      "--preview",
      "b.json",
    ])).toThrow("Duplicate argument: --preview");
    expect(() => module.parseProposalExecutionHandoffVerifyCliArgs?.(["--summary"])).toThrow(
      "--summary requires a value",
    );
    expect(() => module.parseProposalExecutionHandoffVerifyCliArgs?.(["--preview", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runProposalExecutionHandoffVerifyCli", () => {
  it("prints injected handoff verification reports", async () => {
    const module = await import("./handoffVerify.js") as ProposalExecutionHandoffVerifyCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runProposalExecutionHandoffVerifyCli?.({
      argv: HANDOFF_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      verifyHandoff: (params) => {
        calls.push(`verify:${typeof params}`);
        return { passed: true, failures: [] };
      },
    });

    expect(outputs).toEqual([JSON.stringify({
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
    expect(calls).toEqual([
      "read:artifacts/preview.json",
      "read:artifacts/runbook.md",
      "read:artifacts/execution-manifest.json",
      "read:artifacts/bundle.json",
      "read:artifacts/approval.json",
      "read:artifacts/manifest.json",
      "read:artifacts/proposal.json",
      "read:artifacts/summary.md",
      "verify:object",
    ]);
  });

  it("sets exit code after failed handoff verification output", async () => {
    const module = await import("./handoffVerify.js") as ProposalExecutionHandoffVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runProposalExecutionHandoffVerifyCli?.({
      argv: HANDOFF_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifyHandoff: () => ({ passed: false, failures: ["handoff verification failed"] }),
    });

    expect(outputs).toHaveLength(1);
    expect(JSON.parse(outputs[0]!)).toMatchObject({
      preview: "artifacts/preview.json",
      executionManifest: "artifacts/execution-manifest.json",
      passed: false,
      failures: ["handoff verification failed"],
    });
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed injected handoff verification reports before output or exit-code mutation", async () => {
    const module = await import("./handoffVerify.js") as ProposalExecutionHandoffVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await expect(module.runProposalExecutionHandoffVerifyCli?.({
      argv: HANDOFF_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifyHandoff: () => ({ passed: false, failures: "none" } as unknown as VerificationResult),
    })).rejects.toThrow("Proposal execution handoff verification report failures must be an array");
    expect(outputs).toEqual([]);
    expect(exitCodes).toEqual([]);
  });

  it("rejects malformed arguments before reads or handoff verification", async () => {
    const module = await import("./handoffVerify.js") as ProposalExecutionHandoffVerifyCliModule;
    const calls: string[] = [];

    await expect(module.runProposalExecutionHandoffVerifyCli?.({
      argv: ["--unknown"],
      writeOutput: () => calls.push("output"),
      readText: async () => {
        calls.push("read");
        return "";
      },
      verifyHandoff: () => ({ passed: true, failures: [] }),
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });
});
