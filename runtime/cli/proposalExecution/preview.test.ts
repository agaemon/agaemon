import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type ProposalExecutionPreviewCliModule = typeof import("./preview.js") & {
  isProposalExecutionPreviewDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseProposalExecutionPreviewCliArgs?: (argv: readonly string[]) => PreviewCliArgs;
  runProposalExecutionPreviewCli?: (options?: PreviewRunnerOptions) => Promise<void>;
};

interface PreviewCliArgs {
  bundlePath: string;
  approvalPath: string;
  manifestPath: string;
  proposalPath: string;
  summaryPath: string;
  outputPath?: string | undefined;
}

interface PreviewRunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createPreview?: (params: unknown) => PreviewResult;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface PreviewResult {
  passed: boolean;
  preview: PreviewArtifact | null;
  failures: readonly string[];
}

interface PreviewArtifact {
  transactions: readonly unknown[];
}

const PREVIEW: PreviewArtifact = {
  transactions: [{ to: "0x1111111111111111111111111111111111111111" }],
};

const PREVIEW_ARGS = [
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

describe("isProposalExecutionPreviewDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./preview.js") as ProposalExecutionPreviewCliModule;
    const scriptPath = resolve("runtime/cli/proposalExecution/preview.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isProposalExecutionPreviewDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isProposalExecutionPreviewDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isProposalExecutionPreviewDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/proposalExecution/runbook.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./preview.js") as ProposalExecutionPreviewCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/proposalExecution/preview.ts")).href;

    expect(() => module.isProposalExecutionPreviewDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseProposalExecutionPreviewCliArgs", () => {
  it("requires bundle, approval, manifest, proposal, and summary paths", async () => {
    const module = await import("./preview.js") as ProposalExecutionPreviewCliModule;

    expect(() => module.parseProposalExecutionPreviewCliArgs?.([])).toThrow("--bundle is required");
    expect(() => module.parseProposalExecutionPreviewCliArgs?.(["--bundle", "bundle.json"])).toThrow(
      "--approval is required",
    );
  });

  it("parses split and equals-form proposal execution preview flags", async () => {
    const module = await import("./preview.js") as ProposalExecutionPreviewCliModule;

    expect(module.parseProposalExecutionPreviewCliArgs?.([
      "--bundle=artifacts/bundle.json",
      "--approval",
      "artifacts/approval.json",
      "--manifest=artifacts/manifest.json",
      "--proposal",
      "artifacts/proposal.json",
      "--summary",
      " artifacts/summary.md ",
      "--output=artifacts/preview.json",
    ])).toEqual({
      bundlePath: "artifacts/bundle.json",
      approvalPath: "artifacts/approval.json",
      manifestPath: "artifacts/manifest.json",
      proposalPath: "artifacts/proposal.json",
      summaryPath: "artifacts/summary.md",
      outputPath: "artifacts/preview.json",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./preview.js") as ProposalExecutionPreviewCliModule;

    expect(() => module.parseProposalExecutionPreviewCliArgs?.(["--bundle", "a.json", "--bundle", "b.json"])).toThrow(
      "Duplicate argument: --bundle",
    );
    expect(() => module.parseProposalExecutionPreviewCliArgs?.(["--summary"])).toThrow("--summary requires a value");
    expect(() => module.parseProposalExecutionPreviewCliArgs?.(["--bundle", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runProposalExecutionPreviewCli", () => {
  it("prints injected previews when no output path is provided", async () => {
    const module = await import("./preview.js") as ProposalExecutionPreviewCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runProposalExecutionPreviewCli?.({
      argv: PREVIEW_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      createPreview: (params) => {
        calls.push(`preview:${typeof params}`);
        return { passed: true, preview: PREVIEW, failures: [] };
      },
      writeText: async () => {
        throw new Error("writeText should not be called");
      },
    });

    expect(outputs).toEqual([JSON.stringify(PREVIEW, null, 2)]);
    expect(calls).toEqual([
      "read:artifacts/bundle.json",
      "read:artifacts/approval.json",
      "read:artifacts/manifest.json",
      "read:artifacts/proposal.json",
      "read:artifacts/summary.md",
      "preview:object",
    ]);
  });

  it("writes injected previews and emits write summaries", async () => {
    const module = await import("./preview.js") as ProposalExecutionPreviewCliModule;
    const outputs: string[] = [];
    const writes: string[] = [];

    await module.runProposalExecutionPreviewCli?.({
      argv: [...PREVIEW_ARGS, "--output", "artifacts/preview.json"],
      writeOutput: (output) => outputs.push(output),
      readText: async () => "{}",
      createPreview: () => ({ passed: true, preview: PREVIEW, failures: [] }),
      writeText: async (path, contents) => {
        writes.push(`write:${path}:${contents}`);
      },
    });

    expect(outputs).toEqual([JSON.stringify({
      output: "artifacts/preview.json",
      transactions: 1,
      written: true,
    }, null, 2)]);
    expect(writes).toEqual([`write:artifacts/preview.json:${JSON.stringify(PREVIEW, null, 2)}\n`]);
  });

  it("reports failed preview creation and sets exit code after output", async () => {
    const module = await import("./preview.js") as ProposalExecutionPreviewCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];
    const result = { passed: false, preview: null, failures: ["approval verification failed"] };

    await module.runProposalExecutionPreviewCli?.({
      argv: PREVIEW_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      createPreview: () => result,
    });

    expect(outputs).toEqual([JSON.stringify(result, null, 2)]);
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed injected previews before output or writes", async () => {
    const module = await import("./preview.js") as ProposalExecutionPreviewCliModule;
    const outputs: string[] = [];
    const writes: string[] = [];

    await expect(module.runProposalExecutionPreviewCli?.({
      argv: [...PREVIEW_ARGS, "--output", "artifacts/preview.json"],
      writeOutput: (output) => outputs.push(output),
      readText: async () => "{}",
      createPreview: () => ({
        passed: true,
        preview: { transactions: "one" } as unknown as PreviewArtifact,
        failures: [],
      }),
      writeText: async (path) => {
        writes.push(path);
      },
    })).rejects.toThrow("Proposal execution preview transactions must be an array");
    expect(outputs).toEqual([]);
    expect(writes).toEqual([]);
  });

  it("rejects malformed arguments before reads or preview creation", async () => {
    const module = await import("./preview.js") as ProposalExecutionPreviewCliModule;
    const calls: string[] = [];

    await expect(module.runProposalExecutionPreviewCli?.({
      argv: ["--unknown"],
      writeOutput: () => calls.push("output"),
      readText: async () => {
        calls.push("read");
        return "";
      },
      createPreview: () => {
        calls.push("preview");
        return { passed: true, preview: PREVIEW, failures: [] };
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });
});
