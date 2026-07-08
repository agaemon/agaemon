import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type ProposalExecutionHandoffCliModule = typeof import("./handoff.js") & {
  isProposalExecutionHandoffDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseProposalExecutionHandoffCliArgs?: (argv: readonly string[]) => HandoffCliArgs;
  runProposalExecutionHandoffCli?: (options?: HandoffRunnerOptions) => Promise<void>;
};

interface HandoffCliArgs {
  bundlePath: string;
  approvalPath: string;
  manifestPath: string;
  proposalPath: string;
  summaryPath: string;
  previewOutputPath: string;
  runbookOutputPath: string;
  executionManifestOutputPath: string;
  generatedAt?: string | undefined;
}

interface HandoffRunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createHandoff?: (params: unknown) => HandoffResult;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface HandoffResult {
  preview: { path: string; json: string };
  runbook: { path: string; markdown: string };
  executionManifest: { path: string; json: string };
  passed: boolean;
  failures: readonly string[];
}

const HANDOFF_ARGS = [
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
  "--execution-manifest-output",
  "artifacts/execution-manifest.json",
] as const;

const HANDOFF_RESULT: HandoffResult = {
  preview: { path: "artifacts/preview.json", json: "{\n  \"preview\": true\n}\n" },
  runbook: { path: "artifacts/runbook.md", markdown: "# Runbook\n" },
  executionManifest: { path: "artifacts/execution-manifest.json", json: "{\n  \"manifest\": true\n}\n" },
  passed: true,
  failures: [],
};

describe("isProposalExecutionHandoffDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./handoff.js") as ProposalExecutionHandoffCliModule;
    const scriptPath = resolve("runtime/cli/proposalExecution/handoff.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isProposalExecutionHandoffDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isProposalExecutionHandoffDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isProposalExecutionHandoffDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/proposalExecution/package.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./handoff.js") as ProposalExecutionHandoffCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/proposalExecution/handoff.ts")).href;

    expect(() => module.isProposalExecutionHandoffDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseProposalExecutionHandoffCliArgs", () => {
  it("requires bundle, approval, manifest, proposal, summary, preview-output, runbook-output, and execution-manifest-output paths", async () => {
    const module = await import("./handoff.js") as ProposalExecutionHandoffCliModule;

    expect(() => module.parseProposalExecutionHandoffCliArgs?.([])).toThrow("--bundle is required");
    expect(() => module.parseProposalExecutionHandoffCliArgs?.(["--bundle", "bundle.json"])).toThrow(
      "--approval is required",
    );
  });

  it("parses split and equals-form handoff flags", async () => {
    const module = await import("./handoff.js") as ProposalExecutionHandoffCliModule;

    expect(module.parseProposalExecutionHandoffCliArgs?.([
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
      "--execution-manifest-output=artifacts/execution-manifest.json",
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
      executionManifestOutputPath: "artifacts/execution-manifest.json",
      generatedAt: "2026-07-01T07:45:00.000Z",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./handoff.js") as ProposalExecutionHandoffCliModule;

    expect(() => module.parseProposalExecutionHandoffCliArgs?.([
      "--bundle",
      "a.json",
      "--bundle",
      "b.json",
    ])).toThrow("Duplicate argument: --bundle");
    expect(() => module.parseProposalExecutionHandoffCliArgs?.(["--generated-at"])).toThrow(
      "--generated-at requires a value",
    );
    expect(() => module.parseProposalExecutionHandoffCliArgs?.(["--bundle", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runProposalExecutionHandoffCli", () => {
  it("writes injected handoff artifacts and emits handoff summaries", async () => {
    const module = await import("./handoff.js") as ProposalExecutionHandoffCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runProposalExecutionHandoffCli?.({
      argv: HANDOFF_ARGS,
      writeOutput: (output) => outputs.push(output),
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      createHandoff: (params) => {
        calls.push(`handoff:${typeof params}`);
        return HANDOFF_RESULT;
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
      executionManifest: "artifacts/execution-manifest.json",
      passed: true,
      failures: [],
    }, null, 2)]);
    expect(calls).toEqual([
      "read:artifacts/bundle.json",
      "read:artifacts/approval.json",
      "read:artifacts/manifest.json",
      "read:artifacts/proposal.json",
      "read:artifacts/summary.md",
      "handoff:object",
      "mkdir:artifacts",
      "write:artifacts/preview.json:{\n  \"preview\": true\n}\n",
      "mkdir:artifacts",
      "write:artifacts/runbook.md:# Runbook\n",
      "mkdir:artifacts",
      "write:artifacts/execution-manifest.json:{\n  \"manifest\": true\n}\n",
    ]);
  });

  it("sets exit code after failed handoff output without writing artifacts", async () => {
    const module = await import("./handoff.js") as ProposalExecutionHandoffCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];
    const calls: string[] = [];

    await module.runProposalExecutionHandoffCli?.({
      argv: HANDOFF_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      createHandoff: () => ({
        ...HANDOFF_RESULT,
        passed: false,
        failures: ["handoff failed"],
      }),
      writeText: async () => {
        calls.push("write");
      },
    });

    expect(outputs).toEqual([JSON.stringify({
      preview: "artifacts/preview.json",
      runbook: "artifacts/runbook.md",
      executionManifest: "artifacts/execution-manifest.json",
      passed: false,
      failures: ["handoff failed"],
    }, null, 2)]);
    expect(exitCodes).toEqual([1]);
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected handoffs before output or writes", async () => {
    const module = await import("./handoff.js") as ProposalExecutionHandoffCliModule;
    const outputs: string[] = [];
    const writes: string[] = [];

    await expect(module.runProposalExecutionHandoffCli?.({
      argv: HANDOFF_ARGS,
      writeOutput: (output) => outputs.push(output),
      readText: async () => "{}",
      createHandoff: () => ({
        ...HANDOFF_RESULT,
        executionManifest: { path: "artifacts/execution-manifest.json", json: 42 },
      } as unknown as HandoffResult),
      writeText: async (path) => {
        writes.push(path);
      },
    })).rejects.toThrow("Proposal execution handoff executionManifest json must be a string");
    expect(outputs).toEqual([]);
    expect(writes).toEqual([]);
  });

  it("rejects malformed arguments before reads or handoff creation", async () => {
    const module = await import("./handoff.js") as ProposalExecutionHandoffCliModule;
    const calls: string[] = [];

    await expect(module.runProposalExecutionHandoffCli?.({
      argv: ["--unknown"],
      writeOutput: () => calls.push("output"),
      readText: async () => {
        calls.push("read");
        return "";
      },
      createHandoff: () => HANDOFF_RESULT,
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });
});
