import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type ProposalExecutionRunbookVerifyCliModule = typeof import("./runbookVerify.js") & {
  isProposalExecutionRunbookVerifyDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseProposalExecutionRunbookVerifyCliArgs?: (argv: readonly string[]) => RunbookVerifyCliArgs;
  runProposalExecutionRunbookVerifyCli?: (options?: RunbookVerifyRunnerOptions) => Promise<void>;
};

interface RunbookVerifyCliArgs {
  runbookPath: string;
  previewPath: string;
  bundlePath: string;
  approvalPath: string;
  manifestPath: string;
  proposalPath: string;
  summaryPath: string;
}

interface RunbookVerifyRunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyRunbook?: (params: unknown) => VerificationResult;
}

interface VerificationResult {
  passed: boolean;
  failures: readonly string[];
}

const RUNBOOK_VERIFY_ARGS = [
  "--runbook",
  "artifacts/runbook.md",
  "--preview",
  "artifacts/preview.json",
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

describe("isProposalExecutionRunbookVerifyDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./runbookVerify.js") as ProposalExecutionRunbookVerifyCliModule;
    const scriptPath = resolve("runtime/cli/proposalExecution/runbookVerify.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isProposalExecutionRunbookVerifyDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isProposalExecutionRunbookVerifyDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isProposalExecutionRunbookVerifyDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/proposalExecution/previewVerify.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./runbookVerify.js") as ProposalExecutionRunbookVerifyCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/proposalExecution/runbookVerify.ts")).href;

    expect(() => module.isProposalExecutionRunbookVerifyDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseProposalExecutionRunbookVerifyCliArgs", () => {
  it("requires runbook, preview, bundle, approval, manifest, proposal, and summary paths", async () => {
    const module = await import("./runbookVerify.js") as ProposalExecutionRunbookVerifyCliModule;

    expect(() => module.parseProposalExecutionRunbookVerifyCliArgs?.([])).toThrow("--runbook is required");
    expect(() => module.parseProposalExecutionRunbookVerifyCliArgs?.(["--runbook", "runbook.md"])).toThrow(
      "--preview is required",
    );
  });

  it("parses split and equals-form runbook verification flags", async () => {
    const module = await import("./runbookVerify.js") as ProposalExecutionRunbookVerifyCliModule;

    expect(module.parseProposalExecutionRunbookVerifyCliArgs?.([
      "--runbook=artifacts/runbook.md",
      "--preview",
      "artifacts/preview.json",
      "--bundle=artifacts/bundle.json",
      "--approval",
      "artifacts/approval.json",
      "--manifest=artifacts/manifest.json",
      "--proposal",
      "artifacts/proposal.json",
      "--summary",
      " artifacts/summary.md ",
    ])).toEqual({
      runbookPath: "artifacts/runbook.md",
      previewPath: "artifacts/preview.json",
      bundlePath: "artifacts/bundle.json",
      approvalPath: "artifacts/approval.json",
      manifestPath: "artifacts/manifest.json",
      proposalPath: "artifacts/proposal.json",
      summaryPath: "artifacts/summary.md",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./runbookVerify.js") as ProposalExecutionRunbookVerifyCliModule;

    expect(() => module.parseProposalExecutionRunbookVerifyCliArgs?.([
      "--runbook",
      "a.md",
      "--runbook",
      "b.md",
    ])).toThrow("Duplicate argument: --runbook");
    expect(() => module.parseProposalExecutionRunbookVerifyCliArgs?.(["--approval"])).toThrow(
      "--approval requires a value",
    );
    expect(() => module.parseProposalExecutionRunbookVerifyCliArgs?.(["--runbook", "a.md", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runProposalExecutionRunbookVerifyCli", () => {
  it("prints injected runbook verification reports", async () => {
    const module = await import("./runbookVerify.js") as ProposalExecutionRunbookVerifyCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runProposalExecutionRunbookVerifyCli?.({
      argv: RUNBOOK_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      verifyRunbook: (params) => {
        calls.push(`verify:${typeof params}`);
        return { passed: true, failures: [] };
      },
    });

    expect(outputs).toEqual([JSON.stringify({
      runbookPath: "artifacts/runbook.md",
      preview: "artifacts/preview.json",
      bundle: "artifacts/bundle.json",
      approval: "artifacts/approval.json",
      manifest: "artifacts/manifest.json",
      proposal: "artifacts/proposal.json",
      summary: "artifacts/summary.md",
      passed: true,
      failures: [],
    }, null, 2)]);
    expect(calls).toEqual([
      "read:artifacts/runbook.md",
      "read:artifacts/preview.json",
      "read:artifacts/bundle.json",
      "read:artifacts/approval.json",
      "read:artifacts/manifest.json",
      "read:artifacts/proposal.json",
      "read:artifacts/summary.md",
      "verify:object",
    ]);
  });

  it("sets exit code after failed runbook verification output", async () => {
    const module = await import("./runbookVerify.js") as ProposalExecutionRunbookVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runProposalExecutionRunbookVerifyCli?.({
      argv: RUNBOOK_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifyRunbook: () => ({ passed: false, failures: ["runbook missing dry-run evidence"] }),
    });

    expect(outputs).toHaveLength(1);
    expect(JSON.parse(outputs[0]!)).toMatchObject({
      runbookPath: "artifacts/runbook.md",
      passed: false,
      failures: ["runbook missing dry-run evidence"],
    });
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed injected runbook verification reports before output or exit-code mutation", async () => {
    const module = await import("./runbookVerify.js") as ProposalExecutionRunbookVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await expect(module.runProposalExecutionRunbookVerifyCli?.({
      argv: RUNBOOK_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifyRunbook: () => ({ passed: false, failures: "none" } as unknown as VerificationResult),
    })).rejects.toThrow("Proposal execution runbook verification report failures must be an array");
    expect(outputs).toEqual([]);
    expect(exitCodes).toEqual([]);
  });

  it("rejects malformed arguments before reads or runbook verification", async () => {
    const module = await import("./runbookVerify.js") as ProposalExecutionRunbookVerifyCliModule;
    const calls: string[] = [];

    await expect(module.runProposalExecutionRunbookVerifyCli?.({
      argv: ["--unknown"],
      writeOutput: () => calls.push("output"),
      readText: async () => {
        calls.push("read");
        return "";
      },
      verifyRunbook: () => {
        calls.push("verify");
        return { passed: true, failures: [] };
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });
});
