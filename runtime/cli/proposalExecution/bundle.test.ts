import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type ProposalExecutionBundleCliModule = typeof import("./bundle.js") & {
  isProposalExecutionBundleDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseProposalExecutionBundleCliArgs?: (argv: readonly string[]) => BundleCliArgs;
  runProposalExecutionBundleCli?: (options?: BundleRunnerOptions) => Promise<void>;
};

interface BundleCliArgs {
  approvalPath: string;
  manifestPath: string;
  proposalPath: string;
  summaryPath: string;
  outputPath?: string | undefined;
  generatedAt?: string | undefined;
}

interface BundleRunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createBundle?: (params: unknown) => BundleResult;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface BundleResult {
  passed: boolean;
  failures: readonly string[];
  approvalVerification: unknown;
  bundle: BundleArtifact | null;
}

interface BundleArtifact {
  transactions: readonly unknown[];
}

const BUNDLE: BundleArtifact = {
  transactions: [{ stepId: "execute-1" }],
};

const BUNDLE_ARGS = [
  "--approval",
  "artifacts/approval.json",
  "--manifest",
  "artifacts/manifest.json",
  "--proposal",
  "artifacts/proposal.json",
  "--summary",
  "artifacts/summary.md",
] as const;

describe("isProposalExecutionBundleDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./bundle.js") as ProposalExecutionBundleCliModule;
    const scriptPath = resolve("runtime/cli/proposalExecution/bundle.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isProposalExecutionBundleDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isProposalExecutionBundleDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isProposalExecutionBundleDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/proposalExecution/bundleVerify.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./bundle.js") as ProposalExecutionBundleCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/proposalExecution/bundle.ts")).href;

    expect(() => module.isProposalExecutionBundleDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseProposalExecutionBundleCliArgs", () => {
  it("requires approval, manifest, proposal, and summary paths", async () => {
    const module = await import("./bundle.js") as ProposalExecutionBundleCliModule;

    expect(() => module.parseProposalExecutionBundleCliArgs?.([])).toThrow("--approval is required");
    expect(() => module.parseProposalExecutionBundleCliArgs?.(["--approval", "approval.json"])).toThrow(
      "--manifest is required",
    );
  });

  it("parses split and equals-form proposal execution bundle flags", async () => {
    const module = await import("./bundle.js") as ProposalExecutionBundleCliModule;

    expect(module.parseProposalExecutionBundleCliArgs?.([
      "--approval=artifacts/approval.json",
      "--manifest",
      "artifacts/manifest.json",
      "--proposal=artifacts/proposal.json",
      "--summary",
      " artifacts/summary.md ",
      "--output=artifacts/bundle.json",
      "--generated-at",
      " 2026-07-01T07:15:00.000Z ",
    ])).toEqual({
      approvalPath: "artifacts/approval.json",
      manifestPath: "artifacts/manifest.json",
      proposalPath: "artifacts/proposal.json",
      summaryPath: "artifacts/summary.md",
      outputPath: "artifacts/bundle.json",
      generatedAt: "2026-07-01T07:15:00.000Z",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./bundle.js") as ProposalExecutionBundleCliModule;

    expect(() => module.parseProposalExecutionBundleCliArgs?.([
      "--approval",
      "a.json",
      "--approval",
      "b.json",
    ])).toThrow("Duplicate argument: --approval");
    expect(() => module.parseProposalExecutionBundleCliArgs?.(["--summary"])).toThrow("--summary requires a value");
    expect(() => module.parseProposalExecutionBundleCliArgs?.(["--approval", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runProposalExecutionBundleCli", () => {
  it("prints injected bundles when no output path is provided", async () => {
    const module = await import("./bundle.js") as ProposalExecutionBundleCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runProposalExecutionBundleCli?.({
      argv: BUNDLE_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      createBundle: (params) => {
        calls.push(`bundle:${typeof params}`);
        return { passed: true, failures: [], approvalVerification: { passed: true }, bundle: BUNDLE };
      },
      writeText: async () => {
        throw new Error("writeText should not be called");
      },
    });

    expect(outputs).toEqual([JSON.stringify(BUNDLE, null, 2)]);
    expect(calls).toEqual([
      "read:artifacts/approval.json",
      "read:artifacts/manifest.json",
      "read:artifacts/proposal.json",
      "read:artifacts/summary.md",
      "bundle:object",
    ]);
  });

  it("writes injected bundles and emits write summaries", async () => {
    const module = await import("./bundle.js") as ProposalExecutionBundleCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runProposalExecutionBundleCli?.({
      argv: [...BUNDLE_ARGS, "--output", "artifacts/bundle.json"],
      writeOutput: (output) => outputs.push(output),
      readText: async () => "{}",
      createBundle: () => ({ passed: true, failures: [], approvalVerification: { passed: true }, bundle: BUNDLE }),
      mkdirp: async (dir) => {
        calls.push(`mkdir:${dir}`);
      },
      writeText: async (path, contents) => {
        calls.push(`write:${path}:${contents}`);
      },
    });

    expect(outputs).toEqual([JSON.stringify({
      output: "artifacts/bundle.json",
      transactions: 1,
      passed: true,
    }, null, 2)]);
    expect(calls).toEqual([`mkdir:artifacts`, `write:artifacts/bundle.json:${JSON.stringify(BUNDLE, null, 2)}\n`]);
  });

  it("reports failed bundles and sets exit code after output", async () => {
    const module = await import("./bundle.js") as ProposalExecutionBundleCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];
    const approvalVerification = { passed: false, failures: ["approval mismatch"] };

    await module.runProposalExecutionBundleCli?.({
      argv: BUNDLE_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      createBundle: () => ({
        passed: false,
        failures: ["execution bundles require an approved review decision"],
        approvalVerification,
        bundle: null,
      }),
    });

    expect(outputs).toEqual([JSON.stringify({
      approval: "artifacts/approval.json",
      manifest: "artifacts/manifest.json",
      proposal: "artifacts/proposal.json",
      summary: "artifacts/summary.md",
      passed: false,
      failures: ["execution bundles require an approved review decision"],
      approvalVerification,
    }, null, 2)]);
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed arguments before reads or bundle creation", async () => {
    const module = await import("./bundle.js") as ProposalExecutionBundleCliModule;
    const calls: string[] = [];

    await expect(module.runProposalExecutionBundleCli?.({
      argv: ["--unknown"],
      writeOutput: () => calls.push("output"),
      readText: async () => {
        calls.push("read");
        return "";
      },
      createBundle: () => {
        calls.push("bundle");
        return { passed: true, failures: [], approvalVerification: {}, bundle: BUNDLE };
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected bundle results before output or artifact writes", async () => {
    const module = await import("./bundle.js") as ProposalExecutionBundleCliModule;
    const calls: string[] = [];

    await expect(module.runProposalExecutionBundleCli?.({
      argv: [...BUNDLE_ARGS, "--output", "artifacts/bundle.json"],
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      readText: async () => "{}",
      createBundle: () => ({
        passed: true,
        failures: [],
        approvalVerification: { passed: true },
        bundle: { transactions: "one" },
      } as unknown as BundleResult),
      mkdirp: async () => {
        calls.push("mkdir");
      },
      writeText: async () => {
        calls.push("write");
      },
    })).rejects.toThrow("Proposal execution bundle transactions must be an array");
    expect(calls).toEqual([]);
  });
});
