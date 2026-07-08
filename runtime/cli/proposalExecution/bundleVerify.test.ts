import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type ProposalExecutionBundleVerifyCliModule = typeof import("./bundleVerify.js") & {
  isProposalExecutionBundleVerifyDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseProposalExecutionBundleVerifyCliArgs?: (argv: readonly string[]) => BundleVerifyCliArgs;
  runProposalExecutionBundleVerifyCli?: (options?: BundleVerifyRunnerOptions) => Promise<void>;
};

interface BundleVerifyCliArgs {
  bundlePath: string;
  approvalPath: string;
  manifestPath: string;
  proposalPath: string;
  summaryPath: string;
}

interface BundleVerifyRunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyBundle?: (params: unknown) => VerificationResult;
}

interface VerificationResult {
  passed: boolean;
  failures: readonly string[];
  approvalVerification: unknown;
}

const BUNDLE_VERIFY_ARGS = [
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

describe("isProposalExecutionBundleVerifyDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./bundleVerify.js") as ProposalExecutionBundleVerifyCliModule;
    const scriptPath = resolve("runtime/cli/proposalExecution/bundleVerify.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isProposalExecutionBundleVerifyDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isProposalExecutionBundleVerifyDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isProposalExecutionBundleVerifyDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/proposalExecution/bundle.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./bundleVerify.js") as ProposalExecutionBundleVerifyCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/proposalExecution/bundleVerify.ts")).href;

    expect(() => module.isProposalExecutionBundleVerifyDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseProposalExecutionBundleVerifyCliArgs", () => {
  it("requires bundle, approval, manifest, proposal, and summary paths", async () => {
    const module = await import("./bundleVerify.js") as ProposalExecutionBundleVerifyCliModule;

    expect(() => module.parseProposalExecutionBundleVerifyCliArgs?.([])).toThrow("--bundle is required");
    expect(() => module.parseProposalExecutionBundleVerifyCliArgs?.(["--bundle", "bundle.json"])).toThrow(
      "--approval is required",
    );
  });

  it("parses split and equals-form bundle verification flags", async () => {
    const module = await import("./bundleVerify.js") as ProposalExecutionBundleVerifyCliModule;

    expect(module.parseProposalExecutionBundleVerifyCliArgs?.([
      "--bundle=artifacts/bundle.json",
      "--approval",
      "artifacts/approval.json",
      "--manifest=artifacts/manifest.json",
      "--proposal",
      "artifacts/proposal.json",
      "--summary",
      " artifacts/summary.md ",
    ])).toEqual({
      bundlePath: "artifacts/bundle.json",
      approvalPath: "artifacts/approval.json",
      manifestPath: "artifacts/manifest.json",
      proposalPath: "artifacts/proposal.json",
      summaryPath: "artifacts/summary.md",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./bundleVerify.js") as ProposalExecutionBundleVerifyCliModule;

    expect(() => module.parseProposalExecutionBundleVerifyCliArgs?.([
      "--bundle",
      "a.json",
      "--bundle",
      "b.json",
    ])).toThrow("Duplicate argument: --bundle");
    expect(() => module.parseProposalExecutionBundleVerifyCliArgs?.(["--summary"])).toThrow(
      "--summary requires a value",
    );
    expect(() => module.parseProposalExecutionBundleVerifyCliArgs?.(["--bundle", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runProposalExecutionBundleVerifyCli", () => {
  it("prints injected bundle verification reports", async () => {
    const module = await import("./bundleVerify.js") as ProposalExecutionBundleVerifyCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runProposalExecutionBundleVerifyCli?.({
      argv: BUNDLE_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      verifyBundle: (params) => {
        calls.push(`verify:${typeof params}`);
        return { passed: true, failures: [], approvalVerification: { passed: true } };
      },
    });

    expect(outputs).toEqual([JSON.stringify({
      bundle: "artifacts/bundle.json",
      approval: "artifacts/approval.json",
      manifest: "artifacts/manifest.json",
      proposal: "artifacts/proposal.json",
      summary: "artifacts/summary.md",
      passed: true,
      failures: [],
      approvalVerification: { passed: true },
    }, null, 2)]);
    expect(calls).toEqual([
      "read:artifacts/bundle.json",
      "read:artifacts/approval.json",
      "read:artifacts/manifest.json",
      "read:artifacts/proposal.json",
      "read:artifacts/summary.md",
      "verify:object",
    ]);
  });

  it("sets exit code after failed bundle verification output", async () => {
    const module = await import("./bundleVerify.js") as ProposalExecutionBundleVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runProposalExecutionBundleVerifyCli?.({
      argv: BUNDLE_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifyBundle: () => ({
        passed: false,
        failures: ["bundle transactions do not match current approved proposal"],
        approvalVerification: { passed: true },
      }),
    });

    expect(outputs).toHaveLength(1);
    expect(JSON.parse(outputs[0]!)).toMatchObject({
      bundle: "artifacts/bundle.json",
      passed: false,
      failures: ["bundle transactions do not match current approved proposal"],
    });
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed arguments before reads or bundle verification", async () => {
    const module = await import("./bundleVerify.js") as ProposalExecutionBundleVerifyCliModule;
    const calls: string[] = [];

    await expect(module.runProposalExecutionBundleVerifyCli?.({
      argv: ["--unknown"],
      writeOutput: () => calls.push("output"),
      readText: async () => {
        calls.push("read");
        return "";
      },
      verifyBundle: () => {
        calls.push("verify");
        return { passed: true, failures: [], approvalVerification: {} };
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected bundle verification reports before output or exit-code mutation", async () => {
    const module = await import("./bundleVerify.js") as ProposalExecutionBundleVerifyCliModule;
    const calls: string[] = [];

    await expect(module.runProposalExecutionBundleVerifyCli?.({
      argv: BUNDLE_VERIFY_ARGS,
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      readText: async () => "{}",
      verifyBundle: () => ({
        passed: false,
        failures: "none",
        approvalVerification: { passed: true },
      } as unknown as VerificationResult),
    })).rejects.toThrow("Proposal execution bundle verification report failures must be an array");
    expect(calls).toEqual([]);
  });
});
