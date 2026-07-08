import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type ProposalExecutionManifestCliModule = typeof import("./manifest.js") & {
  isProposalExecutionManifestDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseProposalExecutionManifestCliArgs?: (argv: readonly string[]) => ManifestCliArgs;
  runProposalExecutionManifestCli?: (options?: ManifestRunnerOptions) => Promise<void>;
};

interface ManifestCliArgs {
  previewPath: string;
  runbookPath: string;
  bundlePath: string;
  approvalPath: string;
  manifestPath: string;
  proposalPath: string;
  summaryPath: string;
  outputPath?: string | undefined;
  generatedAt?: string | undefined;
}

interface ManifestRunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createManifest?: (params: unknown) => ExecutionManifest;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface ExecutionManifest {
  generatedAt: string;
  preview: { path: string };
  runbook: { path: string };
  bundle: { path: string };
  preflight: { passed: boolean };
}

const EXECUTION_MANIFEST: ExecutionManifest = {
  generatedAt: "2026-07-01T06:45:00.000Z",
  preview: { path: "artifacts/preview.json" },
  runbook: { path: "artifacts/runbook.md" },
  bundle: { path: "artifacts/bundle.json" },
  preflight: { passed: true },
};

const MANIFEST_ARGS = [
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

describe("isProposalExecutionManifestDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./manifest.js") as ProposalExecutionManifestCliModule;
    const scriptPath = resolve("runtime/cli/proposalExecution/manifest.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isProposalExecutionManifestDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isProposalExecutionManifestDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isProposalExecutionManifestDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/proposalExecution/preview.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./manifest.js") as ProposalExecutionManifestCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/proposalExecution/manifest.ts")).href;

    expect(() => module.isProposalExecutionManifestDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseProposalExecutionManifestCliArgs", () => {
  it("requires preview, runbook, bundle, approval, manifest, proposal, and summary paths", async () => {
    const module = await import("./manifest.js") as ProposalExecutionManifestCliModule;

    expect(() => module.parseProposalExecutionManifestCliArgs?.([])).toThrow("--preview is required");
    expect(() => module.parseProposalExecutionManifestCliArgs?.(["--preview", "preview.json"])).toThrow(
      "--runbook is required",
    );
  });

  it("parses split and equals-form proposal execution manifest flags", async () => {
    const module = await import("./manifest.js") as ProposalExecutionManifestCliModule;

    expect(module.parseProposalExecutionManifestCliArgs?.([
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
      "--output=artifacts/execution-manifest.json",
      "--generated-at",
      " 2026-07-01T06:45:00.000Z ",
    ])).toEqual({
      previewPath: "artifacts/preview.json",
      runbookPath: "artifacts/runbook.md",
      bundlePath: "artifacts/bundle.json",
      approvalPath: "artifacts/approval.json",
      manifestPath: "artifacts/manifest.json",
      proposalPath: "artifacts/proposal.json",
      summaryPath: "artifacts/summary.md",
      outputPath: "artifacts/execution-manifest.json",
      generatedAt: "2026-07-01T06:45:00.000Z",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./manifest.js") as ProposalExecutionManifestCliModule;

    expect(() => module.parseProposalExecutionManifestCliArgs?.([
      "--preview",
      "a.json",
      "--preview",
      "b.json",
    ])).toThrow("Duplicate argument: --preview");
    expect(() => module.parseProposalExecutionManifestCliArgs?.(["--generated-at"])).toThrow(
      "--generated-at requires a value",
    );
    expect(() => module.parseProposalExecutionManifestCliArgs?.(["--preview", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runProposalExecutionManifestCli", () => {
  it("prints injected execution manifests when no output path is provided", async () => {
    const module = await import("./manifest.js") as ProposalExecutionManifestCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runProposalExecutionManifestCli?.({
      argv: MANIFEST_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      createManifest: (params) => {
        calls.push(`manifest:${typeof params}`);
        return EXECUTION_MANIFEST;
      },
    });

    expect(outputs).toEqual([JSON.stringify(EXECUTION_MANIFEST, null, 2)]);
    expect(calls).toEqual([
      "read:artifacts/preview.json",
      "read:artifacts/runbook.md",
      "read:artifacts/bundle.json",
      "read:artifacts/approval.json",
      "read:artifacts/manifest.json",
      "read:artifacts/proposal.json",
      "read:artifacts/summary.md",
      "manifest:object",
    ]);
  });

  it("writes injected execution manifests and emits write summaries", async () => {
    const module = await import("./manifest.js") as ProposalExecutionManifestCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runProposalExecutionManifestCli?.({
      argv: [...MANIFEST_ARGS, "--output", "artifacts/execution-manifest.json"],
      writeOutput: (output) => outputs.push(output),
      readText: async () => "{}",
      createManifest: () => EXECUTION_MANIFEST,
      mkdirp: async (dir) => {
        calls.push(`mkdir:${dir}`);
      },
      writeText: async (path, contents) => {
        calls.push(`write:${path}:${contents}`);
      },
    });

    expect(outputs).toEqual([JSON.stringify({
      output: "artifacts/execution-manifest.json",
      preview: "artifacts/preview.json",
      runbook: "artifacts/runbook.md",
      bundle: "artifacts/bundle.json",
      passed: true,
      generatedAt: "2026-07-01T06:45:00.000Z",
    }, null, 2)]);
    expect(calls).toEqual([
      "mkdir:artifacts",
      `write:artifacts/execution-manifest.json:${JSON.stringify(EXECUTION_MANIFEST, null, 2)}\n`,
    ]);
  });

  it("sets exit code after failed execution manifest output", async () => {
    const module = await import("./manifest.js") as ProposalExecutionManifestCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];
    const failedManifest = { ...EXECUTION_MANIFEST, preflight: { passed: false } };

    await module.runProposalExecutionManifestCli?.({
      argv: MANIFEST_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      createManifest: () => failedManifest,
    });

    expect(outputs).toEqual([JSON.stringify(failedManifest, null, 2)]);
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed injected execution manifests before output or writes", async () => {
    const module = await import("./manifest.js") as ProposalExecutionManifestCliModule;
    const outputs: string[] = [];
    const writes: string[] = [];

    await expect(module.runProposalExecutionManifestCli?.({
      argv: [...MANIFEST_ARGS, "--output", "artifacts/execution-manifest.json"],
      writeOutput: (output) => outputs.push(output),
      readText: async () => "{}",
      createManifest: () => ({
        ...EXECUTION_MANIFEST,
        preflight: { passed: "yes" },
      } as unknown as ExecutionManifest),
      writeText: async (path) => {
        writes.push(path);
      },
    })).rejects.toThrow("Proposal execution manifest preflight passed must be a boolean");
    expect(outputs).toEqual([]);
    expect(writes).toEqual([]);
  });

  it("rejects malformed arguments before reads or manifest creation", async () => {
    const module = await import("./manifest.js") as ProposalExecutionManifestCliModule;
    const calls: string[] = [];

    await expect(module.runProposalExecutionManifestCli?.({
      argv: ["--unknown"],
      writeOutput: () => calls.push("output"),
      readText: async () => {
        calls.push("read");
        return "";
      },
      createManifest: () => EXECUTION_MANIFEST,
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });
});
