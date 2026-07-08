import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { formatReleaseSummaryCliOutput } from "./summary.js";

import type { ReleaseSummaryCliReport } from "./summary.js";

type ReleaseSummaryCliModule = typeof import("./summary.js") & {
  isReleaseSummaryDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseReleaseSummaryCliArgs?: (argv: readonly string[]) => {
    statusPath: string;
    outputPath: string;
    check: boolean;
    format: "json" | "summary";
  };
  runReleaseSummaryCli?: (options?: {
    argv?: readonly string[];
    writeOutput?: (output: string) => void;
    setExitCode?: (code: number) => void;
    readText?: (path: string) => Promise<string>;
    mkdirp?: (dir: string) => Promise<void>;
    writeText?: (path: string, contents: string) => Promise<void>;
    createSummary?: (statusJson: string) => string;
    verifySummary?: (current: string, statusJson: string) => { passed: boolean; failures: string[] };
  }) => Promise<void>;
};

const WRITE_REPORT: ReleaseSummaryCliReport = {
  status: "docs/releases/latest.json",
  output: "docs/releases/CURRENT.md",
  written: true,
};

const CHECK_REPORT: ReleaseSummaryCliReport = {
  status: "docs/releases/latest.json",
  output: "docs/releases/CURRENT.md",
  passed: false,
  failures: ["release summary is stale"],
};

describe("formatReleaseSummaryCliOutput", () => {
  it("keeps JSON release summary output available for automation", () => {
    expect(formatReleaseSummaryCliOutput(WRITE_REPORT, "json")).toBe(JSON.stringify(WRITE_REPORT, null, 2));
    expect(formatReleaseSummaryCliOutput(CHECK_REPORT, "json")).toBe(JSON.stringify(CHECK_REPORT, null, 2));
  });

  it("renders readable release summary reports when requested", () => {
    expect(formatReleaseSummaryCliOutput(WRITE_REPORT, "summary")).toBe([
      "Base Sepolia release summary",
      "status: docs/releases/latest.json",
      "output: docs/releases/CURRENT.md",
      "written: true",
    ].join("\n"));

    expect(formatReleaseSummaryCliOutput(CHECK_REPORT, "summary")).toBe([
      "Base Sepolia release summary",
      "status: docs/releases/latest.json",
      "output: docs/releases/CURRENT.md",
      "passed: false",
      "failures: 1",
      "- release summary is stale",
    ].join("\n"));
  });

  it("rejects malformed release summary reports before rendering", () => {
    expect(() => formatReleaseSummaryCliOutput(null as unknown as ReleaseSummaryCliReport, "json")).toThrow(
      "Release summary report must be an object",
    );
    expect(() => formatReleaseSummaryCliOutput({
      ...WRITE_REPORT,
      status: "",
    }, "json")).toThrow("Release summary report status must not be empty");
    expect(() => formatReleaseSummaryCliOutput({
      ...WRITE_REPORT,
      output: 123 as unknown as string,
    }, "json")).toThrow("Release summary report output must be a string");
  });

  it("rejects unsupported release summary output formats before rendering", () => {
    expect(() => formatReleaseSummaryCliOutput(
      WRITE_REPORT,
      "text" as unknown as "json",
    )).toThrow("Release summary output format must be json or summary");
  });

  it("rejects malformed release summary write and check states before rendering", () => {
    expect(() => formatReleaseSummaryCliOutput({
      ...WRITE_REPORT,
      written: "true" as unknown as boolean,
    }, "json")).toThrow("Release summary report written must be a boolean");
    expect(() => formatReleaseSummaryCliOutput({
      ...CHECK_REPORT,
      passed: "false" as unknown as boolean,
    }, "json")).toThrow("Release summary verification report passed must be a boolean");
    expect(() => formatReleaseSummaryCliOutput({
      ...CHECK_REPORT,
      failures: "stale" as unknown as string[],
    }, "json")).toThrow("Release summary verification report failures must be an array");
    expect(() => formatReleaseSummaryCliOutput({
      ...CHECK_REPORT,
      failures: [""],
    }, "summary")).toThrow("Release summary verification report failure 0 must not be empty");
  });
});

describe("isReleaseSummaryDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./summary.js") as ReleaseSummaryCliModule;
    const scriptPath = resolve("runtime/cli/release/summary.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isReleaseSummaryDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isReleaseSummaryDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isReleaseSummaryDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/release/status.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./summary.js") as ReleaseSummaryCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/release/summary.ts")).href;

    expect(() => module.isReleaseSummaryDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
    expect(() => module.isReleaseSummaryDirectRun?.(
      moduleUrl,
      ["node", 123] as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseReleaseSummaryCliArgs", () => {
  it("uses release summary defaults", async () => {
    const module = await import("./summary.js") as ReleaseSummaryCliModule;

    expect(module.parseReleaseSummaryCliArgs?.([])).toEqual({
      statusPath: "docs/releases/latest.json",
      outputPath: "docs/releases/CURRENT.md",
      check: false,
      format: "json",
    });
  });

  it("parses split and equals-form release summary flags", async () => {
    const module = await import("./summary.js") as ReleaseSummaryCliModule;

    expect(module.parseReleaseSummaryCliArgs?.([
      "--status",
      "docs/releases/custom.json",
      "--output=docs/releases/CUSTOM.md",
      "--check",
      "--format= summary ",
    ])).toEqual({
      statusPath: "docs/releases/custom.json",
      outputPath: "docs/releases/CUSTOM.md",
      check: true,
      format: "summary",
    });
  });

  it("rejects duplicate, missing, unsupported, and invalid format arguments", async () => {
    const module = await import("./summary.js") as ReleaseSummaryCliModule;

    expect(() => module.parseReleaseSummaryCliArgs?.(["--output", "a.md", "--output", "b.md"])).toThrow(
      "Duplicate argument: --output",
    );
    expect(() => module.parseReleaseSummaryCliArgs?.(["--check", "--check"])).toThrow(
      "Duplicate argument: --check",
    );
    expect(() => module.parseReleaseSummaryCliArgs?.(["--status"])).toThrow("--status requires a value");
    expect(() => module.parseReleaseSummaryCliArgs?.(["--format", "text"])).toThrow(
      "--format must be json or summary",
    );
    expect(() => module.parseReleaseSummaryCliArgs?.(["--unknown"])).toThrow("Unsupported argument: --unknown");
  });
});

describe("runReleaseSummaryCli", () => {
  it("writes injected release summaries before emitting output", async () => {
    const module = await import("./summary.js") as ReleaseSummaryCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runReleaseSummaryCli?.({
      argv: [],
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      readText: async (path) => {
        calls.push(`read:${path}`);
        return "{\"releaseCount\":2}";
      },
      createSummary: (statusJson) => {
        calls.push(`create:${statusJson}`);
        return "# current\n";
      },
      mkdirp: async (dir) => {
        calls.push(`mkdir:${dir}`);
      },
      writeText: async (path, contents) => {
        calls.push(`write:${path}:${contents}`);
      },
      verifySummary: () => {
        throw new Error("verifySummary should not be called");
      },
    });

    expect(outputs).toEqual([formatReleaseSummaryCliOutput(WRITE_REPORT, "json")]);
    expect(calls).toEqual([
      "read:docs/releases/latest.json",
      "create:{\"releaseCount\":2}",
      "mkdir:docs/releases",
      "write:docs/releases/CURRENT.md:# current\n",
    ]);
  });

  it("sets exit code after failed injected check output", async () => {
    const module = await import("./summary.js") as ReleaseSummaryCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];
    const calls: string[] = [];

    await module.runReleaseSummaryCli?.({
      argv: ["--check", "--format", "summary"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path.endsWith("latest.json") ? "status" : "current";
      },
      verifySummary: (current, statusJson) => {
        calls.push(`verify:${current}:${statusJson}`);
        return { passed: false, failures: ["release summary is stale"] };
      },
      createSummary: () => {
        throw new Error("createSummary should not be called");
      },
      mkdirp: async () => {
        throw new Error("mkdirp should not be called");
      },
      writeText: async () => {
        throw new Error("writeText should not be called");
      },
    });

    expect(outputs).toEqual([formatReleaseSummaryCliOutput(CHECK_REPORT, "summary")]);
    expect(exitCodes).toEqual([1]);
    expect(calls).toEqual([
      "read:docs/releases/latest.json",
      "read:docs/releases/CURRENT.md",
      "verify:current:status",
    ]);
  });

  it("rejects malformed arguments before summary reads or writes", async () => {
    const module = await import("./summary.js") as ReleaseSummaryCliModule;
    const calls: string[] = [];

    await expect(module.runReleaseSummaryCli?.({
      argv: ["--unknown"],
      writeOutput: () => calls.push("output"),
      readText: async () => {
        calls.push("read");
        return "";
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });

  it("rejects malformed status JSON before summary creation or check target reads", async () => {
    const module = await import("./summary.js") as ReleaseSummaryCliModule;
    const calls: string[] = [];

    await expect(module.runReleaseSummaryCli?.({
      argv: ["--check"],
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path.endsWith("latest.json") ? "" : "current";
      },
      verifySummary: () => {
        calls.push("verify");
        return { passed: true, failures: [] };
      },
    })).rejects.toThrow("Release summary status JSON must not be empty");
    expect(calls).toEqual(["read:docs/releases/latest.json"]);
  });

  it("rejects malformed generated release summary markdown before writes or output", async () => {
    const module = await import("./summary.js") as ReleaseSummaryCliModule;
    const calls: string[] = [];

    await expect(module.runReleaseSummaryCli?.({
      argv: [],
      writeOutput: () => calls.push("output"),
      readText: async () => {
        calls.push("read");
        return "{}";
      },
      createSummary: () => {
        calls.push("create");
        return "";
      },
      mkdirp: async () => {
        calls.push("mkdir");
      },
      writeText: async () => {
        calls.push("write");
      },
    })).rejects.toThrow("Release summary markdown must not be empty");
    expect(calls).toEqual(["read", "create"]);
  });

  it("rejects malformed injected verifier reports before output or exit-code mutation", async () => {
    const module = await import("./summary.js") as ReleaseSummaryCliModule;
    const calls: string[] = [];

    await expect(module.runReleaseSummaryCli?.({
      argv: ["--check"],
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path.endsWith("latest.json") ? "{}" : "current";
      },
      verifySummary: () => {
        calls.push("verify");
        return { passed: "no", failures: [] } as unknown as { passed: boolean; failures: string[] };
      },
    })).rejects.toThrow("Release summary verification report passed must be a boolean");
    expect(calls).toEqual(["read:docs/releases/latest.json", "read:docs/releases/CURRENT.md", "verify"]);
  });
});
