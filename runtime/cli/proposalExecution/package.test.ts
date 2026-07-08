import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type ProposalExecutionPackageCliModule = typeof import("./package.js") & {
  isProposalExecutionPackageDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseProposalExecutionPackageCliArgs?: (argv: readonly string[]) => PackageCliArgs;
  runProposalExecutionPackageCli?: (options?: PackageRunnerOptions) => Promise<void>;
};

interface PackageCliArgs {
  bundlePath: string;
  approvalPath: string;
  manifestPath: string;
  proposalPath: string;
  summaryPath: string;
  previewOutputPath: string;
  runbookOutputPath: string;
  generatedAt?: string | undefined;
}

interface PackageRunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createPackage?: (params: unknown) => PackageResult;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface PackageResult {
  preview: { path: string; json: string };
  runbook: { path: string; markdown: string };
  passed: boolean;
  failures: readonly string[];
}

const PACKAGE_ARGS = [
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
  "--preview-output",
  "artifacts/preview.json",
  "--runbook-output",
  "artifacts/runbook.md",
] as const;

const PACKAGE_RESULT: PackageResult = {
  preview: { path: "artifacts/preview.json", json: "{\n  \"preview\": true\n}\n" },
  runbook: { path: "artifacts/runbook.md", markdown: "# Runbook\n" },
  passed: true,
  failures: [],
};

describe("isProposalExecutionPackageDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./package.js") as ProposalExecutionPackageCliModule;
    const scriptPath = resolve("runtime/cli/proposalExecution/package.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isProposalExecutionPackageDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isProposalExecutionPackageDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isProposalExecutionPackageDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/proposalExecution/handoff.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./package.js") as ProposalExecutionPackageCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/proposalExecution/package.ts")).href;

    expect(() => module.isProposalExecutionPackageDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseProposalExecutionPackageCliArgs", () => {
  it("requires bundle, approval, manifest, proposal, summary, preview-output, and runbook-output paths", async () => {
    const module = await import("./package.js") as ProposalExecutionPackageCliModule;

    expect(() => module.parseProposalExecutionPackageCliArgs?.([])).toThrow("--bundle is required");
    expect(() => module.parseProposalExecutionPackageCliArgs?.(["--bundle", "bundle.json"])).toThrow(
      "--approval is required",
    );
  });

  it("parses split and equals-form package flags", async () => {
    const module = await import("./package.js") as ProposalExecutionPackageCliModule;

    expect(module.parseProposalExecutionPackageCliArgs?.([
      "--bundle=artifacts/bundle.json",
      "--approval",
      "artifacts/approval.json",
      "--manifest=artifacts/manifest.json",
      "--proposal",
      "artifacts/proposal.json",
      "--summary",
      " artifacts/summary.md ",
      "--preview-output=artifacts/preview.json",
      "--runbook-output",
      "artifacts/runbook.md",
      "--generated-at",
      " 2026-07-01T07:45:00.000Z ",
    ])).toEqual({
      bundlePath: "artifacts/bundle.json",
      approvalPath: "artifacts/approval.json",
      manifestPath: "artifacts/manifest.json",
      proposalPath: "artifacts/proposal.json",
      summaryPath: "artifacts/summary.md",
      previewOutputPath: "artifacts/preview.json",
      runbookOutputPath: "artifacts/runbook.md",
      generatedAt: "2026-07-01T07:45:00.000Z",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./package.js") as ProposalExecutionPackageCliModule;

    expect(() => module.parseProposalExecutionPackageCliArgs?.([
      "--bundle",
      "a.json",
      "--bundle",
      "b.json",
    ])).toThrow("Duplicate argument: --bundle");
    expect(() => module.parseProposalExecutionPackageCliArgs?.(["--generated-at"])).toThrow(
      "--generated-at requires a value",
    );
    expect(() => module.parseProposalExecutionPackageCliArgs?.(["--bundle", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runProposalExecutionPackageCli", () => {
  it("writes injected package artifacts and emits package summaries", async () => {
    const module = await import("./package.js") as ProposalExecutionPackageCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runProposalExecutionPackageCli?.({
      argv: PACKAGE_ARGS,
      writeOutput: (output) => outputs.push(output),
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      createPackage: (params) => {
        calls.push(`package:${typeof params}`);
        return PACKAGE_RESULT;
      },
      mkdirp: async (dir) => {
        calls.push(`mkdir:${dir}`);
      },
      writeText: async (path, contents) => {
        calls.push(`write:${path}:${contents}`);
      },
    });

    expect(outputs).toEqual([JSON.stringify({
      preview: "artifacts/preview.json",
      runbook: "artifacts/runbook.md",
      passed: true,
      failures: [],
    }, null, 2)]);
    expect(calls).toEqual([
      "read:artifacts/bundle.json",
      "read:artifacts/approval.json",
      "read:artifacts/manifest.json",
      "read:artifacts/proposal.json",
      "read:artifacts/summary.md",
      "package:object",
      "mkdir:artifacts",
      "write:artifacts/preview.json:{\n  \"preview\": true\n}\n",
      "mkdir:artifacts",
      "write:artifacts/runbook.md:# Runbook\n",
    ]);
  });

  it("sets exit code after failed package output without writing artifacts", async () => {
    const module = await import("./package.js") as ProposalExecutionPackageCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];
    const calls: string[] = [];

    await module.runProposalExecutionPackageCli?.({
      argv: PACKAGE_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      createPackage: () => ({
        ...PACKAGE_RESULT,
        passed: false,
        failures: ["package failed"],
      }),
      writeText: async () => {
        calls.push("write");
      },
    });

    expect(outputs).toEqual([JSON.stringify({
      preview: "artifacts/preview.json",
      runbook: "artifacts/runbook.md",
      passed: false,
      failures: ["package failed"],
    }, null, 2)]);
    expect(exitCodes).toEqual([1]);
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected packages before output or writes", async () => {
    const module = await import("./package.js") as ProposalExecutionPackageCliModule;
    const outputs: string[] = [];
    const writes: string[] = [];

    await expect(module.runProposalExecutionPackageCli?.({
      argv: PACKAGE_ARGS,
      writeOutput: (output) => outputs.push(output),
      readText: async () => "{}",
      createPackage: () => ({
        ...PACKAGE_RESULT,
        preview: { path: "artifacts/preview.json", json: 42 },
      } as unknown as PackageResult),
      writeText: async (path) => {
        writes.push(path);
      },
    })).rejects.toThrow("Proposal execution package preview json must be a string");
    expect(outputs).toEqual([]);
    expect(writes).toEqual([]);
  });

  it("rejects malformed arguments before reads or package creation", async () => {
    const module = await import("./package.js") as ProposalExecutionPackageCliModule;
    const calls: string[] = [];

    await expect(module.runProposalExecutionPackageCli?.({
      argv: ["--unknown"],
      writeOutput: () => calls.push("output"),
      readText: async () => {
        calls.push("read");
        return "";
      },
      createPackage: () => PACKAGE_RESULT,
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });
});
