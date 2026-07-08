import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type ProposalExecutionRunbookCliModule = typeof import("./runbook.js") & {
  isProposalExecutionRunbookDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseProposalExecutionRunbookCliArgs?: (argv: readonly string[]) => RunbookCliArgs;
  runProposalExecutionRunbookCli?: (options?: RunbookRunnerOptions) => Promise<void>;
};

interface RunbookCliArgs {
  previewPath: string;
  bundlePath: string;
  approvalPath: string;
  manifestPath: string;
  proposalPath: string;
  summaryPath: string;
  outputPath?: string | undefined;
}

interface RunbookRunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createRunbook?: (params: unknown) => RunbookResult;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface RunbookResult {
  passed: boolean;
  failures: readonly string[];
  markdown: string;
  transactions: number;
}

const RUNBOOK: RunbookResult = {
  passed: true,
  failures: [],
  markdown: "# Execution Runbook\n\n",
  transactions: 1,
};

const RUNBOOK_ARGS = [
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

describe("isProposalExecutionRunbookDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./runbook.js") as ProposalExecutionRunbookCliModule;
    const scriptPath = resolve("runtime/cli/proposalExecution/runbook.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isProposalExecutionRunbookDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isProposalExecutionRunbookDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isProposalExecutionRunbookDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/proposalExecution/preview.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./runbook.js") as ProposalExecutionRunbookCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/proposalExecution/runbook.ts")).href;

    expect(() => module.isProposalExecutionRunbookDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseProposalExecutionRunbookCliArgs", () => {
  it("requires preview, bundle, approval, manifest, proposal, and summary paths", async () => {
    const module = await import("./runbook.js") as ProposalExecutionRunbookCliModule;

    expect(() => module.parseProposalExecutionRunbookCliArgs?.([])).toThrow("--preview is required");
    expect(() => module.parseProposalExecutionRunbookCliArgs?.(["--preview", "preview.json"])).toThrow(
      "--bundle is required",
    );
  });

  it("parses split and equals-form proposal execution runbook flags", async () => {
    const module = await import("./runbook.js") as ProposalExecutionRunbookCliModule;

    expect(module.parseProposalExecutionRunbookCliArgs?.([
      "--preview=artifacts/preview.json",
      "--bundle",
      "artifacts/bundle.json",
      "--approval=artifacts/approval.json",
      "--manifest",
      "artifacts/manifest.json",
      "--proposal=artifacts/proposal.json",
      "--summary",
      " artifacts/summary.md ",
      "--output=artifacts/runbook.md",
    ])).toEqual({
      previewPath: "artifacts/preview.json",
      bundlePath: "artifacts/bundle.json",
      approvalPath: "artifacts/approval.json",
      manifestPath: "artifacts/manifest.json",
      proposalPath: "artifacts/proposal.json",
      summaryPath: "artifacts/summary.md",
      outputPath: "artifacts/runbook.md",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./runbook.js") as ProposalExecutionRunbookCliModule;

    expect(() => module.parseProposalExecutionRunbookCliArgs?.([
      "--preview",
      "a.json",
      "--preview",
      "b.json",
    ])).toThrow("Duplicate argument: --preview");
    expect(() => module.parseProposalExecutionRunbookCliArgs?.(["--approval"])).toThrow("--approval requires a value");
    expect(() => module.parseProposalExecutionRunbookCliArgs?.(["--preview", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runProposalExecutionRunbookCli", () => {
  it("prints injected runbook markdown when no output path is provided", async () => {
    const module = await import("./runbook.js") as ProposalExecutionRunbookCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runProposalExecutionRunbookCli?.({
      argv: RUNBOOK_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      createRunbook: (params) => {
        calls.push(`runbook:${typeof params}`);
        return RUNBOOK;
      },
    });

    expect(outputs).toEqual(["# Execution Runbook"]);
    expect(calls).toEqual([
      "read:artifacts/preview.json",
      "read:artifacts/bundle.json",
      "read:artifacts/approval.json",
      "read:artifacts/manifest.json",
      "read:artifacts/proposal.json",
      "read:artifacts/summary.md",
      "runbook:object",
    ]);
  });

  it("writes injected runbooks and emits write summaries", async () => {
    const module = await import("./runbook.js") as ProposalExecutionRunbookCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runProposalExecutionRunbookCli?.({
      argv: [...RUNBOOK_ARGS, "--output", "artifacts/runbook.md"],
      writeOutput: (output) => outputs.push(output),
      readText: async () => "{}",
      createRunbook: () => RUNBOOK,
      mkdirp: async (dir) => {
        calls.push(`mkdir:${dir}`);
      },
      writeText: async (path, contents) => {
        calls.push(`write:${path}:${contents}`);
      },
    });

    expect(outputs).toEqual([JSON.stringify({
      preview: "artifacts/preview.json",
      output: "artifacts/runbook.md",
      transactions: 1,
      written: true,
    }, null, 2)]);
    expect(calls).toEqual(["mkdir:artifacts", "write:artifacts/runbook.md:# Execution Runbook\n\n"]);
  });

  it("reports failed runbooks and sets exit code after output", async () => {
    const module = await import("./runbook.js") as ProposalExecutionRunbookCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runProposalExecutionRunbookCli?.({
      argv: RUNBOOK_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      createRunbook: () => ({ ...RUNBOOK, passed: false, failures: ["preview verification failed"], markdown: "" }),
    });

    expect(outputs).toEqual([JSON.stringify({
      preview: "artifacts/preview.json",
      passed: false,
      failures: ["preview verification failed"],
    }, null, 2)]);
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed injected runbooks before output or writes", async () => {
    const module = await import("./runbook.js") as ProposalExecutionRunbookCliModule;
    const outputs: string[] = [];
    const writes: string[] = [];

    await expect(module.runProposalExecutionRunbookCli?.({
      argv: [...RUNBOOK_ARGS, "--output", "artifacts/runbook.md"],
      writeOutput: (output) => outputs.push(output),
      readText: async () => "{}",
      createRunbook: () => ({ ...RUNBOOK, markdown: 7 } as unknown as RunbookResult),
      writeText: async (path) => {
        writes.push(path);
      },
    })).rejects.toThrow("Proposal execution runbook markdown must be a string");
    expect(outputs).toEqual([]);
    expect(writes).toEqual([]);
  });

  it("rejects malformed arguments before reads or runbook creation", async () => {
    const module = await import("./runbook.js") as ProposalExecutionRunbookCliModule;
    const calls: string[] = [];

    await expect(module.runProposalExecutionRunbookCli?.({
      argv: ["--unknown"],
      writeOutput: () => calls.push("output"),
      readText: async () => {
        calls.push("read");
        return "";
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });
});
