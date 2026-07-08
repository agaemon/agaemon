import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type ProposalReviewManifestCliModule = typeof import("./manifest.js") & {
  isProposalReviewManifestDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseProposalReviewManifestCliArgs?: (argv: readonly string[]) => {
    proposalPath: string;
    summaryPath: string;
    outputPath?: string | undefined;
    generatedAt?: string | undefined;
  };
  runProposalReviewManifestCli?: (options?: {
    argv?: readonly string[];
    writeOutput?: (output: string) => void;
    setExitCode?: (code: number) => void;
    readText?: (path: string) => Promise<string>;
    createManifest?: (params: unknown) => ManifestFixture;
    mkdirp?: (dir: string) => Promise<void>;
    writeText?: (path: string, contents: string) => Promise<void>;
  }) => Promise<void>;
};

interface ManifestFixture {
  generatedAt: string;
  proposal: { path: string };
  summary: { path: string };
  preflight: { passed: boolean; failures: readonly string[] };
}

const PASSED_MANIFEST: ManifestFixture = {
  generatedAt: "2026-07-01T06:30:00.000Z",
  proposal: { path: "artifacts/proposal.json" },
  summary: { path: "artifacts/summary.md" },
  preflight: { passed: true, failures: [] },
};

describe("isProposalReviewManifestDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./manifest.js") as ProposalReviewManifestCliModule;
    const scriptPath = resolve("runtime/cli/proposalReview/manifest.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isProposalReviewManifestDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isProposalReviewManifestDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isProposalReviewManifestDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/proposalReview/package.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./manifest.js") as ProposalReviewManifestCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/proposalReview/manifest.ts")).href;

    expect(() => module.isProposalReviewManifestDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseProposalReviewManifestCliArgs", () => {
  it("requires proposal and summary paths", async () => {
    const module = await import("./manifest.js") as ProposalReviewManifestCliModule;

    expect(() => module.parseProposalReviewManifestCliArgs?.([])).toThrow("--proposal is required");
    expect(() => module.parseProposalReviewManifestCliArgs?.(["--proposal", "proposal.json"])).toThrow(
      "--summary is required",
    );
  });

  it("parses split and equals-form proposal review manifest flags", async () => {
    const module = await import("./manifest.js") as ProposalReviewManifestCliModule;

    expect(module.parseProposalReviewManifestCliArgs?.([
      "--proposal",
      "artifacts/proposal.json",
      "--summary=artifacts/summary.md",
      "--output",
      "artifacts/manifest.json",
      "--generated-at= 2026-07-01T06:30:00.000Z ",
    ])).toEqual({
      proposalPath: "artifacts/proposal.json",
      summaryPath: "artifacts/summary.md",
      outputPath: "artifacts/manifest.json",
      generatedAt: "2026-07-01T06:30:00.000Z",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./manifest.js") as ProposalReviewManifestCliModule;

    expect(() => module.parseProposalReviewManifestCliArgs?.([
      "--proposal",
      "a.json",
      "--proposal",
      "b.json",
      "--summary",
      "summary.md",
    ])).toThrow("Duplicate argument: --proposal");
    expect(() => module.parseProposalReviewManifestCliArgs?.(["--proposal"])).toThrow("--proposal requires a value");
    expect(() => module.parseProposalReviewManifestCliArgs?.([
      "--proposal",
      "a.json",
      "--summary",
      "summary.md",
      "--unknown",
    ])).toThrow("Unsupported argument: --unknown");
  });
});

describe("runProposalReviewManifestCli", () => {
  it("prints injected proposal review manifests when no output path is provided", async () => {
    const module = await import("./manifest.js") as ProposalReviewManifestCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runProposalReviewManifestCli?.({
      argv: ["--proposal", "artifacts/proposal.json", "--summary", "artifacts/summary.md"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path.endsWith(".json") ? "{\"proposal\":true}" : "# Summary";
      },
      createManifest: (params) => {
        calls.push(`manifest:${typeof params}`);
        return PASSED_MANIFEST;
      },
      mkdirp: async () => {
        throw new Error("mkdirp should not be called");
      },
      writeText: async () => {
        throw new Error("writeText should not be called");
      },
    });

    expect(outputs).toEqual([JSON.stringify(PASSED_MANIFEST, null, 2)]);
    expect(calls).toEqual([
      "read:artifacts/proposal.json",
      "read:artifacts/summary.md",
      "manifest:object",
    ]);
  });

  it("writes failed manifests and sets exit code after output", async () => {
    const module = await import("./manifest.js") as ProposalReviewManifestCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];
    const calls: string[] = [];
    const failedManifest: ManifestFixture = {
      ...PASSED_MANIFEST,
      preflight: { passed: false, failures: ["summary hash mismatch"] },
    };

    await module.runProposalReviewManifestCli?.({
      argv: [
        "--proposal",
        "artifacts/proposal.json",
        "--summary",
        "artifacts/summary.md",
        "--output",
        "artifacts/manifest.json",
      ],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      createManifest: () => failedManifest,
      mkdirp: async (dir) => {
        calls.push(`mkdir:${dir}`);
      },
      writeText: async (path, contents) => {
        calls.push(`write:${path}:${contents}`);
      },
    });

    expect(outputs).toEqual([JSON.stringify({
      output: "artifacts/manifest.json",
      proposal: "artifacts/proposal.json",
      summary: "artifacts/summary.md",
      passed: false,
      generatedAt: "2026-07-01T06:30:00.000Z",
    }, null, 2)]);
    expect(exitCodes).toEqual([1]);
    expect(calls).toEqual([
      "mkdir:artifacts",
      `write:artifacts/manifest.json:${JSON.stringify(failedManifest, null, 2)}\n`,
    ]);
  });

  it("rejects malformed arguments before reads or writes", async () => {
    const module = await import("./manifest.js") as ProposalReviewManifestCliModule;
    const calls: string[] = [];

    await expect(module.runProposalReviewManifestCli?.({
      argv: ["--unknown"],
      writeOutput: () => calls.push("output"),
      readText: async () => {
        calls.push("read");
        return "";
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected manifests before output, writes, or exit-code mutation", async () => {
    const module = await import("./manifest.js") as ProposalReviewManifestCliModule;
    const calls: string[] = [];

    await expect(module.runProposalReviewManifestCli?.({
      argv: ["--proposal", "artifacts/proposal.json", "--summary", "artifacts/summary.md", "--output", "artifacts/manifest.json"],
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      readText: async () => "{}",
      createManifest: () => ({
        ...PASSED_MANIFEST,
        preflight: { passed: "yes", failures: [] },
      } as unknown as ManifestFixture),
      mkdirp: async () => {
        calls.push("mkdir");
      },
      writeText: async () => {
        calls.push("write");
      },
    })).rejects.toThrow("Proposal review manifest preflight passed must be a boolean");
    expect(calls).toEqual([]);
  });
});
