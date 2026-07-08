import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type ProposalExecutionPreviewVerifyCliModule = typeof import("./previewVerify.js") & {
  isProposalExecutionPreviewVerifyDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseProposalExecutionPreviewVerifyCliArgs?: (argv: readonly string[]) => PreviewVerifyCliArgs;
  runProposalExecutionPreviewVerifyCli?: (options?: PreviewVerifyRunnerOptions) => Promise<void>;
};

interface PreviewVerifyCliArgs {
  previewPath: string;
  bundlePath: string;
  approvalPath: string;
  manifestPath: string;
  proposalPath: string;
  summaryPath: string;
}

interface PreviewVerifyRunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyPreview?: (params: unknown) => VerificationResult;
}

interface VerificationResult {
  passed: boolean;
  failures: readonly string[];
}

const PREVIEW_VERIFY_ARGS = [
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

describe("isProposalExecutionPreviewVerifyDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./previewVerify.js") as ProposalExecutionPreviewVerifyCliModule;
    const scriptPath = resolve("runtime/cli/proposalExecution/previewVerify.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isProposalExecutionPreviewVerifyDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isProposalExecutionPreviewVerifyDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isProposalExecutionPreviewVerifyDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/proposalExecution/runbookVerify.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./previewVerify.js") as ProposalExecutionPreviewVerifyCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/proposalExecution/previewVerify.ts")).href;

    expect(() => module.isProposalExecutionPreviewVerifyDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseProposalExecutionPreviewVerifyCliArgs", () => {
  it("requires preview, bundle, approval, manifest, proposal, and summary paths", async () => {
    const module = await import("./previewVerify.js") as ProposalExecutionPreviewVerifyCliModule;

    expect(() => module.parseProposalExecutionPreviewVerifyCliArgs?.([])).toThrow("--preview is required");
    expect(() => module.parseProposalExecutionPreviewVerifyCliArgs?.(["--preview", "preview.json"])).toThrow(
      "--bundle is required",
    );
  });

  it("parses split and equals-form preview verification flags", async () => {
    const module = await import("./previewVerify.js") as ProposalExecutionPreviewVerifyCliModule;

    expect(module.parseProposalExecutionPreviewVerifyCliArgs?.([
      "--preview=artifacts/preview.json",
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
      bundlePath: "artifacts/bundle.json",
      approvalPath: "artifacts/approval.json",
      manifestPath: "artifacts/manifest.json",
      proposalPath: "artifacts/proposal.json",
      summaryPath: "artifacts/summary.md",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./previewVerify.js") as ProposalExecutionPreviewVerifyCliModule;

    expect(() => module.parseProposalExecutionPreviewVerifyCliArgs?.([
      "--preview",
      "a.json",
      "--preview",
      "b.json",
    ])).toThrow("Duplicate argument: --preview");
    expect(() => module.parseProposalExecutionPreviewVerifyCliArgs?.(["--summary"])).toThrow(
      "--summary requires a value",
    );
    expect(() => module.parseProposalExecutionPreviewVerifyCliArgs?.(["--preview", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runProposalExecutionPreviewVerifyCli", () => {
  it("prints injected preview verification reports", async () => {
    const module = await import("./previewVerify.js") as ProposalExecutionPreviewVerifyCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runProposalExecutionPreviewVerifyCli?.({
      argv: PREVIEW_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      verifyPreview: (params) => {
        calls.push(`verify:${typeof params}`);
        return { passed: true, failures: [] };
      },
    });

    expect(outputs).toEqual([JSON.stringify({
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
      "read:artifacts/preview.json",
      "read:artifacts/bundle.json",
      "read:artifacts/approval.json",
      "read:artifacts/manifest.json",
      "read:artifacts/proposal.json",
      "read:artifacts/summary.md",
      "verify:object",
    ]);
  });

  it("sets exit code after failed preview verification output", async () => {
    const module = await import("./previewVerify.js") as ProposalExecutionPreviewVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runProposalExecutionPreviewVerifyCli?.({
      argv: PREVIEW_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifyPreview: () => ({ passed: false, failures: ["preview transaction mismatch"] }),
    });

    expect(outputs).toHaveLength(1);
    expect(JSON.parse(outputs[0]!)).toMatchObject({
      preview: "artifacts/preview.json",
      passed: false,
      failures: ["preview transaction mismatch"],
    });
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed injected preview verification reports before output or exit-code mutation", async () => {
    const module = await import("./previewVerify.js") as ProposalExecutionPreviewVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await expect(module.runProposalExecutionPreviewVerifyCli?.({
      argv: PREVIEW_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifyPreview: () => ({ passed: false, failures: "none" } as unknown as VerificationResult),
    })).rejects.toThrow("Proposal execution preview verification report failures must be an array");
    expect(outputs).toEqual([]);
    expect(exitCodes).toEqual([]);
  });

  it("rejects malformed arguments before reads or preview verification", async () => {
    const module = await import("./previewVerify.js") as ProposalExecutionPreviewVerifyCliModule;
    const calls: string[] = [];

    await expect(module.runProposalExecutionPreviewVerifyCli?.({
      argv: ["--unknown"],
      writeOutput: () => calls.push("output"),
      readText: async () => {
        calls.push("read");
        return "";
      },
      verifyPreview: () => {
        calls.push("verify");
        return { passed: true, failures: [] };
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });
});
