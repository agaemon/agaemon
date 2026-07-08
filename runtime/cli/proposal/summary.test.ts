import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type ProposalSummaryCliModule = typeof import("./summary.js") & {
  isProposalSummaryDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseProposalSummaryCliArgs?: (argv: readonly string[]) => {
    proposalPath: string;
    outputPath?: string | undefined;
  };
  runProposalSummaryCli?: (options?: {
    argv?: readonly string[];
    writeOutput?: (output: string) => void;
    setExitCode?: (code: number) => void;
    readText?: (path: string) => Promise<string>;
    createSummary?: (params: unknown) => ProposalSummaryFixture;
    mkdirp?: (dir: string) => Promise<void>;
    writeText?: (path: string, contents: string) => Promise<void>;
  }) => Promise<void>;
};

interface ProposalSummaryFixture {
  passed: boolean;
  failures: readonly string[];
  markdown: string;
  source: string;
  sourcePath: string;
  executable: boolean;
  steps: number;
  transactions: number;
}

const SUMMARY: ProposalSummaryFixture = {
  passed: true,
  failures: [],
  markdown: "# Agent Proposal Review\n\n",
  source: "plan",
  sourcePath: "artifacts/plan.json",
  executable: true,
  steps: 1,
  transactions: 1,
};

describe("isProposalSummaryDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./summary.js") as ProposalSummaryCliModule;
    const scriptPath = resolve("runtime/cli/proposal/summary.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isProposalSummaryDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isProposalSummaryDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isProposalSummaryDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/proposal/verify.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./summary.js") as ProposalSummaryCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/proposal/summary.ts")).href;

    expect(() => module.isProposalSummaryDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseProposalSummaryCliArgs", () => {
  it("requires a proposal path", async () => {
    const module = await import("./summary.js") as ProposalSummaryCliModule;

    expect(() => module.parseProposalSummaryCliArgs?.([])).toThrow("--proposal is required");
  });

  it("parses split and equals-form proposal summary flags", async () => {
    const module = await import("./summary.js") as ProposalSummaryCliModule;

    expect(module.parseProposalSummaryCliArgs?.([
      "--proposal=artifacts/proposal.json",
      "--output",
      " artifacts/summary.md ",
    ])).toEqual({
      proposalPath: "artifacts/proposal.json",
      outputPath: "artifacts/summary.md",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./summary.js") as ProposalSummaryCliModule;

    expect(() => module.parseProposalSummaryCliArgs?.(["--proposal", "a.json", "--proposal", "b.json"])).toThrow(
      "Duplicate argument: --proposal",
    );
    expect(() => module.parseProposalSummaryCliArgs?.(["--output"])).toThrow("--output requires a value");
    expect(() => module.parseProposalSummaryCliArgs?.(["--proposal", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runProposalSummaryCli", () => {
  it("prints injected summary markdown when no output path is provided", async () => {
    const module = await import("./summary.js") as ProposalSummaryCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runProposalSummaryCli?.({
      argv: ["--proposal", "artifacts/proposal.json"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      readText: async (path) => {
        calls.push(`read:${path}`);
        return "{\"proposal\":true}";
      },
      createSummary: (params) => {
        calls.push(`summary:${typeof params}`);
        return SUMMARY;
      },
      mkdirp: async () => {
        throw new Error("mkdirp should not be called");
      },
      writeText: async () => {
        throw new Error("writeText should not be called");
      },
    });

    expect(outputs).toEqual(["# Agent Proposal Review"]);
    expect(calls).toEqual(["read:artifacts/proposal.json", "summary:object"]);
  });

  it("writes injected summary markdown and emits write summaries", async () => {
    const module = await import("./summary.js") as ProposalSummaryCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runProposalSummaryCli?.({
      argv: ["--proposal", "artifacts/proposal.json", "--output", "artifacts/summary.md"],
      writeOutput: (output) => outputs.push(output),
      readText: async () => "{}",
      createSummary: () => SUMMARY,
      mkdirp: async (dir) => {
        calls.push(`mkdir:${dir}`);
      },
      writeText: async (path, contents) => {
        calls.push(`write:${path}:${contents}`);
      },
    });

    expect(outputs).toEqual([JSON.stringify({
      proposal: "artifacts/proposal.json",
      output: "artifacts/summary.md",
      source: "plan",
      sourcePath: "artifacts/plan.json",
      executable: true,
      steps: 1,
      transactions: 1,
      written: true,
    }, null, 2)]);
    expect(calls).toEqual(["mkdir:artifacts", "write:artifacts/summary.md:# Agent Proposal Review\n\n"]);
  });

  it("reports failed summaries and sets exit code after output", async () => {
    const module = await import("./summary.js") as ProposalSummaryCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runProposalSummaryCli?.({
      argv: ["--proposal", "artifacts/proposal.json"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      createSummary: () => ({
        ...SUMMARY,
        passed: false,
        failures: ["non-executable proposals must not expose transaction payloads"],
        markdown: "",
      }),
    });

    expect(outputs).toEqual([JSON.stringify({
      proposal: "artifacts/proposal.json",
      passed: false,
      failures: ["non-executable proposals must not expose transaction payloads"],
    }, null, 2)]);
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed arguments before reads or writes", async () => {
    const module = await import("./summary.js") as ProposalSummaryCliModule;
    const calls: string[] = [];

    await expect(module.runProposalSummaryCli?.({
      argv: ["--unknown"],
      writeOutput: () => calls.push("output"),
      readText: async () => {
        calls.push("read");
        return "";
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected summaries before markdown output", async () => {
    const module = await import("./summary.js") as ProposalSummaryCliModule;
    const calls: string[] = [];

    await expect(module.runProposalSummaryCli?.({
      argv: ["--proposal", "artifacts/proposal.json"],
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      readText: async () => "{}",
      createSummary: () => ({
        ...SUMMARY,
        markdown: 42,
      } as unknown as ProposalSummaryFixture),
    })).rejects.toThrow("Proposal summary report markdown must be a string");
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected summary failures before output or exit-code mutation", async () => {
    const module = await import("./summary.js") as ProposalSummaryCliModule;
    const calls: string[] = [];

    await expect(module.runProposalSummaryCli?.({
      argv: ["--proposal", "artifacts/proposal.json"],
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      readText: async () => "{}",
      createSummary: () => ({
        ...SUMMARY,
        passed: false,
        failures: "none",
      } as unknown as ProposalSummaryFixture),
    })).rejects.toThrow("Proposal summary report failures must be an array");
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected write-summary evidence before artifact writes", async () => {
    const module = await import("./summary.js") as ProposalSummaryCliModule;
    const calls: string[] = [];

    await expect(module.runProposalSummaryCli?.({
      argv: ["--proposal", "artifacts/proposal.json", "--output", "artifacts/summary.md"],
      writeOutput: () => calls.push("output"),
      readText: async () => "{}",
      createSummary: () => ({
        ...SUMMARY,
        source: null,
      } as unknown as ProposalSummaryFixture),
      mkdirp: async () => {
        calls.push("mkdir");
      },
      writeText: async () => {
        calls.push("write");
      },
    })).rejects.toThrow("Proposal summary write summary source must be plan or intent");
    expect(calls).toEqual([]);
  });
});
